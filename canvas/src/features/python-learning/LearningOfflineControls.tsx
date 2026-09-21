import React from 'react'
import { readAgenticGraphSourceRevision } from '../runtime-identity/agentic-graph-runtime-identity'

type Evidence = { revision: string; digest: string; bytes: number; files: number }
async function offlineRequest(operation: 'install' | 'verify' | 'recover'): Promise<Evidence> {
  const revision = readAgenticGraphSourceRevision()
  const worker = navigator.serviceWorker?.controller
  if (!worker || !/^[0-9a-f]{40}$/.test(revision)) throw new Error('Offline installation needs the built application and its active service worker. Reopen the installed application online first.')
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const finish = () => { clearTimeout(timeout); channel.port1.close() }
    const timeout = setTimeout(() => { finish(); reject(new Error('Offline verification did not finish. Use Verify installation before opening offline.')) }, 190000)
    channel.port1.onmessage = event => {
      finish(); const result = event.data, evidence = result?.evidence
      if (!result?.ok) return reject(new Error(String(result?.error || 'Offline installation failed.')))
      if (!/^[0-9a-f]{40}$/.test(evidence?.revision) || !/^[0-9a-f]{64}$/.test(evidence?.digest)
        || !Number.isSafeInteger(evidence?.bytes) || !Number.isSafeInteger(evidence?.files)) return reject(new Error('Invalid offline installation evidence.'))
      resolve(evidence)
    }
    worker.postMessage({ type: 'AG_PYTHON_LEARNING_OFFLINE', operation, revision }, [channel.port2])
  })
}
export function LearningOfflineControls() {
  const [busy, setBusy] = React.useState(false), [notice, setNotice] = React.useState(''), [evidence, setEvidence] = React.useState<Evidence | null>(null)
  const live = React.useRef(true)
  React.useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const act = async (operation: 'install' | 'verify' | 'recover') => {
    setBusy(true); setEvidence(null); setNotice('Checking the complete installation…')
    try {
      const result = await offlineRequest(operation)
      if (live.current) { setEvidence(result); setNotice(`Verified ${result.files} files · ${(result.bytes / 1024 / 1024).toFixed(1)} MiB · ${result.revision.slice(0, 12)}`) }
    } catch (error) { if (live.current) setNotice(error instanceof Error ? error.message : String(error)) }
    finally { if (live.current) setBusy(false) }
  }
  const open = () => {
    if (!evidence) return
    const url = new URL(location.href); url.searchParams.set('python-learning-offline', evidence.revision)
    url.searchParams.set('openEditorWorkspace', '1'); location.assign(url.href)
  }
  return <details><summary>Offline lessons</summary>
    <p>Install the application assets while connected. Source and debriefs stay in this browser. The previous complete installation is retained for recovery; browser storage can still be evicted.</p>
    <div className="python-learning-controls">
      <button disabled={busy} onClick={() => void act('install')}>Install offline lessons</button>
      <button disabled={busy} onClick={() => void act('verify')}>Verify installation</button>
      <button disabled={busy} onClick={() => void act('recover')}>Recover previous installation</button>
      <button disabled={busy || !evidence} onClick={open}>Open verified offline workspace</button>
    </div>
    {notice ? <p role="status">{notice}</p> : null}
  </details>
}
