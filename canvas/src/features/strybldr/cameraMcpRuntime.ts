import { useGraphStore } from '@/hooks/useGraphStore'
import { normalizeCameraControl, type CameraControlAction, type CameraControlInput, type NormalizedCameraControl } from './cameraMcpInput'
import {
  XR_MOTION_REFERENCE_CAMERA_RIGS,
  XR_MOTION_REFERENCE_GRAPH_METADATA_KEY,
  XR_MOTION_REFERENCE_MAX_CAMERA_MARKS,
  serializeXrMotionReferencePlan,
  type XrMotionReferenceCameraRig,
} from '@/features/three/xrMotionReferenceModel'
import {
  markXrMotionReferenceSaved,
  readXrMotionReferenceRuntime,
  restoreXrMotionReferenceRuntimeSnapshot,
  setXrMotionReferenceCameraMark,
  setXrMotionReferenceCameraSettingsAtPlayhead,
  setXrMotionReferenceCameraRig,
  setXrMotionReferencePlayhead,
} from '@/features/three/xrMotionReferenceRuntime'
import { sampleXrMotionReferenceCameraSettings } from '@/features/three/xrMotionReferenceSampling'
import { readCinematicControlMode } from '@/features/cinema/cinematicControlModeRuntime'
import { hydrateCanonicalXrMotionReferenceRuntime } from '@/features/three/XrMotionReferenceRuntimeBridge'
import { readBoundXrSelectedActorId } from '@/features/three/xrSelectedActorBinding'
import { requestXrMotionReferenceCameraPlaybackReapply } from '@/features/three/xrCameraPlaybackControlsRuntime'
import { applyXrCameraMove } from '@/features/three/xrCameraMoveRuntime'
import {
  XR_CAMERA_MOVE_PRESETS,
  isXrCameraMovePresetId,
  resolveXrCameraMovePreset,
  type XrCameraMovePresetId,
} from '@/features/three/xrCameraMoveCatalog'
import { xrMotionReferenceTimelineDocumentKey } from '@/features/three/xrMotionReferenceTimeline'
import {
  CAMERA_INVOCATION_COMMANDS,
  CAMERA_MCP_SCHEMA,
  CAMERA_WEB_MCP_TOOL_IDS,
} from './cameraMcpContract.mjs'
import {
  STRYBLDR_CAMERA_ANGLES,
  STRYBLDR_CAMERA_LEVELS,
  STRYBLDR_CAMERA_MAX_FOCAL_LENGTH_MM,
  STRYBLDR_CAMERA_MIN_FOCAL_LENGTH_MM,
  STRYBLDR_CAMERA_SHOTS,
  readStrybldrCameraSettings,
  type StrybldrCameraAngle,
  type StrybldrCameraLevel,
  type StrybldrCameraShot,
} from './strybldrCamera'
import {
  publishCameraFramingRuntime,
  readCameraFramingRuntime,
  readCameraFramingRuntimeDocumentKey,
} from './cameraFramingRuntime'
import {
  readThreeKeyboardMovementKeys,
  resolveThreeKeyboardCommandAmount,
  type ThreeKeyboardMovementKey,
} from '@/features/three/threeKeyboardChoreography'
import { applyCameraKeyboardChoreography } from './cameraKeyboardChoreographyRuntime'
import { resolveCanonicalCameraInvocationTokens } from './cameraMcpInvocationCatalog'
import {
  CAMERA_ASPECT_RATIO_IDS,
  CAMERA_ASPECT_RATIOS,
  CAMERA_MAX_FOCUS_DISTANCE_METERS,
  CAMERA_MIN_FOCUS_DISTANCE_METERS,
  CAMERA_SENSOR_FORMAT_IDS,
  CAMERA_SENSOR_FORMATS,
  formatCameraOptics,
  type CameraAspectRatioId,
  type CameraSensorFormatId,
} from './cameraOptics'
import {
  controlLocalCameraSource,
  inspectLocalCameraSource,
  isCameraSourceInvocation,
  normalizeCameraSourceSelection,
  rejectInvalidCameraSourceSelection,
} from './cameraSourceMcpRuntime'
import { ensureSharedCameraPanel } from './cameraPanelSurfaceRuntime'
import type { XrNativeControllerCameraMode } from '@/features/three/xrNativeControllerCameraCatalog'
import { activateXrSceneSurface } from '@/features/three/xrSceneSurfaceRuntime'
export { buildCameraKeyboardInvocation } from './cameraMcpInput'
export type { CameraControlAction, CameraControlInput } from './cameraMcpInput'
export type CameraControlResult = Readonly<{
  ok: boolean
  message: string
  action?: CameraControlAction
  errorCode?: string
  field?: string
  token?: string
  invalidValue?: string
  elapsedMs?: number
  deadlineMs?: number
  camera?: ReturnType<typeof inspectLocalCamera>
}>
function resolveCameraAnchor(targetId: string, requireSubject = false): string {
  if (targetId === 'selected-actor') return readBoundXrSelectedActorId()
  if (targetId && targetId !== 'camera') return targetId
  if (requireSubject) {
    const runtime = readXrMotionReferenceRuntime()
    const framingAnchor = readCameraFramingRuntime().anchorId
    if (runtime.plan.cast.some(track => track.actorId === framingAnchor)) return framingAnchor
    return readBoundXrSelectedActorId()
  }
  return 'canvas-camera'
}

