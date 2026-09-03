import React from 'react'
import { emitMainPanelOpen, MAIN_PANEL_OPEN_READY_EVENT } from '@/features/panels/utils/useMainPanelRect'
import { QUERY_PARAM_DEV_STORYBOARD_WIDGET_GEOMETRY, QUERY_PARAM_OPEN_MAIN_PANEL, QUERY_PARAM_SHARE, QUERY_PARAM_SHARE_TEXT, QUERY_PARAM_SHARE_TITLE, QUERY_PARAM_SHARE_URL, QUERY_PARAM_WORKSPACE_COMMAND } from '@/lib/routing/queryParams'
import { useGraphStore } from '@/hooks/useGraphStore'
import { applyGraphDataCanonicalBootstrap } from '@/features/parsers/applyGraphDataCanonicalBootstrap'
import {
  consumeLarkAppCanvasHandoffLocation,
  parseLarkAppCanvasHandoffFromLocation,
} from '@/features/canvas/larkAppCanvasHandoff'
import type { FeishuBaseSourceImportCommand } from '@/features/source-files/feishuBaseSourceImportCommand'
import type { FeishuBaseSourceImportRequest } from '@/features/source-files/feishuBaseSourceImportContract'
import type { KnowledgeSourceImportRequest } from '@/features/source-files/knowledge-source/knowledgeSourceImportCommand'

const buildDevStoryboardWidgetGeometryGraph = () => ({
  type: 'Graph' as const,
  nodes: [
    { id: 'dev-widget-1', label: 'Dev Widget 1', type: 'Anchor', x: 0, y: 0, properties: {} },
    { id: 'dev-widget-2', label: 'Dev Widget 2', type: 'Anchor', x: 0, y: 0, properties: {} },
    {
      id: 'dev-media-1',
      label: 'Dev Media 1',
      type: 'RichMediaPanel',
      x: 0,
      y: 0,
      properties: {
        imageUrl: 'https://example.com/dev-storyboard-widget-geometry.png',
        'visual:width': 240,
        'visual:height': 180,
      },
    },
  ],
  edges: [],
  metadata: { kind: 'test', source: 'devStoryboardWidgetGeometry' },
})

type WorkspaceCommandQueryPayload = {
  id?: unknown
  action?: unknown
  args?: unknown
}

const isLocalWorkspaceCommandQueryAllowed = (): boolean => {
  const anyImportMeta = import.meta as unknown as { env?: { DEV?: boolean } }
  if (anyImportMeta.env?.DEV) return true
  if (typeof window === 'undefined') return false
  const host = String(window.location?.hostname || '').trim().toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
}

