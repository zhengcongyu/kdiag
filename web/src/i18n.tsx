/* eslint-disable react-refresh/only-export-components */
import {createContext, useContext, useEffect, useMemo, useState} from "react";
import type {ReactNode} from "react";

export type Language = "zh-CN" | "en";
type Params = Record<string, string | number>;

const messages = {
  "zh-CN": {
    cluster: "集群全景", diagnose: "智能诊断", incidents: "问题中心", network: "网络路径",
    replay: "变更与回放", overview: "诊断概览", policies: "策略与告警", reports: "报告中心",
    topology: "资源拓扑", settings: "系统设置", connected: "已连接", syncing: "同步中",
    unavailable: "连接不可用", language: "语言", chinese: "中文", english: "English",
    clusterHealth: "集群健康概览", clusterHealthSubtitle: "先看哪里需要处理，再进入诊断证据和 Kubernetes 技术细节。",
    critical: "异常", warning: "警告", unknown: "未知 / 无法确认", healthy: "正常",
    permissionDeniedMeaning: "无权限表示 KDiag 无法读取该资源类型，请在系统设置中配置只读授权。",
    systemSettings: "系统设置", settingsSubtitle: "查看采集覆盖、真实 Kubernetes 权限，并生成需要人工审核的只读授权清单。",
    collector: "采集器", securityBoundary: "安全边界", capabilityCoverage: "能力覆盖",
    dataSource: "数据源：{value}", resourceTotal: "资源总数：{value}", cacheSync: "缓存同步：{value}",
    secondsAgo: "{value} 秒前", notAvailable: "未知", secretContent: "Secret 内容：{value}",
    notCollected: "不采集", readOnlyPermission: "Kubernetes 权限：只读 get/list/watch",
    activeProbeOff: "主动探测：默认关闭", discoveredKinds: "已发现资源类型：{value}",
    namespaces: "Namespace：{value}", unknownCount: "无法安全确认健康状态：{value}",
    accessTitle: "Kubernetes 读取权限", accessComplete: "已授权全部采集资源", accessPartial: "部分资源无读取权限",
    accessUnavailable: "无法验证权限", permissionMatrix: "权限矩阵", kind: "资源类型",
    scope: "范围", verbs: "get / list / watch", status: "状态", allowed: "已授权", denied: "无权限",
    clusterScoped: "集群级", namespaced: "命名空间级", generateRBAC: "生成只读授权清单",
    refreshPermissions: "刷新权限", copyManifest: "复制 YAML", copyCommand: "复制应用命令",
    rbacHelp: "KDiag 不会自行提权。请由集群管理员审核 YAML 后手工应用，再重启 API Pod 或等待重新部署。",
    rbacWarning: "授权清单只包含 get/list/watch 和权限自检，不包含 Secret，也不允许修改业务资源。",
    manifestReady: "只读 RBAC 清单已生成", noIssueIncident: "当前没有已聚合的 Incident",
    incidentZero: "Incident 为 0 只表示当前没有已确认并聚合的故障，不等于集群完全健康。",
    currentPriority: "当前最需要处理", healthDistribution: "资源状态分布",
    assessedResources: "{value} 个已评估资源", workloads: "工作负载", servicesNetwork: "服务与网络",
    nodes: "节点", storage: "存储"
  },
  en: {
    cluster: "Cluster", diagnose: "Smart Diagnosis", incidents: "Issues", network: "Network Path",
    replay: "Replay", overview: "Overview", policies: "Policies & Alerts", reports: "Reports",
    topology: "Topology", settings: "Settings", connected: "Connected", syncing: "Syncing",
    unavailable: "Unavailable", language: "Language", chinese: "Chinese", english: "English",
    clusterHealth: "Cluster Health", clusterHealthSubtitle: "See what needs attention first, then inspect evidence and Kubernetes details.",
    critical: "Critical", warning: "Warning", unknown: "Unknown / Unverified", healthy: "Healthy",
    permissionDeniedMeaning: "No access means KDiag cannot read this resource kind. Configure read-only access in Settings.",
    systemSettings: "Settings", settingsSubtitle: "Review collection coverage and effective Kubernetes permissions, then generate a manually reviewed read-only RBAC manifest.",
    collector: "Collector", securityBoundary: "Security boundaries", capabilityCoverage: "Coverage",
    dataSource: "Source: {value}", resourceTotal: "Resources: {value}", cacheSync: "Cache sync: {value}",
    secondsAgo: "{value}s ago", notAvailable: "Unknown", secretContent: "Secret content: {value}",
    notCollected: "Not collected", readOnlyPermission: "Kubernetes access: read-only get/list/watch",
    activeProbeOff: "Active probes: off by default", discoveredKinds: "Discovered kinds: {value}",
    namespaces: "Namespaces: {value}", unknownCount: "Health cannot be safely confirmed: {value}",
    accessTitle: "Kubernetes read access", accessComplete: "All configured resources are authorized", accessPartial: "Some resource kinds are not readable",
    accessUnavailable: "Permission verification unavailable", permissionMatrix: "Permission matrix", kind: "Resource kind",
    scope: "Scope", verbs: "get / list / watch", status: "Status", allowed: "Allowed", denied: "No access",
    clusterScoped: "Cluster", namespaced: "Namespaced", generateRBAC: "Generate read-only RBAC",
    refreshPermissions: "Refresh permissions", copyManifest: "Copy YAML", copyCommand: "Copy apply command",
    rbacHelp: "KDiag never escalates its own privileges. A cluster administrator must review and apply the YAML, then restart the API Pod or redeploy.",
    rbacWarning: "The manifest only grants get/list/watch and permission review. It excludes Secrets and cannot mutate workload resources.",
    manifestReady: "Read-only RBAC manifest generated", noIssueIncident: "No aggregated Incident",
    incidentZero: "Zero Incidents only means no confirmed issue has been aggregated. It does not prove the cluster is fully healthy.",
    currentPriority: "Highest priority", healthDistribution: "Resource status distribution",
    assessedResources: "{value} assessed resources", workloads: "Workloads", servicesNetwork: "Services & network",
    nodes: "Nodes", storage: "Storage"
  }
} as const;

