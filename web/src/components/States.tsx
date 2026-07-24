import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button,
  CircularProgress, Stack, Typography
} from "@mui/material";
import {ContentCopyOutlined, ExpandMore} from "@mui/icons-material";
import {ApiError} from "../api";

export function LoadingState({label = "正在加载诊断数据"}: {label?: string}) {
  return <Box role="status" sx={{display: "flex", gap: 2, alignItems: "center", py: 5}}>
    <CircularProgress size={24} /><Typography>{label}</Typography>
  </Box>;
}

export function EmptyState({title, detail}: {title: string; detail: string}) {
  return <Box sx={{border: "1px dashed", borderColor: "divider", borderRadius: 2, p: 5}}>
    <Typography variant="h6">{title}</Typography><Typography color="text.secondary">{detail}</Typography>
  </Box>;
}

export function ErrorState({error}: {error: Error}) {
  const guide = errorGuide(error);
  const apiError = error instanceof ApiError ? error : undefined;
  return <Stack spacing={1.5}>
    <Alert severity="error">
      <Typography sx={{fontWeight: 700}}>{guide.title}</Typography>
      <Typography>{error.message}</Typography>
      <Typography sx={{mt: 1}}><strong>问题位置：</strong>{guide.problemAt}</Typography>
      <Typography><strong>优先检查：</strong>{guide.firstCheck}</Typography>
      {apiError?.requestId ? <Typography variant="body2" sx={{mt: .5}}>
        Request ID：{apiError.requestId}（提供给平台管理员可快速检索日志）
      </Typography> : null}
    </Alert>
    <Accordion variant="outlined">
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Typography sx={{fontWeight: 700}}>查看排错指引和建议命令</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1.5}>
          {guide.causes.length ? <Box>
            <Typography sx={{fontWeight: 650}}>可能原因</Typography>
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
                aria-label={`复制命令：${item.title}`}
                onClick={() => void navigator.clipboard.writeText(item.command)}
              >复制命令</Button>
            </Stack>
            <Box component="pre" sx={{
              p: 1.2, mb: 0, borderRadius: 1.5, bgcolor: "#f5f5f7",
              whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13
            }}>{item.command}</Box>
          </Box>)}
          <Alert severity="info">以上命令均为只读检查，不会修改 Kubernetes 资源。若命令输出包含 Token 或证书，请勿粘贴到公开渠道。</Alert>
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

function errorGuide(error: Error): ErrorGuide {
  const status = error instanceof ApiError ? error.status : 0;
  const baseCommands = [{
    title: "确认 KDiag API Pod 状态",
    purpose: "检查 API 是否 Running/Ready，以及是否发生重启。",
    command: "kubectl -n kdiag get pods -l app.kubernetes.io/component=api -o wide"
  }, {
    title: "查看 KDiag API 最近日志",
    purpose: "结合页面上的 Request ID 查找同一请求的服务端错误。",
    command: "kubectl -n kdiag logs -l app.kubernetes.io/component=api --all-containers --tail=100"
  }];
  if (status === 401 || status === 403) {
    return {
      title: "当前身份没有读取这些数据的权限",
      problemAt: "浏览器 → KDiag API 鉴权/RBAC",
      firstCheck: "确认当前身份和 KDiag ServiceAccount 是否拥有目标资源的 get/list/watch 权限。",
      causes: ["Kubernetes RBAC 权限不足", "身份认证代理没有传递有效身份", "访问了无权读取的 Namespace"],
      commands: [{
        title: "验证只读权限",
        purpose: "检查当前 kubectl 身份是否能读取集群 Pod。",
        command: "kubectl auth can-i get pods --all-namespaces"
      }, ...baseCommands]
    };
  }
  if (status === 404) {
    return {
      title: "请求的报告或资源不存在",
      problemAt: "KDiag API → 资源/诊断任务查询",
      firstCheck: "确认对象是否已删除、API 是否重启，以及页面链接中的任务 ID 是否仍有效。",
      causes: ["资源已删除或重建，UID 已变化", "内存存储模式下 API 重启导致历史任务丢失", "链接中的任务 ID 不正确"],
      commands: baseCommands
    };
  }
  if (status >= 500 || status === 0) {
    return {
      title: status === 0 ? "浏览器无法连接 KDiag API" : "KDiag API 处理请求失败",
      problemAt: status === 0 ? "浏览器 → KDiag Web/API 网络链路" : "KDiag API → Kubernetes/PostgreSQL/内部诊断",
      firstCheck: "先确认 API Pod Ready 和日志；随后检查 Kubernetes 连接与数据库连接。",
      causes: ["API Pod 未就绪或正在重启", "Kubernetes Informer 尚未同步或连接中断", "数据库连接异常", "浏览器到 NodePort/Ingress 的网络不可达"],
      commands: baseCommands
    };
  }
  return {
    title: "数据请求未完成",
    problemAt: "KDiag Web → API 请求参数或目标资源",
    firstCheck: "确认筛选条件和目标资源仍然存在，再根据错误详情检查 API 日志。",
    causes: ["请求参数无效", "目标资源已发生变化", "诊断所需数据尚未同步"],
    commands: baseCommands
  };
}
