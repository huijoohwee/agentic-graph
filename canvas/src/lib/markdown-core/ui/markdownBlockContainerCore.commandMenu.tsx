import React from 'react'
import { Search } from 'lucide-react'
import { preventDefaultMouseDown } from '@/lib/markdown-core/ui/markdownInlineSelectionToolbarInteractions'
import { InlineMediaCommandThumbnail } from '@/lib/command-menu/InlineMediaCommandThumbnail'
import type { InlineMediaKind } from '@/lib/command-menu/inlineCommandMenuCatalog'
import {
  UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_MARKDOWN_INLINE_MENU_LIST_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export type MarkdownInlineCommandMenuItem = {
  id: string
  label: string
  group: string
  description?: string
  keywords?: string[]
  thumbnailUrl?: string
  thumbnailKind?: InlineMediaKind
  disabled?: boolean
  danger?: boolean
  onSelect: () => void
}

const normalizeCommandText = (value: string): string => String(value || '').trim().toLowerCase()

const scoreCommandItem = (item: MarkdownInlineCommandMenuItem, query: string): number => {
  if (!query) return 1
  const label = normalizeCommandText(item.label)
  const haystack = normalizeCommandText([
    item.label,
    item.group,
    item.description,
    ...(item.keywords || []),
  ].filter(Boolean).join(' '))
  if (label === query) return 5
  if (label.startsWith(query)) return 4
  if (haystack.includes(query)) return 2
  return 0
}

const filterMarkdownInlineCommandItems = (
  items: MarkdownInlineCommandMenuItem[],
  rawQuery: string,
): MarkdownInlineCommandMenuItem[] => {
  const query = normalizeCommandText(rawQuery)
  return items
    .map((item, index) => ({ item, index, score: scoreCommandItem(item, query) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(row => row.item)
}

export const MarkdownBlockContainerCommandMenu = (props: {
  ariaLabel: string
  items: MarkdownInlineCommandMenuItem[]
  query: string
  onQueryChange: (value: string) => void
  onCancel?: () => void
  placeholder: string
  inputClassName: string
  itemClassName: string
  itemDangerClassName: string
  itemDisabledClassName: string
  emptyLabel: string
  selectOnPointerDown?: boolean
  menuClassName?: string
}) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const mouseDownSelectedItemIdRef = React.useRef('')
  const [activeIndex, setActiveIndex] = React.useState(0)
  const filteredItems = React.useMemo(
    () => filterMarkdownInlineCommandItems(props.items, props.query),
    [props.items, props.query],
  )
  const selectableItems = React.useMemo(
    () => filteredItems.filter(item => !item.disabled),
    [filteredItems],
  )
  React.useEffect(() => {
    setActiveIndex(0)
  }, [props.query, selectableItems.length])
  React.useEffect(() => {
    const rafId = window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(rafId)
  }, [])

  const runItem = React.useCallback((item: MarkdownInlineCommandMenuItem) => {
    if (item.disabled) return
    item.onSelect()
  }, [])

  const runItemFromPointerStart = React.useCallback((event: React.MouseEvent<HTMLButtonElement> | React.PointerEvent<HTMLButtonElement>, item: MarkdownInlineCommandMenuItem) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.button !== 0 || item.disabled || mouseDownSelectedItemIdRef.current === item.id) return
    mouseDownSelectedItemIdRef.current = item.id
    runItem(item)
    window.requestAnimationFrame(() => {
      if (mouseDownSelectedItemIdRef.current === item.id) mouseDownSelectedItemIdRef.current = ''
    })
  }, [runItem])

  const runItemFromClick = React.useCallback((item: MarkdownInlineCommandMenuItem) => {
    if (mouseDownSelectedItemIdRef.current === item.id) return
    runItem(item)
  }, [runItem])

  const onInputKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      props.onCancel?.()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const count = selectableItems.length
      if (count <= 0) return
      setActiveIndex(prev => {
        const delta = event.key === 'ArrowDown' ? 1 : -1
        return (prev + delta + count) % count
      })
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const item = selectableItems[activeIndex]
      if (item) runItem(item)
    }
  }, [activeIndex, props, runItem, selectableItems])

  const activeItemId = selectableItems[activeIndex]?.id
  let lastGroup = ''
  return (
    <section aria-label={props.ariaLabel}>
      <label className={`mb-2 flex items-center gap-1 rounded border px-2 ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.input.border}`}>
        <Search className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} strokeWidth={1.6} aria-hidden />
        <input
          ref={inputRef}
          className={`${props.inputClassName} border-0 px-0`}
          value={props.query}
          placeholder={props.placeholder}
          role="combobox"
          aria-expanded
          aria-controls={`${props.ariaLabel.replace(/\s+/g, '-').toLowerCase()}-list`}
          aria-activedescendant={activeItemId ? `${props.ariaLabel}-${activeItemId}` : undefined}
          onChange={(event) => props.onQueryChange(event.target.value)}
          onKeyDown={onInputKeyDown}
        />
      </label>
      <menu
        id={`${props.ariaLabel.replace(/\s+/g, '-').toLowerCase()}-list`}
        className={props.menuClassName || `${UI_RESPONSIVE_MARKDOWN_INLINE_MENU_LIST_CLASSNAME} overflow-y-auto`}
        role="listbox"
        aria-label={props.ariaLabel}
      >
        {filteredItems.length > 0 ? filteredItems.map((item) => {
          const showGroup = item.group !== lastGroup
          lastGroup = item.group
          const selected = item.id === activeItemId
          const className = item.disabled
            ? props.itemDisabledClassName
            : item.danger
            ? props.itemDangerClassName
            : props.itemClassName
          return (
            <React.Fragment key={item.id}>
              {showGroup ? <li className={`list-none px-2 pt-2 pb-1 text-[10px] uppercase ${UI_THEME_TOKENS.text.tertiary}`}>{item.group}</li> : null}
              <li className="list-none">
                <button
                  id={`${props.ariaLabel}-${item.id}`}
                  type="button"
                  className={`${className} ${selected ? 'bg-black/5 dark:bg-white/10' : ''}`}
                  disabled={item.disabled}
                  role="option"
                  aria-selected={selected}
                  data-kg-inline-command-menu-item="1"
                  data-kg-inline-command-item-id={item.id}
                  data-kg-inline-command-item-group={item.group}
                  data-kg-inline-command-media-kind={item.thumbnailKind || undefined}
                  onMouseEnter={() => {
                    const nextIndex = selectableItems.findIndex(row => row.id === item.id)
                    if (nextIndex >= 0) setActiveIndex(nextIndex)
                  }}
                  onPointerDownCapture={props.selectOnPointerDown === false ? undefined : event => runItemFromPointerStart(event, item)}
                  onPointerDown={props.selectOnPointerDown === false ? undefined : event => runItemFromPointerStart(event, item)}
                  onMouseDownCapture={props.selectOnPointerDown === false ? undefined : event => runItemFromPointerStart(event, item)}
                  onMouseDown={event => {
                    preventDefaultMouseDown(event)
                    if (props.selectOnPointerDown !== false) runItemFromPointerStart(event, item)
                  }}
                  onClick={() => runItemFromClick(item)}
                >
                  {item.thumbnailUrl || item.thumbnailKind ? (
                    <InlineMediaCommandThumbnail kind={item.thumbnailKind} thumbnailUrl={item.thumbnailUrl} />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.label}</span>
                    {item.description ? <span className={`block truncate text-[10px] ${UI_THEME_TOKENS.text.tertiary}`}>{item.description}</span> : null}
                  </span>
                </button>
              </li>
            </React.Fragment>
          )
        }) : (
          <li className={`list-none px-2 py-2 text-xs ${UI_THEME_TOKENS.text.tertiary}`}>{props.emptyLabel}</li>
        )}
      </menu>
    </section>
  )
}
