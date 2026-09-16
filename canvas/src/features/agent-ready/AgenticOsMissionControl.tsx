import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { openAgentRunInspection, closeAgentRunInspection, useAgentRunInspection, updateAgentRunInspection, selectAgentRunInspection, filterAgentRunInspection, selectAgentRunView } from './agentRunInspectionStore'
import { AGENT_RUN_CANVAS_VIEWS } from '@/lib/canvas/canvasViewInvocationContract.mjs'
import type { ObservationListener } from './durableRunStream'
import type { RunOperation } from 'agentic-os/agents/invocation'
import TabHeader from '@/features/panels/ui/TabHeader'
import { GraphDataTableDomTableView } from '@/features/graph-data-table/ui/GraphDataTableDomTableView'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { invokeDurableRun, clearDurableRunSession } from './durableRunTransport'
import { readRunIndex, readRunTrace, runRows, RUN_COLUMNS, spanRows, SPAN_COLUMNS, visibleSpanTree, traceGraph, spanNodeId,
  spanLabel, numberLabel, known, record, sourceLink, comparable, type RunIndex, type RunTrace } from './missionControlProjection'

const FlowCanvas = React.lazy(() => import('@/components/FlowCanvas'))
const views = Object.entries<string>(AGENT_RUN_CANVAS_VIEWS).map(([key, label]) => ({ key, label }))
const button = `rounded border px-3 py-2 text-sm disabled:opacity-50 ${UI_THEME_TOKENS.button.neutralMuted}`
const inputStyle = { minWidth: 0, maxWidth: '100%', border: '1px solid var(--kg-border)', borderRadius: 6, padding: 8,
  background: 'var(--kg-panel-bg)', color: 'var(--kg-text-primary)' } as const
type Selection = { runId: string | null; spanId: string | null }
const emptySelection: Selection = { runId: null, spanId: null }

