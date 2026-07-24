package collector

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/zhengcongyu/kdiag/pkg/model"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/tools/cache"
)

var watchedResources = map[string]schema.GroupVersionResource{
	"Namespace":             {Version: "v1", Resource: "namespaces"},
	"Deployment":            {Group: "apps", Version: "v1", Resource: "deployments"},
	"ReplicaSet":            {Group: "apps", Version: "v1", Resource: "replicasets"},
	"StatefulSet":           {Group: "apps", Version: "v1", Resource: "statefulsets"},
	"DaemonSet":             {Group: "apps", Version: "v1", Resource: "daemonsets"},
	"Pod":                   {Version: "v1", Resource: "pods"},
	"Node":                  {Version: "v1", Resource: "nodes"},
	"Service":               {Version: "v1", Resource: "services"},
	"EndpointSlice":         {Group: "discovery.k8s.io", Version: "v1", Resource: "endpointslices"},
	"Event":                 {Version: "v1", Resource: "events"},
	"ConfigMap":             {Version: "v1", Resource: "configmaps"},
	"PersistentVolumeClaim": {Version: "v1", Resource: "persistentvolumeclaims"},
	"PersistentVolume":      {Version: "v1", Resource: "persistentvolumes"},
	"Job":                   {Group: "batch", Version: "v1", Resource: "jobs"},
	"CronJob":               {Group: "batch", Version: "v1", Resource: "cronjobs"},
	"Ingress":               {Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"},
	"NetworkPolicy":         {Group: "networking.k8s.io", Version: "v1", Resource: "networkpolicies"},
	"StorageClass":          {Group: "storage.k8s.io", Version: "v1", Resource: "storageclasses"},
	"HorizontalPodAutoscaler": {
		Group: "autoscaling", Version: "v2", Resource: "horizontalpodautoscalers",
	},
	"PodDisruptionBudget": {
		Group: "policy", Version: "v1", Resource: "poddisruptionbudgets",
	},
}

// KubernetesCollector uses client-go shared informers. List-Watch restart,
// resourceVersion tracking, and reconnect backoff are provided by client-go.
type KubernetesCollector struct {
	cluster   string
	factory   dynamicinformer.DynamicSharedInformerFactory
	informers []cache.SharedIndexInformer
	changes   chan Change
}

func NewKubernetes(cluster string, client dynamic.Interface, resync time.Duration) *KubernetesCollector {
	factory := dynamicinformer.NewDynamicSharedInformerFactory(client, resync)
	collector := &KubernetesCollector{
		cluster: cluster,
		factory: factory,
		changes: make(chan Change, 4096),
	}
	for kind, gvr := range watchedResources {
		informer := factory.ForResource(gvr).Informer()
		kindCopy := kind
		_, _ = informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
			AddFunc:    func(obj any) { collector.emit(kindCopy, Added, obj) },
			UpdateFunc: func(_, current any) { collector.emit(kindCopy, Updated, current) },
			DeleteFunc: func(obj any) { collector.emit(kindCopy, Deleted, obj) },
		})
		collector.informers = append(collector.informers, informer)
	}
	return collector
}

func (c *KubernetesCollector) Start(ctx context.Context) error {
	c.factory.Start(ctx.Done())
	return nil
}

func (c *KubernetesCollector) WaitForSync(ctx context.Context) error {
	for _, informer := range c.informers {
		if !cache.WaitForCacheSync(ctx.Done(), informer.HasSynced) {
			return fmt.Errorf("informer cache sync failed")
		}
	}
	return nil
}

func (c *KubernetesCollector) Changes() <-chan Change { return c.changes }

func (c *KubernetesCollector) emit(kind string, changeType ChangeType, object any) {
	if tombstone, ok := object.(cache.DeletedFinalStateUnknown); ok {
		object = tombstone.Obj
	}
	item, ok := object.(*unstructured.Unstructured)
	if !ok {
		return
	}
	resource := toResource(c.cluster, kind, item)
	if changeType == Deleted {
		now := time.Now().UTC()
		resource.DeletedAt = &now
	}
	c.changes <- Change{Type: changeType, Resource: resource}
}

func toResource(cluster, kind string, item *unstructured.Unstructured) model.Resource {
	owners := make([]model.OwnerReference, 0, len(item.GetOwnerReferences()))
	for _, owner := range item.GetOwnerReferences() {
		controller := owner.Controller != nil && *owner.Controller
		owners = append(owners, model.OwnerReference{
			UID: string(owner.UID), Kind: owner.Kind, Name: owner.Name, Controller: controller,
		})
	}
	spec, hasSpec, _ := unstructured.NestedFieldNoCopy(item.Object, "spec")
	if !hasSpec {
		// A few Kubernetes resources (notably EndpointSlice and Event) expose
		// their typed fields at the top level instead of below spec.
		topLevel := item.DeepCopy().Object
		for _, key := range []string{"apiVersion", "kind", "metadata", "status"} {
			delete(topLevel, key)
		}
		spec = topLevel
	}
	status, _, _ := unstructured.NestedFieldNoCopy(item.Object, "status")
	specJSON, _ := json.Marshal(spec)
	statusJSON, _ := json.Marshal(status)
	if strings.EqualFold(kind, "Secret") {
		specJSON = json.RawMessage(`{}`)
	}
	safeObject := item.DeepCopy().Object
	sanitizeObject(kind, safeObject)
	rawJSON, _ := json.Marshal(safeObject)
	return model.Resource{
		Ref: model.ResourceRef{
			Cluster: cluster, UID: stableUID(item.GetUID(), item), Kind: kind,
			Namespace: item.GetNamespace(), Name: item.GetName(),
		},
		APIVersion: item.GetAPIVersion(), ResourceVersion: item.GetResourceVersion(),
		Generation: item.GetGeneration(), CreatedAt: item.GetCreationTimestamp().UTC(),
		Owners: owners, Labels: item.GetLabels(), Annotations: safeAnnotations(item.GetAnnotations()),
		Finalizers: item.GetFinalizers(), Spec: specJSON, Status: statusJSON, Raw: rawJSON,
		Observed: time.Now().UTC(),
	}
}

func sanitizeObject(kind string, object map[string]any) {
	metadata, _, _ := unstructured.NestedMap(object, "metadata")
	delete(metadata, "managedFields")
	if annotations, ok := metadata["annotations"].(map[string]any); ok {
		for key := range annotations {
			if unsafeMetadataKey(key) {
				delete(annotations, key)
			}
		}
	}
	object["metadata"] = metadata
	// Secrets are intentionally never watched. Keep this guard so a future
	// resource-list change cannot accidentally expose their payload.
	if strings.EqualFold(kind, "Secret") {
		delete(object, "data")
		delete(object, "stringData")
	}
}

func safeAnnotations(input map[string]string) map[string]string {
	output := make(map[string]string, len(input))
	for key, value := range input {
		if !unsafeMetadataKey(key) {
			output[key] = value
		}
	}
	return output
}

func unsafeMetadataKey(key string) bool {
	lower := strings.ToLower(key)
	if lower == "kubectl.kubernetes.io/last-applied-configuration" {
		return true
	}
	for _, fragment := range []string{"token", "password", "secret", "credential", "certificate", "private-key", "authorization"} {
		if strings.Contains(lower, fragment) {
			return true
		}
	}
	return false
}

func stableUID(uid types.UID, item *unstructured.Unstructured) string {
	if uid != "" {
		return string(uid)
	}
	// Fake/dynamic clients may omit UID. Production objects always have one.
	return item.GetAPIVersion() + ":" + item.GetKind() + ":" + item.GetNamespace() + ":" + item.GetName()
}
