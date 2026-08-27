import { useGraphStore } from '@/hooks/useGraphStore'
import {
  XR_ANIMATION_PRESETS,
  resolveXrAnimationPreset,
  type XrAnimationPresetId,
  type XrAnimationTrackKind,
} from './xrAnimationCatalog'
import {
  XR_CHOREOGRAPHY_EASINGS,
  XR_CHOREOGRAPHY_GAITS,
  XR_MOTION_REFERENCE_GRAPH_METADATA_KEY,
  serializeXrMotionReferencePlan,
  type XrChoreographyEasing,
  type XrChoreographyGait,
  type XrMotionReferencePackage,
  type XrMotionReferenceVector,
} from './xrMotionReferenceModel'
import {
  markXrMotionReferenceSaved,
  readXrMotionReferenceRuntime,
  restoreXrMotionReferenceRuntimeSnapshot,
  selectXrMotionReferenceCameraMark,
  selectXrMotionReferenceCastMark,
  setXrMotionReferenceCameraMarkChoreography,
  setXrMotionReferencePlayhead,
} from './xrMotionReferenceRuntime'
import { readBoundXrSelectedActorId, selectBoundXrActor } from './xrSelectedActorBinding'
import { requestXrMotionReferenceCameraPlaybackReapply } from './xrCameraPlaybackControlsRuntime'
import { hydrateCanonicalXrMotionReferenceRuntime, hydrateCanonicalXrPhysicsRuntime } from './XrMotionReferenceRuntimeBridge'
import { buildXrMotionReferencePackage } from './xrMotionReferencePackage'
import { xrMotionReferenceTimelineDocumentKey } from './xrMotionReferenceTimeline'
import {
  XR_ANIMATION_INVOCATION_BINDINGS,
  XR_ANIMATION_INVOCATION_COMMANDS,
  XR_ANIMATION_INVOCATION_SEMANTICS,
  XR_ANIMATION_MCP_SCHEMA,
  XR_ANIMATION_WEB_MCP_TOOL_IDS,
} from './xrAnimationMcpContract.mjs'
import { resolveXrChoreographySpeedWarnings } from './xrChoreographyDiagnostics'
import {
  THREE_OBJECT_KEYBOARD_FINE_STEP_METERS,
  THREE_OBJECT_KEYBOARD_MAX_COMMAND_DISTANCE_METERS,
  THREE_OBJECT_KEYBOARD_STEP_METERS,
  readThreeKeyboardMovementKeys,
  type ThreeKeyboardMovementKey,
} from './threeKeyboardChoreography'
import { readXrPhysicsRuntime, readXrPhysicsRuntimeFrame } from './xrPhysicsRuntime'
import { resolveXrSubjectKeyboardMotion, type XrSubjectMotionResolution } from './xrSubjectMotionConstraints'
import {
  applyXrConstrainedCastMarkChoreography,
} from './xrConstrainedCastMarkRuntime'
import { updateXrAnimationAssignment } from './xrAnimationAssignmentRuntime'
import { activateXrSceneSurface } from './xrSceneSurfaceRuntime'
import { readXrSceneDocumentReady } from './xrSceneDocumentReadiness'

const XR_ANIMATION_CONTROL_OPERATIONS = Object.freeze([
  'apply',
  'clear',
  'configure-mark',
  'move-object',
  'play',
  'pause',
  'scrub',
  'export',
] as const)

const XR_ANIMATION_STRUCTURED_KEYS = Object.freeze({
  apply: ['operation', 'trackKind', 'presetId', 'targetId'],
  clear: ['operation', 'trackKind', 'targetId'],
  'configure-mark': ['operation', 'markKind', 'markId', 'targetId', 'trackKind', 'easing', 'gait', 'position'],
  'move-object': ['operation', 'trackKind', 'targetId', 'markId', 'keys', 'distanceMeters', 'fine'],
  play: ['operation'],
  pause: ['operation'],
  scrub: ['operation', 'timeSeconds'],
  export: ['operation'],
} as const)

