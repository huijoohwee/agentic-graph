import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveVideoSequenceClipEditSnappedMinutes } from '@/components/timeline/videoSequenceClipEdit'
import { shouldSyncTimelineSelectionPlayback } from '@/features/gitgraph/useGanttTimelineSelectionSync'
import { useGraphStore } from '@/hooks/useGraphStore'
import { controlLocalAnimation, inspectLocalAnimation } from '@/features/three/xrAnimationMcpRuntime'
import { hydrateCanonicalXrMotionReferenceRuntime } from '@/features/three/XrMotionReferenceRuntimeBridge'
import { readXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { XR_MOTION_REFERENCE_GRAPH_METADATA_KEY } from '@/features/three/xrMotionReferenceModel'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TimelineTransportControls } from '@/components/timeline/TimelineTransportControls'

const root = process.cwd()

/** Runs with the existing animation fixture, including the mounted document readiness contract. */
export function testXrAnimationFrameTransport() {
  const prior = useGraphStore.getState()
  const command = (args: string) => controlLocalAnimation({ invocation: `/animation.control @canvas ${args}` })
  const near = (actual: number, expected: number) => Math.abs(actual - expected) < 1e-8
  try {
    const markup = renderToStaticMarkup(createElement(TimelineTransportControls, {
      ariaLabel: 'Animation transport', currentLabel: '0', max: 1, value: 0, step: 1 / 1800,
      playbackRate: 0.25, playing: false, onPlaybackRateChange() {}, onTogglePlayback() {}, onValueChange() {},
    }))
    if (!markup.includes('Playback rate 0.25x. Click for 0.5x.') || !markup.includes('>0.25')) {
      throw new Error('quarter-speed Timeline label rounded away the selected rate')
    }
    for (const fps of [12, 24, 30]) {
      const graph = prior.graphData!
      const persisted = graph.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]
      useGraphStore.setState({ graphData: { ...graph, metadata: { ...graph.metadata,
        [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: { ...(persisted as object), fps },
      } } })
      hydrateCanonicalXrMotionReferenceRuntime()
      if (!command('operation=scrub frame=0').ok || !command('operation=play rate=0.25').ok) {
        throw new Error('expected native quarter-speed playback from the first frame')
      }
      const plan = readXrMotionReferenceRuntime().plan
      const authored = JSON.stringify(plan)
      if (plan.fps !== fps) throw new Error('frame transport fixture did not hydrate its authored FPS')
      for (let frame = 1; frame <= 5; frame += 1) {
        const result = command('operation=scrub frame=next')
        const state = useGraphStore.getState()
        const transport = inspectLocalAnimation().runtime.transport
        if (!result.ok || state.timelineTransportPlaying || transport.frame !== frame
          || !near(state.timelineTransportPosition * 60, frame / fps)
          || !near(readXrMotionReferenceRuntime().playheadSeconds, frame / fps)
          || transport.playbackRate !== 0.25) {
          throw new Error(`expected ${fps} fps frame ${frame} to pause and agree with the shared clock`)
        }
      }
      if (!command('operation=scrub frame=previous').ok
        || inspectLocalAnimation().runtime.transport.frame !== 4) throw new Error('expected one frame backward')
      command('operation=scrub frame=0')
      command('operation=scrub frame=previous')
      if (inspectLocalAnimation().runtime.transport.frame !== 0) throw new Error('frame step crossed the start')
      command('operation=scrub frame=999999')
      command('operation=scrub frame=next')
      if (!near(readXrMotionReferenceRuntime().playheadSeconds, plan.durationSeconds)) {
        throw new Error('frame step crossed the authored duration')
      }
      command('operation=scrub frame=0')
      const seek = controlLocalAnimation({ operation: 'scrub', timeSeconds: 1 / fps })
      if (!seek.ok || !near(useGraphStore.getState().timelineTransportPosition * 60, 1 / fps)) {
        throw new Error('structured sub-60ms seek was discarded by the shared store')
      }
      if (JSON.stringify(readXrMotionReferenceRuntime().plan) !== authored) {
        throw new Error('transport must not modify authored timing, motion, or frame rate')
      }
    }
    for (const args of [
      'operation=play rate=0', 'operation=play rate=-1', 'operation=play rate=NaN',
      'operation=play rate=0.3', 'operation=play rate=0.25 rate=2', 'operation=pause rate=0.25',
      'operation=scrub frame=-1', 'operation=scrub frame=0.5', 'operation=scrub frame=Infinity',
      'operation=scrub frame=9007199254740992', 'operation=scrub frame=next time=1',
      'operation=scrub frame=next frame=previous', 'operation=play frame=next',
    ]) {
      const state = useGraphStore.getState()
      if (command(args).ok || useGraphStore.getState() !== state) {
        throw new Error(`invalid transport request mutated the store: ${args}`)
      }
    }
    command('operation=play rate=0.25')
    command('operation=pause')
    command('operation=play')
    if (inspectLocalAnimation().runtime.transport.playbackRate !== 0.25) {
      throw new Error('pause and resume lost the selected playback rate')
    }
    useGraphStore.getState().setTimelineTransportState({ position: 0 })
    useGraphStore.getState().setTimelineTransportState({ position: 1 / 60 / 60 })
    if (!near(useGraphStore.getState().timelineTransportPosition * 60, 1 / 60)) {
      throw new Error('shared transport discarded a 60 fps seek')
    }
    const before = useGraphStore.getState()
    before.setTimelineTransportState({ position: before.timelineTransportPosition })
    if (useGraphStore.getState() !== before) throw new Error('unchanged transport should not publish')
    before.setTimelineTransportState({ documentKey: 'another-document', position: 10, playing: true, playbackRate: 2 })
    const other = inspectLocalAnimation().runtime.transport
    if (other.playing || other.playbackRate !== 1 || other.timeSeconds === 600) {
      throw new Error('animation inspection adopted another document clock')
    }
  } finally {
    useGraphStore.setState(prior, true)
    hydrateCanonicalXrMotionReferenceRuntime()
  }
}

