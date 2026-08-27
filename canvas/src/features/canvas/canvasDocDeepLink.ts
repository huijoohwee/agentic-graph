import {
  buildAgenticGraphStorageDefaultDocPath,
  buildAgenticGraphStorageDocPath,
  AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID,
  AGENTICGRAPH_STORAGE_ROUTE_PATHS,
} from '@/lib/storage/agenticgraphStorageSyncContract'
import { readEnvString } from '@/lib/config.env'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import {
  encodePublishedDocShareToken,
  PUBLISHED_DOC_SHARE_TOKEN_PARAM,
  resolvePublishedDocIdentity,
} from './canvasDocShareToken.mjs'

const SHARE_DEEP_LINK_PREFIX = '/share/'
const CANVAS_PREVIEW_PARAM = 'kgPreview'
const LIVE_CANVAS_HERO_PREVIEW_PARAM = 'kgLiveHero'
const DEEP_LINK_PARAM = 'kgPath'
export const LOCAL_DOC_PARAM = 'kgDoc'
const LOCAL_DOC_HISTORY_STATE_KEY = '__agenticgraphLocalDocPath'
const WORKSPACE_ID_PARAM = 'kgWorkspaceId'
const CANONICAL_PATH_PARAM = 'kgCanonicalPath'
const APP_BASE_PATH = '/agenticgraph'

const resolveConfiguredStorageDocUrl = (path: string): string => {
  const storageBaseUrl = String(readEnvString('VITE_AGENTICGRAPH_STORAGE_BASE_URL', '') || '').trim()
  if (!storageBaseUrl) return path
  try {
    return new URL(path, storageBaseUrl.endsWith('/') ? storageBaseUrl : `${storageBaseUrl}/`).toString()
  } catch {
    return path
  }
}

export type RemoteDocDeepLink = { kind: 'remote'; workspaceId: string; canonicalPath: string }
export type DefaultRemoteDocDeepLink = { kind: 'default-remote'; canonicalPath: string }
export type LocalDocDeepLink = { kind: 'local'; relativePath: string }
export type DocDeepLink = RemoteDocDeepLink | DefaultRemoteDocDeepLink | LocalDocDeepLink
export type CanvasSourceAuthorityIntent = Readonly<{
  key: string
  error: string | null
}>

const EMPTY_SOURCE_AUTHORITY_INTENT: CanvasSourceAuthorityIntent = Object.freeze({ key: '', error: null })

export function isCanvasDocPreviewRequested(search: string): boolean {
  const normalizedSearch = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(normalizedSearch).get(CANVAS_PREVIEW_PARAM) === '1'
}

export function parseDocDeepLink(search: string): DocDeepLink | null {
  const normalizedSearch = search.startsWith('?') ? search : `?${search}`
  const params = new URLSearchParams(normalizedSearch.slice(1))

  const localRaw = String(params.get(LOCAL_DOC_PARAM) || '').trim()
  if (localRaw) {
    return { kind: 'local', relativePath: localRaw }
  }

  const identity = resolvePublishedDocIdentity({
    shareUrl: normalizedSearch,
    baseUrl: 'https://airvio.co',
    appBasePath: APP_BASE_PATH,
  })
  if (!identity) return null
  return identity.workspaceId
    ? { kind: 'remote', workspaceId: identity.workspaceId, canonicalPath: identity.canonicalPath }
    : { kind: 'default-remote', canonicalPath: identity.canonicalPath }
}

function buildDocDeepLinkIntentKeyFromLink(link: DocDeepLink, preview: number): string {
  if (link.kind === 'local') return JSON.stringify([link.kind, normalizeWorkspacePath(link.relativePath), preview])
  if (link.kind === 'remote') return JSON.stringify([link.kind, link.workspaceId, link.canonicalPath, preview])
  return JSON.stringify([link.kind, link.canonicalPath, preview])
}

export function buildDocDeepLinkIntentKey(search: string): string {
  const link = parseDocDeepLink(search)
  return link ? buildDocDeepLinkIntentKeyFromLink(link, isCanvasDocPreviewRequested(search) ? 1 : 0) : ''
}

