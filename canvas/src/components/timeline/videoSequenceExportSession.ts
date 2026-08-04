import type { VideoSequenceExportPlan } from './timelinePlanSync'
import type {
  VideoSequenceExportDownloadResult,
  VideoSequenceExportErrorCode,
  VideoSequenceExportEvent,
  VideoSequenceExportKind,
  VideoSequenceExportOutcome,
  VideoSequenceExportProgress,
  VideoSequenceExportRetryControl,
  VideoSequenceExportRetryRequest,
  VideoSequenceExportSessionCollection,
  VideoSequenceExportSessionGroup,
  VideoSequenceExportSessionRecord,
  VideoSequenceExportSessionStatus,
  VideoSequenceExportSessionSurfaceItem,
  VideoSequenceExportSessionSurfaceModel,
  VideoSequenceExportSessionSurfaceSelection,
} from './videoSequenceExportTypes'

const VIDEO_SEQUENCE_EXPORT_SESSION_HISTORY_LIMIT = 6
const VIDEO_SEQUENCE_EXPORT_ERROR_MESSAGES: Record<VideoSequenceExportErrorCode, string> = {
  aborted: 'Edited media export cancelled.',
  'capability-audio-context': 'Web Audio export is not available in this browser.',
  'capability-canvas-capture': 'Canvas video capture is not available in this browser.',
  'capability-canvas-export': 'Canvas export is not available in this browser.',
  'capability-media-recorder': 'MediaRecorder export is not available in this browser.',
  'plan-empty': 'Edited media export requires at least one video segment.',
  'plan-non-renderable': 'Edited media export requires at least one positive-duration source range.',
  'runtime-failed': 'Edited media export failed.',
  'source-load-failed': 'Unable to load source media.',
  'source-unavailable': 'Re-import the local source or import a playable URL before export.',
}

const clean = (value: unknown): string => String(value || '').trim()

type VideoSequenceExportError = Error & {
  code?: VideoSequenceExportErrorCode
}

function isVideoSequenceExportErrorCode(value: unknown): value is VideoSequenceExportErrorCode {
  return typeof value === 'string' && value in VIDEO_SEQUENCE_EXPORT_ERROR_MESSAGES
}

export function createVideoSequenceExportError(code: VideoSequenceExportErrorCode, message?: string): Error {
  const error = new Error(message || VIDEO_SEQUENCE_EXPORT_ERROR_MESSAGES[code]) as VideoSequenceExportError
  error.name = 'VideoSequenceExportError'
  error.code = code
  return error
}

export function resolveVideoSequenceExportErrorMessage(code: VideoSequenceExportErrorCode): string {
  return VIDEO_SEQUENCE_EXPORT_ERROR_MESSAGES[code]
}

export function resolveVideoSequenceExportErrorCode(error: unknown): VideoSequenceExportErrorCode | '' {
  if (error instanceof Error) {
    const exportError = error as VideoSequenceExportError
    if (isVideoSequenceExportErrorCode(exportError.code)) return exportError.code
    const message = clean(error.message)
    const matchedEntry = Object.entries(VIDEO_SEQUENCE_EXPORT_ERROR_MESSAGES)
      .find(([, candidate]) => candidate === message)
    if (matchedEntry) return matchedEntry[0] as VideoSequenceExportErrorCode
  }
  return ''
}

export function resolveVideoSequenceExportErrorFeedback(error: unknown): {
  kind: 'error' | 'neutral'
  message: string
} {
  const code = resolveVideoSequenceExportErrorCode(error)
  if (code === 'aborted') {
    return {
      kind: 'neutral',
      message: resolveVideoSequenceExportErrorMessage(code),
    }
  }
  if (code) {
    return {
      kind: 'error',
      message: resolveVideoSequenceExportErrorMessage(code),
    }
  }
  return {
    kind: 'error',
    message: clean(error instanceof Error ? error.message : '') || resolveVideoSequenceExportErrorMessage('runtime-failed'),
  }
}

