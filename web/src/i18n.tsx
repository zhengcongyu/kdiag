/* eslint-disable react-refresh/only-export-components */
import {createContext, useContext, useEffect, useMemo, useState} from "react";
import type {ReactNode} from "react";

export type Language = "zh-CN" | "en";
type Params = Record<string, string | number>;

const messages = {
  "zh-CN": {
    cluster: "????", diagnose: "????", incidents: "????", network: "????",
    replay: "?????", overview: "????", policies: "?????", reports: "????",
    topology: "????", settings: "????", connected: "???", syncing: "???",
    unavailable: "?????", language: "??", chinese: "??", english: "English",
    clusterHealth: "??????", clusterHealthSubtitle: "????????????????? Kubernetes ?????",
    critical: "??", warning: "??", unknown: "????", observed: "???", healthy: "??",
    collectedMeaning: "?????????????????????? Condition????????",
    permissionDeniedMeaning: "????? KDiag ????????????????????????",
    systemSettings: "????", settingsSubtitle: "????????? Kubernetes ????????????????????",
    collector: "???", securityBoundary: "????", capabilityCoverage: "????",
    dataSource: "????{value}", resourceTotal: "?????{value}", cacheSync: "?????{value}",
    secondsAgo: "{value} ??", notAvailable: "??", secretContent: "Secret ???{value}",
    notCollected: "???", readOnlyPermission: "Kubernetes ????? get/list/watch",
    activeProbeOff: "?????????", discoveredKinds: "????????{value}",
    namespaces: "Namespace?{value}", observedCount: "????????????{value}",
    accessTitle: "Kubernetes ????", accessComplete: "?????????", accessPartial: "?????????",
    accessUnavailable: "??????", permissionMatrix: "????", kind: "????",
    scope: "??", verbs: "get / list / watch", status: "??", allowed: "???", denied: "???",
    clusterScoped: "???", namespaced: "?????", generateRBAC: "????????",
    refreshPermissions: "????", copyManifest: "?? YAML", copyCommand: "??????",
    rbacHelp: "KDiag ???????????????? YAML ????????? API Pod ????????",
    rbacWarning: "??????? get/list/watch ????????? Secret????????????",
    manifestReady: "?? RBAC ?????", noIssueIncident: "???????? Incident",
    incidentZero: "Incident ? 0 ???????????????????????????",
    currentPriority: "???????", healthDistribution: "??????",
    collectedResources: "{value} ??????", workloads: "????", servicesNetwork: "?????",
    nodes: "??", storage: "??"
  },
  en: {
    cluster: "Cluster", diagnose: "Smart Diagnosis", incidents: "Issues", network: "Network Path",
    replay: "Replay", overview: "Overview", policies: "Policies & Alerts", reports: "Reports",
    topology: "Topology", settings: "Settings", connected: "Connected", syncing: "Syncing",
    unavailable: "Unavailable", language: "Language", chinese: "??", english: "English",
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