function isPublishedDocRoutePath(pathname: string): boolean {
  const normalizedPath = `/${String(pathname || '').trim().replace(/^\/+|\/+$/g, '')}`
  const scopedPath = normalizedPath === APP_BASE_PATH
    ? '/'
    : normalizedPath.startsWith(`${APP_BASE_PATH}/`)
      ? normalizedPath.slice(APP_BASE_PATH.length)
      : normalizedPath
  return /^\/(?:share|doc|doc-default)(?:\/|$)/.test(scopedPath)
}

function buildMalformedSourceAuthorityIntent(pathname: string, search: string): CanvasSourceAuthorityIntent {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const sourceParams = [
    LOCAL_DOC_PARAM,
    PUBLISHED_DOC_SHARE_TOKEN_PARAM,
    WORKSPACE_ID_PARAM,
    CANONICAL_PATH_PARAM,
    DEEP_LINK_PARAM,
  ].filter(name => params.has(name)).map(name => [name, params.get(name)])
  return Object.freeze({
    key: JSON.stringify(['invalid-source', String(pathname || ''), sourceParams]),
    error: 'Invalid Canvas document source route',
  })
}

export function resolveCanvasSourceAuthorityIntent(args: {
  pathname: string
  search: string
}): CanvasSourceAuthorityIntent {
  const pathname = String(args.pathname || '')
  const search = String(args.search || '')
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const preview = isCanvasDocPreviewRequested(search) ? 1 : 0

  if (params.has(LOCAL_DOC_PARAM)) {
    const relativePath = String(params.get(LOCAL_DOC_PARAM) || '').trim()
    if (!relativePath || normalizeWorkspacePath(relativePath) === '/') {
      return buildMalformedSourceAuthorityIntent(pathname, search)
    }
    return Object.freeze({
      key: buildDocDeepLinkIntentKeyFromLink({ kind: 'local', relativePath }, preview),
      error: null,
    })
  }

  const parsedSearchLink = parseDocDeepLink(search)
  if (parsedSearchLink) {
    return Object.freeze({ key: buildDocDeepLinkIntentKeyFromLink(parsedSearchLink, preview), error: null })
  }

  const kgPath = String(params.get(DEEP_LINK_PARAM) || '').trim()
  const hasExplicitPublishedSearch = params.has(PUBLISHED_DOC_SHARE_TOKEN_PARAM)
    || params.has(WORKSPACE_ID_PARAM)
    || params.has(CANONICAL_PATH_PARAM)
    || (params.has(DEEP_LINK_PARAM) && isPublishedDocRoutePath(kgPath))
  if (hasExplicitPublishedSearch) return buildMalformedSourceAuthorityIntent(pathname, search)
  if (!isPublishedDocRoutePath(pathname)) return EMPTY_SOURCE_AUTHORITY_INTENT

  const shareUrl = `${pathname || '/'}${search.startsWith('?') || !search ? search : `?${search}`}`
  const identity = resolvePublishedDocIdentity({
    shareUrl,
    baseUrl: 'https://airvio.co',
    appBasePath: APP_BASE_PATH,
  }) || resolvePublishedDocIdentity({
    shareUrl,
    baseUrl: 'https://airvio.co',
    appBasePath: '/',
  })
  if (!identity) return buildMalformedSourceAuthorityIntent(pathname, search)
  const link: DocDeepLink = identity.workspaceId
    ? { kind: 'remote', workspaceId: identity.workspaceId, canonicalPath: identity.canonicalPath }
    : { kind: 'default-remote', canonicalPath: identity.canonicalPath }
  return Object.freeze({ key: buildDocDeepLinkIntentKeyFromLink(link, preview), error: null })
}

export function readCurrentDocDeepLinkSearch(): string {
  if (typeof window === 'undefined') return ''
  return String(window.location?.search || '')
}

export function readLocalDocDeepLinkPathFromCurrentLocation(): string | null {
  const link = parseDocDeepLink(readCurrentDocDeepLinkSearch())
  if (link) return link.kind === 'local' ? link.relativePath : null
  if (typeof window === 'undefined') return null
  const state = window.history?.state
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null
  const retainedPath = String((state as Record<string, unknown>)[LOCAL_DOC_HISTORY_STATE_KEY] || '').trim()
  return retainedPath || null
}

