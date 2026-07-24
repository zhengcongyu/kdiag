package diagnosis

import (
	"fmt"
	"strings"

	"github.com/zhengcongyu/kdiag/pkg/model"
)

func enrichTroubleshooting(report *model.DiagnosisReport, target model.ResourceRef) {
	seen := map[string]bool{}
	for index := range report.ConfirmedIssues {
		enrichIssue(&report.ConfirmedIssues[index], target)
		appendUniqueActions(&report.Troubleshooting, report.ConfirmedIssues[index].Troubleshooting, seen)
	}
	for index := range report.SuspectedIssues {
		enrichIssue(&report.SuspectedIssues[index], target)
		appendUniqueActions(&report.Troubleshooting, report.SuspectedIssues[index].Troubleshooting, seen)
	}
	if len(report.Troubleshooting) == 0 {
		appendUniqueActions(&report.Troubleshooting, baseResourceActions(target), seen)
	}
}

func enrichIssue(issue *model.DiagnosticIssue, target model.ResourceRef) {
	if issue.Resource != nil {
		target = *issue.Resource
	}
	issue.ProblemAt = problemLocation(issue.Code, target)
	issue.PossibleCauses = possibleCauses(issue.Code)
	issue.Troubleshooting = issueActions(issue.Code, target)
}

func appendUniqueActions(
	target *[]model.TroubleshootingAction,
	actions []model.TroubleshootingAction,
	seen map[string]bool,
) {
	for _, action := range actions {
		key := action.Command
		if key == "" {
			key = action.Title + action.Purpose
		}
		if seen[key] {
			continue
		}
		seen[key] = true
		*target = append(*target, action)
	}
}

func problemLocation(code string, target model.ResourceRef) string {
	resource := fmt.Sprintf("%s/%s", target.Kind, target.Name)
	locations := map[string]string{
		"KDIAG-POD-CRASHLOOP":        resource + " → 容器生命周期 → 重启退避",
		"KDIAG-POD-OOMKILLED":        resource + " → 容器上次终止状态 → 内存限制",
		"KDIAG-POD-IMAGEPULLBACKOFF": resource + " → 容器镜像 → 镜像仓库",
		"KDIAG-POD-ERRIMAGEPULL":     resource + " → 容器镜像 → 镜像仓库",
		"KDIAG-POD-CONFIG":           resource + " → 容器配置 → ConfigMap/Secret 引用",
		"KDIAG-POD-READINESS":        resource + " → readinessProbe → 应用监听端口/路径",
		"KDIAG-SVC-SELECTOR":         resource + " → selector → Pod labels",
		"KDIAG-SVC-ENDPOINT":         resource + " → EndpointSlice → Ready Pod",
		"KDIAG-SVC-TARGETPORT":       resource + " → targetPort → Pod containerPort",
		"KDIAG-SCHED-RESOURCES":      resource + " → 调度器 → 节点可用资源",
		"KDIAG-SCHED-TAINT":          resource + " → tolerations → Node taints",
		"KDIAG-PVC-PENDING":          resource + " → StorageClass/PV → 存储供应",
		"KDIAG-NODE-NOTREADY":        resource + " → Ready Condition → kubelet/节点",
		"network/source":             "源工作负载 → Pod Ready",
		"network/service":            "请求路径 → 目标 Service",
		"network/selector":           "Service → selector → Pod labels",
		"network/endpointslices":     "Service → EndpointSlice",
		"network/ready-endpoints":    "EndpointSlice → Ready Endpoint → Pod",
		"network/service-port":       "请求端口 → Service spec.ports",
		"network/target-port":        "Service port → targetPort → Pod containerPort",
		"network/network-policy":     "源 Pod → NetworkPolicy → 目标 Pod",
		"network/active-probe":       "Service IP/Pod IP → TCP/HTTP 实际流量",
	}
	if location := locations[code]; location != "" {
		return location
	}
	return resource + " → Kubernetes 结构化状态"
}

