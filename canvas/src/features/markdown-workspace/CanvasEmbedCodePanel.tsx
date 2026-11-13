import React from 'react'
import { CanvasEmbedPanelShell } from '@/features/canvas/CanvasEmbedPanelShell'
import { ClipboardCopyButton } from '@/features/markdown/ui/codeblock/ClipboardCopyButton'
import { HighlightedCode } from '@/features/markdown/ui/codeblock/HighlightedCode'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

type CanvasEmbedCodePanelProps = {
  sourceName: string
  title: string
  language: string
  code: string
  onClose: () => void
}

export function CanvasEmbedCodePanel(props: CanvasEmbedCodePanelProps) {
  return (
    <CanvasEmbedPanelShell
      ariaLabel="Share code panel"
      title={props.title}
      sourceName={props.sourceName}
      badge={props.language}
      headerActions={<ClipboardCopyButton text={props.code} />}
      onClose={props.onClose}
    >
      <section className={`min-h-0 overflow-auto ${UI_THEME_TOKENS.code.bg} ${UI_THEME_TOKENS.code.text}`}>
        <pre className="m-0 p-4 font-mono text-xs leading-5 whitespace-pre-wrap break-words">
          <HighlightedCode code={props.code} lang={props.language} highlightLines={null} />
        </pre>
      </section>
    </CanvasEmbedPanelShell>
  )
}