export type XrAnimationControlOperation = typeof XR_ANIMATION_CONTROL_OPERATIONS[number]

export type XrAnimationControlInput = Readonly<{
  invocation?: string
  operation?: XrAnimationControlOperation
  trackKind?: XrAnimationTrackKind
  presetId?: string
  targetId?: string
  timeSeconds?: number
  markKind?: 'cast' | 'camera'
  markId?: string
  easing?: XrChoreographyEasing
  gait?: XrChoreographyGait
  position?: XrMotionReferenceVector
  keys?: readonly string[]
  distanceMeters?: number
  fine?: boolean
}>

export type XrAnimationControlResult = Readonly<{
  ok: boolean
  message: string
  operation?: XrAnimationControlOperation
  targetId?: string
  package?: XrMotionReferencePackage
  motion?: Readonly<{
    status: XrSubjectMotionResolution['status']
    requestedDistanceMeters: number
    appliedDistanceMeters: number
    position: XrMotionReferenceVector
  }>
  scene?: ReturnType<typeof inspectLocalAnimation>
}>

type CanonicalInvocationTokens = Readonly<{
  command: string
  characterMotion: string
  actionPath: string
  selectedActor: string
  canvas: string
}>

type NormalizedAnimationControl = Readonly<{
  operation: XrAnimationControlOperation
  trackKind?: XrAnimationTrackKind
  presetId: string
  targetId: string
  timeSeconds: number
  invocation: string
  markKind: 'cast' | 'camera'
  markId: string
  easing?: XrChoreographyEasing
  gait?: XrChoreographyGait
  position?: XrMotionReferenceVector
  keys: readonly ThreeKeyboardMovementKey[]
  distanceMeters: number
  fine: boolean
}>

const resolveCanonicalInvocationTokens = (): CanonicalInvocationTokens => ({
  command: XR_ANIMATION_INVOCATION_COMMANDS.control,
  characterMotion: XR_ANIMATION_INVOCATION_SEMANTICS.characterMotion,
  actionPath: XR_ANIMATION_INVOCATION_SEMANTICS.actionPath,
  selectedActor: XR_ANIMATION_INVOCATION_BINDINGS.selectedActor,
  canvas: XR_ANIMATION_INVOCATION_BINDINGS.canvas,
})

export function buildXrAnimationInvocation(presetIdValue: XrAnimationPresetId): string {
  const tokens = resolveCanonicalInvocationTokens()
  const preset = resolveXrAnimationPreset(presetIdValue)
  const semantic = preset.kind === 'character-motion' ? tokens.characterMotion : tokens.actionPath
  return `${tokens.command} ${semantic} ${tokens.selectedActor} operation=apply preset=${preset.id}`
}

export function buildXrAnimationObjectMoveInvocation(input: Readonly<{
  keys: Iterable<string>
  distanceMeters?: number
  fine?: boolean
  markId?: string
}>): string {
  const tokens = resolveCanonicalInvocationTokens()
  const keys = readThreeKeyboardMovementKeys(input.keys)
  const markId = String(input.markId || '').trim()
  if (!keys || (markId && !/^[a-zA-Z0-9:._-]+$/.test(markId))) return ''
  if (input.fine !== undefined && typeof input.fine !== 'boolean') return ''
  if (input.distanceMeters !== undefined
    && (!Number.isFinite(input.distanceMeters)
      || input.distanceMeters <= 0
      || input.distanceMeters > THREE_OBJECT_KEYBOARD_MAX_COMMAND_DISTANCE_METERS)) return ''
  const parameters = [
    `keys=${keys.join('+')}`,
    ...(input.distanceMeters === undefined ? [] : [`distance=${Number(input.distanceMeters.toFixed(3))}`]),
    ...(input.fine ? ['fine=true'] : []),
    ...(markId ? [`markId=${markId}`] : []),
  ]
  return `${tokens.command} ${tokens.actionPath} ${tokens.selectedActor} operation=move-object ${parameters.join(' ')}`
}

