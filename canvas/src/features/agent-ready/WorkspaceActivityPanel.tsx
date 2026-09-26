import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { selectAgentRunInspection, useAgentRunInspection } from './agentRunInspectionStore'
import { durationLabel } from './agentRunSpanMetric'

/** Read-only views of retained records. No parallel event store or invented tool receipts. */
export default function WorkspaceActivityPanel() {
  const logs = useGraphStore(state => state.uiLogEntries)
  const inspection = useAgentRunInspection()
  const [filter, setFilter] = React.useState('')
  const [source, setSource] = React.useState<'workspace' | 'mission'>('workspace')
  const query = filter.trim().toLowerCase()
  const rows = logs.filter(row => `${row.message} ${row.source || ''} ${row.kind}`.toLowerCase().includes(query))
  const spans = inspection?.trace.spans.filter(span => `${span.operation} ${span.kind} ${span.status}`.toLowerCase().includes(query)) ?? []
  return <section className="grid min-w-0 gap-2 p-2 text-xs" aria-label="Activity">
    <header className="flex flex-wrap items-center gap-2">
      <h2 className="font-semibold">Activity</h2>
      <label>Source <select className="min-h-11 rounded border bg-transparent px-2" value={source}
        onChange={event => setSource(event.currentTarget.value as typeof source)} aria-label="Activity source">
        <option value="workspace">Workspace events</option><option value="mission">Mission spans</option>
      </select></label>
      <label className="flex min-w-0 flex-1 items-center gap-2">Find<input type="search" aria-label="Find activity" maxLength={160}
        className="min-h-11 min-w-0 flex-1 rounded border bg-transparent px-2" value={filter} onChange={event => setFilter(event.currentTarget.value)} /></label>
    </header>
    {source === 'workspace' ? <>
      <p className="opacity-70">{logs.length} retained workspace events · newest first · current session</p>
      <ul className="m-0 grid list-none gap-1 p-0" aria-label="Workspace events">{rows.map(row => <li key={row.id} className="rounded border p-2">
        <div className="flex flex-wrap gap-2 opacity-70"><time dateTime={new Date(row.tsMs).toISOString()}>{new Date(row.tsMs).toLocaleTimeString()}</time>
          <span>{row.source || 'Workspace'}</span><span>{row.kind}</span></div><p className="whitespace-pre-wrap break-words">{row.message}</p>
      </li>)}</ul>{!rows.length && <p role="status">No matching workspace events.</p>}
    </> : inspection ? <>
      <p>{inspection.trace.runId} · {inspection.trace.status} · {inspection.trace.spans.length}/{inspection.trace.total} retained spans{inspection.trace.partial ? ' · partial coverage' : ''}</p>
      <ul className="m-0 grid list-none gap-1 p-0" aria-label="Mission activity">{spans.map(span => <li key={span.spanId} className="rounded border p-2">
        <button type="button" className="min-h-11 text-left" aria-pressed={inspection.spanId === span.spanId}
          onClick={() => selectAgentRunInspection(span.spanId)}>{span.operation} · {span.status} · {durationLabel(span.timing.inclusive)}</button>
        <details><summary className="min-h-11 cursor-pointer py-3">Recorded evidence</summary>
          <dl className="grid gap-1 break-words"><dt>Span</dt><dd>{span.spanId}</dd><dt>Component</dt><dd>{span.component.id || 'Unreported'}</dd>
            <dt>Evaluation</dt><dd>{span.evaluation.status}{span.evaluation.reason ? ` · ${span.evaluation.reason}` : ''}</dd></dl>
          <p>Input and output payloads are not included in this observation.</p>
        </details>
      </li>)}</ul>{!spans.length && <p role="status">No matching Mission spans.</p>}
    </> : <p role="status">No Mission observation is selected. Open Agents in Media to inspect an authorized run.</p>}
  </section>
}

/** Observe the existing runtime markers; this panel never installs tools or changes discovery. */
export function WorkspaceBrowserTools() {
  const [status, setStatus] = React.useState({ context: '', scope: '', names: [] as string[] })
  React.useEffect(() => {
    const root = document.documentElement
    const read = () => setStatus({ context: root.dataset.kgWebmcpContext || 'unavailable',
      scope: root.dataset.kgWebmcpScope || '', names: (root.dataset.kgWebmcpTools || '').split(',').filter(Boolean) })
    read()
    const observer = new window.MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['data-kg-webmcp-context', 'data-kg-webmcp-scope', 'data-kg-webmcp-tools'] })
    return () => observer.disconnect()
  }, [])
  return <details className="m-2 rounded border p-2 text-xs" aria-label="Browser tool discovery">
    <summary className="min-h-11 cursor-pointer py-3">Browser tools · {status.context || 'checking'} · {status.names.length} exposed</summary>
    <p>Scope: {status.scope || 'unavailable'}. Discovery does not grant execution authority.</p>
    <ul className="list-none break-all p-0">{status.names.map(name => <li key={name}>{name}</li>)}</ul>
  </details>
}
