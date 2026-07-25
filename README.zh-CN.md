# KDiag

KDiag 是一个开源的 Kubernetes 可解释故障诊断、网络排障与变更验证平台。
它把重复异常聚合成 Incident，并明确展示：发生了什么、影响范围、候选根因、
支持/冲突/缺失证据、定位过程、安全修复建议和修复后验证方案。

> 当前发布线：v0.4.2。Go、前端以及环境相关的 Compose、PostgreSQL、kind
> 验证结果会分别记录，不会仅凭代码存在便宣称已经通过。

[Roadmap](docs/ROADMAP.md) · [架构](docs/architecture/overview.md) ·
[安全策略](SECURITY.md)

## 核心价值

KDiag 不是普通 Kubernetes Dashboard。它以可解释 Incident 为中心，Evidence
明确区分 supporting、contradicting、missing 和 neutral。证据不足时返回
`NEEDS_MORE_EVIDENCE`，不会强行猜测。结构化容器状态、Condition、Reason 和
终止信息的优先级高于 Event 文本；退出码 137 本身不能证明 OOM。

控制台支持中文与英文。系统设置会逐项显示每一种采集资源的实际
`get/list/watch` 权限，并可生成供集群管理员审核和手工应用的只读 RBAC
清单。KDiag 不会自行提权，生成的清单也不包含 Secret。

## 已实现

- client-go SharedInformer 增量监听 20 类 Kubernetes 资源，处理缓存同步、
  Watch 重连、删除 tombstone、UID 和 OwnerReferences。
- API Server 在集群内自动使用 ServiceAccount，作为本地进程运行时自动回退到
  当前 kubeconfig；Informer 缓存已接入实时资源 API。
- 内存拓扑、Event 归一化/指纹/聚合、同源 Evidence 去重、Incident 聚合。
- 13 条版本化确定性规则和 DAG 引擎；每条规则都有正例、反例和证据不足测试。
- API 根据 UID 从实时 Informer 缓存自动构造可信 Observation；诊断报告明确区分
  已确认问题、疑似问题、检查正常和未验证项。
- PostgreSQL 迁移与 Repository、异步 REST API、完整命名 SSE 事件、结构化日志、
  请求 ID、指标、超时与优雅关闭。
- React + TypeScript 控制台：可过滤的“集群全景”、资源完整详情/关系/Event/
  脱敏原始对象、概览、Incident 列表/详情、证据、拓扑、时间线、资源诊断、
  网络诊断和历史回放。
- 诊断、网络追踪、拓扑和回放中的资源名称均从实时 API 下拉选择，每 15 秒刷新，
  不再要求手工输入；策略与告警、报告中心、资源拓扑和系统设置页面已补齐。
- Service selector、EndpointSlice、Ready Endpoint、数值/命名 targetPort、
  容器端口与 NetworkPolicy 能力边界的网络静态分析。
- 资源诊断先展示结论、影响、根因、排查链路和修复验证；网络诊断明确标出阻断层，
  后续无法检查的层显示为“因上游失败未执行”。
- 基于 React Flow 的真实资源健康拓扑，支持故障链聚焦、上下游方向和展开深度。
- API 客户端 CLI、Docker Compose、非 root 镜像、Helm Chart、7 个 kind 故障
  场景，以及 CI、安全和 Release 工作流。

## 快速开始

需要 Go 1.26、Node 22、pnpm 11 和 Docker Compose：

```bash
cp .env.example .env
# 修改 .env 中的本地 PostgreSQL 密码
docker compose up --build
```

打开 `http://localhost:8088`。当前开发机器尚未验证 Compose 启动，这是发布门禁。

已在本机验证的无数据库路径：

```bash
go run ./cmd/kdiag-api
go run ./cmd/kdiag doctor
go run ./cmd/kdiag why service/payment -n production
```

没有实时采集快照时，诊断会明确显示缺失证据，不会显示“未发现问题”。

### 自动接入 Kubernetes

部署到 Kubernetes 后无需上传 kubeconfig，API 会自动使用 Pod 的
ServiceAccount。直接运行二进制时会读取标准 kubeconfig 搜索路径，也可以设置：

```bash
KDIAG_KUBECONFIG=/path/to/kubeconfig KDIAG_CLUSTER_NAME=local-k8s \
  go run ./cmd/kdiag-api
```

Web 首页“集群全景”支持按资源组、Namespace、健康状态、节点、标签和关键字过滤，
并查看结构化状态、OwnerReferences、Service/EndpointSlice/Pod 关系、相关 Event
及脱敏后的原始对象。Secret 不在 RBAC 和 Informer 观察范围内。

## CLI 示例

```bash
kdiag doctor
kdiag why service/payment -n production
kdiag why pod/payment-xxx -n production --output json
kdiag trace --from frontend --to payment:8080 -n production --protocol HTTP
kdiag replay <incident-id>
```

CLI 支持 `--server`、`--timeout` 和 `--output table|json`，只调用 API Server，
不会复制第二套诊断逻辑。

## targetPort 故障演示

```bash
make kind-up
./deploy/kind/run-e2e.sh targetport
```

场景中后端 Ready 且监听 8080，Service 却转发到 9090。正确根因必须是
`target_port_mismatch`，不得误判为 selector、无 Endpoint 或 NetworkPolicy。
脚本包含故障注入、失败验证、引擎 fixture、修复、恢复验证和清理；由于当前机器
没有 Docker/kind，尚未真实执行。

## 测试

```bash
make fmt lint test build
make test-integration   # 需要已迁移的 PostgreSQL
make e2e                # 需要 Docker、kind、kubectl
make security
```

本快照已验证：Go 测试和 API/CLI 编译、前端 lint/typecheck/Vitest/生产构建、
Kubernetes YAML 解析、`helm lint` 和 `helm template`。Docker/Compose、
PostgreSQL 集成与 kind E2E 待环境补齐。

## 安全模型

- 默认只读 Kubernetes RBAC，不监听或展示 Secret 内容。
- 主动探测默认关闭，只接受 DNS/TCP/HTTP 结构化动作，并限制超时、并发、任务目标，
  支持取消，不接受任意 Shell。
- API 请求有大小和字段校验，SQL 参数化，日志不打印凭据。
- 容器非 root、只读文件系统，Helm 配置 SecurityContext。
- MVP 不自动修改生产资源；GitHub Actions 采用最小权限并执行依赖、静态、Secret
  和镜像扫描。

重要限制：v0.1 没有内建用户认证和多租户授权，生产环境必须使用认证代理/
Identity-Aware Ingress 和严格 NetworkPolicy。

## 当前限制

- 实时清单当前覆盖 20 类常用原生资源，尚未自动发现和观察任意 CRD 实例。
- “未评估”表示该资源可查看、但当前没有健康判定规则，不代表异常或健康。
- API 会从实时 informer 清单构造可信网络快照；Web 和 CLI 只提交所选路径。
- 静态 NetworkPolicy 分析不能证明 CNI 数据面实际正常。
- PostgreSQL 集成、Compose 和 kind E2E 仍是待执行发布门禁。
- Helm 的独立 Probe Runner 默认关闭，独立运行命令尚未交付。

详细计划见 [docs/ROADMAP.md](docs/ROADMAP.md)。贡献前请阅读
[CONTRIBUTING.md](CONTRIBUTING.md) 和 [AGENTS.md](AGENTS.md)。

开源协议：[Apache License 2.0](LICENSE)。