export function buildXrAnimationTransportInvocation(operation: 'play' | 'pause' | 'scrub' | 'export', timeSeconds?: number): string {
  const tokens = resolveCanonicalInvocationTokens()
  if (operation === 'scrub' && (!Number.isFinite(timeSeconds) || Number(timeSeconds) < 0)) return ''
  return `${tokens.command} ${tokens.canvas} operation=${operation}${operation === 'scrub' ? ` time=${Number(timeSeconds).toFixed(3)}` : ''}`
}

function parsePairs(tokens: readonly string[]): Readonly<Record<string, string>> | null {
  const entries: Array<readonly [string, string]> = []
  const seen = new Set<string>()
  for (const token of tokens) {
    const separator = token.indexOf('=')
    if (separator <= 0 || separator === token.length - 1) return null
    const key = token.slice(0, separator)
    const value = token.slice(separator + 1)
    if (!['operation', 'preset', 'time', 'keys', 'distance', 'fine', 'markKind', 'markId', 'easing', 'gait', 'position'].includes(key) || seen.has(key)) return null
    seen.add(key)
    entries.push([key, value])
  }
  return Object.freeze(Object.fromEntries(entries))
}

function parseInvocation(value: unknown): Partial<NormalizedAnimationControl> | null {
  const invocation = String(value || '').trim()
  if (!invocation) return null
  const canonical = resolveCanonicalInvocationTokens()
  const tokens = invocation.split(/\s+/).filter(Boolean)
  if (tokens[0] !== canonical.command) return null
  if (tokens.slice(1).some(token => token.startsWith('/'))) return null
  const semantics = tokens.filter(token => token.startsWith('#'))
  const bindings = tokens.filter(token => token.startsWith('@'))
  const pairs = parsePairs(tokens.slice(1).filter(token => !token.startsWith('#') && !token.startsWith('@')))
  if (!pairs) return null
  const operation = String(pairs.operation || '').trim() as XrAnimationControlOperation
  if (!XR_ANIMATION_CONTROL_OPERATIONS.includes(operation)) return null
  const markKind = pairs.markKind === 'cast' || pairs.markKind === 'camera' ? pairs.markKind : ''
  const configureCastMark = operation === 'configure-mark' && markKind === 'cast'
  const configureCameraMark = operation === 'configure-mark' && markKind === 'camera'
  const actorOperation = operation === 'apply' || operation === 'clear' || operation === 'move-object'
  if (operation === 'configure-mark' && !configureCastMark && !configureCameraMark) return null
  if (actorOperation || configureCastMark) {
    if (bindings.length !== 1 || bindings[0] !== canonical.selectedActor) return null
    if (semantics.length !== 1 || ![canonical.characterMotion, canonical.actionPath].includes(semantics[0]!)) return null
    if ((operation === 'move-object' || configureCastMark) && semantics[0] !== canonical.actionPath) return null
  } else if (bindings.length !== 1 || bindings[0] !== canonical.canvas || semantics.length !== 0) {
    return null
  }
  const allowedPairKeys = actorOperation
    ? operation === 'apply'
      ? ['operation', 'preset']
      : operation === 'move-object'
        ? ['operation', 'keys', 'distance', 'fine', 'markId']
        : ['operation']
    : operation === 'configure-mark'
      ? ['operation', 'markKind', 'markId', 'easing', 'gait', 'position']
      : operation === 'scrub' ? ['operation', 'time'] : ['operation']
  if (Object.keys(pairs).some(key => !allowedPairKeys.includes(key))) return null
  if (operation === 'apply' && !pairs.preset) return null
  const movementKeys = operation === 'move-object'
    ? readThreeKeyboardMovementKeys(String(pairs.keys || '').split('+'))
    : Object.freeze([])
  if (operation === 'move-object' && !movementKeys) return null
  const movementDistance = pairs.distance === undefined ? undefined : Number(pairs.distance)
  if (movementDistance !== undefined
    && (!Number.isFinite(movementDistance)
      || movementDistance <= 0
      || movementDistance > THREE_OBJECT_KEYBOARD_MAX_COMMAND_DISTANCE_METERS)) return null
  const fine = pairs.fine === undefined ? false : pairs.fine === 'true'
  if (pairs.fine !== undefined && pairs.fine !== 'true' && pairs.fine !== 'false') return null
  if (pairs.markId !== undefined && !/^[a-zA-Z0-9:._-]+$/.test(pairs.markId)) return null
  const easing = pairs.easing && XR_CHOREOGRAPHY_EASINGS.includes(pairs.easing as XrChoreographyEasing)
    ? pairs.easing as XrChoreographyEasing
    : undefined
  const gait = pairs.gait && XR_CHOREOGRAPHY_GAITS.includes(pairs.gait as XrChoreographyGait)
    ? pairs.gait as XrChoreographyGait
    : undefined
  if (pairs.easing && !easing) return null
  if (pairs.gait && !gait) return null
  const parsedPosition = pairs.position?.split(',').map(Number)
  const position = parsedPosition?.length === 3
    && parsedPosition.every(value => Number.isFinite(value) && Math.abs(value) <= 1000)
    ? [parsedPosition[0]!, parsedPosition[1]!, parsedPosition[2]!] as XrMotionReferenceVector
    : undefined
  if (pairs.position && !position) return null
  if (operation === 'configure-mark') {
    if (!pairs.markId || (!easing && !gait && !position)) return null
    if (configureCameraMark && (!easing || gait || position)) return null
  }
  if (operation === 'scrub' && (!Object.hasOwn(pairs, 'time') || !Number.isFinite(Number(pairs.time)) || Number(pairs.time) < 0)) return null
  const semantic = actorOperation || configureCastMark ? semantics[0]! : ''
  const binding = bindings[0]!
  return {
    invocation,
    operation,
    presetId: String(pairs.preset || '').trim(),
    targetId: binding === canonical.selectedActor ? 'selected-actor' : binding === canonical.canvas ? 'canvas' : '',
    timeSeconds: Number(pairs.time || 0),
    keys: movementKeys || Object.freeze([]),
    distanceMeters: movementDistance ?? (fine ? THREE_OBJECT_KEYBOARD_FINE_STEP_METERS : THREE_OBJECT_KEYBOARD_STEP_METERS),
    fine,
    ...(operation === 'configure-mark' ? { markKind: markKind as 'cast' | 'camera' } : {}),
    markId: String(pairs.markId || '').trim(),
    ...(easing ? { easing } : {}),
    ...(gait ? { gait } : {}),
    ...(position ? { position } : {}),
    ...(semantic ? { trackKind: semantic === canonical.characterMotion ? 'character-motion' : 'action-path' } : {}),
  }
}

