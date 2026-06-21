package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	DailyQuotaStatusOK      = "ok"
	DailyQuotaStatusPartial = "partial"
	DailyQuotaStatusFailed  = "failed"
)

const (
	defaultDailyQuotaCacheTTL = 10 * time.Minute
	defaultDailyQuotaTimeout  = 30 * time.Second
)

type DailyQuotaProvider interface {
	GetDailyQuota(context.Context) DailyQuotaResponse
}

type DailyQuotaResponse struct {
	Status       string            `json:"status"`
	DailyRefresh DailyQuotaBalance `json:"daily_refresh,omitempty"`
	PayAsYouGo   DailyQuotaBalance `json:"pay_as_you_go,omitempty"`
}

type DailyQuotaBalance struct {
	Status    string `json:"status"`
	Remaining string `json:"remaining,omitempty"`
}

func (r DailyQuotaResponse) MarshalJSON() ([]byte, error) {
	type dailyQuotaResponseJSON struct {
		Status       string             `json:"status"`
		DailyRefresh *DailyQuotaBalance `json:"daily_refresh,omitempty"`
		PayAsYouGo   *DailyQuotaBalance `json:"pay_as_you_go,omitempty"`
	}
	payload := dailyQuotaResponseJSON{Status: r.Status}
	if r.DailyRefresh.Status != "" {
		payload.DailyRefresh = &r.DailyRefresh
	}
	if r.PayAsYouGo.Status != "" {
		payload.PayAsYouGo = &r.PayAsYouGo
	}
	return json.Marshal(payload)
}

type DailyQuotaCommandRequest struct {
	Command string
	WorkDir string
	Timeout time.Duration
}

type DailyQuotaCommandRunner func(context.Context, DailyQuotaCommandRequest) (string, error)

type DailyQuotaQueryOptions struct {
	Command  string
	WorkDir  string
	CacheTTL time.Duration
	Timeout  time.Duration
	Now      func() time.Time
	Runner   DailyQuotaCommandRunner
}

type DailyQuotaQueryService struct {
	command  string
	workDir  string
	cacheTTL time.Duration
	timeout  time.Duration
	now      func() time.Time
	runner   DailyQuotaCommandRunner

	mu           sync.Mutex
	cached       DailyQuotaResponse
	cacheExpires time.Time
}

func NewDailyQuotaQueryService(command, workDir string, cacheTTL ...time.Duration) DailyQuotaProvider {
	ttl := time.Duration(0)
	if len(cacheTTL) > 0 {
		ttl = cacheTTL[0]
	}
	return NewDailyQuotaQueryServiceWithOptions(DailyQuotaQueryOptions{
		Command:  command,
		WorkDir:  workDir,
		CacheTTL: ttl,
	})
}

