import { useState, useMemo, useCallback, useEffect, useRef, type KeyboardEvent, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { ApiError, fetchAnalysis, fetchAvailableModels, fetchCpaApiKeyOptions, fetchDailyQuota, fetchPricing, fetchUsageEventModelFilterOptions, fetchUsageEventSourceFilterOptions, fetchUsageEvents, logout, queryModelInfoByAPIKey, tutorialPDFURL } from '@/lib/api';
import type { AnalysisResponse, CpaApiKeyOption, DailyQuotaResponse, PricingEntry, UsageEvent, UsageSourceFilterOption } from '@/lib/types';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { Select } from '@/components/ui/Select';
import { IconRefreshCw } from '@/components/ui/icons';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useThemeStore } from '@/stores';
import {
  StatCards,
  UsageChart,
  ChartLineSelector,
  AnalysisPanel,
  RequestEventsDetailsCard,
  ModelInfoPanel,
  TokenBreakdownChart,
  CostTrendChart,
  ServiceHealthCard,
  AiProviderCredentialsSection,
  useCredentialsTabData,
  useUsageData,
  useSparklines,
  useChartData
} from '@/components/usage';
import { buildUsageRangeQuery } from '@/utils/usage/rangeQuery';
import {
  getOverviewModelNames,
  resolveUsageFilterWindow,
  sanitizeChartLines,
  type UsageFilterWindow,
  type UsageTimeRange
} from '@/utils/usage';
import type { ModelPrice } from '@/utils/usage';
import { safeApiKeyDisplayLabel } from '@/utils/sensitiveDisplay';
import type { Theme } from '@/types';
import { BrandLink } from '@/components/BrandLink';
import styles from './UsagePage.module.scss';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const CHART_LINES_STORAGE_KEY = 'cli-proxy-usage-chart-lines-v1';
const TIME_RANGE_STORAGE_KEY = 'cli-proxy-usage-time-range-v1';
const CUSTOM_TIME_RANGE_STORAGE_KEY = 'cli-proxy-usage-custom-range-v1';
const DEFAULT_CHART_LINES = ['all'];
const DEFAULT_TIME_RANGE: UsageTimeRange = '8h';
const DEFAULT_CUSTOM_WINDOW_HOURS = 8;
const MAX_CHART_LINES = 9;
const TIME_RANGE_OPTIONS: ReadonlyArray<{ value: UsageTimeRange; labelKey: string }> = [
  { value: '4h', labelKey: 'usage_stats.range_4h' },
  { value: '8h', labelKey: 'usage_stats.range_8h' },
  { value: '12h', labelKey: 'usage_stats.range_12h' },
  { value: '24h', labelKey: 'usage_stats.range_24h' },
  { value: 'today', labelKey: 'usage_stats.range_today' },
  { value: 'yesterday', labelKey: 'usage_stats.range_yesterday' },
  { value: '7d', labelKey: 'usage_stats.range_7d' },
  { value: '30d', labelKey: 'usage_stats.range_30d' },
  { value: 'custom', labelKey: 'usage_stats.range_custom' },
];
const HOUR_WINDOW_BY_TIME_RANGE: Record<Extract<UsageTimeRange, '4h' | '8h' | '12h' | '24h' | '7d' | '30d'>, number> = {
  '4h': 4,
  '8h': 8,
  '12h': 12,
  '24h': 24,
  '7d': 7 * 24,
  '30d': 30 * 24
};
const THEME_OPTIONS: ReadonlyArray<{ value: Theme; labelKey: string }> = [
  { value: 'white', labelKey: 'usage_stats.theme_light' },
  { value: 'dark', labelKey: 'usage_stats.theme_dark' },
  { value: 'auto', labelKey: 'usage_stats.theme_auto' }
];
const USAGE_TAB_OPTIONS = ['overview', 'analysis', 'events', 'ai-provider', 'model-info'] as const;
type UsageTab = (typeof USAGE_TAB_OPTIONS)[number];
type Translate = (key: string) => string;
const USAGE_TAB_LABEL_KEYS: Record<UsageTab, string> = {
  overview: 'usage_stats.tab_overview',
  analysis: 'usage_stats.tab_analysis',
  events: 'usage_stats.tab_events',
  'ai-provider': 'usage_stats.tab_ai_provider',
  'model-info': 'usage_stats.tab_model_info',
};
const DEFAULT_USAGE_TAB: UsageTab = 'overview';
const USAGE_TAB_STORAGE_KEY = 'cli-proxy-usage-tab-v1';
const REQUEST_EVENTS_PAGE_SIZES = [20, 50, 100, 500, 1000] as const;
const REQUEST_EVENTS_DEFAULT_PAGE_SIZE = 100;
const ALL_REQUEST_EVENTS_FILTER = '__all__';
const OVERVIEW_AUTO_REFRESH_INTERVAL_MS = 10_000;
export const DAILY_QUOTA_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

type QuotaBalanceDisplay = {
  status: 'loading' | 'ok' | 'partial' | 'failed';
  remaining?: string;
};

type DailyQuotaDisplay = {
  dailyRefresh: QuotaBalanceDisplay;
  payAsYouGo: QuotaBalanceDisplay;
};

export const getCredentialSectionVisibility = (tab: string) => ({
  enabled: tab === 'ai-provider',
  showAuthFiles: false,
  showAiProvider: tab === 'ai-provider',
});

export const shouldShowRangeControls = (tab: UsageTab) => tab === 'overview' || tab === 'analysis' || tab === 'events';
export const shouldShowApiKeyFilter = (tab: UsageTab) => shouldShowRangeControls(tab);
export const shouldShowUpdateCheckButton = () => false;
export const isUsagePageVisible = (documentRef?: Pick<Document, 'visibilityState'>) => {
  const targetDocument = documentRef ?? (typeof document === 'undefined' ? undefined : document);
  return !targetDocument || targetDocument.visibilityState !== 'hidden';
};
export const getBackToCPALinkURL = () => '';
export const getUpdateCheckToastDuration = (kind: 'success' | 'info' | 'error') => (kind === 'error' ? 6_000 : 4_000);

const loadingDailyQuotaDisplay = (): DailyQuotaDisplay => ({
  dailyRefresh: { status: 'loading' },
  payAsYouGo: { status: 'loading' },
});