function resolveCameraFrame(control: NormalizedCameraControl, anchorId: string) {
  const current = readCameraFramingRuntime()
  const motion = readXrMotionReferenceRuntime()
  const state = useGraphStore.getState()
  const timelineSettings = state.canvasRenderMode === '3d' && state.canvas3dMode === 'xr'
    ? sampleXrMotionReferenceCameraSettings(motion.plan.camera, motion.playheadSeconds)
    : null
  const orbitChanged = Boolean(control.angle || control.level)
  const settings = readStrybldrCameraSettings({
    ...(timelineSettings || current.settings),
    ...(control.angle ? { angle: control.angle } : {}),
    ...(control.level ? { level: control.level } : {}),
    ...(control.shot ? { shot: control.shot } : {}),
    ...(control.sensorId ? { sensorId: control.sensorId } : {}),
    ...(Number.isFinite(control.focalLengthMm) ? { focalLengthMm: control.focalLengthMm } : {}),
    ...(Number.isFinite(control.focusDistanceMeters) ? { focusDistanceMeters: control.focusDistanceMeters } : {}),
    ...(control.aspectRatio ? { aspectRatio: control.aspectRatio } : {}),
    ...(orbitChanged ? { orbitX: undefined, orbitY: undefined } : {}),
  })
  return {
    anchorId,
    settings,
    source: 'panel',
  } as const
}

function hydrateActiveMotionReference(): boolean {
  const state = useGraphStore.getState()
  if (!state.graphData || !String(state.markdownDocumentName || '').trim() || !String(state.markdownDocumentText || '').trim()) return false
  return hydrateCanonicalXrMotionReferenceRuntime()
}

function activateCameraChoreographySurface(): boolean {
  return activateXrSceneSurface({ panelView: 'camera', openPanel: true, timeline: true })
}

function persistMotionReference(): boolean {
  const state = useGraphStore.getState()
  const serialized = serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan)
  state.updateGraphMetadata({ [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: serialized })
  const savedValue = useGraphStore.getState().graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]
  if (savedValue !== serialized) return false
  markXrMotionReferenceSaved(serialized)
  return true
}

function setCameraTimelineState(args: { timeSeconds: number; playing: boolean }): void {
  const state = useGraphStore.getState()
  const documentKey = xrMotionReferenceTimelineDocumentKey(state.markdownDocumentName)
  state.setTimelineTransportState({
    documentKey,
    position: args.timeSeconds / 60,
    playing: args.playing,
  })
}

