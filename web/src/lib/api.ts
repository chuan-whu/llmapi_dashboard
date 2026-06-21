import { type AnalysisResponse, type ApiKeyOptionsResponse, type AuthSessionResponse, type AvailableModelsResponse, type DailyQuotaResponse, type ModelInfoQueryResponse, type PricingResponse, type StatusResponse, type UsageEventModelFilterOptionsResponse, type UsageEventSourceFilterOptionsResponse, type UsageIdentitiesPageResponse, type UsageIdentitiesResponse, type UsageEventsResponse, type UsageIdentityAuthType, type UsageOverviewResponse } from './types'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const APP_BASE_PATH_PLACEHOLDER = '__APP_BASE_PATH__'
const TUTORIAL_PDF_URL_PLACEHOLDER = '__TUTORIAL_PDF_URL__'

declare global {
  interface Window {
    __APP_BASE_PATH__?: string
    __TUTORIAL_PDF_URL__?: string
  }
}

function normalizeBasePath(basePath: string | undefined): string {
  if (!basePath || basePath === '/' || basePath === APP_BASE_PATH_PLACEHOLDER) {
    return ''
  }
  return basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
}

export function appPath(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizeBasePath(window.__APP_BASE_PATH__)}${normalizedPath}`
}

export function apiPath(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizeBasePath(window.__APP_BASE_PATH__)}/api/v1${normalizedPath}`
}

export function tutorialPDFURL(): string {
  const value = window.__TUTORIAL_PDF_URL__?.trim()
  if (!value || value === TUTORIAL_PDF_URL_PLACEHOLDER) {
    return ''
  }
  return value
}

async function parseApiError(response: Response, fallback: string): Promise<never> {
  let message = fallback
  try {
    const payload = await response.json() as { error?: string }
    if (payload.error) {
      message = payload.error
    }
  } catch {
    // ignore invalid error payloads
  }
  throw new ApiError(message, response.status)
}

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    credentials: 'include',
    ...init,
  })
}

export async function getSession(signal?: AbortSignal): Promise<AuthSessionResponse> {
  const response = await apiFetch(apiPath('/auth/session'), { signal })
  if (!response.ok) {
    await parseApiError(response, `Failed to load auth session: ${response.status}`)
  }
  return response.json()
}

