package api

import (
	"sync"

	"github.com/zhengcongyu/kdiag/internal/diagnosis"
)

type eventHub struct {
	mu          sync.RWMutex
	subscribers map[string]map[chan diagnosis.Event]struct{}
	history     map[string][]diagnosis.Event
}

func newEventHub() *eventHub {
	return &eventHub{
		subscribers: map[string]map[chan diagnosis.Event]struct{}{},
		history:     map[string][]diagnosis.Event{},
	}
}

type taskSink struct {
	hub    *eventHub
	taskID string
}

func (s taskSink) Publish(event diagnosis.Event) { s.hub.publish(s.taskID, event) }

func (h *eventHub) publish(taskID string, event diagnosis.Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.history[taskID] = append(h.history[taskID], event)
	for subscriber := range h.subscribers[taskID] {
		select {
		case subscriber <- event:
		default:
		}
	}
}

func (h *eventHub) subscribe(taskID string) (<-chan diagnosis.Event, func()) {
	h.mu.Lock()
	defer h.mu.Unlock()
	ch := make(chan diagnosis.Event, 64)
	for _, event := range h.history[taskID] {
		ch <- event
	}
	if h.subscribers[taskID] == nil {
		h.subscribers[taskID] = map[chan diagnosis.Event]struct{}{}
	}
	h.subscribers[taskID][ch] = struct{}{}
	return ch, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		delete(h.subscribers[taskID], ch)
		close(ch)
	}
}