export function inspectLocalCamera() {
  const state = useGraphStore.getState()
  const framing = readCameraFramingRuntime()
  const motion = readXrMotionReferenceRuntime()
  const canonical = resolveCanonicalCameraInvocationTokens()
  const timelineSettings = state.canvasRenderMode === '3d' && state.canvas3dMode === 'xr'
    ? sampleXrMotionReferenceCameraSettings(motion.plan.camera, motion.playheadSeconds)
    : null
  return {
    schema: CAMERA_MCP_SCHEMA,
    webMcpTools: {
      inspect: `agentic-graph.${CAMERA_WEB_MCP_TOOL_IDS.inspect}`,
      control: `agentic-graph.${CAMERA_WEB_MCP_TOOL_IDS.control}`,
    },
    invocationGrammar: canonical ? {
      source: 'native-agentic-graph-invocation-catalog',
      select: `${canonical.select} ${canonical.camera} ${canonical.cameraSemantic} camera=fixed-follow|free-orbit`,
      frame: `${canonical.frame} ${canonical.camera}|${canonical.selectedActor} ${canonical.cameraShot} angle=front level=eye-level shot=medium sensor=full-frame lens=50 focus=5 aspect=2.39:1`,
      frameKeyboard: `${canonical.frame} ${canonical.camera}|${canonical.selectedActor} ${canonical.cameraShot} keys=<w+a+s+d|arrows> amount=<orbit-units> fine=<true|false>`,
      animate: `${canonical.animate} ${canonical.camera}|${canonical.selectedActor} ${canonical.cameraMotion} rig=dolly time=2.5 sensor=super-35 lens=35 focus=2 aspect=1.85:1`,
      animateKeyboard: `${canonical.animate} ${canonical.camera} ${canonical.cameraMotion} keys=<w+a+s+d|arrows> amount=<orbit-units> fine=<true|false> markId=<typed-id>`,
      move: `${canonical.animate} ${canonical.selectedActor} ${canonical.cameraMotion} move=orbit-clockwise time=1 duration=3`,
      playback: `${canonical.playback} ${canonical.camera} ${canonical.cameraMotion} state=play|pause`,
      scrub: `${canonical.scrub} ${canonical.camera} ${canonical.cameraMotion} time=2.5`,
    } : null,
    optics: {
      stateOwner: 'FloatingPanel.Camera',
      timelineRole: 'keyframe-projection',
      sensors: CAMERA_SENSOR_FORMATS.map(sensor => ({ ...sensor })),
      aspects: CAMERA_ASPECT_RATIOS.map(aspect => ({ ...aspect })),
      interpolated: ['focalLengthMm', 'focusDistanceMeters'],
      discreteAtMark: ['sensorId', 'aspectRatio'],
    },
    surface: {
      renderMode: state.canvasRenderMode,
      threeMode: state.canvas3dMode,
      cameraPanelOpen: state.floatingPanelOpen === true && state.floatingPanelView === 'camera',
      motionTimelineOpen: state.bottomSurfaceCollapsed === false && state.bottomSurfaceTab === 'timeline',
    },
    source: inspectLocalCameraSource(),
    framing: {
      anchorId: framing.anchorId,
      documentKey: readCameraFramingRuntimeDocumentKey(),
      settings: { ...(timelineSettings || framing.settings) },
      source: timelineSettings ? 'timeline' : framing.source,
      revision: framing.revision,
    },
    choreography: {
      playheadSeconds: motion.playheadSeconds,
      durationSeconds: motion.plan.durationSeconds,
      fps: motion.plan.fps,
      selectedRig: motion.selectedCameraRig,
      cameraMarks: motion.plan.camera.length,
      cameraMoves: motion.plan.camera.filter(mark => mark.moveId !== 'custom').map(mark => mark.moveId),
      availableMoves: XR_CAMERA_MOVE_PRESETS.map(preset => ({ id: preset.id, label: preset.label, rig: preset.rig, defaultDurationSeconds: preset.defaultDurationSeconds })),
      playing: state.timelineTransportPlaying === true,
      transportDocumentKey: state.timelineTransportDocumentKey || '',
    },
  }
}

