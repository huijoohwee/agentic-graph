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
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { PanelCheckbox } from '@/lib/ui/panelFormControls'
import { WorkspaceModeSelect } from './WorkspaceModeSelect'
import type { WebpageFrontmatterMeta, WebpageViewMode } from '@/lib/markdown/frontmatter'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_LABELS } from '@/lib/config'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import {
  UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
  UI_RESPONSIVE_LABEL_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import {
  uiToolbarRowScrollInlineClassName,
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

  webpageSignalSummary?: {
    nav: number
    cta: number
    price: number
    time: number
  } | null

  webpageWorkspaceMeta?: WebpageFrontmatterMeta | null
  onWebpageChangeView?: (view: WebpageViewMode) => void
  onWebpageUpdateMeta?: (patch: { fidelityLevel?: 1 | 2 | 3 | 4 }) => void
  contentFormat?: 'markdown' | 'json' | null
  onContentFormatChange?: (format: 'markdown' | 'json') => void | Promise<void>
  forceMarkdownEditorInEditorMode?: boolean
}

const TOOLBAR_BUTTON_CLASSNAME = `kg-toolbar-btn ${UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME} justify-center rounded ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`

type WorkspacePaneToggleProps = {
  label: string
  title: string
  ariaLabel: string
  checked: boolean
  labelClassName: string
  textClassName: string
  disabled?: boolean
  ariaDisabled?: boolean | 'true'
  onChange?: React.ChangeEventHandler<HTMLInputElement>
  icon?: React.ReactNode
  labelProps?: Omit<React.LabelHTMLAttributes<HTMLLabelElement>, 'className' | 'title'> & Record<`data-${string}`, string | undefined>
}

function WorkspacePaneToggle({
  label,
  title,
  ariaLabel,
  checked,
  labelClassName,
  textClassName,
  disabled,
  ariaDisabled,
  onChange,
  icon,
  labelProps,
}: WorkspacePaneToggleProps) {
  return (
    <label
      {...labelProps}
      className={labelClassName}
      title={title}
    >
      <PanelCheckbox
        className="kg-workspace-pane-toggle-input"
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        aria-disabled={ariaDisabled}
        onChange={onChange}
      />
      {icon}
      <span className={textClassName}>{label}</span>
    </label>
  )
}

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
  webpageSignalSummary,
  webpageWorkspaceMeta,
  onWebpageChangeView,
  onWebpageUpdateMeta,
  contentFormat,
  onContentFormatChange,
  forceMarkdownEditorInEditorMode,
}: MarkdownWorkspaceToolbarProps) {
  const panelTypography = usePanelTypography()
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
    const view = meta.view
    const fidelityMode: 'inherit' | '1' | '2' | '3' | '4' =
      meta.fidelityLevel === 1
        ? '1'
        : meta.fidelityLevel === 2
          ? '2'
          : meta.fidelityLevel === 3
            ? '3'
            : meta.fidelityLevel === 4
              ? '4'
              : 'inherit'
    return { view, fidelityMode }
  }, [webpageWorkspaceMeta])
  const visiblePaneCount = React.useCallback((current: MarkdownWorkspacePaneVisibility) => (
    Number(!!current.python && !!effectivePaneAvailability.python) +
    Number(current.json && effectivePaneAvailability.json) +
    Number(current.markdown && effectivePaneAvailability.markdown) +
    Number(current.viewer && effectivePaneAvailability.viewer) +
    Number(current.html && effectivePaneAvailability.html && !!webpageControls)
  ), [effectivePaneAvailability.python, effectivePaneAvailability.html, effectivePaneAvailability.json, effectivePaneAvailability.markdown, effectivePaneAvailability.viewer, webpageControls])
  const resolveViewerEditPaneVisibility = React.useCallback((current: MarkdownWorkspacePaneVisibility): MarkdownWorkspacePaneVisibility => {
    if ((current.markdown && effectivePaneAvailability.markdown) || (current.json && effectivePaneAvailability.json)) return current
    if (contentFormat === 'json' && effectivePaneAvailability.json) return { ...current, json: true }
    if (contentFormat === 'markdown' && effectivePaneAvailability.markdown) return { ...current, markdown: true }
    if (effectivePaneAvailability.markdown) return { ...current, markdown: true }
    if (effectivePaneAvailability.json) return { ...current, json: true }
    return current
  }, [contentFormat, effectivePaneAvailability.json, effectivePaneAvailability.markdown])
  const toggleSplitPane = React.useCallback((key: 'python' | 'json' | 'markdown' | 'viewer') => {
    if (!setSplitPaneVisibility) return
    const current = effectiveSplitPanes
    const enabledCount = visiblePaneCount(current)
    if (current[key] && enabledCount <= 1) return
    const next = { ...current, [key]: !current[key] }
    setSplitPaneVisibility(
      key === 'viewer' && next.viewer
        ? resolveViewerEditPaneVisibility(next)
        : next,
    )
  }, [effectiveSplitPanes, resolveViewerEditPaneVisibility, setSplitPaneVisibility, visiblePaneCount])
  const handleSplitPaneToggle = React.useCallback((key: 'python' | 'json' | 'markdown' | 'viewer') => {
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

  const webpageSignalsNode = React.useMemo(() => {
    const s = webpageSignalSummary
    if (!s) return null
    const allItems: Array<{ label: string; value: number; tone: 'nav' | 'cta' | 'price' | 'time' }> = [
      { label: 'NAV', value: s.nav, tone: 'nav' },
      { label: 'CTA', value: s.cta, tone: 'cta' },
      { label: 'PRICE', value: s.price, tone: 'price' },
      { label: 'TIME', value: s.time, tone: 'time' },
    ]
    const items = allItems.filter(it => it.value > 0)
    if (!items.length) return null

    const pillClass = `inline-flex items-center gap-1 h-6 rounded-full border px-2 ${panelTypography.microLabelClass}`
    const toneClass = (tone: 'nav' | 'cta' | 'price' | 'time') => {
      if (tone === 'cta') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
      if (tone === 'nav') return 'border-blue-200 bg-blue-50 text-blue-700'
      if (tone === 'price') return 'border-amber-200 bg-amber-50 text-amber-700'
      if (tone === 'time') return 'border-violet-200 bg-violet-50 text-violet-700'
      return `${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.secondary}`
    }

    return (
      <span
        className={`${uiToolbarRowScrollInlineClassName} gap-1`}
        aria-label="Webpage signals"
        title="Derived from the current markdown: link labels (NAV/CTA) plus detected price/time tokens."
      >
        {items.map(it => (
          <span key={it.label} className={`${pillClass} ${toneClass(it.tone)}`}>
            <span className="font-semibold">[{it.label}]</span>
            <span>{it.value}</span>
          </span>
        ))}
      </span>
    )
  }, [panelTypography.microLabelClass, webpageSignalSummary])

  const paneToggleLabelClass = (available: boolean): string =>
    `kg-workspace-pane-toggle ${UI_RESPONSIVE_LABEL_ROW_CLASSNAME} ${available ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'}`
  const paneToggleTitle = (label: string, available: boolean): string =>
    available ? label : `${label} not applicable for this Source File`
  const paneToggleTextClassName = `kg-workspace-pane-toggle-label ${UI_TEXT_TRUNCATE}`
  const showDocumentVersionGraphToggle = typeof setDocumentVersionGraphOpen === 'function'

  return (
      <WorkspaceHeaderRow className="kg-markdown-workspace-panel-toolbar-row kg-markdown-workspace-toolbar-row !py-0" ariaLabel="Markdown toolbar row">
        {webpageSignalsNode ? (
          <span className="kg-markdown-workspace-toolbar-leading flex min-w-0 max-w-full items-center overflow-hidden">
            <span className="sr-only">Workspace editor</span>
            {webpageSignalsNode}
          </span>
        ) : (
          <span className="sr-only">Workspace editor</span>
        )}
        <CollapsibleToolbar forceExpanded={isTouchToolbarViewport} className={`kg-toolbar kg-markdown-workspace-toolbar-controls kg-workspace-toolbar-controls ${uiToolbarRowScrollClassName} gap-1`} ariaLabel="Markdown view controls">
          {webpageControls && onWebpageChangeView && onWebpageUpdateMeta ? (
            <menu className={`${uiToolbarRowScrollListClassName} gap-1`} aria-label="Webpage">
            <li className="list-none">
              <WorkspaceModeSelect<'inherit' | '1' | '2' | '3' | '4'>
                ariaLabel="Webpage fidelity level"
                value={webpageControls.fidelityMode}
                isActive={true}
                options={[
                  { value: 'inherit', label: 'Fid: Auto' },
                  { value: '1', label: 'Fid: 1' },
                  { value: '2', label: 'Fid: 2' },
                  { value: '3', label: 'Fid: 3' },
                  { value: '4', label: 'Fid: 4' },
                ]}
                onChange={next => {
                  const level = next === 'inherit' ? undefined : (Number.parseInt(next, 10) as 1 | 2 | 3 | 4)
                  onWebpageUpdateMeta({ fidelityLevel: level })
                }}
              />
            </li>
          </menu>
        ) : null}

        <menu className={`${uiToolbarRowScrollListClassName} gap-1`} aria-label="Layout mode">
          <li className="kg-workspace-pane-toggles-item list-none">
            <fieldset
              id={workspacePanesControlId}
              className={`kg-workspace-pane-toggles ${uiToolbarRowScrollInlineClassName} gap-1`}
              aria-label="Workspace panes"
              title="Workspace panes"
            >
              <WorkspacePaneToggle
                label="Explorer"
                title="Explorer pane"
                ariaLabel="Show Explorer pane"
                checked={explorerOpen}
                onChange={() => setExplorerOpen(!explorerOpen)}
                labelClassName={`kg-workspace-pane-toggle ${UI_RESPONSIVE_LABEL_ROW_CLASSNAME} cursor-pointer`}
                textClassName={paneToggleTextClassName}
              />
              <WorkspacePaneToggle
                label="bin"
                title={paneToggleTitle('bin', effectivePaneAvailability.bin)}
                ariaLabel="Show binary model pane"
                checked={effectivePaneAvailability.bin}
                disabled
                ariaDisabled="true"
                labelClassName={paneToggleLabelClass(effectivePaneAvailability.bin)}
                textClassName={paneToggleTextClassName}
              />
              <WorkspacePaneToggle
                label="Python"
                title={paneToggleTitle('Python editor pane', !!effectivePaneAvailability.python)}
                ariaLabel="Show Python editor pane"
                checked={!!effectivePaneVisibility.python}
                disabled={!effectivePaneAvailability.python}
                ariaDisabled={!effectivePaneAvailability.python}
                onChange={() => handleSplitPaneToggle('python')}
                labelClassName={paneToggleLabelClass(!!effectivePaneAvailability.python)}
                textClassName={paneToggleTextClassName}
              />
              <WorkspacePaneToggle
                label="JSON"
                title={paneToggleTitle('JSON', effectivePaneAvailability.json)}
                ariaLabel="Show JSON editor pane"
                checked={effectivePaneVisibility.json}
                disabled={!effectivePaneAvailability.json}
                ariaDisabled={!effectivePaneAvailability.json}
                onChange={() => {
                  if (!effectivePaneAvailability.json) return
                  handleContentPaneToggle('json')
                }}
                labelClassName={paneToggleLabelClass(effectivePaneAvailability.json)}
                textClassName={paneToggleTextClassName}
              />
              <WorkspacePaneToggle
                label="Markdown"
                title={paneToggleTitle('Markdown editor pane', effectivePaneAvailability.markdown)}
                ariaLabel="Show Markdown editor pane"
                checked={effectivePaneVisibility.markdown}
                disabled={!effectivePaneAvailability.markdown}
                ariaDisabled={!effectivePaneAvailability.markdown}
                onChange={() => {
                  if (!effectivePaneAvailability.markdown) return
                  handleContentPaneToggle('markdown')
                }}
                labelClassName={paneToggleLabelClass(effectivePaneAvailability.markdown)}
                textClassName={paneToggleTextClassName}
              />
              {showDocumentVersionGraphToggle ? (
                <WorkspacePaneToggle
                  label="diff"
                  title="Document version graph"
                  ariaLabel="Show document version graph"
                  checked={documentVersionGraphOpen}
                  onChange={event => setDocumentVersionGraphOpen?.(event.currentTarget.checked)}
                  labelClassName={`kg-workspace-pane-toggle relative z-[260] ${UI_RESPONSIVE_LABEL_ROW_CLASSNAME} cursor-pointer`}
                  textClassName={paneToggleTextClassName}
                  icon={<FileDiff className={MARKDOWN_WORKSPACE_TOOLBAR_GLYPH_CLASSNAME} strokeWidth={1.6} aria-hidden="true" />}
                  labelProps={{ 'data-kg-markdown-workspace-document-version-graph-toggle': '1' }}
                />
              ) : null}
              <WorkspacePaneToggle
                label="Viewer"
                title={paneToggleTitle('Viewer preview pane', effectivePaneAvailability.viewer)}
                ariaLabel="Show Viewer preview pane"
                checked={effectivePaneVisibility.viewer}
                disabled={!effectivePaneAvailability.viewer}
                ariaDisabled={!effectivePaneAvailability.viewer}
                onChange={() => {
                  if (!effectivePaneAvailability.viewer) return
                  handleSplitPaneToggle('viewer')
                }}
                labelClassName={`${paneToggleLabelClass(effectivePaneAvailability.viewer)} kg-workspace-pane-toggle--viewer`}
                textClassName={paneToggleTextClassName}
              />
              <WorkspacePaneToggle
                label="HTML"
                title={paneToggleTitle('HTML', htmlPaneAvailable)}
                ariaLabel="Show HTML viewer pane"
                checked={htmlPaneChecked}
                disabled={!htmlPaneAvailable}
                ariaDisabled={!htmlPaneAvailable}
                onChange={handleHtmlPaneToggle}
                labelClassName={paneToggleLabelClass(htmlPaneAvailable)}
                textClassName={paneToggleTextClassName}
              />
              {typeof canvasOpen === 'boolean' && typeof setCanvasOpen === 'function' ? (
                <WorkspacePaneToggle
                  label="Canvas"
                  title="Canvas pane"
                  ariaLabel="Show Canvas pane"
                  checked={canvasOpen}
                  onChange={() => setCanvasOpen(!canvasOpen)}
                  labelClassName={`kg-workspace-pane-toggle ${UI_RESPONSIVE_LABEL_ROW_CLASSNAME} cursor-pointer`}
                  textClassName={paneToggleTextClassName}
                />
              ) : null}
            </fieldset>
          </li>
          <li className="list-none">
            <button
              type="button"
              className={TOOLBAR_BUTTON_CLASSNAME}
              aria-pressed={layoutMode === 'presentation'}
              title="Presentation"
              onClick={() => setLayoutMode('presentation')}
            >
              <LayoutPanelTop className={MARKDOWN_WORKSPACE_TOOLBAR_GLYPH_CLASSNAME} strokeWidth={1.6} />
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
              <Maximize2 className={MARKDOWN_WORKSPACE_TOOLBAR_GLYPH_CLASSNAME} strokeWidth={1.6} />
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
              <X className={MARKDOWN_WORKSPACE_TOOLBAR_GLYPH_CLASSNAME} strokeWidth={1.6} />
            </button>
          </li>
        </menu>
        </CollapsibleToolbar>
      </WorkspaceHeaderRow>
  )
}
