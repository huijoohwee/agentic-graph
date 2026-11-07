import React from 'react'
import { Check } from 'lucide-react'

import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import {
  UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_MENU_ROW_CLASSNAME,
  UI_RESPONSIVE_TYPE_MENU_PANEL_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

export type TypeMenuOption<T extends string> = {
  key: T
  label: string
  icon: React.ComponentType<{ className?: string }>
}

export type TypeMenuProps<T extends string> = {
  ariaLabel: string
  value: T
  options: readonly TypeMenuOption<T>[]
  onSelect: (next: T) => void
  className?: string
  isDisabled?: (key: T) => boolean
  close?: () => void
}

const typeMenuGlyphClassName = [UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME, 'shrink-0', UI_THEME_TOKENS.icon.color].join(' ')

export function TypeMenu<T extends string>(props: TypeMenuProps<T>) {
  return (
    <menu
      className={
        [
          UI_RESPONSIVE_TYPE_MENU_PANEL_CLASSNAME,
          'rounded border shadow-[var(--kg-shadow-overlay)] p-1 z-20',
          UI_THEME_TOKENS.panel.bg,
          UI_THEME_TOKENS.panel.border,
          props.className || '',
        ].join(' ')
      }
      aria-label={props.ariaLabel}
    >
      {props.options.map(o => {
        const active = o.key === props.value
        const disabled = props.isDisabled?.(o.key) ?? false
        const Icon = o.icon
        return (
          <li key={o.key} className="list-none">
            <button
              type="button"
              className={
                [
                  `${UI_RESPONSIVE_MENU_ROW_CLASSNAME} gap-2 px-2 py-2 rounded text-xs`,
                  disabled ? UI_THEME_TOKENS.text.tertiary : UI_THEME_TOKENS.button.hoverBg,
                ].join(' ')
              }
              aria-disabled={disabled}
              disabled={disabled}
              onClick={(e) => {
                props.onSelect(o.key)
                if (props.close) {
                  props.close()
                  return
                }
                const el = (e.currentTarget as HTMLElement | null)?.closest('details') as HTMLDetailsElement | null
                if (el) el.open = false
              }}
            >
              <Icon className={typeMenuGlyphClassName} />
              <span className={['min-w-0 flex-1 text-left', UI_TEXT_TRUNCATE].join(' ')}>{o.label}</span>
              {active ? <Check className={typeMenuGlyphClassName} aria-hidden="true" /> : null}
            </button>
          </li>
        )
      })}
    </menu>
  )
}
