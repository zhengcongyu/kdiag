package diagnosis

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/zhengcongyu/kdiag/internal/rules"
	"github.com/zhengcongyu/kdiag/pkg/model"
)

const EngineVersion = "dag-engine/v1"

type Event struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

type Sink interface {
	Publish(Event)
}

type Node struct {
	Rule      rules.Rule
	DependsOn []string
}

type Engine struct {
	nodes []Node
}

func New(ruleSet []rules.Rule) *Engine {
	nodes := make([]Node, len(ruleSet))
	for i, rule := range ruleSet {
		nodes[i] = Node{Rule: rule}
	}
	return &Engine{nodes: nodes}
}

func (e *Engine) Run(ctx context.Context, task *model.DiagnosisTask, observation rules.Observation, sink Sink) error {
	if sink == nil {
		sink = discardSink{}
	}
	if err := validateDAG(e.nodes); err != nil {
		return err
	}
	now := time.Now().UTC()
	task.Status, task.StartedAt = model.StatusRunning, &now
	sink.Publish(Event{Type: "task_started", Data: *task})
	completed := map[string]bool{}
	for len(completed) < len(e.nodes) {
		progress := false
		for _, node := range e.nodes {
			if completed[node.Rule.ID()] || !dependenciesComplete(node.DependsOn, completed) {
				continue
			}
			if !applies(node.Rule, observation.Resource.Kind) {
				completed[node.Rule.ID()] = true
				progress = true
				continue
			}
			select {
			case <-ctx.Done():
				task.Status = model.StatusCancelled
				sink.Publish(Event{Type: "task_cancelled", Data: task.ID})
				return ctx.Err()
			default:
			}
			stepStarted := time.Now().UTC()
			step := model.DiagnosisStep{ID: task.ID + "/" + node.Rule.ID(), RuleID: node.Rule.ID(), Name: node.Rule.ID(), Status: model.StatusRunning, StartedAt: &stepStarted}
			sink.Publish(Event{Type: "step_started", Data: step})
			result := node.Rule.Evaluate(observation)
			task.Evidence = append(task.Evidence, result.Evidence...)
			if result.Hypothesis != nil {
				task.Hypotheses = append(task.Hypotheses, *result.Hypothesis)
				sink.Publish(Event{Type: "hypothesis_updated", Data: result.Hypothesis})
			}
			for _, item := range result.Evidence {
				sink.Publish(Event{Type: "evidence_added", Data: item})
			}
			finished := time.Now().UTC()
			step.Status, step.CompletedAt, step.Summary = result.Status, &finished, result.Evidence[0].Summary
			task.Steps = append(task.Steps, step)
			sink.Publish(Event{Type: "step_completed", Data: step})
			completed[node.Rule.ID()] = true
			progress = true
		}
		if !progress {
			return errors.New("diagnosis DAG did not make progress")
		}
	}
	finished := time.Now().UTC()
	task.Status, task.FinishedAt = model.StatusCompleted, &finished
	sink.Publish(Event{Type: "diagnosis_completed", Data: *task})
	return nil
}

func validateDAG(nodes []Node) error {
	known := map[string]bool{}
	for _, node := range nodes {
		if known[node.Rule.ID()] {
			return fmt.Errorf("duplicate rule %s", node.Rule.ID())
		}
		known[node.Rule.ID()] = true
	}
	for _, node := range nodes {
		for _, dependency := range node.DependsOn {
			if !known[dependency] {
				return fmt.Errorf("rule %s depends on unknown rule %s", node.Rule.ID(), dependency)
			}
		}
	}
	return nil
}

func dependenciesComplete(dependencies []string, completed map[string]bool) bool {
	for _, dependency := range dependencies {
		if !completed[dependency] {
			return false
		}
	}
	return true
}

func applies(rule rules.Rule, kind string) bool {
	for _, applicable := range rule.ApplicableKinds() {
		if applicable == kind {
			return true
		}
	}
	return false
}

type discardSink struct{}

func (discardSink) Publish(Event) {}
