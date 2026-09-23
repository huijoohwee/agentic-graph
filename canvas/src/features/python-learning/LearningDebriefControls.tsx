import React from 'react'
import { pythonLearningRuntime as runtime } from './learningRuntime'
import { captureLearningDebrief, loadLearningDebriefs, parseLearningDebrief, saveLearningDebrief, LEARNING_RECORD_BYTES, type LearningDebrief } from './learningPersistence'

export function LearningDebriefControls({ onRestore, readOnly }: { onRestore: (source: string, lessonId: string) => void; readOnly?: boolean }) {
  const snapshot = React.useSyncExternalStore(runtime.subscribe, runtime.read, runtime.read)
  const [message, setMessage] = React.useState(''), [busy, setBusy] = React.useState(false)
  const [records, setRecords] = React.useState<LearningDebrief[]>([])
  const abort = React.useRef(new AbortController())
  React.useEffect(() => {
    abort.current.abort(); abort.current = new AbortController(); setBusy(false)
    return () => abort.current.abort()
  }, [snapshot.document?.documentId, snapshot.document?.source, snapshot.document?.lessonId, snapshot.result?.identity.runId])
  React.useEffect(() => { setRecords([]); setMessage('') }, [snapshot.document?.documentId])
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
    {message ? <p role="status">{message}</p> : null}
    {records.map(record => <details key={record.result.identity.runId}><summary>{record.result.identity.lessonId} · {record.savedAt} · saved observation</summary>
      <p>{record.result.identity.documentId}</p><pre>{record.source}</pre>
      <pre>{JSON.stringify({ scene: record.result.scene, grade: record.result.grade, output: record.result.output }, null, 2)}</pre>
      <button disabled={readOnly || busy} onClick={() => onRestore(record.source, record.result.identity.lessonId)}>Replace current source with this snapshot</button>
    </details>)}
  </section>
}
