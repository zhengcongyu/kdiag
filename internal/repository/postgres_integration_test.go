//go:build integration

package repository

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/zhengcongyu/kdiag/pkg/model"
)

func TestPostgresTaskRoundTrip(t *testing.T) {
	databaseURL := os.Getenv("KDIAG_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("KDIAG_TEST_DATABASE_URL is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	store, err := OpenPostgres(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	task := model.DiagnosisTask{
		ID: "integration-task", Kind: "resource", Status: model.StatusPending,
		Target:    model.ResourceRef{UID: "pod-1", Kind: "Pod", Name: "payment"},
		CreatedAt: time.Now().UTC(),
	}
	if err := store.SaveTask(ctx, task); err != nil {
		t.Fatal(err)
	}
	got, err := store.GetTask(ctx, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != task.ID || got.Target.UID != "pod-1" {
		t.Fatalf("unexpected task: %#v", got)
	}
}