export function resolveVideoSequenceExportOutcome(args: {
  error?: unknown
  kind: VideoSequenceExportKind
  result?: VideoSequenceExportDownloadResult | null
}): VideoSequenceExportOutcome {
  if (args.result) {
    return {
      errorCode: '',
      filename: args.result.filename,
      kind: args.kind,
      message: `Downloaded ${args.result.filename}`,
      status: 'downloaded',
      toastKind: 'success',
    }
  }
  const code = resolveVideoSequenceExportErrorCode(args.error)
  const feedback = resolveVideoSequenceExportErrorFeedback(args.error)
  return {
    errorCode: code,
    filename: '',
    kind: args.kind,
    message: feedback.message,
    status: code === 'aborted' ? 'cancelled' : 'failed',
    toastKind: feedback.kind === 'neutral' ? 'neutral' : 'error',
  }
}

export function resolveVideoSequenceExportEvent(args: {
  outcome?: VideoSequenceExportOutcome | null
  progress?: VideoSequenceExportProgress | null
}): VideoSequenceExportEvent {
  if (args.progress) {
    return {
      eventType: 'progress',
      kind: args.progress.kind,
      message: args.progress.label,
      percentage: args.progress.percentage,
      phase: args.progress.phase,
      progress: args.progress,
    }
  }
  const outcome = args.outcome || resolveVideoSequenceExportOutcome({
    error: new Error(resolveVideoSequenceExportErrorMessage('runtime-failed')),
    kind: 'video',
  })
  return {
    eventType: 'outcome',
    kind: outcome.kind,
    message: outcome.message,
    outcome,
    status: outcome.status,
    toastKind: outcome.toastKind,
  }
}

export function buildVideoSequenceExportProgress(args: {
  completedSegments: number
  kind: VideoSequenceExportKind
  phase: VideoSequenceExportProgress['phase']
  totalSegments: number
}): VideoSequenceExportProgress {
  const target = args.kind === 'audio' ? 'audio' : 'video'
  const totalSegments = Math.max(0, Math.floor(args.totalSegments || 0))
  const normalizedTotalSegments = Math.max(1, totalSegments)
  const completedSegments = Math.max(0, Math.min(totalSegments || normalizedTotalSegments, Math.floor(args.completedSegments || 0)))
  if (args.phase === 'preparing') {
    return {
      completedSegments,
      kind: args.kind,
      phase: 'preparing',
      percentage: 8,
      label: `Preparing edited ${target}...`,
      totalSegments,
    }
  }
  if (args.phase === 'finalizing') {
    return {
      completedSegments,
      kind: args.kind,
      phase: 'finalizing',
      percentage: 98,
      label: `Finalizing edited ${target}...`,
      totalSegments,
    }
  }
  const percentage = Math.max(15, Math.min(95, Math.round(15 + (completedSegments / normalizedTotalSegments) * 80)))
  return {
    completedSegments,
    kind: args.kind,
    phase: 'rendering',
    percentage,
    label: `Rendering edited ${target} (${completedSegments}/${totalSegments || normalizedTotalSegments} segments, ${percentage}%)...`,
    totalSegments,
  }
}

export function resolveVideoSequenceExportPlanError(plan: VideoSequenceExportPlan | null | undefined): string {
  if (!plan?.segments.length) return resolveVideoSequenceExportErrorMessage('plan-empty')
  const hasRenderableSegment = plan.segments.some(segment =>
    segment.durationMinutes > 0
    && segment.timelineEndMinutes > segment.timelineStartMinutes
    && segment.sourceEndRatio > segment.sourceStartRatio,
  )
  if (!hasRenderableSegment) return resolveVideoSequenceExportErrorMessage('plan-non-renderable')
  return ''
}

export function createVideoSequenceExportSessionRecord(args: {
  filenameBase: string
  kind: VideoSequenceExportKind
  nowMs?: number
  retryOfRunId?: string
  runId?: string
  totalSegments: number
}): VideoSequenceExportSessionRecord {
  const startedAtMs = Math.max(0, Math.floor(args.nowMs ?? Date.now()))
  const progress = buildVideoSequenceExportProgress({
    completedSegments: 0,
    kind: args.kind,
    phase: 'preparing',
    totalSegments: args.totalSegments,
  })
  const filenameBase = clean(args.filenameBase) || 'edited-media'
  return {
    completedSegments: progress.completedSegments,
    errorCode: '',
    filename: '',
    filenameBase,
    kind: args.kind,
    message: progress.label,
    percentage: progress.percentage,
    phase: progress.phase,
    retryOfRunId: clean(args.retryOfRunId),
    runId: args.runId || `${args.kind}:${filenameBase}:${startedAtMs}`,
    startedAtMs,
    status: 'running',
    toastKind: 'neutral',
    totalSegments: progress.totalSegments,
    updatedAtMs: startedAtMs,
  }
}

