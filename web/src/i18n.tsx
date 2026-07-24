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
    critical: "异常", warning: "警告", unknown: "证据不足", observed: "已采集", healthy: "正常",
    collectedMeaning: "已采集表示对象可见，但该资源类型没有通用健康 Condition；它不等于正常。",
    permissionDeniedMeaning: "无权限表示 KDiag 无法读取该资源类型，请在系统设置中配置只读授权。",
    systemSettings: "系统设置", settingsSubtitle: "查看采集覆盖、真实 Kubernetes 权限，并生成需要人工审核的只读授权清单。",
    collector: "采集器", securityBoundary: "安全边界", capabilityCoverage: "能力覆盖",
    dataSource: "数据源：{value}", resourceTotal: "资源总数：{value}", cacheSync: "缓存同步：{value}",
    secondsAgo: "{value} 秒前", notAvailable: "未知", secretContent: "Secret 内容：{value}",
    notCollected: "不采集", readOnlyPermission: "Kubernetes 权限：只读 get/list/watch",
    activeProbeOff: "主动探测：默认关闭", discoveredKinds: "已发现资源类型：{value}",
    namespaces: "Namespace：{value}", observedCount: "已采集但无通用健康判定：{value}",
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
    collectedResources: "{value} 个已采集资源", workloads: "工作负载", servicesNetwork: "服务与网络",
    nodes: "节点", storage: "存储"
  },
  en: {
    cluster: "Cluster", diagnose: "Smart Diagnosis", incidents: "Issues", network: "Network Path",
    replay: "Replay", overview: "Overview", policies: "Policies & Alerts", reports: "Reports",
    topology: "Topology", settings: "Settings", connected: "Connected", syncing: "Syncing",
    unavailable: "Unavailable", language: "Language", chinese: "中文", english: "English",
    clusterHealth: "Cluster Health", clusterHealthSubtitle: "See what needs attention first, then inspect evidence and Kubernetes details.",
    critical: "Critical", warning: "Warning", unknown: "Insufficient evidence", observed: "Observed", healthy: "Healthy",
    collectedMeaning: "Observed means the object is readable, but this kind has no universal health condition. It does not mean healthy.",
    permissionDeniedMeaning: "No access means KDiag cannot read this resource kind. Configure read-only access in Settings.",
    systemSettings: "Settings", settingsSubtitle: "Review collection coverage and effective Kubernetes permissions, then generate a manually reviewed read-only RBAC manifest.",
    collector: "Collector", securityBoundary: "Security boundaries", capabilityCoverage: "Coverage",
    dataSource: "Source: {value}", resourceTotal: "Resources: {value}", cacheSync: "Cache sync: {value}",
    secondsAgo: "{value}s ago", notAvailable: "Unknown", secretContent: "Secret content: {value}",
    notCollected: "Not collected", readOnlyPermission: "Kubernetes access: read-only get/list/watch",
    activeProbeOff: "Active probes: off by default", discoveredKinds: "Discovered kinds: {value}",
    namespaces: "Namespaces: {value}", observedCount: "Observed without universal health: {value}",
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
    collectedResources: "{value} collected resources", workloads: "Workloads", servicesNetwork: "Services & network",
    nodes: "Nodes", storage: "Storage"
  }
} as const;

type MessageKey = keyof typeof messages["zh-CN"];
type LanguageContextValue = {
  language: Language;
  setLanguage: (value: Language) => void;
  t: (key: MessageKey, params?: Params) => string;
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
  t: (key, params) => translate("zh-CN", key, params)
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
    t: (key, params) => translate(language, key, params)
  }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
