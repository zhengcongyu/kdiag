import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button,
  CircularProgress, Stack, Typography
} from "@mui/material";
import {ContentCopyOutlined, ExpandMore} from "@mui/icons-material";
import {ApiError} from "../api";
import {useLanguage, type Language} from "../i18n";

export function LoadingState({label}: {label?: string}) {
  const {l, localize} = useLanguage();
  return <Box role="status" sx={{display: "flex", gap: 2, alignItems: "center", py: 5}}>
    <CircularProgress size={24} /><Typography>{label ? localize(label) : l("正在加载诊断数据", "Loading diagnosis data")}</Typography>
  </Box>;
}

export function EmptyState({title, detail}: {title: string; detail: string}) {
  return <Box sx={{border: "1px dashed", borderColor: "divider", borderRadius: 2, p: 5}}>
    <Typography variant="h6">{title}</Typography><Typography color="text.secondary">{detail}</Typography>
  </Box>;
}

export function ErrorState({error}: {error: Error}) {
  const {language, l} = useLanguage();
  const guide = errorGuide(error, language);
  const apiError = error instanceof ApiError ? error : undefined;
  return <Stack spacing={1.5}>
    <Alert severity="error">
      <Typography sx={{fontWeight: 700}}>{guide.title}</Typography>
      <Typography>{error.message}</Typography>
      <Typography sx={{mt: 1}}><strong>{l("问题位置", "Problem location")}:</strong> {guide.problemAt}</Typography>
      <Typography><strong>{l("优先检查", "Check first")}:</strong> {guide.firstCheck}</Typography>
      {apiError?.requestId ? <Typography variant="body2" sx={{mt: .5}}>
        Request ID: {apiError.requestId} {l("（提供给平台管理员可快速检索日志）", "(share it with the platform administrator to find the matching logs)")}
      </Typography> : null}
    </Alert>
    <Accordion variant="outlined">
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Typography sx={{fontWeight: 700}}>{l("查看排错指引和建议命令", "Troubleshooting guide and commands")}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1.5}>
          {guide.causes.length ? <Box>
            <Typography sx={{fontWeight: 650}}>{l("可能原因", "Possible causes")}</Typography>
            {guide.causes.map((cause) => <Typography key={cause}>• {cause}</Typography>)}
          </Box> : null}
          {guide.commands.map((item, index) => <Box key={item.command} sx={{
            border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5
          }}>
            <Stack direction={{xs: "column", md: "row"}} justifyContent="space-between" gap={1}>
              <Box>
                <Typography sx={{fontWeight: 650}}>{index + 1}. {item.title}</Typography>
                <Typography variant="body2" color="text.secondary">{item.purpose}</Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                startIcon={<ContentCopyOutlined />}
                aria-label={`${l("复制命令", "Copy command")}: ${item.title}`}
                onClick={() => void navigator.clipboard.writeText(item.command)}
              >{l("复制命令", "Copy command")}</Button>
            </Stack>
            <Box component="pre" sx={{
              p: 1.2, mb: 0, borderRadius: 1.5, bgcolor: "#f5f5f7",
              whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13
            }}>{item.command}</Box>
          </Box>)}
          <Alert severity="info">{l(
            "以上命令均为只读检查，不会修改 Kubernetes 资源。若命令输出包含 Token 或证书，请勿粘贴到公开渠道。",
            "These commands are read-only and do not mutate Kubernetes resources. Do not post output containing tokens or certificates publicly."
          )}</Alert>
        </Stack>
      </AccordionDetails>
    </Accordion>
  </Stack>;
}

interface ErrorGuide {
  title: string;
  problemAt: string;
  firstCheck: string;
  causes: string[];
  commands: {title: string; purpose: string; command: string}[];
}

