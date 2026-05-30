import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCustomDateRangeQuery,
  getBackToCPALinkURL,
  getCredentialSectionVisibility,
  getCustomDateRangeBounds,
  getOverviewChartEndMs,
  getOverviewDisplayLoading,
  getOverviewHourWindowHours,
  getPreferredOverviewChartPeriod,
  getTimeRangeOptions,
  getUsageTabOptions,
  getApiKeySelectOptions,
  isCustomDateWithinBounds,
  isUsagePageVisible,
  normalizeUsageTabValue,
  openDateInputPicker,
  refreshPageData,
  sanitizeRequestEventFilters,
  scheduleOverviewAutoRefresh,
  scheduleStatusActiveHeartbeat,
  shouldAutoRefreshUsageTab,
  shouldLoadPricingOnUsageTabEntry,
  shouldShowApiKeyFilter,
  shouldShowRangeControls,
  shouldShowUpdateCheckButton,
  pricingEntriesToModelPriceMap,
} from './UsagePage';
import type { UsageFilterWindow } from '@/lib/types';

const createAutoRefreshTestDocument = (visibilityState: DocumentVisibilityState = 'visible') => {
  const target = new EventTarget();
  return {
    get visibilityState() {
      return visibilityState;
    },
    setVisibilityState(nextVisibilityState: DocumentVisibilityState) {
      visibilityState = nextVisibilityState;
    },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('UsagePage read-only dashboard scope', () => {
  it('keeps the read-only dashboard tabs in the requested order', () => {
    const labels = getUsageTabOptions((key) => `translated:${key}`);

    expect(labels.map((option) => option.value)).toEqual(['overview', 'analysis', 'events', 'ai-provider', 'model-info']);
    expect(labels.map((option) => option.label)).toEqual([
      'translated:usage_stats.tab_overview',
      'translated:usage_stats.tab_analysis',
      'translated:usage_stats.tab_events',
      'translated:usage_stats.tab_ai_provider',
      'translated:usage_stats.tab_model_info',
    ]);
  });

  it('exposes only the anonymized AI provider credential section', () => {
    expect(getCredentialSectionVisibility('ai-provider')).toEqual({
      enabled: true,
      showAuthFiles: false,
      showAiProvider: true,
    });
    expect(getCredentialSectionVisibility('auth-files')).toEqual({
      enabled: false,
      showAuthFiles: false,
      showAiProvider: false,
    });
    expect(shouldLoadPricingOnUsageTabEntry('model-info')).toBe(true);
    expect(shouldLoadPricingOnUsageTabEntry('events')).toBe(true);
    expect(shouldShowUpdateCheckButton()).toBe(false);
    expect(getBackToCPALinkURL()).toBe('');
  });

  it('normalizes unknown and removed tab values to the default fallback path', () => {
    expect(normalizeUsageTabValue('overview')).toBe('overview');
    expect(normalizeUsageTabValue('ai-provider')).toBe('ai-provider');
    expect(normalizeUsageTabValue('model-info')).toBe('model-info');
    expect(normalizeUsageTabValue('credentials')).toBeNull();
    expect(normalizeUsageTabValue('settings')).toBeNull();
  });
});

describe('UsagePage model price mapping', () => {
  it('maps app.db pricing rows into request-event cost inputs', () => {
    expect(pricingEntriesToModelPriceMap([
      {
        model: 'claude-sonnet',
        prompt_price_per_1m: 3,
        completion_price_per_1m: 15,
        cache_price_per_1m: 0.3,
      },
      {
        model: ' ',
        prompt_price_per_1m: 1,
        completion_price_per_1m: 1,
        cache_price_per_1m: 1,
      },
    ])).toEqual({
      'claude-sonnet': { prompt: 3, completion: 15, cache: 0.3 },
    });
  });
});

describe('UsagePage API Key filter labels', () => {
  it('masks raw API keys and suppresses aliases in filter options', () => {
    const options = getApiKeySelectOptions([
      { id: '1', label: 'sk-live-secret-value-1234567890' },
      { id: '2', label: 'Production Alias' },
      { id: '3', label: 'sk-a*****************3456' },
    ], (key) => key === 'usage_stats.api_key_filter_all' ? 'All' : key);

    expect(options[0]).toEqual({ value: '', label: 'All' });
    expect(options[1].label).toMatch(/^sk-l\*+7890$/);
    expect(options[2]).toEqual({ value: '2', label: 'API Key 2' });
    expect(options[3]).toEqual({ value: '3', label: 'sk-a*****************3456' });
    expect(JSON.stringify(options)).not.toContain('sk-live-secret-value-1234567890');
    expect(JSON.stringify(options)).not.toContain('Production Alias');
  });
});

describe('UsagePage Overview loading display', () => {
  it('keeps existing Overview data visible during background refresh', () => {
    expect(getOverviewDisplayLoading({ loading: true, hasUsage: true })).toBe(false);
  });

  it('shows loading before Overview data has loaded', () => {
    expect(getOverviewDisplayLoading({ loading: true, hasUsage: false })).toBe(true);
  });
});

describe('UsagePage Overview auto-refresh', () => {
  it('refreshes the Overview tab every 10 seconds', () => {
    vi.useFakeTimers();
    const testDocument = createAutoRefreshTestDocument();
    const refreshOverview = vi.fn();

    const cleanup = scheduleOverviewAutoRefresh({ enabled: true, refreshOverview, documentRef: testDocument });

    vi.advanceTimersByTime(9_999);
    expect(refreshOverview).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(refreshOverview).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('does not schedule refreshes when disabled', () => {
    vi.useFakeTimers();
    const refreshOverview = vi.fn();

    const cleanup = scheduleOverviewAutoRefresh({ enabled: false, refreshOverview });

    vi.advanceTimersByTime(10_000);
    expect(refreshOverview).not.toHaveBeenCalled();

    cleanup();
  });

  it('pauses while the browser tab is hidden', () => {
    vi.useFakeTimers();
    const testDocument = createAutoRefreshTestDocument('hidden');
    const refreshOverview = vi.fn();

    const cleanup = scheduleOverviewAutoRefresh({ enabled: true, refreshOverview, documentRef: testDocument });

    vi.advanceTimersByTime(10_000);
    expect(refreshOverview).not.toHaveBeenCalled();

    cleanup();
  });
});

describe('UsagePage status active heartbeat', () => {
  it('is disabled in read-only dashboard mode', () => {
    const cleanup = scheduleStatusActiveHeartbeat();
    expect(cleanup()).toBeUndefined();
  });
});

describe('UsagePage visibility guard', () => {
  it('treats hidden documents as inactive', () => {
    expect(isUsagePageVisible({ visibilityState: 'visible' })).toBe(true);
    expect(isUsagePageVisible({ visibilityState: 'hidden' })).toBe(false);
  });
});

describe('UsagePage active tab auto-refresh guard', () => {
  it('allows Request Events auto-refresh only on the first page', () => {
    expect(shouldAutoRefreshUsageTab({ activeTab: 'events', eventsPage: 1 })).toBe(true);
    expect(shouldAutoRefreshUsageTab({ activeTab: 'events', eventsPage: 2 })).toBe(false);
  });

  it('keeps Overview auto-refresh enabled and does not auto-refresh Analysis', () => {
    expect(shouldAutoRefreshUsageTab({ activeTab: 'overview', eventsPage: 2 })).toBe(true);
    expect(shouldAutoRefreshUsageTab({ activeTab: 'analysis', eventsPage: 1 })).toBe(false);
  });
});

for (const tab of ['overview', 'analysis', 'events'] as const) {
  it(`shows range and API Key filters for ${tab}`, () => {
    expect(shouldShowRangeControls(tab)).toBe(true);
    expect(shouldShowApiKeyFilter(tab)).toBe(true);
  });
}

for (const tab of ['ai-provider', 'model-info'] as const) {
  it(`hides range and API Key filters for ${tab}`, () => {
    expect(shouldShowRangeControls(tab)).toBe(false);
    expect(shouldShowApiKeyFilter(tab)).toBe(false);
  });
}

describe('UsagePage request event filters', () => {
  it('clears model and source filters that are no longer available', () => {
    const next = sanitizeRequestEventFilters(
      {
        model: 'claude-opus',
        source: 'authidx-source-b',
        result: 'failed',
      },
      {
        models: ['claude-sonnet'],
        sources: [{ value: 'authidx-source-a', label: 'authidx-source-a' }],
      },
    );

    expect(next).toEqual({
      model: '__all__',
      source: '__all__',
      result: 'failed',
    });
  });

  it('keeps source filters that are still available after refreshing options', () => {
    const next = sanitizeRequestEventFilters(
      {
        model: 'claude-sonnet',
        source: 'authidx-source-a',
        result: 'success',
      },
      {
        models: ['claude-sonnet'],
        sources: [{ value: 'authidx-source-a', label: 'authidx-source-a' }],
      },
    );

    expect(next).toEqual({
      model: 'claude-sonnet',
      source: 'authidx-source-a',
      result: 'success',
    });
  });
});

describe('UsagePage time range options', () => {
  it('includes rolling, local day, and Custom ranges', () => {
    const options = getTimeRangeOptions((key) => `translated:${key}`);

    expect(options.map((option) => option.value)).toEqual(['4h', '8h', '12h', '24h', 'today', 'yesterday', '7d', '30d', 'custom']);
  });
});

describe('UsagePage Overview chart period preference', () => {
  it('keeps sub-day windows on By Hour', () => {
    expect(getPreferredOverviewChartPeriod({ windowMinutes: 12 * 60 })).toBe('hour');
  });

  it('uses By Day only for windows longer than one day', () => {
    expect(getPreferredOverviewChartPeriod({ windowMinutes: 24 * 60 })).toBe('hour');
    expect(getPreferredOverviewChartPeriod({ windowMinutes: (24 * 60) + 1 })).toBe('day');
  });
});

describe('UsagePage custom date input bounds', () => {
  it('limits selectable Custom dates to today through the first day of the previous month', () => {
    expect(getCustomDateRangeBounds(Date.parse('2026-05-13T12:00:00.000Z'), 'UTC')).toEqual({
      min: '2026-04-01',
      max: '2026-05-13',
    });
  });

  it('rejects tomorrow and dates before the first day of the previous month', () => {
    const bounds = { min: '2026-04-01', max: '2026-05-13' };

    expect(isCustomDateWithinBounds('2026-05-13', bounds)).toBe(true);
    expect(isCustomDateWithinBounds('2026-04-01', bounds)).toBe(true);
    expect(isCustomDateWithinBounds('2026-05-14', bounds)).toBe(false);
    expect(isCustomDateWithinBounds('2026-03-31', bounds)).toBe(false);
  });

  it('opens the native date picker when the date field is activated', () => {
    const showPicker = vi.fn();

    openDateInputPicker({ showPicker } as unknown as HTMLInputElement);

    expect(showPicker).toHaveBeenCalledTimes(1);
  });
});

describe('UsagePage custom date query', () => {
  it('keeps custom date query bounds as project-local dates for the backend', () => {
    expect(buildCustomDateRangeQuery({ start: '2026-04-20', end: '2026-04-21' })).toEqual({
      valid: true,
      start: '2026-04-20',
      end: '2026-04-21',
    });
  });

  it('rejects rollover calendar dates before sending them to the backend', () => {
    expect(buildCustomDateRangeQuery({ start: '2026-02-31', end: '2026-03-31' })).toEqual({
      valid: false,
      start: undefined,
      end: undefined,
    });
  });
});

describe('UsagePage Overview chart window', () => {
  it('uses Today hourly chart buckets through the next day boundary', () => {
    const filterWindow: UsageFilterWindow = {
      startMs: Date.parse('2026-04-23T00:00:00.000Z'),
      endMs: Date.parse('2026-04-23T12:34:56.000Z'),
      windowMinutes: (12 * 60) + 34 + (56 / 60),
    };

    expect(getOverviewHourWindowHours({ timeRange: 'today', filterWindow })).toBe(24);
    expect(getOverviewChartEndMs({
      timeRange: 'today',
      filterWindow,
      fallbackEndMs: filterWindow.endMs ?? 0,
      resolvedRangeEndMs: Date.parse('2026-04-23T15:59:59.999Z'),
    })).toBe(Date.parse('2026-04-23T16:00:00.000Z'));
  });
});

describe('UsagePage refresh action', () => {
  it('reloads page data without triggering backend sync', async () => {
    let refreshCalls = 0;

    await refreshPageData({
      refreshActiveTab: async () => {
        refreshCalls += 1;
      },
    });

    expect(refreshCalls).toBe(1);
  });
});