func NewDailyQuotaQueryServiceWithOptions(options DailyQuotaQueryOptions) *DailyQuotaQueryService {
	cacheTTL := options.CacheTTL
	if cacheTTL <= 0 {
		cacheTTL = defaultDailyQuotaCacheTTL
	}
	timeout := options.Timeout
	if timeout <= 0 {
		timeout = defaultDailyQuotaTimeout
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	runner := options.Runner
	if runner == nil {
		runner = runDailyQuotaCommand
	}
	return &DailyQuotaQueryService{
		command:  strings.TrimSpace(options.Command),
		workDir:  strings.TrimSpace(options.WorkDir),
		cacheTTL: cacheTTL,
		timeout:  timeout,
		now:      now,
		runner:   runner,
	}
}

func (s *DailyQuotaQueryService) GetDailyQuota(ctx context.Context) DailyQuotaResponse {
	if s == nil || strings.TrimSpace(s.command) == "" {
		return DailyQuotaResponse{Status: DailyQuotaStatusFailed}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	currentTime := s.now()
	if !s.cacheExpires.IsZero() && currentTime.Before(s.cacheExpires) {
		return s.cached
	}

	result := s.query(ctx)
	s.cached = result
	s.cacheExpires = currentTime.Add(s.cacheTTL)
	return result
}

func (s *DailyQuotaQueryService) query(ctx context.Context) DailyQuotaResponse {
	stdout, err := s.runner(ctx, DailyQuotaCommandRequest{
		Command: s.command,
		WorkDir: s.workDir,
		Timeout: s.timeout,
	})
	if err != nil {
		return DailyQuotaResponse{Status: DailyQuotaStatusFailed}
	}
	result, err := parseDailyQuotaResponse(stdout)
	if err != nil {
		return DailyQuotaResponse{Status: DailyQuotaStatusFailed}
	}
	return result
}

func parseDailyQuotaResponse(stdout string) (DailyQuotaResponse, error) {
	trimmed := strings.TrimSpace(stdout)
	if trimmed == "" {
		return DailyQuotaResponse{}, fmt.Errorf("daily quota query returned empty output")
	}

	decoder := json.NewDecoder(strings.NewReader(trimmed))
	decoder.UseNumber()
	var payload map[string]json.RawMessage
	if err := decoder.Decode(&payload); err != nil {
		return DailyQuotaResponse{}, fmt.Errorf("decode daily quota query response: %w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return DailyQuotaResponse{}, fmt.Errorf("daily quota query response contains multiple JSON values")
	}

	dailyRaw, ok := payload["daily_refresh"]
	if !ok {
		return DailyQuotaResponse{}, fmt.Errorf("daily refresh balance is missing")
	}
	payAsYouGoRaw, ok := payload["pay_as_you_go"]
	if !ok {
		return DailyQuotaResponse{}, fmt.Errorf("pay-as-you-go balance is missing")
	}
	dailyRefresh, err := parseDailyQuotaBalance(dailyRaw, "daily_refresh")
	if err != nil {
		return DailyQuotaResponse{}, err
	}
	payAsYouGo, err := parseDailyQuotaBalance(payAsYouGoRaw, "pay_as_you_go")
	if err != nil {
		return DailyQuotaResponse{}, err
	}
	return DailyQuotaResponse{
		Status:       calculateDailyQuotaStatus(dailyRefresh, payAsYouGo),
		DailyRefresh: dailyRefresh,
		PayAsYouGo:   payAsYouGo,
	}, nil
}

func parseDailyQuotaBalance(raw json.RawMessage, fieldName string) (DailyQuotaBalance, error) {
	if len(raw) == 0 || strings.TrimSpace(string(raw)) == "null" {
		return DailyQuotaBalance{}, fmt.Errorf("%s balance is missing", fieldName)
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	var payload map[string]any
	if err := decoder.Decode(&payload); err != nil {
		return DailyQuotaBalance{}, fmt.Errorf("decode %s balance: %w", fieldName, err)
	}
	status, ok := payload["status"].(string)
	if !ok {
		return DailyQuotaBalance{}, fmt.Errorf("%s status is missing", fieldName)
	}
	status = strings.TrimSpace(status)
	switch status {
	case DailyQuotaStatusOK, DailyQuotaStatusPartial:
		remaining, err := parseDailyQuotaRemainingValue(payload["remaining"], fieldName)
		if err != nil {
			return DailyQuotaBalance{}, err
		}
		return DailyQuotaBalance{Status: status, Remaining: remaining}, nil
	case DailyQuotaStatusFailed:
		return DailyQuotaBalance{Status: DailyQuotaStatusFailed}, nil
	default:
		return DailyQuotaBalance{}, fmt.Errorf("%s status is unsupported", fieldName)
	}
}

func parseDailyQuotaRemainingValue(value any, fieldName string) (string, error) {
	if value == nil {
		return "", fmt.Errorf("%s remaining is missing", fieldName)
	}
	switch typed := value.(type) {
	case json.Number:
		return formatDailyQuotaRemaining(typed.String())
	case string:
		remaining := strings.TrimSpace(typed)
		remaining = strings.TrimSpace(strings.TrimPrefix(remaining, "$"))
		return formatDailyQuotaRemaining(remaining)
	default:
		return "", fmt.Errorf("%s remaining has unsupported type", fieldName)
	}
}

func calculateDailyQuotaStatus(dailyRefresh DailyQuotaBalance, payAsYouGo DailyQuotaBalance) string {
	if dailyRefresh.Status == DailyQuotaStatusOK && payAsYouGo.Status == DailyQuotaStatusOK {
		return DailyQuotaStatusOK
	}
	if dailyRefresh.Status == DailyQuotaStatusFailed && payAsYouGo.Status == DailyQuotaStatusFailed {
		return DailyQuotaStatusFailed
	}
	return DailyQuotaStatusPartial
}

func formatDailyQuotaRemaining(value string) (string, error) {
	remaining := strings.TrimSpace(value)
	if remaining == "" {
		return "", fmt.Errorf("daily quota remaining is empty")
	}
	parsed, err := strconv.ParseFloat(remaining, 64)
	if err != nil {
		return "", fmt.Errorf("daily quota remaining must be numeric: %w", err)
	}
	if math.IsNaN(parsed) || math.IsInf(parsed, 0) {
		return "", fmt.Errorf("daily quota remaining must be finite")
	}
	return strconv.FormatFloat(parsed, 'f', 2, 64), nil
}

func runDailyQuotaCommand(ctx context.Context, request DailyQuotaCommandRequest) (string, error) {
	command := strings.TrimSpace(request.Command)
	if command == "" {
		return "", fmt.Errorf("daily quota query command is required")
	}
	timeout := request.Timeout
	if timeout <= 0 {
		timeout = defaultDailyQuotaTimeout
	}
	commandCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(commandCtx, "cmd.exe", "/C", command)
	} else {
		cmd = exec.CommandContext(commandCtx, "sh", "-c", command)
	}
	if strings.TrimSpace(request.WorkDir) != "" {
		cmd.Dir = strings.TrimSpace(request.WorkDir)
	}

	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	output, err := cmd.Output()
	if commandCtx.Err() != nil {
		return "", commandCtx.Err()
	}
	if err != nil {
		if stderr.Len() > 0 {
			return "", fmt.Errorf("run daily quota query command: %w: %s", err, strings.TrimSpace(stderr.String()))
		}
		return "", fmt.Errorf("run daily quota query command: %w", err)
	}
	return string(output), nil
}
