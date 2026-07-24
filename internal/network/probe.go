package network

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

type ProbeKind string

const (
	ProbeDNS  ProbeKind = "DNS"
	ProbeTCP  ProbeKind = "TCP"
	ProbeHTTP ProbeKind = "HTTP"
)

type ProbeAction struct {
	Kind    ProbeKind     `json:"kind"`
	Host    string        `json:"host"`
	Port    int32         `json:"port,omitempty"`
	Path    string        `json:"path,omitempty"`
	Timeout time.Duration `json:"timeout"`
}

type ProbeResult struct {
	Success bool          `json:"success"`
	Latency time.Duration `json:"latency"`
	Summary string        `json:"summary"`
}

type ProbeRunner interface {
	Run(context.Context, ProbeAction) (ProbeResult, error)
}

type DisabledProbeRunner struct{}

func (DisabledProbeRunner) Run(context.Context, ProbeAction) (ProbeResult, error) {
	return ProbeResult{}, errors.New("active probes are disabled")
}

type Executor interface {
	Execute(context.Context, ProbeAction) (ProbeResult, error)
}

type GuardedProbeRunner struct {
	enabled bool
	sem     chan struct{}
	exec    Executor
	mu      sync.Mutex
}

func NewGuardedProbeRunner(enabled bool, concurrency int, executor Executor) *GuardedProbeRunner {
	if concurrency < 1 {
		concurrency = 1
	}
	return &GuardedProbeRunner{enabled: enabled, sem: make(chan struct{}, concurrency), exec: executor}
}

func (r *GuardedProbeRunner) Run(ctx context.Context, action ProbeAction) (ProbeResult, error) {
	if !r.enabled {
		return ProbeResult{}, errors.New("active probes are disabled")
	}
	if action.Kind != ProbeDNS && action.Kind != ProbeTCP && action.Kind != ProbeHTTP {
		return ProbeResult{}, errors.New("probe action is not allow-listed")
	}
	if !validProbeHost(action.Host) {
		return ProbeResult{}, errors.New("probe target is not allowed")
	}
	if action.Kind != ProbeDNS && (action.Port < 1 || action.Port > 65535) {
		return ProbeResult{}, errors.New("probe port is invalid")
	}
	if action.Kind == ProbeHTTP && action.Path != "" && (action.Path[0] != '/' || len(action.Path) > 512) {
		return ProbeResult{}, errors.New("HTTP path is invalid")
	}
	if action.Timeout <= 0 || action.Timeout > 10*time.Second {
		return ProbeResult{}, errors.New("probe timeout must be between 1ns and 10s")
	}
	select {
	case r.sem <- struct{}{}:
		defer func() { <-r.sem }()
	case <-ctx.Done():
		return ProbeResult{}, ctx.Err()
	}
	if r.exec == nil {
		return ProbeResult{}, fmt.Errorf("probe executor is unavailable")
	}
	probeCtx, cancel := context.WithTimeout(ctx, action.Timeout)
	defer cancel()
	return r.exec.Execute(probeCtx, action)
}