const decodeBase64UrlText = (raw: string): string => {
  const normalized = String(raw || '').trim().replace(/-/g, '+').replace(/_/g, '/')
  if (!normalized) return ''
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

const parseWorkspaceCommandQueryPayload = (raw: string): WorkspaceCommandQueryPayload | null => {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  const text = trimmed.startsWith('{') ? trimmed : decodeBase64UrlText(trimmed)
  const parsed = JSON.parse(text)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as WorkspaceCommandQueryPayload
    : null
}

type MainPanelOpenReadyWindow = Window & {
  __AG_MAIN_PANEL_OPEN_READY__?: boolean
}

type LarkCanvasHandoffWindow = MainPanelOpenReadyWindow & {
  agenticGraphFeishuBaseSourceImportCommand?: FeishuBaseSourceImportCommand
}

const openMainPanelWhenReady = (tab: string): (() => void) | void => {
  if (typeof window === 'undefined') return

  const dispatchOpenMainPanel = () => {
    try {
      emitMainPanelOpen({ tab })
    } catch {
      void 0
    }
  }

  if ((window as MainPanelOpenReadyWindow).__AG_MAIN_PANEL_OPEN_READY__ === true) {
    dispatchOpenMainPanel()
    return
  }

  const handleReady = () => {
    window.removeEventListener(MAIN_PANEL_OPEN_READY_EVENT, handleReady)
    dispatchOpenMainPanel()
  }

  window.addEventListener(MAIN_PANEL_OPEN_READY_EVENT, handleReady, { once: true })
  return () => {
    window.removeEventListener(MAIN_PANEL_OPEN_READY_EVENT, handleReady)
  }
}

const importFeishuBaseSnapshotFromLarkHandoff = async (
  request: FeishuBaseSourceImportRequest,
): Promise<unknown> => {
  const activeWindow = window as LarkCanvasHandoffWindow
  const installedCommand = activeWindow.agenticGraphFeishuBaseSourceImportCommand
  if (installedCommand?.importSnapshot) {
    return await installedCommand.importSnapshot(request)
  }
  const module = await import('@/features/source-files/feishuBaseSourceImportCommand')
  return await module.createFeishuBaseSourceImportCommand().importSnapshot(request)
}

const importKnowledgeSourceFromLarkHandoff = async (
  request: KnowledgeSourceImportRequest,
): Promise<unknown> => {
  const activeWindow = window as LarkCanvasHandoffWindow
  const installedCommand = activeWindow.agenticGraphFeishuBaseSourceImportCommand
  if (installedCommand?.importKnowledgeSource) {
    return await installedCommand.importKnowledgeSource(request)
  }
  const module = await import('@/features/source-files/feishuBaseSourceImportCommand')
  return await module.createFeishuBaseSourceImportCommand().importKnowledgeSource(request)
}

export function CanvasQueryBootstrapRuntime(props: {
  search: string
}) {
  const { search } = props
  const openedMainPanelFromQueryRef = React.useRef(false)
  const appliedDevStoryboardWidgetGeometryRef = React.useRef(false)
  const handledWorkspaceCommandRef = React.useRef('')
  const handledLarkHandoffRef = React.useRef('')
  const setCanvasRenderMode = useGraphStore(s => s.setCanvasRenderMode)
  const setCanvas2dRenderer = useGraphStore(s => s.setCanvas2dRenderer)
  const setFrontmatterModeEnabled = useGraphStore(s => s.setFrontmatterModeEnabled)
  const setDocumentSemanticMode = useGraphStore(s => s.setDocumentSemanticMode)
  const setRenderMediaAsNodes = useGraphStore(s => s.setRenderMediaAsNodes)
  const setOpenWidgetNodeIds = useGraphStore(s => s.setOpenWidgetNodeIds)
  const setWorkspaceViewState = useGraphStore(s => s.setWorkspaceViewState)
  const upsertUiToast = useGraphStore(s => s.upsertUiToast)

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    let cleanup = () => void 0
    void import('@/features/canvas/larkAppRemoteMutationBridgeRuntime')
      .then(module => {
        if (cancelled) return
        cleanup = module.installLarkAppRemoteMutationBridgeCommand()
      })
      .catch(() => {
        void 0
      })
    return () => {
      cancelled = true
      cleanup()
    }
  }, [])

  React.useEffect(() => {
    const raw = String(search || '')
    if (!raw) return
    const params = new URLSearchParams(raw)
    const commandRaw = String(params.get(QUERY_PARAM_WORKSPACE_COMMAND) || '').trim()
    if (!commandRaw || handledWorkspaceCommandRef.current === commandRaw) return
    handledWorkspaceCommandRef.current = commandRaw
    if (!isLocalWorkspaceCommandQueryAllowed()) return
    const commandIdFallback = `workspace-query-${Date.now()}`
    try {
      params.delete(QUERY_PARAM_WORKSPACE_COMMAND)
      const next = params.toString()
      const nextUrl = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash || ''}`
      window.history.replaceState(null, '', nextUrl)
    } catch {
      void 0
    }
    void (async () => {
      const {
        createWorkspaceRuntimeCommand,
        publishWorkspaceRuntimeCommandResult,
        summarizeWorkspaceRuntimeCommandResult,
      } = await import('@/features/agent-ready/workspaceRuntimeCommand')
      const payload = parseWorkspaceCommandQueryPayload(commandRaw)
      const id = String(payload?.id || '').trim() || commandIdFallback
      const action = String(payload?.action || '').trim()
      const command = createWorkspaceRuntimeCommand()
      try {
        const result = action === 'readState'
          ? command.readState()
          : action === 'applyMarkdownDocument'
            ? await command.applyMarkdownDocument((payload?.args || {}) as never)
            : action === 'applyChatAssistantResponse'
              ? await command.applyChatAssistantResponse((payload?.args || {}) as never)
              : (() => { throw new Error(`Unsupported workspace command query action: ${action || 'unknown'}`) })()
        publishWorkspaceRuntimeCommandResult({ id, ok: true, result: summarizeWorkspaceRuntimeCommandResult(result) })
      } catch (error) {
        publishWorkspaceRuntimeCommandResult({
          id,
          ok: false,
          error: error instanceof Error ? error.message : String(error || 'Workspace command query failed'),
        })
      }
    })().catch(error => {
      void import('@/features/agent-ready/workspaceRuntimeCommand').then(mod => {
        mod.publishWorkspaceRuntimeCommandResult({
          id: commandIdFallback,
          ok: false,
          error: error instanceof Error ? error.message : String(error || 'Workspace command query failed'),
        })
      })
    })
  }, [search])

  React.useEffect(() => {
    if (appliedDevStoryboardWidgetGeometryRef.current) return
    const anyImportMeta = import.meta as unknown as { env?: { DEV?: boolean } }
    if (!anyImportMeta.env?.DEV) return
    const raw = String(search || '')
    if (!raw) return
    const params = new URLSearchParams(raw)
    if (!String(params.get(QUERY_PARAM_DEV_STORYBOARD_WIDGET_GEOMETRY) || '').trim()) return
    appliedDevStoryboardWidgetGeometryRef.current = true
    try {
      applyGraphDataCanonicalBootstrap({ graphData: buildDevStoryboardWidgetGeometryGraph() })
      setOpenWidgetNodeIds(['dev-widget-1', 'dev-widget-2'])
    } catch {
      void 0
    }
    try {
      params.delete(QUERY_PARAM_DEV_STORYBOARD_WIDGET_GEOMETRY)
      const next = params.toString()
      const nextUrl = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash || ''}`
      window.history.replaceState(null, '', nextUrl)
    } catch {
      void 0
    }
  }, [
    search,
    setOpenWidgetNodeIds,
  ])

  React.useEffect(() => {
    const raw = String(search || '')
    if (typeof window === 'undefined') return
    const hash = String(window.location.hash || '')
    const parsed = parseLarkAppCanvasHandoffFromLocation({ search: raw, hash })
    if (!parsed) return
    consumeLarkAppCanvasHandoffLocation({ search: raw, hash })
    if (handledLarkHandoffRef.current === parsed.rawToken) return
    handledLarkHandoffRef.current = parsed.rawToken

    if (parsed.ok === false) {
      const errorMessage = parsed.error
      upsertUiToast({
        id: 'lark-app:canvas-handoff-error',
        kind: 'error',
        message: errorMessage,
        ttlMs: 5000,
        dismissible: true,
      })
      return
    }

    const handoff = parsed.value
    if (handoff.openEditorWorkspace || handoff.intent === 'import') {
      setWorkspaceViewState({ mode: 'editor', paneOpen: true })
    }

    let cleanupMainPanel = () => void 0
    if (handoff.openMainPanelTab) {
      cleanupMainPanel = openMainPanelWhenReady(handoff.openMainPanelTab) || (() => void 0)
    }

    if (handoff.intent !== 'import') {
      return cleanupMainPanel
    }

    const runImport = handoff.importAction === 'importSnapshot' && handoff.snapshot
      ? () => importFeishuBaseSnapshotFromLarkHandoff({
          fileId: handoff.fileId,
          snapshot: handoff.snapshot as NonNullable<typeof handoff.snapshot>,
        })
      : handoff.importAction === 'readKnowledgeSource' && handoff.knowledgeSource
        ? () => importKnowledgeSourceFromLarkHandoff({
            handoff: handoff.knowledgeSource as NonNullable<typeof handoff.knowledgeSource>,
          })
        : null
    if (!runImport) return cleanupMainPanel

    upsertUiToast({
      id: 'lark-app:canvas-handoff-import',
      kind: 'neutral',
      message: handoff.importAction === 'readKnowledgeSource'
        ? 'Reading configured Lark knowledge source…'
        : `Processing Lark ${handoff.surface} import handoff…`,
      ttlMs: null,
      dismissible: false,
      busy: true,
    })

    void runImport()
      .then(result => {
        if (result && typeof result === 'object' && !Array.isArray(result) && 'ok' in result && result.ok === true) {
          const record = result as { name?: unknown; warnings?: unknown[] }
          const warningCount = Array.isArray(record.warnings) ? record.warnings.length : 0
          upsertUiToast({
            id: 'lark-app:canvas-handoff-import',
            kind: 'success',
            message: warningCount > 0
              ? `Imported Lark handoff into ${String(record.name || 'source file')} with ${warningCount} warning(s).`
              : `Imported Lark handoff into ${String(record.name || 'source file')}.`,
            ttlMs: 4000,
            dismissible: true,
            busy: false,
          })
          return
        }
        const error = result && typeof result === 'object' && !Array.isArray(result) && 'error' in result
          ? String((result as { error?: unknown }).error || 'Lark handoff import failed.')
          : 'Lark handoff import failed.'
        upsertUiToast({
          id: 'lark-app:canvas-handoff-import',
          kind: 'error',
          message: error,
          ttlMs: 5000,
          dismissible: true,
          busy: false,
        })
      })
      .catch(error => {
        upsertUiToast({
          id: 'lark-app:canvas-handoff-import',
          kind: 'error',
          message: error instanceof Error ? error.message : String(error || 'Lark handoff import failed.'),
          ttlMs: 5000,
          dismissible: true,
          busy: false,
        })
      })

    return cleanupMainPanel
  }, [search, setWorkspaceViewState, upsertUiToast])

  React.useEffect(() => {
    if (openedMainPanelFromQueryRef.current) return
    const raw = String(search || '')
    if (!raw) return
    const params = new URLSearchParams(raw)
    const tab = String(params.get(QUERY_PARAM_OPEN_MAIN_PANEL) || '').trim()
    if (!tab) return
    if (typeof window === 'undefined') return

    const dispatchOpenMainPanel = () => {
      if (openedMainPanelFromQueryRef.current) return
      openedMainPanelFromQueryRef.current = true
      try {
        emitMainPanelOpen({ tab })
      } catch {
        void 0
      }
      try {
        params.delete(QUERY_PARAM_OPEN_MAIN_PANEL)
        const next = params.toString()
        const nextUrl = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash || ''}`
        window.history.replaceState(null, '', nextUrl)
      } catch {
        void 0
      }
    }

    if ((window as MainPanelOpenReadyWindow).__AG_MAIN_PANEL_OPEN_READY__ === true) {
      dispatchOpenMainPanel()
      return
    }

    const handleReady = () => {
      window.removeEventListener(MAIN_PANEL_OPEN_READY_EVENT, handleReady)
      dispatchOpenMainPanel()
    }

    window.addEventListener(MAIN_PANEL_OPEN_READY_EVENT, handleReady, { once: true })
    return () => {
      window.removeEventListener(MAIN_PANEL_OPEN_READY_EVENT, handleReady)
    }
  }, [search])

  const handledShareRef = React.useRef(false)

  React.useEffect(() => {
    if (handledShareRef.current) return
    const raw = String(search || '')
    if (!raw) return
    const params = new URLSearchParams(raw)
    if (!params.has(QUERY_PARAM_SHARE)) return
    if (typeof window === 'undefined') return

    handledShareRef.current = true
    const sharedTitle = String(params.get(QUERY_PARAM_SHARE_TITLE) || '').trim()
    const sharedText = String(params.get(QUERY_PARAM_SHARE_TEXT) || '').trim()
    const sharedUrl = String(params.get(QUERY_PARAM_SHARE_URL) || '').trim()
    const parts = [sharedTitle, sharedText, sharedUrl].filter(Boolean)
    if (parts.length > 0) {
      upsertUiToast({
        id: 'pwa:share-received',
        kind: 'neutral',
        message: `Shared: ${parts.join(' — ')}`,
        ttlMs: 8000,
        dismissible: true,
      })
    }
    try {
      params.delete(QUERY_PARAM_SHARE)
      params.delete(QUERY_PARAM_SHARE_TITLE)
      params.delete(QUERY_PARAM_SHARE_TEXT)
      params.delete(QUERY_PARAM_SHARE_URL)
      const next = params.toString()
      const nextUrl = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash || ''}`
      window.history.replaceState(null, '', nextUrl)
    } catch {
      void 0
    }
  }, [search, upsertUiToast])

  return null
}
