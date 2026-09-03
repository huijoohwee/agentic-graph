import type { GraphData } from '@/lib/graph/types'
import {
  XR_MOTION_REFERENCE_CAMERA_BASELINE_METERS,
  XR_MOTION_REFERENCE_PACKAGE_SCHEMA,
  XR_MOTION_REFERENCE_SCHEMA,
  readXrMotionReferencePlan,
  resolveXrMotionReferenceStage,
  sampleXrMotionReferenceCameraMoveId,
  sampleXrMotionReferenceCameraPose,
  sampleXrMotionReferenceCameraRig,
  sampleXrMotionReferenceCameraSettings,
  sampleXrMotionReferenceMarks,
  serializeXrMotionReferencePlan,
  type XrMotionReferencePackage,
  type XrMotionReferencePackageFile,
  type XrMotionReferencePlan,
  type XrMotionReferenceVector,
} from '@/features/three/xrMotionReferenceModel'
import { resolveXrAnimationPreset, sampleXrAnimationPose } from '@/features/three/xrAnimationCatalog'
import { resolveXrCameraMoveLabel } from './xrCameraMoveCatalog'
import { resolveXrChoreographySpeedWarnings } from './xrChoreographyDiagnostics'
import {
  resolveCameraHorizontalFovDegreesForOptics,
  resolveCameraSensorFormat,
  resolveCameraVerticalFovDegreesForOptics,
  resolveFullFrameEquivalentFocalLengthMm,
} from '@/features/strybldr/cameraOptics'

function round(value: number, places = 4): number {
  const scale = 10 ** places
  return Math.round(value * scale) / scale
}

function hashText(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function graphFingerprint(graphData: GraphData): string {
  const nodes = graphData.nodes.map(node => [node.id, node.label, node.type]).sort((a, b) => a[0].localeCompare(b[0]))
  const edges = graphData.edges.map(edge => [edge.id, edge.source, edge.target, edge.type || '']).sort((a, b) => a[0].localeCompare(b[0]))
  return hashText(JSON.stringify({ type: graphData.type, nodes, edges }))
}

function safeFilenameStem(value: string): string {
  const stem = value.trim().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()
  return stem.slice(0, 56) || 'scene'
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, token => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[token] || token)
}

function buildTopDownSvg(plan: XrMotionReferencePlan): string {
  const stage = resolveXrMotionReferenceStage(plan.stageId)
  const width = 1000
  const height = 700
  const scaleX = width / stage.sizeMeters[0]
  const scaleZ = height / stage.sizeMeters[1]
  const point = (position: XrMotionReferenceVector) => ({
    x: round(width / 2 + position[0] * scaleX, 2),
    y: round(height / 2 + position[2] * scaleZ, 2),
  })
  const structureRows = stage.structures.map(structure => {
    const p = point(structure.position)
    const boxWidth = round(structure.size[0] * scaleX, 2)
    const boxHeight = round(structure.size[2] * scaleZ, 2)
    return `<rect x="${round(p.x - boxWidth / 2, 2)}" y="${round(p.y - boxHeight / 2, 2)}" width="${boxWidth}" height="${boxHeight}" class="${structure.tone}"/>`
  })
  const castRows = plan.cast.flatMap(track => {
    const points = track.marks.map(mark => point(mark.position))
    const path = points.map(item => `${item.x},${item.y}`).join(' ')
    return [
      `<polyline points="${path}" fill="none" stroke="${track.color}" stroke-width="4"/>`,
      ...points.map((item, index) => `<g><circle cx="${item.x}" cy="${item.y}" r="10" fill="${track.color}"/><text x="${item.x + 14}" y="${item.y - 12}">${escapeXml(track.label)} ${index + 1}</text></g>`),
    ]
  })
  const subjectRows = plan.subjects.map(subject => {
    const p = point(subject.position)
    return `<g><rect x="${round(p.x - 9, 2)}" y="${round(p.y - 9, 2)}" width="18" height="18" rx="3" fill="${subject.color}"/><text x="${p.x + 14}" y="${p.y + 5}">${escapeXml(subject.label)}</text></g>`
  })
  const cameraRows = plan.camera.map((mark, index) => {
    const p = point(mark.pose.position)
    const target = point(mark.pose.target)
    const angle = round(Math.atan2(target.y - p.y, target.x - p.x) * 180 / Math.PI, 2)
    return `<g transform="translate(${p.x} ${p.y}) rotate(${angle})"><path d="M 14 0 L -10 10 L -10 -10 Z" class="camera"/></g><text x="${p.x + 14}" y="${p.y}">C${index + 1} ${mark.timeSeconds}s ${escapeXml(mark.rig)}</text>`
  })
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700">',
    '<style>text{font:16px system-ui;fill:#e2e8f0}.light{fill:#64748b}.mid{fill:#475569}.dark{fill:#1e293b}.accent{fill:#0f766e}.camera{fill:#f8fafc}</style>',
    '<rect width="1000" height="700" fill="#0f172a"/>',
    ...structureRows,
    ...subjectRows,
    ...castRows,
    ...cameraRows,
    '</svg>',
    '',
  ].join('\n')
}

