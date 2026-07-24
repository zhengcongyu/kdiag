package topology

import (
	"errors"
	"sort"
	"sync"

	"github.com/zhengcongyu/kdiag/pkg/model"
)

const (
	Owns          = "owns"
	ScheduledOn   = "scheduled_on"
	Selects       = "selects"
	RepresentedBy = "represented_by"
	Mounts        = "mounts"
)

type Graph struct {
	mu       sync.RWMutex
	nodes    map[string]model.ResourceRef
	outgoing map[string]map[string]string
	incoming map[string]map[string]string
}

func New() *Graph {
	return &Graph{
		nodes:    map[string]model.ResourceRef{},
		outgoing: map[string]map[string]string{},
		incoming: map[string]map[string]string{},
	}
}

func (g *Graph) UpsertNode(ref model.ResourceRef) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.nodes[ref.Key()] = ref
}

func (g *Graph) RemoveNode(ref model.ResourceRef) {
	g.mu.Lock()
	defer g.mu.Unlock()
	key := ref.Key()
	for to := range g.outgoing[key] {
		delete(g.incoming[to], key)
	}
	for from := range g.incoming[key] {
		delete(g.outgoing[from], key)
	}
	delete(g.outgoing, key)
	delete(g.incoming, key)
	delete(g.nodes, key)
}

func (g *Graph) ReplaceEdges(from model.ResourceRef, edges []model.GraphEdge) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	fromKey := from.Key()
	if _, ok := g.nodes[fromKey]; !ok {
		return errors.New("source node not found")
	}
	for to := range g.outgoing[fromKey] {
		delete(g.incoming[to], fromKey)
	}
	g.outgoing[fromKey] = map[string]string{}
	for _, edge := range edges {
		toKey := edge.To.Key()
		g.nodes[toKey] = edge.To
		g.outgoing[fromKey][toKey] = edge.Relation
		if g.incoming[toKey] == nil {
			g.incoming[toKey] = map[string]string{}
		}
		g.incoming[toKey][fromKey] = edge.Relation
	}
	return nil
}

func (g *Graph) Direct(ref model.ResourceRef) (upstream, downstream []model.GraphEdge) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	key := ref.Key()
	for to, relation := range g.outgoing[key] {
		downstream = append(downstream, model.GraphEdge{From: ref, To: g.nodes[to], Relation: relation})
	}
	for from, relation := range g.incoming[key] {
		upstream = append(upstream, model.GraphEdge{From: g.nodes[from], To: ref, Relation: relation})
	}
	sortEdges(upstream)
	sortEdges(downstream)
	return
}

func (g *Graph) Neighborhood(refs []model.ResourceRef, depth int) model.GraphSnapshot {
	g.mu.RLock()
	defer g.mu.RUnlock()
	visited := map[string]bool{}
	frontier := make([]string, 0, len(refs))
	for _, ref := range refs {
		frontier = append(frontier, ref.Key())
	}
	for level := 0; level <= depth && len(frontier) > 0; level++ {
		next := []string{}
		for _, key := range frontier {
			if visited[key] {
				continue
			}
			visited[key] = true
			for neighbor := range g.outgoing[key] {
				next = append(next, neighbor)
			}
			for neighbor := range g.incoming[key] {
				next = append(next, neighbor)
			}
		}
		frontier = next
	}
	snapshot := model.GraphSnapshot{}
	for key := range visited {
		if node, ok := g.nodes[key]; ok {
			snapshot.Nodes = append(snapshot.Nodes, node)
		}
		for to, relation := range g.outgoing[key] {
			if visited[to] {
				snapshot.Edges = append(snapshot.Edges, model.GraphEdge{From: g.nodes[key], To: g.nodes[to], Relation: relation})
			}
		}
	}
	sort.Slice(snapshot.Nodes, func(i, j int) bool { return snapshot.Nodes[i].Key() < snapshot.Nodes[j].Key() })
	sortEdges(snapshot.Edges)
	return snapshot
}

func (g *Graph) ServiceBackendChain(service model.ResourceRef) model.GraphSnapshot {
	return g.Neighborhood([]model.ResourceRef{service}, 3)
}

func sortEdges(edges []model.GraphEdge) {
	sort.Slice(edges, func(i, j int) bool {
		return edges[i].From.Key()+edges[i].To.Key()+edges[i].Relation <
			edges[j].From.Key()+edges[j].To.Key()+edges[j].Relation
	})
}
