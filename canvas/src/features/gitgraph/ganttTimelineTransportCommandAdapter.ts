import type { VideoSequenceClipEditAction } from '@/components/timeline/videoSequenceClipEdit'
import type { VideoSequenceTimelineToolId } from '@/components/timeline/videoSequenceTimeline'
import type { MediaDragPayload } from '@/lib/ui/mediaDragPayload'
import type { MermaidGanttBarDragMode } from '@/lib/mermaid/mermaidGanttBarInteraction'

export const GANTT_TIMELINE_TRANSPORT_COMMAND_SCHEMA = 'agenticgraph.gantt-timeline-transport-command/v1' as const

export type GanttTimelineDocumentClipEditAction = Exclude<
  VideoSequenceClipEditAction,
  'toggle-auto-snapping' | 'toggle-ripple-editing'
>

export type GanttTimelineTransportCommandTarget = Readonly<{
  documentKey: string
  playheadMinutes: number
  selectedRowKey: string | null
}>

type GanttTimelineTransportCommandBase = Readonly<{
  schema: typeof GANTT_TIMELINE_TRANSPORT_COMMAND_SCHEMA
  target: GanttTimelineTransportCommandTarget
}>

export type GanttTimelineTransportCommand =
  | (GanttTimelineTransportCommandBase & Readonly<{
      action: GanttTimelineDocumentClipEditAction
      kind: 'clip-edit'
    }>)
  | (GanttTimelineTransportCommandBase & Readonly<{
      displayLaneDelta: number
      effectiveDeltaMinutes: number
      kind: 'drag-edit'
      mode: MermaidGanttBarDragMode
      sourceEndMinutes: number
      sourceStartMinutes: number
    }>)
  | (GanttTimelineTransportCommandBase & Readonly<{
      kind: 'media-drop'
      media: Readonly<MediaDragPayload>
      positionMinutes: number
    }>)
  | (GanttTimelineTransportCommandBase & Readonly<{
      kind: 'tool'
      toolId: VideoSequenceTimelineToolId
    }>)

export type GanttTimelineTransportCommandAdapterDecision =
  | Readonly<{ status: 'handled' }>
  | Readonly<{ reason: string; status: 'rejected' }>
  | Readonly<{ status: 'unhandled' }>

export type GanttTimelineTransportCommandAdapter = Readonly<{
  handleCommand: (command: GanttTimelineTransportCommand) => GanttTimelineTransportCommandAdapterDecision
}>

export type GanttTimelineTransportCommandRouteResult<T> =
  | Readonly<{ owner: 'external'; status: 'handled' }>
  | Readonly<{ owner: 'external'; reason: string; status: 'rejected' }>
  | Readonly<{ owner: 'markdown'; status: 'handled'; value: T }>

const INVALID_ADAPTER_DECISION_REASON = 'Timeline command adapter returned an invalid decision.'

export function isGanttTimelineDocumentClipEditAction(
  action: VideoSequenceClipEditAction,
): action is GanttTimelineDocumentClipEditAction {
  return action !== 'toggle-auto-snapping' && action !== 'toggle-ripple-editing'
}

const readAdapterErrorReason = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return 'Timeline command adapter failed.'
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

const normalizeAdapterDecision = (value: unknown): GanttTimelineTransportCommandAdapterDecision | null => {
  if (!isPlainRecord(value) || typeof value.status !== 'string') return null
  if (value.status === 'handled' || value.status === 'unhandled') {
    return hasExactKeys(value, ['status']) ? Object.freeze({ status: value.status }) : null
  }
  if (value.status !== 'rejected' || !hasExactKeys(value, ['reason', 'status'])) return null
  const reason = typeof value.reason === 'string' ? value.reason.trim() : ''
  return reason ? Object.freeze({ reason, status: 'rejected' }) : null
}

const snapshotCommandTarget = (
  target: GanttTimelineTransportCommandTarget,
): GanttTimelineTransportCommandTarget => Object.freeze({
  documentKey: target.documentKey,
  playheadMinutes: target.playheadMinutes,
  selectedRowKey: target.selectedRowKey,
})

