import { useGraphStore } from '@/hooks/useGraphStore'
import type { JSONValue } from '@/lib/graph/types'
import {
  XR_MOTION_REFERENCE_GRAPH_METADATA_KEY,
  XR_MOTION_REFERENCE_MAX_CAST_TRACKS,
  XR_MOTION_REFERENCE_MAX_SUBJECTS,
  serializeXrMotionReferencePlan,
} from './xrMotionReferenceModel'
import {
  XR_MOTION_REFERENCE_DEFAULT_STAGE_ID,
  XR_MOTION_REFERENCE_STAGE_PRESETS,
  XR_SCENE_LIBRARY_ASSETS,
  XR_SCENE_LIBRARY_DEFAULT_ASSET_ID,
  XR_SCENE_LIBRARY_FEATURED_ASSET_IDS,
  isXrSceneLibraryAssetId,
  type XrMotionReferenceStageId,
} from './xrSceneLibrary'
import {
  addXrMotionReferenceSubject,
  markXrMotionReferenceSaved,
  readXrMotionReferenceRuntime,
  removeXrMotionReferenceSubject,
  restoreXrMotionReferenceRuntimeSnapshot,
  selectXrMotionReferenceActor,
  selectXrMotionReferenceShotTarget,
  setXrMotionReferenceCastTransition,
  setXrMotionReferenceStage,
  setXrMotionReferenceSubjectAssetAndTransform,
  setXrMotionReferenceSubjectLabel,
  setXrMotionReferenceSubjectTransform,
} from './xrMotionReferenceRuntime'
import {
  hydrateCanonicalXrMotionReferenceRuntime,
  hydrateCanonicalXrPhysicsRuntime,
} from './XrMotionReferenceRuntimeBridge'
import { readXrSceneDocumentReady } from './xrSceneDocumentReadiness'
import { XR_PHYSICS_GRAPH_METADATA_KEY } from './xrPhysicsModel'
import {
  applyXrPhysicsImpulse,
  attachXrPhysicsBody,
  configureXrPhysicsBody,
  configureXrPhysicsWorld,
  detachXrPhysicsBody,
  markXrPhysicsRuntimeSaved,
  pauseXrPhysicsRuntime,
  playXrPhysicsRuntime,
  readXrPhysicsRuntime,
  readXrPhysicsRuntimeFrame,
  resetXrPhysicsRuntime,
  restoreXrPhysicsRuntimeSnapshot,
  serializeXrPhysicsRuntimeWorld,
  stepXrPhysicsRuntimeTicks,
  stopXrPhysicsRuntime,
} from './xrPhysicsRuntime'
import type { XrPhysicsControlInput } from './xrSceneInteractiveInvocation'
import {
  commitXrArPlacement,
  readXrArPlacementRuntime,
} from './xrArPlacementRuntime'
import {
  developAndRunXrNativeControllerDemo,
  exitXrNativeControllerDemo,
  pauseXrNativeControllerDemo,
  readSharedXrNativeControllerDemoFrame,
  readXrNativeControllerDemo,
  resetSharedXrNativeControllerDemo,
  resumeXrNativeControllerDemo,
  selectXrNativeControllerDemoMode,
  setSharedXrNativeControllerDemoTerrain,
} from './xrNativeControllerDemoRuntime'
import {
  XR_SCENE_INVOCATION_COMMANDS,
  XR_SCENE_INVOCATION_BINDINGS,
  XR_SCENE_INVOCATION_SEMANTICS,
  XR_SCENE_MCP_SCHEMA,
  XR_SCENE_WEB_MCP_TOOL_IDS,
  buildXrPlaceInvocation,
  buildXrStageInvocation,
  buildXrTransformInvocation,
} from './xrSceneMcpContract.mjs'
import {
  normalizeXrSceneControl,
  type XrSceneControlAction,
  type XrSceneControlInput,
  type XrSceneTransition,
} from './xrSceneControlNormalization'
import { activateXrSceneSurface } from './xrSceneSurfaceRuntime'