function buildLocalDocHistoryState(relativePath: string | null): Record<string, unknown> | null {
  const current = window.history?.state
  const next = current && typeof current === 'object' && !Array.isArray(current)
    ? { ...(current as Record<string, unknown>) }
    : {}
  if (relativePath) next[LOCAL_DOC_HISTORY_STATE_KEY] = relativePath
  else delete next[LOCAL_DOC_HISTORY_STATE_KEY]
  return Object.keys(next).length > 0 ? next : null
}

export function clearRetainedLocalDocDeepLinkPath(): void {
  if (typeof window === 'undefined') return
  try {
    const nextState = buildLocalDocHistoryState(null)
    window.history.replaceState(nextState, '')
  } catch {
    void 0
  }
}

export function buildDocViewUrl(workspaceId: string, canonicalPath: string): string {
  return resolveConfiguredStorageDocUrl(buildAgenticGraphStorageDocPath(workspaceId, canonicalPath))
}

export function buildDefaultDocViewUrl(canonicalPath: string): string {
  return resolveConfiguredStorageDocUrl(buildAgenticGraphStorageDefaultDocPath(canonicalPath))
}

export function buildPublishedDocSharePath(args: {
  workspaceId?: string | null
  canonicalPath: string
}): string {
  const token = encodePublishedDocShareToken(args)
  if (!token) return `${APP_BASE_PATH}/`
  return `${APP_BASE_PATH}${SHARE_DEEP_LINK_PREFIX}${encodeURIComponent(token)}`
}

export function buildPublishedDocShareDeepLink(args: {
  workspaceId?: string | null
  canonicalPath: string
}): string {
  return buildPublishedDocSharePath(args)
}

const readPublishedDocShareOrigin = (origin?: string | null): string => {
  const explicitOrigin = String(origin || '').trim()
  if (explicitOrigin) return explicitOrigin.replace(/\/+$/, '')
  const configuredOrigin = String(readEnvString('VITE_AGENTICGRAPH_STORAGE_BASE_URL', '') || '').trim()
  if (configuredOrigin) return configuredOrigin.replace(/\/+$/, '')
  if (typeof window !== 'undefined' && window.location?.origin) {
    return String(window.location.origin || '').replace(/\/+$/, '')
  }
  return 'https://airvio.co'
}

export function buildPublishedDocShareUrl(args: {
  workspaceId?: string | null
  canonicalPath: string
  origin?: string | null
}): string | null {
  const canonicalPath = String(args.canonicalPath || '').trim()
  if (!canonicalPath) return null
  const workspaceId = String(args.workspaceId || '').trim()
  const identity = workspaceId && workspaceId !== AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID
    ? { workspaceId, canonicalPath }
    : { canonicalPath }
  return `${readPublishedDocShareOrigin(args.origin)}${buildPublishedDocShareDeepLink(identity)}`
}

export function buildPublishedDocCanvasEmbedUrl(args: {
  workspaceId?: string | null
  canonicalPath: string
  origin?: string | null
}): string | null {
  const shareUrl = buildPublishedDocShareUrl(args)
  if (!shareUrl) return null
  return appendCanvasPreviewParam(shareUrl)
}

function parsePublishedDocSourceUrl(sourceUrl: string): { workspaceId: string | null; canonicalPath: string } | null {
  const trimmed = String(sourceUrl || '').trim()
  if (!trimmed) return null
  const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://airvio.co'
  let pathname = ''
  try {
    pathname = new URL(trimmed, fallbackOrigin).pathname
  } catch {
    return null
  }
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'
  if (normalizedPath.startsWith(AGENTICGRAPH_STORAGE_ROUTE_PATHS.defaultDocPrefix)) {
    const canonicalPath = decodeURIComponent(normalizedPath.slice(AGENTICGRAPH_STORAGE_ROUTE_PATHS.defaultDocPrefix.length)).trim()
    if (!canonicalPath) return null
    return { workspaceId: null, canonicalPath }
  }
  if (!normalizedPath.startsWith(AGENTICGRAPH_STORAGE_ROUTE_PATHS.docPrefix)) return null
  const suffix = normalizedPath.slice(AGENTICGRAPH_STORAGE_ROUTE_PATHS.docPrefix.length)
  const firstSlash = suffix.indexOf('/')
  if (firstSlash < 1) return null
  const workspaceId = decodeURIComponent(suffix.slice(0, firstSlash)).trim()
  const canonicalPath = decodeURIComponent(suffix.slice(firstSlash + 1)).trim()
  if (!workspaceId || !canonicalPath) return null
  return { workspaceId, canonicalPath }
}