function errorGuide(error: Error, language: Language): ErrorGuide {
  const p = (zh: string, en: string) => language === "zh-CN" ? zh : en;
  const status = error instanceof ApiError ? error.status : 0;
  const baseCommands = [{
    title: p("确认 KDiag API Pod 状态", "Check the KDiag API Pod"),
    purpose: p("检查 API 是否 Running/Ready，以及是否发生重启。", "Check whether the API is Running/Ready and whether it restarted."),
    command: "kubectl -n kdiag get pods -l app.kubernetes.io/component=api -o wide"
  }, {
    title: p("查看 KDiag API 最近日志", "Read recent KDiag API logs"),
    purpose: p("结合页面上的 Request ID 查找同一请求的服务端错误。", "Use the Request ID from the page to find the matching server-side error."),
    command: "kubectl -n kdiag logs -l app.kubernetes.io/component=api --all-containers --tail=100"
  }];
  if (status === 401 || status === 403) {
    return {
      title: p("当前身份没有读取这些数据的权限", "The current identity cannot read this data"),
      problemAt: p("浏览器 → KDiag API 鉴权/RBAC", "Browser → KDiag API authentication/RBAC"),
      firstCheck: p("确认当前身份和 KDiag ServiceAccount 是否拥有目标资源的 get/list/watch 权限。",
        "Verify that the current identity and KDiag ServiceAccount have get/list/watch access to the target resource."),
      causes: [
        p("Kubernetes RBAC 权限不足", "Insufficient Kubernetes RBAC access"),
        p("身份认证代理没有传递有效身份", "The authentication proxy did not forward a valid identity"),
        p("访问了无权读取的 Namespace", "The identity cannot read the target Namespace")
      ],
      commands: [{
        title: p("验证只读权限", "Verify read-only access"),
        purpose: p("检查当前 kubectl 身份是否能读取集群 Pod。", "Check whether the current kubectl identity can read Pods."),
        command: "kubectl auth can-i get pods --all-namespaces"
      }, ...baseCommands]
    };
  }
  if (status === 404) {
    return {
      title: p("请求的报告或资源不存在", "The requested report or resource does not exist"),
      problemAt: p("KDiag API → 资源/诊断任务查询", "KDiag API → resource or diagnosis lookup"),
      firstCheck: p("确认对象是否已删除、API 是否重启，以及页面链接中的任务 ID 是否仍有效。",
        "Check whether the object was deleted, the API restarted, or the task ID in the URL is no longer valid."),
      causes: [
        p("资源已删除或重建，UID 已变化", "The resource was deleted or recreated with a new UID"),
        p("内存存储模式下 API 重启导致历史任务丢失", "An API restart cleared history stored only in memory"),
        p("链接中的任务 ID 不正确", "The task ID in the URL is invalid")
      ],
      commands: baseCommands
    };
  }
  if (status >= 500 || status === 0) {
    return {
      title: status === 0 ? p("浏览器无法连接 KDiag API", "The browser cannot reach the KDiag API")
        : p("KDiag API 处理请求失败", "The KDiag API failed to process the request"),
      problemAt: status === 0 ? p("浏览器 → KDiag Web/API 网络链路", "Browser → KDiag Web/API network path")
        : p("KDiag API → Kubernetes/PostgreSQL/内部诊断", "KDiag API → Kubernetes/PostgreSQL/diagnosis engine"),
      firstCheck: p("先确认 API Pod Ready 和日志；随后检查 Kubernetes 连接与数据库连接。",
        "Check API Pod readiness and logs first, then verify Kubernetes and database connectivity."),
      causes: [
        p("API Pod 未就绪或正在重启", "The API Pod is not ready or is restarting"),
        p("Kubernetes Informer 尚未同步或连接中断", "The Kubernetes informer is not synced or disconnected"),
        p("数据库连接异常", "The database connection failed"),
        p("浏览器到 NodePort/Ingress 的网络不可达", "The browser cannot reach the NodePort or Ingress")
      ],
      commands: baseCommands
    };
  }
  return {
    title: p("数据请求未完成", "The data request did not complete"),
    problemAt: p("KDiag Web → API 请求参数或目标资源", "KDiag Web → API parameters or target resource"),
    firstCheck: p("确认筛选条件和目标资源仍然存在，再根据错误详情检查 API 日志。",
      "Verify the filters and target resource, then inspect API logs using the error details."),
    causes: [
      p("请求参数无效", "Invalid request parameters"),
      p("目标资源已发生变化", "The target resource changed"),
      p("诊断所需数据尚未同步", "Required diagnosis data is not synced")
    ],
    commands: baseCommands
  };
}
