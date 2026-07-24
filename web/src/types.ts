export type EvidenceRole = "supporting" | "contradicting" | "missing" | "neutral";

export interface ResourceRef {
  cluster: string;
  uid: string;
  kind: string;
  namespace?: string;
  name: string;
}

export interface Evidence {
  id: string;
  role: EvidenceRole;
  source: string;
  observedAt: string;
  resource?: ResourceRef;
  summary: string;
  confidence: number;
  freshness: number;
  directness: number;
  rawRef?: string;
}

export interface Hypothesis {
  id: string;
  ruleId: string;
  ruleVersion: string;
  title: string;
  explanation: string;
  confidence: number;
  status: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  missingEvidence: string[];
  remediation: string[];
  verification: string[];
}

export interface GraphSnapshot {
  nodes: ResourceRef[];
  edges: {from: ResourceRef; to: ResourceRef; relation: string}[];
}

export interface Incident {
  id: string;
  cluster: string;
  title: string;
  summary: string;
  severity: "P0" | "P1" | "P2" | "P3";
  status: string;
  namespace?: string;
  startedAt: string;
  updatedAt: string;
  evidence: Evidence[];
  hypotheses: Hypothesis[];
  topology: GraphSnapshot;
  timeline: {id: string; at: string; type: string; summary: string}[];
  diagnosisSteps: {id: string; name: string; status: string; summary?: string}[];
  resourceState: unknown[];
}

export interface DiagnosisTask {
  id: string;
  kind: string;
  target: ResourceRef;
  status: string;
  steps: {id: string; name: string; status: string; summary?: string}[];
  evidence: Evidence[];
  hypotheses: Hypothesis[];
}

