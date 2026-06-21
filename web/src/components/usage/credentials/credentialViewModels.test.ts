import { describe, expect, it } from 'vitest'
import type { UsageIdentity } from '@/lib/types'
import {
  CREDENTIALS_PAGE_SIZE,
  buildAiProviderCredentialRows,
  paginateCredentials,
  splitCredentialIdentities,
} from './credentialViewModels'

function identity(overrides: Partial<UsageIdentity>): UsageIdentity {
  return {
    id: overrides.id ?? '1',
    name: overrides.name ?? '',
    auth_type: overrides.auth_type ?? 2,
    auth_type_name: overrides.auth_type_name ?? 'apikey',
    identity: overrides.identity ?? 'authidx-source',
    type: overrides.type ?? 'openai',
    provider: overrides.provider ?? 'OpenAI',
    prefix: overrides.prefix ?? '',
    disabled: overrides.disabled ?? false,
    total_requests: overrides.total_requests ?? 0,
    success_count: overrides.success_count ?? 0,
    failure_count: overrides.failure_count ?? 0,
    input_tokens: overrides.input_tokens ?? 0,
    output_tokens: overrides.output_tokens ?? 0,
    reasoning_tokens: overrides.reasoning_tokens ?? 0,
    cached_tokens: overrides.cached_tokens ?? 0,
    total_tokens: overrides.total_tokens ?? 0,
    last_aggregated_usage_event_id: overrides.last_aggregated_usage_event_id ?? '0',
    first_used_at: overrides.first_used_at,
    last_used_at: overrides.last_used_at,
    stats_updated_at: overrides.stats_updated_at,
    active_start: overrides.active_start,
    active_until: overrides.active_until,
    is_deleted: overrides.is_deleted ?? false,
    created_at: overrides.created_at ?? '2026-05-09T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-05-09T00:00:00Z',
    deleted_at: overrides.deleted_at,
    displayName: overrides.displayName,
  }
}

describe('credentialViewModels', () => {
  it('keeps only AI provider identities in the visible credentials section', () => {
    const groups = splitCredentialIdentities([
      identity({ id: '1', auth_type: 1, identity: 'auth-file' }),
      identity({ id: '2', auth_type: 2, identity: 'api-key' }),
      identity({ id: '3', auth_type: 2, identity: 'deleted-api-key', is_deleted: true }),
    ])

    expect(groups.aiProviders.map((item) => item.identity)).toEqual(['api-key', 'deleted-api-key'])
  })

  it('paginates credentials with a fixed page size of ten', () => {
    const identities = Array.from({ length: 25 }, (_, index) => identity({ id: String(index + 1), identity: `auth-${index + 1}` }))

    const firstPage = paginateCredentials(identities, 1)
    const thirdPage = paginateCredentials(identities, 3)

    expect(CREDENTIALS_PAGE_SIZE).toBe(10)
    expect(firstPage.items).toHaveLength(10)
    expect(firstPage.total).toBe(25)
    expect(firstPage.totalPages).toBe(3)
    expect(thirdPage.items.map((item) => item.identity)).toEqual(['auth-21', 'auth-22', 'auth-23', 'auth-24', 'auth-25'])
  })

  it('builds AI provider rows without exposing provider details or raw identities', () => {
    const rows = buildAiProviderCredentialRows([
      identity({ id: '1', auth_type: 2, identity: 'sk-live-secret-value', name: 'OpenAI Primary', displayName: 'Claude API', type: 'openai', provider: 'OpenAI', auth_type_name: 'apikey', total_requests: 4, success_count: 3, failure_count: 1 }),
      identity({ id: '2', auth_type: 2, identity: 'sk-secondary-secret-value', name: 'codex account 1', displayName: 'Codex Secondary', type: 'codex', provider: 'Codex' }),
    ])

    expect(rows.map((row) => row.displayName)).toEqual(['AI account 1', 'AI account 2'])
    expect(rows.map((row) => row.maskedIdentity)).toEqual(['AI account 1', 'AI account 2'])
    expect(rows.map((row) => row.providerLabel)).toEqual(['-', '-'])
    expect(rows.map((row) => row.typeLabel)).toEqual(['-', '-'])
    expect(rows.map((row) => row.authTypeLabel)).toEqual(['-', '-'])
    expect(rows[0].totalRequests).toBe(4)
    expect(rows[0].successCount).toBe(3)
    expect(rows[0].failureCount).toBe(1)
    expect(rows[0].successRate).toBe(75)
    expect(rows[0].totalTokens).toBe(0)
    expect(rows[0].cacheRate).toBeNull()
    expect('primaryQuota' in rows[0]).toBe(false)
    expect(JSON.stringify(rows.map(({ displayName, maskedIdentity, providerLabel, typeLabel, authTypeLabel }) => ({ displayName, maskedIdentity, providerLabel, typeLabel, authTypeLabel })))).not.toMatch(/OpenAI|Claude|Codex|openai|codex|sk-live|sk-secondary/)
  })
})
