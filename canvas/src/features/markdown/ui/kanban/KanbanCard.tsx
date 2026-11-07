import React from 'react'
import type { MarkdownDataView, MarkdownDataViewRow } from '../markdownDataViewModel'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { splitMultiValues } from '@/features/markdown/ui/markdownDataViewValueUtils'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, CircleChevronDown, Expand, Link2, List, MoreHorizontal, Trash2 } from 'lucide-react'
import { DataViewStatusChip, DataViewTagChip } from '../MarkdownDataViewChips'
import { KanbanCardDropPreview } from './KanbanDropPreview'
import { buildKanbanCardDropIntentLabel } from './kanbanDragIntent'
import { getKanbanCardDragVisualState } from './kanbanDragVisualState'
import { isInteractiveEventTarget, useDismissableMenu } from './kanbanMenu'
import { KanbanCell } from './KanbanCell'
import { KanbanTypeBadge } from './KanbanTypeBadge'
import type { KanbanCardDragProps, KanbanCardDropProps } from './useKanbanDragAndDrop'
import {
  UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME,
  UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_COMPACT_MENU_PANEL_CLASSNAME,
  UI_RESPONSIVE_MENU_ROW_CLASSNAME,
  UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import { uiToolbarRowScrollClassName } from '@/features/toolbar/ui/toolbarStyles'
import type { KanbanDropPosition } from './kanbanReorder'
import { buildCardParagraphEntries } from '@/lib/cards/cardParagraphs'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import { readMarkdownSigilDisplayText } from '@/lib/markdown/markdownSigil'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'

export type KanbanCardProps = {
  row: MarkdownDataViewRow
  title: string
  groupValue: string
  canMutate: boolean
  groupByColumnId: string
  groupByIndex: number
  moveTargets: string[]
  groupColumnOptions: string[]
  view: MarkdownDataView
  otherColumnIndices: number[]
  onUpdateCell: (args: { rowId: string; columnId: string; nextValue: string }) => void
  onActivateRow?: (rowId: string) => void
  cardDragProps?: KanbanCardDragProps
  cardDropProps?: KanbanCardDropProps
  isDragging?: boolean
  isDropTarget?: boolean
  dropPosition?: KanbanDropPosition
  onKeyboardMove?: (args: { rowId: string; direction: 'up' | 'down' | 'left' | 'right' }) => boolean
  hasActiveDrag?: boolean
  dropPreviewLabel?: string
  isCommitFlash?: boolean
  onFocusableRowElement?: (args: { rowId: string; element: HTMLElement | null }) => void
}

export const KanbanCard = React.memo(function KanbanCard(props: KanbanCardProps) {
  const articleRef = React.useRef<HTMLElement>(null)
  const setArticleRef = React.useCallback((element: HTMLElement | null) => {
    articleRef.current = element
    props.onFocusableRowElement?.({
      rowId: props.row.id,
      element,
    })
  }, [props.onFocusableRowElement, props.row.id])
  const dragVisualState = getKanbanCardDragVisualState({
    hasActiveDrag: !!props.hasActiveDrag,
    isDragging: !!props.isDragging,
    isDropTarget: !!props.isDropTarget,
    isCommitFlash: !!props.isCommitFlash,
  })
  const isCoarsePointer = React.useMemo(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches
    } catch {
      return false
    }
  }, [])

  const statusOptions = props.groupColumnOptions.length ? props.groupColumnOptions : props.moveTargets
  const titleColumnIndex = React.useMemo(() => {
    return props.view.columns.findIndex(column => column.id === props.view.titleColumnId)
  }, [props.view.columns, props.view.titleColumnId])
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [moveMenuOpen, setMoveMenuOpen] = React.useState(false)
  const menuRootRef = React.useRef<HTMLElement>(null)
  const menuTriggerRef = React.useRef<HTMLButtonElement>(null)
  const firstMenuItemRef = React.useRef<HTMLButtonElement>(null)

  useDismissableMenu({
    open: menuOpen,
    onClose: () => {
      setMenuOpen(false)
      setMoveMenuOpen(false)
    },
    rootRef: menuRootRef,
    triggerRef: menuTriggerRef as React.RefObject<HTMLElement>,
  })

  React.useEffect(() => {
    if (!menuOpen) return
    firstMenuItemRef.current?.focus()
  }, [menuOpen])

  const onActivate = props.onActivateRow
    ? (event: React.MouseEvent<HTMLElement>) => {
        if (isInteractiveEventTarget(event.target)) return
        if (isCoarsePointer) {
          const el = articleRef.current
          if (el && document.activeElement !== el) {
            try {
              el.focus()
            } catch {
              void 0
            }
            return
          }
        }
        props.onActivateRow?.(props.row.id)
      }
    : undefined

  const onActivateByKeyboard = (e: React.KeyboardEvent<HTMLElement>) => {
    if (isInteractiveEventTarget(e.target)) return
    if (props.canMutate && (e.altKey || e.metaKey)) {
      const direction =
        e.key === 'ArrowUp'
          ? 'up'
          : e.key === 'ArrowDown'
            ? 'down'
            : e.key === 'ArrowLeft'
              ? 'left'
              : e.key === 'ArrowRight'
                ? 'right'
                : null
      if (direction) {
        const handled = props.onKeyboardMove?.({ rowId: props.row.id, direction })
        if (handled) {
          e.preventDefault()
          return
        }
      }
    }
    if ((e.key === 'Enter' || e.key === ' ') && props.onActivateRow) {
      e.preventDefault()
      props.onActivateRow(props.row.id)
      return
    }
    if (e.key === 'ArrowDown' && menuOpen) {
      e.preventDefault()
      firstMenuItemRef.current?.focus()
    }
  }

  const urlEntries = React.useMemo(() => {
    const out: Array<{ id: string; label: string; href: string }> = []
    for (const colIndex of props.otherColumnIndices) {
      const col = props.view.columns[colIndex]
      if (col.kind !== 'text') continue
      const raw = String(props.row.cells[colIndex] ?? '').trim()
      if (!raw) continue
      if (!raw.includes('://') && !raw.startsWith('mailto:')) continue
      out.push({ id: col.id, label: col.name || 'Link', href: raw })
    }
    return out
  }, [props.otherColumnIndices, props.row.cells, props.view.columns])

  const tags = React.useMemo(() => {
    const out: string[] = []
    for (const colIndex of props.otherColumnIndices) {
      const col = props.view.columns[colIndex]
      const raw = String(props.row.cells[colIndex] ?? '')
      if (!raw) continue
      if (col.kind === 'multi-select') {
        splitMultiValues(raw).forEach(v => out.push(v))
        continue
      }
      if (col.kind === 'select') out.push(raw.trim())
    }
    return out
  }, [props.otherColumnIndices, props.row.cells, props.view.columns])

  const paragraphEntries = React.useMemo(() => {
    return buildCardParagraphEntries(
      props.otherColumnIndices.flatMap(colIndex => {
        const col = props.view.columns[colIndex]
        if (col.kind !== 'text') return []
        const raw = String(props.row.cells[colIndex] ?? '').trim()
        if (!raw) return []
        if (raw.includes('://') || raw.startsWith('mailto:')) return []
        return [{
          id: col.id,
          label: col.name || 'Text',
          value: raw,
        }]
      }),
      { excludeUrlLike: true },
    )
  }, [props.otherColumnIndices, props.row.cells, props.view.columns])

  const statusValue = String(props.groupValue || '').trim()
  const sharedDragRegionClassName = props.cardDragProps?.draggable ? 'cursor-grab active:cursor-grabbing' : ''
  const sharedDragRegionProps = props.cardDragProps?.draggable
    ? {
        draggable: props.cardDragProps.draggable,
        onDragStart: props.cardDragProps.onDragStart,
        onDragEnd: props.cardDragProps.onDragEnd,
      }
    : undefined

  return (
    <article
      ref={setArticleRef}
      data-kg-kanban-card="1"
      className={[
        'group relative border transition-transform transition-shadow duration-150 ease-out',
        UI_THEME_TOKENS.kanban.cardBg,
        UI_THEME_TOKENS.kanban.cardHoverBg,
        'rounded-[var(--kg-kanban-card-radius)]',
        'shadow-[var(--kg-kanban-card-shadow)]',
        'hover:shadow-[var(--kg-kanban-card-shadow-hover)]',
        UI_THEME_TOKENS.panel.border,
        dragVisualState.className,
        !props.isDragging ? 'hover:-translate-y-[1px] active:translate-y-0' : '',
        props.onActivateRow ? `cursor-pointer ${UI_THEME_TOKENS.focus.primarySofterRing}` : '',
      ].join(' ')}
      style={dragVisualState.style}
      tabIndex={props.onActivateRow ? 0 : undefined}
      role={props.onActivateRow ? 'button' : undefined}
      aria-grabbed={props.cardDragProps?.draggable ? props.isDragging : undefined}
      onDragEnter={props.cardDropProps?.onDragEnter}
      onDragOver={props.cardDropProps?.onDragOver}
      onDragLeave={props.cardDropProps?.onDragLeave}
      onDrop={props.cardDropProps?.onDrop}
      onClick={onActivate}
      onKeyDown={onActivateByKeyboard}
      aria-label={props.title ? `Card: ${props.title}` : 'Card'}
    >
      {props.isDropTarget ? (
        <KanbanCardDropPreview
          position={props.dropPosition || 'end'}
          label={props.dropPreviewLabel || buildKanbanCardDropIntentLabel({ position: props.dropPosition || 'end', targetCardLabel: props.title, targetLaneLabel: props.groupValue })}
        />
      ) : null}
      <header
        data-kg-kanban-card-drag-region="1"
        className={[
          'flex items-center justify-between gap-2 px-3 py-2 border-b',
          sharedDragRegionClassName,
          UI_THEME_TOKENS.panel.divider,
        ].join(' ')}
        aria-grabbed={props.cardDragProps?.draggable ? props.isDragging : undefined}
        {...sharedDragRegionProps}
      >
        <section className="flex items-center gap-2 min-w-0 flex-1">
          <KanbanTypeBadge size="sm" />
          <CardInlineTextEditor
            value={props.title}
            ariaLabel={`Title for ${props.row.id}`}
            placeholder="Add title"
            canEdit={props.canMutate && titleColumnIndex >= 0}
            onCommit={nextValue => {
              const titleColumn = titleColumnIndex >= 0 ? props.view.columns[titleColumnIndex] : null
              if (!titleColumn) return
              props.onUpdateCell({
                rowId: props.row.id,
                columnId: titleColumn.id,
                nextValue,
              })
            }}
            displayClassName={['text-sm font-semibold leading-5 m-0', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.primary].join(' ')}
            editorClassName={`${UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME} text-sm font-semibold leading-5`}
          />
        </section>
        <menu
          data-kg-kanban-actions="1"
          className="m-0 p-0 list-none flex items-center gap-1 transition-opacity"
          aria-label="Card actions"
        >
          {props.onActivateRow ? (
            <li className="list-none">
              <button
                type="button"
                className={['kg-panel-action-btn kg-panel-icon-btn', UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME, 'rounded-md', UI_THEME_TOKENS.focus.primarySoftRing].join(' ')}
                aria-label={MARKDOWN_DATA_VIEW_COPY.expandCardLabel}
                onClick={e => {
                  e.stopPropagation()
                  props.onActivateRow?.(props.row.id)
                }}
              >
                <Expand className="w-4 h-4" aria-hidden="true" />
              </button>
            </li>
          ) : null}

          <li className="list-none">
            <section className="relative" ref={menuRootRef} onClick={e => e.stopPropagation()}>
              <button
                ref={menuTriggerRef}
                type="button"
                className={['kg-panel-action-btn kg-panel-icon-btn', UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME, 'rounded-md', UI_THEME_TOKENS.focus.primarySoftRing].join(' ')}
                aria-label={MARKDOWN_DATA_VIEW_COPY.cardMenuLabel}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                disabled={!props.canMutate}
                onClick={() => {
                  if (!props.canMutate) return
                  setMenuOpen(prev => !prev)
                  setMoveMenuOpen(false)
                }}
              >
                <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
              </button>

              {menuOpen && props.canMutate ? (
                <menu
                  className={['kg-data-view-floating-menu absolute right-0 mt-2 rounded border shadow-[var(--kg-shadow-overlay)] p-2 z-10', UI_RESPONSIVE_DATA_VIEW_COMPACT_MENU_PANEL_CLASSNAME, UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.panel.border].join(' ')}
                  role="menu"
                  aria-label={MARKDOWN_DATA_VIEW_COPY.cardActionsLabel}
                >
                  <li className="list-none">
                    <button
                      ref={firstMenuItemRef}
                      type="button"
                      className={[UI_RESPONSIVE_MENU_ROW_CLASSNAME, 'gap-3 px-2 py-1.5 rounded text-sm', UI_THEME_TOKENS.button.hoverBg].join(' ')}
                      role="menuitem"
                      onClick={() => {
                        props.onActivateRow?.(props.row.id)
                        setMenuOpen(false)
                        setMoveMenuOpen(false)
                      }}
                    >
                      <Expand className={['w-4 h-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
                      <span className={UI_TEXT_TRUNCATE}>{MARKDOWN_DATA_VIEW_COPY.expandCardLabel}</span>
                    </button>
                  </li>
                  <li className="list-none">
                    <button
                      type="button"
                      className={[UI_RESPONSIVE_MENU_ROW_CLASSNAME, 'gap-3 px-2 py-1.5 rounded text-sm', UI_THEME_TOKENS.button.hoverBg].join(' ')}
                      role="menuitem"
                      aria-haspopup="menu"
                      aria-expanded={moveMenuOpen}
                      onClick={() => setMoveMenuOpen(prev => !prev)}
                      onKeyDown={e => {
                        if (e.key === 'ArrowRight') {
                          e.preventDefault()
                          setMoveMenuOpen(true)
                        }
                        if (e.key === 'ArrowLeft') {
                          e.preventDefault()
                          setMoveMenuOpen(false)
                        }
                      }}
                    >
                      <ArrowRight className={['w-4 h-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
                      <span className={['min-w-0 flex-1 text-left', UI_TEXT_TRUNCATE].join(' ')}>{MARKDOWN_DATA_VIEW_COPY.moveToLabel}</span>
                      <ChevronDown className={['w-4 h-4 shrink-0 transition-transform', moveMenuOpen ? 'rotate-180' : '', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
                    </button>
                    {moveMenuOpen ? (
                      <menu
                        className="kg-data-view-floating-menu-children kg-click-expand-menu-children mt-1 m-0 list-none"
                        role="menu"
                        aria-label="Move targets"
                      >
                        {props.moveTargets.map((t, index) => (
                          <li key={`${props.row.id}:move:${t}:${index}`} className="list-none">
                            <button
                              type="button"
                              className={[UI_RESPONSIVE_MENU_ROW_CLASSNAME, 'text-left px-2 py-1.5 rounded text-sm', UI_THEME_TOKENS.button.hoverBg].join(' ')}
                              role="menuitem"
                              onClick={() => {
                                if (!props.canMutate) return
                                props.onUpdateCell({ rowId: props.row.id, columnId: props.groupByColumnId, nextValue: t })
                                setMenuOpen(false)
                                setMoveMenuOpen(false)
                              }}
                            >
                              <span className={UI_TEXT_TRUNCATE}>{t || MARKDOWN_DATA_VIEW_COPY.ungroupedLabel}</span>
                            </button>
                          </li>
                        ))}
                      </menu>
                    ) : null}
                  </li>
                  <li className={['list-none my-2 h-px', UI_THEME_TOKENS.panel.divider].join(' ')} />
                  <li className="list-none">
                    <button type="button" className={[UI_RESPONSIVE_MENU_ROW_CLASSNAME, 'gap-3 px-2 py-1.5 rounded text-sm opacity-60', UI_THEME_TOKENS.button.hoverBg].join(' ')} role="menuitem" disabled>
                      <ArrowUp className={['w-4 h-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
                      <span className={UI_TEXT_TRUNCATE}>Insert Before</span>
                    </button>
                  </li>
                  <li className="list-none">
                    <button type="button" className={[UI_RESPONSIVE_MENU_ROW_CLASSNAME, 'gap-3 px-2 py-1.5 rounded text-sm opacity-60', UI_THEME_TOKENS.button.hoverBg].join(' ')} role="menuitem" disabled>
                      <ArrowDown className={['w-4 h-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
                      <span className={UI_TEXT_TRUNCATE}>Insert After</span>
                    </button>
                  </li>
                  <li className={['list-none my-2 h-px', UI_THEME_TOKENS.panel.divider].join(' ')} />
                  <li className="list-none">
                    <button type="button" className={[UI_RESPONSIVE_MENU_ROW_CLASSNAME, 'gap-3 px-2 py-1.5 rounded text-sm opacity-60', UI_THEME_TOKENS.button.hoverBg].join(' ')} role="menuitem" disabled>
                      <Trash2 className={['w-4 h-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
                      <span className={UI_TEXT_TRUNCATE}>Delete Card</span>
                    </button>
                  </li>
                </menu>
              ) : null}
            </section>
          </li>
        </menu>
      </header>

      <section
        data-kg-kanban-card-drag-region="1"
        className={['px-3 py-2', sharedDragRegionClassName].join(' ')}
        aria-label="Card body"
        {...sharedDragRegionProps}
      >
        <section className="flex items-center gap-2 mb-2" aria-label="Status">
          <CircleChevronDown className={['w-4 h-4', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
          <DataViewStatusChip value={statusValue} checked={false} hideIcon />
        </section>

        {tags.length ? (
          <section className="flex items-center gap-2 mb-2" aria-label="Tags">
            <List className={['w-4 h-4', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
            <ul className={`${uiToolbarRowScrollClassName} gap-1 list-none p-0 m-0`} aria-label="Tag list">
              {tags.map((t, index) => (
                <li key={`${props.row.id}:tag:${t}:${index}`} className="list-none">
                  <DataViewTagChip value={t} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {urlEntries.length ? (
          <section className="flex items-center gap-2 mb-2" aria-label="Links">
            <Link2 className={['w-4 h-4', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
            <ul className="flex flex-col gap-1 list-none p-0 m-0" aria-label="Link list">
              {urlEntries.map(u => (
                <li key={u.id} className="list-none">
                  <a
                    className={['text-xs underline underline-offset-2 truncate block', UI_THEME_TOKENS.text.secondary].join(' ')}
                    href={u.href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    title={u.href}
                  >
                    {u.href}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {paragraphEntries.length ? (
          <section className="flex flex-col gap-2 mb-2" aria-label="Details">
            {paragraphEntries.map(entry => {
              return (
                <section key={`${props.row.id}:text:${entry.id}`} className="rounded border border-black/5 bg-black/[0.025] px-2.5 py-2">
                  <p className={['m-0 text-xs font-semibold uppercase tracking-normal', UI_THEME_TOKENS.text.tertiary].join(' ')}>
                    {entry.label}
                  </p>
                  <CardInlineTextEditor
                    value={entry.value}
                    ariaLabel={`${entry.label} for ${props.row.id}`}
                    placeholder={`Add ${entry.label.toLowerCase()}`}
                    canEdit={props.canMutate}
                    multiline
                    rows={3}
                    onCommit={nextValue => {
                      props.onUpdateCell({
                        rowId: props.row.id,
                        columnId: entry.id,
                        nextValue,
                      })
                    }}
                    displayClassName={['m-0 mt-1 text-xs leading-5', UI_THEME_TOKENS.text.secondary].join(' ')}
                    editorClassName={`mt-1 ${UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME} text-xs leading-5`}
                  />
                </section>
              )
            })}
          </section>
        ) : null}

        {props.canMutate ? (
          <KanbanCell
            rowId={props.row.id}
            groupByColumnId={props.groupByColumnId}
            value={String(props.row.cells[props.groupByIndex] ?? '')}
            options={statusOptions}
            onUpdateCell={props.onUpdateCell}
          />
        ) : null}
      </section>
    </article>
  )
})
