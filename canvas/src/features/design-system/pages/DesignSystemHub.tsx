import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_SURFACE_CARD } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { DESIGN_REVIEW_GUIDANCE } from '@/features/design/designContext'

type TabKey = 'workspace' | 'viewers' | 'tables'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'workspace', label: 'Workspace editor' },
  { key: 'viewers', label: 'Markdown/HTML viewers' },
  { key: 'tables', label: 'Kanban/Table/Graph tables' },
]

const QUICK_START: Record<TabKey, { title: string; snippet: string; pitfalls: string[] }> = {
  workspace: {
    title: 'Workspace editor surface',
    snippet:
      "Import tokens by including `src/index.css` (it imports `kgTokens.generated.css`). Theme is controlled via `data-theme` on `<html>`.",
    pitfalls: ['Avoid hardcoded colors/px; use semantic tokens or UI utilities.', 'Use shared focus ring for keyboard-visible states.'],
  },
  viewers: {
    title: 'Markdown/HTML viewer surfaces',
    snippet: 'Use `resolveCssVarWithKgFallback()` when constructing isolated viewer documents to ensure theme consistency.',
    pitfalls: ['Do not bake theme-specific colors into HTML strings.', 'Prefer tokens for backgrounds, text, borders, and code blocks.'],
  },
  tables: {
    title: 'Kanban/Table/Graph data tables',
    snippet: 'Consume `UI_THEME_TOKENS.table.*` and `UI_TABLE.*` helpers for consistent header/row/selection styling.',
    pitfalls: ['Do not use `bg-gray-*` or `ring-blue-*` directly; prefer token-backed classes.'],
  },
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={cn('p-4', UI_SURFACE_CARD)}>
      <h3 className="m-0 text-sm font-semibold">{title}</h3>
      <section className="mt-3">{children}</section>
    </section>
  )
}

export default function DesignSystemHub() {
  const [tab, setTab] = React.useState<TabKey>('workspace')
  const content = QUICK_START[tab]

  return (
    <article className="flex flex-col gap-4" aria-label="Design system hub">
      <Card title="Quick start">
        <section className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Quick start tabs">
          {TABS.map(t => {
            const active = t.key === tab
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={cn(
                  'px-3 py-1.5 rounded-md border text-xs font-medium transition-colors',
                  UI_THEME_TOKENS.panel.border,
                  UI_THEME_TOKENS.button.text,
                  active ? cn(UI_THEME_TOKENS.button.activeBg, UI_THEME_TOKENS.button.activeBorder) : UI_THEME_TOKENS.button.hoverBg,
                )}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            )
          })}
        </section>

        <section className="mt-3">
          <h4 className={cn('m-0 text-sm font-semibold', UI_THEME_TOKENS.text.primary)}>{content.title}</h4>
          <p className={cn('mt-2 mb-0 text-sm', UI_THEME_TOKENS.text.secondary)}>{content.snippet}</p>
          <ul className={cn('mt-3 mb-0 pl-5 text-sm', UI_THEME_TOKENS.text.secondary)}>
            {content.pitfalls.map(p => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      </Card>

      <Card title="SSOT rules">
        <ul className={cn('m-0 pl-5 text-sm', UI_THEME_TOKENS.text.secondary)}>
          <li>Tokens are defined once in `grph-shared/ui/kgTokens` and emitted to `kgTokens.generated.css`.</li>
          <li>Generated CSS is treated as read-only; changes flow through token definitions.</li>
          <li>Surfaces must consume semantic tokens and shared utilities instead of hardcoded colors/sizes.</li>
        </ul>
      </Card>
      <Card title="Design review">
        <ul className="m-0 pl-5 text-sm">{DESIGN_REVIEW_GUIDANCE.map(line => <li key={line}>{line}</li>)}</ul>
        <p className="text-sm">Open Design → Tokens to inspect authored tokens, observed document values and source findings, or export a local design context.</p>
      </Card>

      <Card title="Adoption status">
        <p className={cn('m-0 text-sm', UI_THEME_TOKENS.text.secondary)}>
          This page focuses on the SSOT foundation. Next steps are to progressively move remaining local utility classes (e.g.
          `bg-gray-*`, `ring-blue-*`) into token-backed utilities.
        </p>
      </Card>
    </article>
  )
}
