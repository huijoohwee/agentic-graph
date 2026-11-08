import React from 'react'
import {
  FileDiff,
  LayoutPanelTop,
  Maximize2,
  X,
} from 'lucide-react'
import type { MarkdownWorkspaceLayoutMode } from '@/features/markdown-explorer/workspaceUi'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { WorkspaceHeaderRow } from '@/components/ui/WorkspaceHeader'
import { CollapsibleToolbar } from '@/components/ui/CollapsibleToolbar'
import { useMediaQuery } from '@/lib/ui/useMediaQuery'
import type { MarkdownPresentationApi } from './markdownWorkspaceTypes'
import { ToggleButtonGroup, ToggleButton } from '@agentic-base/views-react/controls'
import type { WebpageFrontmatterMeta, WebpageViewMode } from '@/lib/markdown/frontmatter'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_LABELS } from '@/lib/config'
import {
  UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import {
  uiToolbarRowScrollClassName,
  uiToolbarRowScrollListClassName,
} from '@/features/toolbar/ui/toolbarStyles'
import { closeWorkspaceView } from '@/features/workspace-table/workspaceTableSsot'
import {
  DEFAULT_MARKDOWN_WORKSPACE_PANE_AVAILABILITY,
  DEFAULT_MARKDOWN_WORKSPACE_PANE_VISIBILITY,
  resolveMarkdownWorkspacePaneVisibility,
  type MarkdownWorkspacePaneAvailability,
  type MarkdownWorkspacePaneVisibility,
} from './main/types'
import type { MarkdownWorkspaceDerivedViewerMode } from './main/viewer/MarkdownWorkspaceDerivedViewer'
import {
  MarkdownWorkspaceDisplayMenu,
  MarkdownWorkspacePresentationNavMenu,
} from '@/features/markdown-workspace/MarkdownWorkspaceToolbarInlineMenus'

const MARKDOWN_WORKSPACE_TOOLBAR_GLYPH_CLASSNAME = UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME

export type MarkdownWorkspaceToolbarProps = {
  explorerOpen: boolean
  setExplorerOpen: (next: boolean) => void

  canvasOpen: boolean
  setCanvasOpen: (next: boolean) => void

  layoutMode: MarkdownWorkspaceLayoutMode
  setLayoutMode: (mode: MarkdownWorkspaceLayoutMode) => void
  markdownWordWrap: boolean
  setMarkdownWordWrap: (next: boolean) => void
  markdownTextHighlight: boolean
  setMarkdownTextHighlight: (next: boolean) => void
  documentVersionGraphOpen?: boolean
  setDocumentVersionGraphOpen?: (next: boolean) => void

  viewerKind?: 'markdown' | 'html' | 'json'
  viewerMode?: MarkdownWorkspaceDerivedViewerMode
  setViewerMode?: (next: MarkdownWorkspaceDerivedViewerMode) => void
  splitPaneVisibility?: MarkdownWorkspacePaneVisibility
  setSplitPaneVisibility?: (next: MarkdownWorkspacePaneVisibility) => void
  paneAvailability?: MarkdownWorkspacePaneAvailability
  onSaveAs?: () => void
  onExportWorkspaceFile?: () => void
  onExportMarkdown?: () => void
  onExportHtmlViewer?: () => void
  onExportHtmlCanvas?: () => void
  onExportJson?: () => void
  onExportSvg?: () => void
  onToggleFullscreen: () => void
  presentationApiRef: React.MutableRefObject<MarkdownPresentationApi | null>

  webpageWorkspaceMeta?: WebpageFrontmatterMeta | null
  onWebpageChangeView?: (view: WebpageViewMode) => void
  contentFormat?: 'markdown' | 'json' | null
  onContentFormatChange?: (format: 'markdown' | 'json') => void | Promise<void>
  forceMarkdownEditorInEditorMode?: boolean
}

const TOOLBAR_BUTTON_CLASSNAME = `kg-toolbar-btn ${UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME} justify-center rounded ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`

export function MarkdownWorkspaceToolbar({
  explorerOpen,
  setExplorerOpen,
  canvasOpen,
  setCanvasOpen,
  layoutMode,
  setLayoutMode,
  markdownWordWrap,
  setMarkdownWordWrap,
  markdownTextHighlight,
  setMarkdownTextHighlight,
  documentVersionGraphOpen = false,
  setDocumentVersionGraphOpen,
  viewerKind,
  viewerMode,
  setViewerMode,
  splitPaneVisibility,
  setSplitPaneVisibility,
  paneAvailability,
  onSaveAs,
  onExportWorkspaceFile,
  onExportMarkdown,
  onExportHtmlViewer,
  onExportHtmlCanvas,
  onExportJson,
  onExportSvg,
  onToggleFullscreen,
  presentationApiRef,
  webpageWorkspaceMeta,
  onWebpageChangeView,
  contentFormat,
  onContentFormatChange,
  forceMarkdownEditorInEditorMode,
}: MarkdownWorkspaceToolbarProps) {
  const setWorkspaceViewMode = useGraphStore(s => s.setWorkspaceViewMode)
  const setWorkspaceViewState = useGraphStore(s => s.setWorkspaceViewState)
  const workspaceViewMode = useGraphStore(s => s.workspaceViewMode)
  const isTouchToolbarViewport = useMediaQuery('(max-width: 768px), (pointer: coarse)')
  const canNavigateSlides = layoutMode === 'presentation'
  const effectiveSplitPanes = React.useMemo(
    () => splitPaneVisibility || DEFAULT_MARKDOWN_WORKSPACE_PANE_VISIBILITY,
    [splitPaneVisibility],
  )
  const effectivePaneAvailability = React.useMemo(
    () => paneAvailability || DEFAULT_MARKDOWN_WORKSPACE_PANE_AVAILABILITY,
    [paneAvailability],
  )
  const effectivePaneVisibility = React.useMemo(
    () => resolveMarkdownWorkspacePaneVisibility({
      layoutMode,
      splitPaneVisibility: effectiveSplitPanes,
      paneAvailability: effectivePaneAvailability,
      forceMarkdownEditorInEditorMode,
    }),
    [effectivePaneAvailability, effectiveSplitPanes, forceMarkdownEditorInEditorMode, layoutMode],
  )
  const showMarkdownDisplayMenu = viewerKind === 'markdown' && (viewerMode === 'read' || !viewerMode)
  const workspacePanesControlId = React.useId()
  const webpageControls = React.useMemo(() => {
    const meta = webpageWorkspaceMeta
    if (!meta || !meta.url) return null
    return { view: meta.view }
  }, [webpageWorkspaceMeta])
  const visiblePaneCount = React.useCallback((current: MarkdownWorkspacePaneVisibility) => (
    Number(!!current.python && !!effectivePaneAvailability.python) +
    Number(!!current.block && !!effectivePaneAvailability.block) +
    Number(current.json && effectivePaneAvailability.json) +
    Number(current.markdown && effectivePaneAvailability.markdown) +
    Number(current.viewer && effectivePaneAvailability.viewer) +
    Number(current.html && effectivePaneAvailability.html && !!webpageControls)
  ), [effectivePaneAvailability.python, effectivePaneAvailability.block, effectivePaneAvailability.html, effectivePaneAvailability.json, effectivePaneAvailability.markdown, effectivePaneAvailability.viewer, webpageControls])
  const resolveViewerEditPaneVisibility = React.useCallback((current: MarkdownWorkspacePaneVisibility): MarkdownWorkspacePaneVisibility => {
    if ((current.markdown && effectivePaneAvailability.markdown) || (current.json && effectivePaneAvailability.json)) return current
    if (contentFormat === 'json' && effectivePaneAvailability.json) return { ...current, json: true }
    if (contentFormat === 'markdown' && effectivePaneAvailability.markdown) return { ...current, markdown: true }
    if (effectivePaneAvailability.markdown) return { ...current, markdown: true }
    if (effectivePaneAvailability.json) return { ...current, json: true }
    return current
  }, [contentFormat, effectivePaneAvailability.json, effectivePaneAvailability.markdown])
  const toggleSplitPane = React.useCallback((key: 'python' | 'block' | 'json' | 'markdown' | 'viewer') => {
    if (!setSplitPaneVisibility) return
    const current = effectiveSplitPanes
    if (key === 'python' && current.block && current.python) return
    const enabledCount = visiblePaneCount(current)
    if (current[key] && enabledCount <= 1) return
    const next = { ...current, [key]: !current[key] }
    if (key === 'block' && next.block) next.python = true
    setSplitPaneVisibility(
      key === 'viewer' && next.viewer
        ? resolveViewerEditPaneVisibility(next)
        : next,
    )
  }, [effectiveSplitPanes, resolveViewerEditPaneVisibility, setSplitPaneVisibility, visiblePaneCount])
  const handleSplitPaneToggle = React.useCallback((key: 'python' | 'block' | 'json' | 'markdown' | 'viewer') => {
    if (!setSplitPaneVisibility) return
    if (!effectivePaneAvailability[key]) return
    if (layoutMode !== 'split') {
      setLayoutMode('split')
    }
    toggleSplitPane(key)
  }, [effectivePaneAvailability, layoutMode, setLayoutMode, setSplitPaneVisibility, toggleSplitPane])
  const handleContentPaneToggle = React.useCallback((key: 'json' | 'markdown') => {
    if (!setSplitPaneVisibility) return
    if (!effectivePaneAvailability[key]) return
    if (effectivePaneAvailability.python) {
      handleSplitPaneToggle(key)
      return
    }
    const current = effectiveSplitPanes
    const isVisible = Boolean(current[key])
    const hasFormatSwitch = !!contentFormat && !!onContentFormatChange
    if (hasFormatSwitch && contentFormat !== key) {
      if (layoutMode !== 'split') {
        setLayoutMode('split')
      }
      if (!isVisible) {
        setSplitPaneVisibility({ ...current, [key]: true })
      }
      void onContentFormatChange(key)
      return
    }
    handleSplitPaneToggle(key)
  }, [
    contentFormat,
    effectivePaneAvailability,
    effectiveSplitPanes,
    handleSplitPaneToggle,
    layoutMode,
    onContentFormatChange,
    setLayoutMode,
    setSplitPaneVisibility,
  ])
  const htmlPaneAvailable = effectivePaneAvailability.html && !!webpageControls && !!onWebpageChangeView
  const htmlPaneChecked = htmlPaneAvailable && effectiveSplitPanes.html
  const handleHtmlPaneToggle = React.useCallback(() => {
    if (!setSplitPaneVisibility) return
    if (!htmlPaneAvailable || !onWebpageChangeView) return
    const current = effectiveSplitPanes
    if (htmlPaneChecked) {
      if (visiblePaneCount(current) <= 1) return
      setSplitPaneVisibility({ ...current, html: false })
      if (webpageControls?.view === 'html') {
        onWebpageChangeView('markdown')
      }
      return
    }
    if (layoutMode !== 'split') {
      setLayoutMode('split')
    }
    setSplitPaneVisibility({
      ...current,
      viewer: current.viewer || effectivePaneAvailability.viewer,
      html: true,
    })
    onWebpageChangeView('html')
  }, [effectivePaneAvailability.viewer, effectiveSplitPanes, htmlPaneAvailable, htmlPaneChecked, layoutMode, onWebpageChangeView, setLayoutMode, setSplitPaneVisibility, visiblePaneCount, webpageControls?.view])

  const paneToggleTitle = (label: string, available: boolean): string =>
    available ? label : `${label} not applicable for this Source File`
  const showDocumentVersionGraphToggle = typeof setDocumentVersionGraphOpen === 'function'

  return (
      <WorkspaceHeaderRow className="kg-markdown-workspace-panel-toolbar-row kg-markdown-workspace-toolbar-row !py-0" ariaLabel="Markdown toolbar row">
        <CollapsibleToolbar forceExpanded={isTouchToolbarViewport} className={`kg-toolbar kg-markdown-workspace-toolbar-controls kg-workspace-toolbar-controls ${uiToolbarRowScrollClassName} gap-1`} ariaLabel="Markdown view controls">
        <menu className={`${uiToolbarRowScrollListClassName} gap-1`} aria-label="Layout mode">
          <li className="kg-workspace-pane-toggles-item list-none">
            <ToggleButtonGroup
              id={workspacePanesControlId}
              aria-label="Workspace panes"
              title="Workspace panes"
            >
              <ToggleButton
                title="Explorer pane"
                aria-label="Show Explorer pane"
                pressed={explorerOpen}
                onClick={() => setExplorerOpen(!explorerOpen)}
              >
                Explorer
              </ToggleButton>
              <ToggleButton
                title={paneToggleTitle('bin', effectivePaneAvailability.bin)}
                aria-label="Show binary model pane"
                pressed={effectivePaneAvailability.bin}
                disabled
              >
                bin
              </ToggleButton>
              <ToggleButton
                title={effectivePaneVisibility.block ? 'Close Block before hiding Python' : paneToggleTitle('Python editor pane', !!effectivePaneAvailability.python)}
                aria-label="Show Python editor pane"
                pressed={!!effectivePaneVisibility.python}
                disabled={!effectivePaneAvailability.python || !!effectivePaneVisibility.block}
                onClick={() => handleSplitPaneToggle('python')}
              >
                Python
              </ToggleButton>
              <ToggleButton
                title={paneToggleTitle('Block editor pane', !!effectivePaneAvailability.block)}
                aria-label="Show Block editor pane"
                pressed={!!effectivePaneVisibility.block}
                disabled={!effectivePaneAvailability.block}
                onClick={() => handleSplitPaneToggle('block')}
              >
                Block
              </ToggleButton>
              <ToggleButton
                title={paneToggleTitle('JSON', effectivePaneAvailability.json)}
                aria-label="Show JSON editor pane"
                pressed={effectivePaneVisibility.json}
                disabled={!effectivePaneAvailability.json}
                onClick={() => {
                  if (!effectivePaneAvailability.json) return
                  handleContentPaneToggle('json')
                }}
              >
                JSON
              </ToggleButton>
              <ToggleButton
                title={paneToggleTitle('Markdown editor pane', effectivePaneAvailability.markdown)}
                aria-label="Show Markdown editor pane"
                pressed={effectivePaneVisibility.markdown}
                disabled={!effectivePaneAvailability.markdown}
                onClick={() => {
                  if (!effectivePaneAvailability.markdown) return
                  handleContentPaneToggle('markdown')
                }}
              >
                Markdown
              </ToggleButton>
              {showDocumentVersionGraphToggle ? (
                <ToggleButton
                  title="Document version graph"
                  aria-label="Show document version graph"
                  pressed={documentVersionGraphOpen}
                  onClick={() => setDocumentVersionGraphOpen?.(!documentVersionGraphOpen)}
                  data-kg-markdown-workspace-document-version-graph-toggle="1"
                >
                  <FileDiff className={MARKDOWN_WORKSPACE_TOOLBAR_GLYPH_CLASSNAME} aria-hidden="true" /> diff
                </ToggleButton>
              ) : null}
              <ToggleButton
                title={paneToggleTitle('Viewer preview pane', effectivePaneAvailability.viewer)}
                aria-label="Show Viewer preview pane"
                pressed={effectivePaneVisibility.viewer}
                disabled={!effectivePaneAvailability.viewer}
                onClick={() => {
                  if (!effectivePaneAvailability.viewer) return
                  handleSplitPaneToggle('viewer')
                }}
              >
                Viewer
              </ToggleButton>
              <ToggleButton
                title={paneToggleTitle('HTML', htmlPaneAvailable)}
                aria-label="Show HTML viewer pane"
                pressed={htmlPaneChecked}
                disabled={!htmlPaneAvailable}
                onClick={handleHtmlPaneToggle}
              >
                HTML
              </ToggleButton>
              {typeof canvasOpen === 'boolean' && typeof setCanvasOpen === 'function' ? (
                <ToggleButton
                  title="Canvas pane"
                  aria-label="Show Canvas pane"
                  pressed={canvasOpen}
                  onClick={() => setCanvasOpen(!canvasOpen)}
                >
                  Canvas
                </ToggleButton>
              ) : null}
            </ToggleButtonGroup>
          </li>
          <li className="list-none">
            <button
              type="button"
              className={TOOLBAR_BUTTON_CLASSNAME}
              aria-pressed={layoutMode === 'presentation'}
              title="Presentation"
              onClick={() => setLayoutMode('presentation')}
            >
              <LayoutPanelTop className={MARKDOWN_WORKSPACE_TOOLBAR_GLYPH_CLASSNAME} />
            </button>
          </li>
        </menu>
        <MarkdownWorkspacePresentationNavMenu
          canNavigateSlides={canNavigateSlides}
          toolbarButtonClassName={TOOLBAR_BUTTON_CLASSNAME}
          presentationApiRef={presentationApiRef}
        />
        {showMarkdownDisplayMenu ? (
          <MarkdownWorkspaceDisplayMenu
            toolbarButtonClassName={TOOLBAR_BUTTON_CLASSNAME}
            markdownTextHighlight={markdownTextHighlight}
            setMarkdownTextHighlight={setMarkdownTextHighlight}
            markdownWordWrap={markdownWordWrap}
            setMarkdownWordWrap={setMarkdownWordWrap}
          />
        ) : null}
        <menu className={`${uiToolbarRowScrollListClassName} gap-1`} aria-label="Actions">
          <li className="list-none">
            <button type="button" className={TOOLBAR_BUTTON_CLASSNAME} title="Fullscreen" onClick={onToggleFullscreen}>
              <Maximize2 className={MARKDOWN_WORKSPACE_TOOLBAR_GLYPH_CLASSNAME} />
            </button>
          </li>
          <li className="list-none">
            <button
              type="button"
              className={TOOLBAR_BUTTON_CLASSNAME}
              title={UI_LABELS.close}
              onClick={() => {
                closeWorkspaceView({
                  workspaceViewMode: workspaceViewMode === 'editor' ? 'editor' : 'canvas',
                  workspaceCanvasPaneOpen: canvasOpen,
                  setWorkspaceViewMode,
                  setWorkspaceViewState,
                  setWorkspaceCanvasPaneOpen: setCanvasOpen,
                })
              }}
            >
              <X className={MARKDOWN_WORKSPACE_TOOLBAR_GLYPH_CLASSNAME} />
            </button>
          </li>
        </menu>
        </CollapsibleToolbar>
      </WorkspaceHeaderRow>
  )
}
