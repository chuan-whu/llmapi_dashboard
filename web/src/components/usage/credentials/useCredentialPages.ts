import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, fetchUsageIdentitiesPage, type UsageIdentityPageSort } from '@/lib/api'
import type { UsageIdentity } from '@/lib/types'
import { CREDENTIALS_PAGE_SIZE } from './credentialViewModels'

interface UseCredentialPagesOptions {
  enabledAiProviders: boolean
  onAuthRequired?: () => void
}

export const CREDENTIAL_PAGES_REFRESH_INTERVAL_MS = 60 * 1000

export interface CredentialPagesState {
  aiProviderIdentities: UsageIdentity[]
  aiProviderTotal: number
  aiProviderTotalPages: number
  aiProviderPage: number
  aiProviderPageSize: number
  aiProviderSort: UsageIdentityPageSort
  setAiProviderPage: (page: number) => void
  setAiProviderPageSize: (pageSize: number) => void
  setAiProviderSort: (sort: UsageIdentityPageSort) => void
  loading: boolean
  error: string
  refresh: () => Promise<void>
}

export function useCredentialPages({ enabledAiProviders, onAuthRequired }: UseCredentialPagesOptions): CredentialPagesState {
  const [aiProviderIdentities, setAiProviderIdentities] = useState<UsageIdentity[]>([])
  const [aiProviderTotal, setAiProviderTotal] = useState(0)
  const [aiProviderTotalPages, setAiProviderTotalPages] = useState(0)
  const [aiProviderPage, setAiProviderPage] = useState(1)
  const [aiProviderPageSize, setAiProviderPageSizeState] = useState(CREDENTIALS_PAGE_SIZE)
  const [aiProviderSort, setAiProviderSortState] = useState<UsageIdentityPageSort>('total_requests')
  const [aiProvidersLoading, setAiProvidersLoading] = useState(false)
  const [aiProvidersError, setAiProvidersError] = useState('')
  const aiProvidersRequestControllerRef = useRef<AbortController | null>(null)

  const setAiProviderPageSize = useCallback((pageSize: number) => {
    setAiProviderPage(1)
    setAiProviderPageSizeState(pageSize)
  }, [])

  const setAiProviderSort = useCallback((sort: UsageIdentityPageSort) => {
    setAiProviderPage(1)
    setAiProviderSortState(sort)
  }, [])

  const refreshAiProviders = useCallback(async () => {
    aiProvidersRequestControllerRef.current?.abort()
    const controller = new AbortController()
    aiProvidersRequestControllerRef.current = controller

    setAiProvidersLoading(true)
    setAiProvidersError('')
    try {
      const response = await fetchUsageIdentitiesPage(controller.signal, {
        authType: 2,
        sort: aiProviderSort,
        page: aiProviderPage,
        pageSize: aiProviderPageSize,
      })
      if (aiProvidersRequestControllerRef.current !== controller) {
        return
      }
      setAiProviderIdentities(response.identities ?? [])
      setAiProviderTotal(response.total_count ?? 0)
      setAiProviderTotalPages(response.total_pages ?? 0)
    } catch (nextError) {
      if (controller.signal.aborted) {
        return
      }
      if (nextError instanceof ApiError && nextError.status === 401) {
        onAuthRequired?.()
        return
      }
      if (aiProvidersRequestControllerRef.current === controller) {
        setAiProviderIdentities([])
        setAiProviderTotal(0)
        setAiProviderTotalPages(0)
      }
      setAiProvidersError(nextError instanceof Error ? nextError.message : 'Failed to load usage identities')
    } finally {
      if (aiProvidersRequestControllerRef.current === controller) {
        setAiProvidersLoading(false)
        aiProvidersRequestControllerRef.current = null
      }
    }
  }, [aiProviderPage, aiProviderPageSize, aiProviderSort, onAuthRequired])

  const refresh = useCallback(async () => {
    if (enabledAiProviders) {
      await refreshAiProviders()
    }
  }, [enabledAiProviders, refreshAiProviders])

  useEffect(() => {
    if (!enabledAiProviders) {
      aiProvidersRequestControllerRef.current?.abort()
      aiProvidersRequestControllerRef.current = null
      setAiProvidersLoading(false)
      return
    }
    void refreshAiProviders()
    const intervalID = window.setInterval(() => {
      void refreshAiProviders()
    }, CREDENTIAL_PAGES_REFRESH_INTERVAL_MS)
    return () => {
      window.clearInterval(intervalID)
      aiProvidersRequestControllerRef.current?.abort()
      aiProvidersRequestControllerRef.current = null
    }
  }, [enabledAiProviders, refreshAiProviders])

  return {
    aiProviderIdentities,
    aiProviderTotal,
    aiProviderTotalPages,
    aiProviderPage,
    aiProviderPageSize,
    aiProviderSort,
    setAiProviderPage,
    setAiProviderPageSize,
    setAiProviderSort,
    loading: enabledAiProviders && aiProvidersLoading,
    error: enabledAiProviders ? aiProvidersError : '',
    refresh,
  }
}
