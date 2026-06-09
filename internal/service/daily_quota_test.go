package service

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

func TestDailyQuotaQueryServiceCachesSuccessfulResult(t *testing.T) {
	now := time.Date(2026, 6, 9, 12, 0, 0, 0, time.UTC)
	calls := 0
	var capturedRequest DailyQuotaCommandRequest
	service := NewDailyQuotaQueryServiceWithOptions(DailyQuotaQueryOptions{
		Command:  "uv run query_amount.py",
		WorkDir:  `G:\CodeLearning\Git\cpa-usage-keeper`,
		CacheTTL: 10 * time.Minute,
		Timeout:  30 * time.Second,
		Now:      func() time.Time { return now },
		Runner: func(_ context.Context, request DailyQuotaCommandRequest) (string, error) {
			calls++
			capturedRequest = request
			if calls == 1 {
				return `{"status":"partial","remaining":135.745766}`, nil
			}
			return `{"status":"ok","remaining":"$42.50"}`, nil
		},
	})

	first := service.GetDailyQuota(context.Background())
	second := service.GetDailyQuota(context.Background())
	now = now.Add(10*time.Minute - time.Nanosecond)
	third := service.GetDailyQuota(context.Background())
	now = now.Add(2 * time.Nanosecond)
	fourth := service.GetDailyQuota(context.Background())

	if first.Status != "ok" || first.Remaining != "135.75" {
		t.Fatalf("expected first response to expose numeric remaining with two decimals, got %+v", first)
	}
	if second != first || third != first {
		t.Fatalf("expected cached response before TTL expiry, got first=%+v second=%+v third=%+v", first, second, third)
	}
	if fourth.Status != "ok" || fourth.Remaining != "42.50" {
		t.Fatalf("expected refreshed response after TTL expiry, got %+v", fourth)
	}
	if calls != 2 {
		t.Fatalf("expected command to run twice after TTL expiry, got %d", calls)
	}
	if capturedRequest.Command != "uv run query_amount.py" || capturedRequest.WorkDir != `G:\CodeLearning\Git\cpa-usage-keeper` || capturedRequest.Timeout != 30*time.Second {
		t.Fatalf("unexpected command request: %+v", capturedRequest)
	}
}

func TestDailyQuotaQueryServiceFormatsRemainingWithTwoDecimals(t *testing.T) {
	for _, testCase := range []struct {
		name   string
		stdout string
		want   string
	}{
		{name: "json number", stdout: `{"remaining":135.745766}`, want: "135.75"},
		{name: "integer number", stdout: `{"remaining":42}`, want: "42.00"},
		{name: "numeric string", stdout: `{"remaining":"42.5"}`, want: "42.50"},
		{name: "dollar-prefixed string", stdout: `{"remaining":"$42.5"}`, want: "42.50"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			service := NewDailyQuotaQueryServiceWithOptions(DailyQuotaQueryOptions{
				Command: "uv run query_amount.py",
				Runner: func(context.Context, DailyQuotaCommandRequest) (string, error) {
					return testCase.stdout, nil
				},
			})

			got := service.GetDailyQuota(context.Background())

			if got.Status != "ok" || got.Remaining != testCase.want {
				t.Fatalf("expected remaining %s, got %+v", testCase.want, got)
			}
		})
	}
}

func TestDailyQuotaQueryServiceCachesFailedResult(t *testing.T) {
	now := time.Date(2026, 6, 9, 12, 0, 0, 0, time.UTC)
	calls := 0
	service := NewDailyQuotaQueryServiceWithOptions(DailyQuotaQueryOptions{
		Command:  "uv run query_amount.py",
		CacheTTL: 10 * time.Minute,
		Now:      func() time.Time { return now },
		Runner: func(context.Context, DailyQuotaCommandRequest) (string, error) {
			calls++
			return `not json`, nil
		},
	})

	first := service.GetDailyQuota(context.Background())
	second := service.GetDailyQuota(context.Background())

	if first.Status != "failed" || first.Remaining != "" || second != first {
		t.Fatalf("expected failed response to be cached, got first=%+v second=%+v", first, second)
	}
	if calls != 1 {
		t.Fatalf("expected failed command result to be cached for the TTL, got %d calls", calls)
	}
}

func TestDailyQuotaQueryServiceTreatsInvalidCommandsAndPayloadsAsFailed(t *testing.T) {
	for _, testCase := range []struct {
		name      string
		command   string
		stdout    string
		err       error
		wantCalls int
	}{
		{name: "empty command", command: " ", stdout: `{"remaining":1}`, wantCalls: 0},
		{name: "command error", command: "uv run query_amount.py", err: errors.New("exit status 1"), wantCalls: 1},
		{name: "invalid json", command: "uv run query_amount.py", stdout: `not json`, wantCalls: 1},
		{name: "multiple json values", command: "uv run query_amount.py", stdout: `{"remaining":1}{"remaining":2}`, wantCalls: 1},
		{name: "missing remaining", command: "uv run query_amount.py", stdout: `{"status":"ok"}`, wantCalls: 1},
		{name: "null remaining", command: "uv run query_amount.py", stdout: `{"remaining":null}`, wantCalls: 1},
		{name: "blank string remaining", command: "uv run query_amount.py", stdout: `{"remaining":"  "}`, wantCalls: 1},
		{name: "non-numeric string remaining", command: "uv run query_amount.py", stdout: `{"remaining":"not a number"}`, wantCalls: 1},
		{name: "nan string remaining", command: "uv run query_amount.py", stdout: `{"remaining":"NaN"}`, wantCalls: 1},
		{name: "infinite string remaining", command: "uv run query_amount.py", stdout: `{"remaining":"Infinity"}`, wantCalls: 1},
		{name: "object remaining", command: "uv run query_amount.py", stdout: `{"remaining":{"value":1}}`, wantCalls: 1},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			calls := 0
			service := NewDailyQuotaQueryServiceWithOptions(DailyQuotaQueryOptions{
				Command: testCase.command,
				Runner: func(context.Context, DailyQuotaCommandRequest) (string, error) {
					calls++
					return testCase.stdout, testCase.err
				},
			})

			got := service.GetDailyQuota(context.Background())

			if got.Status != "failed" || got.Remaining != "" {
				t.Fatalf("expected failed response, got %+v", got)
			}
			if calls != testCase.wantCalls {
				t.Fatalf("expected %d runner calls, got %d", testCase.wantCalls, calls)
			}
		})
	}
}

func TestDailyQuotaQueryServiceRunsOnlyOnceForConcurrentCacheMisses(t *testing.T) {
	var runnerStarted sync.WaitGroup
	runnerStarted.Add(1)
	calls := 0
	service := NewDailyQuotaQueryServiceWithOptions(DailyQuotaQueryOptions{
		Command:  "uv run query_amount.py",
		CacheTTL: 10 * time.Minute,
		Runner: func(context.Context, DailyQuotaCommandRequest) (string, error) {
			calls++
			runnerStarted.Done()
			time.Sleep(10 * time.Millisecond)
			return `{"remaining":7}`, nil
		},
	})

	var wg sync.WaitGroup
	responses := make([]DailyQuotaResponse, 5)
	for i := range responses {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			responses[index] = service.GetDailyQuota(context.Background())
		}(i)
	}
	runnerStarted.Wait()
	wg.Wait()

	for _, response := range responses {
		if response.Status != "ok" || response.Remaining != "7.00" {
			t.Fatalf("expected every response to use cached command result, got %+v", responses)
		}
	}
	if calls != 1 {
		t.Fatalf("expected a single command execution for concurrent cache misses, got %d", calls)
	}
}