function normalizeControl(input: XrAnimationControlInput): NormalizedAnimationControl | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const invocation = String(input.invocation || '').trim()
  const parsed = parseInvocation(invocation)
  if (invocation && !parsed) return null
  if (invocation && (Object.keys(input).length !== 1 || !Object.hasOwn(input, 'invocation'))) return null
  const operation = (parsed?.operation || input.operation) as XrAnimationControlOperation | undefined
  if (!operation || !XR_ANIMATION_CONTROL_OPERATIONS.includes(operation)) return null
  if (!invocation) {
    const allowedKeys = XR_ANIMATION_STRUCTURED_KEYS[operation]
    if (Object.keys(input).some(key => !(allowedKeys as readonly string[]).includes(key))) return null
    if (input.targetId !== undefined && !String(input.targetId).trim()) return null
    if (input.trackKind !== undefined && input.trackKind !== 'character-motion' && input.trackKind !== 'action-path') return null
    if (operation === 'apply' && !String(input.presetId || '').trim()) return null
    if (operation === 'configure-mark') {
      if (!Object.hasOwn(input, 'markKind')
        || !String(input.markId || '').trim()
        || !/^[a-zA-Z0-9:._-]+$/.test(String(input.markId || ''))
        || (!input.easing && !input.gait && !input.position)) return null
      if (input.markKind === 'camera' && (
        !input.easing
        || input.gait !== undefined
        || input.position !== undefined
        || input.targetId !== undefined
        || input.trackKind !== undefined
      )) return null
      if (input.markKind === 'cast' && input.trackKind !== undefined && input.trackKind !== 'action-path') return null
    }
    if (operation === 'move-object' && (!input.keys || input.keys.length === 0 || (input.trackKind !== undefined && input.trackKind !== 'action-path'))) return null
    if (operation === 'scrub' && !Object.hasOwn(input, 'timeSeconds')) return null
  }
  if (input.trackKind !== undefined && input.trackKind !== 'character-motion' && input.trackKind !== 'action-path') return null
  if (input.markKind !== undefined && input.markKind !== 'cast' && input.markKind !== 'camera') return null
  if (input.easing !== undefined && !XR_CHOREOGRAPHY_EASINGS.includes(input.easing)) return null
  if (input.gait !== undefined && !XR_CHOREOGRAPHY_GAITS.includes(input.gait)) return null
  if (input.position !== undefined && (input.position.length !== 3 || input.position.some(value => !Number.isFinite(value) || Math.abs(value) > 1000))) return null
  const markKind = parsed?.markKind || input.markKind || 'cast'
  const easing = parsed?.easing || input.easing
  const gait = parsed?.gait || input.gait
  const position = parsed?.position || input.position
  if (markKind === 'camera' && (gait !== undefined || position !== undefined)) return null
  if (input.fine !== undefined && typeof input.fine !== 'boolean') return null
  if (input.keys !== undefined && (!Array.isArray(input.keys) || input.keys.some(key => typeof key !== 'string'))) return null
  const movementKeys = parsed?.keys || (input.keys ? readThreeKeyboardMovementKeys(input.keys) : null)
  const movementDistanceInput = parsed ? parsed.distanceMeters : input.distanceMeters
  const fine = parsed?.fine ?? input.fine ?? false
  const hasMovementFields = input.keys !== undefined || input.distanceMeters !== undefined || input.fine !== undefined
  if (operation === 'move-object') {
    if (!movementKeys
      || input.markKind === 'camera'
      || (input.trackKind !== undefined && input.trackKind !== 'action-path')
      || input.presetId !== undefined
      || input.timeSeconds !== undefined
      || easing !== undefined
      || gait !== undefined
      || position !== undefined) return null
  } else if (hasMovementFields) return null
  if (movementDistanceInput !== undefined
    && (!Number.isFinite(movementDistanceInput)
      || Number(movementDistanceInput) <= 0
      || Number(movementDistanceInput) > THREE_OBJECT_KEYBOARD_MAX_COMMAND_DISTANCE_METERS)) return null
  const trackKind = parsed?.trackKind || input.trackKind
  const timeSeconds = parsed ? parsed.timeSeconds : input.timeSeconds
  if (operation === 'scrub' && (!Number.isFinite(timeSeconds) || Number(timeSeconds) < 0)) return null
  return {
    operation,
    ...(trackKind === 'character-motion' || trackKind === 'action-path' ? { trackKind } : {}),
    presetId: String(parsed?.presetId || input.presetId || '').trim(),
    targetId: String(parsed?.targetId || input.targetId || '').trim().replace(/^@+/, ''),
    timeSeconds: Number.isFinite(timeSeconds) ? Number(timeSeconds) : 0,
    invocation: String(parsed?.invocation || input.invocation || '').trim(),
    markKind,
    markId: String(parsed?.markId || input.markId || '').trim(),
    ...(easing ? { easing } : {}),
    ...(gait ? { gait } : {}),
    ...(position ? { position: [...position] as XrMotionReferenceVector } : {}),
    keys: movementKeys || Object.freeze([]),
    distanceMeters: movementDistanceInput === undefined
      ? fine ? THREE_OBJECT_KEYBOARD_FINE_STEP_METERS : THREE_OBJECT_KEYBOARD_STEP_METERS
      : Number(movementDistanceInput),
    fine,
  }
}

