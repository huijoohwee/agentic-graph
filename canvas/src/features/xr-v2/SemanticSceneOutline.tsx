import React from 'react'
import type { SpaceDocument } from './semanticSpaceRuntime'
import { readSemanticSpace, runSemanticSpaceAction } from './semanticSpaceStore'
import { projectSemanticSceneOutline, sceneOutlineVisibilityAction, type OutlineFilter } from './semanticSceneOutlineProjection'

export default function SemanticSceneOutline({ space, evidenceSha256, disabled = false, onSelect }: {
  space: SpaceDocument; evidenceSha256: string; disabled?: boolean; onSelect: (entityId: string) => Promise<void>
}) {
  const [query, setQuery] = React.useState('')
  const [filter, setFilter] = React.useState<OutlineFilter>('all')
  const [pending, setPending] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const lock = React.useRef(false)
  const alive = React.useRef(true)
  React.useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const outline = React.useMemo(() => projectSemanticSceneOutline(space, evidenceSha256, query, filter),
    [space, evidenceSha256, query, filter])
  const run = async (work: () => Promise<unknown>, message = '') => {
    if (disabled || lock.current) return
    lock.current = true; setPending(true); setStatus('')
    try { await work(); if (alive.current) setStatus(message) }
    catch (error) { if (alive.current) setStatus(String((error as Error).message || error)) }
    finally { lock.current = false; if (alive.current) setPending(false) }
  }
  const busy = disabled || pending
  return <section className="grid min-w-0 gap-2" aria-label="Scene outline" aria-busy={pending}>
    <div className="flex flex-wrap items-center justify-between gap-1">
      <strong>Scene objects</strong><span className="text-xs">{outline.total} models · {outline.visible} visible</span>
    </div>
    <label className="grid gap-1 text-xs">Find an object
      <input type="search" className="min-h-11 w-full min-w-0 rounded border bg-transparent px-2"
        placeholder="Name, shape or ID" maxLength={80} value={query} onChange={event => setQuery(event.currentTarget.value)} />
    </label>
    <label className="flex min-w-0 items-center gap-2 text-xs">Show
      <select className="min-h-11 min-w-0 flex-1 rounded border bg-transparent px-2" value={filter}
        onChange={event => setFilter(event.currentTarget.value as OutlineFilter)}>
        <option value="all">All objects</option><option value="visible">Visible objects</option><option value="hidden">Hidden objects</option>
      </select>
    </label>
    <ul className="m-0 grid max-h-64 list-none gap-1 overflow-auto p-0" aria-label="Scene object list">
      {outline.rows.map(row => <li key={row.id} className="flex min-w-0 items-stretch gap-1 rounded border">
        <button type="button" disabled={busy} aria-pressed={row.selected} aria-label={`Select ${row.label}`}
          className={`min-h-11 min-w-0 flex-1 rounded px-2 py-1 text-left ${row.selected ? 'bg-blue-500/15 ring-1 ring-inset ring-blue-500' : ''}`}
          onClick={() => void run(() => onSelect(row.id))}>
          <span className="block truncate font-medium">{row.label}</span>
          <span className="block text-xs opacity-70">{row.shape}{!row.visible ? ' · Hidden' : ''}{row.selected ? ' · Selected' : ''}</span>
        </button>
        <button type="button" className="min-h-11 shrink-0 rounded px-2" style={{ minWidth: 44 }} disabled={busy}
          aria-label={`${row.visible ? 'Hide' : 'Show'} ${row.label}`} onClick={() => void run(async () => {
            const action = sceneOutlineVisibilityAction(space, await readSemanticSpace(), evidenceSha256,
              row.id, !row.visible, `request:${crypto.randomUUID()}`)
            await runSemanticSpaceAction(action)
          }, `${row.label} ${row.visible ? 'hidden' : 'shown'}.`)}>{row.visible ? 'Hide' : 'Show'}</button>
      </li>)}
    </ul>
    {!outline.rows.length && <p className="m-0 text-xs">No objects match. Clear search or choose All objects.</p>}
    <span className="text-xs opacity-70">Select to edit in Timeline. Hiding keeps the saved object.</span>
    {status && <p role="status" className="m-0 text-xs">{status}</p>}
  </section>
}
