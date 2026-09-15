import type { AgenticGraphStorageFetchLike } from '@/lib/storage/agentic-graph-storage-client-types'
import { resolveAgenticGraphStorageApiUrl } from '@/lib/storage/agentic-graph-storage-client-transport'
import {
  buildAgenticGraphStorageBrowserLoginPath,
  buildAgenticGraphStorageBrowserSessionPath,
} from '@/lib/storage/agentic-graph-storage-route-paths'

const normalizeString = (value: unknown): string => String(value || '').trim()

export type AgenticGraphStorageBrowserSessionState = {
  status: 'authenticated' | 'unauthenticated' | 'access-denied' | 'unavailable'
  message?: string
  userId?: string
  workspaces?: { id: string; title: string; role: string }[]
}

export class AgenticGraphStorageBrowserSessionOriginError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgenticGraphStorageBrowserSessionOriginError'
  }
}

const getBrowserFetch = (fetchImpl?: AgenticGraphStorageFetchLike): AgenticGraphStorageFetchLike => {
  if (fetchImpl) return fetchImpl
  if (typeof fetch !== 'function') throw new Error('Browser session checks require fetch support.')
  return fetch
}

const readCurrentBrowserOrigin = (): string => {
  if (typeof window === 'undefined') {
    throw new AgenticGraphStorageBrowserSessionOriginError(
      'Cloud sync sign-in is available only in a browser.',
    )
  }
  const origin = normalizeString(window.location?.origin)
  if (!origin || origin === 'null') {
    throw new AgenticGraphStorageBrowserSessionOriginError(
      'Cloud sync sign-in requires a browser origin.',
    )
  }
  return origin
}

/**
 * Browser sessions are intentionally same-origin. The opaque session cookie
 * is HttpOnly and must never be turned into a Vite variable or an Authorization
 * header. A cross-origin storage base therefore fails before a network call.
 */
export const resolveAgenticGraphStorageBrowserSessionUrl = (args: {
  path: string
  baseUrl?: string | null
}): URL => {
  const currentOrigin = readCurrentBrowserOrigin()
  const target = new URL(
    resolveAgenticGraphStorageApiUrl(args.path, args.baseUrl),
    currentOrigin,
  )
  if (target.origin !== currentOrigin) {
    throw new AgenticGraphStorageBrowserSessionOriginError(
      'Cloud sync sign-in requires a same-origin storage endpoint.',
    )
  }
  return target
}

const parseJson = async (response: Response): Promise<Record<string, unknown> | null> => {
  try {
    const payload = await response.json()
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

export const readAgenticGraphStorageBrowserSession = async (args: {
  baseUrl?: string | null
  workspaceId?: string | null
  fetchImpl?: AgenticGraphStorageFetchLike
  signal?: AbortSignal
} = {}): Promise<AgenticGraphStorageBrowserSessionState> => {
  resumeAgenticGraphStorageBrowserSignIn()
  try {
    const sessionUrl = resolveAgenticGraphStorageBrowserSessionUrl({
      path: buildAgenticGraphStorageBrowserSessionPath(),
      baseUrl: args.baseUrl,
    })
    const workspaceId = normalizeString(args.workspaceId)
    if (workspaceId) sessionUrl.searchParams.set('workspace_id', workspaceId)
    const response = await getBrowserFetch(args.fetchImpl)(
      sessionUrl.toString(),
      {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
        signal: args.signal,
      },
    )
    if (response.status === 401) return { status: 'unauthenticated' }
    if (response.status === 403) return { status: 'access-denied' }
    const payload = await parseJson(response)
    if (response.ok && payload?.ok === true && payload.authenticated === true) {
      if (!workspaceId && typeof payload.userId === 'string' && Array.isArray(payload.workspaces)
        && payload.workspaces.length <= 50 && payload.workspaces.every(value => value && typeof value === 'object'
          && typeof value.id === 'string' && typeof value.title === 'string' && typeof value.role === 'string')) {
        return { status: 'authenticated', userId: payload.userId, workspaces: payload.workspaces }
      }
      return { status: 'authenticated' }
    }
    return {
      status: 'unavailable',
      message: `Cloud sync session is unavailable (${response.status}).`,
    }
  } catch (error) {
    return {
      status: 'unavailable',
      message: error instanceof Error ? error.message : 'Cloud sync session is unavailable.',
    }
  }
}

export const resolveAgenticGraphStorageBrowserLoginReturnTo = (value?: string | null): string => {
  const explicit = normalizeString(value)
  if (explicit.startsWith('/') && !explicit.startsWith('//') && !/[\r\n]/.test(explicit)) {
    return explicit
  }
  if (typeof window === 'undefined') return '/'
  const pathname = normalizeString(window.location?.pathname) || '/'
  const search = String(window.location?.search || '')
  return `${pathname}${search}`
}

export const beginAgenticGraphStorageBrowserSignIn = (args: {
  baseUrl?: string | null
  returnTo?: string | null
  navigate?: (url: string) => void
} = {}): string => {
  const loginUrl = resolveAgenticGraphStorageBrowserSessionUrl({
    path: buildAgenticGraphStorageBrowserLoginPath(),
    baseUrl: args.baseUrl,
  })
  loginUrl.searchParams.set(
    'return_to',
    resolveAgenticGraphStorageBrowserLoginReturnTo(args.returnTo),
  )
  if (!args.navigate) {
    const returnUrl = new URL(loginUrl.searchParams.get('return_to')!, loginUrl.origin)
    returnUrl.searchParams.set('kgAuth', 'complete')
    loginUrl.searchParams.set('return_to', returnUrl.pathname + returnUrl.search)
  }
  if (typeof window !== 'undefined' && window.location?.origin) loginUrl.searchParams.set('return_origin', window.location.origin)
  const destination = loginUrl.toString()
  if (args.navigate) {
    args.navigate(destination)
  } else if (typeof window !== 'undefined') {
    void import('./StorageAuthLightbox').then(module => module.openStorageAuthLightbox(destination, readAgenticGraphStorageBrowserSession))
      .catch(() => window.location.assign(destination))
  }
  return destination
}

/** Consume a non-secret return marker once; provider state and credentials stay server-side. */
export const resumeAgenticGraphStorageBrowserSignIn = (): void => {
  if (typeof window === 'undefined') return
  const href = normalizeString(window.location?.href)
  if (!href) return
  const url = new URL(href)
  if (url.searchParams.get('kgAuth') !== 'complete') return
  url.searchParams.delete('kgAuth')
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  if (typeof HTMLDialogElement === 'undefined' || typeof HTMLDialogElement.prototype.showModal !== 'function') return
  beginAgenticGraphStorageBrowserSignIn()
}

// This small client is already used by Source Files; load the panel only for an OAuth return.
if (typeof window !== 'undefined') queueMicrotask(resumeAgenticGraphStorageBrowserSignIn)
