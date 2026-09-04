import React from 'react'
import { BarChart3, CloudDownload, FilePlus2, FolderOpen, FolderPlus, Home, Image as ImageIcon, Save, Sparkles, Upload, Workflow } from 'lucide-react'
import { DropdownPanel } from '@/lib/ui/overlay'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { SOURCE_FILES_FORMATS } from '@/lib/config-copy/importExportCopy'
import { getMarkdownWorkspaceActionBridge } from '@/features/markdown-explorer/workspaceActionBridge'
import { createNewMarkdownSourceFile } from '@/features/source-files/createNewMarkdownSourceFile'
import { useGraphStore } from '@/hooks/useGraphStore'
import { cn } from '@/lib/utils'
import {
  UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_LAUNCH_MENU_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import {
  LaunchDropdownExportMenu,
  hasLaunchDropdownExportActions,
  type LaunchDropdownExportActions,
} from './LaunchDropdownExportMenu'
import { importLocalImagesWithWorkspaceBridgeRetry } from './launchImageImportBridge'
import { LaunchDropdownImportUrlItem } from './LaunchDropdownImportUrlItem'
import { loadLaunchDropdownFallbackModule } from '@/features/toolbar/launchDropdownFallbackModule'
import {
  hasLaunchAgentGraphFolderImporter,
  runLaunchImportAgentGraphFolder,
  runLaunchImportLocalFiles,
  runLaunchImportLocalFolderPreview,
} from './launchImportDispatch'
import { UI_TOAST_TTL_MS } from '@/lib/ui/toastTiming'
import { AIRVIO_HOME_URL } from '@/lib/routing/airvioHome'
import { WorkspaceLaunchRowValue } from './WorkspaceLaunchRowValue'
import {
  registerWorkspaceLaunchControlHandler,
  type WorkspaceLaunchOptionId,
} from './workspaceLaunchControlRuntime'
import { targetSkillsCommandsMcpInvocation } from '@/features/agentic-os/skillsCommandsMcpTarget'
import { IMPORT_URL_AGENT_READY_MCP_TOOL_NAME } from '@/features/agent-ready/importUrlAgentReadyContract.mjs'

const WORKSPACE_IMPORT_ACCEPT = [...SOURCE_FILES_FORMATS.import, '.mdx'].join(',')
const WORKSPACE_IMPORT_IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.avif,image/png,image/jpeg,image/webp,image/gif,image/avif'
type LaunchDropdownProps = {
  anchorRef: React.RefObject<HTMLElement>
  open: boolean
  onClose: () => void
  onOpenWorkflowPanel: () => void
  onLaunchSpotlight?: () => void
  onLaunchStatus?: () => void
  onCloseMainPanel?: () => void
}

export function LaunchDropdown({
  anchorRef,
  open,
  onClose,
  onOpenWorkflowPanel,
  onLaunchSpotlight,
  onLaunchStatus,
  onCloseMainPanel,
}: LaunchDropdownProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const imageInputRef = React.useRef<HTMLInputElement | null>(null)
  const folderInputRef = React.useRef<HTMLInputElement | null>(null)
  const [exportMenuOpen, setExportMenuOpen] = React.useState(false)
  const [pdfMenuOpen, setPdfMenuOpen] = React.useState(false)

  const pushUiToast = useGraphStore(s => s.pushUiToast)
  const canvas2dRenderer = useGraphStore(s => s.canvas2dRenderer)
  const setCanvasRenderMode = useGraphStore(s => s.setCanvasRenderMode)
  const setCanvas2dRenderer = useGraphStore(s => s.setCanvas2dRenderer)
  const setFlowchartDataSource = useGraphStore(s => s.setFlowchartDataSource)

  const bridge = getMarkdownWorkspaceActionBridge()

  React.useEffect(() => {
    if (!open) {
      return
    }
    setExportMenuOpen(false)
    setPdfMenuOpen(false)
  }, [canvas2dRenderer, open])

  const openExportMenu = React.useCallback(() => {
    setExportMenuOpen(true)
  }, [])

  const closeExportMenu = React.useCallback(() => {
    setExportMenuOpen(false)
    setPdfMenuOpen(false)
  }, [])

  const openPdfMenu = React.useCallback(() => {
    setPdfMenuOpen(true)
  }, [])

  const closePdfMenu = React.useCallback(() => {
    setPdfMenuOpen(false)
  }, [])

  const openFilePicker = React.useCallback((el: HTMLInputElement | null) => {
    if (!el) return false
    try {
      const anyEl = el as unknown as { showPicker?: () => void }
      if (typeof anyEl.showPicker === 'function') {
        anyEl.showPicker()
        return true
      }
    } catch {
      void 0
    }
    try {
      el.click()
      return true
    } catch {
      return false
    }
  }, [])

  const importLocalFilesFallback = React.useCallback(
    async (files: FileList | ReadonlyArray<File> | null) => {
      const mod = await loadLaunchDropdownFallbackModule()
      await mod.importLocalFilesFallback({ files, pushUiToast })
    },
    [pushUiToast],
  )

  const importLocalFolderFallback = React.useCallback(
    async (files: FileList | ReadonlyArray<File> | null) => {
      const mod = await loadLaunchDropdownFallbackModule()
      await mod.importLocalFolderFallback({ files, pushUiToast })
    },
    [pushUiToast],
  )

  const createNewFolderFallback = React.useCallback(async () => {
    const mod = await loadLaunchDropdownFallbackModule()
    await mod.createNewFolderFallback({ pushUiToast })
  }, [pushUiToast])

  const createNewMarkdownFile = React.useCallback(async () => {
    onClose()
    try {
      const createdPath = await createNewMarkdownSourceFile()
      pushUiToast({
        id: 'launch:new-markdown-file',
        kind: 'success',
        message: `Created ${createdPath}`,
        ttlMs: UI_TOAST_TTL_MS.actionFeedback,
      })
    } catch (e) {
      pushUiToast({
        id: 'launch:new-markdown-file',
        kind: 'error',
        message: `New .md failed: ${String((e as { message?: unknown })?.message ?? e)}`,
        ttlMs: UI_TOAST_TTL_MS.warningExtended,
        dismissible: true,
      })
    }
  }, [onClose, pushUiToast])

  const menuItemClass = cn(
    UI_RESPONSIVE_LAUNCH_MENU_ROW_CLASSNAME,
    'gap-2 rounded text-sm',
    UI_THEME_TOKENS.text.primary,
    UI_THEME_TOKENS.button.hoverBg,
  )
  const menuIconClass = cn(UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME, 'shrink-0')
  const menuRootClass = cn(
    'kg-launch-menu-root flex flex-col list-none m-0',
    UI_THEME_TOKENS.panel.bg,
    'border',
    UI_THEME_TOKENS.panel.border,
    'rounded shadow-md',
  )

  const fallbackExportActions = React.useMemo(
    () => ({
      htmlViewer: () => {
        void loadLaunchDropdownFallbackModule().then(mod => mod.exportHtmlViewerFallbackAction({ pushUiToast }))
      },
      htmlCanvas: () => {
        void loadLaunchDropdownFallbackModule().then(mod => mod.exportHtmlCanvasFallbackAction({ pushUiToast }))
      },
    }),
    [pushUiToast],
  )

  const exportActions = React.useMemo<LaunchDropdownExportActions>(
    () => ({ ...fallbackExportActions, ...((bridge.export || {}) as LaunchDropdownExportActions) }),
    [bridge.export, fallbackExportActions],
  )
  const canExport = hasLaunchDropdownExportActions(exportActions)

  const openWorkflowManager = React.useCallback(() => {
    onClose()
    const state = useGraphStore.getState()
    state.setStatusPanelPinned(false)
    state.setEnableLaunchSpotlight(false)
    onOpenWorkflowPanel()
  }, [onClose, onOpenWorkflowPanel])

  const fetchApiDataSource = React.useCallback(() => {
    onClose()
    setCanvasRenderMode('2d')
    setCanvas2dRenderer('flowchart')
    setFlowchartDataSource('api')
    pushUiToast({
      id: 'launch:fetch-api-data-source',
      kind: 'neutral',
      message: 'Fetching API data source…',
      ttlMs: 2500,
    })
  }, [onClose, pushUiToast, setCanvas2dRenderer, setCanvasRenderMode, setFlowchartDataSource])

  const importFolder = React.useCallback(async () => {
    const launchBridge = getMarkdownWorkspaceActionBridge()
    if (!hasLaunchAgentGraphFolderImporter(launchBridge)) {
      if (!openFilePicker(folderInputRef.current)) throw new Error('The browser folder chooser is unavailable.')
      return { status: 'requested-user-input' as const, message: 'Choose a local folder in the browser picker.' }
    }
    onClose()
    const result = await runLaunchImportAgentGraphFolder({ bridge: launchBridge })
    pushUiToast({
      id: 'launch:import:agent-graph-folder',
      kind: 'success',
      message: `Loaded knowledge graph projection (${result.projection.graphData.nodes.length} nodes, ${result.projection.graphData.edges.length} edges)`,
      ttlMs: UI_TOAST_TTL_MS.actionFeedback,
    })
    return { status: 'applied' as const, message: 'Imported the selected knowledge graph folder.' }
  }, [onClose, openFilePicker, pushUiToast])

  const createNewFolder = React.useCallback(async () => {
    onClose()
    const launchBridge = getMarkdownWorkspaceActionBridge()
    if (typeof launchBridge.createNewFolder === 'function') {
      launchBridge.createNewFolder()
      return
    }
    await createNewFolderFallback()
  }, [createNewFolderFallback, onClose])

  const saveCurrentWorkspace = React.useCallback(() => {
    const launchBridge = getMarkdownWorkspaceActionBridge()
    if (typeof launchBridge.save !== 'function') throw new Error('Open a writable Workspace before saving.')
    onClose()
    launchBridge.save()
  }, [onClose])

  React.useEffect(() => registerWorkspaceLaunchControlHandler(async (optionId: WorkspaceLaunchOptionId) => {
    if (optionId === 'home:open') {
      window.location.assign(AIRVIO_HOME_URL)
      return { status: 'applied', message: 'Opened Home.' }
    }
    if (optionId === 'spotlight:open') {
      if (typeof onLaunchSpotlight !== 'function') throw new Error('Launch Spotlight is unavailable.')
      onClose()
      onCloseMainPanel?.()
      onLaunchSpotlight()
      return { status: 'applied', message: 'Opened Spotlight.' }
    }
    if (optionId === 'workflowManager:open') {
      openWorkflowManager()
      return { status: 'applied', message: 'Opened Workflow Manager.' }
    }
    if (optionId === 'importLocalFiles:choose' || optionId === 'importImage:choose') {
      const input = optionId === 'importLocalFiles:choose' ? fileInputRef.current : imageInputRef.current
      if (!openFilePicker(input)) throw new Error('The browser file chooser is unavailable.')
      return { status: 'requested-user-input', message: 'Choose local files in the browser picker.' }
    }
    if (optionId === 'fetchApiDataSource:open') {
      fetchApiDataSource()
      return { status: 'applied', message: 'Opened the API data-source flow.' }
    }
    if (optionId === 'importFolder:choose') return importFolder()
    if (optionId === 'importUrl:configure') {
      const state = useGraphStore.getState()
      state.setFloatingPanelView('skillsCommands')
      state.setFloatingPanelOpen(true)
      await targetSkillsCommandsMcpInvocation(IMPORT_URL_AGENT_READY_MCP_TOOL_NAME)
      return { status: 'requested-user-input', message: 'Opened the Import URL command; provide a URL to continue.' }
    }
    if (optionId === 'newMarkdown:create') {
      await createNewMarkdownFile()
      return { status: 'applied', message: 'Created a new Markdown document.' }
    }
    if (optionId === 'newFolder:create') {
      await createNewFolder()
      return { status: 'applied', message: 'Created a new workspace folder.' }
    }
    if (optionId === 'save:current') {
      saveCurrentWorkspace()
      return { status: 'applied', message: 'Saved the current workspace.' }
    }
    if (optionId === 'export:configure') {
      if (!open || !canExport) throw new Error('Open Launch with an export-capable Workspace before choosing an export format.')
      openExportMenu()
      return { status: 'requested-user-input', message: 'Choose an export format from the open Launch menu.' }
    }
    if (typeof onLaunchStatus !== 'function') throw new Error('Launch Status is unavailable.')
    onClose()
    onCloseMainPanel?.()
    onLaunchStatus()
    return { status: 'applied', message: 'Opened Status.' }
  }), [
    canExport,
    createNewFolder,
    createNewMarkdownFile,
    fetchApiDataSource,
    importFolder,
    onClose,
    onCloseMainPanel,
    onLaunchSpotlight,
    onLaunchStatus,
    open,
    openExportMenu,
    openFilePicker,
    openWorkflowManager,
    saveCurrentWorkspace,
  ])

  const runExportAction = React.useCallback(
    (label: string, action: (() => void) | undefined) => {
      if (typeof action !== 'function') {
        pushUiToast({ id: 'launch:export:missing', kind: 'warning', message: `${label}: open Workspace to export` })
        return
      }
      onClose()
      action()
    },
    [onClose, pushUiToast],
  )

  return (
    <>
      <input
        ref={el => {
          fileInputRef.current = el
        }}
        type="file"
        className="sr-only"
        accept={WORKSPACE_IMPORT_ACCEPT}
        multiple
        onChange={e => {
          const files = e.target.files
          const launchBridge = getMarkdownWorkspaceActionBridge()
          void runLaunchImportLocalFiles({
            files,
            bridge: launchBridge,
            fallback: importLocalFilesFallback,
          })
          onClose()
          try {
            e.currentTarget.value = ''
          } catch {
            void 0
          }
        }}
      />

      <input
        ref={imageInputRef}
        type="file" className="sr-only" accept={WORKSPACE_IMPORT_IMAGE_ACCEPT} multiple
        onChange={e => {
          const files = e.target.files ? Array.from(e.target.files) : []
          importLocalImagesWithWorkspaceBridgeRetry({ files, pushUiToast })
          onClose()
          try {
            e.currentTarget.value = ''
          } catch {
            void 0
          }
        }}
      />

      <input
        ref={el => {
          folderInputRef.current = el
          if (!el) return
          try {
            el.setAttribute('webkitdirectory', '')
            el.setAttribute('directory', '')
          } catch {
            void 0
          }
        }}
        type="file"
        className="sr-only"
        multiple
        onChange={e => {
          const files = e.target.files
          const launchBridge = getMarkdownWorkspaceActionBridge()
          void runLaunchImportLocalFolderPreview({
            files,
            bridge: launchBridge,
            fallback: importLocalFolderFallback,
          }).catch(error => {
            pushUiToast({
              id: 'launch:import:folder-preview',
              kind: 'error',
              message: String((error as { message?: unknown })?.message || 'Browser folder preview failed.'),
              ttlMs: UI_TOAST_TTL_MS.warningExtended,
              dismissible: true,
            })
          })
          onClose()
          try {
            e.currentTarget.value = ''
          } catch {
            void 0
          }
        }}
      />

      <DropdownPanel anchorRef={anchorRef} open={open} onClose={onClose} align="bottom-left">
        <menu className={menuRootClass} aria-label="Launch">
          <li className="list-none">
            <a
              href={AIRVIO_HOME_URL}
              className={menuItemClass}
              onClick={onClose}
              aria-label="Home"
              data-kg-launch-home="true"
            >
              <Home className={menuIconClass} strokeWidth={1.6} />
              <span className="truncate">Home</span>
              <WorkspaceLaunchRowValue label="Home" value="Open" optionId="home:open" />
            </a>
          </li>

          <li className={cn('my-1 border-t', UI_THEME_TOKENS.panel.divider)} aria-hidden="true" />

          {typeof onLaunchSpotlight === 'function' ? (
            <li className="list-none">
              <button
                type="button"
                className={menuItemClass}
                aria-label="Spotlight"
                onClick={() => {
                  onClose()
                  if (typeof onCloseMainPanel === 'function') onCloseMainPanel()
                  onLaunchSpotlight()
                }}
              >
                <Sparkles className={menuIconClass} strokeWidth={1.6} />
                <span className="truncate">Spotlight</span>
                <WorkspaceLaunchRowValue label="Spotlight" value="Open" optionId="spotlight:open" />
              </button>
            </li>
          ) : null}

          <li className="list-none">
            <button
              type="button"
              className={menuItemClass}
              aria-label="Workflow Manager"
              onClick={openWorkflowManager}
            >
              <Workflow className={menuIconClass} strokeWidth={1.6} />
              <span className="truncate">Workflow Manager</span>
              <WorkspaceLaunchRowValue label="Workflow Manager" value="Open" optionId="workflowManager:open" />
            </button>
          </li>

          <li className={cn('my-1 border-t', UI_THEME_TOKENS.panel.divider)} aria-hidden="true" />

          <li className="list-none">
            <button
              type="button"
              className={menuItemClass}
              aria-label="Import local files"
              onClick={() => {
                openFilePicker(fileInputRef.current)
              }}
            >
              <Upload className={menuIconClass} strokeWidth={1.6} />
              <span className="truncate">Import local files</span>
              <WorkspaceLaunchRowValue label="Import local files" value="Choose files" optionId="importLocalFiles:choose" />
            </button>
          </li>

          <li className="list-none">
            <button type="button" className={menuItemClass} aria-label="Import Image" onClick={() => openFilePicker(imageInputRef.current)}>
              <ImageIcon className={menuIconClass} strokeWidth={1.6} />
              <span className="truncate">Import Image</span>
              <WorkspaceLaunchRowValue label="Import Image" value="Choose images" optionId="importImage:choose" />
            </button>
          </li>

          <li className="list-none">
            <button
              type="button"
              className={menuItemClass}
              aria-label="Fetch API Data Source"
              onClick={fetchApiDataSource}
            >
              <CloudDownload className={menuIconClass} strokeWidth={1.6} />
              <span className="truncate">Fetch API Data Source</span>
              <WorkspaceLaunchRowValue label="Fetch API Data Source" value="Open" optionId="fetchApiDataSource:open" />
            </button>
          </li>

          <li className="list-none">
            <button
              type="button"
              className={menuItemClass}
              aria-label="Import folder"
              onClick={() => { void importFolder().catch(error => pushUiToast({ id: 'launch:import:agent-graph-folder', kind: 'error', message: String((error as { message?: unknown })?.message || 'Knowledge graph folder import failed.'), ttlMs: UI_TOAST_TTL_MS.warningExtended, dismissible: true })) }}
            >
              <FolderOpen className={menuIconClass} strokeWidth={1.6} />
              <span className="truncate">Import folder</span>
              <WorkspaceLaunchRowValue label="Import folder" value="Choose folder" optionId="importFolder:choose" />
            </button>
          </li>

          <LaunchDropdownImportUrlItem
            canvas2dRenderer={canvas2dRenderer}
            menuIconClass={menuIconClass}
            menuItemClass={menuItemClass}
            onClose={onClose}
            open={open}
            pushUiToast={pushUiToast}
          />

          <li className="list-none">
            <button
              type="button"
              className={menuItemClass}
              aria-label="New .md"
              onClick={() => {
                void createNewMarkdownFile()
              }}
            >
              <FilePlus2 className={menuIconClass} strokeWidth={1.6} />
              <span className="truncate">New .md</span>
              <WorkspaceLaunchRowValue label="New .md" value="Create" optionId="newMarkdown:create" />
            </button>
          </li>

          <li className="list-none">
            <button
              type="button"
              className={menuItemClass}
              aria-label="New folder"
              onClick={() => { void createNewFolder() }}
            >
              <FolderPlus className={menuIconClass} strokeWidth={1.6} />
              <span className="truncate">New folder</span>
              <WorkspaceLaunchRowValue label="New folder" value="Create" optionId="newFolder:create" />
            </button>
          </li>

          <li className="list-none">
            <button
              type="button"
              className={menuItemClass}
              aria-label="Save"
              onClick={() => saveCurrentWorkspace()}
              disabled={typeof bridge.save !== 'function'}
            >
              <Save className={menuIconClass} strokeWidth={1.6} />
              <span className="truncate">Save</span>
              <WorkspaceLaunchRowValue label="Save" value="Current" optionId="save:current" />
            </button>
          </li>

          <li className={cn('my-1 border-t', UI_THEME_TOKENS.panel.divider)} aria-hidden="true" />

          <LaunchDropdownExportMenu
            canExport={canExport}
            exportActions={exportActions}
            exportMenuOpen={exportMenuOpen}
            pdfMenuOpen={pdfMenuOpen}
            menuItemClass={menuItemClass}
            menuIconClass={menuIconClass}
            openExportMenu={openExportMenu}
            closeExportMenu={closeExportMenu}
            openPdfMenu={openPdfMenu}
            closePdfMenu={closePdfMenu}
            runExportAction={runExportAction}
          />

          <li className={cn('my-1 border-t', UI_THEME_TOKENS.panel.divider)} aria-hidden="true" />

          {typeof onLaunchStatus === 'function' ? (
            <li className="list-none">
              <button
                type="button"
                className={menuItemClass}
                aria-label="Status"
                onClick={() => {
                  onClose()
                  if (typeof onCloseMainPanel === 'function') onCloseMainPanel()
                  onLaunchStatus()
                }}
              >
                <BarChart3 className={menuIconClass} strokeWidth={1.6} />
                <span className="truncate">Status</span>
                <WorkspaceLaunchRowValue label="Status" value="Open" optionId="status:open" />
              </button>
            </li>
          ) : null}

          {!canExport ? (
            <li className={cn('px-2 py-1 text-xs', UI_THEME_TOKENS.text.tertiary)}>Exports available in Workspace</li>
          ) : null}
        </menu>
      </DropdownPanel>
    </>
  )
}
