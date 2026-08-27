import type { AgenticCommerceMainPanelReadiness } from 'grph-shared/payments/agenticCommerceSsot'

export type LocalMainPanelSurfaceSnapshot = {
  activeTab: string
  activeTabLabel: string
  searchable: boolean
  searchOpen: boolean
  searchVisible: boolean
  searchQuery: string
  searchPlaceholder: string | null
  footerLabel: string | null
  traversalChip: {
    modeLabel: string
    edgesLabel: string
    nodesLabel: string | null
  } | null
  sharedActions: {
    hasApply: boolean
    hasReset: boolean
    hasGlobalReset: boolean
    hasCollapseAll: boolean
    hasExpandAll: boolean
    allCollapsed: boolean
  } | null
}

export type LocalEditorWorkspaceSurfaceSnapshot = {
  activeDocumentKey: string
  workspaceViewMode: string
  workspaceCanvasPaneOpen: boolean
  workspaceEditorOverlayOpen: boolean
  layoutMode: string
  viewerKind: string
  viewerMode: string
  isMarkdown: boolean
  isJsonMarkdownEditing: boolean
  paneVisibility: {
    markdown: boolean
    json: boolean
    viewer: boolean
    html: boolean
    binary: boolean
  }
  splitPaneVisibility: {
    markdown: boolean
    json: boolean
    viewer: boolean
    html: boolean
    bin: boolean
  }
  liveMarkdownText: string
  persistedMarkdownText: string
  hasUncommittedDraft: boolean
  liveDraftSource: 'viewer-inline' | 'json-derived' | 'persisted'
}

export type LocalSettingsChatReadinessSurfaceSnapshot = {
  normalizedChatProvider: string
  chatEndpointUrl: string
  chatModel: string
  chatAuthMode: string
  chatContextScope: string
  integrationProviderIds?: string[]
  integrationProviderLabels?: string[]
  integrationEnabled: boolean
  integrationOpenTab: string
  isRefreshingChatModels: boolean
  chatModelsStatus: string | null
  discoveredChatModelCount: number
  suggestedChatModelCount: number
}

export type LocalChatPipelineKgcValidationSnapshot = {
  stage: 'idle' | 'retrying' | 'validated' | 'failed'
  attempt: number
  maxAttempts: number
  failedRuleId: string | null
  failedMessage: string | null
  correctionPromptPreview: string | null
  hasStructuredKgc: boolean
  hasStructuredResponseSurface: boolean
  hasYamlFrontmatter: boolean
  validatedKgcLength: number
}

export type LocalChatPipelineFinalizeSnapshot = {
  stage: 'idle' | 'persisted' | 'applied' | 'skipped' | 'error'
  traceId: string | null
  modelId: string | null
  finalStatus: 'ok' | 'error' | null
  persistedAgenticGraphPath: string | null
  applied: boolean | null
  message: string | null
  failureNote: string | null
  retryHint: string | null
  retryCommand: string | null
}

export type LocalChatPipelineSurfaceSnapshot = {
  messageCount: number
  isLoading: boolean
  errorText: string | null
  connectivity: 'unknown' | 'ok' | 'error'
  connectivityDetail: string | null
  chatProviderSummary: string
  chatProviderHint: string | null
  chatContextScope: string
  chatStorageTarget: string
  chatAgenticGraphWorkspacePath: string | null
  chatHistoryWorkspacePath: string | null
  chatAgenticGraphCloudUrl?: string | null
  chatHistoryCloudUrl?: string | null
  workspaceViewMode: string
  editorWorkspacePane: string
  markdownDocumentName: string | null
  selectedNodeId: string | null
  streamingAssistant: {
    id: string
    text: string
    reasoningPreview?: string | null
    reasoningStepCount?: number
    usageSummary?: string | null
    finishReason?: string | null
    modelId?: string | null
  } | null
  streamingInsights?: {
    reasoningPreview: string
    reasoningStepCount: number
    usageSummary: string
    finishReason: string
    modelId: string
  } | null
  streamingWorkspacePath: string | null
  streamFollowPath: string | null
  streamDraft: {
    path: string
    text: string
  } | null
  kgcValidation?: LocalChatPipelineKgcValidationSnapshot
  finalize?: LocalChatPipelineFinalizeSnapshot
}

