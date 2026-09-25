import React from 'react'
import { pythonLearningRuntime as runtime } from './learningRuntime'
import { captureLearningDebrief } from './learningPersistence'
import { sendFlightPath } from './learningFlightTransfer'

export function LearningFlightTransferControls() {
  const snapshot = React.useSyncExternalStore(runtime.subscribe, runtime.read, runtime.read)
  const [destination, setDestination] = React.useState(''), [message, setMessage] = React.useState('')
  const [busy, setBusy] = React.useState(false), [copyText, setCopyText] = React.useState('')
  const abort = React.useRef(new AbortController())
  React.useEffect(() => {
    abort.current.abort(); abort.current = new AbortController(); setBusy(false); setCopyText(''); setMessage('')
    return () => abort.current.abort()
  }, [snapshot.document?.documentId, snapshot.document?.source, snapshot.document?.lessonId, snapshot.result?.identity.runId])
  const available = !busy && !snapshot.stale && snapshot.state === 'completed' && !!snapshot.result?.trace
  const prepare = async () => {
    const record = await captureLearningDebrief(snapshot)
    const { createLearningFlightPath } = await import('./learningFlightPath')
    return createLearningFlightPath(record.result, location.href)
  }
  const act = (operation: (signal: AbortSignal) => Promise<string>) => {
    const signal = abort.current.signal; setBusy(true); setMessage('Preparing flight path…')
    // Invoke now, before awaiting, to preserve popup/clipboard user activation.
    try {
      void operation(signal).then(text => { if (!signal.aborted) setMessage(text) })
        .catch(error => { if (!signal.aborted) setMessage(error instanceof Error ? error.message : String(error)) })
        .finally(() => { if (!signal.aborted) setBusy(false) })
    } catch (error) { setBusy(false); setMessage(error instanceof Error ? error.message : String(error)) }
  }
  return <details><summary>Send flight to GameXR</summary>
    <label>GameXR address <input aria-label="GameXR address" type="url" value={destination} placeholder="http://…/gamexr/"
      onChange={event => setDestination(event.target.value)} disabled={busy} /></label>
    <div className="python-learning-controls">
      <button disabled={!available || !destination.trim()} onClick={() => act(signal => sendFlightPath(destination.trim(), prepare, signal))}>Send to GameXR</button>
      <button disabled={!available} onClick={() => act(async signal => {
        const text = await prepare(); if (signal.aborted) return ''
        setCopyText(text)
        try { await navigator.clipboard.writeText(text); return 'Copied. In GameXR, open Paste flight path and choose Review pasted path.' }
        catch { return 'Select and copy the flight path below, then paste it in GameXR.' }
      })}>Copy flight path</button>
    </div>
    <p>Send opens a separate GameXR review tab. For iPhone, create a phone link there using the Mac gateway address.</p>
    {copyText ? <textarea aria-label="Flight path to copy" readOnly value={copyText} rows={3} onFocus={event => event.target.select()} style={{ width: '100%', boxSizing: 'border-box' }} /> : null}
    {message ? <p role="status">{message}</p> : null}
  </details>
}
