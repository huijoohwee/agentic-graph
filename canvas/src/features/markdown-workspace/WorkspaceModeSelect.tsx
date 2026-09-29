import React from 'react'
import { PanelSelect } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { UI_RESPONSIVE_WORKSPACE_MODE_TAB_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

export function WorkspaceModeSelect<T extends string>(props: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  ariaLabel: string
  onChange: (next: T) => void
  isActive?: boolean
  presentation?: 'select' | 'tabs'
}) {
  const panelTypography = usePanelTypography()
  const presentation = props.presentation || 'select'
  const activeClass = props.isActive
    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-l-none'
    : ''
  if (presentation === 'tabs') {
    return (
      <nav aria-label={props.ariaLabel} className="inline-flex min-w-0 max-w-full overflow-hidden">
        <ul
          role="tablist"
          aria-label={props.ariaLabel}
          className={['inline-flex min-w-0 max-w-full items-stretch border rounded-sm overflow-hidden', UI_THEME_TOKENS.panel.border].join(' ')}
        >
          {props.options.map((o, idx) => {
            const isSelected = props.value === o.value
            return (
              <li
                key={o.value}
                role="presentation"
                className={[
                  'list-none',
                  idx === props.options.length - 1 ? 'border-r-0' : `border-r ${UI_THEME_TOKENS.panel.border}`,
                ].join(' ')}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  title={o.label}
                  className={[
                    `${UI_RESPONSIVE_WORKSPACE_MODE_TAB_CLASSNAME} px-3 text-xs font-medium border-b-2 transition-colors`,
                    isSelected
                      ? ['bg-[color:var(--kg-panel-bg)] text-[color:var(--kg-text-primary)] border-b-[color:var(--kg-accent,#3b82f6)]'].join(' ')
                      : ['bg-transparent text-[color:var(--kg-text-secondary)] border-b-transparent', UI_THEME_TOKENS.button.hoverBg].join(' '),
                  ].join(' ')}
                  onClick={() => props.onChange(o.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      props.onChange(o.value)
                      return
                    }
                    if (event.key === 'ArrowRight') {
                      event.preventDefault()
                      const next = props.options[(idx + 1) % props.options.length]
                      if (next) props.onChange(next.value)
                      return
                    }
                    if (event.key === 'ArrowLeft') {
                      event.preventDefault()
                      const prev = props.options[(idx - 1 + props.options.length) % props.options.length]
                      if (prev) props.onChange(prev.value)
                      return
                    }
                    if (event.key === 'Home') {
                      event.preventDefault()
                      const first = props.options[0]
                      if (first) props.onChange(first.value)
                      return
                    }
                    if (event.key === 'End') {
                      event.preventDefault()
                      const last = props.options[props.options.length - 1]
                      if (last) props.onChange(last.value)
                    }
                  }}
                >
                  {o.label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    )
  }
  return (
    <PanelSelect
      className={`kg-workspace-mode-select h-6 min-w-0 max-w-full rounded px-1 border-0 outline-none ${panelTypography.microLabelClass} font-medium ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.input.text} ${activeClass}`}
      value={props.value}
      onChange={e => props.onChange(e.target.value as T)}
      aria-label={props.ariaLabel}
    >
      {props.options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </PanelSelect>
  )
}
