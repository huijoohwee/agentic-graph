import React from 'react'
import { MarkdownInlineTextEditSurface } from '@/lib/markdown-core/ui/MarkdownInlineTextEditSurface'

export function LiveCanvasHeroQueryEditor(props: {
  value: string;
  onChange: (value: string) => void;
}) {
  const editorRef = React.useRef<HTMLElement | null>(null)
  const inputProxyRef = React.useRef<HTMLTextAreaElement | null>(null)

  return (
    <section
      className="relative mt-2 h-44 shrink-0 overflow-hidden rounded-xl border border-[color:var(--kg-border)] bg-[color-mix(in_srgb,var(--kg-code-bg)_88%,transparent)]"
      data-kg-live-canvas-hero-query-scroll="inline"
      onKeyDownCapture={event => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          editorRef.current?.closest('form')?.requestSubmit()
        }
      }}
    >
      <MarkdownInlineTextEditSurface
        value={props.value}
        ariaLabel="Prompt Presets"
        placeholder="Select or edit a source-backed prompt preset"
        className="h-full overflow-y-auto overscroll-contain bg-transparent px-3 py-2.5 font-mono text-xs leading-5 text-[var(--kg-code-text)] outline-none"
        commandMode={null}
        editorRef={editorRef}
        inputProxyRef={inputProxyRef}
        inlineChipDensity="compact"
        multiline
        projectedMediaAttachments={null}
        isCommandMenuTarget={() => false}
        onCancel={() => undefined}
        onCommit={() => undefined}
        onDraftChange={props.onChange}
        onFocus={() => undefined}
        onOpenCommandMenuForSigilAtSelection={() => undefined}
        readCommandSigilFromKeyEvent={() => null}
        readCommandSigilFromInsertedText={() => null}
        cardInlineEditInputAttribute="data-kg-live-canvas-hero-query"
      />
    </section>
  )
}