function readSource(...parts: string[]): string {
  return readFileSync(resolve(root, 'src', ...parts), 'utf8')
}

export function testTimelineTransportEditModeStoreContract() {
  const timelineTransportText = readSource('components', 'timeline', 'timelineTransport.ts')
  const uiSliceText = readSource('hooks', 'store', 'uiSliceInitialState.ts')
  const graphStateText = readSource('hooks', 'store', 'store-types', 'graph-state-chat-import.ts')
  const documentActionsText = readSource('features', 'gitgraph', 'useGanttTimelineDocumentActions.ts')
  const headerToolsText = readSource('features', 'gitgraph', 'GanttTimelineTransportHeaderTools.tsx')
  const interactionsText = readSource('features', 'gitgraph', 'useGanttTimelineInteractions.ts')
  const interactionModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportInteractionModel.ts')
  const selectionSyncText = readSource('features', 'gitgraph', 'useGanttTimelineSelectionSync.ts')
  const mermaidControlsCssText = readSource('components', 'timeline', 'TimelineTransportControlsMermaidGantt.css')
  const surfaceModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportSurfaceModel.ts')
  for (const token of [
    'timelineTransportAutoSnappingEnabled: boolean',
    'timelineTransportRippleEditingEnabled: boolean',
    'setTimelineTransportAutoSnappingEnabled: (enabled: boolean) => void',
    'setTimelineTransportRippleEditingEnabled: (enabled: boolean) => void',
    'timelineTransportAutoSnappingEnabled: true',
    'timelineTransportRippleEditingEnabled: false',
    'autoSnappingEnabled: state.timelineTransportAutoSnappingEnabled !== false',
    'rippleEditingEnabled: state.timelineTransportRippleEditingEnabled === true',
    'setTimelineTransportAutoSnappingEnabled: state.setTimelineTransportAutoSnappingEnabled',
    'setTimelineTransportRippleEditingEnabled: state.setTimelineTransportRippleEditingEnabled',
    'setTimelineTransportAutoSnappingEnabled(!autoSnappingEnabled)',
    'setTimelineTransportRippleEditingEnabled(!rippleEditingEnabled)',
    'autoSnappingEnabled: transportCommandModel.chromeModelCommands.autoSnappingEnabled',
    'spans: args.timelineModel.taskSpans',
    'playheadMinutes: args.positionMinutes',
    'playheadMinutes: state.playheadMinutes',
    'playheadMinutes: input.dragState.playheadMinutes',
    'resolveSnappedDragDeltaMinutes',
    'resolveVideoSequenceClipEditSnappedMinutes({',
    'targetDurationMinutes: state.mode === \'move\' ? state.span.durationMinutes : undefined',
    'timelineGrid: { minutesPerPixel: state.minutesPerPixel }',
    'timelineGrid: { minutesPerPixel: input.dragState.minutesPerPixel }',
    'shouldSyncTimelineSelectionPlayback({',
    'data-kg-video-sequence-tool-active={button.active ? \'1\' : undefined}',
    'button[data-kg-video-sequence-clip-edit-active="1"]::after',
  ]) {
    if (!`${timelineTransportText}\n${uiSliceText}\n${graphStateText}\n${documentActionsText}\n${headerToolsText}\n${interactionsText}\n${interactionModelText}\n${selectionSyncText}\n${mermaidControlsCssText}\n${surfaceModelText}`.includes(token)) {
      throw new Error(`expected shared timeline edit mode store token: ${token}`)
    }
  }
  if (documentActionsText.includes('React.useState(true)') || documentActionsText.includes('React.useState(false)')) {
    throw new Error('expected auto snapping and ripple editing to avoid component-local state')
  }
  if (interactionsText.includes('setTransportPlaybackPosition(nextPreview.startMinutes)')) {
    throw new Error('expected drag preview to keep the playhead marker independent from the dragged bar')
  }
  const sameRowRewriteSync = shouldSyncTimelineSelectionPlayback({
    playing: false,
    previousSelectedRowKey: '14:task:Clip A : clip_a, kgpos_0, 1m',
    selectedRowKey: '14:task:Clip A : clip_a, kgpos_2, 1m',
  })
  const differentRowSelectionSync = shouldSyncTimelineSelectionPlayback({
    playing: false,
    previousSelectedRowKey: '14:task:Clip A : clip_a, kgpos_0, 1m',
    selectedRowKey: '15:task:Clip B : clip_b, kgpos_2, 1m',
  })
  if (sameRowRewriteSync || !differentRowSelectionSync) {
    throw new Error(`expected selection playback sync to ignore drag row rewrites only: ${JSON.stringify({ differentRowSelectionSync, sameRowRewriteSync })}`)
  }
}

