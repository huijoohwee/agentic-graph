import React from 'react'
import { ChevronDown, ChevronRight, FileText, Trash2 } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { VisibleMarkdownSourceFileTreeNode } from './markdownSourceFileTree'

export type MarkdownSourceFilesTreeRowProps = {
  node: VisibleMarkdownSourceFileTreeNode
  expanded: boolean
  isSelectedFolder: boolean
  dragOverSourceFileId: string | null
  uiPanelTextFontClass: string
  iconClassName: string
  indentBasePx: number
  indentStepPx: number
  canWrite: boolean
  onSelectFolder: (path: string) => void
  onSelectFile: (args: { fileId: string; path: string }) => void
  onDeleteFile?: (path: string) => void | Promise<void>
  onDragStart: React.DragEventHandler<HTMLButtonElement>
  onDragOver: React.DragEventHandler<HTMLButtonElement>
  onDrop: React.DragEventHandler<HTMLButtonElement>
  onDragEnd: React.DragEventHandler<HTMLButtonElement>
  onDragLeave: React.DragEventHandler<HTMLButtonElement>
}

export function MarkdownSourceFilesTreeRow(props: MarkdownSourceFilesTreeRowProps) {
  const {
    node,
    expanded,
    isSelectedFolder,
    dragOverSourceFileId,
    uiPanelTextFontClass,
    iconClassName,
    indentBasePx,
    indentStepPx,
    canWrite,
    onSelectFolder,
    onSelectFile,
    onDeleteFile,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onDragLeave,
  } = props

  const isFolder = node.kind === 'folder'
  const indentPx = Math.max(0, node.depth - 1) * indentStepPx
  const versionCount = Math.max(0, Math.floor(Number(node.versionCount || 0)))
  const rowClassName = [
    `border-b ${UI_THEME_TOKENS.panel.divider} last:border-b-0 px-2 py-1`,
    'flex items-center gap-2',
    node.active ? UI_THEME_TOKENS.table.rowSelected : UI_THEME_TOKENS.table.rowHoverHighlight,
    dragOverSourceFileId === node.fileId ? 'outline outline-1 outline-dashed outline-[var(--kg-primary)]' : '',
    isSelectedFolder ? UI_THEME_TOKENS.table.rowSelected : '',
    'min-w-0 overflow-hidden cursor-pointer select-none',
  ]
    .filter(Boolean)
    .join(' ')

  const icon = isFolder ? (
    node.hasChildren ? (
      expanded ? (
        <ChevronDown className={iconClassName} aria-hidden="true" />
      ) : (
        <ChevronRight className={iconClassName} aria-hidden="true" />
      )
    ) : (
      <ChevronRight className={`${iconClassName} opacity-30`} aria-hidden="true" />
    )
  ) : (
    <FileText className={iconClassName} aria-hidden="true" />
  )

  if (isFolder) {
    return (
      <li key={node.key} role="none">
        <button
          type="button"
          role="treeitem"
          aria-expanded={expanded}
          aria-selected={isSelectedFolder}
          className={rowClassName}
          style={{ paddingLeft: indentBasePx + indentPx }}
          onClick={() => onSelectFolder(node.path)}
          title={node.path}
        >
          {icon}
          <span
            className={[
              'min-w-0 flex-1 text-xs truncate transition-colors font-semibold',
              UI_THEME_TOKENS.text.primary,
              uiPanelTextFontClass,
            ].join(' ')}
          >
            {node.label}
          </span>
        </button>
      </li>
    )
  }

  return (
    <li key={node.key} role="none">
      <article className={rowClassName} style={{ paddingLeft: indentBasePx + indentPx }}>
        <button
          type="button"
          role="treeitem"
          aria-selected={!!node.active}
          className="min-w-0 flex flex-1 items-center gap-2 overflow-hidden"
          draggable
          onClick={() => {
            if (node.fileId) onSelectFile({ fileId: node.fileId, path: node.path })
          }}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          onDragLeave={onDragLeave}
          title={node.path}
        >
          {icon}
          <bdi
            className={[
              'min-w-0 flex-1 text-sm truncate transition-colors',
              node.active ? 'font-medium' : UI_THEME_TOKENS.text.primary,
              uiPanelTextFontClass,
            ].join(' ')}
          >
            {node.label}
          </bdi>
          {versionCount > 0 ? (
            <span
              className={`shrink-0 rounded border px-1 py-0 text-xs leading-4 ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.text.tertiary}`}
              data-kg-source-file-version-count={versionCount}
              title={`${versionCount} document versions`}
            >
              {`v${versionCount}`}
            </span>
          ) : null}
        </button>
        {canWrite && node.fileId && onDeleteFile ? (
          <button
            type="button"
            className={`p-0.5 rounded-sm transition-colors ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
            aria-label="Delete file"
            title="Delete file"
            onClick={event => {
              event.preventDefault()
              event.stopPropagation()
              const confirmed = typeof window !== 'undefined' ? window.confirm(`Delete ${node.path}?`) : false
              if (!confirmed) return
              void onDeleteFile(node.path)
            }}
          >
            <Trash2 className={iconClassName} aria-hidden="true" />
          </button>
        ) : null}
      </article>
    </li>
  )
}
