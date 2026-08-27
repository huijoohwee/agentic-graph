import type { KnowgrphStorageFetchLike } from '@/lib/storage/knowgrphStorageClientTypes'
import { resolveKnowgrphStorageApiUrl } from '@/lib/storage/knowgrphStorageClientTransport'
import {
  buildKnowgrphStorageBrowserLoginPath,
  buildKnowgrphStorageBrowserSessionPath,
} from '@/lib/storage/knowgrphStorageRoutePaths'

const normalizeString = (value: unknown): string => String(value || '').trim()

export type KnowgrphStorageBrowserSessionState = {
  status: 'authenticated' | 'unauthenticated' | 'access-denied' | 'unavailable'
  message?: string
}

export class KnowgrphStorageBrowserSessionOriginError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KnowgrphStorageBrowserSessionOriginError'
  }
}

const getBrowserFetch = (fetchImpl?: KnowgrphStorageFetchLike): KnowgrphStorageFetchLike => {
  if (fetchImpl) return fetchImpl
  if (typeof fetch !== 'function') throw new Error('Browser session checks require fetch support.')
  return fetch
}

const readCurrentBrowserOrigin = (): string => {
  if (typeof window === 'undefined') {
    throw new KnowgrphStorageBrowserSessionOriginError(
      'Cloud sync sign-in is available only in a browser.',
    )
  }
  const origin = normalizeString(window.location?.origin)
  if (!origin || origin === 'null') {
    throw new KnowgrphStorageBrowserSessionOriginError(
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
export const resolveKnowgrphStorageBrowserSessionUrl = (args: {
  path: string
  baseUrl?: string | null
}): URL => {
  const currentOrigin = readCurrentBrowserOrigin()
  const target = new URL(
    resolveKnowgrphStorageApiUrl(args.path, args.baseUrl),
    currentOrigin,
  )
  if (target.origin !== currentOrigin) {
    throw new KnowgrphStorageBrowserSessionOriginError(
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

export const readKnowgrphStorageBrowserSession = async (args: {
  baseUrl?: string | null
  workspaceId?: string | null
  fetchImpl?: KnowgrphStorageFetchLike
} = {}): Promise<KnowgrphStorageBrowserSessionState> => {
  try {
    const sessionUrl = resolveKnowgrphStorageBrowserSessionUrl({
      path: buildKnowgrphStorageBrowserSessionPath(),
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

export const resolveKnowgrphStorageBrowserLoginReturnTo = (value?: string | null): string => {
  const explicit = normalizeString(value)
  if (explicit.startsWith('/') && !explicit.startsWith('//') && !/[\r\n]/.test(explicit)) {
    return explicit
  }
  if (typeof window === 'undefined') return '/'
  const pathname = normalizeString(window.location?.pathname) || '/'
  const search = String(window.location?.search || '')
  return `${pathname}${search}`
}

export const beginKnowgrphStorageBrowserSignIn = (args: {
  baseUrl?: string | null
  returnTo?: string | null
  navigate?: (url: string) => void
} = {}): string => {
  const loginUrl = resolveKnowgrphStorageBrowserSessionUrl({
    path: buildKnowgrphStorageBrowserLoginPath(),
    baseUrl: args.baseUrl,
  })
  loginUrl.searchParams.set(
    'return_to',
    resolveKnowgrphStorageBrowserLoginReturnTo(args.returnTo),
  )
  const destination = loginUrl.toString()
  if (args.navigate) {
    args.navigate(destination)
  } else if (typeof window !== 'undefined') {
    window.location.assign(destination)
  }
  return destination
}
