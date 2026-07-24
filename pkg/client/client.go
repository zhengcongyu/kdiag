package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/zhengcongyu/kdiag/internal/network"
	"github.com/zhengcongyu/kdiag/pkg/model"
)

type Client struct {
	baseURL string
	http    *http.Client
}

func New(baseURL string, httpClient *http.Client) (*Client, error) {
	baseURL = strings.TrimRight(baseURL, "/")
	parsed, err := url.Parse(baseURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return nil, fmt.Errorf("invalid API URL")
	}
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &Client{baseURL: baseURL, http: httpClient}, nil
}

func (c *Client) Health(ctx context.Context) error {
	var value map[string]any
	return c.do(ctx, http.MethodGet, "/api/v1/health", nil, &value)
}

func (c *Client) Diagnose(ctx context.Context, target model.ResourceRef) (model.DiagnosisTask, error) {
	var task model.DiagnosisTask
	err := c.do(ctx, http.MethodPost, "/api/v1/diagnoses", map[string]any{"target": target}, &task)
	return task, err
}

func (c *Client) NetworkDiagnose(ctx context.Context, request network.Request) (model.DiagnosisTask, error) {
	var task model.DiagnosisTask
	body := map[string]any{
		"cluster": request.Cluster, "namespace": request.Namespace, "source": request.Source,
		"service": request.Service, "port": request.Port, "protocol": request.Protocol,
		"activeProbe": request.ActiveProbe,
	}
	err := c.do(ctx, http.MethodPost, "/api/v1/network-diagnoses", body, &task)
	return task, err
}

func (c *Client) Task(ctx context.Context, id string) (model.DiagnosisTask, error) {
	var task model.DiagnosisTask
	err := c.do(ctx, http.MethodGet, "/api/v1/diagnoses/"+url.PathEscape(id), nil, &task)
	return task, err
}

func (c *Client) Replay(ctx context.Context, id string) (model.DiagnosisTask, error) {
	var task model.DiagnosisTask
	err := c.do(ctx, http.MethodPost, "/api/v1/replays/"+url.PathEscape(id), map[string]any{}, &task)
	return task, err
}

func (c *Client) do(ctx context.Context, method, path string, body, result any) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}
	request, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := c.http.Do(request)
	if err != nil {
		return fmt.Errorf("API request failed: %w", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var apiError struct {
			Error struct{ Code, Message string }
		}
		_ = json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&apiError)
		if apiError.Error.Message == "" {
			apiError.Error.Message = response.Status
		}
		return fmt.Errorf("%s: %s", apiError.Error.Code, apiError.Error.Message)
	}
	if result == nil || response.StatusCode == http.StatusNoContent {
		return nil
	}
	return json.NewDecoder(io.LimitReader(response.Body, 4<<20)).Decode(result)
}