func possibleCauses(code string) []string {
	causes := map[string][]string{
		"KDIAG-POD-CRASHLOOP":        {"应用启动失败或进程立即退出", "启动参数、依赖或配置错误", "探针或资源限制导致容器反复重启"},
		"KDIAG-POD-OOMKILLED":        {"容器实际内存峰值超过 limit", "应用存在内存泄漏或并发突增", "内存 limit 设置过低"},
		"KDIAG-POD-IMAGEPULLBACKOFF": {"镜像地址或 Tag 错误", "仓库认证失败", "节点无法访问镜像仓库"},
		"KDIAG-POD-ERRIMAGEPULL":     {"镜像不存在", "镜像拉取凭据无效", "仓库网络或证书异常"},
		"KDIAG-POD-CONFIG":           {"引用的 ConfigMap、Secret 或 key 不存在", "volumeMount 与 volume 定义不一致"},
		"KDIAG-POD-READINESS":        {"探针端口或路径错误", "应用尚未监听", "应用依赖未就绪或响应超时"},
		"KDIAG-SVC-SELECTOR":         {"Service selector 与 Pod labels 不一致", "目标工作负载尚未创建 Pod"},
		"KDIAG-SVC-ENDPOINT":         {"匹配 Pod 未 Ready", "EndpointSlice 尚未生成", "Service selector 选中了错误的 Pod"},
		"KDIAG-SVC-TARGETPORT":       {"targetPort 数值错误", "命名端口不存在或名称不一致", "应用实际监听端口与声明不一致"},
		"KDIAG-SCHED-RESOURCES":      {"节点剩余 CPU/内存不足", "Pod requests 设置过高", "亲和性条件缩小了可调度节点范围"},
		"KDIAG-SCHED-TAINT":          {"Pod 缺少对应 toleration", "节点 taint 的 effect 与预期不一致"},
		"KDIAG-PVC-PENDING":          {"StorageClass 不存在或默认类缺失", "动态供应器异常", "容量、访问模式或拓扑约束无法满足"},
		"KDIAG-NODE-NOTREADY":        {"kubelet 未上报心跳", "节点网络或容器运行时异常", "磁盘、内存或 PID 压力"},
		"network/selector":           {"Service selector 与 Pod labels 不一致"},
		"network/endpointslices":     {"Service 没有匹配后端", "EndpointSlice 控制器尚未生成对象"},
		"network/ready-endpoints":    {"后端 Pod 未 Ready", "readinessProbe 失败"},
		"network/service-port":       {"访问端口未在 Service 中声明"},
		"network/target-port":        {"targetPort 与容器端口不一致", "命名端口无法解析"},
		"network/network-policy":     {"Ingress 或 Egress 策略未放行源、目标或端口"},
	}
	return causes[code]
}

func issueActions(code string, target model.ResourceRef) []model.TroubleshootingAction {
	actions := baseResourceActions(target)
	switch code {
	case "KDIAG-POD-CRASHLOOP":
		actions = append(actions, podLogsAction(target, true))
	case "KDIAG-POD-OOMKILLED":
		actions = append(actions, podStatusAction(target))
	case "KDIAG-POD-IMAGEPULLBACKOFF", "KDIAG-POD-ERRIMAGEPULL":
		actions = append(actions, eventAction(target))
	case "KDIAG-POD-CONFIG":
		actions = append(actions, eventAction(target))
	case "KDIAG-POD-READINESS":
		actions = append(actions, podLogsAction(target, false), eventAction(target))
	case "KDIAG-SVC-SELECTOR", "network/selector":
		actions = append(actions, serviceSelectorAction(target), namespacePodLabelsAction(target))
	case "KDIAG-SVC-ENDPOINT", "network/endpointslices", "network/ready-endpoints":
		actions = append(actions, endpointSliceAction(target), namespacePodLabelsAction(target))
	case "KDIAG-SVC-TARGETPORT", "network/target-port", "network/service-port":
		actions = append(actions, servicePortsAction(target), endpointSliceAction(target), namespacePodPortsAction(target))
	case "KDIAG-SCHED-RESOURCES", "KDIAG-SCHED-TAINT":
		actions = append(actions, eventAction(target), nodeCapacityAction())
	case "KDIAG-PVC-PENDING":
		actions = append(actions, eventAction(target), storageClassAction())
	case "KDIAG-NODE-NOTREADY":
		actions = append(actions, nodeConditionAction(target), nodePodsAction(target))
	case "network/network-policy":
		actions = append(actions, networkPolicyAction(target))
	default:
		actions = append(actions, eventAction(target))
	}
	return actions
}

func baseResourceActions(ref model.ResourceRef) []model.TroubleshootingAction {
	resource := kubectlResource(ref.Kind)
	return []model.TroubleshootingAction{
		action(
			"确认资源当前状态",
			"先确认报错是否仍存在，以及 Ready、重启次数、IP、所在节点等关键信息。",
			fmt.Sprintf("kubectl get %s %s%s -o wide", resource, shellQuote(ref.Name), namespaceFlag(ref)),
			"资源存在，并能看到当前状态、Ready 数量及其他摘要字段。",
			"如果资源不存在，检查集群上下文、Namespace 和资源名称；如果状态异常，继续执行下一步 describe。",
		),
		action(
			"查看 Condition 与最近事件",
			"定位 Kubernetes 控制器给出的结构化失败原因和事件时间线。",
			fmt.Sprintf("kubectl describe %s %s%s", resource, shellQuote(ref.Name), namespaceFlag(ref)),
			"Conditions 与 Events 中没有持续失败，资源期望状态与实际状态一致。",
			"重点记录 Reason、Message、首次/最后发生时间，不要只根据单条 Event 猜测根因。",
		),
	}
}

