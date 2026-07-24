package repository

import (
	"context"
	"errors"
	"sort"
	"sync"

	"github.com/zhengcongyu/kdiag/pkg/model"
)

var ErrNotFound = errors.New("not found")

type Repository interface {
	ListClusters(context.Context) ([]string, error)
	ListIncidents(context.Context) ([]model.Incident, error)
	GetIncident(context.Context, string) (model.Incident, error)
	SaveIncident(context.Context, model.Incident) error
	SaveTask(context.Context, model.DiagnosisTask) error
	GetTask(context.Context, string) (model.DiagnosisTask, error)
	SearchResources(context.Context, string) ([]model.Resource, error)
	GetResource(context.Context, string, string, string) (model.Resource, error)
}

type Memory struct {
	mu        sync.RWMutex
	clusters  []string
	incidents map[string]model.Incident
	tasks     map[string]model.DiagnosisTask
	resources map[string]model.Resource
}

func NewMemory() *Memory {
	return &Memory{
		clusters: []string{"demo"}, incidents: map[string]model.Incident{},
		tasks: map[string]model.DiagnosisTask{}, resources: map[string]model.Resource{},
	}
}

func (m *Memory) ListClusters(context.Context) ([]string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return append([]string(nil), m.clusters...), nil
}

func (m *Memory) ListIncidents(context.Context) ([]model.Incident, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	items := make([]model.Incident, 0, len(m.incidents))
	for _, item := range m.incidents {
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].UpdatedAt.After(items[j].UpdatedAt) })
	return items, nil
}

func (m *Memory) GetIncident(_ context.Context, id string) (model.Incident, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	item, ok := m.incidents[id]
	if !ok {
		return model.Incident{}, ErrNotFound
	}
	return item, nil
}

func (m *Memory) SaveIncident(_ context.Context, item model.Incident) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.incidents[item.ID] = item
	return nil
}

func (m *Memory) SaveTask(_ context.Context, item model.DiagnosisTask) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.tasks[item.ID] = item
	return nil
}

func (m *Memory) GetTask(_ context.Context, id string) (model.DiagnosisTask, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	item, ok := m.tasks[id]
	if !ok {
		return model.DiagnosisTask{}, ErrNotFound
	}
	return item, nil
}

func (m *Memory) PutResource(item model.Resource) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.resources[resourceLookupKey(item.Ref.Kind, item.Ref.Namespace, item.Ref.Name)] = item
}

func (m *Memory) SearchResources(_ context.Context, query string) ([]model.Resource, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	items := []model.Resource{}
	for _, item := range m.resources {
		if query == "" || containsFold(item.Ref.Kind+"/"+item.Ref.Namespace+"/"+item.Ref.Name, query) {
			items = append(items, item)
		}
	}
	return items, nil
}

func (m *Memory) GetResource(_ context.Context, kind, namespace, name string) (model.Resource, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	item, ok := m.resources[resourceLookupKey(kind, namespace, name)]
	if !ok {
		return model.Resource{}, ErrNotFound
	}
	return item, nil
}

func resourceLookupKey(kind, namespace, name string) string {
	return kind + "/" + namespace + "/" + name
}

func containsFold(value, query string) bool {
	if len(query) > len(value) {
		return false
	}
	for i := 0; i+len(query) <= len(value); i++ {
		match := true
		for j := range query {
			a, b := value[i+j], query[j]
			if a >= 'A' && a <= 'Z' {
				a += 'a' - 'A'
			}
			if b >= 'A' && b <= 'Z' {
				b += 'a' - 'A'
			}
			if a != b {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return true
}
