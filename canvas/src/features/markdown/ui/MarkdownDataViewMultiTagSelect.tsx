import React from 'react'
import { X, MoreHorizontal, Check } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'
import { resolveDataViewChipClass } from './MarkdownDataViewChips'
import { toTableCellStringArray } from '@/lib/markdown/tableCellConventions'
import {
  UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_DATA_VIEW_OPTION_MENU_LIST_CLASSNAME,
  UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME,
  UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
  UI_RESPONSIVE_MENU_ROW_CLASSNAME,
  UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME,
  UI_RESPONSIVE_TAG_INPUT_FORM_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'

const normalizeTagText = (raw: string): string => {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

const uniqueTags = (vals: string[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of vals) {
    const s = normalizeTagText(v)
    if (!s) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

export type MarkdownDataViewMultiTagSelectProps = {
  value: string
  options: readonly string[]
  canCreate: boolean
  autoFocus?: boolean
  onChange: (nextValue: string) => void
  onRequestClose?: () => void
}

export const MarkdownDataViewMultiTagSelect = React.memo(function MarkdownDataViewMultiTagSelect(
  props: MarkdownDataViewMultiTagSelectProps,
) {
  const selected = React.useMemo(() => uniqueTags(toTableCellStringArray(props.value)), [props.value])
  const selectedSet = React.useMemo(() => new Set(selected.map(s => s.toLowerCase())), [selected])
  const [query, setQuery] = React.useState('')

  const normalizedOptions = React.useMemo(() => {
    return uniqueTags(Array.from(props.options || []).map(normalizeTagText)).filter(Boolean)
  }, [props.options])

  const filtered = React.useMemo(() => {
    const q = normalizeTagText(query).toLowerCase()
    if (!q) return normalizedOptions
    return normalizedOptions.filter(o => o.toLowerCase().includes(q))
  }, [normalizedOptions, query])

  const canCreate = props.canCreate
  const createCandidate = React.useMemo(() => {
    if (!canCreate) return null
    const q = normalizeTagText(query)
    if (!q) return null
    if (selectedSet.has(q.toLowerCase())) return null
    if (normalizedOptions.some(o => o.toLowerCase() === q.toLowerCase())) return null
    return q
  }, [canCreate, normalizedOptions, query, selectedSet])

  const apply = React.useCallback(
    (nextTags: string[]) => {
      const next = uniqueTags(nextTags)
      if (next.length <= 0) {
        props.onChange('')
        return
      }
      if (next.length === 1) {
        props.onChange(next[0] || '')
        return
      }
      props.onChange(`\`${JSON.stringify(next)}\``)
    },
    [props],
  )

  const removeTag = React.useCallback(
    (t: string) => {
      const key = t.toLowerCase()
      apply(selected.filter(x => x.toLowerCase() !== key))
    },
    [apply, selected],
  )

  const toggleTag = React.useCallback(
    (t: string) => {
      const key = t.toLowerCase()
      if (selectedSet.has(key)) {
        apply(selected.filter(x => x.toLowerCase() !== key))
        return
      }
      apply([...selected, t])
    },
    [apply, selected, selectedSet],
  )

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        props.onRequestClose?.()
        return
      }
      if (e.key === 'Enter') {
        const candidate = createCandidate
        if (!candidate) return
        e.preventDefault()
        toggleTag(candidate)
        setQuery('')
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && !query && selected.length) {
        e.preventDefault()
        removeTag(selected[selected.length - 1] || '')
      }
    },
    [createCandidate, props, query, removeTag, selected, toggleTag],
  )

  return (
    <section
      className={['min-w-0 max-w-full rounded border p-2', UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border].join(' ')}
      aria-label="Multi-tag select"
    >
      <header className="flex min-w-0 max-w-full flex-wrap gap-1 items-center">
        <ul className="flex min-w-0 max-w-full flex-wrap gap-1 items-center list-none m-0 p-0" aria-label="Selected tags">
          {selected.map(t => (
            <li key={t} className="list-none">
              <span className={[UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME, 'gap-1 px-2 py-0.5 rounded border text-xs font-medium', resolveDataViewChipClass(t)].join(' ')}>
                <span className={UI_TEXT_TRUNCATE}>{t}</span>
                <button
                  type="button"
                  className={['inline-flex shrink-0 items-center justify-center w-4 h-4 rounded', UI_THEME_TOKENS.button.hoverBg].join(' ')}
                  aria-label={`Remove ${t}`}
                  onClick={() => removeTag(t)}
                >
                  <X className={[UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME, UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>

        <form className={`${UI_RESPONSIVE_TAG_INPUT_FORM_CLASSNAME} flex-1`} aria-label="Tag input" onSubmit={e => e.preventDefault()}>
          <input
            autoFocus={props.autoFocus}
            value={query}
            placeholder={MARKDOWN_DATA_VIEW_COPY.multiTagTypeHerePlaceholder}
            className={['w-full min-w-0 bg-transparent outline-none text-xs', UI_THEME_TOKENS.text.primary].join(' ')}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </form>
      </header>

      <section className={['my-2 h-px', UI_THEME_TOKENS.panel.divider].join(' ')} />

      <p className={['m-0 text-xs', UI_THEME_TOKENS.text.tertiary].join(' ')}>{MARKDOWN_DATA_VIEW_COPY.multiTagHelperText}</p>

      <menu className={`${UI_RESPONSIVE_DATA_VIEW_OPTION_MENU_LIST_CLASSNAME} mt-2`} aria-label="Tag options">
        {createCandidate ? (
          <li className="list-none">
            <button
              type="button"
              className={[UI_RESPONSIVE_MENU_ROW_CLASSNAME, 'gap-2 px-2 py-1.5 rounded text-xs', UI_THEME_TOKENS.button.hoverBg].join(' ')}
              onClick={() => {
                toggleTag(createCandidate)
                setQuery('')
              }}
            >
              <PlusIcon />
              <span className={['min-w-0', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.primary].join(' ')}>{MARKDOWN_DATA_VIEW_COPY.multiTagCreateLabel(createCandidate)}</span>
            </button>
          </li>
        ) : null}

        {filtered.map(t => {
          const active = selectedSet.has(t.toLowerCase())
          return (
            <li key={t} className="list-none">
              <section className={['w-full', UI_RESPONSIVE_ELEMENT_ROW_CLASSNAME, 'gap-2 px-2 py-1.5 rounded', UI_THEME_TOKENS.button.hoverBg].join(' ')}>
                <button
                  type="button"
                  className={`${UI_RESPONSIVE_MENU_ROW_CLASSNAME} flex-1 gap-2 text-left`}
                  onClick={() => toggleTag(t)}
                  aria-pressed={active}
                >
                  <span className={[UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME, 'px-2 py-0.5 rounded border text-xs font-medium', resolveDataViewChipClass(t)].join(' ')}>
                    <span className={UI_TEXT_TRUNCATE}>{t}</span>
                  </span>
                  {active ? <Check className={['w-4 h-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" /> : null}
                </button>
                <button
                  type="button"
                  className={[UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME, 'rounded', UI_THEME_TOKENS.button.hoverBg].join(' ')}
                  aria-label={`More for ${t}`}
                  disabled
                >
                  <MoreHorizontal className={['w-4 h-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
                </button>
              </section>
            </li>
          )
        })}
      </menu>
    </section>
  )
})

function PlusIcon() {
  return (
    <span className={['inline-flex shrink-0 items-center justify-center w-5 h-5 rounded border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.text.secondary].join(' ')} aria-hidden="true">
      +
    </span>
  )
}
