package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	DailyQuotaStatusOK     = "ok"
	DailyQuotaStatusFailed = "failed"
)

const (
	defaultDailyQuotaCacheTTL = 10 * time.Minute
	defaultDailyQuotaTimeout  = 30 * time.Second
)

type DailyQuotaProvider interface {
	GetDailyQuota(context.Context) DailyQuotaResponse
}

type DailyQuotaResponse struct {
	Status    string `json:"status"`
	Remaining string `json:"remaining,omitempty"`
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
	remaining, err := parseDailyQuotaRemaining(stdout)
	if err != nil {
		return DailyQuotaResponse{Status: DailyQuotaStatusFailed}
	}
	return DailyQuotaResponse{Status: DailyQuotaStatusOK, Remaining: remaining}
}

func parseDailyQuotaRemaining(stdout string) (string, error) {
	trimmed := strings.TrimSpace(stdout)
	if trimmed == "" {
		return "", fmt.Errorf("daily quota query returned empty output")
	}

	decoder := json.NewDecoder(strings.NewReader(trimmed))
	decoder.UseNumber()
	var payload map[string]any
	if err := decoder.Decode(&payload); err != nil {
		return "", fmt.Errorf("decode daily quota query response: %w", err)
	}
	if decoder.More() {
		return "", fmt.Errorf("daily quota query response contains multiple JSON values")
	}

	value, ok := payload["remaining"]
	if !ok || value == nil {
		return "", fmt.Errorf("daily quota remaining is missing")
	}
	switch typed := value.(type) {
	case json.Number:
		return formatDailyQuotaRemaining(typed.String())
	case string:
		remaining := strings.TrimSpace(typed)
		remaining = strings.TrimSpace(strings.TrimPrefix(remaining, "$"))
		return formatDailyQuotaRemaining(remaining)
	default:
		return "", fmt.Errorf("daily quota remaining has unsupported type")
	}
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