export { normalizeXrSceneControl }
export type { XrSceneControlAction, XrSceneControlInput, XrSceneTransition }

export type XrSceneControlResult = Readonly<{
  ok: boolean
  message: string
  action?: XrSceneControlAction
  subjectId?: string
  scene?: ReturnType<typeof inspectLocalXrSceneAssets>
}>

function sceneDocumentReady(): boolean {
  return readXrSceneDocumentReady()
}

function hydrateActiveXrScene(): boolean {
  if (!sceneDocumentReady() || !hydrateCanonicalXrMotionReferenceRuntime()) return false
  hydrateCanonicalXrPhysicsRuntime()
  return true
}

function activateXrSceneWorkspace(): boolean {
  const state = useGraphStore.getState()
  const shouldOpenMedia = !state.floatingPanelOpen
    || state.floatingPanelView === 'gameMode'
    || state.floatingPanelView === 'flightSim'
  return activateXrSceneSurface({
    ...(shouldOpenMedia ? { panelView: 'media', openPanel: true } : {}),
    timeline: true,
  })
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function persistXrScene(includePhysics = false): boolean {
  const state = useGraphStore.getState()
  const serializedMotion = serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan)
  const serializedPhysics = serializeXrPhysicsRuntimeWorld() as unknown as JSONValue
  state.updateGraphMetadata({
    [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: serializedMotion,
    ...(includePhysics ? { [XR_PHYSICS_GRAPH_METADATA_KEY]: serializedPhysics } : {}),
  })
  const metadata = useGraphStore.getState().graphData?.metadata
  if (metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY] !== serializedMotion) return false
  if (includePhysics && !sameJson(metadata?.[XR_PHYSICS_GRAPH_METADATA_KEY], serializedPhysics)) return false
  markXrMotionReferenceSaved(serializedMotion)
  if (includePhysics) markXrPhysicsRuntimeSaved(metadata?.[XR_PHYSICS_GRAPH_METADATA_KEY])
  return true
}

function persistXrPhysicsConfig(): boolean {
  const state = useGraphStore.getState()
  const serialized = serializeXrPhysicsRuntimeWorld() as unknown as JSONValue
  state.updateGraphMetadata({ [XR_PHYSICS_GRAPH_METADATA_KEY]: serialized })
  const savedValue = useGraphStore.getState().graphData?.metadata?.[XR_PHYSICS_GRAPH_METADATA_KEY]
  if (!sameJson(savedValue, serialized)) return false
  markXrPhysicsRuntimeSaved(savedValue)
  return true
}