export function reduceVideoSequenceExportSessionRecord(args: {
  event: VideoSequenceExportEvent
  nowMs?: number
  session: VideoSequenceExportSessionRecord
}): VideoSequenceExportSessionRecord {
  const updatedAtMs = Math.max(args.session.startedAtMs, Math.floor(args.nowMs ?? Date.now()))
  if (args.event.eventType === 'progress') {
    return {
      ...args.session,
      completedSegments: args.event.progress.completedSegments,
      kind: args.event.kind,
      message: args.event.message,
      percentage: args.event.percentage,
      phase: args.event.phase,
      status: 'running',
      toastKind: 'neutral',
      totalSegments: args.event.progress.totalSegments,
      updatedAtMs,
    }
  }
  return {
    ...args.session,
    errorCode: args.event.outcome.errorCode,
    filename: args.event.outcome.filename,
    kind: args.event.kind,
    message: args.event.message,
    percentage: args.session.status === 'running' ? 100 : args.session.percentage,
    phase: args.session.phase,
    status: args.event.status,
    toastKind: args.event.toastKind,
    updatedAtMs,
  }
}

export function upsertVideoSequenceExportSessionHistory(args: {
  history: readonly VideoSequenceExportSessionRecord[]
  limit?: number
  nextSession: VideoSequenceExportSessionRecord
}): VideoSequenceExportSessionRecord[] {
  const limit = Math.max(1, Math.floor(args.limit ?? VIDEO_SEQUENCE_EXPORT_SESSION_HISTORY_LIMIT))
  const withoutCurrent = args.history.filter(session => session.runId !== args.nextSession.runId)
  return [args.nextSession, ...withoutCurrent].slice(0, limit)
}

export function resolveVideoSequenceExportRetryError(args: {
  exportingKind?: VideoSequenceExportKind | ''
  plan: VideoSequenceExportPlan | null | undefined
  session: VideoSequenceExportSessionRecord | null | undefined
}): string {
  if (args.exportingKind) return 'Wait for the current edited media export to finish before retrying.'
  if (!args.session) return 'Edited media export retry requires a previous export session.'
  if (args.session.status === 'running') return 'Wait for the current edited media export to finish before retrying.'
  if (!args.plan) return 'Edited media export retry requires a current export plan.'
  const planError = resolveVideoSequenceExportPlanError(args.plan)
  if (planError) return planError
  if (clean(args.plan.filenameBase) !== clean(args.session.filenameBase)) {
    return 'Edited media export retry requires the same compiled export plan as the previous run.'
  }
  return ''
}

export function resolveVideoSequenceExportRetryRequest(args: {
  exportingKind?: VideoSequenceExportKind | ''
  plan: VideoSequenceExportPlan | null | undefined
  session: VideoSequenceExportSessionRecord | null | undefined
}): {
  error: string
  request: VideoSequenceExportRetryRequest | null
} {
  const error = resolveVideoSequenceExportRetryError(args)
  if (error || !args.plan || !args.session) {
    return { error, request: null }
  }
  return {
    error: '',
    request: {
      kind: args.session.kind,
      plan: args.plan,
      retryOfRunId: args.session.runId,
    },
  }
}

export function resolveVideoSequenceExportRetryControl(
  session: VideoSequenceExportSessionRecord | null | undefined,
): VideoSequenceExportRetryControl {
  if (!session) {
    return {
      ariaLabel: 'Retry latest edited media export',
      disabled: true,
      kind: '',
      title: 'Retry latest edited media export',
    }
  }
  const target = session.kind === 'audio' ? 'audio' : 'video'
  return {
    ariaLabel: `Retry edited ${target} export`,
    disabled: false,
    kind: session.kind,
    title: `Retry edited ${target} export`,
  }
}

