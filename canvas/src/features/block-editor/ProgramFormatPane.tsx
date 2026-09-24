import * as React from 'react'
import { MarkdownEditorPane } from '@/features/markdown-workspace/main/editor/MarkdownEditorPane'
import type { MonacoTextEditorHandle } from '@/features/monaco/MonacoTextEditor'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { applyProgramJson, applyProgramMarkdown, renderProgramJson, renderProgramMarkdown } from './programCodec'

type ProgramFormat = 'json' | 'markdown'
const render = (source: string, format: ProgramFormat) => format === 'json' ? renderProgramJson(source) : renderProgramMarkdown(source)
const apply = (source: string, draft: string, format: ProgramFormat) => format === 'json' ? applyProgramJson(source, draft) : applyProgramMarkdown(source, draft)

export default function ProgramFormatPane(props: {
  uri: string; themeMode: 'light' | 'dark'; wordWrap: boolean
  format: ProgramFormat; documentId: string; source: string; onChange: (next: string) => void; readOnly: boolean
}) {
  const editorRef = React.useRef<MonacoTextEditorHandle | null>(null)
  const panelTypography = usePanelTypography()
  const projection = React.useMemo(() => {
    try { return { text: render(props.source, props.format), error: '' } }
    catch (error) { return { text: '', error: error instanceof Error ? error.message : String(error) } }
  }, [props.source, props.format])
  const [draft, setDraft] = React.useState(projection.text)
  const [base, setBase] = React.useState({ documentId: props.documentId, source: props.source, projection: projection.text })
  const [notice, setNotice] = React.useState('')
  React.useEffect(() => {
    if (base.documentId !== props.documentId) {
      setBase({ documentId: props.documentId, source: props.source, projection: projection.text }); setDraft(projection.text); setNotice('')
      return
    }
    if (base.source === props.source) return
    if (draft === base.projection) {
      setBase({ documentId: props.documentId, source: props.source, projection: projection.text }); setDraft(projection.text); setNotice('')
    } else setNotice('Source changed while this draft was open. Copy your draft or reset before applying.')
  }, [base, draft, projection.text, props.documentId, props.source])
  const stale = base.documentId !== props.documentId || base.source !== props.source
  const commit = () => {
    if (stale || props.readOnly) return
    try {
      const next = apply(props.source, draft, props.format)
      if (next !== props.source) props.onChange(next)
      const projected = render(next, props.format)
      setBase({ documentId: props.documentId, source: next, projection: projected }); setDraft(projected)
      setNotice(next === props.source ? 'No source change.' : 'Program edit accepted. Save status follows the workspace source file.')
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)) }
  }
  const reset = () => {
    setBase({ documentId: props.documentId, source: props.source, projection: projection.text }); setDraft(projection.text); setNotice('Draft reset to the current source.')
  }
  return <section className={`flex h-full min-h-0 flex-col ${UI_THEME_TOKENS.panel.bg}`} aria-label={`${props.format.toUpperCase()} program editor`}>
    <header className={`flex flex-wrap items-center gap-2 border-b px-2 py-1 text-xs ${UI_THEME_TOKENS.panel.border}`}>
      <strong>{props.format === 'json' ? 'Program JSON' : 'Program Markdown'}</strong>
      <span className="opacity-70">{props.documentId.split('/').pop()}</span>
      <button type="button" onClick={commit} disabled={props.readOnly || !!projection.error || stale || draft === base.projection}
        className="rounded border px-2 py-1 disabled:opacity-50">Apply to source</button>
      <button type="button" onClick={reset} disabled={props.readOnly || !!projection.error} className="rounded border px-2 py-1 disabled:opacity-50">Reset draft</button>
    </header>
    {projection.error ? <p role="alert" className="p-3 text-sm">This source cannot be converted: {projection.error}. Edit Python to continue.</p> : <>
      {notice ? <p role={stale ? 'alert' : 'status'} className="px-2 py-1 text-xs">{notice}</p> : null}
      <MarkdownEditorPane value={draft} onChange={setDraft} readOnly={props.readOnly} language={props.format}
        uri={`${props.uri}#program-${props.format}`} editorRef={editorRef} panelTypography={panelTypography}
        wordWrap={props.wordWrap} themeMode={props.themeMode} ariaLabel={`${props.format.toUpperCase()} program text`}
        paneAriaLabel={`${props.format.toUpperCase()} Editor Surface`} />
    </>}
  </section>
}
