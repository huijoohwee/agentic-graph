import React from 'react'
import { useFrame } from '@react-three/fiber'
import type { WebGLRenderer } from 'three'
import {
  readSpatialCaptureTool,
  readSpatialCaptureToolLabel,
  setSpatialCapturePrimaryMode,
  subscribeSpatialCaptureTool,
} from '@/features/three/xrSpatialCaptureTools'
import type { SpatialCaptureToolId } from '@/features/three/xrSpatialCaptureTools'
import { MinimapSpatialViewCube } from '@/features/minimap/MinimapSpatialViewCube'
import { UI_RESPONSIVE_CANVAS_FLOATING_ACTION_ROW_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import {
  XR_SESSION_MODE_ORDER,
  buildXrSessionInit,
  chooseXrSessionMode,
  detectBrowserCameraCaptureAvailable,
  detectBrowserMotionCaptureAvailable,
  detectBrowserNativeHandoffAvailable,
  requestPreferredXrReferenceSpace,
  resolveXrCapabilitySnapshot,
  resolveXrDomOverlayRoot,
  type XrCapabilityEntryMode,
  type XrSessionReferenceSpaceKind,
  type XrSessionMode,
  type XrSessionSupport,
} from '@/lib/three/ThreeGraphXrSessionPolicy'
import {
  activateXrImmersiveSession,
  beginXrArPlacementSession,
  endXrArPlacementSession,
  readXrArPlacementRuntime,
  resetXrArPlacement,
  subscribeXrArPlacementRuntime,
  type XrArSessionLike,
  type XrArSpaceLike,
} from '@/features/three/xrArPlacementRuntime'
import { isXrPhysicsRunReadyDemoActive } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { openMotionControlSurface } from '@/features/three/motionControlSurfaceRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'

export function OverlayFrameSync({ enabled, scheduleRef }: { enabled: boolean; scheduleRef: React.MutableRefObject<(() => void) | null> }) {
  useFrame(() => {
    if (!enabled) return
    try {
      scheduleRef.current?.()
    } catch {
      void 0
    }
  })
  return null
}

type XrSessionLike = {
  end?: () => Promise<void>
  requestReferenceSpace?: (kind: 'viewer' | XrSessionReferenceSpaceKind) => Promise<XrArSpaceLike>
  addEventListener?: (type: string, listener: () => void) => void
  removeEventListener?: (type: string, listener: () => void) => void
}

type ThreeWebXrSession = Parameters<WebGLRenderer['xr']['setSession']>[0]
type ThreeWebXrReferenceSpace = Parameters<WebGLRenderer['xr']['setReferenceSpace']>[0]

async function releaseXrSession(args: {
  renderer: WebGLRenderer | null
  session: XrSessionLike
  endListener?: (() => void) | null
}): Promise<void> {
  const { renderer, session, endListener } = args
  if (endListener) {
    try {
      session.removeEventListener?.('end', endListener)
    } catch {
      void 0
    }
  }
  endXrArPlacementSession(session as XrArSessionLike)
  try {
    await session.end?.()
  } catch {
    void 0
  }
  if (renderer) {
    try {
      const rendererSession = renderer.xr.getSession()
      if (!rendererSession || rendererSession === (session as unknown as ThreeWebXrSession)) {
        await renderer.xr.setSession(null as ThreeWebXrSession)
      }
    } catch {
      void 0
    }
  }
}

type NavigatorWithXr = Navigator & {
  xr?: {
    isSessionSupported?: (mode: XrSessionMode) => Promise<boolean>
    requestSession?: (mode: string, options?: unknown) => Promise<XrSessionLike>
  }
}

export function CanvasXrEntryPanel({
  active,
  rendererRef,
  surfaceKind = 'graph',
  spatialRuntimeFidelity = 'idle',
  spatialRuntimeStatus = 'idle',
}: {
  active: boolean
  rendererRef: React.MutableRefObject<WebGLRenderer | null>
  surfaceKind?: 'graph' | 'spatial-capture'
  spatialRuntimeFidelity?: 'idle' | 'preview' | 'full'
  spatialRuntimeStatus?: 'idle' | 'loading' | 'ready' | 'empty' | 'error'
}) {
  const markdownDocumentName = useGraphStore(state => state.markdownDocumentName)
  const markdownDocumentText = useGraphStore(state => state.markdownDocumentText)
  const [status, setStatus] = React.useState<'checking' | 'supported' | 'unsupported' | 'requesting' | 'active' | 'ending' | 'error'>('checking')
  const [sessionMode, setSessionMode] = React.useState<XrSessionMode>('immersive-ar')
  const [sessionSupport, setSessionSupport] = React.useState<XrSessionSupport>({})
  const [spatialTool, setSpatialToolState] = React.useState<SpatialCaptureToolId>(readSpatialCaptureTool())
  const sessionRef = React.useRef<XrSessionLike | null>(null)
  const pendingSessionRef = React.useRef<XrSessionLike | null>(null)
  const sessionModeRef = React.useRef<XrSessionMode>(sessionMode)
  const controlsRef = React.useRef<HTMLElement | null>(null)
  const sessionRequestGenerationRef = React.useRef(0)
  const sessionEndListenerRef = React.useRef<(() => void) | null>(null)
  const pendingSessionEndListenerRef = React.useRef<(() => void) | null>(null)
  const [placementCommitted, setPlacementCommitted] = React.useState(false)
  const capabilitySnapshot = React.useMemo(
    () => resolveXrCapabilitySnapshot({
      surfaceKind,
      sessionSupport,
      inlineViewer: active,
      monocularCapture: detectBrowserCameraCaptureAvailable(),
      captureMotion: detectBrowserMotionCaptureAvailable(),
      nativeHandoff: detectBrowserNativeHandoffAvailable(),
    }),
    [active, sessionSupport, surfaceKind],
  )
  const selectedEntryMode: XrCapabilityEntryMode = status === 'active' || status === 'requesting' || status === 'ending'
    ? 'immersive-session'
    : capabilitySnapshot.recommended_entry_mode
  const capabilityDataAttributes = {
    'data-kg-canvas-xr-capability-schema': capabilitySnapshot.schema,
    'data-kg-canvas-xr-entry-mode': selectedEntryMode,
    'data-kg-canvas-xr-recommended-entry-mode': capabilitySnapshot.recommended_entry_mode,
    'data-kg-canvas-xr-inline-viewer': capabilitySnapshot.inline_viewer ? '1' : '0',
    'data-kg-canvas-xr-immersive-viewer': capabilitySnapshot.immersive_viewer ? '1' : '0',
    'data-kg-canvas-xr-monocular-capture': capabilitySnapshot.monocular_capture ? '1' : '0',
    'data-kg-canvas-xr-capture-motion': capabilitySnapshot.capture_motion ? '1' : '0',
    'data-kg-canvas-xr-native-handoff': capabilitySnapshot.native_handoff ? '1' : '0',
    'data-kg-canvas-xr-capability-reasons': capabilitySnapshot.reason_codes.join(' ') || 'none',
  } as const

  React.useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return undefined
    const preventOverlaySelect = (event: Event) => event.preventDefault()
    const synchronizePlacementState = () => {
      const placement = readXrArPlacementRuntime()
      controls.dataset.kgCanvasXrHitTest = placement.phase
      controls.dataset.kgCanvasXrReticle = placement.reticleVisible ? 'tracking' : 'hidden'
      controls.dataset.kgCanvasXrScenePlacement = placement.placementMatrix ? 'placed' : 'unplaced'
      const nextPlacementCommitted = Boolean(placement.placementMatrix)
      setPlacementCommitted(current => current === nextPlacementCommitted ? current : nextPlacementCommitted)
    }
    controls.addEventListener('beforexrselect', preventOverlaySelect)
    synchronizePlacementState()
    const unsubscribe = subscribeXrArPlacementRuntime(synchronizePlacementState)
    return () => {
      controls.removeEventListener('beforexrselect', preventOverlaySelect)
      unsubscribe()
    }
  }, [status])

  React.useEffect(() => {
    sessionModeRef.current = sessionMode
  }, [sessionMode])

  React.useEffect(() => {
    if (!active || surfaceKind !== 'spatial-capture') return undefined
    return subscribeSpatialCaptureTool(setSpatialToolState)
  }, [active, surfaceKind])

  React.useEffect(() => {
    const renderer = rendererRef.current
    if (renderer) renderer.xr.enabled = active
    if (!active) {
      setStatus('checking')
      setSessionSupport({})
      return
    }
    let cancelled = false
    const checkSupport = async () => {
      const xr = typeof navigator !== 'undefined' ? (navigator as NavigatorWithXr).xr : undefined
      if (!xr?.isSessionSupported || !xr?.requestSession) {
        if (!cancelled) setStatus('unsupported')
        return
      }
      try {
        const supportEntries = await Promise.all(
          XR_SESSION_MODE_ORDER.map(async mode => {
            const supported = await xr.isSessionSupported?.(mode).catch(() => false)
            return [mode, supported === true] as const
          }),
        )
        if (cancelled) return
        const support = Object.fromEntries(supportEntries) as XrSessionSupport
        setSessionSupport(support)
        const nextMode = chooseXrSessionMode(support, sessionModeRef.current)
        if (nextMode) {
          setSessionMode(nextMode)
          setStatus('supported')
          return
        }
        setStatus('unsupported')
      } catch {
        if (!cancelled) setStatus('unsupported')
      }
    }
    void checkSupport()
    return () => {
      cancelled = true
      sessionRequestGenerationRef.current += 1
      const activeSession = sessionRef.current
      const activeEndListener = sessionEndListenerRef.current
      const pendingSession = pendingSessionRef.current
      const pendingEndListener = pendingSessionEndListenerRef.current
      sessionRef.current = null
      sessionEndListenerRef.current = null
      pendingSessionRef.current = null
      pendingSessionEndListenerRef.current = null
      if (activeSession) {
        void releaseXrSession({ renderer, session: activeSession, endListener: activeEndListener })
      }
      if (pendingSession && pendingSession !== activeSession) {
        void releaseXrSession({ renderer, session: pendingSession, endListener: pendingEndListener })
      }
      if (!activeSession && !pendingSession) {
        endXrArPlacementSession()
      }
      if (renderer) renderer.xr.enabled = false
    }
  }, [active, rendererRef])

  const startOrEndSession = React.useCallback(async () => {
    const requestGeneration = ++sessionRequestGenerationRef.current
    const existing = sessionRef.current || pendingSessionRef.current
    if (existing) {
      setStatus('ending')
      const existingIsPending = existing === pendingSessionRef.current
      const existingEndListener = existingIsPending
        ? pendingSessionEndListenerRef.current
        : sessionEndListenerRef.current
      if (existingIsPending) {
        pendingSessionRef.current = null
        pendingSessionEndListenerRef.current = null
      } else {
        sessionRef.current = null
        sessionEndListenerRef.current = null
      }
      await releaseXrSession({ renderer: rendererRef.current, session: existing, endListener: existingEndListener })
      if (requestGeneration === sessionRequestGenerationRef.current) {
        setStatus('supported')
      }
      return
    }
    const renderer = rendererRef.current
    const xr = typeof navigator !== 'undefined' ? (navigator as NavigatorWithXr).xr : undefined
    if (!renderer || !xr?.requestSession) {
      setStatus('unsupported')
      return
    }
    setStatus('requesting')
    let requestedSession: XrSessionLike | null = null
    let requestedSessionEndListener: (() => void) | null = null
    try {
      const session = await xr.requestSession(sessionMode, buildXrSessionInit(sessionMode, resolveXrDomOverlayRoot(renderer)))
      requestedSession = session
      pendingSessionRef.current = session
      const handleEnd = () => {
        const ownsRequest = requestGeneration === sessionRequestGenerationRef.current
        const ownsSession = sessionRef.current === session
        const ownsPendingSession = pendingSessionRef.current === session
        if (!ownsRequest && !ownsSession && !ownsPendingSession) {
          try {
            session.removeEventListener?.('end', handleEnd)
          } catch {
            void 0
          }
          return
        }
        sessionRequestGenerationRef.current += 1
        endXrArPlacementSession(session as XrArSessionLike)
        if (ownsSession) sessionRef.current = null
        if (ownsPendingSession) pendingSessionRef.current = null
        if (sessionEndListenerRef.current === handleEnd) sessionEndListenerRef.current = null
        if (pendingSessionEndListenerRef.current === handleEnd) pendingSessionEndListenerRef.current = null
        setStatus('supported')
        try {
          session.removeEventListener?.('end', handleEnd)
        } catch {
          void 0
        }
      }
      requestedSessionEndListener = handleEnd
      pendingSessionEndListenerRef.current = handleEnd
      try {
        session.addEventListener?.('end', handleEnd)
      } catch {
        void 0
      }
      if (requestGeneration !== sessionRequestGenerationRef.current) {
        if (pendingSessionRef.current === session) {
          pendingSessionRef.current = null
          pendingSessionEndListenerRef.current = null
          await releaseXrSession({ renderer, session, endListener: handleEnd })
        }
        return
      }
      const referenceSpace = await requestPreferredXrReferenceSpace<XrArSpaceLike>(session)
      if (requestGeneration !== sessionRequestGenerationRef.current) {
        if (pendingSessionRef.current === session) {
          pendingSessionRef.current = null
          pendingSessionEndListenerRef.current = null
          await releaseXrSession({ renderer, session, endListener: handleEnd })
        }
        return
      }
      renderer.xr.enabled = true
      renderer.xr.setReferenceSpaceType(referenceSpace.kind)
      await renderer.xr.setSession(session as ThreeWebXrSession)
      if (requestGeneration !== sessionRequestGenerationRef.current) {
        if (pendingSessionRef.current === session) {
          pendingSessionRef.current = null
          pendingSessionEndListenerRef.current = null
          await releaseXrSession({ renderer, session, endListener: handleEnd })
        }
        return
      }
      renderer.xr.setReferenceSpace(referenceSpace.space as ThreeWebXrReferenceSpace)
      pendingSessionRef.current = null
      pendingSessionEndListenerRef.current = null
      sessionRef.current = session
      sessionEndListenerRef.current = handleEnd
      if (sessionMode === 'immersive-ar') {
        await beginXrArPlacementSession(session as XrArSessionLike, referenceSpace)
      } else {
        activateXrImmersiveSession(session as XrArSessionLike, sessionMode)
      }
      if (requestGeneration !== sessionRequestGenerationRef.current) {
        if (sessionRef.current === session) {
          sessionRef.current = null
          sessionEndListenerRef.current = null
          await releaseXrSession({ renderer, session, endListener: handleEnd })
        }
        return
      }
      setStatus('active')
    } catch {
      if (requestedSession) {
        const ownsPendingSession = pendingSessionRef.current === requestedSession
        const ownsActiveSession = sessionRef.current === requestedSession
        if (!ownsPendingSession && !ownsActiveSession) {
          if (requestGeneration === sessionRequestGenerationRef.current) setStatus('error')
          return
        }
        if (ownsPendingSession) pendingSessionRef.current = null
        if (pendingSessionEndListenerRef.current === requestedSessionEndListener) {
          pendingSessionEndListenerRef.current = null
        }
        if (sessionRef.current === requestedSession) sessionRef.current = null
        if (sessionEndListenerRef.current === requestedSessionEndListener) {
          sessionEndListenerRef.current = null
        }
        await releaseXrSession({
          renderer,
          session: requestedSession,
          endListener: requestedSessionEndListener,
        })
      } else {
        endXrArPlacementSession()
        try {
          await renderer.xr.setSession(null as ThreeWebXrSession)
        } catch {
          void 0
        }
      }
      if (requestGeneration === sessionRequestGenerationRef.current) setStatus('error')
    }
  }, [rendererRef, sessionMode])

  if (!active || isXrPhysicsRunReadyDemoActive(markdownDocumentName, markdownDocumentText)) return null
  const spatialCaptureFallback = surfaceKind === 'spatial-capture'
    && status === 'unsupported'
    && capabilitySnapshot.recommended_entry_mode === 'monocular-capture' ? (
      <section
        aria-label="XR camera fallback"
        data-kg-canvas-xr-fallback="monocular-capture"
        className="absolute right-3 top-3 z-[90] pointer-events-auto rounded-md border border-[var(--kg-border)] bg-[var(--kg-surface)]/90 p-2 shadow-sm backdrop-blur"
      >
        <p className="max-w-48 text-[11px] text-[var(--kg-text-secondary)]">
          Immersive XR is unavailable. Continue through the existing local camera and Motion Control owner.
        </p>
        <button
          type="button"
          data-kg-canvas-xr-fallback-action="open-motion-control"
          className="mt-2 rounded px-2 py-1 text-xs font-medium text-[var(--kg-text)] hover:bg-[var(--kg-surface-muted)]"
          onClick={() => {
            setSpatialCapturePrimaryMode('capture')
            openMotionControlSurface('motion-control')
          }}
        >
          Open camera capture
        </button>
      </section>
    ) : null
  const spatialChrome = surfaceKind === 'spatial-capture' ? (
    <>
      <section
        aria-label="XR spatial capture orientation"
        data-kg-canvas-xr-mode="1"
        data-kg-canvas-xr-surface-kind="spatial-capture"
        data-kg-canvas-xr-status={status}
          {...capabilityDataAttributes}
        data-kg-canvas-xr-spatial-fidelity={spatialRuntimeFidelity}
        data-kg-canvas-xr-spatial-runtime={spatialRuntimeStatus}
        className="absolute left-1/2 top-14 z-[90] -translate-x-1/2 rounded-md bg-slate-900/82 px-4 py-1 text-xs font-medium text-slate-100 shadow-sm backdrop-blur"
      >
        <output>{readSpatialCaptureToolLabel(spatialTool)}</output>
      </section>
      <aside
        aria-label="XR minimap overlay"
        className="absolute z-[90] pointer-events-auto kg-canvas-minimap-overlay"
        data-kg-canvas-xr-minimap-overlay="1"
        data-kg-minimap-overlay-placement="bottom-left"
      >
        <MinimapSpatialViewCube />
      </aside>
      {spatialCaptureFallback}
    </>
  ) : null
  if (status === 'checking' || status === 'unsupported') return spatialChrome
  const canStart = status === 'supported' || status === 'active' || status === 'error'
  const bothModesSupported = sessionSupport['immersive-ar'] === true && sessionSupport['immersive-vr'] === true
  const label = status === 'active' ? 'Exit XR' : status === 'ending' ? 'Exiting XR…' : status === 'requesting' ? 'Entering XR…' : status === 'error' ? 'Retry XR' : 'Enter XR'
  return (
    <>
      {spatialChrome}
      <section
        ref={controlsRef}
        aria-label="XR Mode"
        data-kg-canvas-xr-mode="1"
        data-kg-canvas-xr-surface-kind={surfaceKind}
        data-kg-canvas-xr-status={status}
          {...capabilityDataAttributes}
        data-kg-canvas-xr-session-mode={sessionMode}
        data-kg-canvas-xr-ar-supported={sessionSupport['immersive-ar'] === true ? '1' : '0'}
        data-kg-canvas-xr-vr-supported={sessionSupport['immersive-vr'] === true ? '1' : '0'}
        className={`absolute right-3 top-3 z-[90] pointer-events-auto rounded-md border border-[var(--kg-border)] bg-[var(--kg-surface)]/90 p-1 shadow-sm backdrop-blur ${UI_RESPONSIVE_CANVAS_FLOATING_ACTION_ROW_CLASSNAME}`}
      >
        {bothModesSupported ? (
          <fieldset className="contents" aria-label="XR session type">
            <button
              type="button"
              data-kg-canvas-xr-session-option="immersive-ar"
              aria-pressed={sessionMode === 'immersive-ar'}
              disabled={status === 'active' || status === 'requesting' || status === 'ending'}
              className="rounded px-2 py-1 text-xs font-medium text-[var(--kg-text)] hover:bg-[var(--kg-surface-muted)] aria-pressed:bg-[var(--kg-surface-muted)]"
              onClick={() => setSessionMode('immersive-ar')}
            >
              AR
            </button>
            <button
              type="button"
              data-kg-canvas-xr-session-option="immersive-vr"
              aria-pressed={sessionMode === 'immersive-vr'}
              disabled={status === 'active' || status === 'requesting' || status === 'ending'}
              className="rounded px-2 py-1 text-xs font-medium text-[var(--kg-text)] hover:bg-[var(--kg-surface-muted)] aria-pressed:bg-[var(--kg-surface-muted)]"
              onClick={() => setSessionMode('immersive-vr')}
            >
              VR
            </button>
          </fieldset>
        ) : null}
        {status === 'active' && sessionMode === 'immersive-ar' && placementCommitted ? (
          <button
            type="button"
            data-kg-canvas-xr-reposition="1"
            className="rounded px-2 py-1 text-xs font-medium text-[var(--kg-text)] hover:bg-[var(--kg-surface-muted)]"
            onClick={() => {
              resetXrArPlacement()
            }}
          >
            Reposition scene
          </button>
        ) : null}
        <button
          type="button"
          data-kg-canvas-xr-enter="1"
          className="rounded px-2 py-1 text-xs font-medium text-[var(--kg-text)] hover:bg-[var(--kg-surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canStart}
          onClick={() => {
            void startOrEndSession()
          }}
        >
          {label}
        </button>
      </section>
    </>
  )
}
