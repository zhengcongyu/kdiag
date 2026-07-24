package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/zhengcongyu/kdiag/internal/network"
	kdiagclient "github.com/zhengcongyu/kdiag/pkg/client"
	"github.com/zhengcongyu/kdiag/pkg/model"
)

var errUsage = errors.New("usage")

type commonFlags struct {
	server  string
	output  string
	timeout time.Duration
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		if !errors.Is(err, errUsage) {
			fmt.Fprintln(os.Stderr, "kdiag:", err)
		}
		os.Exit(2)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		printUsage()
		return errUsage
	}
	switch args[0] {
	case "doctor":
		return doctor(args[1:])
	case "why":
		return why(args[1:])
	case "trace":
		return trace(args[1:])
	case "replay":
		return replay(args[1:])
	case "help", "-h", "--help":
		printUsage()
		return nil
	default:
		printUsage()
		return fmt.Errorf("%w: unknown command %q", errUsage, args[0])
	}
}

func common(set *flag.FlagSet) *commonFlags {
	flags := &commonFlags{}
	defaultServer := os.Getenv("KDIAG_SERVER")
	if defaultServer == "" {
		defaultServer = "http://localhost:8080"
	}
	set.StringVar(&flags.server, "server", defaultServer, "KDiag API Server URL")
	set.StringVar(&flags.output, "output", "table", "Output: table or json")
	set.DurationVar(&flags.timeout, "timeout", 30*time.Second, "Request timeout")
	return flags
}

func doctor(args []string) error {
	set := flag.NewFlagSet("doctor", flag.ContinueOnError)
	flags := common(set)
	if err := set.Parse(args); err != nil {
		return errUsage
	}
	ctx, cancel := context.WithTimeout(context.Background(), flags.timeout)
	defer cancel()
	client, err := newClient(flags)
	if err != nil {
		return err
	}
	if err := client.Health(ctx); err != nil {
		return err
	}
	fmt.Println("OK\tKDiag API is reachable and healthy")
	return nil
}

func why(args []string) error {
	set := flag.NewFlagSet("why", flag.ContinueOnError)
	flags := common(set)
	namespace := set.String("n", "default", "Namespace")
	if err := set.Parse(args); err != nil || set.NArg() != 1 {
		return fmt.Errorf("%w: kdiag why kind/name [-n namespace]", errUsage)
	}
	parts := strings.SplitN(set.Arg(0), "/", 2)
	if len(parts) != 2 || parts[1] == "" {
		return fmt.Errorf("%w: resource must be kind/name", errUsage)
	}
	kind := canonicalKind(parts[0])
	if kind == "" {
		return fmt.Errorf("supported kinds: deployment, pod, service, node, pvc")
	}
	target := model.ResourceRef{Cluster: "default", Kind: kind, Namespace: *namespace, Name: parts[1]}
	ctx, cancel := context.WithTimeout(context.Background(), flags.timeout)
	defer cancel()
	client, err := newClient(flags)
	if err != nil {
		return err
	}
	task, err := client.Diagnose(ctx, target)
	if err != nil {
		return err
	}
	task, err = waitTask(ctx, client, task)
	if err != nil {
		return err
	}
	return printTask(task, flags.output)
}

func trace(args []string) error {
	set := flag.NewFlagSet("trace", flag.ContinueOnError)
	flags := common(set)
	from := set.String("from", "", "Source Pod or Deployment")
	to := set.String("to", "", "Target Service as name:port")
	namespace := set.String("n", "default", "Namespace")
	protocol := set.String("protocol", "TCP", "TCP or HTTP")
	active := set.Bool("active-probe", false, "Enable an allow-listed active probe if the server permits it")
	if err := set.Parse(args); err != nil || *from == "" || *to == "" {
		return fmt.Errorf("%w: kdiag trace --from source --to service:port [-n namespace]", errUsage)
	}
	service, port, ok := strings.Cut(*to, ":")
	portNumber, err := strconv.ParseInt(port, 10, 32)
	if !ok || err != nil || portNumber < 1 || portNumber > 65535 {
		return fmt.Errorf("target must be service:port with a valid port")
	}
	request := network.Request{
		Cluster: "default", Namespace: *namespace, Source: *from, Service: service,
		Port: int32(portNumber), Protocol: network.Protocol(strings.ToUpper(*protocol)), ActiveProbe: *active,
	}
	ctx, cancel := context.WithTimeout(context.Background(), flags.timeout)
	defer cancel()
	client, err := newClient(flags)
	if err != nil {
		return err
	}
	task, err := client.NetworkDiagnose(ctx, request)
	if err != nil {
		return err
	}
	task, err = waitTask(ctx, client, task)
	if err != nil {
		return err
	}
	return printTask(task, flags.output)
}

