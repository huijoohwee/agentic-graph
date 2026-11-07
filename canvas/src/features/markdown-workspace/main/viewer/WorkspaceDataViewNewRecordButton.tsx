import React from 'react'
import { Plus } from 'lucide-react'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import {
  UI_RESPONSIVE_ACTION_ROW_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_ACTION_DEFAULT_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_DEFAULT_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

export function WorkspaceDataViewNewRecordButton(props: {
  onClick: () => void
  className?: string
  labelMode?: 'always' | 'hover' | 'icon'
  hoverRevealScope?: 'self' | 'container'
  presentation?: 'button' | 'divider'
}) {
  const labelMode = props.labelMode || 'hover'
  const hoverRevealScope = props.hoverRevealScope || 'self'
  const presentation = props.presentation || 'button'
  const dividerPresentation = presentation === 'divider'
  const iconOnly = labelMode === 'icon' || dividerPresentation
  const labelClassName = [
    'kg-data-view-new-record-label',
    labelMode === 'hover' ? 'kg-data-view-new-record-label--hover' : '',
    'text-xs font-medium',
    UI_TEXT_TRUNCATE,
    UI_THEME_TOKENS.text.primary,
  ].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      className={[
        dividerPresentation ? 'group' : '',
        UI_RESPONSIVE_ACTION_ROW_CLASSNAME,
        dividerPresentation
          ? 'w-full justify-center gap-2 rounded-none border-0 bg-transparent px-0 py-0'
          : iconOnly
            ? UI_RESPONSIVE_DATA_VIEW_ICON_ACTION_DEFAULT_CLASSNAME
            : UI_RESPONSIVE_DATA_VIEW_ACTION_DEFAULT_CLASSNAME,
        dividerPresentation ? 'kg-data-view-new-record-divider-action' : 'kg-data-view-new-record-action rounded border',
        iconOnly ? 'shrink-0' : '',
        iconOnly && !dividerPresentation ? UI_THEME_TOKENS.button.square : '',
        iconOnly ? 'justify-center' : '',
        labelMode === 'hover' && !dividerPresentation ? 'kg-data-view-new-record-action--hover-label' : '',
        labelMode === 'hover' && hoverRevealScope === 'container' && !dividerPresentation ? 'kg-data-view-new-record-action--container-hover-label' : '',
        dividerPresentation ? '' : UI_THEME_TOKENS.panel.border,
        dividerPresentation ? '' : UI_THEME_TOKENS.button.hoverBg,
        UI_THEME_TOKENS.focus.primarySoftRing,
        props.className || '',
      ].filter(Boolean).join(' ')}
      title={MARKDOWN_DATA_VIEW_COPY.newRecordLabel}
      aria-label={MARKDOWN_DATA_VIEW_COPY.newRecordLabel}
      onClick={props.onClick}
    >
      {dividerPresentation ? (
        <svg
          role="img"
          aria-label={MARKDOWN_DATA_VIEW_COPY.newRecordLabel}
          className="h-6 w-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>{MARKDOWN_DATA_VIEW_COPY.newRecordLabel}</title>
          <line x1="0" y1="50%" x2="100%" y2="50%" stroke="var(--kg-divider)" />
          <svg x="50%" width="24" height="24" viewBox="0 0 24 24" className="-translate-x-3">
            <circle
              cx="12" cy="12" r="10"
              stroke="var(--kg-border)"
              fill="var(--kg-panel-bg)"
              className="transition-colors group-hover:fill-[var(--kg-panel-action-bg-hover)]"
            />
            <path d="M8 12h8M12 8v8" fill="none" stroke="var(--kg-text-secondary)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </svg>
      ) : (
        <>
          <Plus className={['h-4 w-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')} role="img" aria-label={MARKDOWN_DATA_VIEW_COPY.newRecordLabel} />
          {!iconOnly ? <span className={labelClassName}>{MARKDOWN_DATA_VIEW_COPY.newRecordLabel}</span> : null}
        </>
      )}
    </button>
  )
}