function sceneReady(): boolean {
  return readXrSceneDocumentReady()
}

function resolvedTargetId(control: NormalizedAnimationControl): string {
  if (!control.targetId || control.targetId === 'selected-actor') return readBoundXrSelectedActorId()
  return control.targetId === 'canvas' ? '' : control.targetId
}

function persistPlan(): boolean {
  const state = useGraphStore.getState()
  const serialized = serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan)
  state.updateGraphMetadata({ [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: serialized })
  const saved = useGraphStore.getState().graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]
  if (saved !== serialized) return false
  markXrMotionReferenceSaved(serialized)
  return true
}

function activateAnimationSurface(): boolean {
  return activateXrSceneSurface({ panelView: 'animation', openPanel: true, timeline: true })
}

function updateTransport(operation: 'play' | 'pause' | 'scrub', timeSeconds: number): void {
  const state = useGraphStore.getState()
  const documentKey = xrMotionReferenceTimelineDocumentKey(state.markdownDocumentName)
  if (operation === 'scrub') {
    const duration = readXrMotionReferenceRuntime().plan.durationSeconds
    const bounded = Math.min(duration, Math.max(0, Number(timeSeconds) || 0))
    setXrMotionReferencePlayhead(bounded)
    state.setTimelineTransportState({ documentKey, position: bounded / 60 })
    requestXrMotionReferenceCameraPlaybackReapply()
    return
  }
  state.setTimelineTransportState({ documentKey, playing: operation === 'play' })
  if (operation === 'play') requestXrMotionReferenceCameraPlaybackReapply()
}

