import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { appendChatHistoryWorkspaceFile } from '@/features/chat/chatHistoryWorkspace'
import { applyChatKgcWorkspaceDocumentToCanvas } from '@/features/chat/chatKgcCanvasApply'
import { normalizeWorkspacePath, workspaceBasename } from '@/features/workspace-fs/path'
import type { Canvas2dRendererId } from '@/lib/config'
import type { DocumentSemanticMode, WorkspaceViewMode } from '@/hooks/store/types'

export type WorkspaceRuntimeCommandState = {
  markdownDocumentName: string | null
  markdownDocumentText: string | null
  canvasRenderMode: '2d' | '3d'
  canvas2dRenderer: Canvas2dRendererId
  documentSemanticMode: DocumentSemanticMode
  frontmatterModeEnabled: boolean
  workspaceViewMode: WorkspaceViewMode
  workspaceCanvasPaneOpen: boolean
}

export type WorkspaceRuntimeCommandApplyDocumentArgs = {
  name: string
  text: string
  sourceUrl?: string | null
  applyToGraph?: boolean
  forceApplyToGraph?: boolean
  applyViewPreset?: boolean
  canvasRenderMode?: '2d' | '3d'
  canvas2dRenderer?: Canvas2dRendererId
  documentSemanticMode?: DocumentSemanticMode
  frontmatterModeEnabled?: boolean
  workspaceViewMode?: WorkspaceViewMode
  workspaceCanvasPaneOpen?: boolean
}

export type WorkspaceRuntimeCommandApplyAssistantResponseArgs = {
  assistantText: string
  requestText?: string | null
  requestedPath?: string | null
  timestampMs?: number | null
  traceId?: string | null
  providerSummary?: string | null
  defaultLocalRootPath?: string | null
  workspaceViewMode?: WorkspaceViewMode
  workspaceCanvasPaneOpen?: boolean
}

export type WorkspaceRuntimeCommand = {
  readState: () => WorkspaceRuntimeCommandState
  applyMarkdownDocument: (args: WorkspaceRuntimeCommandApplyDocumentArgs) => Promise<WorkspaceRuntimeCommandState & { applied: boolean }>
  applyChatAssistantResponse: (args: WorkspaceRuntimeCommandApplyAssistantResponseArgs) => Promise<WorkspaceRuntimeCommandState & { applied: boolean; workspacePath: string | null }>
}

export const WORKSPACE_RUNTIME_COMMAND_EVENT = 'agenticgraph-workspace-command'
export const WORKSPACE_RUNTIME_COMMAND_RESULT_EVENT = 'agenticgraph-workspace-command-result'
const WORKSPACE_RUNTIME_COMMAND_DATASET_KEY = 'kgWorkspaceRuntimeCommand'
const WORKSPACE_RUNTIME_COMMAND_RESULT_DATASET_KEY = 'kgWorkspaceRuntimeCommandLastResult'

const readWorkspaceRuntimeCommandState = (): WorkspaceRuntimeCommandState => {
  const state = useGraphStore.getState()
  return {
    markdownDocumentName: typeof state.markdownDocumentName === 'string' && state.markdownDocumentName.trim() ? state.markdownDocumentName : null,
    markdownDocumentText: typeof state.markdownDocumentText === 'string' ? state.markdownDocumentText : null,
    canvasRenderMode: state.canvasRenderMode === '3d' ? '3d' : '2d',
    canvas2dRenderer: state.canvas2dRenderer,
    documentSemanticMode: state.documentSemanticMode === 'keyword' ? 'keyword' : 'document',
    frontmatterModeEnabled: state.frontmatterModeEnabled === true,
    workspaceViewMode: state.workspaceViewMode === 'editor' ? 'editor' : 'canvas',
    workspaceCanvasPaneOpen: state.workspaceCanvasPaneOpen === true,
  }
}

const isDocumentSemanticMode = (value: unknown): value is DocumentSemanticMode => value === 'document' || value === 'keyword'
const isWorkspaceViewMode = (value: unknown): value is WorkspaceViewMode => value === 'canvas' || value === 'editor'
const isCanvasRenderMode = (value: unknown): value is '2d' | '3d' => value === '2d' || value === '3d'

const readOptionalString = (value: unknown): string => String(value || '').trim()

const readTimestampMs = (value: unknown): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return numeric > 0 ? numeric : Date.now()
}

const waitForRuntimeCommandStateSettle = async (workspacePath: string): Promise<void> => {
  const basename = workspaceBasename(normalizeWorkspacePath(workspacePath))
  if (!basename) return
  for (let i = 0; i < 30; i += 1) {
    const state = useGraphStore.getState()
    const name = String(state.markdownDocumentName || '')
    const text = String(state.markdownDocumentText || '')
    if (name.includes(basename) || text.includes(basename)) return
    await new Promise<void>(resolve => setTimeout(resolve, 100))
  }
}

