import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import Tooltip from '@/features/panels/ui/Tooltip'
import { GraphRagCentralityToggleGroup } from '@/features/graphrag/ui/GraphRagCentralityToggleGroup'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_COPY } from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { isRecord } from '@/lib/graph/jsonld/utils'
import type { JSONValue } from '@/lib/graph/types'
import { runGraphRagTextPipeline } from '@/lib/graph/graphragTextPipeline'
import { useGraphRagTextCentralityConfig } from '@/features/graphrag/hooks/useGraphRagTextCentralityConfig'

type StageView = {
  id: string
  name: string
  code: string
  input: string
  output: JSONValue
  library?: { name?: string; url?: string; license?: string }
  metrics?: { latency_ms?: number; status?: string }
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')
const tokenChipClassName = `px-2 py-0.5 rounded ${UI_THEME_TOKENS.button.neutralSubtle} border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.text.primary} text-xs`
const analyticsButtonClassName = `px-2 py-0.5 rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.text.primary} ${UI_THEME_TOKENS.button.hoverBg}`
const stagePanelClassName = `rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-3`
const codePanelClassName = `rounded border ${UI_THEME_TOKENS.code.border} ${UI_THEME_TOKENS.code.bg} p-2`
export const GRAPH_RAG_TEXT_PIPELINE_STAGE_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2'

const getStagesFromGraphMeta = (graphData: unknown): StageView[] => {
  if (!graphData || typeof graphData !== 'object' || Array.isArray(graphData)) return []
  const meta = (graphData as Record<string, unknown>).metadata
  if (!isRecord(meta)) return []
  const pipeline = meta.graphragTextPipeline
  if (!isRecord(pipeline)) return []
  const stagesRaw = pipeline.stages
  if (!Array.isArray(stagesRaw)) return []
  const out: StageView[] = []
  for (const entry of stagesRaw) {
    if (!isRecord(entry)) continue
    const id = typeof entry.id === 'string' ? entry.id : ''
    const name = typeof entry.name === 'string' ? entry.name : ''
    const code = typeof entry.code === 'string' ? entry.code : ''
    const input = typeof entry.input === 'string' ? entry.input : ''
    const output = (entry.output ?? null) as JSONValue
    const library = isRecord(entry.library) ? entry.library : undefined
    const metrics = isRecord(entry.metrics) ? entry.metrics : undefined
    if (!id || !name) continue
    out.push({ id, name, code, input, output, library, metrics })
  }
  return out
}

export default function GraphRagTextPipelineSection() {
  const graphData = useGraphStore(s => s.graphData)
  const markdownDocumentText = useGraphStore(s => s.markdownDocumentText)
  const jsonSourceDocumentText = useGraphStore(s => s.jsonSourceDocumentText)
  const [collapsed, setCollapsed] = React.useState(true)
  const [step, setStep] = React.useState(0)
  const uiPanelKeyValueTextSizeClass = useGraphStore(s => s.uiPanelKeyValueTextSizeClass || 'text-sm')
  const uiPanelTextFontClass = useGraphStore(s => s.uiPanelTextFontClass || 'font-sans')
  const { cfg, update, reset } = useGraphRagTextCentralityConfig()

  const stages = React.useMemo(() => getStagesFromGraphMeta(graphData), [graphData])
  const isGraphRag = graphData?.context === 'graphrag-text'

  React.useEffect(() => {
    if (step < 0) setStep(0)
    if (step >= stages.length) setStep(0)
  }, [step, stages.length])

  if (!stages.length) return null

  const sourceText = (() => {
    const a = typeof markdownDocumentText === 'string' ? markdownDocumentText : ''
    const b = typeof jsonSourceDocumentText === 'string' ? jsonSourceDocumentText : ''
    return a.trim() ? a : b
  })()
  const canRecompute = isGraphRag && sourceText.trim().length > 0

  const current = stages[Math.min(Math.max(step, 0), stages.length - 1)]!

  const renderOutput = (output: JSONValue) => {
    const rec = isRecord(output) ? output : null
    if (!rec) {
      return (
        <pre className={`text-xs font-mono ${UI_THEME_TOKENS.text.primary} whitespace-pre-wrap break-words`}>
          {JSON.stringify(output, null, 2)}
        </pre>
      )
    }
    if (isStringArray(rec.tokens) || isStringArray(rec.lemmas) || isStringArray(rec.subwords)) {
      const list = isStringArray(rec.tokens)
        ? rec.tokens
        : isStringArray(rec.lemmas)
          ? rec.lemmas
          : isStringArray(rec.subwords)
            ? rec.subwords
            : []
      return (
        <section className="flex flex-wrap gap-1">
          {list.slice(0, 64).map((t, i) => (
            <span
              key={`${t}-${i}`}
              className={`${tokenChipClassName} font-mono`}
            >
              {t}
            </span>
          ))}
        </section>
      )
    }
    if (Array.isArray(rec.entities)) {
      const entities = rec.entities.filter(isRecord).slice(0, 32) as Array<Record<string, unknown>>
      return (
        <section className="space-y-1">
          {entities.map((e, i) => (
            <section key={i} className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-xs">
                {String((e as { text?: unknown }).text ?? '')}
              </span>
              <span className={`text-xs font-mono ${UI_THEME_TOKENS.text.tertiary}`}>
                {String((e as { label?: unknown }).label ?? '')}
              </span>
            </section>
          ))}
        </section>
      )
    }
    if (Array.isArray(rec.triples) && rec.triples.every(x => typeof x === 'string')) {
      const triples = rec.triples as string[]
      return (
        <section className="space-y-1">
          {triples.slice(0, 24).map((t, i) => (
            <section
              key={i}
              className={`text-xs font-mono ${UI_THEME_TOKENS.code.text} ${UI_THEME_TOKENS.code.bg} border ${UI_THEME_TOKENS.code.border} rounded px-2 py-1`}
            >
              {t}
            </section>
          ))}
        </section>
      )
    }
    if (isStringArray(rec.nodes)) {
      return (
        <section className="space-y-2">
          <section className={`text-xs ${UI_THEME_TOKENS.text.secondary}`}>
            Nodes: {rec.nodes.length} · Edges: {String(rec.edges ?? '')} · Communities: {String(rec.communities ?? '')}
          </section>
          <section className="flex flex-wrap gap-1">
            {rec.nodes.slice(0, 48).map((n, i) => (
              <span key={`${n}-${i}`} className={tokenChipClassName}>
                {n}
              </span>
            ))}
          </section>
        </section>
      )
    }
    return (
      <pre className={`text-xs font-mono ${UI_THEME_TOKENS.text.primary} whitespace-pre-wrap break-words`}>
        {JSON.stringify(output, null, 2)}
      </pre>
    )
  }

  const header = (
    <section className="flex items-center gap-2">
      <span className={`text-xs font-semibold ${UI_THEME_TOKENS.text.tertiary}`}>
        {UI_COPY.graphragTextPipelineBadge}
      </span>
      <Tooltip content={UI_COPY.graphragTextPipelineTooltip} maxWidthPx={320}>
        <span className={`text-xs font-semibold ${UI_THEME_TOKENS.text.primary}`}>
          {UI_COPY.graphragTextPipelineTitle}
        </span>
      </Tooltip>
    </section>
  )

  const lib = current.library || {}
  const hasLibLink = typeof lib.url === 'string' && lib.url.length > 0

  return (
    <CollapsibleSection title={header} collapsed={collapsed} onToggle={setCollapsed}>
      <section className={['mt-2 space-y-2', uiPanelKeyValueTextSizeClass, uiPanelTextFontClass].join(' ')}>
        <section className="flex flex-wrap gap-1">
          {stages.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(i)}
              className={[
                'px-2 py-1 rounded border text-xs transition-colors',
                step === i
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : `${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.text.secondary} ${UI_THEME_TOKENS.button.hoverBg}`,
              ].join(' ')}
            >
              {i + 1}. {s.name}
            </button>
          ))}
        </section>

        {isGraphRag && (
          <GraphRagCentralityToggleGroup
            title="Context-Aware Analytics"
            cfg={cfg}
            onChange={update}
            className="text-xs"
            actions={(
              <>
                <button
                  type="button"
                  className={analyticsButtonClassName}
                  onClick={reset}
                >
                  Reset
                </button>
                <button
                  type="button"
                  disabled={!canRecompute}
                  className={[
                    `px-2 py-0.5 rounded border ${UI_THEME_TOKENS.input.border}`,
                    canRecompute ? `${UI_THEME_TOKENS.text.primary} ${UI_THEME_TOKENS.button.hoverBg}` : UI_THEME_TOKENS.text.tertiary,
                  ].join(' ')}
                  onClick={() => {
                    if (!canRecompute) return
                    const res = runGraphRagTextPipeline(sourceText, { centrality: cfg })
                    useGraphStore.getState().setGraphData(res.graphData)
                  }}
                >
                  Recompute
                </button>
              </>
            )}
          />
        )}

        <section className={GRAPH_RAG_TEXT_PIPELINE_STAGE_GRID_CLASS_NAME}>
          <section className={`${stagePanelClassName} space-y-2`}>
            <section className={`text-xs ${UI_THEME_TOKENS.text.secondary}`}>
              <span className={`font-semibold ${UI_THEME_TOKENS.text.primary}`}>{current.name}</span>
              {current.metrics && typeof current.metrics.latency_ms === 'number' && (
                <span className={`ml-2 text-xs font-mono ${UI_THEME_TOKENS.text.tertiary}`}>
                  {Math.round(current.metrics.latency_ms)}ms
                </span>
              )}
            </section>
            <section className={codePanelClassName}>
              <pre className={`text-xs font-mono whitespace-pre-wrap break-words ${UI_THEME_TOKENS.code.text}`}>
                {current.code}
              </pre>
            </section>
            <section className={`text-xs ${UI_THEME_TOKENS.text.secondary}`}>
              <section className={`font-semibold ${UI_THEME_TOKENS.text.primary}`}>Input</section>
              <section className={`mt-1 ${UI_THEME_TOKENS.text.primary} whitespace-pre-wrap break-words`}>
                {current.input}
              </section>
            </section>
            <section className={`text-xs ${UI_THEME_TOKENS.text.secondary}`}>
              <section className={`font-semibold ${UI_THEME_TOKENS.text.primary}`}>Library</section>
              <section className="mt-1 flex flex-wrap items-center gap-2">
                <span className={tokenChipClassName}>
                  {String(lib.name || '')}
                </span>
                {hasLibLink && (
                  <a href={String(lib.url)} className="text-blue-700 hover:text-blue-600" target="_blank" rel="noreferrer">
                    {UI_COPY.graphragTextPipelineLibraryLinkLabel}
                  </a>
                )}
                {lib.license && (
                  <span className={`text-xs font-mono ${UI_THEME_TOKENS.text.tertiary}`}>
                    {String(lib.license)}
                  </span>
                )}
              </section>
            </section>
          </section>
          <section className={stagePanelClassName}>
            <section className={`text-xs font-semibold ${UI_THEME_TOKENS.text.primary} mb-2`}>Output</section>
            {renderOutput(current.output)}
          </section>
        </section>
      </section>
    </CollapsibleSection>
  )
}
