package network

import (
	"context"
	"testing"
	"time"
)

type fakeExecutor struct{}

func (fakeExecutor) Execute(context.Context, ProbeAction) (ProbeResult, error) {
	return ProbeResult{Success: true, Summary: "probe succeeded"}, nil
}

func TestProbeGuardRejectsUnsafeActions(t *testing.T) {
	runner := NewGuardedProbeRunner(true, 1, fakeExecutor{}, "service.default")
	tests := []ProbeAction{
		{Kind: "SHELL", Host: "service.default", Timeout: time.Second},
		{Kind: ProbeHTTP, Host: "127.0.0.1", Port: 80, Timeout: time.Second},
		{Kind: ProbeHTTP, Host: "169.254.169.254", Port: 80, Path: "http://evil", Timeout: time.Second},
		{Kind: ProbeTCP, Host: "service.default", Port: 70000, Timeout: time.Second},
		{Kind: ProbeTCP, Host: "service.default", Port: 80, Timeout: time.Minute},
	}
	for _, action := range tests {
		if _, err := runner.Run(context.Background(), action); err == nil {
			t.Fatalf("unsafe probe was accepted: %#v", action)
		}
	}
}

func TestProbeTargetMustBeTaskAllowlisted(t *testing.T) {
	runner := NewGuardedProbeRunner(true, 1, fakeExecutor{}, "payment.default.svc")
	action := ProbeAction{Kind: ProbeTCP, Host: "other.default.svc", Port: 80, Timeout: time.Second}
	if _, err := runner.Run(context.Background(), action); err == nil {
		t.Fatal("non-allowlisted cluster target was accepted")
	}
	action.Host = "payment.default.svc"
	if _, err := runner.Run(context.Background(), action); err != nil {
		t.Fatalf("allowlisted target was rejected: %v", err)
	}
}

func TestProbesDefaultDisabled(t *testing.T) {
	if _, err := NewGuardedProbeRunner(false, 1, fakeExecutor{}).Run(context.Background(), ProbeAction{}); err == nil {
		t.Fatal("disabled runner executed a probe")
	}
}