export default function AgenticOsMissionControl({ onOpenWorkspace, workspace = false }: { onOpenWorkspace?: () => void; workspace?: boolean }) {
  const inspection = useAgentRunInspection(), initial = workspace ? inspection : null
  const scopeExpiry = React.useRef(initial?.expiresAt ?? 0)
  const [index, setIndex] = React.useState<RunIndex | null>(null), [trace, setTrace] = React.useState<RunTrace | null>(initial?.trace ?? null)
  const [selection, setSelection] = React.useState<Selection>(initial ? { runId: initial.trace.runId, spanId: initial.spanId } : emptySelection), selected = React.useRef(selection)
  selected.current = selection
  const scope = React.useRef<string | null>(initial?.scope ?? null), active = React.useRef<AbortController | null>(null)
  const mutating = React.useRef(false)
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState('')
  const [localView, setLocalView] = React.useState('tree'), [localSearch, setLocalSearch] = React.useState(''), [live, setLive] = React.useState(false)
  const view = workspace ? inspection?.view ?? 'topology' : localView, setView = workspace ? selectAgentRunView : setLocalView
  const search = workspace ? inspection?.search ?? '' : localSearch, setSearch = workspace ? filterAgentRunInspection : setLocalSearch
  const [online, setOnline] = React.useState(navigator.onLine), [visible, setVisible] = React.useState(!document.hidden)
  const [backoff, setBackoff] = React.useState(5000), [expiry, setExpiry] = React.useState(initial?.expiresAt ?? 0)
  const [query, setQuery] = React.useState<Record<string, unknown>>({ limit: 32 })
  const [baseline, setBaseline] = React.useState<RunTrace | null>(null), [comparison, setComparison] = React.useState<unknown>(null)
  const stop = React.useCallback(() => {
    if (mutating.current && active.current) setNotice('Evaluation may have been accepted. Refresh its evidence before another action.')
    active.current?.abort(); active.current = null; setBusy(false)
  }, [])
  const clear = React.useCallback(() => {
    closeAgentRunInspection(); scope.current = null; selected.current = emptySelection
    setIndex(null); setTrace(null); setSelection(emptySelection); setBaseline(null); setComparison(null); setExpiry(0)
  }, [])
  const perform = React.useCallback(async (operation: (signal: AbortSignal) => Promise<void>, mutation = false) => {
    if (active.current || !navigator.onLine || document.hidden) return
    const controller = new AbortController(); active.current = controller; mutating.current = mutation; setBusy(true); setError('')
    try {
      await operation(controller.signal)
      if (!controller.signal.aborted) setBackoff(5000)
    } catch (failure) {
      if (controller.signal.aborted) return
      const cause = failure as Error & { denied?: boolean; uncertain?: boolean; observationInvalid?: boolean }
      if (cause.denied || cause.observationInvalid) { clear(); clearDurableRunSession() }
      setError(cause.message || 'Runtime unavailable.'); setBackoff(delay => Math.min(60000, delay * 2))
      if (mutation || cause.uncertain) setNotice('Refresh to inspect the evaluation outcome. An uncertain request is never retried automatically.')
    } finally {
      if (active.current === controller) { active.current = null; mutating.current = false; setBusy(false) }
    }
  }, [clear])
  const call = async (operation: RunOperation, input: Record<string, unknown>, signal: AbortSignal, observe?: ObservationListener) => {
    const result = await invokeDurableRun(operation, input, signal, value => { signal.throwIfAborted(); observe?.(value) }); signal.throwIfAborted()
    const value = record(result)
    if (value.status === 'blocked' || value.httpStatus === 401 || value.httpStatus === 403 || value.writeResultUnknown)
      throw Object.assign(Error(String(value.reasonCode || value.code || 'Runtime unavailable.')), {
        denied: value.httpStatus === 401 || value.httpStatus === 403 || ['principal_expired', 'run_forbidden', 'toolkit_denied'].includes(String(value.reasonCode)),
        uncertain: value.writeResultUnknown === true,
      })
    return result
  }
  const loadTrace = async (runId: string, signal: AbortSignal, cursor?: string) => {
    let streamed = false
    const accept = (value: unknown) => {
      const result = readRunTrace(value, runId)
      if (selected.current.runId !== runId) return
      streamed = true; setTrace(result)
      const expiresAt = Math.min(scopeExpiry.current, result.observedAt + 60000, result.expiresAt)
      setExpiry(expiresAt)
      if (workspace && scope.current) updateAgentRunInspection({ trace: result, scope: scope.current,
        expiresAt, spanId: selected.current.spanId })
    }
    const result = await call('trace', { runId, limit: 32, ...(cursor ? { cursor } : {}) }, signal, accept)
    if (!streamed) accept(result)
  }
  const refresh = React.useCallback((cursor?: string) => perform(async signal => {
    const result = readRunIndex(await call('query', { ...query, ...(cursor ? { cursor } : {}) }, signal))
    const changed = scope.current !== null && scope.current !== result.access.scope
    if (changed) { clear(); setNotice('The authenticated scope changed. Select a run from the new snapshot.') }
    scope.current = result.access.scope; setIndex(result)
    scopeExpiry.current = Math.min(result.observedAt + 60000, result.access.expiresAt); setExpiry(scopeExpiry.current)
    const id = selected.current.runId
    if (!changed && id && result.items.some(r => r.runId === id)) await loadTrace(id, signal)
    else { if (workspace) closeAgentRunInspection(); selected.current = emptySelection; setSelection(emptySelection); setTrace(null) }
  }), [query, perform, clear])
  React.useEffect(() => { if (!workspace) { stop(); clear(); void refresh() } }, [query, workspace]) // Workspace opens the authorized handoff without fetching.
  React.useEffect(() => {
    const change = () => {
      setOnline(navigator.onLine); setVisible(!document.hidden)
      if (!navigator.onLine || document.hidden) stop()
    }
    const authority = () => { stop(); clear(); clearDurableRunSession(); setNotice('Authority changed. Refresh to obtain a new snapshot.') }
    window.addEventListener('online', change); window.addEventListener('offline', change)
    document.addEventListener('visibilitychange', change); window.addEventListener('agentic-os:authority-change', authority)
    return () => {
      active.current?.abort(); active.current = null; scope.current = null; clearDurableRunSession()
      window.removeEventListener('online', change); window.removeEventListener('offline', change)
      document.removeEventListener('visibilitychange', change); window.removeEventListener('agentic-os:authority-change', authority)
    }
  }, [stop, clear])
  React.useEffect(() => {
    if (!live || !online || !visible || busy) return
    const timer = window.setTimeout(() => { void refresh() }, backoff)
    return () => window.clearTimeout(timer)
  }, [live, online, visible, busy, backoff, refresh])
  React.useEffect(() => {
    if (!expiry) return
    const timer = window.setTimeout(() => { stop(); clear(); setNotice('Snapshot expired. Refresh to reauthorize inspection.') }, Math.max(0, expiry - Date.now()))
    return () => window.clearTimeout(timer)
  }, [expiry, stop, clear])
  const chooseRun = (runId: string) => {
    if (busy || !navigator.onLine || !index?.items.some(r => r.runId === runId)) return
    selected.current = { runId, spanId: null }; setSelection(selected.current); setTrace(null); setComparison(null)
    void perform(signal => loadTrace(runId, signal))
  }
  const chooseSpan = (spanId: string | null) => {
    if (workspace) selectAgentRunInspection(spanId)
    setSelection(current => ({ ...current, spanId }))
  }
  React.useEffect(() => {
    if (workspace && inspection?.trace.runId === selected.current.runId)
      setSelection(current => current.spanId === inspection.spanId ? current : { ...current, spanId: inspection.spanId })
  }, [workspace, inspection?.spanId, inspection?.trace.runId])
  const spans = React.useMemo(() => visibleSpanTree(trace?.spans ?? [], search), [trace, search])
  const topology = React.useMemo(() => trace ? traceGraph(trace, search) : null, [trace, search])
  const span = trace?.spans.find(s => s.spanId === selection.spanId) ?? null
  const subjectDigest = selection.spanId ? span?.subjectDigest : trace?.subjectDigest
  const evaluated = selection.spanId ? span?.evaluation : trace?.evaluation
  const mayWrite = online && visible && !busy && expiry > Date.now()
  const evaluate = () => {
    if (!trace || !subjectDigest || !mayWrite || selection.spanId && !span) return
    const request = { runId: trace.runId, ...(span ? { spanId: span.spanId } : {}), subjectDigest,
      operationId: crypto.randomUUID(), evidence: { id: `subject-${subjectDigest}`, digest: subjectDigest } }
    void perform(async signal => {
      const result = record(await call('evaluate', request, signal))
      if (result.writeResultUnknown || result.status === 'blocked') throw Error(String(result.reasonCode || 'Evaluation unavailable.'))
      setNotice('Evaluation observed. Scores do not authorize a release or payment.')
      await loadTrace(trace.runId, signal)
    }, true)
  }
  const compare = () => {
    if (!trace || !baseline || !comparable(baseline, trace)) return
    void perform(async signal => setComparison(await call('compare', {
      cohortId: trace.cohortId, baseline: baseline.candidate, candidate: trace.candidate,
    }, signal)))
  }
  const exportMetadata = () => {
    if (!trace || expiry <= Date.now()) return
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...trace, exportedAt: Date.now(), authority: false }, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'agent-run-metadata.json'; anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  const openWorkspace = () => {
    if (!trace || !scope.current || expiry <= Date.now()) return
    try {
      const current = useGraphStore.getState(), previousView = { mode: current.workspaceViewMode, paneOpen: current.workspaceCanvasPaneOpen }
      openAgentRunInspection({ trace, scope: scope.current, expiresAt: expiry, spanId: selection.spanId, search },
        () => useGraphStore.getState().setWorkspaceViewState(previousView))
      useGraphStore.getState().setWorkspaceViewState({ mode: 'editor', paneOpen: !window.matchMedia('(max-width: 768px), (pointer: coarse)').matches })
      onOpenWorkspace?.()
    } catch (failure) { setError((failure as Error).message) }
  }
  const maxTiming = Math.max(1, ...spans.map(({ span: s }) => (s.timing.offset ?? 0) + (s.timing.inclusive ?? 0)))
  const context = trace?.context, planUrl = sourceLink(context ?? null), resources = trace?.resources
  return <section aria-label={workspace ? "Agent run Canvas evidence" : "Agentic OS mission control"} className="h-full min-h-0 min-w-0 overflow-auto p-3" style={{ overflowWrap: 'anywhere' }}>
    <header className="flex flex-wrap items-center justify-between gap-2 pb-3">
      {!workspace && <div><h2 className="font-semibold">Agentic OS</h2><p className="text-xs">Inspect execution, limits and evidence</p></div>}
      <button type="button" className={button} disabled={busy || !online} onClick={() => { void refresh() }}>Refresh runs</button>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} />Live · ≥5 s</label>
    </header>
    <p role="status" className="pb-2 text-xs">{!online ? 'Offline · cached inspection only' : !visible ? 'Paused while hidden' : busy ? 'Reading runtime…' : live ? `Live · next refresh after ${backoff / 1000} s` : 'Manual refresh'}
      {index ? ` · observed ${new Date(index.observedAt).toLocaleTimeString()} · snapshot expires ${new Date(expiry).toLocaleTimeString()}` : ''}</p>
    {error && <p role="alert" className="rounded border p-2">{error}</p>}
    {notice && <p className="py-2 text-xs">{notice}</p>}
    {!workspace && <form aria-label="Run filters" className="flex flex-wrap items-end gap-2 py-2" onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget), next: Record<string, unknown> = { limit: 32 }
      for (const key of ['projectId', 'agentId', 'status']) { const value = String(data.get(key) ?? '').trim(); if (value) next[key] = value }
      if (data.get('window') === '15') { next.to = Date.now(); next.from = Number(next.to) - 900000 }
      setQuery(next)
    }}>
      <label className="grid min-w-0 flex-1 text-xs">Project<input name="projectId" maxLength={128} style={inputStyle} /></label>
      <label className="grid min-w-0 flex-1 text-xs">Agent<input name="agentId" maxLength={128} style={inputStyle} /></label>
      <label className="grid text-xs">State<select name="status" style={inputStyle}>
        <option value="">All</option>{['running', 'completed', 'failed', 'canceled'].map(s => <option key={s}>{s}</option>)}
      </select></label>
      <label className="grid text-xs">Window<select name="window" style={inputStyle}><option value="retained">Retention window</option><option value="15">Last 15 minutes</option></select></label>
      <button className={button} disabled={busy || !online}>Apply filters</button>
    </form>}
    {workspace && <label className="flex flex-wrap gap-2 py-2 text-xs">Run<select style={inputStyle} value={selection.runId ?? ""} disabled={busy || !index || !online} onChange={event => chooseRun(event.target.value)}>
      {!index && selection.runId && <option>{selection.runId}</option>}{index?.items.map(run => <option key={run.runId} value={run.runId}>{run.runId}</option>)}
    </select></label>}
    {index && !workspace && <>
      <div className="grid gap-2 py-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,14rem),1fr))' }}>
        {index.metrics.map(metric => <article key={metric.id} className="rounded border p-3">
          <h3 className="text-xs">{metric.label}</h3><p className="py-1 text-xl font-semibold">{metric.value}</p><p className="text-xs">{metric.detail}</p>
        </article>)}
      </div>
      <p className="text-xs">{index.items.length} rows · {index.total} retained matches · {index.partial ? 'Partial retention or trace coverage' : 'Retained snapshot; full historical population unknown'}</p>
      <div className="flex min-w-0 overflow-auto py-2" style={{ maxHeight: 260 }}>
        <GraphDataTableDomTableView tableId="nodes" columns={RUN_COLUMNS} rows={runRows(index)} selectedRowIds={selection.runId ? [selection.runId] : []}
          columnVisibilityById={{}} filterMatch="all" filterClauses={[]} groupBy="" sortRules={[]} rowHeightPreset="comfortable" columnWidthsPxById={{}}
          onRowClicked={chooseRun} onSelectionChanged={ids => { if (ids.length) chooseRun(ids.at(-1)!); else { setSelection(emptySelection); setTrace(null) } }} />
      </div>
      {!index.items.length && <p>No runs in this authorized snapshot.</p>}
      {index.offset > 0 && <button className={button} disabled={busy || !online} onClick={() => { void refresh() }}>First run page</button>}
      {index.nextCursor && <button className={button} disabled={busy || !online} onClick={() => { void refresh(index.nextCursor!) }}>Next run page</button>}
    </>}
    {trace && <section aria-label="Selected run evidence" className="min-w-0 border-t pt-3">
      <h3 className="font-semibold">Run {trace.runId}</h3>
      <p className="text-xs">Selected span: {selection.spanId || "Whole run"}</p>
      <p className="text-xs">Observed state: {trace.status} · {trace.spans.length}/{trace.total} retained spans on this page · expected {numberLabel(trace.expected)} · dropped {numberLabel(trace.dropped)}{trace.partial ? ' · Partial trace' : ''}</p>
      <p className="py-2 text-sm">{context ? `${context.taskId} → ${context.projectId} → ${context.goalId}` : 'Legacy run · no plan context recorded'}</p>
      {context && (!workspace || view === "source") && <details open={workspace || undefined}><summary>Source ownership</summary><p>{context.plan.continuityId}</p>
        {planUrl ? <a href={planUrl} target="_blank" rel="noreferrer" className="underline">{context.plan.path} @ {context.plan.revision}</a> : <p>{context.plan.repository} / {context.plan.path} @ {context.plan.revision}</p>}
        <p className="text-xs">Digest {context.plan.digest}</p><pre className="overflow-auto text-xs">{JSON.stringify(context.plan.revisions, null, 2)}</pre>
        <p className="text-xs">Receipt reference: {JSON.stringify(context.receipt)}</p>
      </details>}
      {(!workspace || view === "allocation") && (resources ? <div aria-label="Resource allocation" className="my-3 rounded border p-3">
        <h4 className="font-semibold">Project allocation · {String(resources.status)}</h4>
        <p className="text-xs">{String(record(resources.policy).windowId)} · zero incremental provider spend required · machine cost unknown</p>
        <div className="overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th>Resource</th><th>Limit</th><th>Used</th><th>Reserved</th><th>Remaining</th></tr></thead><tbody>
          {['inputTokens', 'outputTokens', 'attempts', 'elapsedMs'].map(unit => <tr key={unit}><th className="py-2">{unit}</th>
            {[record(record(resources.policy).project), record(resources.used), record(resources.reserved), record(resources.remaining)].map((values, i) => <td key={i}>{numberLabel(known(values[unit]))}</td>)}
          </tr>)}
        </tbody></table></div>
        <p className="text-xs">{resources.status === 'held' ? 'Usage is uncertain. The host must reconcile it before further execution.' : 'The host rechecks all project, agent and run limits before execution.'}</p>
      </div> : <p className="py-2 text-xs">Allocation unavailable for this observation.</p>)}
      <TabHeader tabs={views} activeTab={view} onTabChange={setView} tabIdBase="agent-run-view"
        searchVisible searchPlaceholder="Search span metadata" searchQuery={search} onSearchChange={setSearch} />
      <div id={`agent-run-view-${view}-panel`} role="tabpanel" aria-labelledby={`agent-run-view-${view}-tab`} className="min-w-0 py-2">
        {view === 'table' && <div className="overflow-auto"><GraphDataTableDomTableView tableId="nodes" columns={SPAN_COLUMNS} rows={spanRows(spans.map(row => row.span))}
          selectedRowIds={selection.spanId ? [selection.spanId] : []} columnVisibilityById={{}} filterMatch="all" filterClauses={[]} groupBy=""
          sortRules={[]} rowHeightPreset="comfortable" columnWidthsPxById={{}} onRowClicked={chooseSpan} onSelectionChanged={ids => chooseSpan(ids.at(-1) ?? null)} /></div>}
        {view === 'tree' && <ul aria-label="Span hierarchy">{spans.map(({ span: s, depth, missingParent }) => <li key={s.spanId} style={{ paddingLeft: Math.min(depth, 8) * 12 }}>
          <button type="button" aria-pressed={selection.spanId === s.spanId} className={`my-1 w-full rounded border p-2 text-left text-sm ${selection.spanId === s.spanId ? UI_THEME_TOKENS.button.activeSoft : ''}`} onClick={() => chooseSpan(s.spanId)}>
            {spanLabel(s)}<span className="block text-xs">{s.kind} · {s.status} · {numberLabel(s.timing.inclusive, ' ms')} · {record(s.cost).status === 'reported' ? `${Number(record(s.cost).prompt_tokens) + Number(record(s.cost).completion_tokens)} tokens` : 'usage unknown'} · evaluation {s.evaluation.status}{missingParent ? ' · parent outside this page' : ''}</span>
          </button></li>)}</ul>}
        {view === 'timing' && <ul aria-label="Span timing">{spans.map(({ span: s }) => <li key={s.spanId} className="border-b py-2">
          <button className="w-full text-left text-sm" type="button" aria-pressed={selection.spanId === s.spanId} onClick={() => chooseSpan(s.spanId)}>{spanLabel(s)}</button>
          <p className="text-xs">Inclusive {numberLabel(s.timing.inclusive, ' ms')} · exclusive observed {numberLabel(s.timing.exclusive, ' ms')}</p>
          {s.timing.offset === null || s.timing.inclusive === null ? <p className="text-xs">Position unknown · incomparable or unfinished clock</p>
            : <div className="my-1 h-2 rounded bg-gray-200"><div className="h-2 rounded bg-indigo-500" style={{ marginLeft: `${s.timing.offset / maxTiming * 100}%`, width: `${s.timing.inclusive / maxTiming * 100}%` }} /></div>}
        </li>)}</ul>}
        {view === 'topology' && topology && <React.Suspense fallback={<p>Loading topology…</p>}><FlowCanvas inspection={{ graph: topology,
          selectedNodeId: selection.spanId ? spanNodeId(trace.runId, selection.spanId) : null,
          onSelect: id => { const item = trace.spans.find(s => spanNodeId(trace.runId, s.spanId) === id); if (item) chooseSpan(item.spanId) } }} /></React.Suspense>}
        {view === 'evidence' && <><p>Candidate: {trace.candidate.id} @ {trace.candidate.revision}</p>
          <pre className="max-h-72 overflow-auto text-xs">{JSON.stringify({ profile: trace.profile, subjectDigest, evaluation: evaluated, component: span?.component, links: span?.links, timing: span?.timing, usage: span?.cost }, null, 2)}</pre></>}
      </div>
      <div className="flex flex-wrap gap-2 py-2">
        {trace.offset > 0 && <button className={button} disabled={!mayWrite} onClick={() => { void perform(signal => loadTrace(trace.runId, signal)) }}>First span page</button>}
        {trace.nextCursor && <button className={button} disabled={!mayWrite} onClick={() => { void perform(signal => loadTrace(trace.runId, signal, trace.nextCursor!)) }}>Next span page</button>}
        <button className={button} onClick={() => chooseSpan(null)}>Select whole run</button>
        <button className={button} onClick={exportMetadata}>Export metadata</button>
        {!workspace && <button className={button} disabled={expiry <= Date.now()} onClick={openWorkspace}>Open in Editor Workspace</button>}
      </div>
      {(!workspace || view === "evidence" || view === "comparison") && <section aria-label="Subject evaluation" className="rounded border p-3">
        <h4 className="font-semibold">{selection.spanId ? `Span ${selection.spanId}` : 'Whole run'} · {evaluated?.status ?? 'unevaluated'}</h4>
        <p className="text-xs">{selection.spanId && !span ? 'Selected span is outside this page; return to its page to evaluate.' : `Score: ${evaluated?.score ?? 'Unknown'} ${evaluated?.reason ?? ''}`}</p>
        <div className="flex flex-wrap gap-2 py-2">
          <button className={button} disabled={!mayWrite || !subjectDigest || ['running', 'in_doubt', 'reported'].includes(evaluated?.status ?? '')} onClick={evaluate}>Evaluate selected subject</button>
          <button className={button} disabled={!trace.subjectDigest} onClick={() => { setBaseline(trace); setComparison(null) }}>Use run as baseline</button>
          <button className={button} disabled={!mayWrite || !comparable(baseline, trace)} onClick={compare}>Compare candidate</button>
        </div>
        <p className="text-xs">{baseline ? `Baseline ${baseline.candidate.revision}. Select a different candidate with the same cohort and profile.` : 'Select a completed run as baseline, then a different candidate.'}</p>
        {comparison !== null && <pre className="max-h-72 overflow-auto text-xs" aria-label="Comparison evidence">{JSON.stringify(comparison, null, 2)}</pre>}
      </section>}
    </section>}
  </section>
}