export function controlLocalCamera(input: CameraControlInput): CameraControlResult {
  const canonical = resolveCanonicalCameraInvocationTokens()
  const invalidCameraSource = rejectInvalidCameraSourceSelection(input, canonical, inspectLocalCamera)
  if (invalidCameraSource) return invalidCameraSource
  const control = normalizeCameraControl(input)
  if (!control) return { ok: false, message: 'Use a supported structured Camera action or native /camera.* invocation.' }
  if (readCinematicControlMode() !== 'agent') {
    return { ok: false, action: control.action, errorCode: 'controller-conflict', message: 'Camera is in Human control mode. Switch Control owner to AI / LLM / MCP before invoking Camera WebMCP.' }
  }
  if (control.action === 'select') return control.cameraId
    ? controlLocalCameraSource({ action: 'select', cameraId: control.cameraId, targetId: 'camera', invocation: control.invocation }, inspectLocalCamera)
    : { ok: false, action: 'select', message: 'Select fixed-follow or free-orbit.' }
  if ((control.action === 'playback' || control.action === 'scrub') && control.targetId && control.targetId !== 'camera') {
    return { ok: false, action: control.action, message: 'Camera transport targets the shared @camera binding.' }
  }
  const actorTargetRequested = Boolean(control.targetId && control.targetId !== 'camera')
  if ((control.action !== 'frame' || actorTargetRequested) && !hydrateActiveMotionReference()) {
    return { ok: false, action: control.action, message: 'Open or create a graph document before controlling Camera choreography.' }
  }
  const runtime = readXrMotionReferenceRuntime()
  const anchorId = resolveCameraAnchor(control.targetId, Boolean(control.moveId))
  if ((control.targetId === 'selected-actor' || control.moveId) && !anchorId) {
    return { ok: false, action: control.action, message: 'Select a cast actor before targeting @selected-actor.' }
  }
  if (anchorId !== 'canvas-camera' && !runtime.plan.cast.some(track => track.actorId === anchorId)) {
    return { ok: false, action: control.action, message: `Camera target ${anchorId || '(empty)'} is not in the active cast.` }
  }

  if (control.keys.length > 0 && control.amount !== undefined) {
    const choreographyPlaying = useGraphStore.getState().timelineTransportPlaying === true
      && runtime.plan.camera.length > 0
    if (choreographyPlaying) {
      return { ok: false, action: control.action, message: 'Pause Camera choreography before applying keyboard-driven Camera movement.' }
    }
    const surfaceReady = control.action === 'animate'
      ? activateCameraChoreographySurface()
      : ensureSharedCameraPanel()
    if (!surfaceReady) {
      return { ok: false, action: control.action, message: 'Camera control requires an available shared XR Mode surface.' }
    }
    const keyboardResult = applyCameraKeyboardChoreography({
      action: control.action as 'animate' | 'frame',
      amount: control.amount,
      anchorId,
      keys: control.keys,
      markId: control.markId,
      requireAnchorMatch: control.targetId === 'selected-actor',
    })
    if (!keyboardResult.ok) return { ok: false, action: control.action, message: keyboardResult.message }
    if (control.action === 'animate') {
      const timeSeconds = keyboardResult.timeSeconds || 0
      setCameraTimelineState({ timeSeconds, playing: false })
    }
    return { ok: true, action: control.action, message: keyboardResult.message, camera: inspectLocalCamera() }
  }
  if (control.action === 'frame') {
    const state = useGraphStore.getState()
    const choreographyPlaying = state.canvasRenderMode === '3d'
      && state.canvas3dMode === 'xr'
      && state.timelineTransportPlaying === true
      && runtime.plan.camera.length > 0
    if (choreographyPlaying) {
      return { ok: false, action: control.action, message: 'Pause Camera choreography before applying an explicit framing pose.' }
    }
    if (!ensureSharedCameraPanel()) {
      return { ok: false, action: control.action, message: 'Camera framing requires an available shared Camera panel.' }
    }
    const nextFraming = resolveCameraFrame(control, anchorId)
    const timelineOwnsCamera = state.canvasRenderMode === '3d'
      && state.canvas3dMode === 'xr'
      && runtime.plan.camera.length > 0
    if (timelineOwnsCamera) {
      if (state.timelineTransportPlaying) {
        return { ok: false, action: control.action, message: 'Pause Camera choreography before editing the active Timeline key.' }
      }
      const previous = readXrMotionReferenceRuntime()
      const edited = setXrMotionReferenceCameraSettingsAtPlayhead(nextFraming.settings)
      if (edited === previous) {
        return { ok: false, action: control.action, errorCode: 'camera-key-limit', message: `Camera Timeline could not add a key at ${previous.playheadSeconds.toFixed(2)}s. Check the ${XR_MOTION_REFERENCE_MAX_CAMERA_MARKS}-mark limit or select an existing Camera mark.` }
      }
      if (!persistMotionReference()) {
        restoreXrMotionReferenceRuntimeSnapshot(previous)
        return { ok: false, action: control.action, message: 'Camera framing could not be written to graph metadata.' }
      }
      const activeSettings = sampleXrMotionReferenceCameraSettings(readXrMotionReferenceRuntime().plan.camera, previous.playheadSeconds) || nextFraming.settings
      return {
        ok: true,
        action: control.action,
        message: `Timeline Camera framed ${activeSettings.shot} at ${previous.playheadSeconds.toFixed(2)}s: ${formatCameraOptics(activeSettings)}.`,
        camera: inspectLocalCamera(),
      }
    }
    const framing = publishCameraFramingRuntime(nextFraming)
    return {
      ok: true,
      action: control.action,
      message: `Camera framed ${framing.settings.shot} around ${framing.anchorId}: ${formatCameraOptics(framing.settings)}.`,
      camera: inspectLocalCamera(),
    }
  }

  const durationSeconds = runtime.plan.durationSeconds
  const requestedTime = Number.isFinite(control.timeSeconds) ? Number(control.timeSeconds) : runtime.playheadSeconds
  const timeSeconds = Math.max(0, Math.min(durationSeconds, requestedTime))
  if (control.action === 'animate') {
    const replacesExistingMark = runtime.plan.camera.some(mark => Math.abs(mark.timeSeconds - timeSeconds) < 0.0005)
    if (!control.moveId && runtime.plan.camera.length >= XR_MOTION_REFERENCE_MAX_CAMERA_MARKS && !replacesExistingMark) {
      return { ok: false, action: control.action, message: `Camera choreography already has the maximum ${XR_MOTION_REFERENCE_MAX_CAMERA_MARKS} marks.` }
    }
    if (!activateCameraChoreographySurface()) {
      return { ok: false, action: control.action, message: 'Camera choreography requires an available shared XR Mode surface.' }
    }
    const previousRuntime = runtime
    const framing = resolveCameraFrame(control, anchorId)
    setXrMotionReferencePlayhead(timeSeconds)
    const moveResult = control.moveId ? applyXrCameraMove({
      moveId: control.moveId,
      anchorId: framing.anchorId,
      playheadSeconds: timeSeconds,
      moveDurationSeconds: control.moveDurationSeconds,
      settings: framing.settings,
    }, 'agent') : null
    const rig = control.moveId ? resolveXrCameraMovePreset(control.moveId).rig : control.rig || runtime.selectedCameraRig
    if (moveResult && !moveResult.applied) {
      restoreXrMotionReferenceRuntimeSnapshot(previousRuntime)
      return { ok: false, action: control.action, message: moveResult.message }
    }
    if (!control.moveId) {
      setXrMotionReferenceCameraRig(rig)
      setXrMotionReferenceCameraMark({
        timeSeconds,
        anchorId: framing.anchorId,
        settings: { ...framing.settings },
        rig,
      })
    }
    if (!persistMotionReference()) {
      restoreXrMotionReferenceRuntimeSnapshot(previousRuntime)
      return { ok: false, action: control.action, message: 'Camera choreography could not be written to graph metadata.' }
    }
    publishCameraFramingRuntime(framing)
    const timelineTimeSeconds = moveResult?.startTimeSeconds ?? timeSeconds
    setXrMotionReferencePlayhead(timelineTimeSeconds)
    setCameraTimelineState({ timeSeconds: timelineTimeSeconds, playing: false })
    return {
      ok: true,
      action: control.action,
      message: control.moveId
        ? `${resolveXrCameraMovePreset(control.moveId).label} Camera move applied around ${framing.anchorId}.`
        : `${rig} Camera choreography mark dropped at ${timeSeconds.toFixed(2)}s.`,
      camera: inspectLocalCamera(),
    }
  }

  if (!activateCameraChoreographySurface()) {
    return { ok: false, action: control.action, message: 'Camera choreography requires an available shared XR Mode surface.' }
  }

  if (control.action === 'scrub') {
    setXrMotionReferencePlayhead(timeSeconds)
    setCameraTimelineState({ timeSeconds, playing: false })
    requestXrMotionReferenceCameraPlaybackReapply()
    return {
      ok: true,
      action: control.action,
      message: `Camera choreography scrubbed to ${timeSeconds.toFixed(2)}s.`,
      camera: inspectLocalCamera(),
    }
  }

  const playing = control.playing !== false
  const playbackTime = playing && timeSeconds >= durationSeconds ? 0 : timeSeconds
  setXrMotionReferencePlayhead(playbackTime)
  setCameraTimelineState({ timeSeconds: playbackTime, playing })
  if (playing) requestXrMotionReferenceCameraPlaybackReapply()
  return {
    ok: true,
    action: control.action,
    message: `Camera choreography ${playing ? 'playing' : 'paused'} at ${playbackTime.toFixed(2)}s.`,
    camera: inspectLocalCamera(),
  }
}
