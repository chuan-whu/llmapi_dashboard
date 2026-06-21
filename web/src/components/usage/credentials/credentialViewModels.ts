import type { UsageIdentity } from '@/lib/types'
import { calculateCacheRate } from '@/utils/usage'

export const CREDENTIALS_PAGE_SIZE = 10

export interface AiProviderCredentialRow {
  identity: UsageIdentity
  displayName: string
  maskedIdentity: string
  providerLabel: string
  typeLabel: string
  authTypeLabel: string
  totalRequests: number
  successCount: number
  failureCount: number
  successRate: number | null
  totalTokens: number
  cacheRate: number | null
  lastUsedText?: string
  statsUpdatedText?: string
}

export interface CredentialIdentityGroups {
  aiProviders: UsageIdentity[]
}

export interface CredentialsPage<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export function splitCredentialIdentities(identities: UsageIdentity[]): CredentialIdentityGroups {
  return identities.reduce<CredentialIdentityGroups>((groups, identity) => {
    if (identity.auth_type === 2) {
      groups.aiProviders.push(identity)
    }
    return groups
  }, { aiProviders: [] })
}

export function paginateCredentials<T>(items: T[], page: number, pageSize = CREDENTIALS_PAGE_SIZE): CredentialsPage<T> {
  const normalizedPageSize = Math.max(1, Math.floor(pageSize))
  const totalPages = Math.max(1, Math.ceil(items.length / normalizedPageSize))
  const normalizedPage = Math.min(Math.max(1, Math.floor(page)), totalPages)
  const start = (normalizedPage - 1) * normalizedPageSize

  return {
    items: items.slice(start, start + normalizedPageSize),
    page: normalizedPage,
    pageSize: normalizedPageSize,
    total: items.length,
    totalPages,
  }
}

export function buildAiProviderCredentialRows(identities: UsageIdentity[]): AiProviderCredentialRow[] {
  return identities.map((identity, index) => {
    const accountLabel = aiProviderAccountLabel(identity, index)
    return {
      identity,
      displayName: accountLabel,
      maskedIdentity: accountLabel,
      providerLabel: '-',
      typeLabel: '-',
      authTypeLabel: '-',
      totalRequests: safeNumber(identity.total_requests),
      successCount: safeNumber(identity.success_count),
      failureCount: safeNumber(identity.failure_count),
      successRate: successRate(identity),
      totalTokens: safeNumber(identity.total_tokens),
      cacheRate: cacheRate(identity),
      lastUsedText: identity.last_used_at,
      statsUpdatedText: identity.stats_updated_at,
    }
  })
}

function aiProviderAccountLabel(identity: UsageIdentity, index: number): string {
  for (const value of [identity.displayName, identity.name, identity.identity]) {
    const trimmed = value?.trim()
    if (trimmed && /^AI account \d+$/.test(trimmed)) {
      return trimmed
    }
  }
  return `AI account ${index + 1}`
}

function successRate(identity: UsageIdentity): number | null {
  const total = safeNumber(identity.total_requests)
  if (total <= 0) {
    return null
  }
  return (safeNumber(identity.success_count) / total) * 100
}

function cacheRate(identity: UsageIdentity): number | null {
  return calculateCacheRate({
    inputTokens: identity.input_tokens,
    cachedTokens: identity.cached_tokens,
    sourceType: identity.type,
  })
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) {
      return trimmed
    }
  }
  return undefined
}

function safeNumber(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0
}
