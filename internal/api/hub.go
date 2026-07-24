package api

import (
	"sync"

	"github.com/zhengcongyu/kdiag/internal/diagnosis"
)

type eventHub struct {
	mu          sync.RWMutex
	subscribers map[string]map[chan diagnosis.Event]struct{}
	history     map[string][]diagnosis.Event
	sequences   map[string]int64
}

func newEventHub() *eventHub {
	return &eventHub{
		subscribers: map[string]map[chan diagnosis.Event]struct{}{},
		history:     map[string][]diagnosis.Event{},
		sequences:   map[string]int64{},
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
	h.sequences[taskID]++
	event.Sequence = h.sequences[taskID]
	h.history[taskID] = append(h.history[taskID], event)
	if len(h.history[taskID]) > 256 {
		h.history[taskID] = append([]diagnosis.Event(nil), h.history[taskID][len(h.history[taskID])-256:]...)
	}
	for subscriber := range h.subscribers[taskID] {
		select {
		case subscriber <- event:
		default:
		}
	}
}

func (h *eventHub) subscribe(taskID string, after int64) (<-chan diagnosis.Event, func()) {
	h.mu.Lock()
	defer h.mu.Unlock()
	ch := make(chan diagnosis.Event, 64)
	for _, event := range h.history[taskID] {
		if event.Sequence > after {
			ch <- event
		}
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