export function buildPublishedDocShareUrlFromSource(args: {
  sourceUrl: string
  origin?: string | null
}): string | null {
  const parsed = parsePublishedDocSourceUrl(args.sourceUrl)
  if (!parsed) return null
  return buildPublishedDocShareUrl({ ...parsed, origin: args.origin })
}

export function buildPublishedDocCanvasEmbedUrlFromSource(args: {
  sourceUrl: string
  origin?: string | null
}): string | null {
  const parsed = parsePublishedDocSourceUrl(args.sourceUrl)
  if (!parsed) return null
  return buildPublishedDocCanvasEmbedUrl({ ...parsed, origin: args.origin })
}

export function appendCanvasPreviewParam(url: string): string | null {
  const trimmed = String(url || '').trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed, typeof window !== 'undefined' ? window.location.origin : 'https://airvio.co')
    parsed.searchParams.set(CANVAS_PREVIEW_PARAM, '1')
    return parsed.toString()
  } catch {
    return null
  }
}

export function buildLocalDocCanvasEmbedUrl(args: {
  relativePath: string
  origin?: string | null
  pathname?: string | null
}): string | null {
  const relativePath = String(args.relativePath || '').trim().replace(/^\/+/, '')
  if (!relativePath) return null
  const origin = String(args.origin || '').trim()
    || (typeof window !== 'undefined' ? String(window.location.origin || '').trim() : '')
  const pathname = String(args.pathname || '').trim()
    || (typeof window !== 'undefined' ? String(window.location.pathname || '/').trim() : '/')
  if (!origin) return null
  try {
    const url = new URL(pathname || '/', origin)
    url.search = ''
    url.hash = ''
    url.searchParams.set(LOCAL_DOC_PARAM, relativePath)
    url.searchParams.set(CANVAS_PREVIEW_PARAM, '1')
    url.searchParams.set(LIVE_CANVAS_HERO_PREVIEW_PARAM, '1')
    return url.toString()
  } catch {
    return null
  }
}

export function isSameOriginCanvasEmbedUrl(url: string, origin?: string | null): boolean {
  const candidate = String(url || '').trim()
  const runtimeOrigin = String(origin || '').trim()
    || (typeof window !== 'undefined' ? String(window.location.origin || '').trim() : '')
  if (!candidate || !runtimeOrigin) return false
  try {
    return new URL(candidate, runtimeOrigin).origin === new URL(runtimeOrigin).origin
  } catch {
    return false
  }
}

export function consumeDeepLinkParams(search: string): void {
  try {
    const link = parseDocDeepLink(search)
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    let changed = false
    if (params.has(LOCAL_DOC_PARAM)) { params.delete(LOCAL_DOC_PARAM); changed = true }
    if (params.has(DEEP_LINK_PARAM)) { params.delete(DEEP_LINK_PARAM); changed = true }
    if (params.has(PUBLISHED_DOC_SHARE_TOKEN_PARAM)) { params.delete(PUBLISHED_DOC_SHARE_TOKEN_PARAM); changed = true }
    if (params.has(WORKSPACE_ID_PARAM)) { params.delete(WORKSPACE_ID_PARAM); changed = true }
    if (params.has(CANONICAL_PATH_PARAM)) { params.delete(CANONICAL_PATH_PARAM); changed = true }
    if (!changed) return
    const next = params.toString()
    const nextUrl = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash || ''}`
    const retainedLocalPath = link?.kind === 'local' ? link.relativePath : null
    const nextState = buildLocalDocHistoryState(retainedLocalPath)
    window.history.replaceState(nextState, '', nextUrl)
    try {
      window.dispatchEvent(new PopStateEvent('popstate', { state: nextState }))
    } catch {
      window.dispatchEvent(new Event('popstate'))
    }
  } catch {
    void 0
  }
}