const failedDailyQuotaDisplay = (): DailyQuotaDisplay => ({
  dailyRefresh: { status: 'failed' },
  payAsYouGo: { status: 'failed' },
});

const normalizeQuotaBalanceDisplay = (balance: DailyQuotaResponse['daily_refresh']): QuotaBalanceDisplay => {
  const remaining = typeof balance?.remaining === 'string' ? balance.remaining.trim() : '';
  const normalizedRemaining = remaining.startsWith('$') ? remaining.slice(1).trim() : remaining;
  const parsedRemaining = Number(normalizedRemaining);
  if ((balance?.status === 'ok' || balance?.status === 'partial') && normalizedRemaining && Number.isFinite(parsedRemaining)) {
    return { status: balance.status, remaining: parsedRemaining.toFixed(2) };
  }
  return { status: 'failed' };
};

export const normalizeDailyQuotaDisplay = (response: DailyQuotaResponse): DailyQuotaDisplay => ({
  dailyRefresh: normalizeQuotaBalanceDisplay(response.daily_refresh),
  payAsYouGo: normalizeQuotaBalanceDisplay(response.pay_as_you_go),
});

export const formatDailyQuotaDisplayText = (display: QuotaBalanceDisplay, labelKey: string, translate: Translate): string => {
  const label = translate(labelKey);
  if ((display.status === 'ok' || display.status === 'partial') && display.remaining) {
    return `${label}：$${display.remaining}`;
  }
  if (display.status === 'loading') {
    return `${label}：${translate('usage_stats.daily_quota_loading')}`;
  }
  return `${label}：${translate('usage_stats.daily_quota_failed')}`;
};

export const shouldAutoRefreshUsageTab = ({
  activeTab,
  eventsPage,
}: {
  activeTab: UsageTab;
  eventsPage: number;
}) => {
  if (activeTab === 'overview') return true;
  if (activeTab === 'events') return eventsPage === 1;
  return false;
};

export const shouldLoadPricingOnUsageTabEntry = (tab: UsageTab) => tab === 'events' || tab === 'model-info';

export const pricingEntriesToModelPriceMap = (pricing: PricingEntry[]): Record<string, ModelPrice> => {
  const prices: Record<string, ModelPrice> = {};
  for (const entry of pricing) {
    const model = entry.model.trim();
    if (!model) continue;
    prices[model] = {
      prompt: Number(entry.prompt_price_per_1m) || 0,
      completion: Number(entry.completion_price_per_1m) || 0,
      cache: Number(entry.cache_price_per_1m) || 0,
    };
  }
  return prices;
};

type RequestEventFilterState = {
  model: string;
  source: string;
  result: string;
};

type RequestEventFilterOptionsState = {
  models: string[];
  sources: UsageSourceFilterOption[];
};

type RefreshPageDataOptions = {
  refreshActiveTab: () => Promise<void>;
  refreshDailyQuota?: () => Promise<void>;
};

type OverviewAutoRefreshDocument = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

type OverviewAutoRefreshOptions = {
  enabled: boolean;
  refreshOverview: () => void | Promise<void>;
  documentRef?: OverviewAutoRefreshDocument;
  intervalMs?: number;
};

export const refreshPageData = async ({ refreshActiveTab, refreshDailyQuota }: RefreshPageDataOptions) => {
  await Promise.all([
    refreshActiveTab(),
    refreshDailyQuota?.() ?? Promise.resolve(),
  ]);
};

export const getOverviewDisplayLoading = ({ loading, hasUsage }: { loading: boolean; hasUsage: boolean }) => loading && !hasUsage;

export const scheduleOverviewAutoRefresh = ({
  enabled,
  refreshOverview,
  documentRef,
  intervalMs = OVERVIEW_AUTO_REFRESH_INTERVAL_MS,
}: OverviewAutoRefreshOptions) => {
  if (!enabled) {
    return () => undefined;
  }

  const targetDocument = documentRef ?? (typeof document === 'undefined' ? undefined : document);
  if (!targetDocument) {
    return () => undefined;
  }

  let timer: ReturnType<typeof setInterval> | undefined;
  const stopTimer = () => {
    if (timer === undefined) return;
    clearInterval(timer);
    timer = undefined;
  };
  const refreshIfVisible = () => {
    if (targetDocument.visibilityState === 'hidden') {
      stopTimer();
      return;
    }
    void refreshOverview();
  };
  const startTimer = () => {
    if (timer !== undefined) return;
    timer = setInterval(refreshIfVisible, intervalMs);
  };
  const handleVisibilityChange = () => {
    if (targetDocument.visibilityState === 'hidden') {
      stopTimer();
      return;
    }
    void refreshOverview();
    stopTimer();
    startTimer();
  };

  if (targetDocument.visibilityState !== 'hidden') {
    startTimer();
  }
  targetDocument.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    stopTimer();
    targetDocument.removeEventListener('visibilitychange', handleVisibilityChange);
  };
};

export const scheduleStatusActiveHeartbeat = () => () => undefined;

export const sanitizeRequestEventFilters = (
  filters: RequestEventFilterState,
  options: RequestEventFilterOptionsState,
): RequestEventFilterState => {
  const model = filters.model === ALL_REQUEST_EVENTS_FILTER || options.models.includes(filters.model)
    ? filters.model
    : ALL_REQUEST_EVENTS_FILTER;
  const source = filters.source === ALL_REQUEST_EVENTS_FILTER || options.sources.some((option) => option.value === filters.source)
    ? filters.source
    : ALL_REQUEST_EVENTS_FILTER;
  const result = filters.result === 'success' || filters.result === 'failed'
    ? filters.result
    : ALL_REQUEST_EVENTS_FILTER;

  return { model, source, result };
};

const isUsageTimeRange = (value: unknown): value is UsageTimeRange =>
  value === '4h' || value === '8h' || value === '12h' || value === '24h' || value === 'today' || value === 'yesterday' || value === '7d' || value === '30d' || value === 'custom';

const toDateInputValue = (timestamp: number): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const toDateInputValueInTimezone = (timestamp: number, timezone?: string): string => {
  if (!timezone) return toDateInputValue(timestamp);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(timestamp));
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (!year || !month || !day) return toDateInputValue(timestamp);
    return `${year}-${month}-${day}`;
  } catch {
    return toDateInputValue(timestamp);
  }
};