func podStatusAction(ref model.ResourceRef) model.TroubleshootingAction {
	return action(
		"核对容器等待与上次终止原因",
		"直接读取结构化容器状态；退出码 137 本身不能证明 OOM。",
		fmt.Sprintf(
			"kubectl get pod %s%s -o jsonpath='{range .status.containerStatuses[*]}{.name}{\" waiting=\"}{.state.waiting.reason}{\" lastReason=\"}{.lastState.terminated.reason}{\" exitCode=\"}{.lastState.terminated.exitCode}{\" restarts=\"}{.restartCount}{\"\\n\"}{end}'",
			shellQuote(ref.Name), namespaceFlag(ref),
		),
		"waiting 为空，lastReason 能与时间线对应，restartCount 不再持续增加。",
		"只有 lastReason=OOMKilled 才可将 OOM 作为强证据；否则继续检查应用日志和节点事件。",
	)
}

func podLogsAction(ref model.ResourceRef, previous bool) model.TroubleshootingAction {
	previousFlag := ""
	title := "查看最近应用日志"
	purpose := "检查应用是否报告启动、依赖、端口或探针错误。"
	if previous {
		previousFlag = " --previous"
		title = "查看上一次崩溃日志"
		purpose = "CrashLoop 时当前容器日志可能很短，优先查看上一次终止前的输出。"
	}
	return action(
		title,
		purpose,
		fmt.Sprintf("kubectl logs pod/%s%s --all-containers%s --tail=100", shellQuote(ref.Name), namespaceFlag(ref), previousFlag),
		"日志中没有持续启动失败、panic、连接拒绝或配置缺失。",
		"根据最早出现的业务错误继续查依赖；不要把 Kubernetes 随后的重启信息误当成第一根因。",
	)
}

func eventAction(ref model.ResourceRef) model.TroubleshootingAction {
	scope := namespaceFlag(ref)
	if ref.Namespace == "" {
		scope = " -A"
	}
	return action(
		"按 UID 查看相关事件",
		"避免同名资源重建后把旧事件混入当前故障。",
		fmt.Sprintf("kubectl get events%s --field-selector involvedObject.uid=%s --sort-by=.lastTimestamp", scope, shellQuote(ref.UID)),
		"没有持续重复的 Warning，事件时间与当前资源 UID 对应。",
		"结合结构化 Condition 判断；Event 文本只能作为补充证据。",
	)
}

func serviceSelectorAction(ref model.ResourceRef) model.TroubleshootingAction {
	return action(
		"查看 Service selector",
		"确认 Service 实际使用了哪些标签选择后端 Pod。",
		fmt.Sprintf("kubectl get service %s%s -o jsonpath='{.spec.selector}{\"\\n\"}'", shellQuote(ref.Name), namespaceFlag(ref)),
		"selector 非空，并且键值与目标 Pod labels 完全一致。",
		"任意一个标签键或值不一致都会导致没有后端；先对比，不要直接修改生产资源。",
	)
}

func namespacePodLabelsAction(ref model.ResourceRef) model.TroubleshootingAction {
	return action(
		"对比 Namespace 内 Pod 标签",
		"将 Service selector 与真实 Pod labels 逐项比较。",
		fmt.Sprintf("kubectl get pods%s --show-labels -o wide", namespaceFlag(ref)),
		"至少一个预期后端 Pod 的标签完全匹配，并且处于 Running/Ready。",
		"若没有匹配项，检查 Deployment template labels 与 Service selector；若匹配但未 Ready，继续诊断 Pod。",
	)
}

func endpointSliceAction(ref model.ResourceRef) model.TroubleshootingAction {
	return action(
		"检查 EndpointSlice 和 Ready Endpoint",
		"确认 Service 控制器已经生成后端地址，并查看 endpoint Ready 状态。",
		fmt.Sprintf(
			"kubectl get endpointslice%s -l kubernetes.io/service-name=%s -o wide",
			namespaceFlag(ref), shellQuote(ref.Name),
		),
		"至少存在一个 EndpointSlice，并包含 Ready 的后端地址。",
		"没有对象时先检查 selector；存在但无 Ready 地址时诊断对应 Pod 的 readinessProbe。",
	)
}

func servicePortsAction(ref model.ResourceRef) model.TroubleshootingAction {
	return action(
		"核对 Service port 与 targetPort",
		"确认客户端访问端口、转发端口及协议配置。",
		fmt.Sprintf("kubectl get service %s%s -o jsonpath='{range .spec.ports[*]}{.name}{\" port=\"}{.port}{\" targetPort=\"}{.targetPort}{\" protocol=\"}{.protocol}{\"\\n\"}{end}'", shellQuote(ref.Name), namespaceFlag(ref)),
		"访问的 port 存在，targetPort 能解析到后端 Pod 实际监听端口。",
		"数字 targetPort 必须等于监听端口；命名 targetPort 必须与 Pod containerPort.name 一致。",
	)
}

