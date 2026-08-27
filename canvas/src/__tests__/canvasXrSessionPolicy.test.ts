import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  XR_SESSION_MODE_ORDER,
  XR_SESSION_REFERENCE_SPACE_ORDER,
  buildXrSessionInit,
  chooseXrSessionMode,
  resolveXrCapabilitySnapshot,
  requestPreferredXrReferenceSpace,
} from '@/lib/three/ThreeGraphXrSessionPolicy'

export async function testXrSessionPolicyPrefersNativeArWithoutProviderDependency() {
  if (XR_SESSION_MODE_ORDER.join('|') !== 'immersive-ar|immersive-vr') {
    throw new Error(`expected XR session support checks to prefer AR before VR, got ${XR_SESSION_MODE_ORDER.join('|')}`)
  }
  if (chooseXrSessionMode({ 'immersive-ar': true, 'immersive-vr': true }) !== 'immersive-ar') {
    throw new Error('expected XR session selection to prefer immersive AR when both modes are available')
  }
  if (chooseXrSessionMode({ 'immersive-ar': false, 'immersive-vr': true }) !== 'immersive-vr') {
    throw new Error('expected XR session selection to fall back to immersive VR when AR is unavailable')
  }
  if (chooseXrSessionMode({ 'immersive-ar': true, 'immersive-vr': true }, 'immersive-vr') !== 'immersive-vr') {
    throw new Error('expected XR session selection to preserve an explicitly selected supported mode')
  }
  if (chooseXrSessionMode({ 'immersive-ar': false, 'immersive-vr': false }) !== null) {
    throw new Error('expected XR session selection to return null when no native XR session is supported')
  }
  const inlineSnapshot = resolveXrCapabilitySnapshot({
    surfaceKind: 'graph',
    sessionSupport: { 'immersive-ar': false, 'immersive-vr': false },
    inlineViewer: true,
    monocularCapture: false,
    captureMotion: false,
    nativeHandoff: true,
  })
  if (inlineSnapshot.schema !== 'agenticgraph-xr-capability-snapshot/v1'
    || inlineSnapshot.recommended_entry_mode !== 'inline-viewer'
    || inlineSnapshot.immersive_viewer !== false
    || inlineSnapshot.native_handoff !== true
    || !inlineSnapshot.reason_codes.includes('immersive_viewer_unavailable')) {
    throw new Error(`expected graph capability snapshot to degrade to inline-viewer with exact reason codes, got ${JSON.stringify(inlineSnapshot)}`)
  }
  const spatialCaptureSnapshot = resolveXrCapabilitySnapshot({
    surfaceKind: 'spatial-capture',
    sessionSupport: { 'immersive-ar': false, 'immersive-vr': false },
    inlineViewer: true,
    monocularCapture: true,
    captureMotion: true,
    nativeHandoff: true,
  })
  if (spatialCaptureSnapshot.recommended_entry_mode !== 'monocular-capture'
    || spatialCaptureSnapshot.monocular_capture !== true
    || spatialCaptureSnapshot.capture_motion !== true) {
    throw new Error(`expected spatial-capture snapshot to recommend monocular capture fallback, got ${JSON.stringify(spatialCaptureSnapshot)}`)
  }
  const immersiveSnapshot = resolveXrCapabilitySnapshot({
    surfaceKind: 'graph',
    sessionSupport: { 'immersive-ar': true, 'immersive-vr': true },
    inlineViewer: true,
    monocularCapture: true,
    captureMotion: true,
    nativeHandoff: true,
  })
  if (immersiveSnapshot.recommended_entry_mode !== 'immersive-session'
    || immersiveSnapshot.immersive_viewer !== true) {
    throw new Error(`expected immersive-capable snapshot to prefer immersive-session, got ${JSON.stringify(immersiveSnapshot)}`)
  }
  if (XR_SESSION_REFERENCE_SPACE_ORDER.join('|') !== 'local-floor|local') {
    throw new Error(`expected XR reference spaces to prefer local-floor before local, got ${XR_SESSION_REFERENCE_SPACE_ORDER.join('|')}`)
  }
  const referenceSpaceRequests: string[] = []
  const referenceSpace = await requestPreferredXrReferenceSpace({
    requestReferenceSpace: async kind => {
      referenceSpaceRequests.push(kind)
      if (kind === 'local-floor') throw new Error('local-floor unavailable')
      return { kind }
    },
  })
  if (referenceSpaceRequests.join('|') !== 'local-floor|local' || referenceSpace.kind !== 'local') {
    throw new Error('expected shared XR reference-space negotiation to fall back from local-floor to local')
  }

  const overlayRoot = {} as Element
  const arInit = buildXrSessionInit('immersive-ar', overlayRoot)
  const arFeatures = new Set(arInit.optionalFeatures)
  for (const feature of ['local-floor', 'bounded-floor', 'hand-tracking', 'hit-test', 'light-estimation', 'dom-overlay']) {
    if (!arFeatures.has(feature)) throw new Error(`expected immersive AR session init to include ${feature}`)
  }
  if (arInit.domOverlay?.root !== overlayRoot) {
    throw new Error('expected immersive AR session init to bind DOM overlay root when supplied')
  }

  const vrInit = buildXrSessionInit('immersive-vr', overlayRoot)
  const vrFeatures = new Set(vrInit.optionalFeatures)
  if (vrFeatures.has('hit-test') || vrFeatures.has('dom-overlay') || vrInit.domOverlay) {
    throw new Error('expected immersive VR session init to avoid AR-only hit-test/dom-overlay options')
  }

  const source = [
    readFileSync(resolve(process.cwd(), 'src/lib/three/ThreeGraphXr.tsx'), 'utf8'),
    readFileSync(resolve(process.cwd(), 'src/lib/three/ThreeGraphXrSessionPolicy.ts'), 'utf8'),
  ].join('\n')
  const worldSource = readFileSync(resolve(process.cwd(), 'src/lib/three/ThreeGraph.impl.tsx'), 'utf8')
  const sceneLayoutSource = readFileSync(resolve(process.cwd(), 'src/lib/three/threeGraphSceneLayout.ts'), 'utf8')
  const rendererClearSource = readFileSync(resolve(process.cwd(), 'src/lib/three/XrRendererClearController.tsx'), 'utf8')
  const graphSceneSource = readFileSync(resolve(process.cwd(), 'src/lib/three/Scene.impl.tsx'), 'utf8')
  const graphStageSource = readFileSync(resolve(process.cwd(), 'src/features/three/XrMotionReferenceGraphStage.tsx'), 'utf8')
  const placementStageSource = readFileSync(resolve(process.cwd(), 'src/features/three/XrArPlacementStage.tsx'), 'utf8')
  const emptyWorldSource = readFileSync(resolve(process.cwd(), 'src/features/three/XrEmptyWorldStage.tsx'), 'utf8')
  const motionStageSource = readFileSync(resolve(process.cwd(), 'src/features/three/XrMotionReferenceStage.tsx'), 'utf8')
  const presetGeometrySource = readFileSync(resolve(process.cwd(), 'src/features/three/XrStagePresetGeometry.tsx'), 'utf8')
  const spatialCaptureSource = readFileSync(resolve(process.cwd(), 'src/features/three/SpatialCaptureManifestStage.tsx'), 'utf8')
  for (const forbiddenProviderToken of [
    ['8th', 'wall'].join(''),
    ['XR', '8'].join(''),
    ['add', 'Camera', 'Pipeline', 'Module'].join(''),
  ]) {
    if (source.includes(forbiddenProviderToken)) {
      throw new Error(`expected XR Mode to stay provider-neutral without copied external runtime token ${forbiddenProviderToken}`)
    }
  }
  if (!source.includes('Promise.all(') || !source.includes('XR_SESSION_MODE_ORDER.map')) {
    throw new Error('expected XR support detection to check native AR/VR modes in parallel through the shared order')
  }
  for (const marker of [
    'resolveXrCapabilitySnapshot({',
    'data-kg-canvas-xr-capability-schema',
    'data-kg-canvas-xr-entry-mode',
    'data-kg-canvas-xr-recommended-entry-mode',
    'data-kg-canvas-xr-monocular-capture',
    'data-kg-canvas-xr-capability-reasons',
    'data-kg-canvas-xr-fallback="monocular-capture"',
    'data-kg-canvas-xr-fallback-action="open-motion-control"',
    "if (status === 'checking' || status === 'unsupported') return spatialChrome",
    "setSpatialCapturePrimaryMode('capture')",
    "openMotionControlSurface('motion-control')",
  ]) {
    if (!source.includes(marker)) throw new Error(`expected XR entry surface to expose capability marker ${marker}`)
  }
  if (!source.includes('requestSession(sessionMode, buildXrSessionInit(sessionMode, resolveXrDomOverlayRoot(renderer)))')) {
    throw new Error('expected XR session entry to use the shared native WebXR session-init policy')
  }
  if (!source.includes('requestPreferredXrReferenceSpace')
    || !source.includes('renderer.xr.setReferenceSpace(referenceSpace.space')
    || !source.includes('await beginXrArPlacementSession')) {
    throw new Error('expected renderer and AR placement to share one awaited reference-space lifecycle')
  }
  if (!source.includes('renderer.xr.setSession(null') || !source.includes('data-kg-canvas-xr-reposition')) {
    throw new Error('expected XR teardown and explicit AR reposition controls to be present')
  }
  if (!source.includes('pendingSessionRef.current = session')
    || !source.includes('activateXrImmersiveSession(session as XrArSessionLike, sessionMode)')) {
    throw new Error('expected pending sessions to be owned during async setup and physical presentation to cover immersive VR')
  }
  const pendingEndListenerIndex = source.indexOf("session.addEventListener?.('end', handleEnd)")
  const referenceSpaceNegotiationIndex = source.indexOf('const referenceSpace = await requestPreferredXrReferenceSpace')
  if (pendingEndListenerIndex < 0
    || referenceSpaceNegotiationIndex < 0
    || pendingEndListenerIndex > referenceSpaceNegotiationIndex) {
    throw new Error('expected native session end ownership before asynchronous reference-space negotiation')
  }
  if ((worldSource.match(/<XrArPlacementStage/g) || []).length !== 1
    || !worldSource.includes('contentScale={xrWorldContentScale}')
    || !worldSource.includes('contentOffset={xrWorldContentOffset}')
    || graphStageSource.includes('<XrArPlacementStage')) {
    throw new Error('expected all XR world variants to share exactly one common AR placement wrapper')
  }
  if (!placementStageSource.includes('runtime.read().immersiveSessionActive')) {
    throw new Error('expected physical content scale and floor offset to apply in both immersive AR and VR')
  }
  if (!sceneLayoutSource.includes('1 / fitScale')
    || !sceneLayoutSource.includes('Number.isFinite(floorY) ? -floorY : 0')
    || !worldSource.includes('boundedInverseFitScale(xrStandaloneFit)')
    || !worldSource.includes('fitFloorOffset(xrStandaloneFit)')
    || !worldSource.includes('xrStageMetersPerUnit')) {
    throw new Error('expected XR placement to use bounded physical scale and floor alignment for every world surface')
  }
  if (!emptyWorldSource.includes('position={immersiveSessionActive ? [0, -floorDepth, 0]')
    || !emptyWorldSource.includes('rotation={immersiveSessionActive ? [-Math.PI / 2, 0, 0]')
    || !emptyWorldSource.includes('kgXrImmersiveFloorAligned')) {
    throw new Error('expected the empty editor world to align its XY floor with the immersive XZ placement plane')
  }
  if (!graphStageSource.includes('coordinateRootRef={stageRootRef}')
    || !motionStageSource.includes('coordinateRoot.matrixWorld).invert()')
    || !presetGeometrySource.includes('coordinateRoot.worldToLocal(point)')) {
    throw new Error('expected XR drag rays and floor hits to be converted back into placed stage-local coordinates')
  }
  if (!spatialCaptureSource.includes('createPortal(')
    || !spatialCaptureSource.includes('scene,')
    || !spatialCaptureSource.includes("immersiveSessionMode !== 'immersive-ar'")) {
    throw new Error('expected spatial capture environment to attach to the Scene without obscuring immersive AR passthrough')
  }
  if (!worldSource.includes('<XrRendererClearController')
    || !rendererClearSource.includes('resolveXrRendererClearAlpha(')
    || graphSceneSource.includes('setClearColor(')) {
    throw new Error('expected one canvas-level renderer clear owner to preserve AR passthrough for graph and empty XR worlds')
  }
  if ((worldSource.match(/key=\{rendererLifecycleKey\}/g) || []).length !== 1
    || worldSource.split('key={`${rendererLifecycleKey}-session-panel`}').length !== 2) {
    throw new Error('expected the native session panel to remount with a distinct sibling key whenever the XR renderer is replaced')
  }
}