export function inspectLocalAnimation() {
  const runtime = readXrMotionReferenceRuntime()
  const speedWarnings = resolveXrChoreographySpeedWarnings(runtime.plan)
  const canonical = resolveCanonicalInvocationTokens()
  return {
    schema: XR_ANIMATION_MCP_SCHEMA,
    webMcpTools: {
      inspect: `agenticgraph.${XR_ANIMATION_WEB_MCP_TOOL_IDS.inspect}`,
      control: `agenticgraph.${XR_ANIMATION_WEB_MCP_TOOL_IDS.control}`,
    },
    sceneReady: sceneReady(),
    catalog: {
      source: 'native-agenticgraph-invocation-catalog',
      hydration: { status: 'native-ready', attempts: 0, error: '' },
      canonical: true,
    },
    invocationGrammar: {
      applyCharacterMotion: `${canonical.command} ${canonical.characterMotion} ${canonical.selectedActor} operation=apply preset=<typed-id>`,
      applyActionPath: `${canonical.command} ${canonical.actionPath} ${canonical.selectedActor} operation=apply preset=<typed-id>`,
      moveObject: `${canonical.command} ${canonical.actionPath} ${canonical.selectedActor} operation=move-object keys=<w+a+s+d|arrows> distance=<meters> fine=<true|false> markId=<typed-id>`,
      configureCastMark: `${canonical.command} ${canonical.actionPath} ${canonical.selectedActor} operation=configure-mark markKind=cast markId=<typed-id> easing=<typed-easing> gait=<typed-gait> position=<x,y,z>`,
      configureCameraMark: `${canonical.command} ${canonical.canvas} operation=configure-mark markKind=camera markId=<typed-id> easing=<typed-easing>`,
      transport: `${canonical.command} ${canonical.canvas} operation=play|pause|scrub|export`,
    },
    presets: XR_ANIMATION_PRESETS.map(preset => ({
      ...preset,
      invocation: buildXrAnimationInvocation(preset.id),
    })),
    runtime: {
      stageId: runtime.plan.stageId,
      durationSeconds: runtime.plan.durationSeconds,
      fps: runtime.plan.fps,
      selectedActorId: readBoundXrSelectedActorId(),
      playheadSeconds: runtime.playheadSeconds,
      cast: runtime.plan.cast.map(track => ({ actorId: track.actorId, label: track.label, animation: track.animation, marks: track.marks })),
      cameraMarks: runtime.plan.camera,
      speedWarnings,
      dirty: runtime.dirty,
      revision: runtime.revision,
    },
  }
}

