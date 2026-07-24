package topology

import (
	"testing"

	"github.com/zhengcongyu/kdiag/pkg/model"
)

func ref(kind, uid string) model.ResourceRef {
	return model.ResourceRef{Cluster: "test", Kind: kind, UID: uid, Name: uid}
}

func TestGraphLifecycleAndNeighborhood(t *testing.T) {
	g := New()
	deploy, rs, pod, node := ref("Deployment", "d1"), ref("ReplicaSet", "r1"), ref("Pod", "p1"), ref("Node", "n1")
	for _, item := range []model.ResourceRef{deploy, rs, pod, node} {
		g.UpsertNode(item)
	}
	if err := g.ReplaceEdges(deploy, []model.GraphEdge{{From: deploy, To: rs, Relation: Owns}}); err != nil {
		t.Fatal(err)
	}
	_ = g.ReplaceEdges(rs, []model.GraphEdge{{From: rs, To: pod, Relation: Owns}})
	_ = g.ReplaceEdges(pod, []model.GraphEdge{{From: pod, To: node, Relation: ScheduledOn}})
	snapshot := g.Neighborhood([]model.ResourceRef{pod}, 2)
	if len(snapshot.Nodes) != 4 || len(snapshot.Edges) != 3 {
		t.Fatalf("unexpected snapshot: %#v", snapshot)
	}
	g.RemoveNode(pod)
	_, down := g.Direct(rs)
	if len(down) != 0 {
		t.Fatalf("deleted pod edge remained: %#v", down)
	}
}
