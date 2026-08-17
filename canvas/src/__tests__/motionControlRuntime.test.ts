import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertPinnedAgenticOsDictionaryTokensForTest, PINNED_MOTION_CONTROL_DICTIONARY_TOKENS } from '@/__tests__/helpers/pinnedAgenticOsDictionary'
import { resetAgenticOsRemoteGrammarCatalogForTests } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { readMediaCatalogMode, setMediaCatalogMode } from '@/features/command-menu/mediaCatalogModeRuntime'
import {
  installKnowgrphWebMcpRuntime,
  resetKnowgrphWebMcpRuntimeForTests,
} from '@/features/agent-ready/webMcpRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  buildMotionControlInvocation,
  controlLocalMotionControl,
  inspectLocalMotionControl,
} from '@/features/three/motionControlMcpRuntime'
import {
  isMotionControlPoseTracked,
  motionControlPoseToAnimationPose,
  motionControlPoseToControllerInput,
  resetMotionControlCalibration,
  smoothMotionControlPose,
  type MotionControlLandmark,
  type MotionControlPoseFrame,
} from '@/features/three/motionControlPose'
import {
  readMotionControlSnapshot,
  startMotionControl,
  stopMotionControl,
} from '@/features/three/motionControlRuntime'
import {
  buildMotionControlXrControllerInvocation,
  inspectMotionControlTargets,
} from '@/features/three/motionControlTargetRuntime'
import {
  motionControlCaptureSurfaceIsOpen,
  openMotionControlSurface,
} from '@/features/three/motionControlSurfaceRuntime'
import { parseXrInteractiveInvocation } from '@/features/three/xrSceneInteractiveInvocation'

const source = (...parts: string[]): string => readFileSync(resolve(process.cwd(), ...parts), 'utf8')
const landmark = (x: number, y: number, z = 0): MotionControlLandmark => Object.freeze({ x, y, z, visibility: 0.95, presence: 0.96 })

function poseFrame(timestampMs: number): MotionControlPoseFrame {
  const landmarks = Array.from({ length: 33 }, (_, index) => landmark(0.5, 0.1 + index * 0.018, 0))
  landmarks[11] = landmark(0.4, 0.35, -0.05)
  landmarks[12] = landmark(0.6, 0.35, -0.05)
  landmarks[13] = landmark(0.28, 0.47, -0.12)
  landmarks[14] = landmark(0.72, 0.47, -0.12)
  landmarks[15] = landmark(0.18, 0.22, -0.2)
  landmarks[16] = landmark(0.82, 0.22, -0.2)
  landmarks[23] = landmark(0.46, 0.58, 0)
  landmarks[24] = landmark(0.54, 0.58, 0)
  landmarks[25] = landmark(0.46, 0.76, 0.02)
  landmarks[26] = landmark(0.54, 0.76, 0.02)
  const world = landmarks.map(item => landmark(item.x - 0.5, item.y - 0.58, item.z))
  return Object.freeze({ timestampMs, confidence: 0.92, landmarks: Object.freeze(landmarks), worldLandmarks: Object.freeze(world) })
}

async function testCaptureEndedLifecycle() {
  class CameraTrack extends EventTarget {
    readyState: MediaStreamTrackState = 'live'
    stopped = false

    end(): void {
      this.readyState = 'ended'
      this.dispatchEvent(new Event('ended'))
    }

    stop(): void {
      this.stopped = true
      this.readyState = 'ended'
    }
  }

  const track = new CameraTrack()
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream
  let resolvePlay = () => void 0
  let playCalled = false
  const playPromise = new Promise<void>(resolve => { resolvePlay = resolve })
  const video = {
    autoplay: false,
    muted: false,
    pause: () => void 0,
    play: () => {
      playCalled = true
      return playPromise
    },
    playsInline: false,
    srcObject: null,
  }
  const fakeDocument = Object.assign(new EventTarget(), {
    createElement: () => video,
    visibilityState: 'visible',
  })
  const fakeWindow = Object.assign(new EventTarget(), {
    cancelAnimationFrame: () => void 0,
    isSecureContext: true,
    requestAnimationFrame: () => 1,
  })
  const descriptors = new Map(['document', 'navigator', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow })
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: { getUserMedia: async () => stream } },
    })
    const beforeStops = readMotionControlSnapshot().revision
    await Promise.all([stopMotionControl(), stopMotionControl()])
    if (readMotionControlSnapshot().revision !== beforeStops + 1) {
      throw new Error('expected concurrent stop calls to share one serialized teardown')
    }
    if (!openMotionControlSurface('motion-control')) throw new Error('expected an approved XR capture surface')
    const starting = startMotionControl('wasm')
    for (let attempt = 0; attempt < 12 && readMotionControlSnapshot().phase !== 'requesting-camera'; attempt += 1) {
      await Promise.resolve()
    }
    if (readMotionControlSnapshot().phase !== 'requesting-camera') throw new Error('expected camera request phase before lifecycle test')
    for (let attempt = 0; attempt < 12 && !playCalled; attempt += 1) await Promise.resolve()
    if (!playCalled) throw new Error('expected camera preview to bind before lifecycle test')
    track.end()
    resolvePlay()
    await starting
    for (let attempt = 0; attempt < 12 && readMotionControlSnapshot().phase !== 'error'; attempt += 1) await Promise.resolve()
    const ended = readMotionControlSnapshot()
    if (ended.phase !== 'error' || ended.cameraActive || ended.pose || !track.stopped) {
      throw new Error('expected a revoked or ended camera track to clear capture and publish an error')
    }
  } finally {
    resolvePlay()
    await stopMotionControl()
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
}