export async function login(password: string): Promise<void> {
  const response = await apiFetch(apiPath('/auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  })
  if (!response.ok) {
    await parseApiError(response, `Failed to login: ${response.status}`)
  }
}

export async function logout(): Promise<void> {
  const response = await apiFetch(apiPath('/auth/logout'), {
    method: 'POST',
  })
  if (!response.ok) {
    await parseApiError(response, `Failed to logout: ${response.status}`)
  }
}

export async function fetchUsageOverview(range: string, start?: string, end?: string, signal?: AbortSignal, apiKeyId?: string): Promise<UsageOverviewResponse> {
  const params = new URLSearchParams()
  params.set('range', range)
  if (start) {
    params.set('start', start)
  }
  if (end) {
    params.set('end', end)
  }
  const selectedAPIKeyId = apiKeyId?.trim()
  if (selectedAPIKeyId) {
    params.set('api_key_id', selectedAPIKeyId)
  }
  const query = params.toString()
  const response = await apiFetch(`${apiPath('/usage/overview')}${query ? `?${query}` : ''}`, { signal })
  if (!response.ok) {
    await parseApiError(response, `Failed to load usage overview: ${response.status}`)
  }
  return response.json()
}

export interface FetchUsageEventsOptions {
  page?: number
  pageSize?: number
  model?: string
  source?: string
  result?: string
  apiKeyId?: string
}

export async function fetchUsageEventModelFilterOptions(signal?: AbortSignal): Promise<UsageEventModelFilterOptionsResponse> {
  const response = await apiFetch(apiPath('/usage/events/filters/models'), { signal, cache: 'no-store' })
  if (!response.ok) {
    await parseApiError(response, `Failed to load usage event model filters: ${response.status}`)
  }
  return response.json()
}

export async function fetchUsageEventSourceFilterOptions(signal?: AbortSignal): Promise<UsageEventSourceFilterOptionsResponse> {
  const response = await apiFetch(apiPath('/usage/events/filters/sources'), { signal, cache: 'no-store' })
  if (!response.ok) {
    await parseApiError(response, `Failed to load usage event source filters: ${response.status}`)
  }
  return response.json()
}

export async function fetchUsageEvents(range: string, start?: string, end?: string, signal?: AbortSignal, options?: FetchUsageEventsOptions): Promise<UsageEventsResponse> {
  const params = new URLSearchParams()
  params.set('range', range)
  if (start) {
    params.set('start', start)
  }
  if (end) {
    params.set('end', end)
  }
  if (typeof options?.page === 'number' && Number.isFinite(options.page) && options.page > 0) {
    params.set('page', String(Math.floor(options.page)))
  }
  if (typeof options?.pageSize === 'number' && Number.isFinite(options.pageSize) && options.pageSize > 0) {
    params.set('page_size', String(Math.floor(options.pageSize)))
  }
  const model = options?.model?.trim()
  if (model) {
    params.set('model', model)
  }
  const source = options?.source?.trim()
  if (source) {
    params.set('source', source)
  }
  const result = options?.result?.trim()
  if (result) {
    params.set('result', result)
  }
  const selectedAPIKeyId = options?.apiKeyId?.trim()
  if (selectedAPIKeyId) {
    params.set('api_key_id', selectedAPIKeyId)
  }
  const query = params.toString()
  const response = await apiFetch(`${apiPath('/usage/events')}${query ? `?${query}` : ''}`, { signal })
  if (!response.ok) {
    await parseApiError(response, `Failed to load usage events: ${response.status}`)
  }
  return response.json()
}

export type UsageIdentityPageSort = 'priority' | 'total_requests' | 'total_tokens'

export interface FetchUsageIdentitiesPageOptions {
  authType?: UsageIdentityAuthType
  activeOnly?: boolean
  types?: string[]
  sort?: UsageIdentityPageSort
  page?: number
  pageSize?: number
}

export async function fetchUsageIdentities(signal?: AbortSignal): Promise<UsageIdentitiesResponse> {
  const response = await apiFetch(apiPath('/usage/identities'), { signal })
  if (!response.ok) {
    await parseApiError(response, `Failed to load usage identities: ${response.status}`)
  }
  return response.json()
}

export async function fetchUsageIdentitiesPage(signal?: AbortSignal, options?: FetchUsageIdentitiesPageOptions): Promise<UsageIdentitiesPageResponse> {
  // Credentials 两个分区共用分页接口，通过 auth_type 控制服务端过滤。
  const params = new URLSearchParams()
  if (options?.authType) {
    params.set('auth_type', String(options.authType))
  }
  if (typeof options?.activeOnly === 'boolean') {
    params.set('active_only', String(options.activeOnly))
  }
  if (options?.sort) {
    params.set('sort', options.sort)
  }
  for (const type of options?.types ?? []) {
    if (type !== '') {
      params.append('type', type)
    }
  }
  if (typeof options?.page === 'number' && Number.isFinite(options.page) && options.page > 0) {
    params.set('page', String(Math.floor(options.page)))
  }
  if (typeof options?.pageSize === 'number' && Number.isFinite(options.pageSize) && options.pageSize > 0) {
    params.set('page_size', String(Math.floor(options.pageSize)))
  }
  const query = params.toString()
  const response = await apiFetch(`${apiPath('/usage/identities/page')}${query ? `?${query}` : ''}`, { signal })
  if (!response.ok) {
    await parseApiError(response, `Failed to load usage identities page: ${response.status}`)
  }
  return response.json()
}

export async function fetchAnalysis(range: string, start?: string, end?: string, signal?: AbortSignal, apiKeyId?: string): Promise<AnalysisResponse> {
  const params = new URLSearchParams()
  params.set('range', range)
  if (start) {
    params.set('start', start)
  }
  if (end) {
    params.set('end', end)
  }
  const selectedAPIKeyId = apiKeyId?.trim()
  if (selectedAPIKeyId) {
    params.set('api_key_id', selectedAPIKeyId)
  }
  const query = params.toString()
  const response = await apiFetch(`${apiPath('/usage/analysis')}${query ? `?${query}` : ''}`, { signal })
  if (!response.ok) {
    await parseApiError(response, `Failed to load analysis: ${response.status}`)
  }
  return response.json()
}


export async function fetchApiKeyOptions(signal?: AbortSignal): Promise<ApiKeyOptionsResponse> {
  const response = await apiFetch(apiPath('/usage/api-keys/options'), { signal, cache: 'no-store' })
  if (!response.ok) {
    await parseApiError(response, `Failed to load API key options: ${response.status}`)
  }
  return response.json()
}

export async function fetchAvailableModels(signal?: AbortSignal): Promise<AvailableModelsResponse> {
  const response = await apiFetch(apiPath('/models/available'), { signal, cache: 'no-store' })
  if (!response.ok) {
    await parseApiError(response, `Failed to load available models: ${response.status}`)
  }
  return response.json()
}

export async function queryModelInfoByAPIKey(apiKey: string, signal?: AbortSignal): Promise<ModelInfoQueryResponse> {
  const response = await apiFetch(apiPath('/models/query'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ apiKey: apiKey.trim() }),
    signal,
    cache: 'no-store',
  })
  if (!response.ok) {
    await parseApiError(response, `Failed to query model info: ${response.status}`)
  }
  return response.json()
}

export async function fetchDailyQuota(signal?: AbortSignal): Promise<DailyQuotaResponse> {
  const response = await apiFetch(apiPath('/daily-quota'), { signal, cache: 'no-store' })
  if (!response.ok) {
    await parseApiError(response, `Failed to load daily quota: ${response.status}`)
  }
  return response.json()
}

export async function fetchStatus(signal?: AbortSignal): Promise<StatusResponse> {
  const response = await apiFetch(apiPath('/status'), { signal })
  if (!response.ok) {
    await parseApiError(response, `Failed to load status: ${response.status}`)
  }
  return response.json()
}

export async function fetchPricing(signal?: AbortSignal): Promise<PricingResponse> {
  const response = await apiFetch(apiPath('/pricing'), { signal })
  if (!response.ok) {
    await parseApiError(response, `Failed to load pricing: ${response.status}`)
  }
  return response.json()
}