function buildGeneratorBrief(plan: XrMotionReferencePlan): string {
  const stage = resolveXrMotionReferenceStage(plan.stageId)
  const warnings = resolveXrChoreographySpeedWarnings(plan)
  const castLines = plan.cast.map(track => {
    const marks = track.marks.map(mark => `${mark.timeSeconds}s (${mark.position.join(', ')}) [easing=${mark.transition}; gait=${mark.gait}]`).join(' → ')
    const animation = track.animation ? `; performance ${resolveXrAnimationPreset(track.animation.presetId).label} [${track.animation.kind}]` : ''
    return `- ${track.label}: ${marks}${animation}`
  })
  const cameraLines = plan.camera.map(mark => {
    const sensor = resolveCameraSensorFormat(mark.settings.sensorId)
    return `- ${mark.timeSeconds}s: ${resolveXrCameraMoveLabel(mark.moveId)}, ${mark.rig} rig, ${mark.easing} easing, ${sensor.label} ${sensor.widthMm}x${sensor.heightMm}mm, ${mark.settings.focalLengthMm}mm, focus ${mark.settings.focusDistanceMeters}m, ${mark.settings.aspectRatio} delivery mask, ${mark.settings.shot}, ${mark.settings.angle}, ${mark.settings.level}; position (${mark.pose.position.join(', ')})`
  })
  const subjectLines = plan.subjects.map(subject => `- ${subject.label} [${subject.category}/${subject.assetId}] at (${subject.position.join(', ')})`)
  return [
    'Use the attached agentic-graph XR data as the motion and spatial reference for one continuous shot.',
    `Stage: ${stage.label}. ${stage.description}`,
    `Duration: ${plan.durationSeconds}s at ${plan.fps} fps.`,
    'Preserve subject identities, mark order, timing, screen direction, and camera path. Treat grey boxes as spatial constraints rather than final art direction.',
    '',
    'Placed subjects and props:',
    ...(subjectLines.length ? subjectLines : ['- No placed library subjects.']),
    '',
    'Cast blocking:',
    ...(castLines.length ? castLines : ['- No cast tracks.']),
    '',
    'Camera choreography:',
    ...(cameraLines.length ? cameraLines : ['- No camera marks; use a locked neutral camera.']),
    '',
    'Speed sanity warnings:',
    ...(warnings.length ? warnings.map(warning => `- ${warning.message}`) : ['- None.']),
    '',
  ].join('\n')
}

function buildMotionSamples(plan: XrMotionReferencePlan): unknown[] {
  const frameCount = Math.floor(plan.durationSeconds * plan.fps) + 1
  return Array.from({ length: frameCount }, (_item, frame) => {
    const timeSeconds = round(Math.min(plan.durationSeconds, frame / plan.fps), 4)
    const cameraSettings = sampleXrMotionReferenceCameraSettings(plan.camera, timeSeconds)
    const cameraSensor = resolveCameraSensorFormat(cameraSettings?.sensorId)
    return {
      frame,
      timeSeconds,
      camera: sampleXrMotionReferenceCameraPose(plan.camera, timeSeconds, plan.cast, plan.subjects),
      cameraMove: sampleXrMotionReferenceCameraMoveId(plan.camera, timeSeconds),
      cameraRig: sampleXrMotionReferenceCameraRig(plan.camera, timeSeconds),
      cameraLensMm: cameraSettings?.focalLengthMm || 50,
      cameraOptics: cameraSettings ? {
        sensorId: cameraSettings.sensorId,
        sensorLabel: cameraSensor.label,
        sensorDimensionsMm: [cameraSensor.widthMm, cameraSensor.heightMm],
        focalLengthMm: cameraSettings.focalLengthMm,
        fullFrameEquivalentFocalLengthMm: resolveFullFrameEquivalentFocalLengthMm(cameraSettings.sensorId, cameraSettings.focalLengthMm),
        focusDistanceMeters: cameraSettings.focusDistanceMeters,
        aspectRatio: cameraSettings.aspectRatio,
        horizontalFovDegrees: round(resolveCameraHorizontalFovDegreesForOptics(cameraSettings.sensorId, cameraSettings.focalLengthMm), 3),
        verticalFovDegrees: round(resolveCameraVerticalFovDegreesForOptics(cameraSettings.sensorId, cameraSettings.focalLengthMm), 3),
      } : null,
      cast: plan.cast.map(track => ({ actorId: track.actorId, position: sampleXrMotionReferenceMarks(track.marks, timeSeconds), animation: track.animation, pose: sampleXrAnimationPose(track.animation, timeSeconds) })),
      subjects: plan.subjects.map(subject => {
        const track = plan.cast.find(candidate => candidate.actorId === subject.id)
        return { id: subject.id, assetId: subject.assetId, label: subject.label, position: track ? sampleXrMotionReferenceMarks(track.marks, timeSeconds) : subject.position, animation: track?.animation || null, pose: sampleXrAnimationPose(track?.animation || null, timeSeconds) }
      }),
    }
  })
}

