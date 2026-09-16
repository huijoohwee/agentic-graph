import type { TraceSpan, visibleSpanTree } from './missionControlProjection'
import { numberLabel, record } from './missionControlProjection'

const tones: Record<string, { icon: string; fill: string; stroke: string }> = {
  agent: { icon: 'A', fill: '#e0e7ff', stroke: '#4f46e5' },
  model: { icon: '◇', fill: '#ffedd5', stroke: '#c2410c' },
  tool: { icon: '↗', fill: '#fef9c3', stroke: '#a16207' },
  retrieval: { icon: '≡', fill: '#ccfbf1', stroke: '#0f766e' },
  check: { icon: '✓', fill: '#e0f2fe', stroke: '#0369a1' },
}
export const spanTone = (kind: string) => tones[kind] ?? tones.agent!
export const durationLabel = (ms: number | null) => ms === null ? 'Unknown duration' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`
export function AgentRunSpanViews({ rows, timing, selectedId, onSelect }: {
  rows: ReturnType<typeof visibleSpanTree>; timing: boolean; selectedId: string | null; onSelect: (id: string) => void
}) {
  const end = Math.max(1, ...rows.map(({ span }) => (span.timing.offset ?? 0) + (span.timing.inclusive ?? 0)))
  const usage = (span: TraceSpan) => {
    const cost = record(span.cost)
    return cost.status === 'reported' && typeof cost.prompt_tokens === 'number' && typeof cost.completion_tokens === 'number'
      ? `${cost.prompt_tokens + cost.completion_tokens} tokens` : 'usage unknown'
  }
  return <ul aria-label={timing ? 'Span timing' : 'Span hierarchy'} className="min-w-0 py-2">
    {rows.map(({ span, depth, missingParent }) => {
      const tone = spanTone(span.kind), selected = selectedId === span.spanId
      return <li key={span.spanId} className="min-w-0">
        <button type="button" aria-pressed={selected} onClick={() => onSelect(span.spanId)}
          className="flex w-full min-w-0 items-center gap-3 border-l-4 px-3 py-3 text-left"
          style={{ borderLeftColor: selected ? '#3b82f6' : 'transparent', background: selected ? 'var(--kg-hover-bg, #dbeafe)' : undefined }}>
          <span className="flex min-w-0 flex-1 items-center gap-3" style={{ paddingLeft: timing ? 0 : Math.min(depth, 8) * 20 }}>
            {!timing && depth > 0 && <span aria-hidden="true" className="self-stretch border-b border-l" style={{ width: 10, flexShrink: 0, borderColor: '#a8a29e', borderBottomLeftRadius: 8 }} />}
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-lg"
              style={{ background: tone.fill, color: tone.stroke, borderColor: tone.stroke }}>{tone.icon}</span>
            <span className="min-w-0"><span className="block truncate text-sm font-medium" title={span.operation}>{span.operation}</span>
              <span className="block text-xs opacity-75">{span.kind} · {span.status}{timing && ` · exclusive observed ${numberLabel(span.timing.exclusive, ' ms')}`}{span.attempt !== null && ` · attempt ${span.attempt}`}{!timing && ` · ${durationLabel(span.timing.inclusive)} · ${usage(span)}`}
                {span.evaluation.status !== 'unevaluated' && ` · evaluation ${span.evaluation.status}`}{missingParent && ' · parent outside this page'}</span>
            </span>
          </span>
          {timing && <span className="flex w-[45%] shrink-0 items-center gap-3">
            <span className="w-20 shrink-0 text-right text-xs tabular-nums">{durationLabel(span.timing.inclusive)}</span>
            <span className="min-w-0 flex-1" title={`Exclusive observed: ${numberLabel(span.timing.exclusive, ' ms')}`}>
              {span.timing.offset === null || span.timing.inclusive === null ? <span className="text-xs">Position unknown</span>
                : <span className="block h-2 rounded bg-gray-200"><span className="block h-2 rounded" style={{ background: tone.stroke,
                  marginLeft: `${span.timing.offset / end * 100}%`, width: `${Math.max(0.5, span.timing.inclusive / end * 100)}%` }} /></span>}
            </span>
          </span>}
        </button>
      </li>
    })}
  </ul>
}