export function controlLocalAnimation(input: XrAnimationControlInput): XrAnimationControlResult {
  const control = normalizeControl(input)
  if (!control) return { ok: false, message: 'Use a supported structured animation operation or native /animation.control invocation.' }
  if (!sceneReady() || !hydrateCanonicalXrMotionReferenceRuntime()) return { ok: false, message: 'Open or create a graph document before controlling XR animation.' }
  hydrateCanonicalXrPhysicsRuntime()
  if (control.operation !== 'export' && !activateAnimationSurface()) {
    return { ok: false, message: 'XR Animation requires an available shared XR Mode surface.' }
  }
  const targetId = resolvedTargetId(control)

  if (control.operation === 'move-object') {
    const previousRuntime = readXrMotionReferenceRuntime()
    const track = previousRuntime.plan.cast.find(candidate => candidate.actorId === targetId)
    const selectedMark = previousRuntime.selectedMark
    const markId = control.markId || (selectedMark?.kind === 'cast' && selectedMark.actorId === targetId ? selectedMark.markId : '')
    const mark = track?.marks.find(candidate => candidate.id === markId)
    if (!track || !mark) return { ok: false, message: 'Select a valid cast mark before moving a 3D object.' }
    const physics = readXrPhysicsRuntime()
    const motion = resolveXrSubjectKeyboardMotion({
      actorId: targetId,
      distanceMeters: control.distanceMeters,
      keys: control.keys,
      markId,
      physics,
      physicsFrame: physics.phase === 'stopped' ? undefined : readXrPhysicsRuntimeFrame(),
      plan: previousRuntime.plan,
      position: mark.position,
      timeSeconds: mark.timeSeconds,
    })
    if (!motion) return { ok: false, message: 'Use one or more supported WASD or arrow movement keys.' }
    const nextPosition = motion.position
    const appliedDistanceMeters = Math.hypot(nextPosition[0] - mark.position[0], nextPosition[2] - mark.position[2])
    const motionResult = Object.freeze({ status: motion.status, requestedDistanceMeters: control.distanceMeters, appliedDistanceMeters, position: nextPosition })
    if (motion.status === 'physics-owned') return { ok: false, message: 'Stop XR physics before editing this object\'s authored motion.', motion: motionResult }
    if (motion.status === 'obstructed') return { ok: false, message: `${track.label} movement is obstructed by the authored XR scene.`, motion: motionResult }
    const changed = appliedDistanceMeters > 1e-12
    if (changed) {
      const applied = applyXrConstrainedCastMarkChoreography({
        actorId: targetId,
        markId,
        position: nextPosition as XrMotionReferenceVector,
      })
      if (!applied.applied) return { ok: false, message: 'The constrained 3D object movement could not be applied.', motion: motionResult }
      if (!persistPlan()) {
        restoreXrMotionReferenceRuntimeSnapshot(previousRuntime)
        return { ok: false, message: 'The 3D object movement could not be written to graph metadata.' }
      }
    }
    selectXrMotionReferenceCastMark(targetId, markId)
    selectBoundXrActor(targetId)
    return {
      ok: true,
      message: changed
        ? `Moved ${track.label} with ${control.keys.join('+')} by ${appliedDistanceMeters.toFixed(3)} m${motion.status === 'partial' ? ` of ${control.distanceMeters.toFixed(3)} m requested` : ''}.`
        : `${track.label} position is unchanged.`,
      motion: motionResult,
      operation: control.operation,
      targetId,
      scene: inspectLocalAnimation(),
    }
  }

  if (control.operation === 'configure-mark') {
    if (!control.markId || (!control.easing && !control.gait && !control.position)) return { ok: false, message: 'Configure-mark requires markId and easing, gait, or position.' }
    const previousRuntime = readXrMotionReferenceRuntime()
    if (control.markKind === 'camera') {
      if (!control.easing || !previousRuntime.plan.camera.some(mark => mark.id === control.markId)) return { ok: false, message: 'Select a valid camera mark and easing.' }
      setXrMotionReferenceCameraMarkChoreography({ markId: control.markId, easing: control.easing })
      selectXrMotionReferenceCameraMark(control.markId)
    } else {
      const track = previousRuntime.plan.cast.find(candidate => candidate.actorId === targetId)
      if (!track?.marks.some(mark => mark.id === control.markId)) return { ok: false, message: 'Select a valid cast mark before configuring choreography.' }
      const applied = applyXrConstrainedCastMarkChoreography({ actorId: targetId, markId: control.markId, easing: control.easing, gait: control.gait, position: control.position })
      if (!applied.applied && applied.reason !== 'unchanged') return { ok: false, message: applied.reason === 'physics-owned' ? 'Stop XR physics before editing this object\'s authored motion.' : 'The cast mark position is obstructed by the authored XR scene.' }
      selectXrMotionReferenceCastMark(targetId, control.markId)
    }
    if (!persistPlan()) {
      restoreXrMotionReferenceRuntimeSnapshot(previousRuntime)
      return { ok: false, message: 'The choreography mark could not be written to graph metadata.' }
    }
    if (control.markKind === 'cast') selectBoundXrActor(targetId)
    const warnings = resolveXrChoreographySpeedWarnings(readXrMotionReferenceRuntime().plan)
    return { ok: true, message: `Updated ${control.markKind} mark choreography${warnings.length ? ` with ${warnings.length} speed warning${warnings.length === 1 ? '' : 's'}` : ''}.`, operation: control.operation, targetId: control.markKind === 'cast' ? targetId : 'camera', scene: inspectLocalAnimation() }
  }

  if (control.operation === 'export') {
    const state = useGraphStore.getState()
    if (!state.graphData) return { ok: false, message: 'No graph is available for animation export.' }
    const bundle = buildXrMotionReferencePackage({ plan: readXrMotionReferenceRuntime().plan, graphData: state.graphData, documentName: state.markdownDocumentName || 'Untitled' })
    return { ok: true, message: `Built ${bundle.timeline.frameCount} deterministic animation samples.`, operation: control.operation, package: bundle, scene: inspectLocalAnimation() }
  }

  if (control.operation === 'play' || control.operation === 'pause' || control.operation === 'scrub') {
    updateTransport(control.operation, control.timeSeconds)
    return { ok: true, message: control.operation === 'scrub' ? `Animation playhead moved to ${readXrMotionReferenceRuntime().playheadSeconds.toFixed(2)}s.` : `Animation playback ${control.operation === 'play' ? 'started' : 'paused'}.`, operation: control.operation, scene: inspectLocalAnimation() }
  }

  const previousRuntime = readXrMotionReferenceRuntime()
  const assignment = updateXrAnimationAssignment({
    operation: control.operation,
    presetId: control.presetId,
    targetId,
    trackKind: control.trackKind,
  })
  if (!assignment.ok) return { ok: false, message: assignment.message, operation: control.operation, targetId }
  if (!persistPlan()) {
    restoreXrMotionReferenceRuntimeSnapshot(previousRuntime)
    return { ok: false, message: 'The animation plan could not be written to graph metadata.' }
  }
  if (assignment.positionMarksChanged) hydrateCanonicalXrPhysicsRuntime()
  selectBoundXrActor(targetId)
  return { ok: true, message: assignment.message, operation: control.operation, targetId, scene: inspectLocalAnimation() }
}