export type LocalCommerceReadinessSurfaceSnapshot = AgenticCommerceMainPanelReadiness

type TimestampedSnapshot<TSnapshot> = TSnapshot & {
  updatedAtMs: number
}

type BrowserLocalSurfaceSnapshots = {
  mainPanel: TimestampedSnapshot<LocalMainPanelSurfaceSnapshot> | null
  commerceReadiness: TimestampedSnapshot<LocalCommerceReadinessSurfaceSnapshot> | null
  editorWorkspace: TimestampedSnapshot<LocalEditorWorkspaceSurfaceSnapshot> | null
  settingsChatReadiness: TimestampedSnapshot<LocalSettingsChatReadinessSurfaceSnapshot> | null
  chatPipeline: TimestampedSnapshot<LocalChatPipelineSurfaceSnapshot> | null
}

const DEFAULT_LOCAL_CHAT_PIPELINE_KGC_VALIDATION_SNAPSHOT: LocalChatPipelineKgcValidationSnapshot = Object.freeze({
  stage: 'idle',
  attempt: 0,
  maxAttempts: 0,
  failedRuleId: null,
  failedMessage: null,
  correctionPromptPreview: null,
  hasStructuredKgc: false,
  hasStructuredResponseSurface: false,
  hasYamlFrontmatter: false,
  validatedKgcLength: 0,
})

const DEFAULT_LOCAL_CHAT_PIPELINE_FINALIZE_SNAPSHOT: LocalChatPipelineFinalizeSnapshot = Object.freeze({
  stage: 'idle',
  traceId: null,
  modelId: null,
  finalStatus: null,
  persistedAgenticGraphPath: null,
  applied: null,
  message: null,
  failureNote: null,
  retryHint: null,
  retryCommand: null,
})

const cloneLocalChatPipelineKgcValidationSnapshot = (
  value?: LocalChatPipelineKgcValidationSnapshot,
): LocalChatPipelineKgcValidationSnapshot => ({
  ...(value || DEFAULT_LOCAL_CHAT_PIPELINE_KGC_VALIDATION_SNAPSHOT),
})

const cloneLocalChatPipelineFinalizeSnapshot = (
  value?: LocalChatPipelineFinalizeSnapshot,
): LocalChatPipelineFinalizeSnapshot => ({
  ...(value || DEFAULT_LOCAL_CHAT_PIPELINE_FINALIZE_SNAPSHOT),
})

const resolveLocalChatPipelineSnapshot = (
  value: LocalChatPipelineSurfaceSnapshot,
  current: TimestampedSnapshot<LocalChatPipelineSurfaceSnapshot> | null,
): LocalChatPipelineSurfaceSnapshot => ({
  ...value,
  kgcValidation: cloneLocalChatPipelineKgcValidationSnapshot(value.kgcValidation || current?.kgcValidation),
  finalize: cloneLocalChatPipelineFinalizeSnapshot(value.finalize || current?.finalize),
})

const browserLocalSurfaceSnapshots: BrowserLocalSurfaceSnapshots = {
  mainPanel: null,
  commerceReadiness: null,
  editorWorkspace: null,
  settingsChatReadiness: null,
  chatPipeline: null,
}

const cloneSnapshot = <TSnapshot>(value: TSnapshot | null): TSnapshot | null => {
  if (!value) return null
  return JSON.parse(JSON.stringify(value)) as TSnapshot
}

const withTimestamp = <TSnapshot>(value: TSnapshot): TimestampedSnapshot<TSnapshot> => ({
  ...value,
  updatedAtMs: Date.now(),
})

export const publishLocalMainPanelSurfaceSnapshot = (value: LocalMainPanelSurfaceSnapshot): void => {
  browserLocalSurfaceSnapshots.mainPanel = withTimestamp(value)
}

export const clearLocalMainPanelSurfaceSnapshot = (): void => {
  browserLocalSurfaceSnapshots.mainPanel = null
}

export const readLocalMainPanelSurfaceSnapshot = (): TimestampedSnapshot<LocalMainPanelSurfaceSnapshot> | null =>
  cloneSnapshot(browserLocalSurfaceSnapshots.mainPanel)