const waitForRuntimeCommandZoomSettle = async (): Promise<void> => {
  for (let i = 0; i < 40; i += 1) {
    const state = useGraphStore.getState()
    if (!state.zoomRequest) return
    await new Promise<void>(resolve => setTimeout(resolve, 50))
  }
}

const applyRuntimeViewOptions = (
  state: ReturnType<typeof useGraphStore.getState>,
  args: {
    canvasRenderMode?: unknown
    canvas2dRenderer?: Canvas2dRendererId
    documentSemanticMode?: unknown
    frontmatterModeEnabled?: unknown
    workspaceViewMode?: unknown
    workspaceCanvasPaneOpen?: unknown
  },
): void => {
  if (isWorkspaceViewMode(args?.workspaceViewMode)) {
    state.setWorkspaceViewMode(args.workspaceViewMode)
  }
  if (typeof args?.workspaceCanvasPaneOpen === 'boolean') {
    state.setWorkspaceCanvasPaneOpen(args.workspaceCanvasPaneOpen)
  }
  const nextCanvasRenderMode = args?.canvasRenderMode
  if (isCanvasRenderMode(nextCanvasRenderMode)) {
    state.setCanvasRenderMode(nextCanvasRenderMode)
  }
  const nextCanvas2dRenderer = args?.canvas2dRenderer
  if (nextCanvas2dRenderer) {
    state.setCanvas2dRenderer(nextCanvas2dRenderer)
  }
  const nextDocumentSemanticMode = args?.documentSemanticMode
  if (isDocumentSemanticMode(nextDocumentSemanticMode)) {
    state.setDocumentSemanticMode(nextDocumentSemanticMode)
  }
  if (typeof args?.frontmatterModeEnabled === 'boolean') {
    state.setFrontmatterModeEnabled(args.frontmatterModeEnabled)
  }
}

const writeWorkspaceRuntimeCommandDataset = (value: string): void => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset[WORKSPACE_RUNTIME_COMMAND_DATASET_KEY] = value
}

const writeWorkspaceRuntimeCommandResult = (value: unknown): void => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset[WORKSPACE_RUNTIME_COMMAND_RESULT_DATASET_KEY] = JSON.stringify(value)
}

export const publishWorkspaceRuntimeCommandResult = (value: unknown): void => {
  writeWorkspaceRuntimeCommandResult(value)
}

export const summarizeWorkspaceRuntimeCommandResult = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  const markdownText = typeof record.markdownDocumentText === 'string' ? record.markdownDocumentText : ''
  return {
    applied: record.applied === true,
    workspacePath: typeof record.workspacePath === 'string' ? record.workspacePath : null,
    markdownDocumentName: typeof record.markdownDocumentName === 'string' ? record.markdownDocumentName : null,
    markdownDocumentTextLength: markdownText.length,
    canvasRenderMode: record.canvasRenderMode,
    canvas2dRenderer: record.canvas2dRenderer,
    documentSemanticMode: record.documentSemanticMode,
    frontmatterModeEnabled: record.frontmatterModeEnabled === true,
    workspaceViewMode: record.workspaceViewMode,
    workspaceCanvasPaneOpen: record.workspaceCanvasPaneOpen === true,
  }
}

const installWorkspaceRuntimeCommandEventBridge = (command: WorkspaceRuntimeCommand): (() => void) => {
  if (typeof window === 'undefined') return () => void 0
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent).detail
    const request = detail && typeof detail === 'object' && !Array.isArray(detail)
      ? detail as { id?: unknown; action?: unknown; args?: unknown }
      : {}
    const id = readOptionalString(request.id) || `workspace-command-${Date.now()}`
    const action = readOptionalString(request.action)
    const run = async (): Promise<unknown> => {
      if (action === 'readState') return command.readState()
      if (action === 'applyMarkdownDocument') {
        return await command.applyMarkdownDocument((request.args || {}) as WorkspaceRuntimeCommandApplyDocumentArgs)
      }
      if (action === 'applyChatAssistantResponse') {
        return await command.applyChatAssistantResponse((request.args || {}) as WorkspaceRuntimeCommandApplyAssistantResponseArgs)
      }
      throw new Error(`Unsupported workspace runtime command action: ${action || 'unknown'}`)
    }
    void run()
      .then(result => {
        const payload = { id, ok: true, result: summarizeWorkspaceRuntimeCommandResult(result) }
        writeWorkspaceRuntimeCommandResult(payload)
        window.dispatchEvent(new CustomEvent(WORKSPACE_RUNTIME_COMMAND_RESULT_EVENT, { detail: payload }))
      })
      .catch(error => {
        const payload = { id, ok: false, error: error instanceof Error ? error.message : String(error || 'Workspace runtime command failed') }
        writeWorkspaceRuntimeCommandResult(payload)
        window.dispatchEvent(new CustomEvent(WORKSPACE_RUNTIME_COMMAND_RESULT_EVENT, { detail: payload }))
      })
  }
  window.addEventListener(WORKSPACE_RUNTIME_COMMAND_EVENT, handler as EventListener)
  return () => window.removeEventListener(WORKSPACE_RUNTIME_COMMAND_EVENT, handler as EventListener)
}

