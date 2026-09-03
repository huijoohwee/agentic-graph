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
} = {}): Promise<AgenticGraphStorageBrowserSessionState> => {
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
      },
    )
    if (response.status === 401) return { status: 'unauthenticated' }
    if (response.status === 403) return { status: 'access-denied' }
    const payload = await parseJson(response)
    if (response.ok && payload?.ok === true && payload.authenticated === true) {
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
  const destination = loginUrl.toString()
  if (args.navigate) {
    args.navigate(destination)
  } else if (typeof window !== 'undefined') {
    window.location.assign(destination)
  }
  return destination
}
