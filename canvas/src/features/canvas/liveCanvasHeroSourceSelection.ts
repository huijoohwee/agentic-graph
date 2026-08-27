import { resolvePublishedDocIdentity } from '@/features/canvas/canvasDocShareToken.mjs'
import {
  CANONICAL_STARTUP_DOCUMENT_PATH,
  normalizeLiveCanvasHeroCanvasEmbedUrl,
  resolveCanonicalStartupCanvasEmbedRuntimeUrl,
} from '@/features/canvas/canvasEmbedPresets'
import {
  LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT,
  LIVE_CANVAS_HERO_SOURCE_SESSION_KEY,
} from '@/features/canvas/liveCanvasHeroSourceSelectionContract.mjs'
import {
  resolveWorkspaceRunReadyDemoIdForDocumentPath,
  XR_PHYSICS_RUN_READY_DEMO_ID,
} from '@/features/workspace-fs/workspaceRunReadyDemos'

export { LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT }

export type LiveCanvasHeroSourceSelection = {
  sourcePath: string
  embedUrl: string
}

type LiveCanvasHeroSourceSelectionOptions = Readonly<{
  runtimeOrigin?: string | null
}>

type EmbedDocumentIdentity = Readonly<{
  canonicalPath: string
  kind: 'local' | 'published'
  workspaceId: string | null
}>

type EmbedDocumentIdentityResolution = Readonly<{
  claimed: boolean
  identity: EmbedDocumentIdentity | null
}>

const normalizeDocumentPath = (value: unknown): string => String(value || '')
  .trim()
  .replace(/^workspace:/i, '')
  .replace(/\\/g, '/')
  .replace(/^\/+|\/+$/g, '')

const isPublishedDocumentRoutePath = (value: string): boolean => {
  const scopedPath = String(value || '').trim().replace(/^\/agenticgraph(?=\/|$)/, '')
  return /^\/(?:share|doc|doc-default)(?:\/|$)/.test(scopedPath)
}

const toPublishedEmbedIdentity = (
  value: ReturnType<typeof resolvePublishedDocIdentity>,
): EmbedDocumentIdentity | null => {
  if (!value) return null
  const canonicalPath = normalizeDocumentPath(value.canonicalPath)
  if (!canonicalPath) return null
  return { canonicalPath, kind: 'published', workspaceId: value.workspaceId }
}

const samePublishedIdentity = (left: EmbedDocumentIdentity, right: EmbedDocumentIdentity): boolean => (
  left.canonicalPath === right.canonicalPath && left.workspaceId === right.workspaceId
)

function resolvePublishedDocumentClaims(url: URL): EmbedDocumentIdentityResolution {
  const identities: EmbedDocumentIdentity[] = []
  let claimed = false
  let invalid = false
  const addClaim = (identity: EmbedDocumentIdentity | null): void => {
    claimed = true
    if (identity) identities.push(identity)
    else invalid = true
  }

  if (isPublishedDocumentRoutePath(url.pathname)) {
    const routeUrl = new URL(url.pathname, url.origin)
    addClaim(toPublishedEmbedIdentity(resolvePublishedDocIdentity({
      shareUrl: routeUrl.toString(),
      appBasePath: '/agenticgraph',
    })))
  }
  for (const shareToken of url.searchParams.getAll('kgShare')) {
    addClaim(toPublishedEmbedIdentity(resolvePublishedDocIdentity({ shareToken })))
  }

  const canonicalPaths = [...new Set(url.searchParams.getAll('kgCanonicalPath'))]
  const workspaceIds = [...new Set(url.searchParams.getAll('kgWorkspaceId'))]
  if (canonicalPaths.length || workspaceIds.length) {
    claimed = true
    if (canonicalPaths.length !== 1 || workspaceIds.length > 1) invalid = true
    else {
      const claimUrl = new URL(url.origin)
      claimUrl.searchParams.set('kgCanonicalPath', canonicalPaths[0])
      if (workspaceIds.length === 1) claimUrl.searchParams.set('kgWorkspaceId', workspaceIds[0])
      addClaim(toPublishedEmbedIdentity(resolvePublishedDocIdentity({
        shareUrl: claimUrl.toString(),
        appBasePath: '/agenticgraph',
      })))
    }
  }

  for (const kgPath of url.searchParams.getAll('kgPath')) {
    const pathClaimsPublishedDocument = isPublishedDocumentRoutePath(
      `/${kgPath.replace(/^\/+/, '')}`,
    )
    const claimUrl = new URL(url.origin)
    claimUrl.searchParams.set('kgPath', kgPath)
    const identity = toPublishedEmbedIdentity(resolvePublishedDocIdentity({
      shareUrl: claimUrl.toString(),
      appBasePath: '/agenticgraph',
    }))
    if (pathClaimsPublishedDocument || identity) addClaim(identity)
  }

  const first = identities[0] || null
  if (invalid || (first && identities.some(identity => !samePublishedIdentity(first, identity)))) {
    return { claimed, identity: null }
  }
  return { claimed, identity: first }
}

