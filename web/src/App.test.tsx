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

test("renders accessible empty overview", async () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  render(<QueryClientProvider client={client}><MemoryRouter><App /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByRole("heading", {name: "集群概览"})).toBeInTheDocument();
  expect(await screen.findByText(/缺少采集数据时不会显示为/)).toBeInTheDocument();
});