function resolveVideoSequenceExportSessionKindLabel(kind: VideoSequenceExportKind): string {
  return kind === 'audio' ? 'Edited audio' : 'Edited video'
}

function resolveVideoSequenceExportSessionStatusLabel(status: VideoSequenceExportSessionStatus): string {
  if (status === 'running') return 'Running'
  if (status === 'downloaded') return 'Downloaded'
  if (status === 'cancelled') return 'Cancelled'
  return 'Failed'
}

export function resolveVideoSequenceExportSessionToneStyle(args: {
  status: VideoSequenceExportSessionStatus
  tone: VideoSequenceExportSessionRecord['toastKind']
}): {
  styleMode: VideoSequenceExportSessionSurfaceItem['styleMode']
  styleTone: VideoSequenceExportSessionSurfaceItem['styleTone']
} {
  if (args.status === 'running') return { styleMode: 'active', styleTone: 'neutral' }
  if (args.status === 'cancelled') return { styleMode: 'muted', styleTone: 'neutral' }
  if (args.tone === 'success') return { styleMode: 'solid', styleTone: 'success' }
  return { styleMode: 'solid', styleTone: 'danger' }
}

function sortVideoSequenceExportSessions(
  left: VideoSequenceExportSessionRecord,
  right: VideoSequenceExportSessionRecord,
): number {
  if (left.status === 'running' && right.status !== 'running') return -1
  if (right.status === 'running' && left.status !== 'running') return 1
  if (left.updatedAtMs !== right.updatedAtMs) return right.updatedAtMs - left.updatedAtMs
  return right.startedAtMs - left.startedAtMs
}

function resolveVideoSequenceExportSessionGroupRunId(args: {
  session: VideoSequenceExportSessionRecord
  sessionsByRunId: ReadonlyMap<string, VideoSequenceExportSessionRecord>
}): string {
  let current = args.session
  const visited = new Set<string>()
  while (current.retryOfRunId) {
    if (visited.has(current.runId)) break
    visited.add(current.runId)
    const parent = args.sessionsByRunId.get(current.retryOfRunId)
    if (!parent) break
    current = parent
  }
  return current.runId
}

export function groupVideoSequenceExportSessions(
  sessions: readonly VideoSequenceExportSessionRecord[],
): VideoSequenceExportSessionGroup[] {
  const sessionsByRunId = new Map(sessions.map(session => [session.runId, session]))
  const groupedSessions = new Map<string, VideoSequenceExportSessionRecord[]>()
  for (const session of sessions) {
    const groupRunId = resolveVideoSequenceExportSessionGroupRunId({ session, sessionsByRunId })
    const existingSessions = groupedSessions.get(groupRunId)
    if (existingSessions) {
      existingSessions.push(session)
      continue
    }
    groupedSessions.set(groupRunId, [session])
  }
  return [...groupedSessions.entries()]
    .map(([groupRunId, groupSessions]) => {
      const sessionsSorted = [...groupSessions].sort(sortVideoSequenceExportSessions)
      const representativeSession = sessionsSorted.find(session => session.status === 'running') || sessionsSorted[0]
      return {
        groupRunId,
        latestSession: sessionsSorted[0],
        representativeSession,
        sessions: sessionsSorted,
      }
    })
    .sort((left, right) => sortVideoSequenceExportSessions(left.representativeSession, right.representativeSession))
}