const snapshotMedia = (media: Readonly<MediaDragPayload>): Readonly<MediaDragPayload> => {
  const xrScene = media.xrScene
    ? Object.freeze({
        schema: media.xrScene.schema,
        entityKind: media.xrScene.entityKind,
        entityId: media.xrScene.entityId,
        label: media.xrScene.label,
        ...(media.xrScene.subjectLabel === undefined ? {} : { subjectLabel: media.xrScene.subjectLabel }),
        ...(media.xrScene.description === undefined ? {} : { description: media.xrScene.description }),
        ...(media.xrScene.category === undefined ? {} : { category: media.xrScene.category }),
        ...(media.xrScene.transition === undefined ? {} : { transition: media.xrScene.transition }),
      })
    : undefined
  return Object.freeze({
    kind: media.kind,
    url: media.url,
    label: media.label,
    ...(media.byteSize === undefined ? {} : { byteSize: media.byteSize }),
    ...(media.displayHeight === undefined ? {} : { displayHeight: media.displayHeight }),
    ...(media.displayWidth === undefined ? {} : { displayWidth: media.displayWidth }),
    ...(media.durationSeconds === undefined ? {} : { durationSeconds: media.durationSeconds }),
    ...(media.frameRate === undefined ? {} : { frameRate: media.frameRate }),
    ...(media.mimeHint === undefined ? {} : { mimeHint: media.mimeHint }),
    ...(media.thumbnailUrl === undefined ? {} : { thumbnailUrl: media.thumbnailUrl }),
    ...(media.sourceKey === undefined ? {} : { sourceKey: media.sourceKey }),
    ...(xrScene === undefined ? {} : { xrScene }),
  })
}

const snapshotCommand = (command: GanttTimelineTransportCommand): GanttTimelineTransportCommand => {
  const target = snapshotCommandTarget(command.target)
  if (command.kind === 'clip-edit') {
    return Object.freeze({ action: command.action, kind: command.kind, schema: command.schema, target })
  }
  if (command.kind === 'drag-edit') {
    return Object.freeze({
      displayLaneDelta: command.displayLaneDelta,
      effectiveDeltaMinutes: command.effectiveDeltaMinutes,
      kind: command.kind,
      mode: command.mode,
      schema: command.schema,
      sourceEndMinutes: command.sourceEndMinutes,
      sourceStartMinutes: command.sourceStartMinutes,
      target,
    })
  }
  if (command.kind === 'media-drop') {
    return Object.freeze({
      kind: command.kind,
      media: snapshotMedia(command.media),
      positionMinutes: command.positionMinutes,
      schema: command.schema,
      target,
    })
  }
  return Object.freeze({
    kind: command.kind,
    schema: command.schema,
    target,
    toolId: command.toolId,
  })
}

export function routeGanttTimelineTransportCommand<T>(args: {
  adapter?: GanttTimelineTransportCommandAdapter
  command: GanttTimelineTransportCommand
  markdownFallback: () => T
}): GanttTimelineTransportCommandRouteResult<T> {
  if (!args.adapter) {
    return {
      owner: 'markdown',
      status: 'handled',
      value: args.markdownFallback(),
    }
  }

  let decision: GanttTimelineTransportCommandAdapterDecision | null
  try {
    decision = normalizeAdapterDecision(args.adapter.handleCommand(snapshotCommand(args.command)))
  } catch (error) {
    return {
      owner: 'external',
      reason: readAdapterErrorReason(error),
      status: 'rejected',
    }
  }
  if (!decision) {
    return {
      owner: 'external',
      reason: INVALID_ADAPTER_DECISION_REASON,
      status: 'rejected',
    }
  }

  if (decision.status === 'unhandled') {
    return {
      owner: 'markdown',
      status: 'handled',
      value: args.markdownFallback(),
    }
  }
  if (decision.status === 'handled') {
    return {
      owner: 'external',
      status: 'handled',
    }
  }
  return {
    owner: 'external',
    reason: decision.reason,
    status: 'rejected',
  }
}

export function routeGanttTimelineTransportClipEdit<T>(args: {
  action: VideoSequenceClipEditAction
  adapter?: GanttTimelineTransportCommandAdapter
  markdownFallback: () => T
  target: GanttTimelineTransportCommandTarget
}): GanttTimelineTransportCommandRouteResult<T> {
  if (!isGanttTimelineDocumentClipEditAction(args.action)) {
    return {
      owner: 'markdown',
      status: 'handled',
      value: args.markdownFallback(),
    }
  }
  return routeGanttTimelineTransportCommand({
    adapter: args.adapter,
    command: {
      action: args.action,
      kind: 'clip-edit',
      schema: GANTT_TIMELINE_TRANSPORT_COMMAND_SCHEMA,
      target: args.target,
    },
    markdownFallback: args.markdownFallback,
  })
}