export async function testMotionControlRuntimeIsLiteRtInvocableAndXrReady() {
  resetAgenticOsRemoteGrammarCatalogForTests()
  const frame = poseFrame(1)
  resetMotionControlCalibration()
  const animationPose = motionControlPoseToAnimationPose(frame)
  const controllerInput = motionControlPoseToControllerInput(frame)
  if (!animationPose || !Number.isFinite(animationPose.leftArmRollDegrees) || !Number.isFinite(animationPose.rightArmRollDegrees)) {
    throw new Error('expected finite Motion Control pose projection for native XR humanoids')
  }
  if (animationPose.rootOffsetMeters[1] <= 0
    || animationPose.rootOffsetMeters[2] <= 0
    || !animationPose.eventCues.includes('hands-raised')
    || !animationPose.eventCues.includes('hands-wide')
    || !animationPose.eventCues.includes('hand-reach')) {
    throw new Error(`expected hand gestures to drive selected 3D XR subject root motion, got ${JSON.stringify(animationPose)}`)
  }
  if (controllerInput.source !== 'motion' || controllerInput.primary !== true || controllerInput.modifier !== true) {
    throw new Error('expected tracked pose to enter the canonical native XR controller input pipeline')
  }
  const leaningLandmarks = [...frame.landmarks]
  leaningLandmarks[11] = landmark(0.32, 0.35, -0.05)
  leaningLandmarks[12] = landmark(0.52, 0.35, -0.05)
  const leaningFrame = Object.freeze({ ...frame, timestampMs: 2, landmarks: Object.freeze(leaningLandmarks) })
  const mirroredControllerInput = motionControlPoseToControllerInput(leaningFrame)
  if (mirroredControllerInput.moveX <= 0) {
    throw new Error('expected lateral motion to follow the mirrored local preview')
  }
  const idleLandmarks = [...frame.landmarks]
  idleLandmarks[15] = landmark(0.44, 0.5)
  idleLandmarks[16] = landmark(0.56, 0.5)
  const idleFrame = Object.freeze({ ...frame, timestampMs: 3, landmarks: Object.freeze(idleLandmarks) })
  resetMotionControlCalibration()
  const idleInput = motionControlPoseToControllerInput(idleFrame)
  if (idleInput.source !== 'none' || idleInput.moveX !== 0 || idleInput.moveZ !== 0) {
    throw new Error('expected neutral calibration and dead zones to suppress idle controller motion')
  }
  const unreliableLandmarks = [...leaningFrame.landmarks]
  unreliableLandmarks[11] = Object.freeze({ ...unreliableLandmarks[11]!, visibility: 0.1 })
  unreliableLandmarks[15] = landmark(0.44, 0.5)
  unreliableLandmarks[16] = landmark(0.56, 0.5)
  const unreliableFrame = Object.freeze({ ...leaningFrame, landmarks: Object.freeze(unreliableLandmarks) })
  if (isMotionControlPoseTracked(unreliableFrame) || motionControlPoseToControllerInput(unreliableFrame).source !== 'none') {
    throw new Error('expected unreliable control-driving joints to report tracking loss and fail closed')
  }
  const raisedLandmarks = [...frame.landmarks]
  raisedLandmarks[13] = landmark(0.2, 0.18, -0.08)
  raisedLandmarks[14] = landmark(0.8, 0.18, -0.08)
  const raisedWorld = raisedLandmarks.map(item => landmark(item.x - 0.5, item.y - 0.58, item.z))
  const raisedPose = motionControlPoseToAnimationPose(Object.freeze({ ...frame, landmarks: Object.freeze(raisedLandmarks), worldLandmarks: Object.freeze(raisedWorld) }))
  if (!raisedPose || raisedPose.leftArmRollDegrees <= 90 || raisedPose.rightArmRollDegrees >= -90) {
    throw new Error('expected raised arms to rotate visibly outward and upward around the humanoid local Y axis')
  }
  const smoothed = smoothMotionControlPose(frame, poseFrame(3))
  if (smoothed.timestampMs !== 3 || smoothed.landmarks.length !== 33 || smoothed.worldLandmarks.length !== 33) {
    throw new Error('expected stable 33-landmark normalized and world-coordinate smoothing')
  }
  const invocation = buildMotionControlInvocation('start', 'auto')
  if (invocation !== '/motion.control @canvas #pose operation=start backend=auto') {
    throw new Error(`expected canonical / @ # Motion Control invocation, received ${invocation}`)
  }
  if (buildMotionControlInvocation('open') !== '/motion.control @canvas #pose operation=open') {
    throw new Error('expected open invocation to omit the start-only backend field')
  }
  try {
    assertPinnedAgenticOsDictionaryTokensForTest(PINNED_MOTION_CONTROL_DICTIONARY_TOKENS)
  } finally {
    resetAgenticOsRemoteGrammarCatalogForTests()
  }
  const inspection = inspectLocalMotionControl()
  if (inspection.schema !== 'knowgrph-motion-control-mcp/v2'
    || inspection.runtimeSchema !== 'knowgrph-motion-control/v1'
    || inspection.webMcpTools.control !== 'knowgrph.control_local_motion_control'
    || inspection.webMcpTools.inspect !== 'knowgrph.inspect_local_motion_control'
    || inspection.drivers.selectedHumanoid !== true
    || inspection.drivers.nativePhysicsController !== true
    || inspection.privacy.frameUpload !== false
    || inspection.privacy.framePersistence !== false) {
    throw new Error('expected browser WebMCP and local-only privacy metadata from the canonical Motion Control runtime')
  }
  const targets = inspectMotionControlTargets()
  if (targets.surfaces.xr3d.webMcpTool !== 'knowgrph.control_local_xr_scene'
    || targets.surfaces.animation.webMcpTool !== 'knowgrph.control_local_animation'
    || !targets.surfaces.xr3d.invocation.includes('/xr.physics @canvas #controller')
    || !targets.surfaces.animation.invocation.startsWith('/animation.control')) {
    throw new Error('expected Motion Control to project the canonical 3D for XR and Animation owners')
  }
  const inactiveControllerInvocation = buildMotionControlXrControllerInvocation({ mode: 'rocket', phase: 'off' })
  const activeControllerInvocation = buildMotionControlXrControllerInvocation({ mode: 'ball', phase: 'running' })
  const parsedActiveControllerInvocation = parseXrInteractiveInvocation(activeControllerInvocation)
  if (inactiveControllerInvocation !== '/xr.physics @canvas #controller operation=develop-run mode=rocket'
    || activeControllerInvocation !== '/xr.physics @canvas #controller operation=reset'
    || parsedActiveControllerInvocation?.action !== 'physics'
    || parsedActiveControllerInvocation.physics.operation !== 'reset'
    || parseXrInteractiveInvocation(`${activeControllerInvocation} mode=ball`) !== null) {
    throw new Error('expected Motion Control to emit only controller invocations accepted by the canonical XR parser')
  }
  if (inspection.targets.surfaces.xr3d.webMcpTool !== targets.surfaces.xr3d.webMcpTool
    || inspection.targets.surfaces.animation.webMcpTool !== targets.surfaces.animation.webMcpTool
    || inspection.targets.surfaces.gameMode.webMcpTool !== 'knowgrph.control_local_game_mode') {
    throw new Error('expected Motion Control WebMCP inspection to expose the shared target projection')
  }
  for (const view of ['motionControl', 'skillsCommands', 'media', 'animation', 'gameMode', 'flightSim'] as const) {
    if (!motionControlCaptureSurfaceIsOpen({
      canvasRenderMode: '3d',
      canvas3dMode: 'xr',
      floatingPanelOpen: true,
      floatingPanelView: view,
      mediaCatalogMode: 'media',
    })) {
      throw new Error(`expected capture continuity while the canonical ${view} XR surface is open`)
    }
  }
  if (!motionControlCaptureSurfaceIsOpen({
    canvasRenderMode: '3d',
    canvas3dMode: 'xr',
    floatingPanelOpen: true,
    floatingPanelView: 'media',
    mediaCatalogMode: 'xr-3d',
  }) || !motionControlCaptureSurfaceIsOpen({
    canvasRenderMode: '3d',
    canvas3dMode: 'xr',
    floatingPanelOpen: true,
    floatingPanelView: 'media',
    mediaCatalogMode: 'media',
  })) {
    throw new Error('expected capture continuity for both canonical Media projections in XR Mode')
  }
  for (const closed of [
    { canvasRenderMode: '2d', canvas3dMode: 'xr', floatingPanelOpen: true, floatingPanelView: 'motionControl' as const, mediaCatalogMode: 'xr-3d' as const },
    { canvasRenderMode: '3d', canvas3dMode: '3d', floatingPanelOpen: true, floatingPanelView: 'motionControl' as const, mediaCatalogMode: 'xr-3d' as const },
    { canvasRenderMode: '3d', canvas3dMode: 'xr', floatingPanelOpen: false, floatingPanelView: 'motionControl' as const, mediaCatalogMode: 'xr-3d' as const },
    { canvasRenderMode: '3d', canvas3dMode: 'xr', floatingPanelOpen: true, floatingPanelView: 'camera' as const, mediaCatalogMode: 'xr-3d' as const },
  ]) {
    if (motionControlCaptureSurfaceIsOpen(closed)) {
      throw new Error(`expected capture to stop outside approved XR target surfaces: ${JSON.stringify(closed)}`)
    }
  }
  const previousSurface = useGraphStore.getState()
  const previousSurfaceState = {
    canvasRenderMode: previousSurface.canvasRenderMode,
    canvas3dMode: previousSurface.canvas3dMode,
    floatingPanelOpen: previousSurface.floatingPanelOpen,
    floatingPanelView: previousSurface.floatingPanelView,
    bottomSurfaceTab: previousSurface.bottomSurfaceTab,
    bottomSurfaceCollapsed: previousSurface.bottomSurfaceCollapsed,
    documentStructureBaselineLock: previousSurface.documentStructureBaselineLock,
  }
  const previousMediaCatalogMode = readMediaCatalogMode()
  try {
    useGraphStore.setState({
      documentStructureBaselineLock: true,
      canvasRenderMode: '2d',
      canvas3dMode: '3d',
      floatingPanelOpen: false,
      floatingPanelView: 'propsPanel',
    })
    const blockedStart = await controlLocalMotionControl({ operation: 'start', backend: 'auto' })
    const blockedSurface = useGraphStore.getState()
    if (blockedStart.ok
      || !blockedStart.message.includes('requires XR Mode')
      || blockedSurface.canvasRenderMode !== '2d'
      || blockedSurface.floatingPanelOpen
      || readMotionControlSnapshot().cameraActive) {
      throw new Error('expected Motion Control Start to fail before camera access when XR activation is rejected')
    }
    useGraphStore.setState({ ...previousSurfaceState, documentStructureBaselineLock: false } as never)
    setMediaCatalogMode('media')
    if (!openMotionControlSurface('xr-3d')) throw new Error('expected the available XR surface to open')
    const xr3dSurface = useGraphStore.getState()
    if (xr3dSurface.canvasRenderMode !== '3d'
      || xr3dSurface.canvas3dMode !== 'xr'
      || xr3dSurface.floatingPanelOpen !== true
      || xr3dSurface.floatingPanelView !== 'media'
      || xr3dSurface.bottomSurfaceTab !== 'timeline'
      || xr3dSurface.bottomSurfaceCollapsed !== false
      || readMediaCatalogMode() !== 'xr-3d') {
      throw new Error('expected 3D for XR to reuse the canonical XR Media and Timeline surfaces')
    }
    if (!openMotionControlSurface('animation')) throw new Error('expected the available Animation XR surface to open')
    if (useGraphStore.getState().floatingPanelView !== 'animation') {
      throw new Error('expected Animation to reuse its canonical FloatingPanel surface')
    }
  } finally {
    setMediaCatalogMode(previousMediaCatalogMode)
    useGraphStore.setState(previousSurfaceState as never)
  }
  const rejected = await controlLocalMotionControl({ invocation: '/motion.control @canvas #pose operation=start backend=auto extra=true' })
  if (rejected.ok !== false) throw new Error('expected unknown invocation fields to fail closed')
  const rejectedStructured = await controlLocalMotionControl({ operation: 'open', extra: true } as never)
  if (rejectedStructured.ok !== false) throw new Error('expected unknown structured fields to fail closed')

  const runtimeSource = [source('src', 'features', 'three', 'motionControlRuntime.ts'), source('src', 'features', 'three', 'motionControlCaptureResources.ts')].join('\n')
  const assetScript = source('scripts', 'prepare-litert-assets.mjs')
  const panelSource = [source('src', 'features', 'three', 'MotionControlFloatingPanelView.tsx'), source('src', 'features', 'three', 'MotionCapturePlatformProjection.tsx')].join('\n')
  const targetCardsSource = source('src', 'features', 'three', 'MotionControlTargetCards.tsx')
  const targetRuntimeSource = source('src', 'features', 'three', 'motionControlTargetRuntime.ts')
  const surfaceRuntimeSource = source('src', 'features', 'three', 'motionControlSurfaceRuntime.ts')
  const lifecycleGuardSource = source('src', 'features', 'three', 'MotionControlXrLifecycleGuard.tsx')
  const mediaCatalogModeSource = source('src', 'features', 'command-menu', 'mediaCatalogModeRuntime.ts')
  const mediaPanelSource = source('src', 'features', 'command-menu', 'MediaCatalogPanelView.tsx')
  const toolbarLauncherSource = source('src', 'features', 'toolbar', 'ToolbarMenuLauncher.tsx')
  const toolbarToolMenuSource = source('src', 'lib', 'toolbar', 'ToolbarToolMenu.impl.tsx')
  const xrSceneMcpSource = source('src', 'features', 'three', 'xrSceneMcpRuntime.ts')
  const xrCameraMotionSource = source('src', 'features', 'three', 'XrCameraMotionSection.tsx')
  const xrSceneSurfaceSource = source('src', 'features', 'three', 'xrSceneSurfaceRuntime.ts')
  const stageSource = source('src', 'features', 'three', 'XrNativeControllerDemoStage.tsx')
  for (const marker of [
    "import('@litertjs/core')",
    'loadLiteRt(',
    'loadAndCompile(',
    'getUserMedia(',
    'track.stop()',
    'input.delete()',
    'output?.delete()',
    'requestAnimationFrame',
    'model.getInputDetails()',
    'model.getOutputDetails()',
    "model.options.accelerator === 'wasm'",
    "effectiveBackend: 'webgpu+wasm'",
    'valuesAreFinite(',
    "permission: 'prompting'",
    "addEventListener('ended'",
    'document.visibilityState',
    'resetMotionControlCalibration()',
    'stopPromise',
  ]) {
    if (!runtimeSource.includes(marker)) throw new Error(`expected production LiteRT runtime lifecycle marker ${marker}`)
  }
  const stopRuntimeStart = runtimeSource.indexOf('export async function stopMotionControl')
  const immediateOffPublish = runtimeSource.indexOf("phase: 'off'", stopRuntimeStart)
  const pendingInferenceDrain = runtimeSource.indexOf('if (pendingInference) void pendingInference.catch', stopRuntimeStart)
  if (stopRuntimeStart < 0 || immediateOffPublish < stopRuntimeStart || pendingInferenceDrain < 0 || immediateOffPublish > pendingInferenceDrain) {
    throw new Error('expected Stop to publish camera-off state before asynchronously draining in-flight LiteRT inference')
  }
  for (const marker of ['POSE_TASK_SHA256', 'MAX_POSE_TASK_BYTES', 'AbortSignal.timeout(', 'storage.googleapis.com/mediapipe-models/', 'copyFile(', 'pose_landmarks_detector.tflite', 'readBoundedResponseBytes(']) {
    if (!assetScript.includes(marker)) throw new Error(`expected same-origin licensed LiteRT asset preparation marker ${marker}`)
  }
  for (const marker of ['floatingPanelCatalogSurfaceClassName()', 'floatingPanelCatalogBodyClassName(', 'data-kg-motion-control-start', 'data-kg-motion-control-invocation-chip-renderer="shared-markdown-sigil"', 'disabled={!captureSurfaceActive || session.sources.length === 0', 'disabled={!captureSurfaceActive || !peerSharing.available', 'useAgenticOsRemoteGrammarAutoHydration()', "sourceMetadataDeferred ? 'deferred-offline'", 'data-kg-motion-capture-research-evidence="import"', 'applyResearchEvidenceManifest']) {
    if (!panelSource.includes(marker)) throw new Error(`expected shared FloatingPanel Motion Control layout marker ${marker}`)
  }
  for (const marker of ['MotionControlTargetCards', "openMotionControlSurface(target)"]) {
    if (!panelSource.includes(marker)) throw new Error(`expected Motion Control target coordinator marker ${marker}`)
  }
  for (const marker of [
    'data-kg-motion-control-target="xr-3d"',
    'data-kg-motion-control-target="animation"',
    'renderMarkdownSigilInlineText',
    'xr3d.webMcpTool',
    'animation.webMcpTool',
    'subscribeXrNativeControllerDemo',
  ]) {
    if (!targetCardsSource.includes(marker)) throw new Error(`expected shared Motion Control target card marker ${marker}`)
  }
  for (const marker of [
    'readBoundXrSelectedActorId()',
    'inspectLocalXrSceneAssets()',
    'inspectLocalAnimation()',
    'buildMotionControlXrControllerInvocation(controller)',
  ]) {
    if (!targetRuntimeSource.includes(marker)) throw new Error(`expected centralized Motion Control target ownership marker ${marker}`)
  }
  for (const marker of [
    "'motion-control': Object.freeze", "'xr-3d': Object.freeze", 'animation: Object.freeze', 'MOTION_CONTROL_XR_RUNTIME_READY_VIEWS', "'skillsCommands'", "'flightSim'", 'activateXrSceneSurface({', 'panelView: MOTION_CONTROL_SURFACE_CATALOG[target].view',
  ]) {
    if (!surfaceRuntimeSource.includes(marker)) throw new Error(`expected centralized Motion Control surface ownership marker ${marker}`)
  }
  const staleSurfaceOwner = ['activateCanvasGraphSurfaceMode', "setCanvas3dMode('xr')", "setMediaCatalogMode('xr-3d')"].find(marker => surfaceRuntimeSource.includes(marker))
  if (staleSurfaceOwner) throw new Error(`expected Motion Control to remove local XR surface owner ${staleSurfaceOwner}`)
  if (!['motionControlCaptureSurfaceIsOpen', 'subscribeMediaCatalogMode', 'subscribeMotionControl', 'subscribeMotionCaptureSession', 'subscribeMotionCapturePeerSharing', 'captureActive', 'lifecycleActive', 'stopMotionCaptureOutsideXrSurface', 'mountedLifecycleOwnerCount', 'Motion Control stopped when its XR FloatingPanel surface closed.'].every(marker => lifecycleGuardSource.includes(marker))
    || !toolbarLauncherSource.includes('<MotionControlXrLifecycleGuard />')) {
    throw new Error('expected stable toolbar lifecycle ownership for Motion Control capture continuity')
  }
  if (!mediaCatalogModeSource.includes("let snapshot: MediaCatalogMode = 'media'")
    || !mediaPanelSource.includes('subscribeMediaCatalogMode')
    || !mediaPanelSource.includes("setMediaCatalogMode('media')")
    || !mediaPanelSource.includes("setMediaCatalogMode('xr-3d')")) {
    throw new Error('expected Media and 3D for XR to share one observable catalog-mode owner')
  }
  const toolbarXrRouting = toolbarToolMenuSource.indexOf('routeToolbarXrScenePanel({ view, canvasRenderMode, canvas3dMode })')
  const toolbarPanelSelection = toolbarToolMenuSource.indexOf('setFloatingPanelView(view)', toolbarXrRouting)
  if (toolbarXrRouting < 0
    || toolbarPanelSelection < toolbarXrRouting
    || !toolbarToolMenuSource.includes('handleSelectView(requestedFloatingPanelView)')
    || !xrSceneSurfaceSource.includes("if (activation.panelView === 'media') setMediaCatalogMode('xr-3d')")
    || !xrSceneMcpSource.includes('activateXrSceneSurface({')
    || !xrCameraMotionSource.includes("activateXrSceneSurface({ panelView: 'media', openPanel: true, timeline: true })")) {
    throw new Error('expected every XR Media entry route to publish the 3D for XR submode before opening Media')
  }
  if (!stageSource.includes('mergeXrNativeControllerInputs(keyboard, gamepad, motion, deviceMotion)')) {
    throw new Error('expected pose and device Motion Control to merge before the single native XR physics step')
  }

  await testCaptureEndedLifecycle()

  const forbiddenOwner = ['andris', 'gauracs'].join('')
  const forbiddenRepository = ['LiteRT.js', 'Mocap'].join('-')
  const forbiddenShareHost = ['airvio', 'co'].join('.')
  const forbiddenSeedName = ['knowgrph', 'physics', 'playground', 'demo.md'].join('-')
  const forbiddenAbsolutePrefix = ['', 'Users', 'huijoohwee'].join('/')
  for (const path of [
    ['src', 'features', 'three', 'motionControlRuntime.ts'],
    ['src', 'features', 'three', 'motionControlPose.ts'],
    ['src', 'features', 'three', 'motionControlConfig.ts'],
    ['src', 'features', 'three', 'MotionControlFloatingPanelView.tsx'],
    ['src', 'features', 'three', 'MotionControlTargetCards.tsx'],
    ['src', 'features', 'three', 'MotionControlXrLifecycleGuard.tsx'],
    ['src', 'features', 'three', 'CameraMotionMarkRetime.tsx'],
    ['src', 'features', 'three', 'XrKeyboardChoreographyRuntime.tsx'],
    ['src', 'features', 'three', 'XrMotionReferenceRuntimeBridge.tsx'],
    ['src', 'features', 'three', 'XrMotionReferenceStage.tsx'],
    ['src', 'features', 'three', 'XrNativeControllerAuthoredSubjects.tsx'],
    ['src', 'features', 'three', 'XrSceneLibrarySubject.tsx'],
    ['src', 'features', 'three', 'motionControlTargetRuntime.ts'],
    ['src', 'features', 'three', 'motionControlSurfaceRuntime.ts'],
    ['src', 'features', 'three', 'motionControlMcpRuntime.ts'],
    ['src', 'features', 'three', 'xrAnimationMcpRuntime.ts'],
    ['src', 'features', 'three', 'xrConstrainedCastMarkRuntime.ts'],
    ['src', 'features', 'three', 'xrMotionReferenceSubjectPlacement.ts'],
    ['src', 'features', 'three', 'xrSpatialPhysicsAdapter.ts'],
    ['src', 'features', 'physics', 'spatialPhysicsEngine.ts'],
    ['src', 'features', 'physics', 'spatialPhysicsStep.ts'],
    ['src', 'features', 'three', 'xrSubjectMotionConstraints.ts'],
    ['src', 'features', 'command-menu', 'mediaCatalogModeRuntime.ts'],
    ['src', 'lib', 'toolbar', 'ToolbarToolMenu.impl.tsx'],
    ['src', 'features', 'three', 'xrSceneMcpRuntime.ts'],
    ['src', 'features', 'three', 'XrCameraMotionSection.tsx'],
    ['src', 'features', 'agent-ready', 'motionControlAgentReadyContract.mjs'],
    ['src', 'features', 'agent-ready', 'motionControlWebMcpTools.ts'],
    ['scripts', 'prepare-litert-assets.mjs'],
    ['package.json'],
    ['..', 'package-lock.json'],
  ]) {
    const text = source(...path)
    if (text.includes(forbiddenOwner)
      || text.includes(forbiddenRepository)
      || text.includes(forbiddenShareHost)
      || text.includes(forbiddenSeedName)
      || text.includes(forbiddenAbsolutePrefix)) {
      throw new Error(`expected clean-room, document-agnostic Motion Control source: ${path.join('/')}`)
    }
  }
}

