import { existsSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { buildTimelineAnimationState } from '@/components/timeline/timelineAnimationEngine'
import { buildVideoSequenceExportPlan } from '@/components/timeline/videoSequenceExport'
import { resolveVideoSequenceTimelineLane } from '@/components/timeline/videoSequenceTimeline'

const root = process.cwd()

function readSource(...parts: string[]): string {
  return readFileSync(resolve(root, 'src', ...parts), 'utf8')
}

function countSvgPathLineSegments(path: string): number {
  return path.match(/\bL/g)?.length || 0
}

export function testTimelineAnimationNativeRuntimeIsSourceBacked() {
  const animationEngineText = readSource('components', 'timeline', 'timelineAnimationEngine.ts')
  const sequenceText = readSource('components', 'timeline', 'videoSequenceTimeline.ts')
  const rulerText = readSource('components', 'timeline', 'VideoSequenceTimelineRuler.tsx')
  const rulerCssText = readSource('components', 'timeline', 'VideoSequenceTimelineRuler.css')
  const motionState = buildTimelineAnimationState({
    active: true,
    itemCount: 4,
    progress: 0.5,
    surface: 'bottom-timeline',
  })
  if (
    motionState.attributes['data-kg-animation-snapping'] !== 'frame playhead clip-boundary work-area' ||
    motionState.attributes['data-kg-animation-clip-settings'] !== 'drag trim extend batch-move' ||
    motionState.attributes['data-kg-animation-recording-mode'] !== 'playhead-auto-key' ||
    motionState.attributes['data-kg-animation-work-area'] !== `0-${motionState.workArea.end}` ||
    motionState.clip.draggable !== true ||
    motionState.clip.trimEnabled !== true ||
    motionState.clip.batchMoveEnabled !== true ||
    motionState.keyframes.length !== 3 ||
    motionState.keyframes.some(keyframe => keyframe.offset < 0 || keyframe.offset > 1) ||
    motionState.modifiers.join(' ') !== 'stroke-trim follow-path' ||
    motionState.loopModes.join(' ') !== 'once loop ping-pong' ||
    motionState.propertyTokens !== 'position scale rotation opacity blur shadow corner-radius stroke fill' ||
    motionState.recording.enabled !== true ||
    motionState.recording.playhead !== 0.5 ||
    motionState.workArea.start !== 0 ||
    motionState.workArea.end <= 0 ||
    motionState.workArea.end > 1
  ) {
    throw new Error(`expected native timeline animation state to expose snapping, keyframes, modifiers, clips, work area, and recording mode, got ${JSON.stringify(motionState)}`)
  }
  const fbfWorkflow = String(motionState.attributes['data-kg-animation-fbf-workflow'] || '')
  const layerPanel = String(motionState.attributes['data-kg-animation-layer-panel'] || '')
  const layerModes = String(motionState.attributes['data-kg-animation-layer-modes'] || '')
  const onionSkinFrames = Number(motionState.attributes['data-kg-animation-onion-skin-frames'])
  const fbfSpan = {
    label: 'cel onion skin frame-by-frame',
    raw: 'cel onion skin frame-by-frame : validation_fbf, 00:00, 1m',
  } as Parameters<typeof resolveVideoSequenceTimelineLane>[0]
  const detachedSpan = {
    label: 'persistent background detached UI chrome',
    raw: 'persistent background detached UI chrome : validation_detached, 00:00, 1m',
  } as Parameters<typeof resolveVideoSequenceTimelineLane>[0]
  const nestedTimelineInFbfSpan = {
    label: 'timeline inside frame-by-frame',
    raw: 'timeline inside frame-by-frame composite : validation_nested_a, 00:00, 1m',
  } as Parameters<typeof resolveVideoSequenceTimelineLane>[0]
  const nestedFbfInTimelineSpan = {
    label: 'frame-by-frame inside timeline',
    raw: 'frame-by-frame inside timeline composite : validation_nested_b, 00:00, 1m',
  } as Parameters<typeof resolveVideoSequenceTimelineLane>[0]
  const morphShapeSpan = {
    label: 'ellipse polygon star boolean union subtract intersect exclude',
    raw: 'ellipse polygon star boolean union subtract intersect exclude : validation_morph, 00:00, 1m',
  } as Parameters<typeof resolveVideoSequenceTimelineLane>[0]
  const textMotionSpan = {
    label: 'per-character per-segment full-node font size color letter spacing line height',
    raw: 'per-character per-segment full-node font size color letter spacing line height : validation_text, 00:00, 1m',
  } as Parameters<typeof resolveVideoSequenceTimelineLane>[0]
  if (
    fbfWorkflow !== 'cel onion-skin scrub per-frame-timing' ||
    motionState.frameByFrame.frameRate !== 12 ||
    motionState.frameByFrame.frameDurationMs !== 83 ||
    motionState.frameByFrame.timing !== '83ms' ||
    motionState.frameByFrame.activeFrame !== 12 ||
    motionState.frameByFrame.frameCount !== 24 ||
    motionState.frameByFrame.onionSkinFrames !== 2 ||
    onionSkinFrames !== 2 ||
    layerPanel !== 'drag-sort unified-context-menu inline-rename-f2 smart-grouping' ||
    layerModes !== 'animated-frame detached-continuous' ||
    motionState.layerPanel.dragSort !== true ||
    motionState.layerPanel.contextMenu !== 'unified' ||
    motionState.layerPanel.inlineRenameKey !== 'F2' ||
    motionState.layerPanel.grouping !== 'smart' ||
    motionState.layerPanel.layerModes.join(' ') !== 'animated-frame detached-continuous' ||
    resolveVideoSequenceTimelineLane(fbfSpan) !== 'fbf' ||
    resolveVideoSequenceTimelineLane(detachedSpan) !== 'detached' ||
    resolveVideoSequenceTimelineLane(nestedTimelineInFbfSpan) !== 'nested' ||
    resolveVideoSequenceTimelineLane(nestedFbfInTimelineSpan) !== 'nested' ||
    resolveVideoSequenceTimelineLane(morphShapeSpan) !== 'morph' ||
    resolveVideoSequenceTimelineLane(textMotionSpan) !== 'text'
  ) {
    throw new Error(`expected native frame-by-frame state to expose cel onion-skin workflow, independent timing, drag-sort layers, and detached layers, got ${JSON.stringify(motionState.frameByFrame)} ${JSON.stringify(motionState.layerPanel)}`)
  }
  if (
    motionState.attributes['data-kg-animation-nested'] !== 'timeline-in-fbf fbf-in-timeline' ||
    motionState.attributes['data-kg-animation-nested-fps'] !== 'timeline:24 fbf:12' ||
    motionState.attributes['data-kg-animation-nested-render-passes'] !== 'detached-continuous fbf-frame child-timeline parent-timeline' ||
    motionState.attributes['data-kg-animation-nested-composite'] !== 'detached-continuous -> fbf-frame -> child-timeline -> parent-timeline' ||
    motionState.nested.enabled !== true ||
    motionState.nested.timelineFrameRate !== 24 ||
    motionState.nested.timelineFrameDurationMs !== 42 ||
    motionState.nested.fbfFrameRate !== 12 ||
    motionState.nested.fbfFrameDurationMs !== 83 ||
    motionState.nested.fbfFrame !== motionState.frameByFrame.activeFrame ||
    motionState.nested.modes.join(' ') !== 'timeline-in-fbf fbf-in-timeline' ||
    motionState.nested.renderPasses.join(' ') !== 'detached-continuous fbf-frame child-timeline parent-timeline'
  ) {
    throw new Error(`expected native nested animation to expose independent FPS and deterministic composite passes, got ${JSON.stringify(motionState.nested)}`)
  }
  if (
    motionState.attributes['data-kg-animation-vector-morph'] !== motionState.vectorMorph.amount ||
    motionState.attributes['data-kg-animation-vector-morph-boolean-ops'] !== 'union subtract intersect exclude' ||
    motionState.attributes['data-kg-animation-vector-morph-from'] !== 'rectangle' ||
    motionState.attributes['data-kg-animation-vector-morph-to'] !== 'star' ||
    motionState.attributes['data-kg-animation-vector-morph-shapes'] !== 'vector rectangle ellipse polygon star' ||
    motionState.attributes['data-kg-animation-vector-morph-interpolated-path'] !== motionState.vectorMorph.interpolatedPath ||
    motionState.vectorMorph.amount !== 0.5 ||
    motionState.vectorMorph.booleanOperations.join(' ') !== 'union subtract intersect exclude' ||
    motionState.vectorMorph.shapeFamilies.join(' ') !== 'vector rectangle ellipse polygon star' ||
    motionState.vectorMorph.sourcePath === motionState.vectorMorph.interpolatedPath ||
    motionState.vectorMorph.targetPath === motionState.vectorMorph.interpolatedPath ||
    !/^M[-\d.]+ [-\d.]+ L/.test(motionState.vectorMorph.interpolatedPath) ||
    !motionState.vectorMorph.interpolatedPath.endsWith(' Z') ||
    countSvgPathLineSegments(motionState.vectorMorph.sourcePath) !== countSvgPathLineSegments(motionState.vectorMorph.interpolatedPath) ||
    countSvgPathLineSegments(motionState.vectorMorph.targetPath) !== countSvgPathLineSegments(motionState.vectorMorph.interpolatedPath)
  ) {
    throw new Error(`expected native vector morphing to expose real compatible SVG path interpolation and boolean operation tokens, got ${JSON.stringify(motionState.vectorMorph)}`)
  }
  if (
    motionState.attributes['data-kg-animation-text-keyframes'] !== 3 ||
    motionState.attributes['data-kg-animation-text-scopes'] !== 'character segment node' ||
    motionState.attributes['data-kg-animation-text-properties'] !== 'font-size color letter-spacing line-height' ||
    motionState.attributes['data-kg-animation-text-range'] !== `0-${motionState.text.rangeEnd}` ||
    motionState.attributes['data-kg-animation-text-color'] !== motionState.text.color ||
    motionState.attributes['data-kg-animation-text-font-size'] !== motionState.text.fontSize ||
    motionState.attributes['data-kg-animation-text-letter-spacing'] !== motionState.text.letterSpacing ||
    motionState.attributes['data-kg-animation-text-line-height'] !== motionState.text.lineHeight ||
    motionState.text.scopes.join(' ') !== 'character segment node' ||
    motionState.text.properties.join(' ') !== 'font-size color letter-spacing line-height' ||
    motionState.text.keyframes.length !== 3 ||
    motionState.text.keyframes.map(keyframe => keyframe.scope).join(' ') !== 'character segment node' ||
    motionState.text.keyframes.some(keyframe => keyframe.rangeStart < 0 || keyframe.rangeEnd > 100 || keyframe.rangeStart >= keyframe.rangeEnd) ||
    motionState.text.keyframes.some(keyframe => !keyframe.color || keyframe.fontSize <= 0 || keyframe.letterSpacing < 0 || keyframe.lineHeight <= 0) ||
    motionState.text.keyframes[0]?.rangeEnd !== 20 ||
    motionState.text.keyframes[1]?.rangeStart !== 12 ||
    motionState.text.keyframes[2]?.rangeStart !== 0 ||
    motionState.text.keyframes[2]?.rangeEnd !== 100
  ) {
    throw new Error(`expected native text animation to expose per-character, per-segment, and full-node keyframes with typography properties, got ${JSON.stringify(motionState.text)}`)
  }
  const validationMediaPath = String(process.env.AGENTICGRAPH_TIMELINE_VALIDATION_MEDIA || '').trim()
  if (!validationMediaPath) return
  const changedSources = [animationEngineText, sequenceText, rulerText, rulerCssText].join('\n')
  if (changedSources.includes(validationMediaPath)) {
    throw new Error('expected local timeline validation media path to stay out of repo source')
  }
  if (!existsSync(validationMediaPath)) {
    throw new Error(`expected env-provided timeline validation media to exist: ${validationMediaPath}`)
  }
  const validationMediaName = basename(validationMediaPath)
  const validationPlan = buildVideoSequenceExportPlan({
    code: [
      'gantt',
      '  title Timeline Validation',
      '  section Video',
      `  ${validationMediaName} : validation_clip, 00:00, 1m`,
      '  section Keyframe',
      `  ${validationMediaName} keyframe : validation_clip_keyframe, 00:00, 1m`,
      '  section Modifier',
      `  ${validationMediaName} modifier : validation_clip_modifier, 00:00, 1m`,
      '  section Record',
      `  ${validationMediaName} record : validation_clip_record, 00:00, 1m`,
      '  section Frame-by-Frame',
      `  ${validationMediaName} cel onion skin : validation_clip_fbf, 00:00, 1m`,
      '  section Detached',
      `  ${validationMediaName} persistent background : validation_clip_detached, 00:00, 1m`,
      '  section Nested',
      `  ${validationMediaName} timeline inside frame-by-frame : validation_clip_nested, 00:00, 1m`,
      '  section Vector Morph',
      `  ${validationMediaName} rectangle ellipse polygon star union subtract intersect exclude : validation_clip_morph, 00:00, 1m`,
      '  section Text Animation',
      `  ${validationMediaName} character segment node font size color letter spacing line height : validation_clip_text, 00:00, 1m`,
    ].join('\n'),
    filenameHint: validationMediaName,
    sources: [{
      byteSize: null,
      durationSeconds: 0,
      frameRate: 0,
      id: 'validation_media',
      importMode: 'file',
      mimeHint: 'video/mp4',
      originalName: validationMediaName,
      relativePath: '',
      sourceUrl: '',
      workspacePath: validationMediaPath,
    }],
  })
  if (
    !validationPlan ||
    validationPlan.segments.length !== 1 ||
    !validationPlan.filenameBase ||
    validationPlan.segments[0]?.source.workspacePath !== validationMediaPath
  ) {
    throw new Error(`expected env-provided validation media to build a source-backed timeline plan, got ${JSON.stringify(validationPlan)}`)
  }
}