function resolveEmbedDocumentIdentity(url: URL): EmbedDocumentIdentityResolution {
  const localPaths = [...new Set(url.searchParams.getAll('kgDoc').map(normalizeDocumentPath))]
  const localClaimed = url.searchParams.has('kgDoc')
  const localPath = localPaths.length === 1 ? localPaths[0] : ''
  const published = resolvePublishedDocumentClaims(url)
  const claimed = localClaimed || published.claimed
  if ((localClaimed && (!localPath || localPaths.length !== 1)) || (localPath && published.claimed)) {
    return { claimed, identity: null }
  }
  if (localPath) {
    return { claimed, identity: { canonicalPath: localPath, kind: 'local', workspaceId: null } }
  }
  return { claimed, identity: published.identity }
}

function isCanonicalStartupDocumentPath(value: string): boolean {
  return value === normalizeDocumentPath(CANONICAL_STARTUP_DOCUMENT_PATH)
    || resolveWorkspaceRunReadyDemoIdForDocumentPath(value) === XR_PHYSICS_RUN_READY_DEMO_ID
}

export function resolveLiveCanvasHeroSourceSelection(
  value: Partial<LiveCanvasHeroSourceSelection> | null | undefined,
  options: LiveCanvasHeroSourceSelectionOptions = {},
): LiveCanvasHeroSourceSelection | null {
  const sourcePath = String(value?.sourcePath || '').trim()
  const rawEmbedUrl = String(value?.embedUrl || '').trim()
  if (!sourcePath || !rawEmbedUrl) return null
  let url: URL
  try {
    url = new URL(rawEmbedUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  const sourceDocumentPath = normalizeDocumentPath(sourcePath)
  if (!sourceDocumentPath) return null
  const embedResolution = resolveEmbedDocumentIdentity(url)
  const embedIdentity = embedResolution.identity
  if (embedResolution.claimed && !embedIdentity) return null
  const canonicalSource = isCanonicalStartupDocumentPath(sourceDocumentPath)
  const canonicalEmbed = embedIdentity ? isCanonicalStartupDocumentPath(embedIdentity.canonicalPath) : false
  if (canonicalSource || canonicalEmbed) {
    if (!canonicalSource || !canonicalEmbed || !embedIdentity) return null
    if (embedIdentity.kind === 'published' && embedIdentity.workspaceId !== null) return null
    return {
      sourcePath: CANONICAL_STARTUP_DOCUMENT_PATH,
      embedUrl: resolveCanonicalStartupCanvasEmbedRuntimeUrl(options.runtimeOrigin),
    }
  }
  if (embedIdentity && sourceDocumentPath !== embedIdentity.canonicalPath) return null
  return {
    sourcePath,
    embedUrl: normalizeLiveCanvasHeroCanvasEmbedUrl(url.toString()),
  }
}

export function readLiveCanvasHeroSourceSelection(event: Event): LiveCanvasHeroSourceSelection | null {
  return resolveLiveCanvasHeroSourceSelection((event as CustomEvent<Partial<LiveCanvasHeroSourceSelection>>).detail)
}

export function readPersistedLiveCanvasHeroSourceSelection(): LiveCanvasHeroSourceSelection | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage?.getItem(LIVE_CANVAS_HERO_SOURCE_SESSION_KEY)
    if (!raw) return null
    const selection = resolveLiveCanvasHeroSourceSelection(JSON.parse(raw) as Partial<LiveCanvasHeroSourceSelection>)
    if (!selection) {
      window.sessionStorage?.removeItem(LIVE_CANVAS_HERO_SOURCE_SESSION_KEY)
      return null
    }
    if (JSON.stringify(selection) !== raw) persistLiveCanvasHeroSourceSelection(selection)
    return selection
  } catch {
    try {
      window.sessionStorage?.removeItem(LIVE_CANVAS_HERO_SOURCE_SESSION_KEY)
    } catch {
      void 0
    }
    return null
  }
}

function persistLiveCanvasHeroSourceSelection(selection: LiveCanvasHeroSourceSelection): void {
  try {
    window.sessionStorage?.setItem(LIVE_CANVAS_HERO_SOURCE_SESSION_KEY, JSON.stringify(selection))
  } catch {
    void 0
  }
}

export function selectLiveCanvasHeroSource(selection: LiveCanvasHeroSourceSelection): boolean {
  const normalized = resolveLiveCanvasHeroSourceSelection(selection)
  if (!normalized || typeof window === 'undefined') return false
  persistLiveCanvasHeroSourceSelection(normalized)
  const CustomEventCtor = typeof window.CustomEvent === 'function' ? window.CustomEvent : CustomEvent
  window.dispatchEvent(new CustomEventCtor(LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT, {
    detail: normalized satisfies LiveCanvasHeroSourceSelection,
  }))
  return true
}
