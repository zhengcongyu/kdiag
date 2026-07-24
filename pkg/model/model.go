package model

import (
	"encoding/json"
	"time"
)

type ResourceRef struct {
	Cluster   string `json:"cluster"`
	UID       string `json:"uid"`
	Kind      string `json:"kind"`
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
}

func (r ResourceRef) Key() string { return r.Cluster + "/" + r.UID }

type OwnerReference struct {
	UID        string `json:"uid"`
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	Controller bool   `json:"controller"`
}

type Resource struct {
	Ref       ResourceRef       `json:"ref"`
	Owners    []OwnerReference  `json:"owners,omitempty"`
	Labels    map[string]string `json:"labels,omitempty"`
	Spec      json.RawMessage   `json:"spec,omitempty"`
	Status    json.RawMessage   `json:"status,omitempty"`
	Observed  time.Time         `json:"observed"`
	DeletedAt *time.Time        `json:"deletedAt,omitempty"`
}

type EvidenceRole string

const (
	EvidenceSupporting    EvidenceRole = "supporting"
	EvidenceContradicting EvidenceRole = "contradicting"
	EvidenceMissing       EvidenceRole = "missing"
	EvidenceNeutral       EvidenceRole = "neutral"
)

type Evidence struct {
	ID          string          `json:"id"`
	Role        EvidenceRole    `json:"role"`
	Source      string          `json:"source"`
	ObservedAt  time.Time       `json:"observedAt"`
	Resource    *ResourceRef    `json:"resource,omitempty"`
	Summary     string          `json:"summary"`
	Confidence  float64         `json:"confidence"`
	Freshness   float64         `json:"freshness"`
	Directness  float64         `json:"directness"`
	RawRef      string          `json:"rawRef,omitempty"`
	Details     json.RawMessage `json:"details,omitempty"`
	DedupSource string          `json:"dedupSource,omitempty"`
}

type Signal struct {
	ID                string      `json:"id"`
	Cluster           string      `json:"cluster"`
	Resource          ResourceRef `json:"resource"`
	Reason            string      `json:"reason"`
	Message           string      `json:"message"`
	NormalizedMessage string      `json:"normalizedMessage"`
	Fingerprint       string      `json:"fingerprint"`
	FirstSeen         time.Time   `json:"firstSeen"`
	LastSeen          time.Time   `json:"lastSeen"`
	Count             int64       `json:"count"`
}

type Finding struct {
	ID         string      `json:"id"`
	Resource   ResourceRef `json:"resource"`
	Code       string      `json:"code"`
	Summary    string      `json:"summary"`
	Severity   string      `json:"severity"`
	EvidenceID []string    `json:"evidenceIds"`
	ObservedAt time.Time   `json:"observedAt"`
}

type DiagnosisStatus string

const (
	StatusPending           DiagnosisStatus = "PENDING"
	StatusRunning           DiagnosisStatus = "RUNNING"
	StatusCompleted         DiagnosisStatus = "COMPLETED"
	StatusFailed            DiagnosisStatus = "FAILED"
	StatusCancelled         DiagnosisStatus = "CANCELLED"
	StatusNeedsMoreEvidence DiagnosisStatus = "NEEDS_MORE_EVIDENCE"
)

type Hypothesis struct {
	ID                    string          `json:"id"`
	RuleID                string          `json:"ruleId"`
	RuleVersion           string          `json:"ruleVersion"`
	Title                 string          `json:"title"`
	Explanation           string          `json:"explanation"`
	Confidence            float64         `json:"confidence"`
	Status                DiagnosisStatus `json:"status"`
	SupportingEvidence    []string        `json:"supportingEvidence"`
	ContradictingEvidence []string        `json:"contradictingEvidence"`
	MissingEvidence       []string        `json:"missingEvidence"`
	Remediation           []string        `json:"remediation"`
	Verification          []string        `json:"verification"`
}

type Incident struct {
	ID             string          `json:"id"`
	Cluster        string          `json:"cluster"`
	Title          string          `json:"title"`
	Summary        string          `json:"summary"`
	Severity       string          `json:"severity"`
	Status         string          `json:"status"`
	Namespace      string          `json:"namespace,omitempty"`
	StartedAt      time.Time       `json:"startedAt"`
	UpdatedAt      time.Time       `json:"updatedAt"`
	ResourceUIDs   []string        `json:"resourceUids"`
	SignalIDs      []string        `json:"signalIds"`
	FindingIDs     []string        `json:"findingIds"`
	Evidence       []Evidence      `json:"evidence"`
	Hypotheses     []Hypothesis    `json:"hypotheses"`
	EngineVersion  string          `json:"engineVersion"`
	RuleVersions   []string        `json:"ruleVersions"`
	Topology       GraphSnapshot   `json:"topology"`
	ResourceState  []Resource      `json:"resourceState"`
	EventSummary   []Signal        `json:"eventSummary"`
	DiagnosisSteps []DiagnosisStep `json:"diagnosisSteps"`
	Timeline       []TimelineEvent `json:"timeline"`
}

type DiagnosisTask struct {
	ID         string          `json:"id"`
	Kind       string          `json:"kind"`
	Target     ResourceRef     `json:"target"`
	Status     DiagnosisStatus `json:"status"`
	CreatedAt  time.Time       `json:"createdAt"`
	StartedAt  *time.Time      `json:"startedAt,omitempty"`
	FinishedAt *time.Time      `json:"finishedAt,omitempty"`
	Steps      []DiagnosisStep `json:"steps"`
	Evidence   []Evidence      `json:"evidence"`
	Hypotheses []Hypothesis    `json:"hypotheses"`
	Error      string          `json:"error,omitempty"`
}

type DiagnosisStep struct {
	ID          string          `json:"id"`
	RuleID      string          `json:"ruleId"`
	Name        string          `json:"name"`
	Status      DiagnosisStatus `json:"status"`
	StartedAt   *time.Time      `json:"startedAt,omitempty"`
	CompletedAt *time.Time      `json:"completedAt,omitempty"`
	Summary     string          `json:"summary,omitempty"`
}

type TimelineEvent struct {
	ID         string       `json:"id"`
	IncidentID string       `json:"incidentId"`
	At         time.Time    `json:"at"`
	Type       string       `json:"type"`
	Summary    string       `json:"summary"`
	Resource   *ResourceRef `json:"resource,omitempty"`
}

type GraphEdge struct {
	From     ResourceRef `json:"from"`
	To       ResourceRef `json:"to"`
	Relation string      `json:"relation"`
}

type GraphSnapshot struct {
	Nodes []ResourceRef `json:"nodes"`
	Edges []GraphEdge   `json:"edges"`
}
