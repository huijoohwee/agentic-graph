import React from 'react'
import type { MarkdownWorkspaceLayoutMode } from '@/features/markdown-explorer/workspaceUi'
import { MarkdownWorkspaceToolbar } from '../../MarkdownWorkspaceToolbar'
import { UI_VIEW_EDIT_SURFACE_DATA_ATTRIBUTES, UI_VIEW_EDIT_SURFACE_FLEX_AREA_CLASS_NAME } from '@/lib/ui/surfaceClasses'
import { resolveMarkdownWorkspacePaneVisibility, type MarkdownWorkspacePaneAvailability, type MarkdownWorkspacePaneVisibility } from '../types'

export function MarkdownWorkspaceLayout(props: {
  toolbarProps: React.ComponentProps<typeof MarkdownWorkspaceToolbar>
  layoutMode: MarkdownWorkspaceLayoutMode
  documentNotice?: React.ReactNode
  renderMarkdownEditor: () => React.ReactNode
  renderJsonEditor: () => React.ReactNode
  pythonPane?: React.ReactNode
  binaryPane?: React.ReactNode
  binaryPaneVisible?: boolean
  splitPaneVisibility: MarkdownWorkspacePaneVisibility
  paneAvailability?: MarkdownWorkspacePaneAvailability
  forceMarkdownEditorInEditorMode?: boolean
  viewer: React.ReactNode
  htmlViewer?: React.ReactNode
  presentation: React.ReactNode
}) {
  const paneVisibility = resolveMarkdownWorkspacePaneVisibility({
    layoutMode: props.layoutMode,
    splitPaneVisibility: props.splitPaneVisibility,
    paneAvailability: props.paneAvailability,
    forceMarkdownEditorInEditorMode: props.forceMarkdownEditorInEditorMode,
  })
  const binaryPaneVisible = props.binaryPaneVisible === true
  const paneClassName = 'kg-markdown-workspace-pane flex-1 min-w-0 min-h-0 flex flex-col'
  const viewerPaneClassName = `kg-markdown-workspace-pane flex flex-col ${UI_VIEW_EDIT_SURFACE_FLEX_AREA_CLASS_NAME}`
  const paneDividerClassName = 'kg-markdown-workspace-pane-divider w-px self-stretch bg-[color:var(--kg-border)] border-0'
  const splitPanes = [
    binaryPaneVisible ? (
      <section key="bin" className={paneClassName} aria-label="Binary Model">
        {props.binaryPane}
      </section>
    ) : null,
    paneVisibility.python ? <section key="python" className={paneClassName} aria-label="Python Editor">{props.pythonPane}</section> : null,
    paneVisibility.json ? (
      <section key="json" className={paneClassName} aria-label="JSON Editor">
        {props.renderJsonEditor()}
      </section>
    ) : null,
    paneVisibility.markdown ? (
      <section key="markdown" className={paneClassName} aria-label="Markdown Editor">
        {props.renderMarkdownEditor()}
      </section>
    ) : null,
    paneVisibility.viewer ? (
      <section key="viewer" className={viewerPaneClassName} aria-label="Viewer" {...UI_VIEW_EDIT_SURFACE_DATA_ATTRIBUTES}>
        {props.viewer}
      </section>
    ) : null,
    paneVisibility.html && props.htmlViewer ? (
      <section key="html" className={paneClassName} aria-label="HTML Viewer">
        {props.htmlViewer}
      </section>
    ) : null,
  ].filter(Boolean) as React.ReactElement[]
  const effectiveSplitPanes = splitPanes.length > 0
    ? splitPanes
    : [
        <section key="viewer-fallback" className={viewerPaneClassName} aria-label="Viewer" {...UI_VIEW_EDIT_SURFACE_DATA_ATTRIBUTES}>
          {props.viewer}
        </section>,
      ]

  return (
    <main className="kg-markdown-workspace-main flex-1 min-w-0 min-h-0 flex flex-col" aria-label="Markdown Editor and Viewer">
      <MarkdownWorkspaceToolbar {...props.toolbarProps} />
      {props.documentNotice ? (
        <section className="px-2 pt-2" aria-label="Document notices">
          {props.documentNotice}
        </section>
      ) : null}

      {props.layoutMode === 'editor' ? (
        <section className="kg-markdown-workspace-editor-panes flex-1 min-w-0 min-h-0 flex" aria-label="Monaco editors">
          {effectiveSplitPanes.map((pane, index) => (
            <React.Fragment key={pane.key || `pane-${index}`}>
              {index > 0 ? <hr className={paneDividerClassName} aria-hidden="true" /> : null}
              {pane}
            </React.Fragment>
          ))}
        </section>
      ) : props.layoutMode === 'viewer' ? (
        <section className={`flex flex-col ${UI_VIEW_EDIT_SURFACE_FLEX_AREA_CLASS_NAME}`} aria-label="Viewer" {...UI_VIEW_EDIT_SURFACE_DATA_ATTRIBUTES}>
          {props.viewer}
        </section>
      ) : props.layoutMode === 'presentation' ? (
        <section className="flex-1 min-h-0 flex kg-workspace-surface-shell" aria-label="Presentation view">
          {props.presentation}
        </section>
      ) : (
        <section className="kg-markdown-workspace-split-panes flex-1 min-w-0 min-h-0 flex kg-workspace-surface-shell" aria-label="Split view">
          {effectiveSplitPanes.map((pane, index) => (
            <React.Fragment key={pane.key || `pane-${index}`}>
              {index > 0 ? <hr className={`${paneDividerClassName} kg-workspace-split-divider`} aria-hidden="true" /> : null}
              {pane}
            </React.Fragment>
          ))}
        </section>
      )}
    </main>
  )
}
