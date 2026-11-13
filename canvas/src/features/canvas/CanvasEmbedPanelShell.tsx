import React from 'react'
import { PanelControlButton } from '@agentic-base/views-react/controls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

type CanvasEmbedPanelShellProps = {
  ariaLabel: string
  title: string
  sourceName: string
  badge?: string
  headerActions?: React.ReactNode
  children: React.ReactNode
  onClose: () => void
  widthClassName?: string
}

export function CanvasEmbedPanelShell(props: CanvasEmbedPanelShellProps) {
  const titleId = React.useId()

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [props.onClose])

  return (
    <section className="pointer-events-auto fixed inset-0 z-[1250] flex items-center justify-center bg-black/45 p-4" aria-label={props.ariaLabel}>
      <article
        className={`flex max-h-[min(44rem,calc(100dvh-2rem))] ${props.widthClassName || 'w-[min(46rem,100%)]'} flex-col overflow-hidden rounded-xl border shadow-[var(--kg-shadow-overlay)] ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.panel.border}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={`flex items-center gap-3 border-b px-4 py-3 ${UI_THEME_TOKENS.code.border}`}>
          <section className="min-w-0 flex-1">
            <h2 id={titleId} className="text-sm font-semibold">{props.title}</h2>
            <p className={`mt-0.5 truncate text-xs ${UI_THEME_TOKENS.text.secondary}`}>{props.sourceName}</p>
          </section>
          {props.badge ? <span className={`font-mono text-xs ${UI_THEME_TOKENS.text.secondary}`}>{props.badge}</span> : null}
          {props.headerActions}
          <PanelControlButton control="close" onAction={props.onClose} />
        </header>
        {props.children}
      </article>
    </section>
  )
}
