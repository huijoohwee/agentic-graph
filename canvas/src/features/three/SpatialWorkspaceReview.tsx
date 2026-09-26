import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { applySpatialWorkspace, cancelSpatialWorkspace, inspectSpatialWorkspace, proposeSpatialWorkspace, readSpatialReview, recheckSpatialReceipt, subscribeSpatialReview, undoSpatialWorkspace, type SpatialResult } from './spatialWorkspaceRuntime'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'

/** Operator review uses the same snapshot and detached proposal as the browser agent tool. */
export function SpatialWorkspaceReview() {
  const review = React.useSyncExternalStore(subscribeSpatialReview, readSpatialReview, readSpatialReview)
  const motion = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
  const source = useGraphStore(useShallow(state => ({ name: state.markdownDocumentName, text: state.markdownDocumentText })))
  const [snapshot, setSnapshot] = React.useState<Awaited<ReturnType<typeof inspectSpatialWorkspace>> | null>(null)
  const [selected, setSelected] = React.useState('')
  const [position, setPosition] = React.useState('')
  const [scale, setScale] = React.useState('1')
  const [result, setResult] = React.useState<SpatialResult | null>(null)
  const [working, setWorking] = React.useState(false)
  const [refresh, setRefresh] = React.useState(0)
  React.useEffect(() => {
    let active = true
    void inspectSpatialWorkspace().then(next => { if (active) setSnapshot(next) })
    return () => { active = false }
  }, [source.name, source.text, motion.revision, refresh])
  const subjects = snapshot && 'subjects' in snapshot ? snapshot.subjects : []
  const subject = subjects.find(item => item.id === selected) || subjects.find(item => item.id === motion.selectedShotTargetId) || subjects[0]
  React.useEffect(() => {
    setPosition(subject?.position.join(', ') || ''); setScale(String(subject?.scale ?? 1))
  }, [subject?.id, subject?.position.join(','), subject?.scale, source.name])
  React.useEffect(() => { setResult(null) }, [source.name])
  const run = async (action: () => Promise<SpatialResult>) => {
    setWorking(true)
    try { setResult(await action()) }
    finally { setWorking(false); setRefresh(value => value + 1) }
  }
  const proposal = review.proposal
  const receipts = snapshot && 'receipts' in snapshot ? snapshot.receipts : []
  const latest = [...receipts].reverse().find(row => row.kind === 'apply' && !receipts.some(other => other.undoOf === row.id))
  return <section aria-label="Spatial change review" className="grid min-w-0 gap-2 border-t p-2 text-xs" style={{ color: 'var(--kg-text-primary)', background: 'var(--kg-panel-bg)' }} data-kg-spatial-review>
    <h3 className="font-semibold">Review a scene change</h3>
    <p>Preview position or scale edits, then apply the exact change. Bounds are approximate; physical correspondence is unknown.</p>
    {snapshot && !snapshot.ok && <p role="status">{snapshot.message}</p>}
    {!proposal && <fieldset disabled={working || review.preparing || !snapshot?.ok} className="grid min-w-0 gap-2">
      <label className="grid gap-1">Object<select aria-label="Review object" value={subject?.id || ''} onChange={event => setSelected(event.target.value)} className="min-h-9 rounded border bg-transparent p-1">
        {subjects.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      <label className="grid gap-1">Position in metres (x, y, z)<input aria-label="Proposed position" value={position} onChange={event => setPosition(event.target.value)} className="min-h-9 rounded border bg-transparent p-1" /></label>
      <label className="grid gap-1">Scale<input aria-label="Proposed scale" type="number" min="0.25" max="4" step="0.001" value={scale} onChange={event => setScale(event.target.value)} className="min-h-9 rounded border bg-transparent p-1" /></label>
      <button type="button" className="min-h-9 rounded border px-3" onClick={() => void run(async () => {
        if (!subject || !snapshot || !('identity' in snapshot)) return { ok: false, message: 'Inspect a loaded scene first.' }
        const parts = position.split(',').map(value => value.trim())
        if (parts.length !== 3 || parts.some(value => !value) || !scale.trim()) return { ok: false, message: 'Enter three comma-separated coordinates and a scale.' }
        return proposeSpatialWorkspace({ expectedToken: snapshot.identity.token, edits: [{ subjectId: subject.id, position: parts.map(Number), scale: Number(scale) }] })
      })}>Preview change</button>
    </fieldset>}
    {review.preparing && <p role="status">Preparing detached preview…</p>}
    {proposal && <>
      <p>Document: {proposal.documentName}</p>
      <ul className="grid gap-2">{proposal.preview.diff.map(row => <li key={row.subjectId}>
        <strong>{row.label}</strong><div>Position: {row.before.position.join(', ')} → {row.after.position.join(', ')} m</div>
        <div>Scale: {row.before.scale} → {row.after.scale}</div>
        {row.after.marks.length > 0 && <div>{row.after.marks.length} authored track marks move with the object.</div>}
      </li>)}</ul>
      <p>Approximate overlaps: {proposal.preview.before.overlaps.length} → {proposal.preview.after.overlaps.length}. Objects outside stage bounds: {proposal.preview.after.outsideStage.length}.</p>
      {proposal.preview.after.overlaps.length > 0 && <details><summary>Overlap findings</summary><ul>{proposal.preview.after.overlaps.map(pair => <li key={pair}>{pair}</li>)}</ul></details>}
      <p className="break-all opacity-70">Review {proposal.digest.slice(0, 12)} · source {proposal.sourceToken.slice(0, 12)}</p>
      <button type="button" disabled={working} className="min-h-9 rounded border px-3" onClick={() => void run(() => applySpatialWorkspace(proposal))}>Apply reviewed change</button>
    </>}
    {(proposal || review.preparing) && <button type="button" disabled={working} className="min-h-9 rounded border px-3" onClick={() => { cancelSpatialWorkspace(); setResult({ ok: true, message: 'Proposal cancelled; no scene change was made.' }) }}>Cancel proposal</button>}
    {latest && !proposal && <button type="button" disabled={working} className="min-h-9 rounded border px-3" onClick={() => void run(() => undoSpatialWorkspace(latest.id))}>Undo last reviewed change</button>}
    {result && <p role="status">{result.message}</p>}
    {result?.receipt && <p className="break-all">Receipt {result.receipt.id}</p>}
    {result?.durability === 'indeterminate' && result.receipt && <button type="button" disabled={working} className="min-h-9 rounded border px-3" onClick={() => void run(() => recheckSpatialReceipt(result.receipt!.id))}>Recheck saved receipt</button>}
  </section>
}