export const publishLocalCommerceReadinessSurfaceSnapshot = (value: LocalCommerceReadinessSurfaceSnapshot): void => {
  browserLocalSurfaceSnapshots.commerceReadiness = withTimestamp(value)
}

export const clearLocalCommerceReadinessSurfaceSnapshot = (): void => {
  browserLocalSurfaceSnapshots.commerceReadiness = null
}

export const readLocalCommerceReadinessSurfaceSnapshot = ():
  TimestampedSnapshot<LocalCommerceReadinessSurfaceSnapshot> | null =>
  cloneSnapshot(browserLocalSurfaceSnapshots.commerceReadiness)

export const publishLocalEditorWorkspaceSurfaceSnapshot = (value: LocalEditorWorkspaceSurfaceSnapshot): void => {
  browserLocalSurfaceSnapshots.editorWorkspace = withTimestamp(value)
}

export const clearLocalEditorWorkspaceSurfaceSnapshot = (): void => {
  browserLocalSurfaceSnapshots.editorWorkspace = null
}

export const readLocalEditorWorkspaceSurfaceSnapshot = (): TimestampedSnapshot<LocalEditorWorkspaceSurfaceSnapshot> | null =>
  cloneSnapshot(browserLocalSurfaceSnapshots.editorWorkspace)

export const publishLocalSettingsChatReadinessSurfaceSnapshot = (value: LocalSettingsChatReadinessSurfaceSnapshot): void => {
  browserLocalSurfaceSnapshots.settingsChatReadiness = withTimestamp(value)
}

export const clearLocalSettingsChatReadinessSurfaceSnapshot = (): void => {
  browserLocalSurfaceSnapshots.settingsChatReadiness = null
}

export const readLocalSettingsChatReadinessSurfaceSnapshot = (): TimestampedSnapshot<LocalSettingsChatReadinessSurfaceSnapshot> | null =>
  cloneSnapshot(browserLocalSurfaceSnapshots.settingsChatReadiness)

export const publishLocalChatPipelineSurfaceSnapshot = (value: LocalChatPipelineSurfaceSnapshot): void => {
  browserLocalSurfaceSnapshots.chatPipeline = withTimestamp(
    resolveLocalChatPipelineSnapshot(value, browserLocalSurfaceSnapshots.chatPipeline),
  )
}

export const clearLocalChatPipelineSurfaceSnapshot = (): void => {
  browserLocalSurfaceSnapshots.chatPipeline = null
}

export const readLocalChatPipelineSurfaceSnapshot = (): TimestampedSnapshot<LocalChatPipelineSurfaceSnapshot> | null =>
  cloneSnapshot(browserLocalSurfaceSnapshots.chatPipeline)

export const publishLocalChatPipelineKgcValidationSnapshot = (value: LocalChatPipelineKgcValidationSnapshot): void => {
  const current = browserLocalSurfaceSnapshots.chatPipeline
  if (!current) return
  browserLocalSurfaceSnapshots.chatPipeline = withTimestamp({
    ...current,
    kgcValidation: cloneLocalChatPipelineKgcValidationSnapshot(value),
    finalize: cloneLocalChatPipelineFinalizeSnapshot(current.finalize),
  })
}

export const publishLocalChatPipelineFinalizeSnapshot = (value: LocalChatPipelineFinalizeSnapshot): void => {
  const current = browserLocalSurfaceSnapshots.chatPipeline
  if (!current) return
  browserLocalSurfaceSnapshots.chatPipeline = withTimestamp({
    ...current,
    kgcValidation: cloneLocalChatPipelineKgcValidationSnapshot(current.kgcValidation),
    finalize: cloneLocalChatPipelineFinalizeSnapshot(value),
  })
}

export const resetBrowserLocalSurfaceSnapshotsForTests = (): void => {
  browserLocalSurfaceSnapshots.mainPanel = null
  browserLocalSurfaceSnapshots.commerceReadiness = null
  browserLocalSurfaceSnapshots.editorWorkspace = null
  browserLocalSurfaceSnapshots.settingsChatReadiness = null
  browserLocalSurfaceSnapshots.chatPipeline = null
}
