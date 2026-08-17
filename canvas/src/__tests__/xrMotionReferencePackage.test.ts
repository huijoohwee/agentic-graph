import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { GraphData } from '@/lib/graph/types'
import { applyCanvasViewSelection } from '@/components/toolbar/canvasViewActions'
import {
  XR_MOTION_REFERENCE_PACKAGE_SCHEMA,
  XR_MOTION_REFERENCE_SCHEMA,
  readXrMotionReferencePlan,
  sampleXrMotionReferenceCameraPose,
  sampleXrMotionReferenceCameraSettings,
  sampleXrMotionReferenceMarks,
  serializeXrMotionReferencePlan,
} from '@/features/three/xrMotionReferenceModel'
import { buildXrMotionReferencePackage, xrMotionReferencePackageBlob, xrMotionReferencePackageFilename } from '@/features/three/xrMotionReferencePackage'
import { resolveXrChoreographySpeedWarnings } from '@/features/three/xrChoreographyDiagnostics'
import {
  addXrMotionReferenceSubject,
  hydrateXrMotionReferenceRuntime,
  readXrMotionReferenceRuntime,
  removeXrMotionReferenceSubject,
  setXrMotionReferenceCameraMarkChoreography,
  setXrMotionReferenceCameraMark,
  setXrMotionReferenceCastMarkChoreography,
  setXrMotionReferenceCastTransition,
  setXrMotionReferenceCastMark,
  setXrMotionReferenceDuration,
  setXrMotionReferenceFps,
  setXrMotionReferencePlayhead,
  setXrMotionReferenceStage,
  setXrMotionReferenceSubjectLabel,
} from '@/features/three/xrMotionReferenceRuntime'
import { assertXrDefaultTerrain, assertXrSceneCatalogAndVehiclePlacements, assertXrSubjectAssetSwapCrud, assertXrTerrainAssetsAreCleanRoom } from '@/__tests__/helpers/xrSceneLibraryAssertions'
import { assertXrMotionReferenceStageSurfaceContracts } from '@/__tests__/helpers/xrMotionReferenceSourceAssertions'
import {
  XR_MOTION_STAGE_CAMERA_POSITION,
  XR_MOTION_STAGE_CAMERA_TARGET,
  xrMotionReferenceWorldPosition,
} from '@/features/three/xrMotionReferenceCoordinates'
import { buildXrMotionReferenceTimelineCode } from '@/features/three/xrMotionReferenceTimeline'
import { buildMermaidGanttTimelineModel } from '@/lib/mermaid/mermaidGanttBarInteraction'
import { resolveVideoSequenceTimelineLane } from '@/components/timeline/videoSequenceTimeline'
import {
  CAMERA_SENSOR_FORMATS,
  resolveCameraVerticalFovDegreesForOptics,
  resolveFullFrameEquivalentFocalLengthMm,
} from '@/features/strybldr/cameraOptics'

function readSource(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8')
}

function buildGraph(): GraphData {
  return {
    type: 'Graph',
    nodes: [
      { id: 'cast-a', label: 'Lead', type: 'Person', properties: {} },
      { id: 'cast-b', label: 'Partner', type: 'Person', properties: {} },
    ],
    edges: [
      { id: 'cue-a-b', source: 'cast-a', target: 'cast-b', label: 'cue', properties: {} },
    ],
    metadata: {},
  }
}

