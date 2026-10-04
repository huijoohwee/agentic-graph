import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

const box = `min-w-0 rounded border p-2 ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`
const describe = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value)
export function JsonDetails({ title, value }: { title: string; value: unknown }) {
  const [open, setOpen] = React.useState(false)
  const serialized = React.useMemo(() => open ? JSON.stringify(value, null, 2) : '', [open, value])
  return <details className={box} onToggle={event => setOpen(event.currentTarget.open)}><summary className="min-h-[44px] cursor-pointer text-xs font-medium">{title}</summary>{open && <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{serialized}</pre>}</details>
}
export function VolumeResult({ value }: { value: any }) {
  if (!value?.screen) return null
  return <section className="grid min-w-0 gap-2" aria-label="Structured volume result">
    <dl className="grid grid-cols-2 gap-2 text-xs">
      {Object.entries({ Floor: `${value.floorMetres} m`, Ceiling: `${value.ceilingMetres} m`, Datum: value.datum,
        'Query UTC': value.atUtc, 'Valid from': value.validFromUtc, 'Valid to': value.validToUtc,
        'Within interval': String(value.active) }).map(([key, text]) => <div className={box} key={key}><dt className="font-semibold">{key}</dt><dd className="m-0 break-all">{text}</dd></div>)}
    </dl>
    <svg role="img" aria-label="Schematic volume; exact source coordinates and bounds remain in the record." viewBox={`0 0 ${value.size.width} ${value.size.height}`} className="w-full min-w-0 rounded border" data-evidence-volume-svg="1">
      {value.screen.sides.map((face: number[][], index: number) => <polygon key={index} points={face.map(point => point.join(',')).join(' ')} fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeWidth="1" />)}
      {(['floor', 'ceiling'] as const).map(level => <g key={level} data-evidence-volume-level={level}>
        <polyline points={value.screen[level].map((point: number[]) => point.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
        {value.screen[level].map((point: number[], index: number) => <circle key={index} cx={point[0]} cy={point[1]} r="3" fill="currentColor" data-z-metres={value.world[level][index][2]} />)}
      </g>)}
    </svg>
  </section>
}
export function ReplayResult({ value }: { value: any }) {
  if (!value?.fields) return null
  return <section className="grid gap-2" aria-label="UTC replay result">
    <h4 className="text-xs font-semibold">{value.entity?.label} · {value.atUtc}</h4>
    {value.fields.map((field: any) => <div className={box} key={field.kind}>
      <strong className="text-xs">{field.label || field.kind}</strong>
      <p className="text-xs">{[field.missing && 'Missing', field.stale && 'Stale', field.conflict && 'Conflicting evidence'].filter(Boolean).join(' · ') || 'Observed'}</p>
      {field.facts.map((fact: any) => <p className="break-all text-xs" key={fact.id}>{fact.value === null ? `Unknown: ${fact.null_reason}` : describe(fact.value)} · {fact.unit} · {fact.datum} · {fact.source_id} · {fact.observed_at}</p>)}
    </div>)}
    {(value.gaps || []).map((gap: any, i: number) => <p className={box + ' text-xs'} key={i}>Gap · {gap.kind} · {gap.fromUtc} → {gap.toUtc} · {gap.durationSeconds} seconds · {gap.sourceId}</p>)}
  </section>
}
export function RecordResult({ record, onSource, disabled }: { record: any; onSource: (id: string) => void; disabled: boolean }) {
  const [page, setPage] = React.useState(0)
  React.useEffect(() => setPage(0), [record?.identity?.originalSha256])
  if (!record) return null
  const total = Math.max(1, Math.ceil(record.facts.length / 50))
  return <section className="grid min-w-0 gap-2" aria-label="Accepted evidence record">
    <h4 className="text-xs font-semibold">{record.dataset.title} · {record.dataset.classification}</h4>
    <p className="text-xs">{record.stats.entityCount} entities · {record.stats.factCount} facts · {record.stats.sourceCount} sources</p>
    <div className="max-w-full overflow-auto" role="region" aria-label="Original fact table" tabIndex={0}>
      <table className="w-full text-left text-xs"><caption className="text-left">Original facts, units, datums and source references</caption><thead><tr>{['Fact', 'Observed UTC', 'Value', 'Unit / datum', 'Source'].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
        <tbody>{record.facts.slice(page * 50, page * 50 + 50).map((fact: any) => <tr key={fact.id}>
          <td className="p-2">{fact.entity_id}<br />{fact.kind}</td><td className="p-2">{fact.observed_at}</td>
          <td className="p-2">{fact.value === null ? `Unknown: ${fact.null_reason}` : describe(fact.value)}</td><td className="p-2">{fact.unit}<br />{fact.datum}</td>
          <td className="p-2"><button type="button" className="App-toolbar__btn min-h-[44px]" disabled={disabled} onClick={() => onSource(fact.id)} aria-label={`Inspect original source for ${fact.id}`}>{fact.source_id}</button><br />{fact.evidence_ref}</td>
        </tr>)}</tbody></table>
    </div>
    <div className="flex flex-wrap items-center gap-2 text-xs"><button type="button" className="App-toolbar__btn min-h-[44px]" disabled={!page} onClick={() => setPage(page - 1)}>Previous facts</button><span>Page {page + 1} / {total}</span><button type="button" className="App-toolbar__btn min-h-[44px]" disabled={page + 1 >= total} onClick={() => setPage(page + 1)}>Next facts</button></div>
    <JsonDetails title="Complete inspection record" value={record} />
  </section>
}
export function AnalysisSummary({ kind, value }: { kind: string; value: any }) {
  if (!value) return null
  const fields = kind === 'arrival' ? { 'Model status': value.model?.status, Counts: value.counts, Metrics: value.metrics, Advisory: value.advisory, Acceptance: value.acceptance, Exclusions: value.exclusions }
    : kind === 'route' ? { Disposition: value.disposition, 'Measured metres': value.measured?.lengthMetres, 'Reference metres': value.reference?.lengthMetres, 'Difference metres': value.differenceMetres, 'Conditional error band': value.errorBand, Reasons: value.reasons, Limitations: value.limitations }
      : { Disposition: value.disposition, Notice: value.notice, Normalized: value.normalized, Reasons: value.reasons }
  return <section className="grid gap-2" aria-label="Analysis summary">{Object.entries(fields).map(([label, field]) => <div className={box} key={label}><h4 className="text-xs font-semibold">{label}</h4><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(field, null, 2) ?? 'Unavailable'}</pre></div>)}</section>
}
