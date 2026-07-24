package collector

import (
	"context"
	"testing"

	"github.com/zhengcongyu/kdiag/pkg/model"
)

func TestFakeCollector(t *testing.T) {
	fake := NewFake(1)
	if err := fake.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := fake.WaitForSync(context.Background()); err != nil {
		t.Fatal(err)
	}
	expected := Change{Type: Added, Resource: model.Resource{Ref: model.ResourceRef{UID: "p1"}}}
	fake.Emit(expected)
	if got := <-fake.Changes(); got.Resource.Ref.UID != "p1" {
		t.Fatalf("got %#v", got)
	}
}
