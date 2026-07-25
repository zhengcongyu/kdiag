import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, expect, test} from "vitest";
import {ApiError} from "../api";
import {ErrorState} from "./States";

afterEach(cleanup);

test("explains an API failure and provides read-only troubleshooting commands", () => {
  render(<ErrorState error={new ApiError(500, "internal server error", "INTERNAL", "req-123")} />);

  expect(screen.getByText("KDiag API 处理请求失败")).toBeInTheDocument();
  expect(screen.getByText(/KDiag API → Kubernetes/)).toBeInTheDocument();
  expect(screen.getByText(/Request ID: req-123/)).toBeInTheDocument();

  fireEvent.click(screen.getByText("查看排错指引和建议命令"));
  expect(screen.getByText(/kubectl -n kdiag get pods/)).toBeInTheDocument();
  expect(screen.getByText(/kubectl -n kdiag logs/)).toBeInTheDocument();
  expect(screen.getByText(/以上命令均为只读检查/)).toBeInTheDocument();
});

test("gives RBAC-specific guidance for forbidden responses", () => {
  render(<ErrorState error={new ApiError(403, "forbidden")} />);
  expect(screen.getByText("当前身份没有读取这些数据的权限")).toBeInTheDocument();
  fireEvent.click(screen.getByText("查看排错指引和建议命令"));
  expect(screen.getByText("kubectl auth can-i get pods --all-namespaces")).toBeInTheDocument();
});
