import type { WebGLRenderer } from 'three'

import {
  activateXrImmersiveSession,
  beginXrArPlacementSession,
  endXrArPlacementSession,
  type XrArSessionLike,
  type XrArSpaceLike,
} from '@/features/three/xrArPlacementRuntime'
import {
  buildXrSessionInit,
  requestPreferredXrReferenceSpace,
  resolveXrDomOverlayRoot,
  type XrSessionMode,
} from '@/lib/three/ThreeGraphXrSessionPolicy'
import {
  readXrV2WorkspaceReadiness,
  type XrV2WorkspaceReadinessSnapshot,
} from './xrV2WorkspaceReadinessRuntime'

export const XR_V2_IMMERSIVE_SESSION_SCHEMA =
  'knowgrph-xr-v2-immersive-session/v1' as const

export type XrV2ImmersiveSessionSnapshot = Readonly<{
  schema: typeof XR_V2_IMMERSIVE_SESSION_SCHEMA
  phase: 'off' | 'ready' | 'requesting' | 'active' | 'ending' | 'error'
  mode: XrSessionMode | null
  message: string
  rendererAvailable: boolean
  permissionRequested: boolean
  error: string | null
  revision: number
}>

type SessionLike = XrArSessionLike & Readonly<{
  end?: () => Promise<void>
  addEventListener?: (type: string, listener: () => void) => void
  removeEventListener?: (type: string, listener: () => void) => void
}>

type NavigatorWithXr = Navigator & Readonly<{
  xr?: Readonly<{
    requestSession?: (mode: XrSessionMode, init?: unknown) => Promise<SessionLike>
  }>
}>

type ThreeWebXrSession = Parameters<WebGLRenderer['xr']['setSession']>[0]
type ThreeWebXrReferenceSpace = Parameters<WebGLRenderer['xr']['setReferenceSpace']>[0]

const listeners = new Set<() => void>()
let renderer: WebGLRenderer | null = null
let session: SessionLike | null = null
let endListener: (() => void) | null = null
let generation = 0
let readReadiness = readXrV2WorkspaceReadiness
let snapshot: XrV2ImmersiveSessionSnapshot = Object.freeze({
  schema: XR_V2_IMMERSIVE_SESSION_SCHEMA,
  phase: 'off',
  mode: null,
  message: 'Immersive entry stays unavailable until one pinned capability tier is ready.',
  rendererAvailable: false,
  permissionRequested: false,
  error: null,
  revision: 0,
})

function publish(patch: Partial<XrV2ImmersiveSessionSnapshot>): XrV2ImmersiveSessionSnapshot {
  snapshot = Object.freeze({ ...snapshot, ...patch, revision: snapshot.revision + 1 })
  for (const listener of listeners) listener()
  return snapshot
}

function currentPhaseIs(phase: XrV2ImmersiveSessionSnapshot['phase']): boolean {
  return snapshot.phase === phase
}

export function resolveXrV2ImmersiveMode(
  readiness: Pick<XrV2WorkspaceReadinessSnapshot, 'canOfferUserActions' | 'capabilityTier'>,
): XrSessionMode | null {
  if (!readiness.canOfferUserActions) return null
  if (readiness.capabilityTier === 'webxr-ar') return 'immersive-ar'
  if (readiness.capabilityTier === 'webxr-vr') return 'immersive-vr'
  return null
}

function selectedMode(): XrSessionMode | null {
  return resolveXrV2ImmersiveMode(readReadiness())
}

function bounded<T>(promise: Promise<T>, timeoutMs = 2_000): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>(resolve => setTimeout(resolve, timeoutMs)),
  ])
}