export const createWorkspaceRuntimeCommand = (): WorkspaceRuntimeCommand => ({
  readState: () => readWorkspaceRuntimeCommandState(),
  applyMarkdownDocument: async (args: WorkspaceRuntimeCommandApplyDocumentArgs) => {
    const name = String(args?.name || '').trim()
    if (!name) {
      return { ...readWorkspaceRuntimeCommandState(), applied: false }
    }
    const state = useGraphStore.getState()
    const workspacePath = normalizeWorkspacePath(name)
    if (workspacePath) {
      useMarkdownExplorerStore.getState().setActivePath(workspacePath)
    }
    applyRuntimeViewOptions(state, args)
    const applied = await state.setActiveMarkdownDocument({
      name,
      text: String(args?.text || ''),
      sourceUrl: typeof args?.sourceUrl === 'string' ? args.sourceUrl : null,
      applyToGraph: args?.applyToGraph === true,
      forceApplyToGraph: args?.forceApplyToGraph !== false,
      applyViewPreset: args?.applyViewPreset !== false,
    })
    if (applied && args?.applyToGraph === true && args?.applyViewPreset !== false) {
      await waitForRuntimeCommandZoomSettle()
    }
    return {
      ...readWorkspaceRuntimeCommandState(),
      applied,
    }
  },
  applyChatAssistantResponse: async (args: WorkspaceRuntimeCommandApplyAssistantResponseArgs) => {
    const assistantText = String(args?.assistantText || '').replace(/\r\n/g, '\n').trim()
    if (!assistantText) {
      return { ...readWorkspaceRuntimeCommandState(), applied: false, workspacePath: null }
    }
    const state = useGraphStore.getState()
    applyRuntimeViewOptions(state, {
      workspaceViewMode: args?.workspaceViewMode || 'editor',
      workspaceCanvasPaneOpen: typeof args?.workspaceCanvasPaneOpen === 'boolean' ? args.workspaceCanvasPaneOpen : true,
    })
    const timestampMs = readTimestampMs(args?.timestampMs)
    const workspacePath = normalizeWorkspacePath(await appendChatHistoryWorkspaceFile({
      requestedPath: readOptionalString(args?.requestedPath) || state.chatAgenticGraphWorkspacePath || null,
      timestampMs,
      providerSummary: readOptionalString(args?.providerSummary) || 'runtime assistant response',
      userText: readOptionalString(args?.requestText) || 'Apply assistant response to the workspace.',
      assistantText,
      storageType: 'chatAgenticGraph',
      traceId: readOptionalString(args?.traceId) || `runtime-${timestampMs}`,
      title: 'Knowledge Graph Canvas Storage',
      defaultLocalRootPath: readOptionalString(args?.defaultLocalRootPath) || state.chatLocalStorageRootPath || null,
      onResolvedPath: path => {
        state.setChatAgenticGraphWorkspacePath(normalizeWorkspacePath(path))
      },
    }))
    state.setChatAgenticGraphWorkspacePath(workspacePath)
    useMarkdownExplorerStore.getState().setActivePath(workspacePath)
    const applied = await applyChatKgcWorkspaceDocumentToCanvas(workspacePath)
    await waitForRuntimeCommandStateSettle(workspacePath)
    return {
      ...readWorkspaceRuntimeCommandState(),
      applied,
      workspacePath: workspacePath || null,
    }
  },
})

declare global {
  interface Window {
    agenticgraphWorkspaceCommand?: WorkspaceRuntimeCommand
  }
}

export const installWorkspaceRuntimeCommand = (): (() => void) => {
  if (typeof window === 'undefined') return () => void 0
  const command = createWorkspaceRuntimeCommand()
  const cleanupEventBridge = installWorkspaceRuntimeCommandEventBridge(command)
  window.agenticgraphWorkspaceCommand = command
  writeWorkspaceRuntimeCommandDataset('ready')
  return () => {
    cleanupEventBridge()
    if (window.agenticgraphWorkspaceCommand === command) {
      delete window.agenticgraphWorkspaceCommand
    }
    writeWorkspaceRuntimeCommandDataset('removed')
  }
}