export function inspectLocalXrSceneAssets() {
  const runtime = readXrMotionReferenceRuntime()
  const physics = readXrPhysicsRuntime()
  const physicsFrame = readXrPhysicsRuntimeFrame()
  const controllerDemo = readXrNativeControllerDemo()
  const arPlacement = readXrArPlacementRuntime()
  return {
    schema: XR_SCENE_MCP_SCHEMA,
    webMcpTools: {
      inspect: `agentic-graph.${XR_SCENE_WEB_MCP_TOOL_IDS.inspect}`,
      control: `agentic-graph.${XR_SCENE_WEB_MCP_TOOL_IDS.control}`,
    },
    sceneReady: sceneDocumentReady(),
    catalogDefaults: {
      terrainId: XR_MOTION_REFERENCE_DEFAULT_STAGE_ID,
      assetId: XR_SCENE_LIBRARY_DEFAULT_ASSET_ID,
    },
    invocationGrammar: {
      stage: `${XR_SCENE_INVOCATION_COMMANDS.stage} @environment`,
      place: `${XR_SCENE_INVOCATION_COMMANDS.place} @asset transition=linear|hold label=<optional-id>`,
      transform: `${XR_SCENE_INVOCATION_COMMANDS.transform} @subject ${XR_SCENE_INVOCATION_SEMANTICS.transform} asset=<asset-id> position=<x,y,z> rotation=<degrees> scale=<0.25..4> color=<hex>`,
      label: `${XR_SCENE_INVOCATION_COMMANDS.label} @subject label=<required-id>`,
      remove: `${XR_SCENE_INVOCATION_COMMANDS.remove} @subject`,
      physicsWorld: `${XR_SCENE_INVOCATION_COMMANDS.physics} ${XR_SCENE_INVOCATION_BINDINGS.canvas} ${XR_SCENE_INVOCATION_SEMANTICS.world} operation=play|pause|stop|reset|step|configure`,
      physicsBody: `${XR_SCENE_INVOCATION_COMMANDS.physics} ${XR_SCENE_INVOCATION_BINDINGS.canvas} ${XR_SCENE_INVOCATION_SEMANTICS.body} operation=attach|configure|detach subject=<id>`,
      physicsImpulse: `${XR_SCENE_INVOCATION_COMMANDS.physics} ${XR_SCENE_INVOCATION_BINDINGS.canvas} ${XR_SCENE_INVOCATION_SEMANTICS.impulse} operation=impulse subject=<id> vector=x,y,z`,
      physicsController: `${XR_SCENE_INVOCATION_COMMANDS.physics} ${XR_SCENE_INVOCATION_BINDINGS.canvas} ${XR_SCENE_INVOCATION_SEMANTICS.controller} operation=develop-run|pause|resume|reset|exit|select mode=ball|rocket`,
      present: `${XR_SCENE_INVOCATION_COMMANDS.present} ${XR_SCENE_INVOCATION_BINDINGS.scene} ${XR_SCENE_INVOCATION_SEMANTICS.reticle}`,
    },
    environments: XR_MOTION_REFERENCE_STAGE_PRESETS.map(stage => ({
      id: stage.id,
      label: stage.label,
      description: stage.description,
      kind: stage.environmentKind,
      default: stage.id === XR_MOTION_REFERENCE_DEFAULT_STAGE_ID,
      sizeMeters: [...stage.sizeMeters],
      invocation: buildXrStageInvocation(stage.id),
    })),
    assets: XR_SCENE_LIBRARY_ASSETS.map(asset => ({
      id: asset.id,
      label: asset.label,
      category: asset.category,
      description: asset.description,
      default: asset.id === XR_SCENE_LIBRARY_DEFAULT_ASSET_ID,
      featured: XR_SCENE_LIBRARY_FEATURED_ASSET_IDS.includes(asset.id as typeof XR_SCENE_LIBRARY_FEATURED_ASSET_IDS[number]),
      dimensionsMeters: [...asset.dimensionsMeters],
      mobile: asset.mobile,
      invocation: buildXrPlaceInvocation(asset.id, asset.mobile ? 'linear' : 'hold'),
    })),
    runtime: {
      stageId: runtime.plan.stageId,
      durationSeconds: runtime.plan.durationSeconds,
      fps: runtime.plan.fps,
      subjects: runtime.plan.subjects.map(subject => {
        const track = runtime.plan.cast.find(candidate => candidate.actorId === subject.id)
        const transition: XrSceneTransition | 'static' = track ? track.marks[0]?.transition === 'hold' ? 'hold' : 'linear' : 'static'
        return {
          id: subject.id,
          assetId: subject.assetId,
          label: subject.label,
          category: subject.category,
          position: [...subject.position],
          rotationYDegrees: subject.rotationYDegrees,
          scale: subject.scale,
          color: subject.color,
          transformInvocation: buildXrTransformInvocation(subject.id, subject),
          transition,
        }
      }),
      cameraMarks: runtime.plan.camera.length,
      dirty: runtime.dirty,
      revision: runtime.revision,
    },
    physics: {
      schema: physics.world.schema,
      phase: physics.phase,
      world: serializeXrPhysicsRuntimeWorld(),
      staticColliderCount: physics.staticColliderCount,
      dirty: physics.dirty,
      revision: physics.revision,
      frame: physicsFrame,
      controllerDemo: {
        ...controllerDemo,
        frame: controllerDemo.phase === 'off' ? null : readSharedXrNativeControllerDemoFrame(),
      },
    },
    immersivePlacement: {
      ...arPlacement,
      hitMatrix: arPlacement.hitMatrix ? [...arPlacement.hitMatrix] : null,
      placementMatrix: arPlacement.placementMatrix ? [...arPlacement.placementMatrix] : null,
    },
  }
}

