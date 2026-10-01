import type { PassageGraphInput, PassageGraphResult } from './documentPassageGraph'

export type PassageWorkerReply = { ok: true; result: PassageGraphResult } | { ok: false; error: string }
export type PassageAnalyzer = (input: PassageGraphInput, signal: AbortSignal) => Promise<PassageGraphResult>

/** One disposable worker per explicit inspection; abort/timeout terminate computation as well as the wait. */
export function analyzePassagesInWorker(input: PassageGraphInput, signal: AbortSignal, createWorker = () => new Worker(new URL('../../workers/documentPassageGraph.worker.ts', import.meta.url), { type: 'module' })): Promise<PassageGraphResult> {
  if (signal.aborted) return Promise.reject(new Error('Passage analysis cancelled.'))
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined, timeout: ReturnType<typeof setTimeout> | undefined, settled = false
    const finish = (result?: PassageGraphResult, error?: string) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      worker?.terminate()
      if (result) resolve(result)
      else reject(new Error(error || 'Passage analysis failed.'))
    }
    const abort = () => finish(undefined, 'Passage analysis cancelled.')
    try {
      worker = createWorker()
      worker.onmessage = (event: MessageEvent<PassageWorkerReply>) => {
        const reply = event.data
        if (reply?.ok === true && reply.result?.graph && Array.isArray(reply.result.passages) && Array.isArray(reply.result.groups)) finish(reply.result)
        else finish(undefined, reply?.ok === false ? reply.error : 'Invalid passage analysis response.')
      }
      worker.onerror = () => finish(undefined, 'Passage analysis worker failed.')
      worker.onmessageerror = () => finish(undefined, 'Passage analysis response could not be read.')
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) { abort(); return }
      timeout = setTimeout(() => finish(undefined, 'Passage analysis exceeded 10 seconds.'), 10_000)
      worker.postMessage(input)
    } catch (error) { finish(undefined, error instanceof Error ? error.message : 'Passage analysis is unavailable.') }
  })
}
