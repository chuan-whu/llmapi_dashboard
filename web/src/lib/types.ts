export type AuthRole = 'admin'

export interface AuthSessionResponse {
  authenticated: boolean
  role?: AuthRole
}

export interface StatusResponse {
  timezone: string
  version?: string
}

export interface UsageOverviewUsageSnapshot {
  total_requests: number
  success_count: number
  failure_count: number
  total_tokens: number
  requests_by_day: Record<string, number>
  requests_by_hour: Record<string, number>
  tokens_by_day: Record<string, number>
  tokens_by_hour: Record<string, number>
}

export interface UsageOverviewSummary {
  request_count: number
  token_count: number
  window_minutes: number
  rpm: number
  tpm: number
  total_cost: number
  cost_available: boolean
  cached_tokens: number
  reasoning_tokens: number
}

export interface UsageOverviewSeries {
  requests: Record<string, number>
  tokens: Record<string, number>
  rpm: Record<string, number>
  tpm: Record<string, number>
  cost: Record<string, number>
  input_tokens: Record<string, number>
  output_tokens: Record<string, number>
  cached_tokens: Record<string, number>
  reasoning_tokens: Record<string, number>
  models?: Record<string, UsageOverviewSeries>
}

export interface UsageOverviewServiceHealthBlock {
  start_time: string
  end_time: string
  success: number
  failure: number
  rate: number
}

export interface UsageOverviewServiceHealth {
  total_success: number
  total_failure: number
  success_rate: number
  rows?: number
  columns?: number
  bucket_seconds?: number
  window_start?: string
  window_end?: string
  block_details: UsageOverviewServiceHealthBlock[]
}

export interface UsageOverviewResponse {
  usage: UsageOverviewUsageSnapshot
  summary?: UsageOverviewSummary
  series?: UsageOverviewSeries
  hourly_series?: UsageOverviewSeries
  daily_series?: UsageOverviewSeries
  service_health?: UsageOverviewServiceHealth
  timezone?: string
  range_start?: string
  range_end?: string
}

export interface UsageEventTokens {
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cached_tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
  total_tokens: number
}

export interface UsageEvent {
  id?: string
  timestamp: string
  api_key?: string
  model: string
  reasoning_effort?: string
  endpoint?: string
  source: string
  source_raw?: string
  source_type?: string
  auth_index?: string
  isDelete?: boolean
  failed: boolean
  latency_ms: number
  ttft_ms?: number
  tokens: UsageEventTokens
}

export interface UsageSourceFilterOption {
  value: string
  label: string
  displayName?: string
}

export interface UsageEventsResponse {
  events: UsageEvent[]
  total_count: number
  page: number
  page_size: number
  total_pages: number
}

export interface UsageEventModelFilterOptionsResponse {
  models: string[]
}

export interface UsageEventSourceFilterOptionsResponse {
  sources: UsageSourceFilterOption[]
}

export type UsageIdentityAuthType = 1 | 2

export interface UsageIdentity {
  id: string
  name: string
  displayName?: string
  auth_type: UsageIdentityAuthType
  auth_type_name: string
  identity: string
  type: string
  provider: string
  prefix: string
  priority?: number
  disabled: boolean
  note?: string
  plan_type?: string
  active_start?: string
  active_until?: string
  total_requests: number
  success_count: number
  failure_count: number
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cached_tokens: number
  total_tokens: number
  last_aggregated_usage_event_id: string
  first_used_at?: string
  last_used_at?: string
  stats_updated_at?: string
  is_deleted: boolean
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface UsageIdentitiesResponse {
  identities: UsageIdentity[]
}

export interface UsageIdentityTypeCount {
  type: string
  count: number
}

export interface UsageIdentitiesPageResponse {
  identities: UsageIdentity[]
  total_count: number
  page: number
  page_size: number
  total_pages: number
  type_counts?: UsageIdentityTypeCount[]
}

export interface AnalysisTokenUsageBucket {
  bucket: string
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  reasoning_tokens: number
  total_tokens: number
  requests: number
}

export interface AnalysisCompositionItem {
  key: string
  label: string
  total_tokens: number
  requests: number
  percent: number
}

export interface AnalysisCostCompositionItem {
  key: string
  label: string
  total_tokens?: number
  requests: number
  percent?: number
  cost: number
  cost_percent: number
}

export interface AnalysisHeatmapCell {
  api_key: string
  model: string
  total_tokens: number
  requests: number
  intensity: number
}

export interface AnalysisHeatmapPayload {
  api_keys: string[]
  models: string[]
  cells: AnalysisHeatmapCell[]
}

export interface AnalysisResponse {
  granularity: 'hourly' | 'daily'
  timezone: string
  range_start?: string
  range_end?: string
  token_usage: AnalysisTokenUsageBucket[]
  api_key_composition: AnalysisCompositionItem[]
  api_key_cost_composition: AnalysisCostCompositionItem[]
  model_composition: AnalysisCompositionItem[]
  auth_files_composition: AnalysisCompositionItem[]
  ai_provider_composition: AnalysisCompositionItem[]
  heatmap: AnalysisHeatmapPayload
}

export interface ApiKeyOption {
  id: string
  label: string
}

export interface ApiKeyOptionsResponse {
  options: ApiKeyOption[]
}

export interface PricingEntry {
  model: string
  prompt_price_per_1m: number
  completion_price_per_1m: number
  cache_price_per_1m: number
}

export interface AvailableModelsResponse {
  models: string[]
}

export interface OhMyGPTAPIKeyToken {
  key?: string
  remark?: string
  created_at?: string
  used_at?: string | null
  expired_at?: string
  used_times?: string | number
  used_fee?: string | number
  max_fee?: string | number
  permissions?: string[]
  is_disabled?: boolean
  [key: string]: unknown
}

export interface ModelInfoQueryResponse {
  statusCode?: number
  message?: string
  data?: OhMyGPTAPIKeyToken[]
  [key: string]: unknown
}

export type DailyQuotaStatus = 'ok' | 'partial' | 'failed'

export interface DailyQuotaBalanceResponse {
  status: DailyQuotaStatus
  remaining?: string
}

export interface DailyQuotaResponse {
  status: DailyQuotaStatus
  daily_refresh?: DailyQuotaBalanceResponse
  pay_as_you_go?: DailyQuotaBalanceResponse
}

export interface PricingResponse {
  pricing: PricingEntry[]
}

export type KeyOverviewTimeRange = '4h' | '8h' | '12h' | '24h' | 'today' | 'yesterday' | '7d' | '30d'

export type UsageTimeRange = KeyOverviewTimeRange | 'custom'

export interface UsageFilterWindow {
  startMs?: number
  endMs?: number
  windowMinutes?: number
}
