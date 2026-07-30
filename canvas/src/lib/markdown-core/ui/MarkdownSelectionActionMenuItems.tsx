import React from 'react'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'
import { getLinkDisplayMode, setLinkDisplayMode } from '@/features/markdown/ui/linkDisplayMode'
import type { MarkdownInlineSelectionActions } from './markdownInlineSelectionActions'

export type MarkdownSelectionActionMenuItemsProps = {
  actions: MarkdownInlineSelectionActions & {
    startLine: number
    endLine: number
  }
  buttonClassName: string
  disabledButtonClassName: string
  dividerClassName: string
  onRunAction: (event: React.MouseEvent<HTMLButtonElement>, action: () => void) => void
}

export function MarkdownSelectionActionMenuItems(props: MarkdownSelectionActionMenuItemsProps) {
  const { actions } = props
  const [linkMode, setLinkMode] = React.useState<'snapshot' | 'card'>(() =>
    getLinkDisplayMode(actions.startLine),
  )

  React.useEffect(() => {
    setLinkMode(getLinkDisplayMode(actions.startLine))
  }, [actions.startLine])

  const navigationActions = [
    actions.onShowOnCanvas ? {
      label: 'Show on Canvas',
      disabled: false,
      run: () => actions.onShowOnCanvas?.(actions.startLine, actions.endLine),
    } : null,
    actions.onShowInViewer ? {
      label: 'Show in Viewer',
      disabled: actions.currentView === 'markdown.viewer',
      run: () => actions.onShowInViewer?.(actions.startLine),
    } : null,
    actions.onShowInEditor ? {
      label: 'Show in Editor',
      disabled: actions.currentView === 'markdown.editor',
      run: () => actions.onShowInEditor?.(actions.startLine),
    } : null,
    actions.onShowInPresentation ? {
      label: 'Show in Presentation',
      disabled: actions.currentView === 'markdown.presentation',
      run: () => actions.onShowInPresentation?.(actions.startLine),
    } : null,
    actions.onShowInGallery ? {
      label: 'Show in Gallery',
      disabled: actions.currentView === 'markdown.gallery',
      run: () => actions.onShowInGallery?.(actions.startLine),
    } : null,
    actions.onShowInGraphDataTable ? {
      label: MARKDOWN_DATA_VIEW_COPY.showInLabel,
      disabled: actions.currentView === 'table',
      run: () => actions.onShowInGraphDataTable?.(actions.startLine),
    } : null,
  ].filter((item): item is { label: string; disabled: boolean; run: () => void } => Boolean(item))

  const applyLinkMode = (mode: 'snapshot' | 'card') => {
    setLinkDisplayMode(actions.startLine, mode)
    setLinkMode(mode)
  }

  return (
    <>
      {navigationActions.map(action => (
        <li key={action.label} className="list-none">
          <button
            type="button"
            className={action.disabled ? props.disabledButtonClassName : props.buttonClassName}
            disabled={action.disabled}
            onClick={event => props.onRunAction(event, action.run)}
          >
            {action.label}
          </button>
        </li>
      ))}
      {navigationActions.length > 0 ? <li className={props.dividerClassName} /> : null}
      <li className="list-none">
        <button
          type="button"
          className={linkMode === 'snapshot' ? props.disabledButtonClassName : props.buttonClassName}
          disabled={linkMode === 'snapshot'}
          onClick={event => props.onRunAction(event, () => applyLinkMode('snapshot'))}
        >
          Link: Inline URL (default)
        </button>
      </li>
      <li className="list-none">
        <button
          type="button"
          className={linkMode === 'card' ? props.disabledButtonClassName : props.buttonClassName}
          disabled={linkMode === 'card'}
          onClick={event => props.onRunAction(event, () => applyLinkMode('card'))}
        >
          Link: Horizontal Card
        </button>
      </li>
    </>
  )
}
