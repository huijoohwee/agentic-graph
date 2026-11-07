import React from 'react'
import { Plus, ChevronDown } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { MarkdownDataViewColumnType } from './markdownDataViewColumnType'
import { labelForMarkdownDataViewColumnType } from './markdownDataViewColumnType'
import { iconByColumnType } from './markdownDataViewColumnTypeMenuIcons'
import { MarkdownDataViewColumnTypeMenu } from './MarkdownDataViewColumnTypeMenu'
import { UI_RESPONSIVE_ACTION_ROW_CLASSNAME, UI_RESPONSIVE_MENU_ROW_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'

export function MarkdownDataViewAddColumnMenu(props: {
  ariaLabel: string
  nextColumnNumber: number
  canMutate: boolean
  onAddColumn?: (args: { name: string; columnType: MarkdownDataViewColumnType }) => void
  summaryClassName: string
  summaryContent?: React.ReactNode
  menuPositionClassName: string
}) {
  const detailsRef = React.useRef<HTMLDetailsElement | null>(null)
  const nameId = React.useId()
  const [name, setName] = React.useState('')
  const [type, setType] = React.useState<MarkdownDataViewColumnType>('text')

  const close = React.useCallback(() => {
    const el = detailsRef.current
    if (el) el.open = false
  }, [])

  const add = React.useCallback(() => {
    if (!props.onAddColumn) return
    const nextName = String(name || '').trim() || `Column ${props.nextColumnNumber}`
    props.onAddColumn({ name: nextName, columnType: type })
    setName('')
    setType('text')
    close()
  }, [close, name, props, type])

  if (!props.canMutate || !props.onAddColumn) return null

  const TypeIcon = iconByColumnType[type]

  return (
    <details className="relative z-30 min-w-0" ref={detailsRef}>
      <summary className={[props.summaryClassName, 'list-none'].join(' ')} aria-label={props.ariaLabel}>
        {props.summaryContent || <Plus className={['w-4 h-4', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />}
      </summary>
      <menu
        className={[
          props.menuPositionClassName,
          'rounded border shadow-[var(--kg-shadow-overlay)] p-2 z-40',
          UI_THEME_TOKENS.panel.bg,
          UI_THEME_TOKENS.panel.border,
        ].join(' ')}
        aria-label="Add column menu"
      >
        <li className="list-none">
          <header className={['min-w-0 text-xs font-semibold px-1 py-1', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.primary].join(' ')}>New column</header>
        </li>
        <li className="list-none px-1 pb-2">
          <label className={['block text-xs mb-1', UI_THEME_TOKENS.text.secondary].join(' ')} htmlFor={nameId}>
            Name
          </label>
          <input
            id={nameId}
            className={['w-full text-xs px-2 py-1 rounded border', UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.text.primary].join(' ')}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={`Column ${props.nextColumnNumber}`}
          />
        </li>
        <li className="list-none px-1 pb-2">
          <section className={['block text-xs mb-1', UI_THEME_TOKENS.text.secondary].join(' ')}>Type</section>
          <details className="relative">
            <summary
              className={[
                UI_RESPONSIVE_MENU_ROW_CLASSNAME,
                'list-none gap-2 px-2 py-1 rounded border cursor-pointer text-xs',
                UI_THEME_TOKENS.input.bg,
                UI_THEME_TOKENS.input.border,
                UI_THEME_TOKENS.text.primary,
              ].join(' ')}
            >
              <TypeIcon className={['w-4 h-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
              <span className={['min-w-0 flex-1 text-left', UI_TEXT_TRUNCATE].join(' ')}>{labelForMarkdownDataViewColumnType(type)}</span>
              <ChevronDown className={['w-4 h-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
            </summary>
            <MarkdownDataViewColumnTypeMenu
              ariaLabel="Select column type"
              value={type}
              className="absolute left-0 mt-2 w-full"
              onSelect={setType}
            />
          </details>
        </li>
        <li className={['list-none my-2 h-px', UI_THEME_TOKENS.panel.divider].join(' ')} />
        <li className="list-none px-1">
          <button
            type="button"
            className={[UI_RESPONSIVE_ACTION_ROW_CLASSNAME, 'w-full justify-center gap-2 px-3 py-2 rounded border text-xs', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg].join(' ')}
            onClick={add}
          >
            <Plus className={['w-4 h-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')} aria-hidden="true" />
            <span className={UI_TEXT_TRUNCATE}>Add</span>
          </button>
        </li>
      </menu>
    </details>
  )
}
