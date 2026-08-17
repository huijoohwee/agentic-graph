import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertPinnedAgenticOsDictionaryTokensForTest, PINNED_ANIMATION_DICTIONARY_TOKENS } from '@/__tests__/helpers/pinnedAgenticOsDictionary'
import type { GraphData } from '@/lib/graph/types'
import {
  resetAgenticOsRemoteGrammarCatalogForTests,
} from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  XR_ACTION_PATH_PRESET_IDS,
  XR_ANIMATION_PRESETS,
  XR_CHARACTER_MOTION_PRESET_IDS,
  buildXrAnimationActionPath,
  resolveXrAnimationPreset,
  sampleXrAnimationPose,
  xrAnimationPresetCompatible,
} from '@/features/three/xrAnimationCatalog'
import {
  buildXrAnimationInvocation,
  buildXrAnimationObjectMoveInvocation,
  controlLocalAnimation,
  inspectLocalAnimation,
} from '@/features/three/xrAnimationMcpRuntime'
import {
  readXrMotionReferencePlan,
  resolveXrMotionReferenceStage,
  sampleXrMotionReferenceFacingY,
  serializeXrMotionReferencePlan,
} from '@/features/three/xrMotionReferenceModel'
import { buildXrMotionReferencePackage } from '@/features/three/xrMotionReferencePackage'
import {
  addXrMotionReferenceSubject,
  clearXrMotionReferenceCastAnimation,
  hydrateXrMotionReferenceRuntime,
  removeXrMotionReferenceCastMark,
  readXrMotionReferenceRuntime,
  retimeXrMotionReferenceCastMark,
  selectXrMotionReferenceActor,
  selectXrMotionReferenceCastMark,
  setXrMotionReferenceCastAnimation,
  setXrMotionReferenceCastMarkChoreography,
  setXrMotionReferenceCastMark,
  setXrMotionReferenceDuration,
  setXrMotionReferenceStage,
} from '@/features/three/xrMotionReferenceRuntime'
import {
  resolveXrObjectKeyboardMotionFrameTarget,
  resolveXrObjectKeyboardMotionTarget,
} from '@/features/three/XrKeyboardChoreographyRuntime'
import {
  THREE_OBJECT_KEYBOARD_FINE_SPEED_METERS_PER_SECOND,
  THREE_OBJECT_KEYBOARD_FINE_STEP_METERS,
  THREE_KEYBOARD_MAX_FRAME_DELTA_MS,
  THREE_OBJECT_KEYBOARD_SPEED_METERS_PER_SECOND,
  THREE_OBJECT_KEYBOARD_STEP_METERS,
  resolveThreeKeyboardFrameAmount,
  resolveThreeKeyboardMotionDirection,
} from '@/features/three/threeKeyboardChoreography'
import { hydrateCanonicalXrMotionReferenceRuntime } from '@/features/three/XrMotionReferenceRuntimeBridge'
import { selectBoundXrActor } from '@/features/three/xrSelectedActorBinding'
import { buildXrMotionReferenceTimelineCode } from '@/features/three/xrMotionReferenceTimeline'
import { applyXrConstrainedCastActionPath } from '@/features/three/xrConstrainedCastMarkRuntime'

function readSource(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8')
}

function buildAnimationGraph(): GraphData {
  return {
    type: 'Graph',
    nodes: [
      { id: 'actor-a', label: 'Lead', type: 'Person', properties: {} },
      { id: 'actor-b', label: 'Rival', type: 'Person', properties: {} },
    ],
    edges: [],
    metadata: {},
  }
}

function resetToNativeAnimationGrammar(): void {
  resetAgenticOsRemoteGrammarCatalogForTests()
}