export async function testMotionControlWebMcpReusesCanonicalXrTargets() {
  type RegisteredTool = Readonly<{
    name: string
    outputSchema?: Record<string, unknown>
    execute: (input?: Record<string, unknown>) => Promise<unknown>
  }>

  const previousSurface = useGraphStore.getState()
  const previousSurfaceState = {
    canvasRenderMode: previousSurface.canvasRenderMode,
    canvas3dMode: previousSurface.canvas3dMode,
    floatingPanelOpen: previousSurface.floatingPanelOpen,
    floatingPanelView: previousSurface.floatingPanelView,
    bottomSurfaceTab: previousSurface.bottomSurfaceTab,
    bottomSurfaceCollapsed: previousSurface.bottomSurfaceCollapsed,
  }
  const { restore } = initJsdomHarness()
  const registeredTools = new Map<string, RegisteredTool>()
  let cameraRequestCount = 0

  try {
    resetKnowgrphWebMcpRuntimeForTests()
    const navigatorObject = window.navigator as Navigator & {
      modelContext?: {
        registerTool?: (tool: RegisteredTool, options?: { signal?: AbortSignal }) => void
      }
    }
    Object.defineProperty(navigatorObject, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          cameraRequestCount += 1
          throw new Error('camera must not be requested by operation=open')
        },
      },
    })
    navigatorObject.modelContext = {
      registerTool(tool, options) {
        if (!options?.signal) throw new Error(`expected AbortSignal-backed registration for ${tool.name}`)
        registeredTools.set(tool.name, tool)
      },
    }
    installKnowgrphWebMcpRuntime()

    const inspectTool = registeredTools.get('knowgrph.inspect_local_motion_control')
    const controlTool = registeredTools.get('knowgrph.control_local_motion_control')
    if (!inspectTool || !controlTool) {
      throw new Error(`expected both Motion Control WebMCP tools, got ${Array.from(registeredTools.keys()).join(', ')}`)
    }
    const inspectOutputSchema = inspectTool.outputSchema as {
      required?: string[]
      properties?: {
        targets?: {
          required?: string[]
          properties?: {
            surfaces?: {
              required?: string[]
              properties?: {
                xr3d?: { properties?: { webMcpTool?: { const?: unknown } } }
                animation?: { properties?: { webMcpTool?: { const?: unknown } } }
              }
            }
          }
        }
      }
    }
    const targetSurfaceSchema = inspectOutputSchema.properties?.targets?.properties?.surfaces
    if (!inspectOutputSchema.required?.includes('targets')
      || !inspectOutputSchema.properties?.targets?.required?.includes('selectedHumanoid')
      || !targetSurfaceSchema?.required?.includes('xr3d')
      || !targetSurfaceSchema.required.includes('animation')
      || targetSurfaceSchema.properties?.xr3d?.properties?.webMcpTool?.const !== 'knowgrph.control_local_xr_scene'
      || targetSurfaceSchema.properties?.animation?.properties?.webMcpTool?.const !== 'knowgrph.control_local_animation') {
      throw new Error(`expected the Motion Control WebMCP output schema to own its target projection, got ${JSON.stringify(inspectTool.outputSchema)}`)
    }

    useGraphStore.setState({
      canvasRenderMode: '2d',
      canvas3dMode: '3d',
      floatingPanelOpen: false,
      floatingPanelView: 'media',
      bottomSurfaceTab: 'stats',
      bottomSurfaceCollapsed: true,
    } as never)
    const inspection = await inspectTool.execute() as {
      schema?: unknown
      targets?: {
        surfaces?: {
          xr3d?: { webMcpTool?: unknown; invocation?: unknown }
          animation?: { webMcpTool?: unknown; invocation?: unknown }
        }
      }
    }
    const opened = await controlTool.execute({ operation: 'open' }) as { ok?: unknown }
    const surface = useGraphStore.getState()
    if (inspection.schema !== 'knowgrph-motion-control-mcp/v2'
      || inspection.targets?.surfaces?.xr3d?.webMcpTool !== 'knowgrph.control_local_xr_scene'
      || inspection.targets?.surfaces?.animation?.webMcpTool !== 'knowgrph.control_local_animation'
      || !String(inspection.targets?.surfaces?.xr3d?.invocation || '').includes('/xr.physics @canvas #controller')
      || !String(inspection.targets?.surfaces?.animation?.invocation || '').startsWith('/animation.control')
      || opened.ok !== true
      || surface.canvasRenderMode !== '3d'
      || surface.canvas3dMode !== 'xr'
      || surface.floatingPanelOpen !== true
      || surface.floatingPanelView !== 'motionControl'
      || surface.bottomSurfaceCollapsed !== false
      || surface.bottomSurfaceTab !== 'timeline'
      || cameraRequestCount !== 0) {
      throw new Error(`expected Motion Control WebMCP open to reuse the canonical XR owners without camera access, got ${JSON.stringify({ inspection, opened, cameraRequestCount })}`)
    }
  } finally {
    await stopMotionControl()
    useGraphStore.setState(previousSurfaceState as never)
    resetKnowgrphWebMcpRuntimeForTests()
    restore()
  }
}
