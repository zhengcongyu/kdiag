package collector

import (
	"encoding/json"
	"strings"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func TestToResourceRedactsSecretPayloadAndSensitiveAnnotations(t *testing.T) {
	object := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "v1",
		"kind":       "Secret",
		"metadata": map[string]any{
			"name":      "db",
			"namespace": "default",
			"annotations": map[string]any{
				"example.com/password": "do-not-return",
				"example.com/owner":    "platform",
			},
		},
		"data": map[string]any{"password": "c2VjcmV0"},
	}}
	resource := toResource("test", "Secret", object)
	combined, _ := json.Marshal(resource)
	if strings.Contains(string(combined), "do-not-return") || strings.Contains(string(combined), "c2VjcmV0") {
		t.Fatalf("secret material leaked: %s", combined)
	}
	if resource.Annotations["example.com/owner"] != "platform" {
		t.Fatalf("safe annotation should remain: %#v", resource.Annotations)
	}
}