export function testVideoSequenceAutoSnappingMoveEdges() {
  const selectedSpan = { durationMinutes: 3, endMinutes: 13, label: 'Selected', startMinutes: 10 }
  const spans = [
    { durationMinutes: 5, endMinutes: 5, label: 'Left', startMinutes: 0 },
    selectedSpan,
    { durationMinutes: 4, endMinutes: 20, label: 'Right', startMinutes: 16 },
  ]
  const playheadSnapped = resolveVideoSequenceClipEditSnappedMinutes({
    enabled: true,
    excludedSnapPositions: [selectedSpan.startMinutes, selectedSpan.endMinutes],
    playheadMinutes: 8,
    positionMinutes: 8.08,
    selectedSpan,
    spans,
    targetDurationMinutes: selectedSpan.durationMinutes,
  })
  const endEdgeSnapped = resolveVideoSequenceClipEditSnappedMinutes({
    enabled: true,
    excludedSnapPositions: [selectedSpan.startMinutes, selectedSpan.endMinutes],
    positionMinutes: 12.92,
    selectedSpan,
    spans,
    targetDurationMinutes: selectedSpan.durationMinutes,
  })
  const disabled = resolveVideoSequenceClipEditSnappedMinutes({
    enabled: false,
    playheadMinutes: 8,
    positionMinutes: 8.08,
    selectedSpan,
    spans,
    targetDurationMinutes: selectedSpan.durationMinutes,
  })
  const gridSnapped = resolveVideoSequenceClipEditSnappedMinutes({
    enabled: true,
    excludedSnapPositions: [selectedSpan.startMinutes, selectedSpan.endMinutes],
    playheadMinutes: 8,
    positionMinutes: 8.13,
    selectedSpan,
    spans,
    targetDurationMinutes: selectedSpan.durationMinutes,
    timelineGrid: { minutesPerPixel: 0.01 },
  })
  if (playheadSnapped !== 8 || endEdgeSnapped !== 13 || disabled !== 8.08 || gridSnapped !== 8.1) {
    throw new Error(`expected auto snapping to use shared grid snapping, playhead, and both move edges: ${JSON.stringify({ disabled, endEdgeSnapped, gridSnapped, playheadSnapped })}`)
  }
}
