import type {
  AccessReport, ClusterOverview, DiagnosisTask, Incident, InventoryResource, InventoryResult, RBACManifest, ResourceRef
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public requestId?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {"Content-Type": "application/json", ...init?.headers}
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({error: {message: response.statusText}}));
    throw new ApiError(
      response.status,
      body.error?.message ?? "请求失败",
      body.error?.code,
      body.error?.requestId
    );
  }
  return response.json() as Promise<T>;
}

export const api = {
  clusterOverview: () => request<ClusterOverview>("/api/v1/cluster/overview"),
  access: () => request<AccessReport>("/api/v1/access"),
  accessRBAC: () => request<RBACManifest>("/api/v1/access/rbac"),
  inventory: (filters: Record<string, string | number | undefined>) => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") query.set(key, String(value));
    });
    return request<InventoryResult>(`/api/v1/inventory?${query.toString()}`);
  },
  inventoryItem: (uid: string) =>
    request<InventoryResource>(`/api/v1/inventory/${encodeURIComponent(uid)}`),
  incidents: () => request<{items: Incident[]; total: number}>("/api/v1/incidents"),
  incident: (id: string) => request<Incident>(`/api/v1/incidents/${encodeURIComponent(id)}`),
  diagnose: (target: ResourceRef) =>
    request<DiagnosisTask>("/api/v1/diagnoses", {
      method: "POST",
      body: JSON.stringify({target})
    }),
  networkDiagnose: (requestBody: Record<string, unknown>) =>
    request<DiagnosisTask>("/api/v1/network-diagnoses", {
      method: "POST",
      body: JSON.stringify(requestBody)
    }),
  diagnosis: (id: string) =>
    request<DiagnosisTask>(`/api/v1/diagnoses/${encodeURIComponent(id)}`),
  diagnoses: (filters: Record<string, string | undefined> = {}) => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    return request<{items: DiagnosisTask[]; total: number}>(`/api/v1/diagnoses?${query.toString()}`);
  },
  topology: (uid: string, depth = 2, direction = "both") =>
    request<import("./types").GraphSnapshot>(
      `/api/v1/topology?uid=${encodeURIComponent(uid)}&depth=${depth}&direction=${direction}`
    ),
  replay: (id: string) =>
    request<DiagnosisTask>(`/api/v1/replays/${encodeURIComponent(id)}`, {method: "POST"}),
  search: (query: string) =>
    request<{items: {ref: ResourceRef}[]}>(`/api/v1/resources/search?q=${encodeURIComponent(query)}`)
};

export function subscribeDiagnosis(
  id: string,
  onEvent: (type: string, data: unknown) => void
): () => void {
  const source = new EventSource(`/api/v1/diagnoses/${encodeURIComponent(id)}/events`);
  const types = [
    "task_started", "step_started", "step_completed", "evidence_added",
    "hypothesis_updated", "diagnosis_completed", "diagnosis_failed", "task_cancelled"
  ];
  types.forEach((type) => {
    source.addEventListener(type, (event) => {
      onEvent(type, JSON.parse((event as MessageEvent).data));
      if (["diagnosis_completed", "diagnosis_failed", "task_cancelled"].includes(type)) {
        source.close();
      }
    });
  });
  return () => source.close();
}
