package incident

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/zhengcongyu/kdiag/pkg/model"
)

type Aggregator interface {
	Aggregate(signals []model.Signal, findings []model.Finding, topology model.GraphSnapshot) []model.Incident
}

type DefaultAggregator struct {
	Window time.Duration
}

func NewAggregator() *DefaultAggregator { return &DefaultAggregator{Window: 10 * time.Minute} }

func (a *DefaultAggregator) Aggregate(signals []model.Signal, findings []model.Finding, topology model.GraphSnapshot) []model.Incident {
	groups := map[string][]model.Finding{}
	for _, finding := range findings {
		key := finding.Resource.Cluster + "/" + finding.Resource.Namespace
		if strings.Contains(strings.ToLower(finding.Code+" "+finding.Summary), "notready") ||
			strings.Contains(strings.ToLower(finding.Summary), "readiness") {
			key += "/availability"
		} else {
			key += "/" + strings.ToLower(finding.Code)
		}
		groups[key] = append(groups[key], finding)
	}
	incidents := []model.Incident{}
	for key, members := range groups {
		sort.Slice(members, func(i, j int) bool { return members[i].ObservedAt.Before(members[j].ObservedAt) })
		clusters := splitByWindow(members, a.Window)
		for n, cluster := range clusters {
			resources := uniqueResources(cluster)
			incident := model.Incident{
				ID: fmt.Sprintf("%s/%d", key, n), Cluster: cluster[0].Resource.Cluster,
				Namespace: cluster[0].Resource.Namespace, Severity: highestSeverity(cluster),
				Status: "open", StartedAt: cluster[0].ObservedAt, UpdatedAt: cluster[len(cluster)-1].ObservedAt,
				ResourceUIDs: resources, Topology: topology, FindingIDs: findingIDs(cluster),
				Title:         fmt.Sprintf("%d resources show related symptoms", len(resources)),
				Summary:       "Related symptoms were grouped using time proximity, topology, symptom similarity, and resource overlap.",
				EngineVersion: "incident-aggregator/v1",
			}
			for _, signal := range signals {
				if contains(resources, signal.Resource.UID) && signal.LastSeen.Sub(incident.StartedAt) <= a.Window {
					incident.SignalIDs = append(incident.SignalIDs, signal.ID)
				}
			}
			if isServiceAvailabilityCluster(cluster, topology) {
				incident.Title = "Service currently has no healthy backend Pods"
				incident.Summary = "Repeated readiness failures made multiple backend Pods NotReady, so the Service cannot route requests to a Ready endpoint."
			}
			incidents = append(incidents, incident)
		}
	}
	return incidents
}

func isServiceAvailabilityCluster(findings []model.Finding, graph model.GraphSnapshot) bool {
	if len(findings) < 2 {
		return false
	}
	pods := map[string]bool{}
	for _, finding := range findings {
		if finding.Resource.Kind == "Pod" {
			pods[finding.Resource.UID] = true
		}
	}
	for _, edge := range graph.Edges {
		if edge.Relation == "selects" && edge.From.Kind == "Service" && pods[edge.To.UID] {
			return true
		}
	}
	return false
}

func splitByWindow(items []model.Finding, window time.Duration) [][]model.Finding {
	var result [][]model.Finding
	for _, item := range items {
		if len(result) == 0 || item.ObservedAt.Sub(result[len(result)-1][len(result[len(result)-1])-1].ObservedAt) > window {
			result = append(result, []model.Finding{item})
		} else {
			result[len(result)-1] = append(result[len(result)-1], item)
		}
	}
	return result
}

func uniqueResources(items []model.Finding) []string {
	set := map[string]bool{}
	for _, item := range items {
		set[item.Resource.UID] = true
	}
	result := make([]string, 0, len(set))
	for uid := range set {
		result = append(result, uid)
	}
	sort.Strings(result)
	return result
}

func findingIDs(items []model.Finding) []string {
	result := make([]string, len(items))
	for i := range items {
		result[i] = items[i].ID
	}
	return result
}

func highestSeverity(items []model.Finding) string {
	rank := map[string]int{"P0": 4, "P1": 3, "P2": 2, "P3": 1}
	best := "P3"
	for _, item := range items {
		if rank[item.Severity] > rank[best] {
			best = item.Severity
		}
	}
	return best
}

func contains(items []string, needle string) bool {
	for _, item := range items {
		if item == needle {
			return true
		}
	}
	return false
}