export function testXrAnimationRuntimeIsNativeInvocableAndExportable() {
  const expectedCharacterMotions = ['fight', 'dance', 'sit', 'drink', 'jump', 'play-cards', 'squirt-gun']
  const expectedActionPaths = ['helicopter-orbit', 'car-chase', 'collapsing-debris']
  if (XR_CHARACTER_MOTION_PRESET_IDS.join('|') !== expectedCharacterMotions.join('|')) {
    throw new Error(`expected all requested native character motions, got ${XR_CHARACTER_MOTION_PRESET_IDS.join(', ')}`)
  }
  if (XR_ACTION_PATH_PRESET_IDS.join('|') !== expectedActionPaths.join('|') || XR_ANIMATION_PRESETS.length !== 10) {
    throw new Error(`expected all requested native action paths, got ${XR_ACTION_PATH_PRESET_IDS.join(', ')}`)
  }

  const fight = resolveXrAnimationPreset('fight')
  const landing = resolveXrAnimationPreset('helicopter-orbit')
  if (!xrAnimationPresetCompatible({ preset: fight, graphActor: true })
    || xrAnimationPresetCompatible({ preset: landing, graphActor: true })
    || !xrAnimationPresetCompatible({ preset: landing, assetId: 'vehicle-helicopter', category: 'vehicles' })) {
    throw new Error('expected typed animation compatibility to separate character motions from asset-specific action paths')
  }
  const drinkAssignment = { kind: 'character-motion', presetId: 'drink', startTimeSeconds: 0, loop: true } as const
  const firstDrinkPose = sampleXrAnimationPose(drinkAssignment, 1)
  const secondDrinkPose = sampleXrAnimationPose(drinkAssignment, 1)
  const jumpPose = sampleXrAnimationPose({ kind: 'character-motion', presetId: 'jump', startTimeSeconds: 0, loop: true }, 0.9)
  if (JSON.stringify(firstDrinkPose) !== JSON.stringify(secondDrinkPose)
    || firstDrinkPose.propCue !== 'cup'
    || jumpPose.rootOffsetMeters[1] <= 1) {
    throw new Error('expected deterministic procedural performance poses with visible prop and jump cues')
  }

  const pathCounts = new Map([
    ['helicopter-orbit', 9],
    ['car-chase', 6],
    ['collapsing-debris', 5],
  ])
  for (const presetId of XR_ACTION_PATH_PRESET_IDS) {
    const marks = buildXrAnimationActionPath({ presetId, durationSeconds: 8, origin: [0, 0, 0], stageSizeMeters: [20, 16] })
    if (marks.length !== pathCounts.get(presetId)
      || marks[0]?.timeSeconds !== 0
      || marks.at(-1)?.timeSeconds !== 8
      || marks.some(mark => Math.abs(mark.position[0]) > 9.6 || Math.abs(mark.position[2]) > 7.68 || mark.position[1] < 0 || mark.position[1] > 30)) {
      throw new Error(`expected ${presetId} to produce a complete bounded deterministic action path`)
    }
    const trackMarks = marks.map((mark, index) => ({ ...mark, id: `${presetId}:${index}` }))
    const beforeEnd = sampleXrMotionReferenceFacingY(trackMarks, 7.999)
    const atEnd = sampleXrMotionReferenceFacingY(trackMarks, 8)
    const afterEnd = sampleXrMotionReferenceFacingY(trackMarks, 10)
    const angularDistance = (left: number, right: number) => Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)))
    if (angularDistance(beforeEnd, atEnd) > 0.0001 || angularDistance(atEnd, afterEnd) > 0.0001) {
      throw new Error(`expected ${presetId} to preserve its final travel heading at and after the last mark`)
    }
  }

  const incompatibleGraphPlan = readXrMotionReferencePlan({
    cast: [{ actorId: 'actor-a', animation: { kind: 'action-path', presetId: 'helicopter-orbit' } }],
  }, buildAnimationGraph().nodes)
  const compatibleGraphPlan = readXrMotionReferencePlan({
    cast: [{ actorId: 'actor-a', animation: { kind: 'action-path', presetId: 'dance' } }],
  }, buildAnimationGraph().nodes)
  const helicopterPlan = readXrMotionReferencePlan({
    stageId: 'neutral-volume',
    durationSeconds: 8,
    subjects: [{ id: 'helicopter-a', assetId: 'vehicle-helicopter', label: 'Helicopter' }],
    cast: [{
      actorId: 'helicopter-a',
      animation: { kind: 'character-motion', presetId: 'helicopter-orbit' },
      marks: [{ timeSeconds: 0, position: [4, 2, 3], transition: 'hold' }],
    }],
  })
  const incompatibleHelicopterPlan = readXrMotionReferencePlan({
    subjects: [{ id: 'helicopter-a', assetId: 'vehicle-helicopter', label: 'Helicopter' }],
    cast: [{ actorId: 'helicopter-a', animation: { kind: 'action-path', presetId: 'car-chase' } }],
  })
  if (incompatibleGraphPlan.cast[0]?.animation !== null
    || compatibleGraphPlan.cast[0]?.animation?.presetId !== 'dance'
    || incompatibleHelicopterPlan.cast[0]?.animation !== null
    || helicopterPlan.cast[0]?.animation?.kind !== 'action-path'
    || helicopterPlan.cast[0]?.marks.length !== 9
    || helicopterPlan.cast[0]?.marks.at(-1)?.timeSeconds !== 8) {
    throw new Error('expected persisted animation hydration to reject incompatible assignments and rebuild valid action paths canonically')
  }

  const graphData = buildAnimationGraph()
  hydrateXrMotionReferenceRuntime({ sceneKey: 'animation-model-test', nodes: graphData.nodes, persistedValue: null })
  setXrMotionReferenceCastAnimation('actor-a', 'dance')
  let plan = readXrMotionReferenceRuntime().plan
  if (plan.cast[0]?.animation?.presetId !== 'dance') {
    throw new Error('expected character motion assignment to persist on the selected cast track')
  }
  const roundTrip = serializeXrMotionReferencePlan(plan) as { cast?: Array<{ animation?: { presetId?: string } }> }
  if (roundTrip.cast?.[0]?.animation?.presetId !== 'dance' || !buildXrMotionReferenceTimelineCode(plan).includes('dance character-motion effect')) {
    throw new Error('expected animation assignments to serialize and project into the canonical BottomPanel Timeline')
  }
  clearXrMotionReferenceCastAnimation('actor-a')
  if (readXrMotionReferenceRuntime().plan.cast[0]?.animation !== null) {
    throw new Error('expected native cast animation to clear without deleting cast marks')
  }
  const keyboardMark = readXrMotionReferenceRuntime().plan.cast[0]!.marks[0]!
  selectXrMotionReferenceCastMark('actor-a', keyboardMark.id)
  const keyboardRuntime = readXrMotionReferenceRuntime()
  const keyboardDirections = [
    ['w', 0, -THREE_OBJECT_KEYBOARD_STEP_METERS],
    ['ArrowUp', 0, -THREE_OBJECT_KEYBOARD_STEP_METERS],
    ['s', 0, THREE_OBJECT_KEYBOARD_STEP_METERS],
    ['ArrowDown', 0, THREE_OBJECT_KEYBOARD_STEP_METERS],
    ['a', -THREE_OBJECT_KEYBOARD_STEP_METERS, 0],
    ['ArrowLeft', -THREE_OBJECT_KEYBOARD_STEP_METERS, 0],
    ['d', THREE_OBJECT_KEYBOARD_STEP_METERS, 0],
    ['ArrowRight', THREE_OBJECT_KEYBOARD_STEP_METERS, 0],
  ] as const
  const keyboardDirectionsMatch = keyboardDirections.every(([key, deltaX, deltaZ]) => {
    const target = resolveXrObjectKeyboardMotionTarget(keyboardRuntime, { key })
    return target?.changed === true
      && target.nextPosition[0] === keyboardMark.position[0] + deltaX
      && target.nextPosition[2] === keyboardMark.position[2] + deltaZ
  })
  const keyboardFineRight = resolveXrObjectKeyboardMotionTarget(keyboardRuntime, { key: 'ArrowRight', shiftKey: true })
  const diagonalDirection = resolveThreeKeyboardMotionDirection(['w', 'd'])
  const diagonalFrame = resolveXrObjectKeyboardMotionFrameTarget(keyboardRuntime, ['w', 'd'], 1)
  const boundedRightFrame = resolveXrObjectKeyboardMotionFrameTarget(keyboardRuntime, ['d'], 1000)
  const keyboardStage = resolveXrMotionReferenceStage(keyboardRuntime.plan.stageId)
  const expectedDiagonalComponent = Math.SQRT1_2
  const closeTo = (left: number | undefined, right: number, tolerance = 0.000001) => typeof left === 'number' && Math.abs(left - right) < tolerance
  if (!keyboardDirectionsMatch
    || keyboardFineRight?.nextPosition[0] !== keyboardMark.position[0] + THREE_OBJECT_KEYBOARD_FINE_STEP_METERS
    || resolveXrObjectKeyboardMotionTarget(keyboardRuntime, { key: 'ArrowLeft', ctrlKey: true }) !== null
    || !closeTo(diagonalDirection?.[0], expectedDiagonalComponent)
    || !closeTo(diagonalDirection?.[1], -expectedDiagonalComponent)
    || !closeTo(diagonalFrame?.nextPosition[0], keyboardMark.position[0] + expectedDiagonalComponent)
    || !closeTo(diagonalFrame?.nextPosition[2], keyboardMark.position[2] - expectedDiagonalComponent)
    || boundedRightFrame?.nextPosition[0] !== keyboardStage.sizeMeters[0] / 2
    || boundedRightFrame?.nextPosition[1] !== keyboardMark.position[1]
    || resolveThreeKeyboardMotionDirection(['a', 'd']) !== null
    || resolveThreeKeyboardMotionDirection(['w', 'ArrowUp'])?.[1] !== -1
    || resolveThreeKeyboardFrameAmount({ deltaMs: 1000, fine: false, target: 'object' }) !== THREE_OBJECT_KEYBOARD_SPEED_METERS_PER_SECOND * THREE_KEYBOARD_MAX_FRAME_DELTA_MS / 1000
    || resolveThreeKeyboardFrameAmount({ deltaMs: 1000, fine: true, target: 'object' }) !== THREE_OBJECT_KEYBOARD_FINE_SPEED_METERS_PER_SECOND * THREE_KEYBOARD_MAX_FRAME_DELTA_MS / 1000) {
    throw new Error('expected keyboard taps and frame-timed holds to provide bounded, normalized selected-mark choreography without shortcut modifiers')
  }

  hydrateXrMotionReferenceRuntime({ sceneKey: 'animation-action-path', nodes: [], persistedValue: null })
  addXrMotionReferenceSubject({ assetId: 'vehicle-helicopter', label: 'Picture helicopter' })
  const helicopter = readXrMotionReferenceRuntime().plan.subjects.find(subject => subject.assetId === 'vehicle-helicopter')
  if (!helicopter) throw new Error('expected the native scene library to place a procedural helicopter')
  if (!applyXrConstrainedCastActionPath(helicopter.id, 'helicopter-orbit').applied) {
    throw new Error('expected the shared constrained owner to assign the helicopter-orbit path')
  }
  plan = readXrMotionReferenceRuntime().plan
  const helicopterTrack = plan.cast.find(track => track.actorId === helicopter.id)
  if (helicopterTrack?.animation?.presetId !== 'helicopter-orbit' || helicopterTrack.marks.length !== 9 || helicopterTrack.marks.at(-1)?.transition !== 'linear') {
    throw new Error(`expected helicopter orbit to replace the cast path with deterministic orbit marks, got ${JSON.stringify(helicopterTrack)}`)
  }
  const bundle = buildXrMotionReferencePackage({ plan, graphData, documentName: 'Animation reference.md' })
  const manifest = JSON.parse(bundle.files.find(file => file.path === 'reference/manifest.json')?.text || '{}') as { animationTracks?: number; interpolation?: string; speedWarnings?: number }
  const samplesText = bundle.files.find(file => file.path === 'reference/frame-samples.json')?.text || ''
  const brief = bundle.files.find(file => file.path === 'handoff/video-generator-brief.txt')?.text || ''
  if (manifest.animationTracks !== 1
    || manifest.interpolation !== 'per-mark-easing-with-gait-profiles'
    || typeof manifest.speedWarnings !== 'number'
    || !bundle.files.some(file => file.path === 'reference/choreography-diagnostics.json')
    || !samplesText.includes('helicopter-orbit')
    || !samplesText.includes('rootRotationDegrees')
    || !brief.includes('Helicopter orbit [action-path]')
    || !brief.includes('easing=')
    || !brief.includes('gait=flight')) {
    throw new Error('expected the motion-reference package to carry animation assignments, poses, paths, and generator briefing')
  }
  setXrMotionReferenceDuration(20)
  setXrMotionReferenceStage('backyard-pool')
  const resizedStage = resolveXrMotionReferenceStage('backyard-pool')
  const rebuiltPath = readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === helicopter.id)
  if (rebuiltPath?.marks.at(-1)?.timeSeconds !== 20
    || rebuiltPath.marks.some(mark => Math.abs(mark.position[0]) > resizedStage.sizeMeters[0] * 0.48 || Math.abs(mark.position[2]) > resizedStage.sizeMeters[1] * 0.48)) {
    throw new Error(`expected duration and stage changes to rebuild assigned action paths inside current bounds, got ${JSON.stringify({ stageId: readXrMotionReferenceRuntime().plan.stageId, rebuiltPath })}`)
  }
  clearXrMotionReferenceCastAnimation(helicopter.id)
  const clearedPath = readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === helicopter.id)
  if (clearedPath?.animation !== null || clearedPath.marks.length !== 1 || clearedPath.marks[0]?.transition !== 'hold') {
    throw new Error('expected clearing an action path to stop its baked motion marks')
  }
  applyXrConstrainedCastActionPath(helicopter.id, 'helicopter-orbit')
  const assignedPath = readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === helicopter.id)
  if (!assignedPath) throw new Error('expected an assigned helicopter action path')
  removeXrMotionReferenceCastMark(helicopter.id, 'missing-mark')
  if (readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === helicopter.id)?.animation?.presetId !== 'helicopter-orbit') {
    throw new Error('expected an invalid manual mark removal to leave the assigned action path unchanged')
  }
  retimeXrMotionReferenceCastMark(helicopter.id, assignedPath.marks[1]!.id, 1.75)
  if (readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === helicopter.id)?.animation !== null) {
    throw new Error('expected manual mark retiming to clear a stale action-path assignment')
  }
  applyXrConstrainedCastActionPath(helicopter.id, 'helicopter-orbit')
  const removablePath = readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === helicopter.id)
  removeXrMotionReferenceCastMark(helicopter.id, removablePath!.marks[1]!.id)
  if (readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === helicopter.id)?.animation !== null) {
    throw new Error('expected manual mark removal to clear a stale action-path assignment')
  }
  applyXrConstrainedCastActionPath(helicopter.id, 'helicopter-orbit')
  setXrMotionReferenceCastMark({ actorId: helicopter.id, timeSeconds: 0.123, position: [0, 1, 0] })
  if (readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === helicopter.id)?.animation !== null) {
    throw new Error('expected manual mark placement to clear a stale action-path assignment')
  }
  applyXrConstrainedCastActionPath(helicopter.id, 'helicopter-orbit')
  const editablePath = readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === helicopter.id)
  setXrMotionReferenceCastMarkChoreography({ actorId: helicopter.id, markId: editablePath!.marks[0]!.id, easing: 'ease-in-out', gait: 'flight' })
  if (readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === helicopter.id)?.animation !== null) {
    throw new Error('expected manual per-mark choreography edits to clear a stale action-path assignment')
  }

  const panelSource = readSource('features', 'three', 'XrAnimationFloatingPanelView.tsx')
  const timelineSource = readSource('features', 'three', 'XrCameraMotionSection.tsx')
  const inspectorSource = readSource('features', 'three', 'XrChoreographyInspector.tsx')
  const choreographyControlsSource = readSource('features', 'three', 'XrChoreographyMarkControls.tsx')
  const animationMcpSource = readSource('features', 'three', 'xrAnimationMcpRuntime.ts')
  const agentReadyContractSource = readSource('features', 'agent-ready', 'knowgrphAgentReadyToolContract.mjs')
  const animationWebMcpSource = readSource('features', 'agent-ready', 'xrAnimationWebMcpTools.ts')
  const toolbarSource = readSource('lib', 'toolbar', 'ToolbarToolMenu.impl.tsx')
  const xrPanelRoutingSource = readSource('lib', 'toolbar', 'FloatingPanelXrSceneViews.tsx')
  const bridgeSource = readSource('features', 'three', 'XrMotionReferenceRuntimeBridge.tsx')
  const appSource = readSource('App.tsx')
  const stageSource = readSource('features', 'three', 'XrMotionReferenceStage.tsx')
  const keyboardMotionSource = readSource('features', 'three', 'XrKeyboardChoreographyRuntime.tsx')
  const keyboardMotionUtilitySource = readSource('features', 'three', 'threeKeyboardChoreography.ts')
  const priorHydrationOwners = [
    readSource('features', 'three', 'XrCameraMotionSection.tsx'),
    readSource('features', 'command-menu', 'XrMediaLibraryPanel.tsx'),
    readSource('features', 'strybldr', 'cameraMcpRuntime.ts'),
    readSource('features', 'three', 'xrSceneMcpRuntime.ts'),
    stageSource,
  ]
  for (const marker of ['FloatingPanelCatalogHeader', 'floatingPanelCatalogThreeRowClassName', 'floatingPanelCatalogThreeRowThumbnailFrameClassName', 'ExpandCollapseAllButton', 'useCollapsibleSectionGroup', 'data-kg-animation-card-toggle', 'data-kg-animation-clear="selected-actor"', 'data-kg-animation-mcp="knowgrph.control_local_animation"', 'AnimationInvocationChips', 'splitInvocationTokenSegments(invocation)', "segment.kind === 'token'", "surface === 'action' ? compactInvocation : displayInvocation", 'UI_INLINE_CHIP_GROUP_CLASSNAME', 'data-kg-animation-invocation-chips={surface}', 'data-kg-animation-invocation-chip-renderer="shared-markdown-sigil"', 'renderAgenticOsInvocationKeywordChip', 'sourceLink: false', '<AnimationInvocationChips invocation={invocation} surface="action" />', '<AnimationInvocationChips active={active} invocation={invocation} surface="details" />']) {
    if (!panelSource.includes(marker)) throw new Error(`expected first-class Animation cards to reuse shared disclosure/catalog UI through ${marker}`)
  }
  for (const marker of ['XrChoreographyInspector', 'inspectLocalAnimation', 'Shared cast and camera choreography, playback, and export']) {
    if (!panelSource.includes(marker)) throw new Error(`expected FloatingPanel Animation to project the shared choreography runtime through ${marker}`)
  }
  for (const forbidden of ["operation: 'configure-mark'", 'position: update.position', 'onChange={configureMark}']) {
    if (panelSource.includes(forbidden)) throw new Error(`expected FloatingPanel Animation to defer mark parameter editing to Timeline, found ${forbidden}`)
  }
  for (const marker of ['data-kg-xr-timeline-shot-target="scene-clip"', 'aria-label="XR timeline scene or 3D object shot target"', 'data-kg-xr-timeline-playhead-control="scene-clip"', 'aria-label="XR timeline playhead seconds"', "controlLocalAnimation({ operation: 'scrub'"]) {
    if (!timelineSource.includes(marker)) throw new Error(`expected BottomPanel Timeline to own shared animation control ${marker}`)
  }
  for (const duplicate of ['data-kg-animation-runtime-controls="shared-xr"', 'aria-label="Animation cast target"', 'aria-label="Animation playhead seconds"']) {
    if (panelSource.includes(duplicate)) throw new Error(`expected FloatingPanel Animation to remove duplicate Timeline control ${duplicate}`)
  }
  for (const marker of ['data-kg-xr-choreography-inspector="shared-runtime"', 'One mark model for cast and camera · Timeline owns time', 'resolveXrChoreographySpeedWarnings', 'floatingPanelCatalogThreeRowClassName', 'floatingPanelCatalogThreeRowThumbnailFrameClassName', 'data-kg-xr-choreography-card={target}', 'data-kg-xr-choreography-card-layout={FLOATING_PANEL_CATALOG_THREE_ROW_LAYOUT}', 'data-kg-xr-choreography-card-row="controls"', 'data-kg-xr-choreography-card-row="invocation"', 'data-kg-xr-choreography-invocation={target}', 'projectedCastInvocation', 'projectedCameraInvocation', 'data-kg-xr-choreography-runtime-ready', 'MCP · / @ # ready', 'renderMarkdownSigilInlineText', 'renderAgenticOsInvocationKeywordChip', 'sourceLink: false', 'UI_INLINE_CHIP_GROUP_CLASSNAME', 'renderMarkdownSigilInlineText(invocation,', 'BottomPanel Timeline', 'data-kg-xr-mark-parameter-chips={target}', 'data-kg-xr-mark-parameter-chip-renderer="shared-markdown-sigil"', 'data-kg-xr-choreography-selection-owner="timeline-cast"', 'data-kg-xr-choreography-selection-owner="timeline-camera"', 'Select marks in the']) {
    if (!inspectorSource.includes(marker)) throw new Error(`expected Animation choreography inspection to expose ${marker}`)
  }
  for (const forbidden of ['<XrChoreographyMarkControls', 'MarkParameterChips', 'data-kg-xr-mark-parameter-sigil', 'selectXrMotionReferenceCastMark', 'selectXrMotionReferenceCameraMark', 'aria-label={`Select ${track.label} mark']) {
    if (inspectorSource.includes(forbidden)) throw new Error(`expected FloatingPanel choreography cards to avoid bespoke, duplicate mark controls or selectors, found ${forbidden}`)
  }
  for (const marker of ['data-kg-xr-mark-easing', 'data-kg-xr-mark-gait', 'data-kg-xr-mark-position', 'data-kg-xr-mark-position-axis', "min={axis === 'Y' ? 0 : -XR_MOTION_REFERENCE_MAX_COORDINATE_METERS}", 'max={XR_MOTION_REFERENCE_MAX_COORDINATE_METERS}', 'Mark position · meters', 'XR_CHOREOGRAPHY_EASINGS', 'XR_CHOREOGRAPHY_GAITS', 'showPosition', 'data-kg-xr-mark-position-layout="compact-timeline"', 'XYZ m']) {
    if (!choreographyControlsSource.includes(marker)) throw new Error(`expected Timeline mark controls to expose ${marker}`)
  }
  for (const marker of ["'configure-mark'", "'move-object'", 'buildXrAnimationObjectMoveInvocation', 'resolveXrSubjectKeyboardMotion', 'hydrateCanonicalXrPhysicsRuntime()', 'applyXrConstrainedCastMarkChoreography', 'setXrMotionReferenceCameraMarkChoreography', 'position: control.position', 'resolveXrChoreographySpeedWarnings', 'configureCastMark', 'configureCameraMark', 'moveObject']) {
    if (!animationMcpSource.includes(marker)) throw new Error(`expected Animation MCP to control and inspect choreography through ${marker}`)
  }
  for (const marker of ['XR_ANIMATION_CONTROL_INPUT_SCHEMA', 'buildXrAnimationOperationSchema', 'oneOf:', "'configure-mark'", "'move-object'", "enum: ['w', 'a', 's', 'd', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']", 'distanceMeters', 'Use the shared 0.05 m precision step', "enum: ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'hold']", "enum: ['hold', 'walk', 'jog', 'run', 'wheeled', 'flight', 'drop']", "Cast mark [x, y, z] position in stage meters"]) {
    if (!agentReadyContractSource.includes(marker)) throw new Error(`expected Web MCP schema to expose typed choreography fields through ${marker}`)
  }
  for (const marker of ['KNOWGRPH_AGENT_READY_TOOL_IDS.controlLocalAnimation', 'controlLocalAnimation(input || {})']) {
    if (!animationWebMcpSource.includes(marker)) throw new Error(`expected WebMCP to execute the shared animation control through ${marker}`)
  }
  const mediaIndex = toolbarSource.indexOf("{ view: 'media'")
  const animationIndex = toolbarSource.indexOf("{ view: 'animation'")
  const cameraIndex = toolbarSource.indexOf("{ view: 'camera'")
  if (!(mediaIndex >= 0 && mediaIndex < animationIndex && animationIndex < cameraIndex)
    || !xrPanelRoutingSource.includes('XrAnimationFloatingPanelViewLazy')
    || !xrPanelRoutingSource.includes("view === 'animation'")) {
    throw new Error('expected first-class FloatingPanel Animation immediately to the right of Media and before Camera')
  }
  if (!bridgeSource.includes('hydrateXrMotionReferenceRuntime({')
    || !bridgeSource.includes('useIsomorphicLayoutEffect')
    || !bridgeSource.includes('resetCameraFramingRuntimeForDocument(sceneKey)')
    || !appSource.includes('<XrMotionReferenceRuntimeBridge />')
    || priorHydrationOwners.some(source => source.includes('hydrateXrMotionReferenceRuntime('))) {
    throw new Error('expected one app-root XR motion hydration owner independent of panel or stage visibility')
  }
  if (!panelSource.includes('readBoundXrSelectedActorId') || !panelSource.includes("targetId: 'selected-actor'")) {
    throw new Error('expected Animation cards and controls to resolve the graph-bound actor at invocation time')
  }
  if (stageSource.includes('kg_xr_motion_default_camera') || !stageSource.includes('<GraphCastPropCue')) {
    throw new Error('expected the XR stage to remove its fake Camera and render native cast prop cues')
  }
  for (const marker of ['<XrKeyboardChoreographyRuntime />', 'WASD or arrow keys', 'Shift for 0.05 m']) {
    if (!`${stageSource}\n${inspectorSource}`.includes(marker)) throw new Error(`expected XR object choreography to expose keyboard motion through ${marker}`)
  }
  for (const marker of ['resolveXrObjectKeyboardMotionTarget', 'resolveXrSubjectKeyboardMotion', 'window.requestAnimationFrame(runAnimationFrame)', 'THREE_KEYBOARD_HOLD_DELAY_MS', 'activeKeysRef.current.has(tap.key)', 'claimThreeObjectKeyboardInputOwnership', '[data-kg-xr-lane-cast-mark][aria-pressed="true"]', "window.addEventListener('keydown', handleKeyDown, { capture: true })", 'event.stopImmediatePropagation()', 'applyXrConstrainedCastMarkChoreography', 'releaseThreeObjectKeyboardInputOwnership']) {
    if (!keyboardMotionSource.includes(marker)) throw new Error(`expected XR keyboard motion to isolate object choreography through ${marker}`)
  }
  for (const marker of ['THREE_KEYBOARD_MOVEMENT_KEYS', 'resolveThreeKeyboardTap', 'resolveThreeKeyboardMotionDirection', 'resolveThreeKeyboardFrameAmount', 'resolveThreeObjectKeyboardMotionPosition', 'resolveThreeCameraKeyboardFraming', 'clampThreeObjectPlanarPosition']) {
    if (!keyboardMotionUtilitySource.includes(marker)) throw new Error(`expected shared Three keyboard motion to own ${marker}`)
  }
  for (const forbidden of ['XR_OBJECT_KEYBOARD_STEP_METERS', 'resolveXrObjectKeyboardMotionDirection', 'resolveXrObjectKeyboardMotionFrameDistance']) {
    if (keyboardMotionSource.includes(forbidden)) throw new Error(`expected XR runtime to remove duplicate keyboard math ${forbidden}`)
  }
  const implementation = `${panelSource}\n${stageSource}\n${readSource('features', 'three', 'xrAnimationCatalog.ts')}\n${readSource('features', 'three', 'xrAnimationMcpRuntime.ts')}`.toLowerCase()
  for (const forbidden of ['wassermanproductions', 'blockout', 'electron-vite', 'ffmpeg']) {
    if (implementation.includes(forbidden)) throw new Error(`expected clean-room native Animation implementation to avoid ${forbidden}`)
  }

  const priorState = useGraphStore.getState()
  resetToNativeAnimationGrammar()
  try {
    useGraphStore.setState({
      markdownDocumentName: 'Animation invocation.md',
      markdownDocumentText: '# Animation invocation',
      graphData,
      canvasRenderMode: '2d',
      canvas3dMode: '3d',
      floatingPanelOpen: false,
      floatingPanelView: 'media',
      selectedNodeId: 'actor-a',
      bottomSurfaceTab: 'stats',
      bottomSurfaceCollapsed: true,
    } as never)
    const invocation = buildXrAnimationInvocation('dance')
    const applied = controlLocalAnimation({ invocation })
    const activeState = useGraphStore.getState()
    if (invocation !== '/animation.control #character-motion @selected-actor operation=apply preset=dance'
      || !applied.ok
      || readXrMotionReferenceRuntime().plan.cast[0]?.animation?.presetId !== 'dance'
      || activeState.canvasRenderMode !== '3d'
      || activeState.canvas3dMode !== 'xr'
      || activeState.floatingPanelView !== 'animation'
      || activeState.floatingPanelOpen !== true
      || activeState.bottomSurfaceTab !== 'timeline'
      || activeState.bottomSurfaceCollapsed !== false) {
      throw new Error(`expected upstream / @ # animation invocation to persist and reveal the canonical runtime, got ${JSON.stringify(applied)}`)
    }
    try {
      assertPinnedAgenticOsDictionaryTokensForTest(PINNED_ANIMATION_DICTIONARY_TOKENS)
    } finally {
      resetAgenticOsRemoteGrammarCatalogForTests()
    }
    const configuredMarkId = readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === 'actor-a')!.marks[0]!.id
    const configured = controlLocalAnimation({ operation: 'configure-mark', markKind: 'cast', markId: configuredMarkId, targetId: 'actor-a', easing: 'ease-in-out', gait: 'run', position: [2, 0, -1] })
    const configuredInvocation = controlLocalAnimation({ invocation: `/animation.control #action-path @selected-actor operation=configure-mark markKind=cast markId=${configuredMarkId} easing=ease-in-out gait=run position=2,0,-1` })
    const configuredMark = readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === 'actor-a')!.marks.find(mark => mark.id === configuredMarkId)
    if (!configured.ok || !configuredInvocation.ok || configuredMark?.transition !== 'ease-in-out' || configuredMark.gait !== 'run' || configuredMark.position.join('|') !== '2|0|-1' || readXrMotionReferenceRuntime().dirty) {
      throw new Error(`expected structured and / @ # MCP to persist per-mark cast choreography atomically, got ${JSON.stringify({ configured, configuredInvocation })}`)
    }
    const moveInvocation = buildXrAnimationObjectMoveInvocation({ keys: ['w', 'd'], distanceMeters: 1, markId: configuredMarkId })
    const moved = controlLocalAnimation({ invocation: moveInvocation })
    const movedMark = readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === 'actor-a')!.marks.find(mark => mark.id === configuredMarkId)
    if (moveInvocation !== `/animation.control #action-path @selected-actor operation=move-object keys=w+d distance=1 markId=${configuredMarkId}`
      || !moved.ok
      || !closeTo(movedMark?.position[0], 2 + Math.SQRT1_2, 0.0001)
      || !closeTo(movedMark?.position[2], -1 - Math.SQRT1_2, 0.0001)
      || readXrMotionReferenceRuntime().dirty) {
      throw new Error(`expected / @ # object movement to reuse normalized keyboard motion and persist atomically, got ${JSON.stringify(moved)}`)
    }
    const invalidMarkConfig = controlLocalAnimation({ operation: 'configure-mark', markKind: 'cast', markId: 'missing-mark', targetId: 'actor-a', easing: 'ease-in' })
    if (invalidMarkConfig.ok) throw new Error('expected structured MCP to reject an unknown choreography mark')
    const invalidPositionConfig = controlLocalAnimation({ operation: 'configure-mark', markKind: 'cast', markId: configuredMarkId, targetId: 'actor-a', position: [1, 2] as never })
    if (invalidPositionConfig.ok) throw new Error('expected structured MCP to reject a malformed cast mark position')
    const unboundedPositionConfig = controlLocalAnimation({ operation: 'configure-mark', markKind: 'cast', markId: configuredMarkId, targetId: 'actor-a', position: [1001, 0, 0] })
    if (unboundedPositionConfig.ok) throw new Error('expected structured MCP to reject an out-of-bounds cast mark position')
    const scrubbed = controlLocalAnimation({ invocation: '/animation.control @canvas operation=scrub time=1.250' })
    const exported = controlLocalAnimation({ operation: 'export' })
    const inspection = inspectLocalAnimation()
    const invalidInvocation = controlLocalAnimation({ invocation: '/animation.control #character-motion #camera-motion @selected-actor operation=apply preset=dance' })
    const unknownPairInvocation = controlLocalAnimation({ invocation: '/animation.control #character-motion @selected-actor operation=apply preset=dance foo=bar' })
    const invalidTimeInvocation = controlLocalAnimation({ invocation: '/animation.control @canvas operation=scrub time=banana' })
    const missingTimeInvocation = controlLocalAnimation({ invocation: '/animation.control @canvas operation=scrub' })
    const extraCommandInvocation = controlLocalAnimation({ invocation: '/animation.control /camera.play @canvas operation=play' })
    const wrongBindingInvocation = controlLocalAnimation({ invocation: '/animation.control #character-motion @canvas operation=apply preset=dance' })
    const missingSemanticInvocation = controlLocalAnimation({ invocation: '/animation.control @selected-actor operation=apply preset=dance' })
    const invalidMoveSemantic = controlLocalAnimation({ invocation: `/animation.control #character-motion @selected-actor operation=move-object keys=w markId=${configuredMarkId}` })
    const invalidMoveKeys = controlLocalAnimation({ operation: 'move-object', targetId: 'actor-a', markId: configuredMarkId, keys: ['PageUp'] })
    const invalidMoveDistance = controlLocalAnimation({ operation: 'move-object', targetId: 'actor-a', markId: configuredMarkId, keys: ['w'], distanceMeters: 11 })
    const mixedInvocation = controlLocalAnimation({ invocation: '/animation.control @canvas operation=play', operation: 'play' })
    const missingPresetApply = controlLocalAnimation({ operation: 'apply', targetId: 'actor-a' })
    const missingMarkKind = controlLocalAnimation({ operation: 'configure-mark', markId: configuredMarkId, targetId: 'actor-a', easing: 'linear' })
    const cameraConfigWithIgnoredTarget = controlLocalAnimation({ operation: 'configure-mark', markKind: 'camera', markId: 'missing-camera', targetId: 'actor-a', easing: 'linear' })
    const structuredScrubWithoutTime = controlLocalAnimation({ operation: 'scrub' })
    const playWithIgnoredTarget = controlLocalAnimation({ operation: 'play', targetId: 'actor-a' })
    if (!scrubbed.ok
      || readXrMotionReferenceRuntime().playheadSeconds !== 1.25
      || !exported.ok
      || !exported.package?.files.some(file => file.path === 'reference/frame-samples.json')
      || inspection.schema !== 'knowgrph-xr-animation-mcp/v1'
      || !inspection.catalog.canonical
      || inspection.presets.length !== XR_ANIMATION_PRESETS.length
      || inspection.runtime.cast.find(track => track.actorId === 'actor-a')?.marks[0]?.transition !== 'ease-in-out'
      || !closeTo(inspection.runtime.cast.find(track => track.actorId === 'actor-a')?.marks[0]?.position[0], 2 + Math.SQRT1_2, 0.0001)
      || !inspection.invocationGrammar?.moveObject.includes('operation=move-object')
      || !Array.isArray(inspection.runtime.speedWarnings)) {
      throw new Error('expected Animation MCP inspect/control to share invocation, scrub, and export runtime state')
    }
    if (invalidInvocation.ok || unknownPairInvocation.ok || invalidTimeInvocation.ok || missingTimeInvocation.ok || extraCommandInvocation.ok || wrongBindingInvocation.ok || missingSemanticInvocation.ok || invalidMoveSemantic.ok || invalidMoveKeys.ok || invalidMoveDistance.ok || mixedInvocation.ok || missingPresetApply.ok || missingMarkKind.ok || cameraConfigWithIgnoredTarget.ok || structuredScrubWithoutTime.ok || playWithIgnoredTarget.ok) {
      throw new Error('expected Animation invocation and structured parsing to reject noncanonical commands, incomplete operations, ignored fields, and scrub values')
    }
    useGraphStore.getState().selectNode('actor-b')
    if (readXrMotionReferenceRuntime().selectedActorId !== 'actor-a' || inspectLocalAnimation().runtime.selectedActorId !== 'actor-b') {
      throw new Error('expected immediate Animation inspection and control targeting to resolve the graph-bound selected actor')
    }
    selectBoundXrActor('actor-b')
    const planBeforeInvalidApply = JSON.stringify(serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan))
    const invalidPresetApply = controlLocalAnimation({ operation: 'apply', trackKind: 'character-motion', presetId: 'missing-preset', targetId: 'actor-a' })
    if (invalidPresetApply.ok
      || useGraphStore.getState().selectedNodeId !== 'actor-b'
      || readXrMotionReferenceRuntime().selectedActorId !== 'actor-b'
      || JSON.stringify(serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan)) !== planBeforeInvalidApply) {
      throw new Error('expected an invalid Animation control to fail without changing selection or choreography')
    }
    const originalUpdateGraphMetadata = useGraphStore.getState().updateGraphMetadata
    const planBeforeFailedWrite = JSON.stringify(serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan))
    const selectionBeforeFailedWrite = useGraphStore.getState().selectedNodeId
    let failedWriteResult: ReturnType<typeof controlLocalAnimation>
    useGraphStore.setState({ updateGraphMetadata: () => undefined } as never)
    try {
      failedWriteResult = controlLocalAnimation({ operation: 'apply', trackKind: 'character-motion', presetId: 'fight', targetId: 'actor-b' })
    } finally {
      useGraphStore.setState({ updateGraphMetadata: originalUpdateGraphMetadata } as never)
    }
    if (failedWriteResult!.ok
      || JSON.stringify(serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan)) !== planBeforeFailedWrite
      || useGraphStore.getState().selectedNodeId !== selectionBeforeFailedWrite) {
      throw new Error('expected a failed Animation metadata write to roll back runtime and selection atomically')
    }
    selectXrMotionReferenceActor('actor-a')
    useGraphStore.setState({ markdownDocumentText: '' } as never)
    if (hydrateCanonicalXrMotionReferenceRuntime()
      || readXrMotionReferenceRuntime().plan.cast.length !== 0
      || readXrMotionReferenceRuntime().selectedActorId) {
      throw new Error('expected the canonical bridge to clear dirty choreography behind the no-document readiness sentinel')
    }
  } finally {
    resetAgenticOsRemoteGrammarCatalogForTests()
    useGraphStore.setState({
      markdownDocumentName: priorState.markdownDocumentName,
      markdownDocumentText: priorState.markdownDocumentText,
      graphData: priorState.graphData,
      canvasRenderMode: priorState.canvasRenderMode,
      canvas3dMode: priorState.canvas3dMode,
      floatingPanelOpen: priorState.floatingPanelOpen,
      floatingPanelView: priorState.floatingPanelView,
      selectedNodeId: priorState.selectedNodeId,
      bottomSurfaceTab: priorState.bottomSurfaceTab,
      bottomSurfaceCollapsed: priorState.bottomSurfaceCollapsed,
      timelineTransportDocumentKey: priorState.timelineTransportDocumentKey,
      timelineTransportPosition: priorState.timelineTransportPosition,
      timelineTransportPlaying: priorState.timelineTransportPlaying,
    } as never)
    hydrateCanonicalXrMotionReferenceRuntime()
  }
}
