import { UI_FONT_MONO } from 'grph-shared/ui/typography'
import React from 'react'
import { type MermaidInitConfig, useRootThemeMode } from '@/features/panels/views/preview-panel/ui/mermaidConfig'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { MermaidVisibilityGate } from './MermaidVisibilityGate'

const MermaidDiagramLazy = React.lazy(() =>
  import('@/lib/panels/views/preview-panel/ui/MermaidDiagram.impl').then(mod => ({ default: mod.MermaidDiagram })),
)
const PlainMermaidDiagramLazy = React.lazy(() =>
  import('@/features/markdown/ui/PlainMermaidDiagram').then(mod => ({ default: mod.PlainMermaidDiagram })),
)

export function Alert({
  title,
  kind = 'info',
  children,
}: {
  title?: string
  kind?: 'info' | 'success' | 'warning' | 'danger'
  children?: React.ReactNode
}) {
  const color =
    kind === 'success'
      ? 'border-green-200 bg-green-50 text-green-900'
      : kind === 'warning'
      ? 'border-yellow-200 bg-yellow-50 text-yellow-900'
      : kind === 'danger'
      ? 'border-red-200 bg-red-50 text-red-900'
      : 'border-blue-200 bg-blue-50 text-blue-900'

  return (
    <section className={['my-3 p-3 rounded border', color].join(' ')}>
      {title ? <section className="font-semibold mb-1">{title}</section> : null}
      <section className="text-sm">{children}</section>
    </section>
  )
}

export function Chart({
  values,
  height = 180,
  color = '#2563eb',
}: {
  values: number[]
  height?: number
  color?: string
}) {
  const safe = Array.isArray(values) ? values.filter(v => typeof v === 'number' && Number.isFinite(v)) : []
  const max = safe.length ? Math.max(...safe) : 1
  const w = 720
  const h = Math.max(80, Math.floor(height))
  const pad = 24
  const innerW = Math.max(1, w - pad * 2)
  const innerH = Math.max(1, h - pad * 2)
  const barW = safe.length ? innerW / safe.length : innerW

  return (
    <section className="my-3 overflow-auto">
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className={`rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`}
      >
        <g transform={`translate(${pad},${pad})`}>
          {safe.map((v, i) => {
            const barH = max > 0 ? (v / max) * innerH : 0
            const x = i * barW
            const y = innerH - barH
            return (
              <rect
                key={i}
                x={x + Math.max(1, barW * 0.1)}
                y={y}
                width={Math.max(1, barW * 0.8)}
                height={Math.max(0, barH)}
                rx={2}
                fill={color}
                opacity={0.9}
              />
            )
          })}
          <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="#e5e7eb" />
        </g>
      </svg>
    </section>
  )
}

export function LiveCode({
  html = '',
  css = '',
  js = '',
  height = 240,
}: {
  html?: string
  css?: string
  js?: string
  height?: number
}) {
  const srcDoc = React.useMemo(() => {
    const safeHtml = String(html || '')
    const safeCss = String(css || '')
    const safeJs = String(js || '')
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>${safeCss}</style>
  </head>
  <body>
    ${safeHtml}
    <script>
      try {
        ${safeJs}
      } catch (e) {
        const pre = document.createElement('pre')
        pre.style.whiteSpace = 'pre-wrap'
        pre.style.fontFamily = ${UI_FONT_MONO}
        pre.textContent = String(e && e.stack ? e.stack : e)
        document.body.appendChild(pre)
      }
    </script>
  </body>
</html>`
  }, [css, html, js])

  return (
    <section className={`my-3 rounded border ${UI_THEME_TOKENS.panel.border} overflow-hidden ${UI_THEME_TOKENS.panel.bg}`}>
      <iframe
        title="Live preview"
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        className="w-full"
        style={{ height: `${Math.max(80, Math.floor(height))}px` }}
      />
    </section>
  )
}

export function Mermaid({
  code,
  config,
}: {
  code: string
  config?: MermaidInitConfig | null
}) {
  const rootThemeMode = useRootThemeMode()
  const useEnhancedMermaid = !!(config && Object.keys(config).length)
  return (
    <React.Suspense fallback={null}>
      <MermaidVisibilityGate>
        {useEnhancedMermaid ? (
          <MermaidDiagramLazy
            code={code}
            highlightClass=""
            frontmatterConfig={config || null}
            rootThemeMode={rootThemeMode}
          />
        ) : (
          <PlainMermaidDiagramLazy
            code={code}
            rootThemeMode={rootThemeMode}
          />
        )}
      </MermaidVisibilityGate>
    </React.Suspense>
  )
}
