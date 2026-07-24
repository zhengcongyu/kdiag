package collector

import (
	"context"
	"errors"
	"sync"

	"github.com/zhengcongyu/kdiag/pkg/model"
)

type ChangeType string

const (
	Added   ChangeType = "added"
	Updated ChangeType = "updated"
	Deleted ChangeType = "deleted"
)

type Change struct {
	Type     ChangeType
	Resource model.Resource
}

type Collector interface {
	Start(context.Context) error
	WaitForSync(context.Context) error
	Changes() <-chan Change
}

type Fake struct {
	mu      sync.Mutex
	started bool
	synced  chan struct{}
	changes chan Change
}

func NewFake(buffer int) *Fake {
	return &Fake{synced: make(chan struct{}), changes: make(chan Change, buffer)}
}

func (f *Fake) Start(ctx context.Context) error {
	f.mu.Lock()
	f.started = true
	f.mu.Unlock()
	select {
	case <-f.synced:
	default:
		close(f.synced)
	}
	return nil
}

func (f *Fake) WaitForSync(ctx context.Context) error {
	f.mu.Lock()
	started := f.started
	f.mu.Unlock()
	if !started {
		return errors.New("collector not started")
	}
	select {
	case <-f.synced:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (f *Fake) Changes() <-chan Change { return f.changes }
func (f *Fake) Emit(change Change)     { f.changes <- change }
