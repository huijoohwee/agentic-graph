import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { findComposedSourceFileByPath } from '@/features/source-files/composedSourceSelection'
import { useSourceFilesBootstrapSnapshot } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { LearningOfflineControls } from '@/features/python-learning/LearningOfflineControls'
import { captureEvidenceSource, isEvidenceSourceCurrent, type EvidenceKind, type EvidenceExample, type EvidenceSourceCapture } from './evidenceSource'
import { dispatchEvidence, executeEvidence } from './tools/executeEvidence.mjs'
import { findEvidenceOperation } from './tools/evidenceCatalog.mjs'
import { canonicalJson } from './core/evidence-kernel.mjs'
import { AnalysisSummary, JsonDetails, RecordResult, ReplayResult, VolumeResult } from './ui/EvidenceResults'
import { readEvidenceExamples } from './ui/evidenceInput'
import { SourceGeospatialControls } from './SourceGeospatialControls'

type Accepted = { kind: EvidenceKind; inputs: string[]; capture: EvidenceSourceCapture; record: any; output: any; entityId: string; atUtc: string }
const kinds: EvidenceKind[] = ['record', 'volume', 'arrival', 'route', 'notice']
const labels = { record: 'Record / replay', volume: 'Volumes', arrival: 'Arrival evaluation', route: 'Route comparison', notice: 'Notice triage' }
const operations = { record: 'aviation.replay', volume: 'volume.project', arrival: 'arrival.evaluate', route: 'route.benchmark', notice: 'notice.triage' }
const button = 'App-toolbar__btn min-h-[44px]'
const card = `grid min-w-0 gap-2 rounded border p-2 ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
function success(value: any): any {
  if (value?.ok === false) throw new Error(`${value.error?.code || 'EVIDENCE'}: ${value.error?.message || 'Operation rejected.'}`)
  return value
}
function argsFor(kind: EvidenceKind, inputs: string[], entityId: string, atUtc: string) {
  if (kind === 'arrival') return { bundles: inputs }
  if (kind === 'notice') return { notice: inputs[0], atUtc }
  return { bundle: inputs[0], entityId, ...(kind === 'route' ? {} : { atUtc }) }
}
export default function EvidencePanel() {
  const readiness = useSourceFilesBootstrapSnapshot()
  const documentName = useGraphStore(state => state.markdownDocumentName)
  const documentText = useGraphStore(state => state.markdownDocumentText)
  const sourceFiles = useGraphStore(state => state.sourceFiles)
  const source = React.useMemo(() => {
    if (readiness.phase !== 'ready') return { capture: null, error: readiness.error || 'Preparing the source workspace…' }
    try { return { capture: captureEvidenceSource(), error: '' } }
    catch (error) { return { capture: null, error: error instanceof Error ? error.message : String(error) } }
  }, [documentName, documentText, sourceFiles, readiness.phase, readiness.error])
  const capture = source.capture
  const [kind, setKind] = React.useState<EvidenceKind>('record')
  const [exampleId, setExampleId] = React.useState('')
  const [accepted, setAccepted] = React.useState<Accepted | null>(null)
  const [entityId, setEntityId] = React.useState(''), [atUtc, setAtUtc] = React.useState('')
  const [status, setStatus] = React.useState('Choose a labelled example or import permitted local JSON.')
  const [busy, setBusy] = React.useState(false), [detail, setDetail] = React.useState<any>(null)
  const [prepared, setPrepared] = React.useState<{ text: string; url: string; filename: string } | null>(null)
  const generation = React.useRef(0), current = React.useRef(accepted), downloadUrl = React.useRef<string | null>(null)
  const pendingRead = React.useRef<AbortController | null>(null)
  const panel = React.useRef<HTMLElement | null>(null)
  const pendingFocus = React.useRef<{ element: HTMLElement; owner: EvidenceSourceCapture; dispose: () => void } | null>(null)
  const discardFocus = React.useCallback(() => { pendingFocus.current?.dispose(); pendingFocus.current = null }, [])
  function beginBusy() {
    discardFocus()
    const doc = panel.current?.ownerDocument, element = doc?.activeElement
    if (capture && doc && element instanceof HTMLElement && panel.current?.contains(element)) {
      const cancel = () => discardFocus()
      const moved = (event: FocusEvent) => { if (event.target !== element && event.target !== doc.body) cancel() }
      doc.addEventListener('pointerdown', cancel, true)
      doc.addEventListener('keydown', cancel, true)
      doc.addEventListener('focusin', moved, true)
      pendingFocus.current = { element, owner: capture, dispose: () => {
        doc.removeEventListener('pointerdown', cancel, true)
        doc.removeEventListener('keydown', cancel, true)
        doc.removeEventListener('focusin', moved, true)
      } }
    }
    setBusy(true)
  }
  React.useLayoutEffect(() => {
    const pending = pendingFocus.current
    if (!pending) return
    const { element, owner } = pending, state = useGraphStore.getState()
    const file = findComposedSourceFileByPath({ sourceFiles: state.sourceFiles, targetPath: state.markdownDocumentName })
    // Only focus intent survives temporary availability loss; source/read fences stay exact.
    if (!element.isConnected || !panel.current?.contains(element)
      || element.closest('[hidden],[inert],[aria-hidden="true"],details:not([open])')
      || state.markdownDocumentName !== owner.documentName || state.markdownDocumentText !== owner.documentText
      || file?.id !== owner.sourceId || file?.text !== owner.documentText
      || file?.parsedGraphRevision !== owner.sourceRevision || file?.enabled !== true) { discardFocus(); return }
    if (busy || !capture || !isEvidenceSourceCurrent(capture) || !isEvidenceSourceCurrent(owner) || element.matches(':disabled')) return
    const active = element.ownerDocument.activeElement
    if (active === element.ownerDocument.body) {
      element.focus({ preventScroll: true })
      if (element.ownerDocument.activeElement !== element) discardFocus()
    } else if (active !== element) discardFocus()
  }, [busy, capture, documentName, documentText, sourceFiles, accepted, detail, prepared, status, discardFocus])
  const cancelRead = React.useCallback(() => { pendingRead.current?.abort(); pendingRead.current = null }, [])
  current.current = accepted
  const examples = capture?.config.examples.filter(item => item.kind === kind) || []
  const chosen = examples.find(item => item.id === exampleId) || examples[0]
  const visible = accepted?.kind === kind ? accepted : null
  const moments = visible?.record && kind === 'record' ? [...new Set<string>(visible.record.facts.map((fact: any) => new Date(fact.observed_at).toISOString()))].sort() : []
  const previousTime = moments.filter(moment => Date.parse(moment) < Date.parse(atUtc)).pop()
  const nextTime = moments.find(moment => Date.parse(moment) > Date.parse(atUtc))
  const stale = Boolean(visible && (!capture || !isEvidenceSourceCurrent(visible.capture)))
  const release = React.useCallback(() => {
    if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current)
    downloadUrl.current = null; setPrepared(null)
  }, [])
  React.useLayoutEffect(() => { generation.current++; cancelRead(); setBusy(false); setDetail(null); release(); setStatus(source.error || 'Current source configuration ready. Choose an example or import permitted JSON.') }, [capture?.documentName, capture?.documentText, capture?.sourceId, capture?.sourceRevision, source.error, release, cancelRead, discardFocus])
  React.useEffect(() => () => { generation.current++; cancelRead(); discardFocus(); if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current) }, [cancelRead, discardFocus])
  const live = (token: number, owner: EvidenceSourceCapture) => token === generation.current && isEvidenceSourceCurrent(owner)
  function selectKind(next: EvidenceKind) {
    generation.current++; cancelRead(); discardFocus(); setBusy(false); setKind(next); setExampleId(''); setDetail(null)
    setAtUtc(capture?.config.examples.find(item => item.kind === next)?.atUtc || '')
    setStatus('Choose a labelled example or import permitted local JSON.')
  }
  async function run(read: (signal: AbortSignal) => Promise<string[]>, example?: EvidenceExample) {
    if (!capture) { setStatus(source.error); return }
    cancelRead()
    const controller = new AbortController(); pendingRead.current = controller
    const owner = capture, token = ++generation.current, selectedKind = kind
    beginBusy(); setStatus('Reading local evidence…')
    try {
      const inputs = await read(controller.signal)
      if (!live(token, owner)) return
      if (!inputs.length || inputs.length > 40 || (selectedKind !== 'arrival' && inputs.length !== 1)
        || inputs.reduce((sum, text) => sum + new TextEncoder().encode(text).length, 0) > 2000000) throw new Error('Supply a bounded input set of at most 2,000,000 UTF-8 bytes.')
      let record = null, id = example?.entityId || '', time = example?.atUtc || atUtc
      if (['record', 'volume', 'route'].includes(selectedKind)) {
        const profileId = owner.config.profiles[selectedKind as 'record' | 'volume' | 'route']
        record = success(await executeEvidence('aviation.inspect', { bundle: inputs[0], profileId }))
        id ||= record.entities[0].id; time ||= record.stats.endUtc
      }
      const output = success(await dispatchEvidence(operations[selectedKind], argsFor(selectedKind, inputs, id, time), owner.config))
      if (!live(token, owner)) return
      const next = { kind: selectedKind, inputs, capture: owner, record, output, entityId: id, atUtc: time }
      current.current = next; setAccepted(next); setEntityId(id); setAtUtc(time); setDetail(null); release()
      setStatus(output.disposition === 'unresolved' ? 'Structured input retained with unresolved semantics. Review reasons; no clearance is inferred.' : 'Accepted result is bound to the exact source configuration and original inputs.')
    } catch (error) {
      if (live(token, owner)) setStatus(`Not accepted: ${error instanceof Error ? error.message : String(error)} Previous accepted result retained.`)
    } finally { if (pendingRead.current === controller) pendingRead.current = null; if (token === generation.current) setBusy(false) }
  }
  const loadExample = () => chosen && run(signal => readEvidenceExamples(chosen.paths, undefined, undefined, undefined, { signal }), chosen)
  function importFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files || [])]
    if (!files.length) return
    void run(async () => {
      if (files.length > 40 || files.reduce((sum, file) => sum + file.size, 0) > 2000000) throw new Error('Selected files exceed the 2,000,000-byte input bound.')
      return Promise.all(files.map(async file => decoder.decode(new Uint8Array(await file.arrayBuffer()))))
    })
    event.target.value = ''
  }
  async function query(event?: React.FormEvent, nextTime = atUtc) {
    event?.preventDefault()
    const item = visible
    if (!item || stale) return
    const token = ++generation.current; beginBusy()
    try {
      const output = success(await dispatchEvidence(operations[kind], argsFor(kind, item.inputs, entityId, nextTime), item.capture.config))
      if (!live(token, item.capture) || current.current !== item) return
      const next = { ...item, output, entityId, atUtc: nextTime }; current.current = next; setAccepted(next); setAtUtc(nextTime); setDetail(null); release(); setStatus('Explicit query completed against the retained originals.')
    } catch (error) { if (live(token, item.capture)) setStatus(`Query rejected: ${error instanceof Error ? error.message : String(error)} Previous result retained.`) }
    finally { if (token === generation.current) setBusy(false) }
  }
  async function inspectSource(factId: string) {
    const item = visible
    if (!item || stale || !item.record) return
    const token = ++generation.current; beginBusy()
    try {
      const profileId = item.capture.config.profiles[item.kind as 'record' | 'volume' | 'route']
      const output = success(await executeEvidence('aviation.source', { bundle: item.inputs[0], factId, profileId }))
      if (live(token, item.capture) && current.current === item) { setDetail(output); setStatus('Exact original source and referenced record inspected.') }
    } catch (error) { if (live(token, item.capture)) setStatus(error instanceof Error ? error.message : String(error)) }
    finally { if (token === generation.current) setBusy(false) }
  }
  async function prepareExport() {
    const item = visible
    if (!item || stale) return
    const token = ++generation.current; beginBusy()
    try {
      const pack = ['record', 'volume', 'route'].includes(item.kind)
      const output = pack ? success(await executeEvidence('aviation.export', { bundle: item.inputs[0], profileId: item.capture.config.profiles[item.kind as 'record' | 'volume' | 'route'] })) : null
      if (!live(token, item.capture) || current.current !== item) return
      const text = pack ? output.text : canonicalJson(item.output), filename = pack ? 'evidence-pack.json' : 'analysis-result.json'
      release(); const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); downloadUrl.current = url; setPrepared({ text, url, filename })
      setStatus(pack ? 'Save the pack, then reimport to verify its original and derived identities.' : 'Save this report with the original input files; a report is not an importable evidence pack.')
    } catch (error) { if (live(token, item.capture)) setStatus(error instanceof Error ? error.message : String(error)) }
    finally { if (token === generation.current) setBusy(false) }
  }
  function clear() { generation.current++; cancelRead(); discardFocus(); setBusy(false); current.current = null; setAccepted(null); setDetail(null); release(); setStatus('Local record removed. Saved files remain on your device.') }
  async function copyPrepared() {
    const item = prepared, token = generation.current
    if (!item) return
    try { await navigator.clipboard.writeText(item.text); if (token === generation.current && downloadUrl.current === item.url) setStatus('Exact export JSON copied. Save and verify the file.') }
    catch (error) { if (token === generation.current && downloadUrl.current === item.url) setStatus(`Clipboard unavailable: ${error instanceof Error ? error.message : String(error)}. Select and copy the displayed JSON.`) }
  }
  return <section ref={panel} className="grid min-w-0 gap-3 text-xs" aria-label="Native evidence and analysis" data-kg-evidence-panel="1">
    <h3 className="text-sm font-semibold">{capture?.config.title || 'Evidence and analysis'}</h3>
    <p className="break-words">{capture?.config.description || source.error}</p>
    <SourceGeospatialControls capture={capture} />
    <LearningOfflineControls purpose="studio" />
    <div className="flex flex-wrap gap-1" role="group" aria-label="Evidence views">{kinds.map(value => <button key={value} type="button" className={button} aria-pressed={kind === value} onClick={() => selectKind(value)}>{labels[value]}</button>)}</div>
    <p role="status" aria-live="polite" className="break-words" data-kg-evidence-status="1">{stale ? 'The displayed result belongs to an earlier source revision. Reimport under the current authored configuration before querying or exporting.' : status}</p>
    <div className={card}>
      <label className="grid gap-1">Authored example<select className="min-h-[44px] min-w-0 w-full" value={chosen?.id || ''} disabled={!capture || busy} onChange={event => { setExampleId(event.target.value); setAtUtc(examples.find(item => item.id === event.target.value)?.atUtc || '') }}>{examples.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={!chosen || busy} onClick={() => void loadExample()}>Load labelled example</button><button type="button" className={button} disabled={!accepted && !busy} onClick={clear}>Remove record</button></div>
      <label className="grid gap-1">{kind === 'arrival' ? 'Import chronological batch files' : 'Import local JSON or matching evidence pack'}<input type="file" className="min-h-[44px] min-w-0 w-full" accept="application/json,.json" multiple={kind === 'arrival'} disabled={!capture || busy} onChange={importFiles} /></label>
      <p>Local JSON only · maximum combined input 2,000,000 bytes. Notice originals have a stricter 12,000-byte admission limit.</p>
    </div>
    {visible && <>
      <form className={card} onSubmit={event => void query(event)}>
        {visible.record && <label className="grid gap-1">Entity<select value={entityId} onChange={event => setEntityId(event.target.value)} className="min-h-[44px] min-w-0 w-full" disabled={busy || stale}>{visible.record.entities.map((entity: any) => <option key={entity.id} value={entity.id}>{entity.label}</option>)}</select></label>}
        {['record', 'volume', 'notice'].includes(kind) && <label className="grid gap-1">Explicit UTC time<input className="min-h-[44px] min-w-0 w-full" value={atUtc} required onChange={event => setAtUtc(event.target.value)} disabled={busy || stale} placeholder="YYYY-MM-DDTHH:mm:ss.sssZ" /></label>}
        {moments.length > 0 && <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy || stale || !previousTime} onClick={() => void query(undefined, previousTime)}>Previous moment</button><button type="button" className={button} disabled={busy || stale || !nextTime} onClick={() => void query(undefined, nextTime)}>Next moment</button></div>}
        <button className={button} type="submit" disabled={busy || stale}>Run read-only query</button>
        <code className="break-all">{findEvidenceOperation(operations[kind])?.invocation}</code>
      </form>
      {kind === 'record' ? <ReplayResult value={visible.output} /> : kind === 'volume' ? <VolumeResult value={visible.output} /> : <AnalysisSummary kind={kind} value={visible.output} />}
      <RecordResult record={visible.record} onSource={id => void inspectSource(id)} disabled={busy || stale} />
      {detail && !stale && <JsonDetails title="Exact original source and reference" value={detail} />}
      <JsonDetails title="Complete typed result" value={visible.output} />
      <div className={card}><button type="button" className={button} disabled={busy || stale} onClick={() => void prepareExport()}>Prepare verifiable export</button>
        {prepared && !stale && <><a className="min-h-[44px] break-all underline" href={prepared.url} download={prepared.filename}>Save {prepared.filename}</a><details><summary className="min-h-[44px] cursor-pointer">Inspect or copy export JSON</summary><textarea className="min-h-40 w-full font-mono text-xs" readOnly value={prepared.text} aria-label="Exact export JSON" /><button type="button" className={button} onClick={() => void copyPrepared()}>Copy export JSON</button></details></>}
      </div>
    </>}
  </section>
}