export async function testXrMotionReferencePackageIsNativeDeterministicAndGraphBacked() {
  const graphData = buildGraph()
  const worldPosition = xrMotionReferenceWorldPosition([2, 3, -4], 10, 5)
  if (JSON.stringify(worldPosition) !== JSON.stringify([20, 35, -40])) {
    throw new Error(`expected meter-based XR XYZ to map directly into a Y-up Three world, got ${JSON.stringify(worldPosition)}`)
  }
  if (XR_MOTION_STAGE_CAMERA_POSITION[1] <= XR_MOTION_STAGE_CAMERA_TARGET[1]
    || XR_MOTION_STAGE_CAMERA_POSITION[2] === XR_MOTION_STAGE_CAMERA_TARGET[2]) {
    throw new Error('expected XR entry framing to start above and in front of the horizontal stage')
  }
  let sharedPanelOpenRequests = 0
  const surfaceCalls: string[] = []
  applyCanvasViewSelection({
    id: 'surface:xr',
    ensureBaselineUnlocked: () => true,
    geospatialEnabled: false,
    onOpenGeospatialMode: () => { throw new Error('XR activation must not open geospatial mode') },
    onOpenShared3dPanel: mode => {
      if (mode !== 'xr') throw new Error(`XR activation must identify the canonical XR panel, got ${mode}`)
      sharedPanelOpenRequests += 1
    },
    canvas2dRenderer: 'd3',
    canvas3dMode: '3d',
    canvasRenderMode: '2d',
    documentSemanticMode: 'document',
    frontmatterModeEnabled: false,
    multiDimTableModeEnabled: false,
    renderMediaAsNodes: false,
    timelineEnabled: false,
    bottomSurfaceCollapsed: true,
    bottomSurfaceTab: 'stats',
    schema: {
      layout: { mode: 'block' },
      behavior: { allowEdgeCreation: true, allowNodeDrag: true },
      nodeStyles: {},
      edgeStyles: {},
      rules: [],
    },
    setCanvas2dRenderer: () => {},
    setCanvasRenderMode: mode => { surfaceCalls.push(`render:${mode}`) },
    setCanvas3dMode: mode => { surfaceCalls.push(`3d:${mode}`) },
    setSchema: () => {},
    setRenderMediaAsNodes: () => {},
    setTimelineEnabled: () => {},
    setBottomSurfaceCollapsed: () => {},
    setBottomSurfaceTab: () => {},
    setDocumentSemanticMode: () => {},
    setFrontmatterModeEnabled: () => {},
    setMultiDimTableModeEnabled: () => {},
  })
  if (sharedPanelOpenRequests !== 1 || surfaceCalls.length !== 0) {
    throw new Error(`expected XR surface activation to delegate once without raw surface setters, got ${JSON.stringify({ sharedPanelOpenRequests, surfaceCalls })}`)
  }
  hydrateXrMotionReferenceRuntime({
    sceneKey: 'test-scene',
    nodes: graphData.nodes,
    persistedValue: null,
  })
  let runtime = readXrMotionReferenceRuntime()
  if (runtime.plan.schema !== XR_MOTION_REFERENCE_SCHEMA || runtime.plan.cast.length !== 2) {
    throw new Error(`expected graph nodes to hydrate native cast tracks, got ${JSON.stringify(runtime.plan)}`)
  }
  assertXrDefaultTerrain(runtime.plan.stageId)
  if (runtime.plan.cast.some(track => track.marks.length !== 1 || track.marks[0]?.timeSeconds !== 0)) {
    throw new Error('expected each graph-derived cast member to receive one bounded starting mark')
  }

  setXrMotionReferenceStage('loading-bay')
  setXrMotionReferenceDuration(5)
  setXrMotionReferenceFps(10)
  setXrMotionReferenceCastMark({
    actorId: 'cast-a',
    timeSeconds: 2.5,
    position: [4, 0, -3],
    transition: 'linear',
  })
  setXrMotionReferenceCameraMark({
    timeSeconds: 0,
    anchorId: 'cast-a',
    settings: { angle: 'front', level: 'eye-level', shot: 'wide', note: 'Opening', orbitX: 0, orbitY: 0, sensorId: 'super-35', focalLengthMm: 35, focusDistanceMeters: 6, aspectRatio: '1.85:1' },
    rig: 'dolly',
  })
  setXrMotionReferenceCameraMark({
    timeSeconds: 5,
    anchorId: 'cast-a',
    settings: { angle: 'right-side', level: 'high-angle', shot: 'close-up', note: 'Arrival', orbitX: 0.4, orbitY: -0.35, sensorId: 'full-frame', focalLengthMm: 85, focusDistanceMeters: 1.2, aspectRatio: '2.39:1' },
    rig: 'drone',
  })
  const authored = readXrMotionReferenceRuntime().plan
  setXrMotionReferenceCastMarkChoreography({ actorId: 'cast-a', markId: authored.cast.find(track => track.actorId === 'cast-a')!.marks[0]!.id, easing: 'ease-in', gait: 'walk' })
  setXrMotionReferenceCameraMarkChoreography({ markId: authored.camera[0]!.id, easing: 'ease-in-out' })
  setXrMotionReferencePlayhead(2.5)
  runtime = readXrMotionReferenceRuntime()
  if (runtime.plan.stageId !== 'loading-bay' || runtime.plan.durationSeconds !== 5 || runtime.plan.fps !== 10 || !runtime.dirty) {
    throw new Error(`expected runtime edits to update one dirty plan, got ${JSON.stringify(runtime)}`)
  }
  const lead = runtime.plan.cast.find(track => track.actorId === 'cast-a')!
  const sampled = sampleXrMotionReferenceMarks(lead.marks, 2.5)
  if (sampled.join('|') !== '4|0|-3') {
    throw new Error(`expected cast sampling to land on authored mark, got ${sampled.join('|')}`)
  }
  const holdMarks = [
    { id: 'hold:0', timeSeconds: 0, position: [0, 0, 0] as const, transition: 'hold' as const, gait: 'hold' as const },
    { id: 'hold:2', timeSeconds: 2, position: [2, 0, 0] as const, transition: 'linear' as const, gait: 'walk' as const },
  ]
  if (sampleXrMotionReferenceMarks(holdMarks, 1).join('|') !== '0|0|0' || sampleXrMotionReferenceMarks(holdMarks, 2).join('|') !== '2|0|0') {
    throw new Error('expected hold motion to jump onto the exact destination keyframe')
  }
  const holdCameraMarks = runtime.plan.camera.map((mark, index) => ({ ...mark, easing: index === 0 ? 'hold' as const : mark.easing }))
  if (sampleXrMotionReferenceCameraPose(holdCameraMarks, 2.5).position.join('|') !== holdCameraMarks[0]!.pose.position.join('|')
    || sampleXrMotionReferenceCameraPose(holdCameraMarks, 5).position.join('|') !== holdCameraMarks[1]!.pose.position.join('|')
    || sampleXrMotionReferenceCameraSettings(holdCameraMarks, 5).focalLengthMm !== 85) {
    throw new Error('expected camera hold easing to land on the exact destination mark for pose and settings')
  }
  const easedMarks = [
    { id: 'ease:0', timeSeconds: 0, position: [0, 0, 0] as const, transition: 'ease-in' as const, gait: 'walk' as const },
    { id: 'ease:2', timeSeconds: 2, position: [2, 0, 0] as const, transition: 'linear' as const, gait: 'walk' as const },
  ]
  if (sampleXrMotionReferenceMarks(easedMarks, 1).join('|') !== '0.5|0|0') {
    throw new Error('expected deterministic per-mark easing to shape path sampling')
  }
  const warningPlan = readXrMotionReferencePlan({
    durationSeconds: 2,
    cast: [{ actorId: 'cast-a', marks: [
      { timeSeconds: 0, position: [0, 0, 0], easing: 'linear', gait: 'walk' },
      { timeSeconds: 1, position: [8, 0, 0], easing: 'linear', gait: 'walk' },
    ] }],
  }, graphData.nodes)
  const warnings = resolveXrChoreographySpeedWarnings(warningPlan)
  if (warnings[0]?.code !== 'cast-speed' || warnings[0]?.speedMetersPerSecond !== 8) {
    throw new Error(`expected a typed gait speed warning for implausible motion, got ${JSON.stringify(warnings)}`)
  }

  const saturatedPlan = readXrMotionReferencePlan({
    durationSeconds: 30,
    cast: [{
      actorId: 'cast-a',
      marks: [
        ...Array.from({ length: 32 }, (_item, index) => ({ timeSeconds: index / 2, position: [index, 0, 0], transition: 'linear' })),
        { timeSeconds: 7.5, position: [49, 0, 0], transition: 'hold' },
      ],
    }],
  }, graphData.nodes)
  const saturatedLead = saturatedPlan.cast.find(track => track.actorId === 'cast-a')!
  if (saturatedLead.marks.length !== 32 || saturatedLead.marks.find(mark => mark.timeSeconds === 7.5)?.position[0] !== 49) {
    throw new Error('expected latest duplicate-time cast mark to replace in place at the bounded capacity')
  }
  const saturatedCameraPlan = readXrMotionReferencePlan({
    durationSeconds: 30,
    camera: [
      ...Array.from({ length: 32 }, (_item, index) => ({ timeSeconds: index / 2, anchorId: 'cast-a', settings: null })),
      { timeSeconds: 7.5, anchorId: 'cast-a', settings: { shot: 'close-up' } },
    ],
  }, graphData.nodes)
  if (saturatedCameraPlan.camera.length !== 32 || saturatedCameraPlan.camera.find(mark => mark.timeSeconds === 7.5)?.settings.shot !== 'close-up') {
    throw new Error('expected latest duplicate-time camera mark to replace in place at the bounded capacity')
  }

  const serialized = serializeXrMotionReferencePlan(runtime.plan)
  const roundTrip = readXrMotionReferencePlan(serialized, graphData.nodes)
  if (JSON.stringify(serializeXrMotionReferencePlan(roundTrip)) !== JSON.stringify(serialized)) {
    throw new Error('expected XR motion-reference graph metadata to round-trip deterministically')
  }
  if (roundTrip.cast.find(track => track.actorId === 'cast-a')?.marks[0]?.transition !== 'ease-in'
    || roundTrip.cast.find(track => track.actorId === 'cast-a')?.marks[0]?.gait !== 'walk'
    || roundTrip.camera[0]?.easing !== 'ease-in-out'
    || roundTrip.camera[0]?.settings.sensorId !== 'super-35'
    || roundTrip.camera[1]?.settings.focusDistanceMeters !== 1.2
    || roundTrip.camera[1]?.settings.aspectRatio !== '2.39:1') {
    throw new Error('expected cast gait plus cast/camera easing to survive deterministic graph metadata round-trip')
  }
  if (roundTrip.camera[0]?.pose.target.join('|') !== '-3.6|0|-1.4' || roundTrip.camera[1]?.pose.target.join('|') !== '4|0|-3') {
    throw new Error(`expected camera marks to resolve around their timed graph-cast anchor positions, got ${JSON.stringify(roundTrip.camera.map(mark => mark.pose.target))}`)
  }
  const timelineCode = buildXrMotionReferenceTimelineCode(roundTrip)
  const timelineModel = buildMermaidGanttTimelineModel(timelineCode)
  const timelineLanes = new Set(timelineModel.taskSpans.map(resolveVideoSequenceTimelineLane))
  if (!timelineCode.includes('title Video Sequence')
    || !timelineCode.includes('XR runtime effect')
    || !timelineCode.includes('Camera mark 1 effect')
    || Math.abs(timelineModel.durationMinutes - roundTrip.durationSeconds / 60) > 0.0001
    || !timelineLanes.has('scene')
    || !timelineLanes.has('effect')) {
    throw new Error(`expected the XR plan to project into the existing Timeline player Scene/Effect lanes, got ${JSON.stringify({ timelineCode, durationMinutes: timelineModel.durationMinutes, lanes: [...timelineLanes] })}`)
  }

  const first = buildXrMotionReferencePackage({ plan: roundTrip, graphData, documentName: 'Scene Alpha.md' })
  const second = buildXrMotionReferencePackage({ plan: roundTrip, graphData, documentName: 'Scene Alpha.md' })
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error('expected motion-reference package bytes to be deterministic for the same graph and plan')
  }
  if (first.schema !== XR_MOTION_REFERENCE_PACKAGE_SCHEMA || first.timeline.frameCount !== 51 || first.stage.id !== 'loading-bay') {
    throw new Error(`expected normalized package identity and exact frame count, got ${JSON.stringify(first.timeline)}`)
  }
  if (first.referenceBoundary.runtimeDependency !== false || first.referenceBoundary.implementation !== 'native-knowgrph') {
    throw new Error(`expected exported package to declare its clean native boundary, got ${JSON.stringify(first.referenceBoundary)}`)
  }
  const paths = first.files.map(file => file.path)
  for (const expected of [
    'reference/manifest.json',
    'reference/cast-tracks.json',
    'reference/camera-track.json',
    'reference/choreography-diagnostics.json',
    'reference/frame-samples.json',
    'reference/stage-map.svg',
    'handoff/video-generator-brief.txt',
    'README.txt',
  ]) {
    if (!paths.includes(expected)) throw new Error(`expected package virtual file ${expected}`)
  }
  const manifestFile = first.files.find(file => file.path === 'reference/manifest.json')!
  const manifest = JSON.parse(manifestFile.text) as { cameraSemanticMapping?: { baselineMeters?: number; anchorFallback?: string }; cameraOptics?: { sensors?: string[]; interpolation?: { focalLengthMm?: string; focusDistanceMeters?: string } }; interpolation?: string; speedWarnings?: number }
  if (manifest.cameraSemanticMapping?.baselineMeters !== 8 || manifest.cameraSemanticMapping.anchorFallback !== 'stage-origin') {
    throw new Error(`expected explicit semantic camera meter mapping, got ${JSON.stringify(manifest.cameraSemanticMapping)}`)
  }
  if (manifest.interpolation !== 'per-mark-easing-with-gait-profiles' || typeof manifest.speedWarnings !== 'number') {
    throw new Error(`expected the package manifest to declare choreography interpolation and diagnostics, got ${JSON.stringify(manifest)}`)
  }
  if (manifest.cameraOptics?.sensors?.join('|') !== 'super-35|full-frame'
    || manifest.cameraOptics.interpolation?.focalLengthMm !== 'per-mark-easing'
    || manifest.cameraOptics.interpolation.focusDistanceMeters !== 'per-mark-easing') {
    throw new Error(`expected the package manifest to declare sensor-aware zoom and rack-focus semantics, got ${JSON.stringify(manifest.cameraOptics)}`)
  }
  const missingAnchorPlan = readXrMotionReferencePlan({
    ...serialized as Record<string, unknown>,
    camera: [{ timeSeconds: 1, anchorId: 'missing-cast', settings: null }],
  }, graphData.nodes)
  if (missingAnchorPlan.camera[0]?.pose.target.join('|') !== '0|0|0') {
    throw new Error('expected a missing semantic camera anchor to fall back to stage origin')
  }
  const samplesFile = first.files.find(file => file.path === 'reference/frame-samples.json')!
  const samples = JSON.parse(samplesFile.text) as Array<{ cast?: unknown[]; camera?: unknown; cameraOptics?: { sensorId?: string; focalLengthMm?: number; focusDistanceMeters?: number; aspectRatio?: string } }>
  if (samples.length !== 51 || !Array.isArray(samples[25]?.cast) || !samples[25]?.camera
    || samples[25]?.cameraOptics?.sensorId !== 'super-35'
    || samples[25]?.cameraOptics?.focalLengthMm !== 60
    || samples[25]?.cameraOptics?.focusDistanceMeters !== 3.6
    || samples[25]?.cameraOptics?.aspectRatio !== '1.85:1') {
    throw new Error(`expected deterministic per-frame camera, optics, and cast samples, got ${JSON.stringify(samples[25])}`)
  }
  if (CAMERA_SENSOR_FORMATS.map(sensor => sensor.id).join('|') !== 'super-16|super-35|full-frame|65mm'
    || Math.abs(resolveCameraVerticalFovDegreesForOptics('full-frame', 50) - 26.991) > 0.01
    || resolveFullFrameEquivalentFocalLengthMm('super-16', 16) !== 46.5) {
    throw new Error('expected the native optics catalog to preserve four real sensor gates and deterministic field-of-view math')
  }
  const blob = xrMotionReferencePackageBlob(first)
  if (blob.type !== 'application/json;charset=utf-8' || !(await blob.text()).endsWith('\n')) {
    throw new Error('expected single native JSON bundle blob with stable trailing newline')
  }
  if (first.source.graphFingerprint !== '941a32b2' || first.packageId !== `kg-xr-${first.source.motionFingerprint}`) {
    throw new Error(`expected separate stable graph and motion package identities, got ${JSON.stringify(first.source)}`)
  }
  if (xrMotionReferencePackageFilename(first) !== `scene-alpha.xr-motion-reference.${first.source.motionFingerprint}.json`) {
    throw new Error(`expected stable filename, got ${xrMotionReferencePackageFilename(first)}`)
  }

  const changedPlan = readXrMotionReferencePlan({ ...serialized as Record<string, unknown>, stageId: 'street-grid' }, graphData.nodes)
  const changed = buildXrMotionReferencePackage({ plan: changedPlan, graphData, documentName: 'Scene Alpha.md' })
  if (changed.source.graphFingerprint !== first.source.graphFingerprint || changed.source.motionFingerprint === first.source.motionFingerprint) {
    throw new Error('expected motion identity to change with choreography while graph identity remains stable')
  }

  assertXrSceneCatalogAndVehiclePlacements()
  hydrateXrMotionReferenceRuntime({ sceneKey: 'library-scene', nodes: [], persistedValue: null })
  setXrMotionReferenceStage('downtown')
  addXrMotionReferenceSubject({ assetId: 'person-adult', label: 'THIEF' })
  addXrMotionReferenceSubject({ assetId: 'furniture-chair', label: 'GETAWAY CHAIR' })
  let libraryPlan = readXrMotionReferenceRuntime().plan
  const mobileSubject = libraryPlan.subjects.find(subject => subject.label === 'THIEF')
  const staticSubject = libraryPlan.subjects.find(subject => subject.label === 'GETAWAY CHAIR')
  if (libraryPlan.stageId !== 'downtown' || !mobileSubject || !staticSubject || !libraryPlan.cast.some(track => track.actorId === mobileSubject.id) || libraryPlan.cast.some(track => track.actorId === staticSubject.id)) {
    throw new Error(`expected mobile library subjects to become markable cast while furniture stays static, got ${JSON.stringify(libraryPlan)}`)
  }
  setXrMotionReferenceCastTransition(mobileSubject.id, 'linear')
  libraryPlan = readXrMotionReferenceRuntime().plan
  const travelingTrack = libraryPlan.cast.find(track => track.actorId === mobileSubject.id)
  if (!travelingTrack || travelingTrack.marks.length !== 2 || travelingTrack.marks[0]?.transition !== 'linear') {
    throw new Error(`expected linear path interpolation to materialize a bounded cast endpoint, got ${JSON.stringify(travelingTrack)}`)
  }
  setXrMotionReferenceCastTransition(mobileSubject.id, 'hold')
  if (readXrMotionReferenceRuntime().plan.cast.find(track => track.actorId === mobileSubject.id)?.marks[0]?.transition !== 'hold') {
    throw new Error('expected hold path interpolation to control the cast track transition')
  }
  setXrMotionReferenceSubjectLabel(mobileSubject.id, 'RUNNER')
  libraryPlan = readXrMotionReferenceRuntime().plan
  if (libraryPlan.subjects.find(subject => subject.id === mobileSubject.id)?.label !== 'RUNNER' || libraryPlan.cast.find(track => track.actorId === mobileSubject.id)?.label !== 'RUNNER') {
    throw new Error('expected subject labels and cast labels to remain synchronized')
  }
  const libraryBundle = buildXrMotionReferencePackage({ plan: libraryPlan, graphData: { ...graphData, nodes: [] }, documentName: 'Downtown chase.md' })
  const subjectFile = libraryBundle.files.find(file => file.path === 'reference/subjects.json')
  const libraryManifest = JSON.parse(libraryBundle.files.find(file => file.path === 'reference/manifest.json')!.text) as { placedSubjects?: number }
  if (!subjectFile || libraryManifest.placedSubjects !== 2 || !libraryBundle.files.find(file => file.path === 'reference/frame-samples.json')?.text.includes('RUNNER')) {
    throw new Error('expected placed and labeled XR subjects in the deterministic export package')
  }
  removeXrMotionReferenceSubject(staticSubject.id)
  if (readXrMotionReferenceRuntime().plan.subjects.length !== 1) throw new Error('expected placed static subjects to be removable')

  assertXrSubjectAssetSwapCrud()

  const stageSource = readSource('features', 'three', 'XrMotionReferenceStage.tsx')
  const runtimeBridgeSource = readSource('features', 'three', 'XrMotionReferenceRuntimeBridge.tsx')
  const appSource = readSource('App.tsx')
  const stagePresetGeometrySource = readSource('features', 'three', 'XrStagePresetGeometry.tsx')
  const emptyWorldSource = readSource('features', 'three', 'XrEmptyWorldStage.tsx')
  const emptyWorldHudSource = readSource('features', 'three', 'XrEmptyWorldHud.tsx')
  const modelSource = readSource('features', 'three', 'xrMotionReferenceModel.ts')
  const packageSource = readSource('features', 'three', 'xrMotionReferencePackage.ts')
  const runtimeSource = readSource('features', 'three', 'xrMotionReferenceRuntime.ts')
  const constrainedMotionEditsSource = readSource('features', 'three', 'xrConstrainedMotionEdits.ts')
  const sceneLibrarySource = readSource('features', 'three', 'xrSceneLibrary.ts')
  const sceneSubjectSource = readSource('features', 'three', 'XrSceneLibrarySubject.tsx')
  const mediaCatalogViewSource = readSource('features', 'command-menu', 'MediaCatalogPanelView.tsx')
  const xrMediaLibrarySource = readSource('features', 'command-menu', 'XrMediaLibraryPanel.tsx')
  const xrMediaInvocationRuntimeSource = readSource('features', 'command-menu', 'xrMediaInvocationRuntime.ts')
  const xrSceneMcpContractSource = readSource('features', 'three', 'xrSceneMcpContract.mjs')
  const xrSceneMcpRuntimeSource = readSource('features', 'three', 'xrSceneMcpRuntime.ts')
  const timelineBottomPanelSource = readSource('features', 'gitgraph', 'TimelineBottomPanelView.tsx')
  const cameraFloatingSource = readSource('features', 'strybldr', 'StrybldrCameraFloatingPanelView.tsx')
  const xrCameraMotionSource = readSource('features', 'three', 'XrCameraMotionSection.tsx')
  const xrTimelineProjectionSource = readSource('features', 'three', 'xrMotionReferenceTimeline.ts')
  const ganttTransportPanelSource = readSource('features', 'gitgraph', 'GanttTimelineTransportPanel.tsx')
  const ganttTransportSurfaceSource = readSource('features', 'gitgraph', 'useGanttTimelineTransportSurfaceModel.ts')
  const ganttTransportRulerSource = readSource('features', 'gitgraph', 'GanttTimelineTransportRuler.tsx')
  const videoSequenceRulerSource = readSource('components', 'timeline', 'VideoSequenceTimelineRuler.tsx')
  const ganttPlaybackControlsSource = readSource('features', 'gitgraph', 'useGanttTimelinePlaybackControls.ts')
  const ganttPlaybackRuntimeSource = readSource('features', 'gitgraph', 'GanttTimelineTransportPlaybackRuntime.tsx')
  const ganttHeaderToolsSource = readSource('features', 'gitgraph', 'GanttTimelineTransportHeaderTools.tsx')
  const xrMotionReferenceGraphStageSource = readSource('features', 'three', 'XrMotionReferenceGraphStage.tsx')
  const threeGraphSource = readSource('lib', 'three', 'ThreeGraph.impl.tsx')
  const canvasViewSelectSource = readSource('components', 'toolbar', 'Canvas2dRendererSelect.tsx')
  const saveSource = readSource('lib', 'graph', 'save.ts')
  for (const marker of [
    'data-kg-xr-timeline-player="1"',
    'data-kg-xr-timeline-transport="reused-gantt-player"',
    'renderClipOverlay={renderXrSceneStageClipOverlay}',
    'if (!args.selected) return null',
    'data-kg-xr-motion-scene-controls="click-appear"',
    'data-kg-xr-motion-scene-control-strip="click-appear"',
    'className="xr-camera-motion-mark-selection-controls xr-camera-motion-mark-selection-controls--lane xr-timeline-scene-stage-control xr-timeline-scene-stage-control--selected"',
    'style={sceneEditorStyle}',
    'data-kg-xr-timeline-control-bar="scene-clip"',
    'data-kg-xr-motion-stage-select="scene-clip"',
    'data-kg-xr-motion-stage-select-lane="scene"',
    'aria-haspopup="listbox"',
    'aria-expanded={sceneStagePickerOpen}',
    'activeStagePreset.label',
    'data-kg-xr-motion-stage-options="scene-clip"',
    'data-kg-xr-motion-stage-option={preset.id}',
    'applySceneClipStage',
    'data-kg-xr-motion-stage-summary="scene-clip"',
    'xr-timeline-scene-stage-summary-chip',
    "XR_MOTION_REFERENCE_STAGE_PRESETS.filter(preset => preset.id !== runtime.plan.stageId).map",
    'data-kg-xr-motion-save="1"',
    'data-kg-xr-motion-export="1"',
    "documentLoaded ? `${objectTargets.length} objects · ${edges} links` : 'World ready'",
    'updateGraphMetadata',
    'downloadBlob',
  ]) {
    if (!xrCameraMotionSource.includes(marker)) throw new Error(`expected consolidated BottomPanel XR motion controls to expose ${marker}`)
  }
  for (const forbidden of ['<PanelSelect', '<option key={preset.id} value={preset.id}>', 'selectedStagePreset', 'SCENE · {', 'xr-timeline-scene-stage-select', 'data-kg-xr-motion-scene-controls="compact"', 'data-kg-xr-motion-scene-controls="expanded"', 'data-kg-xr-motion-scene-control-row=', 'xr-timeline-scene-stage-row']) {
    if (xrCameraMotionSource.includes(forbidden)) throw new Error(`expected consolidated BottomPanel XR motion controls to remove stale stage selector ${forbidden}`)
  }
  for (const marker of ['data-kg-media-3d-toggle="1"', '<XrMediaLibraryPanel', '3D for XR', "if (xrSurfaceActive) setMediaCatalogMode('xr-3d')"]) {
    if (!mediaCatalogViewSource.includes(marker)) throw new Error(`expected FloatingPanel Media to expose ${marker}`)
  }
  for (const marker of ['data-kg-media-xr-environments="1"', 'data-kg-media-xr-subject-library="1"', 'data-kg-media-xr-next-label="1"', 'data-kg-media-xr-assets-mcp=', 'data-kg-media-xr-invocation=', 'data-kg-media-xr-invocation-chip-renderer="shared-markdown-sigil"', 'renderMarkdownSigilInlineText(invocation', 'renderAgenticOsInvocationKeywordChip', 'sourceLink: false', 'UI_INLINE_CHIP_GROUP_CLASSNAME', 'data-kg-media-xr-asset-transition=', 'data-kg-media-xr-subject-transition=', 'buildXrMediaInvocationControlInput(invocation)', 'onInvoke={runInvocation}', 'controlLocalXrScene']) {
    if (!xrMediaLibrarySource.includes(marker)) throw new Error(`expected the native XR Media library to expose ${marker}`)
  }
  if (!xrMediaInvocationRuntimeSource.includes('Object.freeze({ invocation })')) throw new Error('expected XR Media invocation dispatch to carry only the displayed literal')
  for (const marker of ['/xr.stage', '/xr.place', 'transition=']) {
    if (!xrSceneMcpContractSource.includes(marker)) throw new Error(`expected XR MCP invocation grammar to expose ${marker}`)
  }
  for (const marker of ['/xr.animate', '#travel', '#hold']) {
    if (xrSceneMcpContractSource.includes(marker) || xrSceneMcpRuntimeSource.includes(marker)) throw new Error(`expected first-class Animation to retire legacy XR scene token ${marker}`)
  }
  for (const marker of ['inspectLocalXrSceneAssets', 'controlLocalXrScene', 'serializeXrMotionReferencePlan', 'activateXrSceneSurface', 'hydrateCanonicalXrMotionReferenceRuntime']) {
    if (!xrSceneMcpRuntimeSource.includes(marker)) throw new Error(`expected browser-local XR MCP control runtime to expose ${marker}`)
  }
  if (xrSceneMcpRuntimeSource.includes("setFloatingPanelView('camera')")) {
    throw new Error('expected XR scene control to preserve the operator-selected FloatingPanel view')
  }
  if (!runtimeSource.includes('setXrMotionReferenceCastTransition')
    || !constrainedMotionEditsSource.includes('travelMeters')
    || !constrainedMotionEditsSource.includes('resolveXrSubjectMotion({')) {
    throw new Error('expected XR path interpolation controls to own real bounded cast-track motion')
  }
  if (!sceneLibrarySource.includes("id: 'downtown'") || !sceneLibrarySource.includes("id: 'backyard-pool'") || !sceneSubjectSource.includes('kg_xr_scene_subject_') || !packageSource.includes("reference/subjects.json")) {
    throw new Error('expected environment, procedural subject, and package owners to remain source-backed')
  }
  for (const marker of [
    'kg_xr_motion_reference_stage',
    'kg_xr_motion_stage_floor',
    'kg_xr_motion_world_grid',
    'kg_xr_motion_world_origin',
    'kg_xr_motion_cast_tracks',
    'kg_xr_motion_camera_track',
  ]) {
    if (!`${stageSource}\n${stagePresetGeometrySource}`.includes(marker)) throw new Error(`expected native grey-box stage to expose ${marker}`)
  }
  if (stageSource.includes('kg_xr_motion_default_camera')) {
    throw new Error('expected camera marks to be authoritative with no decorative fake default Camera')
  }
  for (const marker of [
    'xrMotionReferenceWorldPosition',
    'position={[0, groundY - floorThickness / 2, 0]}',
    '<boxGeometry args={[floorWidth, floorThickness, floorHeight]}',
    'position={[position[0], position[1] + 0.35, position[2]]}',
    'rotation={[-Math.PI / 2, 0, 0]}',
  ]) {
    if (!`${stageSource}\n${stagePresetGeometrySource}`.includes(marker)) throw new Error(`expected Y-up XR stage orientation to expose ${marker}`)
  }
  if (!sceneSubjectSource.includes('rotation={[0, THREE.MathUtils.degToRad(subject.rotationYDegrees) + facingYRadians, 0]}')
    || !sceneSubjectSource.includes('<group rotation={[-Math.PI / 2, 0, 0]}>')) {
    throw new Error('expected Z-up procedural library geometry to be adapted once beneath a Y-up subject transform')
  }
  if (!timelineBottomPanelSource.includes('XrCameraMotionSection')
    || cameraFloatingSource.includes('<XrCameraMotionSection')
    || !xrCameraMotionSource.includes('<GanttTimelineTransportPanel')
    || !xrCameraMotionSource.includes('clockActive')
    || !xrCameraMotionSource.includes('editable={false}')
    || !xrCameraMotionSource.includes('publishPlaybackRequest={false}')
    || !xrCameraMotionSource.includes('runtimeDocumentKey={xrTransportDocumentKey}')
    || !xrCameraMotionSource.includes('runtimeDurationSeconds={runtime.plan.durationSeconds}')
    || !xrTimelineProjectionSource.includes('buildXrMotionReferenceTimelineCode')
    || !ganttTransportPanelSource.includes('runtimeDurationSeconds')
    || !xrMotionReferenceGraphStageSource.includes('<XrMotionReferenceStage')) {
    throw new Error('expected BottomPanel Timeline to own the canonical XR motion projection while FloatingPanel Camera owns framing and SHOOT')
  }
  if (!ganttTransportSurfaceSource.includes('runtimeOnly: true')
    || !ganttHeaderToolsSource.includes('!args.model.runtimeOnly')
    || !ganttTransportRulerSource.includes('editable={args.model.editable}')
    || !videoSequenceRulerSource.includes("data-kg-timeline-clip-compact={compactTimelineBar ? '1' : undefined}")
    || !videoSequenceRulerSource.includes("data-kg-timeline-clip-select-surface={compactTimelineBar && !thumbnailSamples.length ? '1' : undefined}")
    || !videoSequenceRulerSource.includes("const compactTimelineBar = workflowProjection || compactSourceMedia || !editable")
    || !videoSequenceRulerSource.includes("{editable ? <button type=\"button\" className=\"timeline-transport-track-handle")
    || !ganttPlaybackControlsSource.includes('args.publishPlaybackRequest === false')
    || !ganttPlaybackRuntimeSource.includes('xrBottomTimelineOwnsClock')) {
    throw new Error('expected the reused XR player to retain one clock and the canonical compact read-only bars while isolating media playback requests')
  }
  if (!ganttTransportSurfaceSource.includes('const selectedPreviewEmpty = !!transportSession.selectedSpan && !transportSession.previewPlan')) {
    throw new Error('expected stale cross-document Timeline selection keys to preserve source thumbnail fallback')
  }
  assertXrMotionReferenceStageSurfaceContracts()
  if (!xrCameraMotionSource.includes('const graphData = documentLoaded ? activeGraphData || rawGraphData : null')
    || !xrCameraMotionSource.includes('data-kg-xr-timeline-document-loaded=')) {
    throw new Error('expected the Camera motion projection to reject retained graph data when no document is loaded')
  }
  if (!threeGraphSource.includes("active: active && mode !== 'xr' && !gameplayOverlayActive")
    || !threeGraphSource.includes("sceneGraph: mode === 'xr' || gameplayOverlayActive ? null : sceneGraphForRender")
    || !threeGraphSource.includes("{mode !== 'xr' && !gameplayOverlayActive ? overlayLayer : null}")
    || !threeGraphSource.includes('data-kg-xr-exclusive-stage=')) {
    throw new Error('expected XR graph staging to exclude the standard rich-media overlay projection')
  }
  const sceneSource = readSource('lib', 'three', 'Scene.impl.tsx')
  if (!sceneSource.includes("{mode !== 'xr' ? <group ref={sceneGroupRef}>")
    || !sceneSource.includes("{mode === '3d' && starfieldEnabled")
    || !sceneSource.includes("{mode !== 'xr' && fogColorEffective")) {
    throw new Error('expected XR motion reference to own the graph scene without nodes, edges, starfield, or graph fog interference')
  }
  for (const marker of ['onOpenShared3dPanel', "if (mode === 'xr')", 'resolveXrSurfaceEntryPanelView(current)', 'activateXrSceneSurface({ panelView, openPanel: true, timeline: true })', 'if (!state.floatingPanelOpen)']) {
    if (!canvasViewSelectSource.includes(marker)) throw new Error(`expected 3D/XR Surface Mode to open its canonical panel via ${marker}`)
  }
  const xrSelectionStart = canvasViewSelectSource.indexOf("if (mode === 'xr') {")
  const plain3dSelectionStart = canvasViewSelectSource.indexOf('if (!state.floatingPanelOpen)', xrSelectionStart)
  const xrSelectionBranch = xrSelectionStart >= 0 && plain3dSelectionStart > xrSelectionStart
    ? canvasViewSelectSource.slice(xrSelectionStart, plain3dSelectionStart)
    : ''
  if (/set(?:Canvas|Floating|Bottom|Media)/.test(xrSelectionBranch)) {
    throw new Error('expected XR Surface Mode to delegate without raw surface setter variants')
  }
  if (xrSelectionBranch.includes("state.setFloatingPanelView('camera')")) {
    throw new Error('expected XR Surface Mode to preserve an already-open shared panel instead of forcing Camera')
  }
  if (!runtimeBridgeSource.includes('hydrateXrMotionReferenceRuntime({')
    || !runtimeBridgeSource.includes('xrMotionReferenceSceneKey')
    || !appSource.includes('<XrMotionReferenceRuntimeBridge />')
    || stageSource.includes('hydrateXrMotionReferenceRuntime')) {
    throw new Error('expected one app-root XR choreography hydration owner independent of stage and panel visibility')
  }
  if (!stageSource.includes('Math.hypot(dx, dy, dz)') || !stageSource.includes('setFromUnitVectors')) {
    throw new Error('expected cast and camera paths to preserve vertical Y-up movement in their 3D segment transform')
  }
  if (!stageSource.includes('xrMotionReferenceWorldPosition(mark.pose.target') || !packageSource.includes('point(mark.pose.target)')) {
    throw new Error('expected 3D and SVG camera previews to orient markers toward each captured target')
  }
  if (xrCameraMotionSource.includes('Capture camera') || xrCameraMotionSource.includes('Mark cast @')) {
    throw new Error('expected stale manual camera/cast capture controls to be removed in favor of canonical Camera SHOOT')
  }
  if (!xrCameraMotionSource.includes('disabled={!graphData || !runtime.dirty}')) {
    throw new Error('expected XR plan persistence to fail closed when no graph is available')
  }
  if (!xrCameraMotionSource.includes('savedValue !== serialized') || !xrCameraMotionSource.includes('save-error')) {
    throw new Error('expected XR plan persistence to verify the canonical graph write before clearing dirty state')
  }
  if (!saveSource.includes('export function downloadBlob')) {
    throw new Error('expected package export to retain the shared blob-download owner')
  }

  const proceduralBallSource = readSource('features', 'three', 'XrProceduralBallGeometry.tsx')
  const implementation = [xrCameraMotionSource, xrTimelineProjectionSource, stageSource, stagePresetGeometrySource, emptyWorldSource, emptyWorldHudSource, modelSource, packageSource, runtimeSource, runtimeBridgeSource, sceneLibrarySource, sceneSubjectSource, proceduralBallSource, xrMediaLibrarySource, readSource('features', 'three', 'xrAnimationCatalog.ts'), readSource('features', 'three', 'xrAnimationMcpRuntime.ts'), readSource('features', 'three', 'XrAnimationFloatingPanelView.tsx')].join('\n').toLowerCase()
  for (const forbidden of ['wassermanproductions', 'blockout', 'ffmpeg', 'electron-vite']) {
    if (implementation.includes(forbidden)) {
      throw new Error(`expected clean-room XR implementation to avoid external runtime token ${forbidden}`)
    }
  }
  assertXrTerrainAssetsAreCleanRoom([sceneLibrarySource, sceneSubjectSource, proceduralBallSource])
  const rootPackage = readFileSync(resolve(process.cwd(), '..', 'package.json'), 'utf8').toLowerCase()
  const canvasPackage = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8').toLowerCase()
  if (`${rootPackage}\n${canvasPackage}`.includes('wassermanproductions/blockout')) {
    throw new Error('expected package manifests to forbid external repository dependency')
  }

  hydrateXrMotionReferenceRuntime({ sceneKey: 'test-scene', nodes: graphData.nodes, persistedValue: serialized })
  setXrMotionReferenceStage('street-grid')
  hydrateXrMotionReferenceRuntime({
    sceneKey: 'test-scene',
    nodes: [{ ...graphData.nodes[1]!, label: 'Partner renamed' }],
    persistedValue: null,
  })
  const filteredDraft = readXrMotionReferenceRuntime()
  if (!filteredDraft.dirty || filteredDraft.plan.cast.some(track => track.actorId === 'cast-a')) {
    throw new Error('expected same-scene filtering to retain dirty state while temporarily omitting hidden cast')
  }
  hydrateXrMotionReferenceRuntime({
    sceneKey: 'test-scene',
    nodes: [
      { ...graphData.nodes[1]!, label: 'Partner renamed' },
      { ...graphData.nodes[0]!, label: 'Lead renamed' },
    ],
    persistedValue: null,
  })
  const reconciled = readXrMotionReferenceRuntime()
  const reconciledLead = reconciled.plan.cast.find(track => track.actorId === 'cast-a')
  if (!reconciled.dirty || reconciled.plan.cast[0]?.actorId !== 'cast-b' || reconciledLead?.label !== 'Lead renamed' || reconciledLead.marks.length !== 2) {
    throw new Error('expected a dirty draft to survive graph label/order refresh while reconciling cast identity')
  }

}
