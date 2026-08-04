import type { VideoSequenceExportPlan } from './timelinePlanSync'

export type VideoSequenceExportKind = 'video' | 'audio'
export type VideoSequenceExportProgressPhase = 'preparing' | 'rendering' | 'finalizing'
export type VideoSequenceExportErrorCode =
  | 'aborted'
  | 'capability-audio-context'
  | 'capability-canvas-capture'
  | 'capability-canvas-export'
  | 'capability-media-recorder'
  | 'plan-empty'
  | 'plan-non-renderable'
  | 'runtime-failed'
  | 'source-load-failed'
  | 'source-unavailable'
export type VideoSequenceExportOutcomeStatus = 'cancelled' | 'downloaded' | 'failed'

export type VideoSequenceExportProgress = {
  completedSegments: number
  kind: VideoSequenceExportKind
  label: string
  percentage: number
  phase: VideoSequenceExportProgressPhase
  totalSegments: number
}

export type VideoSequenceExportDownloadResult = {
  byteSize: number
  filename: string
  kind: VideoSequenceExportKind
  mimeType: string
}

export type VideoSequenceExportOutcome = {
  errorCode: VideoSequenceExportErrorCode | ''
  filename: string
  kind: VideoSequenceExportKind
  message: string
  status: VideoSequenceExportOutcomeStatus
  toastKind: 'error' | 'neutral' | 'success'
}

export type VideoSequenceExportSessionStatus = 'running' | VideoSequenceExportOutcomeStatus

export type VideoSequenceExportSessionRecord = {
  completedSegments: number
  errorCode: VideoSequenceExportErrorCode | ''
  filename: string
  filenameBase: string
  kind: VideoSequenceExportKind
  message: string
  percentage: number
  phase: VideoSequenceExportProgressPhase | ''
  retryOfRunId: string
  runId: string
  startedAtMs: number
  status: VideoSequenceExportSessionStatus
  toastKind: 'error' | 'neutral' | 'success'
  totalSegments: number
  updatedAtMs: number
}

export type VideoSequenceExportRetryRequest = {
  kind: VideoSequenceExportKind
  plan: VideoSequenceExportPlan
  retryOfRunId: string
}

export type VideoSequenceExportRetryControl = {
  ariaLabel: string
  disabled: boolean
  kind: VideoSequenceExportKind | ''
  title: string
}

export type VideoSequenceExportSessionSurfaceItem = {
  attemptCount: number
  detailLabel: string
  groupRunId: string
  kind: VideoSequenceExportKind
  message: string
  retryButtonLabel: string
  retryButtonTitle: string
  retryable: boolean
  runId: string
  styleMode: 'active' | 'muted' | 'solid'
  styleTone: 'danger' | 'neutral' | 'success'
  status: VideoSequenceExportSessionStatus
  tone: 'error' | 'neutral' | 'success'
}

export type VideoSequenceExportSessionSurfaceModel = {
  emptyLabel: string
  items: VideoSequenceExportSessionSurfaceItem[]
}

export type VideoSequenceExportSessionSurfaceSelection = {
  groups: VideoSequenceExportSessionGroup[]
  sessions: VideoSequenceExportSessionRecord[]
}

export type VideoSequenceExportSessionGroup = {
  groupRunId: string
  latestSession: VideoSequenceExportSessionRecord
  representativeSession: VideoSequenceExportSessionRecord
  sessions: VideoSequenceExportSessionRecord[]
}

export type VideoSequenceExportSessionCollection = {
  emptyLabel: string
  groups: VideoSequenceExportSessionGroup[]
  latestRetryableSession: VideoSequenceExportSessionRecord | null
  plan: VideoSequenceExportPlan | null
  retryControl: VideoSequenceExportRetryControl
  surface: VideoSequenceExportSessionSurfaceModel
  surfaceSessions: VideoSequenceExportSessionRecord[]
}

export type VideoSequenceExportEvent =
  | {
    eventType: 'outcome'
    kind: VideoSequenceExportKind
    message: string
    outcome: VideoSequenceExportOutcome
    status: VideoSequenceExportOutcomeStatus
    toastKind: 'error' | 'neutral' | 'success'
  }
  | {
    eventType: 'progress'
    kind: VideoSequenceExportKind
    message: string
    percentage: number
    phase: VideoSequenceExportProgressPhase
    progress: VideoSequenceExportProgress
  }
