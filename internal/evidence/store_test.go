package evidence

import (
	"testing"
	"time"

	"github.com/zhengcongyu/kdiag/pkg/model"
)

func TestStoreDoesNotDoubleCountSameSource(t *testing.T) {
	store := NewStore()
	first := model.Evidence{ID: "e1", DedupSource: "event/fp1", ObservedAt: time.Now()}
	if _, added := store.Add(first); !added {
		t.Fatal("first evidence should be added")
	}
	repeated := first
	repeated.ID = "e2"
	repeated.ObservedAt = first.ObservedAt.Add(time.Second)
	got, added := store.Add(repeated)
	if added || got.ID != "e1" {
		t.Fatalf("duplicate changed identity: %#v, added=%v", got, added)
	}
}
