import React from 'react'
import { pythonLearningRuntime as runtime } from './learningRuntime'
import { captureLearningDebrief, loadLearningDebriefs, parseLearningDebrief, saveLearningDebrief, LEARNING_RECORD_BYTES, type LearningDebrief } from './learningPersistence'
import type { DroneBenchLogSummary } from './learningDroneBenchLog'
import { LearningFlightTransferControls } from './LearningFlightTransferControls'

export function LearningDebriefControls({ onRestore, readOnly }: { onRestore: (source: string, lessonId: string) => void; readOnly?: boolean }) {
  const snapshot = React.useSyncExternalStore(runtime.subscribe, runtime.read, runtime.read)
  const [message, setMessage] = React.useState(''), [busy, setBusy] = React.useState(false)
  const [records, setRecords] = React.useState<LearningDebrief[]>([])
  const [bench, setBench] = React.useState<DroneBenchLogSummary | null>(null)
  const abort = React.useRef(new AbortController())
  React.useEffect(() => {
    abort.current.abort(); abort.current = new AbortController(); setBusy(false)
    return () => abort.current.abort()
  }, [snapshot.document?.documentId, snapshot.document?.source, snapshot.document?.lessonId, snapshot.result?.identity.runId])
  React.useEffect(() => { setRecords([]); setBench(null); setMessage('') }, [snapshot.document?.documentId, snapshot.document?.lessonId])
  const act = async (operation: (signal: AbortSignal) => Promise<string>) => {
    const signal = abort.current.signal; setBusy(true); setMessage('Working…')
    try { const text = await operation(signal); if (!signal.aborted) setMessage(text) }
    catch (error) { if (!signal.aborted) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { if (!signal.aborted) setBusy(false) }
  }
  const finished = !snapshot.stale && !!snapshot.result?.trace && ['completed', 'failed'].includes(snapshot.state)
  return <section aria-label="Learning debriefs">
    <div className="python-learning-controls">
      <button disabled={busy || readOnly || !finished} onClick={() => void act(async signal => {
        const record = await captureLearningDebrief(snapshot)
        return `Saved locally: ${await saveLearningDebrief(record, signal)}`
      })}>Save debrief</button>
      <button disabled={busy || !finished} onClick={() => void act(async signal => {
        const record = await captureLearningDebrief(snapshot); if (signal.aborted) throw new Error('Export cancelled.')
        const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }))
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = `python-learning-${record.result.identity.lessonId}.json`; anchor.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000); return 'Debrief exported with the exact source snapshot.'
      })}>Export debrief</button>
      {snapshot.document?.lessonId === 'drone' ? <button disabled={busy || !finished || snapshot.state !== 'completed'} onClick={() => void act(async signal => {
        const record = await captureLearningDebrief(snapshot)
        const { createLearningFlightPath } = await import('./learningFlightPath')
        const text = createLearningFlightPath(record.result, window.location.href)
        if (signal.aborted) throw new Error('Flight path export cancelled.')
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'drone-flight-path.json'; anchor.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        return 'Flight path exported. Import it in GameXR Drone bench, review it, then choose Run flight path.'
      })}>Export flight path for GameXR</button> : null}
      <button disabled={busy} onClick={() => void act(async signal => {
        const loaded = await loadLearningDebriefs(snapshot.document!.documentId, signal)
        if (!signal.aborted) setRecords(loaded); return `${loaded.length} matching debriefs in the latest 20 local records.`
      })}>Load saved debriefs</button>
      <label>Import debrief <input aria-label="Import learning debrief" type="file" accept="application/json,.json" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''
        if (file) void act(async signal => {
          if (file.size > LEARNING_RECORD_BYTES) throw new Error('Import exceeds two MiB.')
          const record = await parseLearningDebrief(await file.text())
          if (!signal.aborted) setRecords([record]); return 'Imported for inspection. No source was executed or saved.'
        })
      }} /></label>
    </div>
    {snapshot.document?.lessonId === 'drone' ? <LearningFlightTransferControls /> : null}
    {snapshot.document?.lessonId === 'drone' ? <details><summary>GameXR drone bench log</summary>
      <p>Inspect an exported simulated receiver session. Recorded setpoints are control requests; measured attitude and battery are unavailable. Receiver control stays in GameXR.</p>
      <label>Import session log <input aria-label="Import GameXR drone bench log" type="file" accept="application/json,.json" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''
        if (file) { setBench(null); void act(async signal => {
          const { inspectDroneBenchLog, DRONE_BENCH_LOG_BYTES } = await import('./learningDroneBenchLog')
          if (file.size > DRONE_BENCH_LOG_BYTES) throw new Error('Bench log exceeds 500 kB. Export a shorter session.')
          const summary = inspectDroneBenchLog(await file.text())
          if (!signal.aborted) setBench(summary)
          return 'GameXR log imported for inspection. No flight or receiver command was executed.'
        }) }
      }} /></label>
      {bench ? <div aria-label="GameXR bench log summary">
        <p>{bench.records} events · {bench.controlRequests} control requests · {bench.receiverReports} receiver reports · {bench.inhibitions} inhibitions</p>
        <p>Imported file contents; authenticity and command acceptance are not verified.</p>
        <pre>{bench.lastSetpoint ? JSON.stringify(bench.lastSetpoint, null, 2) : 'No receiver setpoint report.'}</pre>
        {bench.lastPathPose ? <p>Last recorded path setpoint [tick, x, z, heading, altitude]: {JSON.stringify(bench.lastPathPose)}</p> : null}
      </div> : null}
    </details> : null}
    {message ? <p role="status">{message}</p> : null}
    {records.map(record => <details key={record.result.identity.runId}><summary>{record.result.identity.lessonId} · {record.savedAt} · saved observation</summary>
      <p>{record.result.identity.documentId}</p><pre>{record.source}</pre>
      <pre>{JSON.stringify({ scene: record.result.scene, grade: record.result.grade, output: record.result.output }, null, 2)}</pre>
      <button disabled={readOnly || busy} onClick={() => onRestore(record.source, record.result.identity.lessonId)}>Replace current source with this snapshot</button>
    </details>)}
  </section>
}
