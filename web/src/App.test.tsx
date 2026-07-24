import {render, screen} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {beforeEach, expect, test, vi} from "vitest";

vi.mock("echarts-for-react", () => ({
  default: () => <div aria-label="严重度图表" />
}));

import {App} from "./App";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({items: [], total: 0}),
    headers: new Headers(),
    status: 200
  })));
});

test("renders accessible cluster inventory and honest empty state", async () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  render(<QueryClientProvider client={client}><MemoryRouter><App /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByRole("heading", {name: "集群全景"})).toBeInTheDocument();
  expect(await screen.findByText(/缺少数据不会被当作健康/)).toBeInTheDocument();
  expect(screen.getByRole("textbox", {name: "搜索资源"})).toBeInTheDocument();
});

test("diagnosis resource names come from the live inventory selector", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("/cluster/overview")
      ? {
          connection: {name: "local-k8s", status: "connected", mode: "in-cluster"},
          total: 1,
          facets: {
            kinds: {Pod: 1}, groups: {}, namespaces: ["default"], nodes: ["k8s-node1"],
            states: {healthy: 1, warning: 0, critical: 0, unknown: 0}
          },
          observedAt: new Date().toISOString(),
          coverage: {source: "Informer", secrets: false, message: "只读"}
        }
      : {
          items: [{
            ref: {cluster: "local-k8s", uid: "pod-1", kind: "Pod", namespace: "default", name: "payment-abc"},
            observed: new Date().toISOString(), group: "workloads", state: "healthy", stateText: "就绪"
          }],
          total: 1, offset: 0, limit: 500,
          facets: {kinds: {Pod: 1}, groups: {}, namespaces: ["default"], nodes: [], states: {healthy: 1}},
          observedAt: new Date().toISOString()
        };
    return {ok: true, json: async () => body, headers: new Headers(), status: 200};
  }));
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  render(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={["/diagnose"]}><App /></MemoryRouter>
  </QueryClientProvider>);
  expect(await screen.findByRole("heading", {name: "资源智能诊断"})).toBeInTheDocument();
  expect(await screen.findByText(/实时读取，共 1 项/)).toBeInTheDocument();
  expect(await screen.findByLabelText("资源名称")).toBeInTheDocument();
  expect(screen.queryByRole("textbox", {name: "资源名称"})).not.toBeInTheDocument();
});