export function selectVideoSequenceExportSessionSurfaceSessions(args: {
  includeStatuses?: readonly VideoSequenceExportSessionStatus[]
  latestRetryableRunId?: string
  maxItems?: number
  sessions: readonly VideoSequenceExportSessionRecord[]
}): VideoSequenceExportSessionSurfaceSelection {
  const maxItems = Math.max(1, Math.floor(args.maxItems ?? 3))
  const allowedStatuses = new Set((args.includeStatuses || []).filter(Boolean))
  const hasStatusFilter = allowedStatuses.size > 0
  const latestRetryableRunId = clean(args.latestRetryableRunId)
  const groups = groupVideoSequenceExportSessions(args.sessions)
    .map(group => {
      if (!hasStatusFilter) return group
      const filteredSessions = group.sessions.filter(session => allowedStatuses.has(session.status))
      if (!filteredSessions.length) return null
      return {
        ...group,
        latestSession: filteredSessions[0],
        representativeSession: filteredSessions.find(session => session.status === 'running') || filteredSessions[0],
        sessions: filteredSessions,
      }
    })
    .filter(Boolean) as VideoSequenceExportSessionGroup[]
  const prioritized = [...groups].sort((left, right) => {
    const leftRetryable = latestRetryableRunId !== '' && left.representativeSession.runId === latestRetryableRunId
    const rightRetryable = latestRetryableRunId !== '' && right.representativeSession.runId === latestRetryableRunId
    if (leftRetryable !== rightRetryable) return leftRetryable ? -1 : 1
    return sortVideoSequenceExportSessions(left.representativeSession, right.representativeSession)
  })
  return {
    groups: prioritized.slice(0, maxItems),
    sessions: prioritized.slice(0, maxItems).map(group => group.representativeSession),
  }
}

export function buildVideoSequenceExportSessionCollection(args: {
  exportingKind?: VideoSequenceExportKind | ''
  includeStatuses?: readonly VideoSequenceExportSessionStatus[]
  maxItems?: number
  plan: VideoSequenceExportPlan | null | undefined
  sessions: readonly VideoSequenceExportSessionRecord[]
}): VideoSequenceExportSessionCollection {
  const groups = groupVideoSequenceExportSessions(args.sessions)
  const latestRetryableSession = groups
    .map(group => group.representativeSession)
    .find(session => resolveVideoSequenceExportRetryRequest({
      exportingKind: args.exportingKind,
      plan: args.plan,
      session,
    }).request) || null
  const surface = buildVideoSequenceExportSessionSurfaceModel({
    includeStatuses: args.includeStatuses,
    latestRetryableRunId: latestRetryableSession?.runId,
    maxItems: args.maxItems,
    sessions: args.sessions,
  })
  const surfaceSelection = selectVideoSequenceExportSessionSurfaceSessions({
    includeStatuses: args.includeStatuses,
    latestRetryableRunId: latestRetryableSession?.runId,
    maxItems: args.maxItems,
    sessions: args.sessions,
  })
  return {
    emptyLabel: surface.emptyLabel,
    groups,
    latestRetryableSession,
    plan: args.plan || null,
    retryControl: resolveVideoSequenceExportRetryControl(latestRetryableSession),
    surface,
    surfaceSessions: surfaceSelection.sessions,
  }
}

export function buildVideoSequenceExportSessionSurfaceModel(args: {
  includeStatuses?: readonly VideoSequenceExportSessionStatus[]
  latestRetryableRunId?: string
  maxItems?: number
  sessions: readonly VideoSequenceExportSessionRecord[]
}): VideoSequenceExportSessionSurfaceModel {
  const selection = selectVideoSequenceExportSessionSurfaceSessions(args)
  return {
    emptyLabel: 'No recent edited media exports.',
    items: selection.groups.map(group => {
      const session = group.representativeSession
      const kindLabel = resolveVideoSequenceExportSessionKindLabel(session.kind)
      const statusLabel = resolveVideoSequenceExportSessionStatusLabel(session.status)
      const retryable = clean(args.latestRetryableRunId) !== '' && session.runId === args.latestRetryableRunId
      const toneStyle = resolveVideoSequenceExportSessionToneStyle({
        status: session.status,
        tone: session.toastKind,
      })
      return {
        attemptCount: group.sessions.length,
        detailLabel: `${kindLabel} • ${statusLabel}`,
        groupRunId: group.groupRunId,
        kind: session.kind,
        message: session.message,
        retryButtonLabel: retryable ? `Retry ${kindLabel.toLowerCase()}` : 'Retry unavailable',
        retryButtonTitle: retryable ? `Retry ${kindLabel.toLowerCase()}` : 'Retry unavailable',
        retryable,
        runId: session.runId,
        styleMode: toneStyle.styleMode,
        styleTone: toneStyle.styleTone,
        status: session.status,
        tone: session.toastKind,
      }
    }),
  }
}