type MessageKey = keyof typeof messages["zh-CN"];
type LanguageContextValue = {
  language: Language;
  setLanguage: (value: Language) => void;
  t: (key: MessageKey, params?: Params) => string;
  l: (zh: string, en: string) => string;
  localize: (value?: string) => string;
};

const runtimeEnglish: Record<string, string> = {
  "正常": "Healthy", "健康": "Healthy", "警告": "Warning", "异常": "Critical",
  "证据不足": "Unknown", "未知": "Unknown", "尚未评估": "Not evaluated",
  "就绪": "Ready", "未就绪": "Not ready", "可用": "Available", "不可用": "Unavailable",
  "部分可用": "Partially available", "已完成": "Completed", "失败": "Failed",
  "等待中": "Pending", "已缩容": "Scaled to zero", "端点就绪": "Endpoints ready",
  "无端点": "No endpoints", "无就绪端点": "No ready endpoints", "部分就绪": "Partially ready",
  "已绑定": "Bound", "已丢失": "Lost", "运行中": "Running", "已暂停": "Suspended",
  "按配置暂停": "Suspended as configured", "任务运行中": "Job running",
  "调度计划有效": "Schedule valid", "缺少调度计划": "Schedule missing",
  "地址已分配": "Address assigned", "入口状态未确认": "Ingress status unverified",
  "没有路由规则": "No routing rules", "策略结构有效": "Policy structure valid",
  "缺少 Pod 选择器": "Pod selector missing", "配置有效": "Configuration valid",
  "缺少供应器": "Provisioner missing", "副本目标有效": "Replica target valid",
  "缺少伸缩状态": "Scaling status missing", "预算满足": "Budget satisfied",
  "预算不足": "Budget insufficient", "缺少 Ready 条件": "Ready condition missing",
  "无法确认健康状态": "Health cannot be confirmed",
  "Namespace is active": "Namespace is active",
  "Namespace deletion is in progress": "Namespace deletion is in progress",
  "ConfigMap 已通过 Kubernetes API 校验并且可以读取": "The ConfigMap passed Kubernetes API validation and is readable.",
  "CronJob 已按用户配置暂停，不属于运行故障": "The CronJob is intentionally suspended and is not a runtime failure.",
  "CronJob 当前有活动 Job": "The CronJob currently has an active Job.",
  "CronJob 未声明有效的 schedule": "The CronJob does not declare a valid schedule.",
  "CronJob 调度计划已通过 Kubernetes API 校验，当前无需活动 Job": "The CronJob schedule passed Kubernetes API validation; no active Job is required right now.",
  "Ingress 已获得负载均衡地址": "The Ingress has a load balancer address.",
  "Ingress 没有 rules 或 defaultBackend": "The Ingress has neither rules nor a default backend.",
  "Ingress 配置有效，但控制器尚未报告负载均衡地址；请确认 IngressClass 和控制器状态": "The Ingress configuration is valid, but its controller has not reported an address. Check the IngressClass and controller.",
  "NetworkPolicy 缺少 podSelector": "The NetworkPolicy is missing podSelector.",
  "NetworkPolicy 已通过 Kubernetes API 结构校验；实际流量仍需 CNI 或主动探测证据验证": "The NetworkPolicy passed Kubernetes API validation. Actual traffic still requires CNI telemetry or an active probe.",
  "StorageClass 未声明 provisioner": "The StorageClass does not declare a provisioner.",
  "StorageClass 已声明 provisioner 并通过 Kubernetes API 校验": "The StorageClass declares a provisioner and passed Kubernetes API validation.",
  "HPA 已报告当前和期望副本数，但缺少 Condition，指标获取能力仍需单独确认": "The HPA reports current and desired replicas, but metric retrieval still needs verification because Conditions are missing.",
  "HPA 没有可判定的 Condition 或有效副本状态": "The HPA has no usable Condition or replica status.",
  "此资源类型没有可用的结构化健康信号": "This resource kind has no usable structured health signal.",
  "节点 Ready 条件为 True": "The Node Ready condition is True.",
  "节点 Ready 条件不为 True": "The Node Ready condition is not True.",
  "无法确认节点就绪状态": "Node readiness cannot be confirmed.",
  "Pod 已成功完成": "The Pod completed successfully.",
  "Pod phase 为 Failed": "The Pod phase is Failed.",
  "所有容器已就绪": "All containers are ready.",
  "Pod 仍在等待调度或启动": "The Pod is still waiting to be scheduled or started.",
  "Pod 尚未全部就绪": "Not all Pod containers are ready.",
  "期望副本为 0": "The desired replica count is zero.",
  "期望副本均已可用": "All desired replicas are available.",
  "没有可用副本": "No replicas are available.",
  "可用副本少于期望值": "Available replicas are below the desired count.",
  "所有目标节点均有可用 Pod": "All target nodes have an available Pod.",
  "部分目标节点没有可用 Pod": "Some target nodes do not have an available Pod.",
  "ExternalName Service 不使用 EndpointSlice": "ExternalName Services do not use EndpointSlices.",
  "Service 当前没有可以接收请求的后端 Pod": "The Service has no backend Pod that can receive requests.",
  "EndpointSlice 中 Ready Endpoint 数量为 0": "The EndpointSlice has zero Ready endpoints.",
  "部分 Endpoint 尚未就绪": "Some endpoints are not ready.",
  "所有 Endpoint 均已就绪": "All endpoints are ready.",
  "没有 Ready Endpoint": "There are no Ready endpoints.",
  "EndpointSlice 有可用后端": "The EndpointSlice has an available backend.",
  "PVC 已绑定到 PersistentVolume": "The PVC is bound to a PersistentVolume.",
  "PVC 绑定已丢失": "The PVC binding has been lost.",
  "PVC 尚未绑定": "The PVC is not bound yet.",
  "PersistentVolume 可用": "The PersistentVolume is available.",
  "PersistentVolume phase 为 Failed": "The PersistentVolume phase is Failed.",
  "PersistentVolume 状态需要检查": "The PersistentVolume state needs inspection.",
  "Job 有失败的 Pod": "The Job has a failed Pod.",
  "Job 已达到完成数": "The Job reached its completion target.",
  "Job 尚未完成": "The Job has not completed.",
  "基于 HPA 结构化 Condition 汇总": "Evaluated from structured HPA Conditions.",
  "当前健康 Pod 数量满足中断预算": "The current healthy Pod count satisfies the disruption budget.",
  "当前健康 Pod 数量低于中断预算要求": "The current healthy Pod count is below the disruption budget.",
  "基于结构化 Condition 汇总": "Evaluated from structured Conditions.",
  "Namespace phase is missing or not recognized": "The Namespace phase is missing or not recognized."
};

function translate(language: Language, key: MessageKey, params?: Params) {
  let text: string = messages[language][key];
  for (const [name, replacement] of Object.entries(params ?? {})) {
    text = text.replaceAll(`{${name}}`, String(replacement));
  }
  return text;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "zh-CN",
  setLanguage: () => undefined,
  t: (key, params) => translate("zh-CN", key, params),
  l: (zh) => zh,
  localize: (value) => value ?? ""
});

export function LanguageProvider({children}: {children: ReactNode}) {
  const [language, setLanguageState] = useState<Language>(() =>
    localStorage.getItem("kdiag-language") === "en" ? "en" : "zh-CN"
  );
  const setLanguage = (value: Language) => {
    localStorage.setItem("kdiag-language", value);
    setLanguageState(value);
  };
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    t: (key, params) => translate(language, key, params),
    l: (zh, en) => language === "zh-CN" ? zh : en,
    localize: (text) => {
      if (!text || language === "zh-CN") return text ?? "";
      const exact = runtimeEnglish[text];
      if (exact) return exact;
      if (text.startsWith("容器处于 ")) return `Container state: ${text.slice("容器处于 ".length)}`;
      return text;
    }
  }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
