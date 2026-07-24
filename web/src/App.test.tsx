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