type XrPhysicsControlResult = Readonly<{
  ok: boolean
  message: string
  subjectId?: string
}>

function runXrPhysicsControl(physics: XrPhysicsControlInput): XrPhysicsControlResult {
  const before = readXrPhysicsRuntime()
  const subjectId = String(physics.subjectId || '').trim()
  if (physics.scope === 'controller') {
    if (physics.operation === 'develop-run') {
      stopXrPhysicsRuntime()
      if (physics.controllerMode) selectXrNativeControllerDemoMode(physics.controllerMode)
      developAndRunXrNativeControllerDemo()
    } else if (physics.operation === 'select' && physics.controllerMode) {
      selectXrNativeControllerDemoMode(physics.controllerMode)
    } else if (physics.operation === 'pause') pauseXrNativeControllerDemo()
    else if (physics.operation === 'resume') resumeXrNativeControllerDemo()
    else if (physics.operation === 'reset') resetSharedXrNativeControllerDemo()
    else if (physics.operation === 'exit') exitXrNativeControllerDemo()
    else return { ok: false, message: 'Use a supported native XR controller operation.' }
    const demo = readXrNativeControllerDemo()
    return { ok: true, message: `Native XR ${demo.mode} controller is ${demo.phase}.` }
  }
  if (physics.scope === 'world') {
    if (physics.operation === 'play') {
      if (before.world.bodies.length === 0) return { ok: false, message: 'Attach at least one XR body before entering Play mode.' }
      exitXrNativeControllerDemo()
      playXrPhysicsRuntime()
      return { ok: true, message: 'XR dynamics Play mode started.' }
    }
    if (physics.operation === 'pause') {
      if (before.phase !== 'playing') return { ok: false, message: 'XR dynamics can pause only while playing.' }
      pauseXrPhysicsRuntime()
      return { ok: true, message: 'XR dynamics paused.' }
    }
    if (physics.operation === 'stop') {
      stopXrPhysicsRuntime()
      return { ok: true, message: 'XR dynamics stopped and authored transforms restored.' }
    }
    if (physics.operation === 'reset') {
      resetXrPhysicsRuntime()
      return { ok: true, message: 'XR dynamics reset to authored spawn transforms.' }
    }
    if (physics.operation === 'step') {
      if (before.phase === 'stopped') return { ok: false, message: 'Start or pause Play mode before stepping XR dynamics.' }
      const ticks = physics.ticks || 1
      const result = stepXrPhysicsRuntimeTicks(ticks)
      if (result.subSteps !== ticks) return { ok: false, message: 'XR dynamics could not advance the requested fixed steps.' }
      return { ok: true, message: `XR dynamics advanced ${ticks} fixed ${ticks === 1 ? 'step' : 'steps'}.` }
    }
    if (before.phase !== 'stopped') return { ok: false, message: 'Stop XR dynamics before editing world settings.' }
    configureXrPhysicsWorld({
      ...(physics.gravity ? { gravity: physics.gravity } : {}),
      ...(physics.fixedStepSeconds !== undefined ? { fixedStepSeconds: physics.fixedStepSeconds } : {}),
      ...(physics.maxSubsteps !== undefined ? { maxSubSteps: physics.maxSubsteps } : {}),
    })
    if (readXrPhysicsRuntime().revision === before.revision) return { ok: false, message: 'XR world settings were unchanged or invalid.' }
    if (!persistXrPhysicsConfig()) {
      restoreXrPhysicsRuntimeSnapshot(before)
      return { ok: false, message: 'XR world settings could not be written to graph metadata.' }
    }
    return { ok: true, message: 'XR world settings persisted.' }
  }

  const subject = readXrMotionReferenceRuntime().plan.subjects.find(candidate => candidate.id === subjectId)
  if (!subject) return { ok: false, message: `Unknown XR subject: ${subjectId || '(empty)'}.` }
  if (physics.scope === 'impulse') {
    if (!physics.impulse || !applyXrPhysicsImpulse(subjectId, physics.impulse)) {
      return { ok: false, message: 'Impulses require a dynamic body in playing or paused XR dynamics.' }
    }
    return { ok: true, message: `Impulse applied to ${subject.label}.`, subjectId }
  }
  if (before.phase !== 'stopped') return { ok: false, message: 'Stop XR dynamics before editing body components.' }
  const patch = {
    ...(physics.bodyMode ? { mode: physics.bodyMode } : {}),
    ...(physics.massKg !== undefined ? { mass: physics.massKg } : {}),
    ...(physics.friction !== undefined ? { friction: physics.friction } : {}),
    ...(physics.restitution !== undefined ? { restitution: physics.restitution } : {}),
    ...(physics.linearDamping !== undefined ? { linearDamping: physics.linearDamping } : {}),
    ...(physics.collisionGroup !== undefined ? { collisionGroup: physics.collisionGroup } : {}),
    ...(physics.collisionMask !== undefined ? { collisionMask: physics.collisionMask } : {}),
  }
  if (physics.operation === 'attach') attachXrPhysicsBody({ subjectId, patch })
  else if (physics.operation === 'configure') {
    if (Object.keys(patch).length === 0) return { ok: false, message: 'Configure at least one XR body property.' }
    configureXrPhysicsBody(subjectId, patch)
  } else detachXrPhysicsBody(subjectId)
  if (readXrPhysicsRuntime().revision === before.revision) {
    return { ok: false, message: `XR body ${physics.operation} was unchanged or invalid for ${subject.label}.` }
  }
  if (!persistXrPhysicsConfig()) {
    restoreXrPhysicsRuntimeSnapshot(before)
    return { ok: false, message: 'The XR body component could not be written to graph metadata.' }
  }
  return { ok: true, message: `XR body ${physics.operation} persisted for ${subject.label}.`, subjectId }
}