func namespacePodPortsAction(ref model.ResourceRef) model.TroubleshootingAction {
	return action(
		"查看 Pod 声明的容器端口",
		"对比后端容器声明端口和命名端口。",
		fmt.Sprintf("kubectl get pods%s -o jsonpath='{range .items[*]}{.metadata.name}{\" => \"}{range .spec.containers[*].ports[*]}{.name}{\":\"}{.containerPort}{\" \"}{end}{\"\\n\"}{end}'", namespaceFlag(ref)),
		"目标 Pod 中存在与 Service targetPort 对应的数字或命名端口。",
		"若声明与应用真实监听不一致，还需结合应用启动参数和日志确认，声明端口本身不会打开端口。",
	)
}

func nodeCapacityAction() model.TroubleshootingAction {
	return action(
		"检查节点可分配资源",
		"判断 Pod requests 是否超过节点剩余可分配资源。",
		"kubectl get nodes -o custom-columns='NAME:.metadata.name,CPU:.status.allocatable.cpu,MEMORY:.status.allocatable.memory,TAINTS:.spec.taints'",
		"存在满足 requests、亲和性和 toleration 的 Ready 节点。",
		"结合 PodScheduled Condition 和调度事件确认具体不足项。",
	)
}

func storageClassAction() model.TroubleshootingAction {
	return action(
		"检查 StorageClass 与供应器",
		"确认 PVC 引用的存储类存在并能动态供应。",
		"kubectl get storageclass -o wide",
		"PVC 指定的 StorageClass 存在，provisioner 正确，绑定模式符合节点拓扑。",
		"如果没有默认类或供应器异常，交由存储管理员处理；不要随意删除 PVC。",
	)
}

func nodeConditionAction(ref model.ResourceRef) model.TroubleshootingAction {
	return action(
		"查看节点 Condition",
		"区分 NotReady、磁盘压力、内存压力、网络不可用等不同问题。",
		fmt.Sprintf("kubectl get node %s -o jsonpath='{range .status.conditions[*]}{.type}{\"=\"}{.status}{\" reason=\"}{.reason}{\" message=\"}{.message}{\"\\n\"}{end}'", shellQuote(ref.Name)),
		"Ready=True，MemoryPressure/DiskPressure/PIDPressure=False。",
		"记录异常 Condition 的 reason 和时间，检查 kubelet、容器运行时和节点网络；KDiag 不自动登录节点。",
	)
}

func nodePodsAction(ref model.ResourceRef) model.TroubleshootingAction {
	return action(
		"确认节点影响范围",
		"列出调度在该节点上的工作负载，评估故障影响。",
		fmt.Sprintf("kubectl get pods -A --field-selector spec.nodeName=%s -o wide", shellQuote(ref.Name)),
		"Pod Ready 状态稳定，没有大量 Evicted、Pending 或 Terminating。",
		"先评估业务影响和副本分布，再由管理员决定节点维护操作。",
	)
}

func networkPolicyAction(ref model.ResourceRef) model.TroubleshootingAction {
	return action(
		"列出 Namespace 网络策略",
		"检查 ingress/egress 选择器、端口和方向是否覆盖当前路径。",
		fmt.Sprintf("kubectl get networkpolicy%s -o yaml", namespaceFlag(ref)),
		"存在明确允许源 Pod 到目标 Pod 和端口的规则，或目标不受默认拒绝策略影响。",
		"静态规则通过仍不能证明 CNI 数据面正常；需要受控主动探测或 CNI 流量证据。",
	)
}

func action(title, purpose, command, expected, abnormal string) model.TroubleshootingAction {
	return model.TroubleshootingAction{
		Title: title, Purpose: purpose, Command: command, Expected: expected,
		IfAbnormal: abnormal, ReadOnly: true, RequiresAccess: "需要对目标集群拥有相应资源的 get/list 权限",
	}
}

func kubectlResource(kind string) string {
	aliases := map[string]string{
		"Namespace":             "namespace",
		"Deployment":            "deployment",
		"ReplicaSet":            "replicaset",
		"Pod":                   "pod",
		"Node":                  "node",
		"Service":               "service",
		"PersistentVolumeClaim": "pvc",
		"EndpointSlice":         "endpointslice",
	}
	if alias := aliases[kind]; alias != "" {
		return alias
	}
	return "resource"
}

func namespaceFlag(ref model.ResourceRef) string {
	if ref.Namespace == "" {
		return ""
	}
	return " -n " + shellQuote(ref.Namespace)
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}
