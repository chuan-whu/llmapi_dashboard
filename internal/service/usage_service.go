package service

import (
	"context"
	"errors"

	servicedto "llmapi-dashboard/internal/service/dto"
)

var ErrInvalidID = errors.New("invalid id")

type UsageProvider interface {
	GetUsageOverview(context.Context, servicedto.UsageFilter) (*servicedto.UsageOverviewSnapshot, error)
	ListUsageEvents(context.Context, servicedto.UsageFilter) (*servicedto.UsageEventsPage, error)
	ListUsageEventFilterOptions(context.Context, servicedto.UsageFilter) (*servicedto.UsageEventFilterOptions, error)
	GetAnalysis(context.Context, servicedto.UsageFilter) (*servicedto.AnalysisSnapshot, error)
}
