import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  appPath,
  fetchAnalysis,
  fetchApiKeyOptions,
  fetchAvailableModels,
  fetchDailyQuota,
  fetchPricing,
  fetchStatus,
  fetchUsageEventModelFilterOptions,
  fetchUsageEventSourceFilterOptions,
  fetchUsageEvents,
  fetchUsageIdentities,
  fetchUsageIdentitiesPage,
  fetchUsageOverview,
  logout,
  queryModelInfoByAPIKey,
  tutorialPDFURL,
} from './api'

describe('api client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('builds app paths from the configured base path', () => {
    vi.stubGlobal('window', { __APP_BASE_PATH__: '/usage/' })

    expect(appPath('/dashboard')).toBe('/usage/dashboard')
    expect(appPath('dashboard')).toBe('/usage/dashboard')
  })

  it('reads the runtime tutorial PDF URL only when configured', () => {
    vi.stubGlobal('window', { __TUTORIAL_PDF_URL__: '/usage/api/v1/tutorial.pdf' })
    expect(tutorialPDFURL()).toBe('/usage/api/v1/tutorial.pdf')

    vi.stubGlobal('window', { __TUTORIAL_PDF_URL__: '__TUTORIAL_PDF_URL__' })
    expect(tutorialPDFURL()).toBe('')

    vi.stubGlobal('window', { __TUTORIAL_PDF_URL__: '   ' })
    expect(tutorialPDFURL()).toBe('')
  })

  it('posts logout to the auth endpoint', async () => {
    vi.stubGlobal('window', { __APP_BASE_PATH__: undefined })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response)

    await logout()

    const [url, init] = fetchMock.mock.calls[0]
    expect(new URL(String(url), 'http://localhost').pathname).toBe('/api/v1/auth/logout')
    expect(init).toMatchObject({ credentials: 'include', method: 'POST' })
  })

  it('loads status from the read-only status endpoint', async () => {
    vi.stubGlobal('window', { __APP_BASE_PATH__: undefined })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ timezone: 'Asia/Shanghai', version: 'dev' }),
    } as Response)
    const signal = new AbortController().signal

    const response = await fetchStatus(signal)

    const [url, init] = fetchMock.mock.calls[0]
    expect(response.version).toBe('dev')
    expect(new URL(String(url), 'http://localhost').pathname).toBe('/api/v1/status')
    expect(init).toMatchObject({ credentials: 'include', signal })
  })

  it('loads daily quota from the protected read-only endpoint', async () => {
    vi.stubGlobal('window', { __APP_BASE_PATH__: undefined })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        daily_refresh: { status: 'ok', remaining: '135.75' },
        pay_as_you_go: { status: 'ok', remaining: '42.50' },
      }),
    } as Response)
    const signal = new AbortController().signal

    const response = await fetchDailyQuota(signal)

    const [url, init] = fetchMock.mock.calls[0]
    const parsed = new URL(String(url), 'http://localhost')

    expect(response).toEqual({
      status: 'ok',
      daily_refresh: { status: 'ok', remaining: '135.75' },
      pay_as_you_go: { status: 'ok', remaining: '42.50' },
    })
    expect(parsed.pathname).toBe('/api/v1/daily-quota')
    expect(init).toMatchObject({ credentials: 'include', signal, cache: 'no-store' })
  })

  it('loads model and source filter options without query params', async () => {
    vi.stubGlobal('window', { __APP_BASE_PATH__: undefined })
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: ['claude-sonnet'] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sources: [{ value: 'source-a', label: 'Provider A' }] }),
      } as Response)
    const signal = new AbortController().signal

    const models = await fetchUsageEventModelFilterOptions(signal)
    const sources = await fetchUsageEventSourceFilterOptions(signal)

    const modelURL = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost')
    const sourceURL = new URL(String(fetchMock.mock.calls[1][0]), 'http://localhost')
    expect(models.models).toEqual(['claude-sonnet'])
    expect(sources.sources).toEqual([{ value: 'source-a', label: 'Provider A' }])
    expect(modelURL.pathname).toBe('/api/v1/usage/events/filters/models')
    expect(modelURL.search).toBe('')
    expect(sourceURL.pathname).toBe('/api/v1/usage/events/filters/sources')
    expect(sourceURL.search).toBe('')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include', signal, cache: 'no-store' })
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ credentials: 'include', signal, cache: 'no-store' })
  })

  it('passes usage filters and API key ids as query params', async () => {
    vi.stubGlobal('window', { __APP_BASE_PATH__: undefined })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ usage: emptyUsage(), events: [], total_count: 0, page: 1, page_size: 100, total_pages: 0 }),
    } as Response)
    const signal = new AbortController().signal

    await fetchUsageOverview('24h', undefined, undefined, signal, '9007199254740993')
    await fetchUsageEvents('custom', '2026-04-20T00:00:00Z', '2026-04-21T00:00:00Z', signal, {
      page: 3,
      pageSize: 100,
      model: 'claude-sonnet',
      source: 'authidx-source-a',
      result: 'failed',
      apiKeyId: '9007199254740993',
    })

    const overviewURL = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost')
    const eventsURL = new URL(String(fetchMock.mock.calls[1][0]), 'http://localhost')

    expect(overviewURL.pathname).toBe('/api/v1/usage/overview')
    expect(overviewURL.searchParams.get('api_key_id')).toBe('9007199254740993')
    expect(eventsURL.pathname).toBe('/api/v1/usage/events')
    expect(eventsURL.searchParams.get('range')).toBe('custom')
    expect(eventsURL.searchParams.get('start')).toBe('2026-04-20T00:00:00Z')
    expect(eventsURL.searchParams.get('end')).toBe('2026-04-21T00:00:00Z')
    expect(eventsURL.searchParams.get('page')).toBe('3')
    expect(eventsURL.searchParams.get('page_size')).toBe('100')
    expect(eventsURL.searchParams.get('model')).toBe('claude-sonnet')
    expect(eventsURL.searchParams.get('source')).toBe('authidx-source-a')
    expect(eventsURL.searchParams.get('result')).toBe('failed')
    expect(eventsURL.searchParams.get('api_key_id')).toBe('9007199254740993')
  })

  it('omits empty API key ids from usage requests', async () => {
    vi.stubGlobal('window', { __APP_BASE_PATH__: undefined })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ usage: emptyUsage(), events: [], total_count: 0, page: 1, page_size: 100, total_pages: 0 }),
    } as Response)
    const signal = new AbortController().signal

    await fetchUsageOverview('24h', undefined, undefined, signal, '  ')
    await fetchUsageEvents('24h', undefined, undefined, signal, { apiKeyId: '' })

    for (const call of fetchMock.mock.calls) {
      expect(new URL(String(call[0]), 'http://localhost').searchParams.get('api_key_id')).toBeNull()
    }
  })

  it('loads Analysis from the dedicated endpoint with API key filtering', async () => {
    vi.stubGlobal('window', { __APP_BASE_PATH__: undefined })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        granularity: 'hourly',
        timezone: 'UTC',
        token_usage: [],
        api_key_composition: [],
        api_key_cost_composition: [],
        model_composition: [],
        auth_files_composition: [],
        ai_provider_composition: [],
        heatmap: { api_keys: [], models: [], cells: [] },
      }),
    } as Response)
    const signal = new AbortController().signal

    await fetchAnalysis('custom', '2026-04-20', '2026-04-21', signal, '9007199254740993')

    const analysisURL = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost')
    expect(analysisURL.pathname).toBe('/api/v1/usage/analysis')
    expect(analysisURL.searchParams.get('range')).toBe('custom')
    expect(analysisURL.searchParams.get('start')).toBe('2026-04-20')
    expect(analysisURL.searchParams.get('end')).toBe('2026-04-21')
    expect(analysisURL.searchParams.get('api_key_id')).toBe('9007199254740993')
  })

  it('loads paged and unified usage identities', async () => {
    vi.stubGlobal('window', { __APP_BASE_PATH__: undefined })
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ identities: [], total_count: 25, page: 3, page_size: 10, total_pages: 3 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ identities: [{ id: '1', identity: 'sk-a***1234', auth_type: 2 }] }),
      } as Response)
    const signal = new AbortController().signal

    const page = await fetchUsageIdentitiesPage(signal, {
      authType: 2,
      page: 3,
      pageSize: 10,
      activeOnly: true,
      sort: 'total_requests',
      types: ['openai'],
    })
    const unified = await fetchUsageIdentities(signal)

    const pageURL = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost')
    const unifiedURL = new URL(String(fetchMock.mock.calls[1][0]), 'http://localhost')
    expect(page.total_count).toBe(25)
    expect(pageURL.pathname).toBe('/api/v1/usage/identities/page')
    expect(pageURL.searchParams.get('auth_type')).toBe('2')
    expect(pageURL.searchParams.get('page')).toBe('3')
    expect(pageURL.searchParams.get('page_size')).toBe('10')
    expect(pageURL.searchParams.get('active_only')).toBe('true')
    expect(pageURL.searchParams.get('sort')).toBe('total_requests')
    expect(pageURL.searchParams.getAll('type')).toEqual(['openai'])
    expect(unified.identities[0].identity).toBe('sk-a***1234')
    expect(unifiedURL.pathname).toBe('/api/v1/usage/identities')
    expect(unifiedURL.search).toBe('')
  })

  it('loads API key options for the usage filters', async () => {
    vi.stubGlobal('window', { __APP_BASE_PATH__: undefined })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ options: [{ id: '123', label: 'sk-a*****************3456' }] }),
    } as Response)
    const signal = new AbortController().signal

    const options = await fetchApiKeyOptions(signal)

    const [url, init] = fetchMock.mock.calls[0]
    expect(options.options[0]).toEqual({ id: '123', label: 'sk-a*****************3456' })
    expect(new URL(String(url), 'http://localhost').pathname).toBe('/api/v1/usage/api-keys/options')
    expect(init).toMatchObject({ credentials: 'include', signal, cache: 'no-store' })
  })

  it('loads available models and pricing from read-only model endpoints', async () => {
    vi.stubGlobal('window', { __APP_BASE_PATH__: undefined })
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: ['gpt-5', 'gpt-5-mini'] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pricing: [{ model: 'gpt-5', prompt_price_per_1m: 1, completion_price_per_1m: 2, cache_price_per_1m: 0.1 }] }),
      } as Response)
    const signal = new AbortController().signal

    const models = await fetchAvailableModels(signal)
    const pricing = await fetchPricing(signal)

    expect(models.models).toEqual(['gpt-5', 'gpt-5-mini'])
    expect(pricing.pricing[0].model).toBe('gpt-5')
    expect(new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost').pathname).toBe('/api/v1/models/available')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include', signal, cache: 'no-store' })
    expect(new URL(String(fetchMock.mock.calls[1][0]), 'http://localhost').pathname).toBe('/api/v1/pricing')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ credentials: 'include', signal })
  })

  it('queries OhMyGPT model info by API key', async () => {
    vi.stubGlobal('window', { __APP_BASE_PATH__: undefined })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ statusCode: 200, message: 'ok', data: [] }),
    } as Response)
    const signal = new AbortController().signal

    const response = await queryModelInfoByAPIKey(' sk-test ', signal)

    const [url, init] = fetchMock.mock.calls[0]
    const parsed = new URL(String(url), 'http://localhost')

    expect(response).toEqual({ statusCode: 200, message: 'ok', data: [] })
    expect(parsed.pathname).toBe('/api/v1/models/query')
    expect(init).toMatchObject({ credentials: 'include', method: 'POST', signal, cache: 'no-store' })
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init?.body).toBe(JSON.stringify({ apiKey: 'sk-test' }))
  })
})

function emptyUsage() {
  return {
    total_requests: 0,
    success_count: 0,
    failure_count: 0,
    total_tokens: 0,
    requests_by_day: {},
    requests_by_hour: {},
    tokens_by_day: {},
    tokens_by_hour: {},
  }
}
