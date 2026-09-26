import React from 'react'
import { pythonLearningRuntime as runtime } from './learningRuntime'
import { captureLearningDebrief } from './learningPersistence'
import { createFlightReviewUrl, flightDestination } from './learningFlightTransfer'

export function LearningFlightTransferControls() {
  const snapshot = React.useSyncExternalStore(runtime.subscribe, runtime.read, runtime.read)
  const [destination, setDestination] = React.useState(''), [message, setMessage] = React.useState('')
  const [busy, setBusy] = React.useState(false), [copyText, setCopyText] = React.useState('')
  const [link, setLink] = React.useState<{ snapshot: typeof snapshot; destination: string; url: string } | null>(null)
  const [linkStatus, setLinkStatus] = React.useState('')
  const abort = React.useRef(new AbortController())
  React.useEffect(() => {
    abort.current.abort(); abort.current = new AbortController(); setBusy(false); setCopyText(''); setMessage('')
    return () => abort.current.abort()
  }, [snapshot.document?.documentId, snapshot.document?.source, snapshot.document?.lessonId, snapshot.result?.identity.runId])
  const finished = !snapshot.stale && snapshot.state === 'completed' && !!snapshot.result?.trace
  const available = !busy && finished
  const prepare = async () => {
    const record = await captureLearningDebrief(snapshot)
    const { createLearningFlightPath } = await import('./learningFlightPath')
    return createLearningFlightPath(record.result, location.href)
  }
  React.useEffect(() => {
    const controller = new AbortController()
    setLink(null); setLinkStatus('')
    if (finished && destination.trim()) {
      setLinkStatus('Preparing GameXR review link…')
      void (async () => {
        flightDestination(destination.trim())
        const text = await prepare(); controller.signal.throwIfAborted()
        const url = await createFlightReviewUrl(text, destination.trim(), controller.signal)
        if (!controller.signal.aborted) { setLink({ snapshot, destination, url }); setLinkStatus('Ready to open in GameXR for review.') }
      })().catch(error => { if (!controller.signal.aborted) setLinkStatus(error instanceof Error ? error.message : String(error)) })
    }
    return () => controller.abort()
  }, [snapshot, destination, finished])
  // The identity guard removes an old href in the same render as a source/run/address change.
  const href = available && link?.snapshot === snapshot && link.destination === destination ? link.url : undefined
  const act = (operation: (signal: AbortSignal) => Promise<string>) => {
    const signal = abort.current.signal; setBusy(true); setMessage('Preparing flight path…')
    // Clipboard denial still leaves selectable text for manual copy.
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
      {href ? <a href={href} target="_blank" rel="noopener noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '4px 9px', border: '1px solid var(--kg-border,#667)', borderRadius: 5, color: 'inherit' }}>Send to GameXR</a>
        : <button disabled>Send to GameXR</button>}
      <button disabled={!available} onClick={() => act(async signal => {
        const { captureLearningCanvasShare } = await import('./learningCanvasShare')
        const { buildCanvasEmbedIframeMarkup } = await import('@/features/canvas/canvasEmbedIframeMarkup')
        const { openCanvasEmbedCodePanel } = await import('@/features/canvas/canvasEmbedCodePanelEvent')
        const url = await captureLearningCanvasShare(snapshot.document!.documentId, new URL(import.meta.env.BASE_URL, location.origin).href, signal)
        const code = buildCanvasEmbedIframeMarkup(url)
        if (!code || signal.aborted) throw new Error('Canvas sharing cancelled.')
        openCanvasEmbedCodePanel({ sourceName: snapshot.document!.documentId, title: 'Canvas iframe embed', language: 'html', code })
        return 'Canvas embed ready. Copy the iframe into another page to replay this completed flight.'
      })}>Share canvas embed</button>
      <button disabled={!available} onClick={() => act(async signal => {
        const text = await prepare(); if (signal.aborted) return ''
        setCopyText(text)
        try { await navigator.clipboard.writeText(text); return 'Copied. In GameXR, open Paste flight path and choose Review pasted path.' }
        catch { return 'Select and copy the flight path below, then paste it in GameXR.' }
      })}>Copy flight path</button>
    </div>
    <p>Send opens the completed flight in a separate GameXR review tab. Connect and Run there when ready. For iPhone, create a phone link in GameXR.</p>
    {linkStatus ? <p role="status">{linkStatus}</p> : null}
    {copyText ? <textarea aria-label="Flight path to copy" readOnly value={copyText} rows={3} onFocus={event => event.target.select()} style={{ width: '100%', boxSizing: 'border-box' }} /> : null}
    {message ? <p role="status">{message}</p> : null}
  </details>
}
