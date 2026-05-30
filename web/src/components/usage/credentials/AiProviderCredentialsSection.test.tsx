import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AiProviderCredentialsSection } from './AiProviderCredentialsSection'
import type { AiProviderCredentialRow } from './credentialViewModels'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string, params?: { count?: number }) => (key === 'usage_stats.credentials_count' ? `${params?.count ?? 0}` : key),
  }),
}))

describe('AiProviderCredentialsSection', () => {
  it('keeps only anonymized account labels without provider details or quota content', () => {
    const row = {
      identity: {
        id: '1',
        name: 'AI account 1',
        auth_type: 2,
        auth_type_name: '',
        identity: 'AI account 1',
        type: '',
        provider: '',
        total_requests: 0,
        success_count: 0,
        failure_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        reasoning_tokens: 0,
        cached_tokens: 0,
        total_tokens: 0,
        last_aggregated_usage_event_id: '0',
        is_deleted: false,
        created_at: '2026-05-10T00:00:00Z',
        updated_at: '2026-05-10T00:00:00Z',
      },
      displayName: 'AI account 1',
      maskedIdentity: 'AI account 1',
      providerLabel: '-',
      typeLabel: 'claude',
      authTypeLabel: '-',
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      successRate: null,
      totalTokens: 0,
      cacheRate: null,
      planTypeLabel: 'Team',
      remainingDaysLabel: '25d',
      primaryQuota: { label: '5h' },
      secondaryQuota: { label: 'Weekly' },
    } as AiProviderCredentialRow & Record<string, unknown>

    const html = renderToStaticMarkup(
      <AiProviderCredentialsSection
        rows={[row]}
        total={1}
        page={1}
        totalPages={1}
        pageSize={10}
        sort="total_requests"
        loading={false}
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
        onSortChange={() => undefined}
      />,
    )

    expect(html.match(/usage_stats\.total_requests/g)).toHaveLength(1)
    expect(html.match(/usage_stats\.success_rate/g)).toHaveLength(1)
    expect(html.match(/usage_stats\.total_tokens/g)).toHaveLength(1)
    expect(html.match(/usage_stats\.cache_rate/g)).toHaveLength(1)
    expect(html).toContain('AI account 1')
    expect(html).not.toContain('codex account 1')
    expect(html).not.toContain('openai account 1')
    expect(html).not.toContain('claude account 1')
    expect(html).not.toContain('claude')
    expect(html).not.toContain('anthropic')
    expect(html).not.toContain('sk-provider')
    expect(html).not.toContain('Team')
    expect(html).not.toContain('25d')
    expect(html).not.toContain('5h')
    expect(html).not.toContain('Weekly')
  })

  it('does not trust row display names for AI provider identities', () => {
    const row = {
      identity: {
        id: '1',
        name: 'OpenAI Primary',
        auth_type: 2,
        auth_type_name: 'apikey',
        identity: 'sk-provider-secret',
        type: 'openai',
        provider: 'OpenAI',
        total_requests: 0,
        success_count: 0,
        failure_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        reasoning_tokens: 0,
        cached_tokens: 0,
        total_tokens: 0,
        last_aggregated_usage_event_id: '0',
        is_deleted: false,
        created_at: '2026-05-10T00:00:00Z',
        updated_at: '2026-05-10T00:00:00Z',
      },
      displayName: 'OpenAI Primary',
      maskedIdentity: 'sk-provider-secret',
      providerLabel: 'OpenAI',
      typeLabel: 'openai',
      authTypeLabel: 'apikey',
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      successRate: null,
      totalTokens: 0,
      cacheRate: null,
    } as AiProviderCredentialRow

    const html = renderToStaticMarkup(
      <AiProviderCredentialsSection
        rows={[row]}
        total={1}
        page={1}
        totalPages={1}
        pageSize={10}
        sort="total_requests"
        loading={false}
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
        onSortChange={() => undefined}
      />,
    )

    expect(html).toContain('AI account 1')
    expect(html).not.toContain('OpenAI Primary')
    expect(html).not.toContain('sk-provider-secret')
    expect(html).not.toContain('openai')
    expect(html).not.toContain('apikey')
  })
})
