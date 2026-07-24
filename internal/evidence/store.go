package evidence

import (
	"sync"

	"github.com/zhengcongyu/kdiag/pkg/model"
)

// Store deduplicates evidence by its source identity. A repeated Event may
// update freshness, but cannot add confidence repeatedly to one hypothesis.
type Store struct {
	mu    sync.RWMutex
	items map[string]model.Evidence
	dedup map[string]string
}

func NewStore() *Store {
	return &Store{items: map[string]model.Evidence{}, dedup: map[string]string{}}
}

func (s *Store) Add(item model.Evidence) (model.Evidence, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if item.DedupSource != "" {
		if id, ok := s.dedup[item.DedupSource]; ok {
			existing := s.items[id]
			if item.ObservedAt.After(existing.ObservedAt) {
				existing.ObservedAt = item.ObservedAt
				existing.Freshness = item.Freshness
				s.items[id] = existing
			}
			return existing, false
		}
		s.dedup[item.DedupSource] = item.ID
	}
	s.items[item.ID] = item
	return item, true
}

func (s *Store) Get(id string) (model.Evidence, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	item, ok := s.items[id]
	return item, ok
}
