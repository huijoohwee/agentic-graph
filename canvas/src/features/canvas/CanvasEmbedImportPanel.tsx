import React from 'react'
import { CanvasEmbedPanelShell } from '@/features/canvas/CanvasEmbedPanelShell'
import {
  CANONICAL_STARTUP_CANVAS_EMBED_URL,
  selectCanvasEmbedImport,
} from '@/features/canvas/canvasEmbedImportContract'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export function CanvasEmbedImportPanel(props: { onClose: () => void }) {
  const [value, setValue] = React.useState('')
  const [error, setError] = React.useState('')

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectCanvasEmbedImport(value)) {
      setError('Paste a valid HTTP(S) agentic-graph iframe or v1 canvas-embed postMessage payload.')
      return
    }
    props.onClose()
  }

  return (
    <CanvasEmbedPanelShell
      ariaLabel="Import canvas embed panel"
      title="Import canvas embed"
      sourceName="Paste iframe HTML or a agentic-graph postMessage v1 payload."
      badge="iframe + postMessage"
      closeAriaLabel="Close canvas embed import panel"
      widthClassName="w-[min(42rem,100%)]"
      onClose={props.onClose}
    >
      <form onSubmit={handleSubmit}>
        <section className="p-4">
          <label htmlFor="canvas-embed-import-value" className={`text-xs font-semibold ${UI_THEME_TOKENS.text.secondary}`}>Embed code</label>
          <textarea
            id="canvas-embed-import-value"
            autoFocus
            rows={9}
            value={value}
            onChange={event => {
              setValue(event.target.value)
              if (error) setError('')
            }}
            placeholder={`<iframe src="${CANONICAL_STARTUP_CANVAS_EMBED_URL}"></iframe>`}
            className={`mt-2 w-full resize-y rounded-lg border p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-[var(--kg-canvas-accent)] ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.text}`}
          />
          <p className={`mt-2 text-xs ${UI_THEME_TOKENS.text.secondary}`}>Bridge type: <code>agentic-graph.canvas-embed.select</code>, version <code>1</code>.</p>
          {error ? <p className="mt-2 text-xs text-red-500" role="alert">{error}</p> : null}
          <footer className="mt-4 flex justify-end gap-2">
            <button type="button" className={`min-h-10 rounded-lg border px-4 text-sm ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.panel.border}`} onClick={props.onClose}>Cancel</button>
            <button type="submit" className="min-h-10 rounded-lg border border-[var(--kg-canvas-accent)] bg-[var(--kg-canvas-accent)] px-4 text-sm font-semibold text-slate-950">Use as Home background</button>
          </footer>
        </section>
      </form>
    </CanvasEmbedPanelShell>
  )
}
