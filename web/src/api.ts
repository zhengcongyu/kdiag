import type {DiagnosisTask, Incident, ResourceRef} from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {"Content-Type": "application/json", ...init?.headers}
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({error: {message: response.statusText}}));
    throw new ApiError(response.status, body.error?.message ?? "请求失败");
  }
  return response.json() as Promise<T>;
}

export const api = {
  incidents: () => request<{items: Incident[]; total: number}>("/api/v1/incidents"),
  incident: (id: string) => request<Incident>(`/api/v1/incidents/${encodeURIComponent(id)}`),
  diagnose: (target: ResourceRef, observation: Record<string, unknown> = {}) =>
    request<DiagnosisTask>("/api/v1/diagnoses", {
      method: "POST",
      body: JSON.stringify({target, observation})
    }),
  networkDiagnose: (requestBody: Record<string, unknown>) =>
    request<DiagnosisTask>("/api/v1/network-diagnoses", {
      method: "POST",
      body: JSON.stringify(requestBody)
    }),
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
