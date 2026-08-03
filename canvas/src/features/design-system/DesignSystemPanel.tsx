import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { DesignSystemPageId } from '@/hooks/store/designSystemSlice'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_FOCUS_RING, UI_SURFACE_CARD } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { UI_LABELS } from '@/lib/config'
import { DESIGN_SYSTEM_SHELL_GRID_CLASS_NAME } from '@/features/design-system/designSystemResponsiveClasses'
import { THEME_MODE_OPTIONS, type ThemeMode } from '@/lib/ui/theme'
import { uiSelectedRowStateClassName } from 'grph-shared/ui/selectedRowClasses'

const NAV_ITEMS: Array<{ id: DesignSystemPageId; label: string }> = [
  { id: 'hub', label: 'Hub' },
  { id: 'tokens', label: 'Tokens & Themes' },
  { id: 'utilities', label: 'Utilities & Table Patterns' },
]

function ThemeModeToggle() {
  const { themeMode, setThemeMode } = useGraphStore(
    useShallow(s => ({
      themeMode: s.themeMode,
      setThemeMode: s.setThemeMode,
    })),
  )

  const onSet = React.useCallback(
    (mode: ThemeMode) => {
      setThemeMode(mode)
    },
    [setThemeMode],
  )

  const itemClass = (active: boolean) =>
    cn(
      'px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
      UI_THEME_TOKENS.panel.border,
      UI_THEME_TOKENS.button.text,
      UI_FOCUS_RING,
      active
        ? cn(UI_THEME_TOKENS.button.activeBg, UI_THEME_TOKENS.button.activeBorder)
        : UI_THEME_TOKENS.button.hoverBg,
    )

  return (
    <section aria-label={UI_LABELS.theme} className="flex items-center gap-2">
      <span className={cn('text-xs', UI_THEME_TOKENS.text.secondary)}>{UI_LABELS.theme}</span>
      <section className={cn('flex items-center gap-1 p-1 rounded-lg border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}>
        {THEME_MODE_OPTIONS.map(option => (
          <button key={option.mode} type="button" className={itemClass(themeMode === option.mode)} onClick={() => onSet(option.mode)}>
            {option.label}
          </button>
        ))}
      </section>
    </section>
  )
}

export function DesignSystemPanel({
  activePage,
  onNavigate,
  children,
}: {
  activePage: DesignSystemPageId
  onNavigate: (page: DesignSystemPageId) => void
  children: React.ReactNode
}) {
  return (
    <article className={cn('h-full min-h-0 flex flex-col', UI_THEME_TOKENS.text.primary)} aria-label={UI_LABELS.designSystem}>
      <header className={cn('flex items-center justify-between gap-3 px-3 py-2 border-b', UI_THEME_TOKENS.panel.divider)}>
        <section className="min-w-0">
          <h2 className="m-0 text-sm font-semibold">{UI_LABELS.designSystem}</h2>
          <p className={cn('m-0 text-xs', UI_THEME_TOKENS.text.secondary)}>
            Local SSOT tokens + utilities for Workspace, viewers, and data tables.
          </p>
        </section>
        <ThemeModeToggle />
      </header>

      <section className={DESIGN_SYSTEM_SHELL_GRID_CLASS_NAME}>
        <nav aria-label="Design system navigation" className={cn('h-fit', UI_SURFACE_CARD)}>
          <ul className="m-0 p-2 list-none flex flex-col gap-1">
            {NAV_ITEMS.map(item => {
              const isActive = item.id === activePage
              return (
                <li key={item.id} className="list-none">
                  <button
                    type="button"
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                      UI_THEME_TOKENS.text.primary,
                      UI_FOCUS_RING,
                      isActive
                        ? uiSelectedRowStateClassName(true)
                        : UI_THEME_TOKENS.button.hoverBg,
                    )}
                    onClick={() => onNavigate(item.id)}
                  >
                    {item.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <main className="min-w-0 min-h-0 overflow-auto" aria-label="Design system content">
          {children}
        </main>
      </section>
    </article>
  )
}