async function waitForRendererQuiescence(ownedRenderer: WebGLRenderer): Promise<void> {
  const deadline = Date.now() + 2_000
  let quietChecks = 0
  while (quietChecks < 3) {
    let occupied = true
    try { occupied = Boolean(ownedRenderer.xr.getSession()) } catch { /* keep waiting */ }
    quietChecks = occupied ? 0 : quietChecks + 1
    if (quietChecks >= 3) return
    if (Date.now() >= deadline) throw new Error('Previous immersive session did not release within 2 seconds')
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

async function releaseSession(
  ownedRenderer: WebGLRenderer | null,
  ownedSession: SessionLike,
  listener: (() => void) | null,
): Promise<void> {
  if (listener) {
    try { ownedSession.removeEventListener?.('end', listener) } catch { /* already detached */ }
  }
  endXrArPlacementSession(ownedSession)
  try { await bounded(Promise.resolve(ownedSession.end?.())) } catch { /* browser owns final teardown */ }
  if (!ownedRenderer) return
  try {
    const active = ownedRenderer.xr.getSession()
    if (!active || active === (ownedSession as unknown as ThreeWebXrSession)) {
      await bounded(ownedRenderer.xr.setSession(null as ThreeWebXrSession))
    }
  } catch { /* renderer is already detached */ }
}

function publishAvailability(): XrV2ImmersiveSessionSnapshot {
  const mode = selectedMode()
  return publish({
    phase: renderer && mode ? 'ready' : 'off',
    mode,
    rendererAvailable: renderer !== null,
    permissionRequested: false,
    message: renderer && mode
      ? (mode === 'immersive-ar' ? 'Pinned tier admits an explicit AR session action.' : 'Pinned tier admits an explicit VR session action.')
      : 'Current pinned tier uses the non-immersive progressive viewer.',
    error: null,
  })
}

function settleBrowserEndedSession(ownedRenderer: WebGLRenderer, endedSession: SessionLike): void {
  endXrArPlacementSession(endedSession)
  try {
    if (ownedRenderer.xr.getSession() === (endedSession as unknown as ThreeWebXrSession)) {
      void bounded(ownedRenderer.xr.setSession(null as ThreeWebXrSession))
    }
  } catch { /* browser already detached the renderer */ }
}

/** Test-only readiness override; production uses the canonical readiness owner. */
export function installXrV2ImmersiveSessionRuntimeTestReadiness(
  reader: typeof readXrV2WorkspaceReadiness,
): () => void {
  if (session || snapshot.phase === 'requesting') throw new Error('cannot override readiness during an immersive operation')
  const previous = readReadiness
  readReadiness = reader
  return () => { readReadiness = previous }
}

export function synchronizeXrV2ImmersiveAvailability(): XrV2ImmersiveSessionSnapshot {
  if (snapshot.phase === 'requesting' || snapshot.phase === 'active' || snapshot.phase === 'ending') {
    return snapshot
  }
  return publishAvailability()
}

export function registerXrV2ImmersiveRenderer(next: WebGLRenderer): () => void {
  renderer = next
  synchronizeXrV2ImmersiveAvailability()
  return () => {
    if (renderer !== next) return
    const hadSession = session !== null
    if (snapshot.phase === 'requesting') generation += 1
    if (hadSession) void stopXrV2ImmersiveSession()
    renderer = null
    if (!hadSession) publishAvailability()
  }
}

export async function startXrV2ImmersiveSession(): Promise<XrV2ImmersiveSessionSnapshot> {
  if (snapshot.phase === 'requesting' || snapshot.phase === 'active' || snapshot.phase === 'ending') return snapshot
  const mode = selectedMode()
  const ownedRenderer = renderer
  const xr = typeof navigator === 'undefined' ? undefined : (navigator as NavigatorWithXr).xr
  if (!mode || !ownedRenderer || !xr?.requestSession) {
    return publish({ phase: 'error', message: 'The pinned tier does not admit an immersive session here.', error: 'immersive-tier-unavailable' })
  }
  const operation = ++generation
  publish({ phase: 'requesting', mode, permissionRequested: false, message: 'Waiting for the previous XR owner to release…', error: null })
  let requested: SessionLike | null = null
  try {
    await waitForRendererQuiescence(ownedRenderer)
    if (operation !== generation || renderer !== ownedRenderer) return snapshot
    publish({ permissionRequested: true, message: 'Waiting for the browser XR permission prompt…' })
    requested = await xr.requestSession(mode, buildXrSessionInit(mode, resolveXrDomOverlayRoot(ownedRenderer)))
    if (operation !== generation || renderer !== ownedRenderer) {
      await releaseSession(ownedRenderer, requested, null)
      if (operation === generation && currentPhaseIs('requesting')) publishAvailability()
      return snapshot
    }
    const handleEnd = () => {
      if (session !== requested) return
      session = null
      endListener = null
      settleBrowserEndedSession(ownedRenderer, requested)
      publishAvailability()
    }
    requested.addEventListener?.('end', handleEnd)
    const referenceSpace = await requestPreferredXrReferenceSpace<XrArSpaceLike>(requested)
    if (operation !== generation || renderer !== ownedRenderer) {
      await releaseSession(ownedRenderer, requested, handleEnd)
      if (operation === generation && currentPhaseIs('requesting')) publishAvailability()
      return snapshot
    }
    ownedRenderer.xr.enabled = true
    ownedRenderer.xr.setReferenceSpaceType(referenceSpace.kind)
    await ownedRenderer.xr.setSession(requested as ThreeWebXrSession)
    ownedRenderer.xr.setReferenceSpace(referenceSpace.space as ThreeWebXrReferenceSpace)
    if (mode === 'immersive-ar') await beginXrArPlacementSession(requested, referenceSpace)
    else activateXrImmersiveSession(requested, mode)
    if (operation !== generation || renderer !== ownedRenderer) {
      await releaseSession(ownedRenderer, requested, handleEnd)
      if (operation === generation && currentPhaseIs('requesting')) publishAvailability()
      return snapshot
    }
    session = requested
    endListener = handleEnd
    return publish({ phase: 'active', mode, message: mode === 'immersive-ar' ? 'AR session active.' : 'VR session active.', error: null })
  } catch (error) {
    if (requested) await releaseSession(ownedRenderer, requested, endListener)
    if (operation !== generation) return snapshot
    const reason = error instanceof Error ? error.message : 'Immersive session request failed'
    return publish({ phase: 'error', message: reason, error: reason })
  }
}

export async function stopXrV2ImmersiveSession(): Promise<XrV2ImmersiveSessionSnapshot> {
  generation += 1
  const ownedSession = session
  const ownedListener = endListener
  const ownedRenderer = renderer
  session = null
  endListener = null
  if (!ownedSession) return publishAvailability()
  publish({ phase: 'ending', message: 'Ending the immersive session…' })
  await releaseSession(ownedRenderer, ownedSession, ownedListener)
  return publishAvailability()
}

export function readXrV2ImmersiveSession(): XrV2ImmersiveSessionSnapshot {
  return snapshot
}

export function subscribeXrV2ImmersiveSession(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