export function controlLocalXrScene(input: XrSceneControlInput): XrSceneControlResult {
  const control = normalizeXrSceneControl(input)
  if (!control) return { ok: false, message: 'Use a supported XR action or an invocation such as /xr.place @person-adult transition=linear.' }
  if (!hydrateActiveXrScene()) return { ok: false, message: 'Open or create a graph document before controlling the XR scene.' }
  const requestedStage = control.action === 'stage'
    ? XR_MOTION_REFERENCE_STAGE_PRESETS.find(candidate => candidate.id === control.stageId)
    : undefined
  if (control.action === 'stage' && !requestedStage) {
    return { ok: false, message: `Unknown XR environment: ${control.stageId || '(empty)'}.` }
  }
  const hydratedMotion = readXrMotionReferenceRuntime()
  if (
    requestedStage
    && hydratedMotion.plan.stageId === requestedStage.id
    && hydratedMotion.dirty === false
    && readXrPhysicsRuntime().phase === 'stopped'
  ) {
    setSharedXrNativeControllerDemoTerrain(requestedStage.id as XrMotionReferenceStageId)
    return {
      ok: true,
      message: `${requestedStage.label} is already staged in XR Mode.`,
      action: control.action,
      scene: inspectLocalXrSceneAssets(),
    }
  }
  if (!activateXrSceneWorkspace()) {
    return { ok: false, message: 'XR scene control requires an available shared XR Mode surface.' }
  }

  if (control.action === 'physics' && control.physics) {
    const result = runXrPhysicsControl(control.physics)
    return { ...result, action: control.action, scene: inspectLocalXrSceneAssets() }
  }
  if (control.action === 'present') {
    if (!commitXrArPlacement()) {
      return { ok: false, message: 'Enter an immersive AR session and acquire a current reticle hit before placing the scene.' }
    }
    return { ok: true, message: 'XR scene placed at the current real-world reticle.', action: control.action, scene: inspectLocalXrSceneAssets() }
  }

  if (readXrPhysicsRuntime().phase !== 'stopped') {
    return { ok: false, message: 'Stop XR dynamics before editing the staged scene.' }
  }
  const previousMotion = readXrMotionReferenceRuntime()
  const previousPhysics = readXrPhysicsRuntime()
  let message = ''
  let subjectId = ''
  let physicsChanged = false
  if (control.action === 'stage') {
    const stage = requestedStage!
    setXrMotionReferenceStage(stage.id as XrMotionReferenceStageId)
    if (readXrMotionReferenceRuntime().plan.stageId !== stage.id) {
      return { ok: false, message: `${stage.label} could not be staged without violating XR motion constraints.` }
    }
    setSharedXrNativeControllerDemoTerrain(stage.id as XrMotionReferenceStageId)
    message = `${stage.label} staged in XR Mode.`
  } else if (control.action === 'place') {
    if (!isXrSceneLibraryAssetId(control.assetId)) return { ok: false, message: `Unknown XR asset: ${control.assetId || '(empty)'}.` }
    const asset = XR_SCENE_LIBRARY_ASSETS.find(candidate => candidate.id === control.assetId)!
    const before = readXrMotionReferenceRuntime().plan.subjects.length
    const next = addXrMotionReferenceSubject({ assetId: asset.id, label: control.label })
    if (next.plan.subjects.length === before) {
      return {
        ok: false,
        message: before >= XR_MOTION_REFERENCE_MAX_SUBJECTS
          ? 'The bounded XR scene subject capacity has been reached.'
          : 'No collision-free authored placement is available for that XR asset.',
      }
    }
    subjectId = next.plan.subjects.at(-1)?.id || ''
    if (asset.mobile && subjectId) {
      const beforeTransitionRevision = readXrMotionReferenceRuntime().revision
      const transitioned = setXrMotionReferenceCastTransition(subjectId, control.transition)
      if (transitioned.revision === beforeTransitionRevision) {
        restoreXrMotionReferenceRuntimeSnapshot(previousMotion)
        return { ok: false, message: `${asset.label} could not be placed with a collision-free ${control.transition} path.` }
      }
    }
    if (subjectId) {
      if (readXrMotionReferenceRuntime().plan.cast.some(track => track.actorId === subjectId)) {
        selectXrMotionReferenceActor(subjectId)
      } else {
        selectXrMotionReferenceShotTarget(subjectId)
      }
    }
    message = `${next.plan.subjects.at(-1)?.label || asset.label} placed with ${asset.mobile ? control.transition : 'static'} path interpolation.`
  } else if (control.action === 'transition') {
    subjectId = control.subjectId
    if (!readXrMotionReferenceRuntime().plan.cast.some(track => track.actorId === subjectId)) {
      return { ok: false, message: `XR subject ${subjectId || '(empty)'} is not a markable cast track.` }
    }
    const beforeRevision = readXrMotionReferenceRuntime().revision
    const next = setXrMotionReferenceCastTransition(subjectId, control.transition)
    if (next.revision === beforeRevision
      || next.plan.cast.find(track => track.actorId === subjectId)?.marks.some(mark => mark.transition !== control.transition)) {
      return { ok: false, message: `XR subject path interpolation was blocked by XR motion constraints.` }
    }
    message = `XR subject path interpolation set to ${control.transition}.`
  } else if (control.action === 'transform') {
    subjectId = control.subjectId
    const subject = readXrMotionReferenceRuntime().plan.subjects.find(candidate => candidate.id === subjectId)
    if (!subject) return { ok: false, message: `Unknown XR subject: ${subjectId || '(empty)'}.` }
    if (control.assetId) {
      if (!isXrSceneLibraryAssetId(control.assetId)) return { ok: false, message: `Unknown XR asset: ${control.assetId}.` }
      const nextAsset = XR_SCENE_LIBRARY_ASSETS.find(candidate => candidate.id === control.assetId)!
      const motion = readXrMotionReferenceRuntime()
      if (nextAsset.mobile
        && !motion.plan.cast.some(track => track.actorId === subjectId)
        && motion.plan.cast.length >= XR_MOTION_REFERENCE_MAX_CAST_TRACKS) {
        return { ok: false, message: 'The bounded XR cast-track capacity has been reached.' }
      }
      const beforeRevision = motion.revision
      const next = setXrMotionReferenceSubjectAssetAndTransform({
        subjectId,
        assetId: nextAsset.id,
        ...(control.position ? { position: control.position } : {}),
        ...(control.rotationYDegrees !== undefined ? { rotationYDegrees: control.rotationYDegrees } : {}),
        ...(control.scale !== undefined ? { scale: control.scale } : {}),
        ...(control.color ? { color: control.color } : {}),
      })
      if (next.revision === beforeRevision
        || next.plan.subjects.find(candidate => candidate.id === subjectId)?.assetId !== nextAsset.id) {
        return { ok: false, message: `${subject.label} could not change to ${nextAsset.label} without violating XR motion constraints.` }
      }
    } else {
      const beforeRevision = readXrMotionReferenceRuntime().revision
      const next = setXrMotionReferenceSubjectTransform({
        subjectId,
        ...(control.position ? { position: control.position } : {}),
        ...(control.rotationYDegrees !== undefined ? { rotationYDegrees: control.rotationYDegrees } : {}),
        ...(control.scale !== undefined ? { scale: control.scale } : {}),
        ...(control.color ? { color: control.color } : {}),
      })
      if (next.revision === beforeRevision) {
        return { ok: false, message: `${subject.label} transform was blocked by XR motion constraints.` }
      }
    }
    message = `${subject.label} ${control.assetId ? 'asset and transform' : 'transform'} updated.`
  } else if (control.action === 'label') {
    subjectId = control.subjectId
    if (!control.label) return { ok: false, message: 'XR subject labels must not be empty.' }
    if (!readXrMotionReferenceRuntime().plan.subjects.some(subject => subject.id === subjectId)) {
      return { ok: false, message: `Unknown XR subject: ${subjectId || '(empty)'}.` }
    }
    setXrMotionReferenceSubjectLabel(subjectId, control.label)
    message = `XR subject relabeled ${control.label}.`
  } else if (control.action === 'remove') {
    subjectId = control.subjectId
    const subject = readXrMotionReferenceRuntime().plan.subjects.find(candidate => candidate.id === subjectId)
    if (!subject) return { ok: false, message: `Unknown XR subject: ${subjectId || '(empty)'}.` }
    if (readXrPhysicsRuntime().world.bodies.some(body => body.subjectId === subjectId)) {
      detachXrPhysicsBody(subjectId)
      physicsChanged = true
    }
    removeXrMotionReferenceSubject(subjectId)
    message = `${subject.label} removed from the XR stage.`
  }

  if (!persistXrScene(physicsChanged)) {
    restoreXrMotionReferenceRuntimeSnapshot(previousMotion)
    restoreXrPhysicsRuntimeSnapshot(previousPhysics)
    return { ok: false, message: 'The XR scene could not be written to graph metadata.' }
  }
  hydrateCanonicalXrPhysicsRuntime()
  return { ok: true, message, action: control.action, ...(subjectId ? { subjectId } : {}), scene: inspectLocalXrSceneAssets() }
}
