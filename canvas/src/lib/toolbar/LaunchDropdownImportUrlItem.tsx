import React from 'react'
import { ChevronDown, Download, GitBranch, Globe, Link, Palette, Sparkles, Workflow } from 'lucide-react'
import type { UiToastInput } from '@/hooks/store/types'
import { WORKSPACE_IMPORT_IMAGE_URL_TEST, WORKSPACE_IMPORT_URL_TEST } from '@/lib/config'
import { readEnvString } from '@/lib/config.env'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_TOAST_TTL_MS } from '@/lib/ui/toastTiming'
import { UI_RESPONSIVE_IMPORT_URL_ADDON_ACTION_CLASSNAME, UI_RESPONSIVE_IMPORT_URL_FIELD_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { cn } from '@/lib/utils'
import { ImportUrlPrompt } from '@/features/toolbar/ImportUrlPrompt'
import { VideoDownloadOptionsPanel } from '@/features/toolbar/VideoDownloadOptionsPanel'
import { getMarkdownWorkspaceActionBridge } from '@/features/markdown-explorer/workspaceActionBridge'
import type { WorkspaceUrlImportCanvasRendererId, WorkspaceUrlImportDocumentModeId } from '@/features/markdown-workspace/workspaceImport/canvasPresets'
import type { Canvas2dRendererId } from '@/lib/config.render'
import type { VideoDownloadOptions } from '@/lib/video-download/types'
import { isVideoDownloadEligible } from '@/lib/video-download/isVideoDownloadEligible'
import { resolveVideoDownloadEndpoint } from '@/lib/video-download/videoDownloadResolver'
import { activateDesignEditorSurface } from '@/features/design/designEditorLaunchState'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { VideoAgentValidationImportControls } from '@/features/video-agent/VideoAgentValidationImportControls'
import { buildAutoWebsiteImportOptions } from './importUrlWebsiteMode'
import {
  DESIGN_IMPORT_URL_RENDERER_SELECTION,
  ImportUrlRendererSelect,
  parseImportUrlRendererSelection,
  type ImportUrlRendererSelection,
} from './ImportUrlRendererSelect'
import { loadLaunchDropdownFallbackModule } from '@/features/toolbar/launchDropdownFallbackModule'
import {
  canRecoverLaunchImportAsKnowledgeGraphRepository,
  isLaunchKnowledgeGraphRepositoryUrl,
  isLaunchImportRepositoryRateLimitFailure,
  runLaunchImportUrl,
  type LaunchKnowledgeGraphImportProgressStage,
} from './launchImportDispatch'
import { IMPORT_URL_AGENT_READY_MCP_TOOL_NAME } from '@/features/agent-ready/importUrlAgentReadyContract.mjs'
import { KNOWGRPH_LOCAL_MCP_TOOL_NAMES } from '@/features/agent-ready/knowgrphLocalMcpToolNames.mjs'
import {
  targetSkillsCommandsCommandInvocation,
  targetSkillsCommandsMcpInvocation,
} from '@/features/agentic-os/skillsCommandsMcpTarget'
import { NATIVE_CRAWLER_COMMAND } from '@/features/chat/nativeCrawlerInvocation'
import { useGraphStore } from '@/hooks/useGraphStore'

const DEFAULT_VIDEO_DOWNLOAD_OPTIONS: VideoDownloadOptions = {
  format: 'best',
  mediaKind: 'video-audio',
  quality: 'best',
  subtitleLang: '',
}

const KNOWLEDGE_GRAPH_IMPORT_TOAST_ID = 'launch:import:knowledge-graph-url'
const KNOWLEDGE_GRAPH_IMPORT_PROGRESS: Record<LaunchKnowledgeGraphImportProgressStage, string> = {
  resolving: 'Resolving the source-backed knowledge graph command…',
  ingesting: 'Parsing the repository into a local knowledge graph…',
  projecting: 'Opening the knowledge graph in Graph view…',
}

type PushUiToast = (toast: UiToastInput) => void

export function LaunchDropdownImportUrlItem(props: {
  canvas2dRenderer: Canvas2dRendererId
  menuIconClass: string
  menuItemClass: string
  onClose: () => void
  open: boolean
  pushUiToast: PushUiToast
}) {
  const { onClose, pushUiToast } = props
  const [urlDraft, setUrlDraft] = React.useState('')
  const [urlInputOpen, setUrlInputOpen] = React.useState(false)
  const [knowledgeGraphRepositoryMode, setKnowledgeGraphRepositoryMode] = React.useState(false)
  const [rateLimitRecoveryUrl, setRateLimitRecoveryUrl] = React.useState<string | null>(null)
  const [isImportingUrl, setIsImportingUrl] = React.useState(false)
  const [importUrlRenderer, setImportUrlRenderer] = React.useState<ImportUrlRendererSelection>('default')
  const [downloadOptionsOpen, setDownloadOptionsOpen] = React.useState(false)
  const [downloadOptions, setDownloadOptions] = React.useState<VideoDownloadOptions>(DEFAULT_VIDEO_DOWNLOAD_OPTIONS)
  const [isDownloading, setIsDownloading] = React.useState(false)
  const [validationConfigOpen, setValidationConfigOpen] = React.useState(false)
  const activeGraphData = useActiveGraphRenderData(true)
  const importUrlControlsId = React.useId()
  const endpointWarningShownRef = React.useRef(false)
  const openSkillsCommands = React.useCallback(() => {
    const state = useGraphStore.getState()
    state.setFloatingPanelView('skillsCommands')
    state.setFloatingPanelOpen(true)
  }, [])
  const reportSkillsCommandsResolutionFailure = React.useCallback((error: unknown) => {
    pushUiToast({
      id: 'launch:import-url:skills-commands-resolution',
      kind: 'error',
      message: String((error as { message?: unknown })?.message || 'Source-backed invocation resolution failed.'),
      ttlMs: UI_TOAST_TTL_MS.warningExtended,
      dismissible: true,
    })
  }, [pushUiToast])
  const targetSkillsCommands = React.useCallback((mcpTool = IMPORT_URL_AGENT_READY_MCP_TOOL_NAME) => {
    openSkillsCommands()
    return targetSkillsCommandsMcpInvocation(mcpTool).catch(error => {
      reportSkillsCommandsResolutionFailure(error)
      throw error
    })
  }, [openSkillsCommands, reportSkillsCommandsResolutionFailure])
  const targetSkillsCommandsCommand = React.useCallback((command: string) => {
    openSkillsCommands()
    return targetSkillsCommandsCommandInvocation(command).catch(error => {
      reportSkillsCommandsResolutionFailure(error)
      throw error
    })
  }, [openSkillsCommands, reportSkillsCommandsResolutionFailure])

  const bridge = getMarkdownWorkspaceActionBridge()
  const hasBridgeVideoDownload = typeof bridge.downloadVideo === 'function'
  const endpointConfigured = React.useMemo(() => {
    const value = resolveVideoDownloadEndpoint(readEnvString('VITE_VIDEO_DOWNLOAD_ENDPOINT', '').trim() || null)
    if (!value) return false
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }, [])
  const isVideoEligible = isVideoDownloadEligible(urlDraft)

  React.useEffect(() => {
    if (!props.open) {
      setDownloadOptionsOpen(false)
      setDownloadOptions(DEFAULT_VIDEO_DOWNLOAD_OPTIONS)
      setIsDownloading(false)
      setValidationConfigOpen(false)
      setKnowledgeGraphRepositoryMode(false)
      setRateLimitRecoveryUrl(null)
      setIsImportingUrl(false)
      endpointWarningShownRef.current = false
      return
    }
    setUrlInputOpen(false)
    setImportUrlRenderer(props.canvas2dRenderer === 'design' ? DESIGN_IMPORT_URL_RENDERER_SELECTION : 'default')
    setDownloadOptionsOpen(false)
    setDownloadOptions(DEFAULT_VIDEO_DOWNLOAD_OPTIONS)
    setIsDownloading(false)
    setKnowledgeGraphRepositoryMode(false)
    setRateLimitRecoveryUrl(null)
    setIsImportingUrl(false)
    endpointWarningShownRef.current = false
  }, [props.canvas2dRenderer, props.open])

  React.useEffect(() => {
    if (!downloadOptionsOpen || endpointConfigured || hasBridgeVideoDownload || endpointWarningShownRef.current) return
    endpointWarningShownRef.current = true
    pushUiToast({
      id: 'launch:video-download:not-configured',
      kind: 'warning',
      message: 'Configure VITE_VIDEO_DOWNLOAD_ENDPOINT before downloading',
      ttlMs: UI_TOAST_TTL_MS.warningExtended,
      dismissible: true,
    })
  }, [downloadOptionsOpen, endpointConfigured, hasBridgeVideoDownload, pushUiToast])

  const importUrlFallback = React.useCallback(
    async (urlRaw: string, opts?: { canvas2dRenderer?: WorkspaceUrlImportCanvasRendererId | null; documentSemanticMode?: WorkspaceUrlImportDocumentModeId | null }) => {
      const mod = await loadLaunchDropdownFallbackModule()
      await mod.importUrlFallback({ urlRaw, canvas2dRenderer: opts?.canvas2dRenderer, documentSemanticMode: opts?.documentSemanticMode, pushUiToast })
    },
    [pushUiToast],
  )

  const importUrlDeerFlowFallback = React.useCallback(
    async (urlRaw: string, opts?: { canvas2dRenderer?: WorkspaceUrlImportCanvasRendererId | null; documentSemanticMode?: WorkspaceUrlImportDocumentModeId | null }) => {
      const mod = await loadLaunchDropdownFallbackModule()
      await mod.importUrlDeerFlowFallback({ urlRaw, canvas2dRenderer: opts?.canvas2dRenderer, documentSemanticMode: opts?.documentSemanticMode, pushUiToast })
    },
    [pushUiToast],
  )

  const selectedImportOpts = React.useCallback(() => parseImportUrlRendererSelection(importUrlRenderer) || undefined, [importUrlRenderer])

  const runImportUrl = React.useCallback(
    async (nextUrlRaw: string, options?: { forceKnowledgeGraphRepository?: boolean }) => {
      const nextUrl = String(nextUrlRaw || '').trim()
      if (!nextUrl || isImportingUrl) return
      const isKnowledgeGraphRepository = options?.forceKnowledgeGraphRepository === true
        || knowledgeGraphRepositoryMode
        || isLaunchKnowledgeGraphRepositoryUrl(nextUrl)
      const sharedResolution = isKnowledgeGraphRepository
        ? targetSkillsCommands(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest)
        : null
      setRateLimitRecoveryUrl(null)
      setIsImportingUrl(true)
      if (isKnowledgeGraphRepository) onClose()
      const launchBridge = getMarkdownWorkspaceActionBridge()
      const opts = selectedImportOpts()
      if (opts?.canvas2dRenderer === 'design') activateDesignEditorSurface({ openFloatingPanel: true })
      try {
        const result = await runLaunchImportUrl({
          urlRaw: nextUrl,
          opts,
          bridge: launchBridge,
          fallback: importUrlFallback,
          forceKnowledgeGraphRepository: isKnowledgeGraphRepository,
          resolveMcpInvocation: sharedResolution
            ? async (mcpTool) => {
              if (mcpTool !== KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest) {
                throw new Error('The shared Skills & Commands resolution is bound to another MCP tool.')
              }
              return sharedResolution
            }
            : undefined,
          onKnowledgeGraphProgress: stage => {
            pushUiToast({
              id: KNOWLEDGE_GRAPH_IMPORT_TOAST_ID,
              kind: 'neutral',
              message: KNOWLEDGE_GRAPH_IMPORT_PROGRESS[stage],
              ttlMs: null,
              dismissible: false,
              busy: true,
              log: false,
            })
          },
        })
        if (result && 'kind' in result && result.kind === 'knowledge-graph') {
          pushUiToast({
            id: KNOWLEDGE_GRAPH_IMPORT_TOAST_ID,
            kind: 'success',
            message: `Loaded knowledge graph in Graph view (${result.projection?.graphData.nodes.length || 0} nodes, ${result.projection?.graphData.edges.length || 0} edges)`,
            ttlMs: UI_TOAST_TTL_MS.actionFeedback,
          })
        }
        if (
          !isKnowledgeGraphRepository
          && isLaunchImportRepositoryRateLimitFailure(result)
          && canRecoverLaunchImportAsKnowledgeGraphRepository(nextUrl)
        ) {
          setRateLimitRecoveryUrl(nextUrl)
          return
        }
        if (!isKnowledgeGraphRepository) onClose()
        setUrlInputOpen(false)
      } catch (error) {
        if (!isKnowledgeGraphRepository) onClose()
        pushUiToast({
          id: KNOWLEDGE_GRAPH_IMPORT_TOAST_ID,
          kind: 'error',
          message: String((error as { message?: unknown })?.message || 'Knowledge graph URL import failed.'),
          ttlMs: UI_TOAST_TTL_MS.warningExtended,
          dismissible: true,
        })
      } finally {
        setIsImportingUrl(false)
      }
    },
    [importUrlFallback, isImportingUrl, knowledgeGraphRepositoryMode, onClose, pushUiToast, selectedImportOpts, targetSkillsCommands],
  )

  const runImportUrlDeerFlow = React.useCallback(
    async (nextUrlRaw: string) => {
      const nextUrl = String(nextUrlRaw || '').trim()
      if (!nextUrl) return
      try {
        await targetSkillsCommands()
      } catch {
        return
      }
      onClose()
      const opts = selectedImportOpts()
      if (opts?.canvas2dRenderer === 'design') activateDesignEditorSurface({ openFloatingPanel: true })
      void importUrlDeerFlowFallback(nextUrl, opts)
      setUrlInputOpen(false)
    },
    [importUrlDeerFlowFallback, onClose, selectedImportOpts, targetSkillsCommands],
  )

  const runWebsiteCrawl = React.useCallback(
    async (nextUrlRaw: string) => {
      const nextUrl = String(nextUrlRaw || '').trim()
      if (!nextUrl) return
      try {
        await targetSkillsCommandsCommand(NATIVE_CRAWLER_COMMAND)
      } catch {
        return
      }
      onClose()
      getMarkdownWorkspaceActionBridge().importWebsite?.(nextUrl, buildAutoWebsiteImportOptions())
      setUrlInputOpen(false)
    },
    [onClose, targetSkillsCommandsCommand],
  )

  const runVideoDownload = React.useCallback(async () => {
    const next = String(urlDraft || '').trim()
    if (!next || isDownloading) return
    if (!isVideoDownloadEligible(next)) {
      pushUiToast({ id: 'launch:video-download:ineligible', kind: 'warning', message: 'URL is not eligible for local video download', ttlMs: UI_TOAST_TTL_MS.warningExtended, dismissible: true })
      return
    }
    if (!endpointConfigured && typeof getMarkdownWorkspaceActionBridge().downloadVideo !== 'function') {
      pushUiToast({ id: 'launch:video-download:not-configured', kind: 'warning', message: 'Configure VITE_VIDEO_DOWNLOAD_ENDPOINT before downloading', ttlMs: UI_TOAST_TTL_MS.warningExtended, dismissible: true })
      return
    }
    setIsDownloading(true)
    try {
      const mod = await loadLaunchDropdownFallbackModule()
      await mod.videoDownloadFallback({ url: next, options: downloadOptions, pushUiToast })
      setDownloadOptionsOpen(false)
      setDownloadOptions(DEFAULT_VIDEO_DOWNLOAD_OPTIONS)
    } finally {
      setIsDownloading(false)
    }
  }, [downloadOptions, endpointConfigured, isDownloading, pushUiToast, urlDraft])

  const beforeValidationImport = React.useCallback(() => {
    onClose()
    const opts = selectedImportOpts()
    if (opts?.canvas2dRenderer === 'design') activateDesignEditorSurface({ openFloatingPanel: true })
    setUrlInputOpen(false)
  }, [onClose, selectedImportOpts])

  return (
    <li className="list-none">
      <button
        type="button"
        className={props.menuItemClass}
        onClick={() => {
          const draft = String(urlDraft || '').trim()
          if (urlInputOpen) {
            setUrlInputOpen(false)
            setDownloadOptionsOpen(false)
            setDownloadOptions(DEFAULT_VIDEO_DOWNLOAD_OPTIONS)
            setIsDownloading(false)
            return
          }
          if (!draft) {
            if (WORKSPACE_IMPORT_URL_TEST) setUrlDraft(WORKSPACE_IMPORT_URL_TEST)
            else if (WORKSPACE_IMPORT_IMAGE_URL_TEST) setUrlDraft(WORKSPACE_IMPORT_IMAGE_URL_TEST)
          }
          void targetSkillsCommands().catch(() => undefined)
          setUrlInputOpen(true)
        }}
        aria-expanded={urlInputOpen}
        aria-controls={importUrlControlsId}
        data-kg-launch-import-url-skills-commands-target="skillsCommands"
        data-kg-launch-import-url-mcp-tool={IMPORT_URL_AGENT_READY_MCP_TOOL_NAME}
      >
        <Link className={props.menuIconClass} strokeWidth={1.6} />
        <span className="truncate">Import URL</span>
        <ChevronDown className={`ml-auto ${props.menuIconClass} transition-transform ${urlInputOpen ? 'rotate-180' : ''}`} strokeWidth={1.6} aria-hidden="true" />
      </button>
      {urlInputOpen ? (
        <section id={importUrlControlsId} className="kg-launch-menu-children kg-click-expand-menu-children mt-1">
          <ImportUrlPrompt
            urlDraft={urlDraft}
            onChange={next => {
              setUrlDraft(next)
              setRateLimitRecoveryUrl(null)
            }}
            onCancel={() => setUrlInputOpen(false)}
            autoFocus
            disabled={isImportingUrl}
            confirmLabel="Import"
            onConfirm={runImportUrl}
            rightAddon={
              <section className="flex min-w-0 flex-1 items-stretch gap-1">
                <button type="button" className={cn(UI_RESPONSIVE_IMPORT_URL_ADDON_ACTION_CLASSNAME, 'rounded border', importUrlRenderer === DESIGN_IMPORT_URL_RENDERER_SELECTION ? cn(UI_THEME_TOKENS.button.activeBg, UI_THEME_TOKENS.button.activeText) : UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.button.hoverBg)} title="Design renderer" aria-label="Design renderer" aria-pressed={importUrlRenderer === DESIGN_IMPORT_URL_RENDERER_SELECTION} onClick={() => setImportUrlRenderer(prev => (prev === DESIGN_IMPORT_URL_RENDERER_SELECTION ? 'default' : DESIGN_IMPORT_URL_RENDERER_SELECTION))}>
                  <Palette className={props.menuIconClass} strokeWidth={1.6} aria-hidden={true} />
                </button>
                <ImportUrlRendererSelect value={importUrlRenderer} onChange={setImportUrlRenderer} />
                <button type="button" className={cn(UI_RESPONSIVE_IMPORT_URL_ADDON_ACTION_CLASSNAME, 'rounded border', validationConfigOpen ? cn(UI_THEME_TOKENS.button.activeBg, UI_THEME_TOKENS.button.activeText) : UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.button.hoverBg)} title="Video-agent validation config" aria-label="Video-agent validation config" aria-pressed={validationConfigOpen} onClick={() => setValidationConfigOpen(prev => !prev)}>
                  <Workflow className={props.menuIconClass} strokeWidth={1.6} aria-hidden="true" />
                </button>
                {isVideoEligible ? (
                  <button type="button" className={cn(UI_RESPONSIVE_IMPORT_URL_ADDON_ACTION_CLASSNAME, 'rounded border', downloadOptionsOpen ? cn(UI_THEME_TOKENS.button.activeBg, UI_THEME_TOKENS.button.activeText) : UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.button.hoverBg)} title="Download local video" aria-label="Download local video" aria-pressed={downloadOptionsOpen} onClick={() => setDownloadOptionsOpen(prev => !prev)}>
                    <Download className={props.menuIconClass} strokeWidth={1.6} aria-hidden="true" />
                  </button>
                ) : null}
                {typeof bridge.importWebsite === 'function' ? (
                  <button type="button" className={cn(UI_RESPONSIVE_IMPORT_URL_ADDON_ACTION_CLASSNAME, 'rounded border', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)} title="Crawl website headlessly" aria-label="Crawl website headlessly" data-kg-launch-import-url-crawler-target={NATIVE_CRAWLER_COMMAND} onClick={() => { void runWebsiteCrawl(urlDraft) }}>
                    <Globe className={props.menuIconClass} strokeWidth={1.6} />
                  </button>
                ) : null}
                <button type="button" className={cn(UI_RESPONSIVE_IMPORT_URL_ADDON_ACTION_CLASSNAME, 'rounded border', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)} title="Import URL (DeerFlow)" aria-label="Import URL (DeerFlow)" data-kg-launch-import-url-provider-assisted-target={IMPORT_URL_AGENT_READY_MCP_TOOL_NAME} onClick={() => { void runImportUrlDeerFlow(urlDraft) }}>
                  <Sparkles className={props.menuIconClass} strokeWidth={1.6} />
                </button>
              </section>
            }
          />
          <section className="mt-1 flex min-w-0 flex-wrap items-center gap-1 text-xs" aria-label="Codebase graph import mode">
            <button
              type="button"
              className={cn('inline-flex min-h-7 items-center gap-1 rounded border px-2', knowledgeGraphRepositoryMode ? cn(UI_THEME_TOKENS.button.activeBg, UI_THEME_TOKENS.button.activeText) : UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.button.hoverBg)}
              title="Build a repository knowledge graph with local Git acquisition"
              aria-label="Codebase graph"
              aria-pressed={knowledgeGraphRepositoryMode}
              data-kg-launch-import-url-repository-mode="true"
              onClick={() => {
                const next = !knowledgeGraphRepositoryMode
                setKnowledgeGraphRepositoryMode(next)
                setRateLimitRecoveryUrl(null)
                void targetSkillsCommands(next
                  ? KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest
                  : IMPORT_URL_AGENT_READY_MCP_TOOL_NAME).catch(() => undefined)
              }}
            >
              <GitBranch className={props.menuIconClass} strokeWidth={1.6} aria-hidden />
              <span>Codebase graph</span>
            </button>
            <span className={UI_THEME_TOKENS.text.secondary}>
              {knowledgeGraphRepositoryMode
                ? 'Uses deterministic local Git acquisition.'
                : 'Use this mode for repository knowledge graphs.'}
            </span>
          </section>
          {rateLimitRecoveryUrl ? (
            <section
              className={cn('mt-1 grid gap-1 rounded border p-2 text-xs', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.text)}
              role="status"
              data-kg-launch-import-url-rate-limit-recovery="true"
            >
              <span>Remote document import is rate limited. Retry this source as a codebase graph with local Git acquisition.</span>
              <button
                type="button"
                className={cn('justify-self-start rounded border px-2 py-1', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
                data-kg-launch-import-url-retry-codebase-graph="true"
                onClick={() => {
                  setKnowledgeGraphRepositoryMode(true)
                  void runImportUrl(rateLimitRecoveryUrl, { forceKnowledgeGraphRepository: true })
                }}
              >
                Retry as codebase graph
              </button>
            </section>
          ) : null}
          {validationConfigOpen ? (
            <VideoAgentValidationImportControls
              runtimeInput={activeGraphData}
              optionMode="select"
              containerClassName="mt-1 grid gap-1"
              fieldClassName={cn(UI_RESPONSIVE_IMPORT_URL_FIELD_CLASSNAME, 'rounded border text-xs', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.text)}
              textAreaClassName={cn(UI_RESPONSIVE_IMPORT_URL_FIELD_CLASSNAME, 'min-h-16 rounded border text-xs', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.text)}
              actionClassName={cn(UI_RESPONSIVE_IMPORT_URL_ADDON_ACTION_CLASSNAME, 'rounded border text-xs', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
              containerAriaLabel="Video-agent validation import controls"
              docPathAriaLabel="Video-agent validation document path"
              urlsAriaLabel="Video-agent validation import URLs"
              actionsAriaLabel="Video-agent validation URL actions"
              importUrlOpts={selectedImportOpts}
              importUrlFallback={importUrlFallback}
              onBeforeImport={beforeValidationImport}
              onSelectUrl={url => {
                setUrlDraft(url)
                setUrlInputOpen(true)
              }}
              optionButtonLabel={option => `Use ${option.label}`}
            />
          ) : null}
          {downloadOptionsOpen ? (
            <VideoDownloadOptionsPanel options={downloadOptions} onOptionsChange={setDownloadOptions} onConfirm={() => { void runVideoDownload() }} onCancel={() => { setDownloadOptionsOpen(false); setDownloadOptions(DEFAULT_VIDEO_DOWNLOAD_OPTIONS) }} isDownloading={isDownloading} endpointConfigured={endpointConfigured || hasBridgeVideoDownload} />
          ) : null}
        </section>
      ) : null}
    </li>
  )
}