function jsonFile(path: string, value: unknown): XrMotionReferencePackageFile {
  return Object.freeze({ path, mimeType: 'application/json', text: `${JSON.stringify(value, null, 2)}\n` })
}

export function buildXrMotionReferencePackage(args: { plan: XrMotionReferencePlan; graphData: GraphData; documentName: string }): XrMotionReferencePackage {
  const plan = readXrMotionReferencePlan(serializeXrMotionReferencePlan(args.plan), args.graphData.nodes)
  const stage = resolveXrMotionReferenceStage(plan.stageId)
  const fingerprint = graphFingerprint(args.graphData)
  const motionFingerprint = hashText(JSON.stringify({ graphFingerprint: fingerprint, plan: serializeXrMotionReferencePlan(plan) }))
  const title = safeFilenameStem(args.documentName)
  const timeline = Object.freeze({ durationSeconds: plan.durationSeconds, fps: plan.fps, frameCount: Math.floor(plan.durationSeconds * plan.fps) + 1 })
  const referenceBoundary = Object.freeze({ implementation: 'native-agentic-graph' as const, inspirationCitation: 'documentation-only' as const, copyPolicy: 'no-external-code-assets-or-schemas' as const, dependencyPolicy: 'no-external-runtime' as const, runtimeDependency: false as const })
  const speedWarnings = resolveXrChoreographySpeedWarnings(plan)
  const manifest = {
    schema: XR_MOTION_REFERENCE_SCHEMA,
    stage: { id: stage.id, label: stage.label, sizeMeters: stage.sizeMeters },
    timeline,
    castTracks: plan.cast.length,
    placedSubjects: plan.subjects.length,
    cameraMarks: plan.camera.length,
    animationTracks: plan.cast.filter(track => track.animation).length,
    coordinateSystem: 'right-handed-y-up-meters',
    interpolation: 'per-mark-easing-with-gait-profiles',
    speedWarnings: speedWarnings.length,
    graphFingerprint: fingerprint,
    motionFingerprint,
    cameraSemanticMapping: { baselineMeters: XR_MOTION_REFERENCE_CAMERA_BASELINE_METERS, anchorFallback: 'stage-origin' },
    cameraRigs: [...new Set(plan.camera.map(mark => mark.rig))],
    cameraMoves: [...new Set(plan.camera.map(mark => mark.moveId).filter(moveId => moveId !== 'custom'))],
    cameraOptics: {
      sensors: [...new Set(plan.camera.map(mark => mark.settings.sensorId))],
      focalLengthsMm: [...new Set(plan.camera.map(mark => mark.settings.focalLengthMm))],
      focusDistancesMeters: [...new Set(plan.camera.map(mark => mark.settings.focusDistanceMeters))],
      aspectMasks: [...new Set(plan.camera.map(mark => mark.settings.aspectRatio))],
      interpolation: { focalLengthMm: 'per-mark-easing', focusDistanceMeters: 'per-mark-easing', sensorId: 'cut-at-mark', aspectRatio: 'cut-at-mark' },
    },
    referenceBoundary,
  }
  const files = Object.freeze([
    jsonFile('reference/manifest.json', manifest),
    jsonFile('reference/subjects.json', plan.subjects),
    jsonFile('reference/cast-tracks.json', plan.cast),
    jsonFile('reference/camera-track.json', plan.camera),
    jsonFile('reference/choreography-diagnostics.json', speedWarnings),
    jsonFile('reference/frame-samples.json', buildMotionSamples(plan)),
    Object.freeze({ path: 'reference/stage-map.svg', mimeType: 'image/svg+xml', text: buildTopDownSvg(plan) }),
    Object.freeze({ path: 'handoff/video-generator-brief.txt', mimeType: 'text/plain', text: buildGeneratorBrief(plan) }),
    Object.freeze({ path: 'README.txt', mimeType: 'text/plain', text: 'agentic-graph XR motion-reference package\n\nAttach the generator brief and stage map to a video-generation workflow. The frame samples are deterministic, meter-based motion data with sensor-aware field of view, zoom, rack-focus distance, and aspect-mask metadata; grey-box structures define spatial constraints, not final visual styling.\n' }),
  ])
  return Object.freeze({
    schema: XR_MOTION_REFERENCE_PACKAGE_SCHEMA,
    packageId: `kg-xr-${motionFingerprint}`,
    title,
    referenceBoundary,
    source: Object.freeze({ documentName: String(args.documentName || 'Untitled'), graphFingerprint: fingerprint, motionFingerprint, graphType: String(args.graphData.type || 'Graph'), nodeCount: args.graphData.nodes.length, edgeCount: args.graphData.edges.length }),
    stage: Object.freeze({ id: stage.id, label: stage.label, sizeMeters: stage.sizeMeters }),
    timeline,
    files,
  })
}

export function xrMotionReferencePackageFilename(bundle: XrMotionReferencePackage): string {
  return `${bundle.title}.xr-motion-reference.${bundle.source.motionFingerprint}.json`
}

export function xrMotionReferencePackageBlob(bundle: XrMotionReferencePackage): Blob {
  return new Blob([`${JSON.stringify(bundle, null, 2)}\n`], { type: 'application/json;charset=utf-8' })
}
