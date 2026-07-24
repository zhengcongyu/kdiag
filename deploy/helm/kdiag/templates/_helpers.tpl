{{- define "kdiag.name" -}}kdiag{{- end }}
{{- define "kdiag.fullname" -}}{{ printf "%s-kdiag" .Release.Name | trunc 63 | trimSuffix "-" }}{{- end }}
{{- define "kdiag.labels" -}}
app.kubernetes.io/name: {{ include "kdiag.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

