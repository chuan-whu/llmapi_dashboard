import { useMemo } from 'react'
import {
  buildAiProviderCredentialRows,
  type AiProviderCredentialRow,
} from './credentialViewModels'
import { useCredentialPages } from './useCredentialPages'
import type { UsageIdentityPageSort } from '@/lib/api'

interface UseCredentialsTabDataOptions {
  enabledAiProviders: boolean
  onAuthRequired?: () => void
}

export interface CredentialsTabData {
  aiProviderRows: AiProviderCredentialRow[]
  aiProviderTotal: number
  aiProviderPageSize: number
  aiProviderPage: number
  aiProviderTotalPages: number
  aiProviderSort: UsageIdentityPageSort
  setAiProviderPage: (page: number) => void
  setAiProviderPageSize: (pageSize: number) => void
  setAiProviderSort: (sort: UsageIdentityPageSort) => void
  loading: boolean
  error: string
  refresh: () => Promise<void>
}

export function useCredentialsTabData({ enabledAiProviders, onAuthRequired }: UseCredentialsTabDataOptions): CredentialsTabData {
  const credentialPages = useCredentialPages({ enabledAiProviders, onAuthRequired })

  const aiProviderRows = useMemo(
    () => buildAiProviderCredentialRows(credentialPages.aiProviderIdentities),
    [credentialPages.aiProviderIdentities],
  )

  return {
    aiProviderRows,
    aiProviderTotal: credentialPages.aiProviderTotal,
    aiProviderPageSize: credentialPages.aiProviderPageSize,
    aiProviderPage: credentialPages.aiProviderPage,
    aiProviderTotalPages: credentialPages.aiProviderTotalPages,
    aiProviderSort: credentialPages.aiProviderSort,
    setAiProviderPage: credentialPages.setAiProviderPage,
    setAiProviderPageSize: credentialPages.setAiProviderPageSize,
    setAiProviderSort: credentialPages.setAiProviderSort,
    loading: credentialPages.loading,
    error: credentialPages.error,
    refresh: credentialPages.refresh,
  }
}