func replay(args []string) error {
	set := flag.NewFlagSet("replay", flag.ContinueOnError)
	flags := common(set)
	if err := set.Parse(args); err != nil || set.NArg() != 1 {
		return fmt.Errorf("%w: kdiag replay incident-id", errUsage)
	}
	ctx, cancel := context.WithTimeout(context.Background(), flags.timeout)
	defer cancel()
	client, err := newClient(flags)
	if err != nil {
		return err
	}
	task, err := client.Replay(ctx, set.Arg(0))
	if err != nil {
		return err
	}
	return printTask(task, flags.output)
}

func newClient(flags *commonFlags) (*kdiagclient.Client, error) {
	if flags.output != "table" && flags.output != "json" {
		return nil, fmt.Errorf("output must be table or json")
	}
	return kdiagclient.New(flags.server, &http.Client{Timeout: flags.timeout})
}

func waitTask(ctx context.Context, client *kdiagclient.Client, task model.DiagnosisTask) (model.DiagnosisTask, error) {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for task.Status == model.StatusPending || task.Status == model.StatusRunning {
		select {
		case <-ctx.Done():
			return task, fmt.Errorf("diagnosis timed out: %w", ctx.Err())
		case <-ticker.C:
			current, err := client.Task(ctx, task.ID)
			if err != nil {
				return task, err
			}
			task = current
		}
	}
	if task.Status == model.StatusFailed || task.Status == model.StatusCancelled {
		return task, fmt.Errorf("diagnosis ended with status %s: %s", task.Status, task.Error)
	}
	return task, nil
}

func printTask(task model.DiagnosisTask, output string) error {
	if output == "json" {
		encoder := json.NewEncoder(os.Stdout)
		encoder.SetIndent("", "  ")
		return encoder.Encode(task)
	}
	writer := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
	_, _ = fmt.Fprintf(writer, "任务\t状态\t目标\n%s\t%s\t%s/%s\n\n", task.ID, task.Status, task.Target.Kind, task.Target.Name)
	if task.Report != nil {
		_, _ = fmt.Fprintf(writer, "结论\t%s\n影响\t%s\n定位\t%s\n根因\t%s\n\n",
			task.Report.Headline, task.Report.Impact, task.Report.BlockedAt, task.Report.RootCause)
		_, _ = fmt.Fprintf(writer, "已确认问题\t%d\n疑似问题\t%d\n正常检查\t%d\n未验证\t%d\n\n",
			len(task.Report.ConfirmedIssues), len(task.Report.SuspectedIssues),
			len(task.Report.HealthyChecks), len(task.Report.UnknownChecks))
	}
	_, _ = fmt.Fprintln(writer, "检查步骤\t结果\t摘要")
	for _, step := range task.Steps {
		_, _ = fmt.Fprintf(writer, "%s\t%s\t%s\n", step.Name, step.Outcome, step.Summary)
	}
	_ = writer.Flush()
	missing := 0
	for _, evidence := range task.Evidence {
		if evidence.Role == model.EvidenceMissing {
			missing++
		}
	}
	if missing > 0 {
		fmt.Printf("\n能力覆盖：仍缺少 %d 项必要证据；这不能解释为资源正常。\n", missing)
	}
	return nil
}

func canonicalKind(value string) string {
	switch strings.ToLower(value) {
	case "deployment", "deploy":
		return "Deployment"
	case "pod":
		return "Pod"
	case "service", "svc":
		return "Service"
	case "node":
		return "Node"
	case "pvc", "persistentvolumeclaim":
		return "PersistentVolumeClaim"
	default:
		return ""
	}
}

func printUsage() {
	fmt.Fprintln(os.Stderr, `KDiag CLI
  kdiag doctor [--server URL]
  kdiag why service/payment -n production [--output table|json]
  kdiag why pod/payment-xxx -n production
  kdiag trace --from frontend --to payment:8080 -n production
  kdiag replay <incident-id>`)
}