const previousMonthStartDateInputValue = (value: string): string => {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(value);
  if (!match) return value;
  const [, year, month] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 2, 1));
  const pad = (nextValue: number) => String(nextValue).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-01`;
};

export const getCustomDateRangeBounds = (anchorMs = Date.now(), timezone?: string) => {
  const max = toDateInputValueInTimezone(anchorMs, timezone);
  return {
    min: previousMonthStartDateInputValue(max),
    max,
  };
};

export const isCustomDateWithinBounds = (value: string, bounds: { min: string; max: string }) => (
  value === '' || (value >= bounds.min && value <= bounds.max)
);

export const openDateInputPicker = (input: HTMLInputElement) => {
  try {
    input.showPicker?.();
  } catch {
    // Some browsers reject showPicker outside direct user gestures.
  }
};

export const buildCustomDateRangeQuery = (range: { start: string; end: string }) => {
  const query = buildUsageRangeQuery({ range: 'custom', customStart: range.start, customEnd: range.end });
  return { valid: query.valid, start: query.start, end: query.end };
};

const parseCustomDateBoundary = (value: string, endOfDay: boolean): number | undefined => {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const date = endOfDay
    ? new Date(yearNumber, monthNumber - 1, dayNumber, 23, 59, 59, 999)
    : new Date(yearNumber, monthNumber - 1, dayNumber, 0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return undefined;
  if (date.getFullYear() !== yearNumber || date.getMonth() !== monthNumber - 1 || date.getDate() !== dayNumber) return undefined;
  return date.getTime();
};

const parseCustomDateStart = (value: string): number | undefined => parseCustomDateBoundary(value, false);
const parseCustomDateEnd = (value: string): number | undefined => parseCustomDateBoundary(value, true);

const buildDefaultCustomRange = (anchorMs: number) => ({
  start: toDateInputValue(anchorMs - DEFAULT_CUSTOM_WINDOW_HOURS * 60 * 60 * 1000),
  end: toDateInputValue(anchorMs)
});

const loadCustomTimeRange = () => {
  try {
    if (typeof localStorage === 'undefined') {
      return buildDefaultCustomRange(Date.now());
    }
    const raw = localStorage.getItem(CUSTOM_TIME_RANGE_STORAGE_KEY);
    if (!raw) {
      return buildDefaultCustomRange(Date.now());
    }
    const parsed = JSON.parse(raw) as { start?: string; end?: string };
    const start = typeof parsed?.start === 'string' ? parsed.start : '';
    const end = typeof parsed?.end === 'string' ? parsed.end : '';
    if (!start || !end) {
      return { start, end };
    }
    const startMs = parseCustomDateStart(start);
    const endMs = parseCustomDateEnd(end);
    if (startMs === undefined || endMs === undefined || startMs > endMs) {
      return buildDefaultCustomRange(Date.now());
    }
    return { start, end };
  } catch {
    return buildDefaultCustomRange(Date.now());
  }
};

const normalizeChartLines = (value: unknown, maxLines = MAX_CHART_LINES): string[] => {
  if (!Array.isArray(value)) {
    return DEFAULT_CHART_LINES;
  }

  const filtered = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxLines);

  return filtered.length ? filtered : DEFAULT_CHART_LINES;
};

const loadChartLines = (): string[] => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_CHART_LINES;
    }
    const raw = localStorage.getItem(CHART_LINES_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_CHART_LINES;
    }
    return normalizeChartLines(JSON.parse(raw));
  } catch {
    return DEFAULT_CHART_LINES;
  }
};

const loadTimeRange = (): UsageTimeRange => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_TIME_RANGE;
    }
    const raw = localStorage.getItem(TIME_RANGE_STORAGE_KEY);
    if (!isUsageTimeRange(raw)) {
      return DEFAULT_TIME_RANGE;
    }
    return raw;
  } catch {
    return DEFAULT_TIME_RANGE;
  }
};

const isUsageTab = (value: unknown): value is UsageTab =>
  typeof value === 'string' && USAGE_TAB_OPTIONS.includes(value as UsageTab);

export const normalizeUsageTabValue = (value: unknown): UsageTab | null => (
  isUsageTab(value) ? value : null
);

export const getUsageTabOptions = (translate: Translate): Array<{ value: UsageTab; label: string }> =>
  USAGE_TAB_OPTIONS.map((value) => ({
    value,
    label: translate(USAGE_TAB_LABEL_KEYS[value]),
  }));

export const getTimeRangeOptions = (translate: Translate) =>
  TIME_RANGE_OPTIONS.map((option) => ({
    value: option.value,
    label: translate(option.labelKey),
  }));

export const getApiKeySelectOptions = (apiKeyOptions: CpaApiKeyOption[], translate: Translate): Array<{ value: string; label: string }> => [
  { value: '', label: translate('usage_stats.api_key_filter_all') },
  ...apiKeyOptions.map((option, index) => ({
    value: option.id,
    label: safeApiKeyDisplayLabel(option.label, `API Key ${index + 1}`),
  })),
];

const isTodayTimeRange = (value: UsageTimeRange): value is 'today' | 'yesterday' => value === 'today' || value === 'yesterday';

export const getPreferredOverviewChartPeriod = (filterWindow: UsageFilterWindow): 'hour' | 'day' => (
  (filterWindow.windowMinutes ?? 0) > 24 * 60 ? 'day' : 'hour'
);

export const getOverviewHourWindowHours = ({
  timeRange,
  filterWindow,
}: {
  timeRange: UsageTimeRange;
  filterWindow: UsageFilterWindow;
}) => {
  if (isTodayTimeRange(timeRange)) return 24;
  if (timeRange !== 'custom' && timeRange in HOUR_WINDOW_BY_TIME_RANGE) {
    return HOUR_WINDOW_BY_TIME_RANGE[timeRange as keyof typeof HOUR_WINDOW_BY_TIME_RANGE];
  }
  const windowMinutes = filterWindow.windowMinutes;
  if (!windowMinutes || windowMinutes <= 0) return undefined;
  return Math.max(1, Math.ceil(windowMinutes / 60));
};

export const getOverviewChartEndMs = ({
  timeRange,
  filterWindow,
  fallbackEndMs,
  resolvedRangeEndMs,
}: {
  timeRange: UsageTimeRange;
  filterWindow: UsageFilterWindow;
  fallbackEndMs: number;
  resolvedRangeStartMs?: number;
  resolvedRangeEndMs?: number;
}) => {
  if (isTodayTimeRange(timeRange) && resolvedRangeEndMs) {
    const endDate = new Date(resolvedRangeEndMs);
    endDate.setMilliseconds(endDate.getMilliseconds() + 1);
    return endDate.getTime();
  }
  return filterWindow.endMs ?? fallbackEndMs;
};

const loadUsageTab = (): UsageTab => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_USAGE_TAB;
    }
    return normalizeUsageTabValue(localStorage.getItem(USAGE_TAB_STORAGE_KEY)) ?? DEFAULT_USAGE_TAB;
  } catch {
    return DEFAULT_USAGE_TAB;
  }
};

const emptyAnalysisResponse = (): AnalysisResponse => ({
  granularity: 'hourly',
  timezone: '',
  token_usage: [],
  api_key_composition: [],
  api_key_cost_composition: [],
  model_composition: [],
  auth_files_composition: [],
  ai_provider_composition: [],
  heatmap: { api_keys: [], models: [], cells: [] },
});

interface UsagePageProps {
  onAuthRequired?: () => void;
}

export function UsagePage({ onAuthRequired }: UsagePageProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<UsageTab>(loadUsageTab);
  const [timeRange, setTimeRange] = useState<UsageTimeRange>(loadTimeRange);
  const [customTimeRange, setCustomTimeRange] = useState(loadCustomTimeRange);
  const [chartLines, setChartLines] = useState<string[]>(loadChartLines);
  const [selectedApiKeyId, setSelectedApiKeyId] = useState('');
  const [apiKeyOptions, setApiKeyOptions] = useState<CpaApiKeyOption[]>([]);
  const [apiKeyOptionsError, setApiKeyOptionsError] = useState('');
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [eventsData, setEventsData] = useState<UsageEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsPageSize, setEventsPageSize] = useState(REQUEST_EVENTS_DEFAULT_PAGE_SIZE);
  const [eventsTotalCount, setEventsTotalCount] = useState(0);
  const [eventsTotalPages, setEventsTotalPages] = useState(0);
  const [eventsModelOptions, setEventsModelOptions] = useState<string[]>([]);
  const [eventsSourceOptions, setEventsSourceOptions] = useState<UsageSourceFilterOption[]>([]);
  const [eventsModelFilter, setEventsModelFilter] = useState(ALL_REQUEST_EVENTS_FILTER);
  const [eventsSourceFilter, setEventsSourceFilter] = useState(ALL_REQUEST_EVENTS_FILTER);
  const [eventsResultFilter, setEventsResultFilter] = useState(ALL_REQUEST_EVENTS_FILTER);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelPricing, setModelPricing] = useState<PricingEntry[]>([]);
  const [modelInfoLoading, setModelInfoLoading] = useState(false);
  const [modelInfoError, setModelInfoError] = useState('');
  const [manualRefreshLoading, setManualRefreshLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [dailyQuotaDisplay, setDailyQuotaDisplay] = useState<DailyQuotaDisplay>(loadingDailyQuotaDisplay);
  const customStartInputRef = useRef<HTMLInputElement | null>(null);
  const customEndInputRef = useRef<HTMLInputElement | null>(null);

  const theme = useThemeStore((state) => state.theme);
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const isDark = resolvedTheme === 'dark';
  const isMobile = useMediaQuery('(max-width: 768px)');
  const credentialVisibility = getCredentialSectionVisibility(activeTab);
  const {
    aiProviderRows,
    aiProviderTotal,
    aiProviderPage,
    aiProviderTotalPages,
    aiProviderPageSize,
    aiProviderSort,
    setAiProviderPage,
    setAiProviderPageSize,
    setAiProviderSort,
    loading: credentialsLoading,
    error: credentialsError,
    refresh: refreshCredentials,
  } = useCredentialsTabData({
    enabledAuthFiles: credentialVisibility.showAuthFiles,
    enabledAiProviders: credentialVisibility.showAiProvider,
    onAuthRequired,
  });

  const queryWindow = useMemo(() => buildUsageRangeQuery({
    range: timeRange,
    customStart: customTimeRange.start,
    customEnd: customTimeRange.end,
  }), [customTimeRange.end, customTimeRange.start, timeRange]);
  const isCustomRange = timeRange === 'custom';
  const customRangeReady = queryWindow.valid;

  const usageData = useUsageData({
    range: timeRange,
    customStart: customTimeRange.start,
    customEnd: customTimeRange.end,
    enabled: activeTab === 'overview',
    apiKeyId: selectedApiKeyId,
    onAuthRequired,
  });
  const { usage, loading, error, lastRefreshedAt, loadUsage } = usageData;
  const overviewDisplayLoading = getOverviewDisplayLoading({ loading, hasUsage: Boolean(usage) });
  const filterWindow = useMemo(() => resolveUsageFilterWindow(usage?.usage, timeRange, {
    customStart: queryWindow.start,
    customEnd: queryWindow.end,
  }), [queryWindow.end, queryWindow.start, timeRange, usage?.usage]);
  const overviewModelNames = useMemo(() => getOverviewModelNames(usage), [usage]);
  const eventModelPrices = useMemo(() => pricingEntriesToModelPriceMap(modelPricing), [modelPricing]);
  const sanitizedChartLines = useMemo(() => sanitizeChartLines(chartLines, overviewModelNames), [chartLines, overviewModelNames]);
  const hourWindowHours = useMemo(() => getOverviewHourWindowHours({ timeRange, filterWindow }), [filterWindow, timeRange]);
  const filterWindowEndMs = useMemo(() => getOverviewChartEndMs({
    timeRange,
    filterWindow,
    fallbackEndMs: Date.now(),
    resolvedRangeEndMs: usage?.range_end ? Date.parse(usage.range_end) : undefined,
  }), [filterWindow, timeRange, usage?.range_end]);
  const preferredOverviewChartPeriod = useMemo(() => getPreferredOverviewChartPeriod(filterWindow), [filterWindow]);
  const includeFinalHourBucket = isTodayTimeRange(timeRange);
  const { requestsSparkline, tokensSparkline, rpmSparkline, tpmSparkline, costSparkline } = useSparklines({ usage, loading });
  const {
    requestsPeriod,
    tokensPeriod,
    requestsChartData,
    tokensChartData,
    requestsChartOptions,
    tokensChartOptions,
  } = useChartData({
    usage,
    chartLines: sanitizedChartLines,
    isDark,
    isMobile,
    hourWindowHours,
    endMs: filterWindowEndMs,
    includeFinalHourBucket,
    preferredPeriod: preferredOverviewChartPeriod,
  });

  useEffect(() => {
    if (sanitizedChartLines.join('\0') !== chartLines.join('\0')) {
      setChartLines(sanitizedChartLines);
    }
  }, [chartLines, sanitizedChartLines]);

  useEffect(() => {
    try {
      localStorage.setItem(CHART_LINES_STORAGE_KEY, JSON.stringify(chartLines));
    } catch {
      // ignore storage failures
    }
  }, [chartLines]);

  useEffect(() => {
    try {
      localStorage.setItem(TIME_RANGE_STORAGE_KEY, timeRange);
      localStorage.setItem(CUSTOM_TIME_RANGE_STORAGE_KEY, JSON.stringify(customTimeRange));
      localStorage.setItem(USAGE_TAB_STORAGE_KEY, activeTab);
    } catch {
      // ignore storage failures
    }
  }, [activeTab, customTimeRange, timeRange]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCpaApiKeyOptions(controller.signal)
      .then((response) => {
        setApiKeyOptions(response.options ?? []);
        setApiKeyOptionsError('');
      })
      .catch((fetchError) => {
        if (controller.signal.aborted) return;
        if (fetchError instanceof ApiError && fetchError.status === 401) {
          onAuthRequired?.();
          return;
        }
        setApiKeyOptions([]);
        setApiKeyOptionsError(fetchError instanceof Error ? fetchError.message : 'Failed to load API key options');
      });
    return () => controller.abort();
  }, [onAuthRequired]);

  const loadAnalysis = useCallback(async () => {
    if (!customRangeReady) return;
    const controller = new AbortController();
    setAnalysisLoading(true);
    setAnalysisError('');
    try {
      const response = await fetchAnalysis(queryWindow.range, queryWindow.start, queryWindow.end, controller.signal, selectedApiKeyId);
      setAnalysisData(response ?? emptyAnalysisResponse());
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        onAuthRequired?.();
        setAnalysisError('AUTH_REQUIRED');
      } else {
        setAnalysisError(fetchError instanceof Error ? fetchError.message : 'Failed to load analysis');
      }
      setAnalysisData(emptyAnalysisResponse());
    } finally {
      setAnalysisLoading(false);
    }
  }, [customRangeReady, onAuthRequired, queryWindow.end, queryWindow.range, queryWindow.start, selectedApiKeyId]);

  const loadEventFilterOptions = useCallback(async () => {
    const controller = new AbortController();
    const [modelsResponse, sourcesResponse] = await Promise.all([
      fetchUsageEventModelFilterOptions(controller.signal),
      fetchUsageEventSourceFilterOptions(controller.signal),
    ]);
    const nextModels = modelsResponse.models ?? [];
    const nextSources = sourcesResponse.sources ?? [];
    setEventsModelOptions(nextModels);
    setEventsSourceOptions(nextSources);
    const sanitized = sanitizeRequestEventFilters(
      { model: eventsModelFilter, source: eventsSourceFilter, result: eventsResultFilter },
      { models: nextModels, sources: nextSources },
    );
    setEventsModelFilter(sanitized.model);
    setEventsSourceFilter(sanitized.source);
    setEventsResultFilter(sanitized.result);
  }, [eventsModelFilter, eventsResultFilter, eventsSourceFilter]);

  const loadModelPricing = useCallback(async () => {
    const controller = new AbortController();
    const pricingResponse = await fetchPricing(controller.signal);
    setModelPricing(pricingResponse.pricing ?? []);
  }, []);

  const loadEvents = useCallback(async () => {
    if (!customRangeReady) return;
    const controller = new AbortController();
    setEventsLoading(true);
    setEventsError('');
    try {
      const response = await fetchUsageEvents(timeRange, queryWindow.start, queryWindow.end, controller.signal, {
        page: eventsPage,
        pageSize: eventsPageSize,
        model: eventsModelFilter === ALL_REQUEST_EVENTS_FILTER ? '' : eventsModelFilter,
        source: eventsSourceFilter === ALL_REQUEST_EVENTS_FILTER ? '' : eventsSourceFilter,
        result: eventsResultFilter === ALL_REQUEST_EVENTS_FILTER ? '' : eventsResultFilter,
        apiKeyId: selectedApiKeyId,
      });
      setEventsData(response.events ?? []);
      setEventsTotalCount(response.total_count ?? 0);
      setEventsTotalPages(response.total_pages ?? 0);
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        onAuthRequired?.();
        setEventsError('AUTH_REQUIRED');
      } else {
        setEventsError(fetchError instanceof Error ? fetchError.message : 'Failed to load request events');
      }
      setEventsData([]);
      setEventsTotalCount(0);
      setEventsTotalPages(0);
    } finally {
      setEventsLoading(false);
    }
  }, [customRangeReady, eventsModelFilter, eventsPage, eventsPageSize, eventsResultFilter, eventsSourceFilter, onAuthRequired, queryWindow.end, queryWindow.start, selectedApiKeyId, timeRange]);

  const loadModelInfo = useCallback(async () => {
    const controller = new AbortController();
    setModelInfoLoading(true);
    setModelInfoError('');
    try {
      const [modelsResponse, pricingResponse] = await Promise.all([
        fetchAvailableModels(controller.signal),
        fetchPricing(controller.signal),
      ]);
      setAvailableModels(modelsResponse.models ?? []);
      setModelPricing(pricingResponse.pricing ?? []);
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        onAuthRequired?.();
        setModelInfoError('AUTH_REQUIRED');
      } else {
        setModelInfoError(fetchError instanceof Error ? fetchError.message : 'Failed to load model info');
      }
      setAvailableModels([]);
      setModelPricing([]);
    } finally {
      setModelInfoLoading(false);
    }
  }, [onAuthRequired]);

  const loadDailyQuota = useCallback(async () => {
    const controller = new AbortController();
    try {
      const response = await fetchDailyQuota(controller.signal);
      setDailyQuotaDisplay(normalizeDailyQuotaDisplay(response));
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        onAuthRequired?.();
        return;
      }
      setDailyQuotaDisplay(failedDailyQuotaDisplay());
    }
  }, [onAuthRequired]);

  const refreshActiveTab = useCallback(async () => {
    if (activeTab === 'overview') {
      await loadUsage();
    } else if (activeTab === 'analysis') {
      await loadAnalysis();
    } else if (activeTab === 'events') {
      await Promise.all([loadModelPricing(), loadEventFilterOptions(), loadEvents()]);
    } else if (activeTab === 'ai-provider') {
      await refreshCredentials();
    } else if (activeTab === 'model-info') {
      await loadModelInfo();
    }
  }, [activeTab, loadAnalysis, loadEventFilterOptions, loadEvents, loadModelInfo, loadModelPricing, loadUsage, refreshCredentials]);

  useHeaderRefresh(refreshActiveTab);

  useEffect(() => {
    void loadDailyQuota();
    const timer = window.setInterval(() => {
      void loadDailyQuota();
    }, DAILY_QUOTA_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadDailyQuota]);

  useEffect(() => scheduleOverviewAutoRefresh({
    enabled: shouldAutoRefreshUsageTab({ activeTab, eventsPage }),
    refreshOverview: activeTab === 'overview' ? loadUsage : loadEvents,
  }), [activeTab, eventsPage, loadEvents, loadUsage]);

  useEffect(() => {
    if (activeTab !== 'analysis') return;
    void loadAnalysis();
  }, [activeTab, loadAnalysis]);

  useEffect(() => {
    if (activeTab !== 'events') return;
    void loadEventFilterOptions().catch((fetchError) => {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        onAuthRequired?.();
        setEventsError('AUTH_REQUIRED');
        return;
      }
      setEventsError(fetchError instanceof Error ? fetchError.message : 'Failed to load request event filters');
    });
  }, [activeTab, loadEventFilterOptions, onAuthRequired]);

  useEffect(() => {
    if (activeTab !== 'events') return;
    void loadEvents();
  }, [activeTab, loadEvents]);

  useEffect(() => {
    if (activeTab !== 'events') return;
    void loadModelPricing().catch((fetchError) => {
      if (fetchError instanceof ApiError && fetchError.status === 401) {
        onAuthRequired?.();
        setEventsError('AUTH_REQUIRED');
        return;
      }
      setEventsError(fetchError instanceof Error ? fetchError.message : 'Failed to load model pricing');
    });
  }, [activeTab, loadModelPricing, onAuthRequired]);

  useEffect(() => {
    if (activeTab !== 'model-info') return;
    void loadModelInfo();
  }, [activeTab, loadModelInfo]);

  const handleManualRefresh = useCallback(async () => {
    setManualRefreshLoading(true);
    try {
      await refreshPageData({ refreshActiveTab, refreshDailyQuota: loadDailyQuota });
    } catch (refreshError) {
      if (refreshError instanceof ApiError) {
        if (refreshError.status === 401) {
          onAuthRequired?.();
          return;
        }
        setEventsError(refreshError.message);
      }
    } finally {
      setManualRefreshLoading(false);
    }
  }, [loadDailyQuota, onAuthRequired, refreshActiveTab]);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      onAuthRequired?.();
    }
  }, [onAuthRequired]);

  const handleChartLinesChange = useCallback((nextLines: string[]) => {
    setChartLines(sanitizeChartLines(nextLines, overviewModelNames));
  }, [overviewModelNames]);

  const handleEventsPageSizeChange = useCallback((nextPageSize: number) => {
    setEventsPage(1);
    setEventsPageSize(nextPageSize);
  }, []);

  const handleEventsModelFilterChange = useCallback((nextModel: string) => {
    setEventsPage(1);
    setEventsModelFilter(nextModel);
  }, []);

  const handleEventsSourceFilterChange = useCallback((nextSource: string) => {
    setEventsPage(1);
    setEventsSourceFilter(nextSource);
  }, []);

  const handleEventsResultFilterChange = useCallback((nextResult: string) => {
    setEventsPage(1);
    setEventsResultFilter(nextResult);
  }, []);

  const customDateRangeBounds = useMemo(() => getCustomDateRangeBounds(Date.now(), usage?.timezone || analysisData?.timezone), [analysisData?.timezone, usage?.timezone]);
  const customRangeError = isCustomRange && !customRangeReady ? t('usage_stats.custom_range_invalid') : '';
  const customRangeHint = isCustomRange ? `${customDateRangeBounds.min} - ${customDateRangeBounds.max}` : '';
  const tabOptions = useMemo(() => getUsageTabOptions(t), [t]);
  const timeRangeOptions = useMemo(() => getTimeRangeOptions(t), [t]);
  const themeOptions = useMemo(() => THEME_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) })), [t]);
  const apiKeySelectOptions = useMemo(() => getApiKeySelectOptions(apiKeyOptions, t), [apiKeyOptions, t]);
  const tutorialURL = tutorialPDFURL();
  const dailyQuotaText = formatDailyQuotaDisplayText(dailyQuotaDisplay.dailyRefresh, 'usage_stats.daily_quota_daily_refresh_label', t);
  const payAsYouGoQuotaText = formatDailyQuotaDisplayText(dailyQuotaDisplay.payAsYouGo, 'usage_stats.daily_quota_pay_as_you_go_label', t);
  const lastSyncAt = lastRefreshedAt;

  const handleCustomDateInputActivate = (event: SyntheticEvent<HTMLInputElement>) => {
    openDateInputPicker(event.currentTarget);
  };

  const handleCustomDateInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      openDateInputPicker(event.currentTarget);
    }
  };

  return (
    <div className={styles.pageShell}>
      <div className={styles.pageFrame}>
        <header className={styles.topBar}>
          <div className={styles.brandBlock}>
            <BrandLink className={styles.eyebrow} />
          </div>
          <div className={styles.topBarCenter}>
            <div className={styles.headerInfoGroup}>
              {tutorialURL && (
                <a className={styles.tutorialLink} href={tutorialURL} target="_blank" rel="noreferrer">
                  {t('usage_stats.tutorial_link')}
                </a>
              )}
              <div className={styles.dailyQuotaBox} role="status" aria-live="polite" title={dailyQuotaText}>
                {dailyQuotaText}
              </div>
              <div className={styles.payAsYouGoQuotaBox} role="status" aria-live="polite" title={payAsYouGoQuotaText}>
                {payAsYouGoQuotaText}
              </div>
            </div>
          </div>
          <div className={styles.topBarActions}>
            <LanguageSwitcher className={styles.headerLanguageSwitcher} />
            <div className={styles.themeSwitcher} role="tablist" aria-label={t('usage_stats.theme_switch')}>
              {themeOptions.map((option) => {
                const active = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`${styles.themePill} ${active ? styles.themePillActive : ''}`.trim()}
                    onClick={() => setTheme(option.value as Theme)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className={styles.signOutSwitcher} role="group" aria-label={t('common.logout')}>
              <button
                type="button"
                className={`${styles.signOutPill} ${styles.signOutPillActive}`.trim()}
                onClick={() => void handleLogout()}
                disabled={loggingOut}
              >
                <span className={styles.signOutPillInner}>{loggingOut ? t('common.loading') : t('common.logout')}</span>
              </button>
            </div>
          </div>
        </header>

        <main className={styles.contentColumn}>
          <div className={styles.container}>
            {loading && !usage && activeTab === 'overview' && (
              <div className={styles.loadingOverlay} aria-busy="true">
                <div className={styles.loadingOverlayContent}>
                  <LoadingSpinner size={28} className={styles.loadingOverlaySpinner} />
                  <span className={styles.loadingOverlayText}>{t('common.loading')}</span>
                </div>
              </div>
            )}

            {lastSyncAt && (
              <div className={styles.toolbarMetaRow}>
                <span className={styles.lastRefreshed}>
                  {t('usage_stats.last_updated')}: {lastSyncAt.toLocaleTimeString()}
                </span>
              </div>
            )}

            <div className={styles.toolbarRow}>
              <div className={styles.tabBar} role="tablist" aria-label={t('usage_stats.tabs_aria_label')}>
                {tabOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === option.value}
                    className={`${styles.tabPill} ${activeTab === option.value ? styles.tabPillActive : ''}`.trim()}
                    onClick={() => setActiveTab(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className={styles.toolbarActionsRight}>
                {shouldShowRangeControls(activeTab) && (
                <div className={styles.usageFilterBar}>
                  <div className={styles.apiKeyFilterGroup}>
                    <label className={`${styles.usageFilterField} ${styles.apiKeyFilterField}`.trim()}>
                      <span className={styles.usageFilterLabel}>{t('usage_stats.api_key_filter')}</span>
                      <Select
                        value={selectedApiKeyId}
                        options={apiKeySelectOptions}
                        onChange={setSelectedApiKeyId}
                        className={styles.apiKeySelectControl}
                        ariaLabel={t('usage_stats.api_key_filter')}
                        fullWidth
                        dropdownMinWidth={180}
                      />
                    </label>
                  </div>
                  <div className={styles.timeRangeGroup}>
                    <label className={`${styles.usageFilterField} ${styles.rangeFilterField}`.trim()}>
                      <span className={styles.usageFilterLabel}>{t('usage_stats.range_filter')}</span>
                      <Select
                        value={timeRange}
                        options={timeRangeOptions}
                        onChange={(value) => setTimeRange(value as UsageTimeRange)}
                        className={styles.rangeSelectControl}
                        ariaLabel={t('usage_stats.range_filter')}
                        fullWidth
                      />
                    </label>
                    <div
                      className={`${styles.customRangeFieldGroup} ${isCustomRange ? styles.customRangeFieldGroupOpen : ''}`.trim()}
                      aria-hidden={!isCustomRange}
                    >
                      <label className={styles.customRangeField}>
                        <span className={styles.customRangeFieldLabel}>{t('usage_stats.custom_start')}</span>
                        <span className={styles.customRangeInputShell}>
                          <input
                            ref={customStartInputRef}
                            type="date"
                            className={`input ${styles.customRangeInput}`}
                            value={customTimeRange.start}
                            min={customDateRangeBounds.min}
                            max={customDateRangeBounds.max}
                            disabled={!isCustomRange}
                            onClick={handleCustomDateInputActivate}
                            onFocus={handleCustomDateInputActivate}
                            onKeyDown={handleCustomDateInputKeyDown}
                            onPaste={(event) => event.preventDefault()}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              if (!isCustomDateWithinBounds(nextValue, customDateRangeBounds)) return;
                              setCustomTimeRange((current) => ({ ...current, start: nextValue }));
                            }}
                            aria-label={t('usage_stats.custom_start')}
                          />
                          <span className={styles.customRangeInputDisplay} aria-hidden="true">
                            {customTimeRange.start || 'YYYY-MM-DD'}
                          </span>
                        </span>
                      </label>
                      <span className={styles.customRangeSeparator} aria-hidden="true">-</span>
                      <label className={styles.customRangeField}>
                        <span className={styles.customRangeFieldLabel}>{t('usage_stats.custom_end')}</span>
                        <span className={styles.customRangeInputShell}>
                          <input
                            ref={customEndInputRef}
                            type="date"
                            className={`input ${styles.customRangeInput}`}
                            value={customTimeRange.end}
                            min={customDateRangeBounds.min}
                            max={customDateRangeBounds.max}
                            disabled={!isCustomRange}
                            onClick={handleCustomDateInputActivate}
                            onFocus={handleCustomDateInputActivate}
                            onKeyDown={handleCustomDateInputKeyDown}
                            onPaste={(event) => event.preventDefault()}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              if (!isCustomDateWithinBounds(nextValue, customDateRangeBounds)) return;
                              setCustomTimeRange((current) => ({ ...current, end: nextValue }));
                            }}
                            aria-label={t('usage_stats.custom_end')}
                          />
                          <span className={styles.customRangeInputDisplay} aria-hidden="true">
                            {customTimeRange.end || 'YYYY-MM-DD'}
                          </span>
                        </span>
                      </label>
                    </div>
                  </div>
                  {isCustomRange && customRangeHint && <span className={styles.customRangeHint}>{customRangeHint}</span>}
                  {isCustomRange && customRangeError && <span className={styles.customRangeError}>{customRangeError}</span>}
                </div>
                )}
                <div className={styles.usageRefreshSlot}>
                  <div className={styles.usageFilterActions}>
                    <div className={styles.refreshSwitcher} role="group" aria-label={t('usage_stats.refresh')}>
                      <button
                        type="button"
                        className={`${styles.refreshPill} ${styles.refreshPillActive} ${manualRefreshLoading ? styles.refreshPillLoading : ''}`.trim()}
                        onClick={() => void handleManualRefresh().catch(() => {})}
                        disabled={manualRefreshLoading}
                        aria-busy={manualRefreshLoading}
                      >
                        {manualRefreshLoading ? (
                          <span className={styles.refreshPillInner}>
                            <LoadingSpinner size={12} className={styles.refreshSpinner} />
                            <span>{t('common.loading')}</span>
                          </span>
                        ) : (
                          <span className={styles.refreshPillInner}>
                            <IconRefreshCw size={14} />
                            <span>{t('usage_stats.refresh')}</span>
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {apiKeyOptionsError && <div className={styles.errorBox}>{apiKeyOptionsError}</div>}
            {activeTab === 'overview' && error && <div className={styles.errorBox}>{error === 'AUTH_REQUIRED' ? t('auth.session_expired') : error}</div>}
            {activeTab === 'ai-provider' && credentialsError && <div className={styles.errorBox}>{credentialsError}</div>}
            {activeTab === 'model-info' && modelInfoError && <div className={styles.errorBox}>{modelInfoError === 'AUTH_REQUIRED' ? t('auth.session_expired') : modelInfoError}</div>}

            {activeTab === 'overview' && (
              <>
                <StatCards
                  usage={usage}
                  loading={overviewDisplayLoading}
                  sparklines={{
                    requests: requestsSparkline,
                    tokens: tokensSparkline,
                    rpm: rpmSparkline,
                    tpm: tpmSparkline,
                    cost: costSparkline
                  }}
                />

                <ServiceHealthCard usage={usage} loading={overviewDisplayLoading} />

                <TokenBreakdownChart
                  usage={usage}
                  loading={overviewDisplayLoading}
                  isDark={isDark}
                  isMobile={isMobile}
                  hourWindowHours={hourWindowHours}
                  endMs={filterWindowEndMs}
                  includeFinalHourBucket={includeFinalHourBucket}
                  preferredPeriod={preferredOverviewChartPeriod}
                />

                <CostTrendChart
                  usage={usage}
                  loading={overviewDisplayLoading}
                  isDark={isDark}
                  isMobile={isMobile}
                  hourWindowHours={hourWindowHours}
                  endMs={filterWindowEndMs}
                  includeFinalHourBucket={includeFinalHourBucket}
                  preferredPeriod={preferredOverviewChartPeriod}
                />

                <ChartLineSelector
                  chartLines={chartLines}
                  modelNames={overviewModelNames}
                  maxLines={MAX_CHART_LINES}
                  onChange={handleChartLinesChange}
                />

                <div className={styles.chartsGrid}>
                  <UsageChart
                    title={t('usage_stats.requests_trend')}
                    period={requestsPeriod}
                    chartData={requestsChartData}
                    chartOptions={requestsChartOptions}
                    loading={overviewDisplayLoading}
                    isMobile={isMobile}
                    emptyText={t('usage_stats.no_data')}
                  />
                  <UsageChart
                    title={t('usage_stats.tokens_trend')}
                    period={tokensPeriod}
                    chartData={tokensChartData}
                    chartOptions={tokensChartOptions}
                    loading={overviewDisplayLoading}
                    isMobile={isMobile}
                    emptyText={t('usage_stats.no_data')}
                  />
                </div>
              </>
            )}

            {activeTab === 'analysis' && (
              <>
                {analysisError && <div className={styles.errorBox}>{analysisError === 'AUTH_REQUIRED' ? t('auth.session_expired') : analysisError}</div>}
                <AnalysisPanel analysis={analysisData} loading={analysisLoading} isDark={isDark} isMobile={isMobile} />
              </>
            )}

            {activeTab === 'events' && (
              <>
                {eventsError && <div className={styles.errorBox}>{eventsError === 'AUTH_REQUIRED' ? t('auth.session_expired') : eventsError}</div>}
                <RequestEventsDetailsCard
                  events={eventsData}
                  loading={eventsLoading}
                  page={eventsPage}
                  pageSize={eventsPageSize}
                  pageSizeOptions={REQUEST_EVENTS_PAGE_SIZES}
                  totalCount={eventsTotalCount}
                  totalPages={eventsTotalPages}
                  modelOptions={eventsModelOptions}
                  sourceOptions={eventsSourceOptions}
                  modelFilter={eventsModelFilter}
                  sourceFilter={eventsSourceFilter}
                  resultFilter={eventsResultFilter}
                  modelPrices={eventModelPrices}
                  onPageChange={setEventsPage}
                  onPageSizeChange={handleEventsPageSizeChange}
                  onModelFilterChange={handleEventsModelFilterChange}
                  onSourceFilterChange={handleEventsSourceFilterChange}
                  onResultFilterChange={handleEventsResultFilterChange}
                />
              </>
            )}

            {activeTab === 'ai-provider' && (
              <AiProviderCredentialsSection
                rows={aiProviderRows}
                total={aiProviderTotal}
                page={aiProviderPage}
                totalPages={aiProviderTotalPages}
                pageSize={aiProviderPageSize}
                sort={aiProviderSort}
                loading={credentialsLoading}
                onPageChange={setAiProviderPage}
                onPageSizeChange={setAiProviderPageSize}
                onSortChange={setAiProviderSort}
              />
            )}

            {activeTab === 'model-info' && (
              <ModelInfoPanel
                availableModels={availableModels}
                pricing={modelPricing}
                loading={modelInfoLoading}
                onApiKeyQuery={queryModelInfoByAPIKey}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
