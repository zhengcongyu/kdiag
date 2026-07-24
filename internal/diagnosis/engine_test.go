package diagnosis

import (
	"context"
	"testing"
	"time"

	"github.com/zhengcongyu/kdiag/internal/rules"
	"github.com/zhengcongyu/kdiag/pkg/model"
)

type recordingSink struct{ events []Event }

func (s *recordingSink) Publish(event Event) { s.events = append(s.events, event) }

func TestEngineEmitsExplainableLifecycle(t *testing.T) {
	sink := &recordingSink{}
	task := &model.DiagnosisTask{ID: "t1", CreatedAt: time.Now().UTC()}
	reason := "CrashLoopBackOff"
	observation := rules.Observation{
		Resource:               model.ResourceRef{Cluster: "c1", UID: "p1", Kind: "Pod", Name: "payment"},
		ContainerWaitingReason: &reason,
	}
	if err := New(rules.Catalog()).Run(context.Background(), task, observation, sink); err != nil {
		t.Fatal(err)
	}
	if task.Status != model.StatusCompleted || len(task.Steps) == 0 || len(task.Evidence) == 0 {
		t.Fatalf("unexpected task: %#v", task)
	}
	if sink.events[0].Type != "task_started" || sink.events[len(sink.events)-1].Type != "diagnosis_completed" {
		t.Fatalf("unexpected event lifecycle: %#v", sink.events)
	}
}
