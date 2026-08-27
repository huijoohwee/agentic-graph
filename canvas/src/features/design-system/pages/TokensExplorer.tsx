import React from 'react'
import { AG_TOKEN_DEFS, resolveCssVarWithKgFallback } from '@/lib/ui/tokens-ssot'
import type { KgTokenDef } from 'grph-shared/ui/kgTokens'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_FOCUS_RING, UI_SURFACE_CARD } from '@/lib/ui'
import { cn } from '@/lib/utils'
import {
  DESIGN_SYSTEM_TOKEN_DETAIL_GRID_CLASS_NAME,
  DESIGN_SYSTEM_TOKENS_GRID_CLASS_NAME,
} from '@/features/design-system/designSystemResponsiveClasses'

type TokenRow = KgTokenDef & { current: string }

const copyText = async (text: string): Promise<boolean> => {
  const v = String(text || '')
  if (!v) return false
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(v)
      return true
    }
  } catch {
    void 0
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = v
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function TokenDetail({ token }: { token: TokenRow | null }) {
  if (!token) return null
  const cssSnippet = `color: var(${token.cssVar});`
  const tsSnippet = `resolveCssVarWithKgFallback('${token.cssVar}')`
  return (
    <aside className={cn('p-4', UI_SURFACE_CARD)} aria-label="Token details">
      <h3 className="m-0 text-sm font-semibold">{token.cssVar}</h3>
      <dl className={DESIGN_SYSTEM_TOKEN_DETAIL_GRID_CLASS_NAME}>
        <dt className={cn('m-0', UI_THEME_TOKENS.text.secondary)}>Current</dt>
        <dd className="m-0">{token.current}</dd>
        <dt className={cn('m-0', UI_THEME_TOKENS.text.secondary)}>Light</dt>
        <dd className="m-0">{token.light}</dd>
        <dt className={cn('m-0', UI_THEME_TOKENS.text.secondary)}>Dark</dt>
        <dd className="m-0">{token.dark}</dd>
      </dl>
      <section className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          className={cn('px-3 py-2 rounded-md border text-xs', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg, UI_FOCUS_RING)}
          onClick={() => void copyText(cssSnippet)}
        >
          Copy CSS
        </button>
        <button
          type="button"
          className={cn('px-3 py-2 rounded-md border text-xs', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg, UI_FOCUS_RING)}
          onClick={() => void copyText(tsSnippet)}
        >
          Copy TypeScript
        </button>
      </section>
    </aside>
  )
}

export default function TokensExplorer() {
  const [query, setQuery] = React.useState('')
  const [selected, setSelected] = React.useState<TokenRow | null>(null)

  const rows = React.useMemo((): TokenRow[] => {
    const q = String(query || '').trim().toLowerCase()
    return AG_TOKEN_DEFS
      .filter((t: KgTokenDef) => {
        if (!q) return true
        return String(t.cssVar || '').toLowerCase().includes(q)
      })
      .map(t => ({ ...t, current: resolveCssVarWithKgFallback(t.cssVar) }))
  }, [query])

  React.useEffect(() => {
    if (!selected) return
    const still = rows.find(r => r.cssVar === selected.cssVar)
    if (still) setSelected(prev => (prev && prev.cssVar === still.cssVar ? still : prev))
    else setSelected(null)
  }, [rows, selected])

  return (
    <article className={DESIGN_SYSTEM_TOKENS_GRID_CLASS_NAME} aria-label="Tokens and themes">
      <section className={cn('p-4', UI_SURFACE_CARD)} aria-label="Token filters">
        <label className="block">
          <span className={cn('text-xs font-medium', UI_THEME_TOKENS.text.secondary)}>Search</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            className={cn('mt-2 w-full rounded-md border px-3 py-2 text-sm', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg, UI_FOCUS_RING)}
            placeholder="Search tokens…"
          />
        </label>
      </section>

      <section className={cn('p-4', UI_SURFACE_CARD)} aria-label="Token table">
        <section className="overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={cn('border-b', UI_THEME_TOKENS.panel.divider)}>
                <th scope="col" className={cn('py-2 pr-3 text-left text-xs font-semibold', UI_THEME_TOKENS.text.secondary)}>
                  Token
                </th>
                <th scope="col" className={cn('py-2 pr-3 text-left text-xs font-semibold', UI_THEME_TOKENS.text.secondary)}>
                  Current
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isActive = selected?.cssVar === row.cssVar
                return (
                  <tr key={row.cssVar} className={cn('border-b', UI_THEME_TOKENS.panel.divider)}>
                    <td className="py-2 pr-3 align-top">
                      <button
                        type="button"
                        className={cn('text-left underline-offset-2 hover:underline', UI_FOCUS_RING, isActive ? 'font-semibold' : 'font-medium')}
                        onClick={() => setSelected(row)}
                      >
                        {row.cssVar}
                      </button>
                    </td>
                    <td className="py-2 pr-3 align-top font-mono text-xs">{row.current}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </section>

      <TokenDetail token={selected} />
    </article>
  )
}
