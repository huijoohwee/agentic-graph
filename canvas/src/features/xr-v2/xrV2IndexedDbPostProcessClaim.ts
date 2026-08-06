import {
  XR_V2_POST_PROCESS_LEASE_MS,
  isXrV2PostProcessJobClaimable,
  type XrV2StoredPostProcessJob,
} from './xrV2PostProcessStoreContract'

type ClaimInput = Readonly<{
  database: IDBDatabase
  nowMs: number
  leaseId: string
  signal?: AbortSignal
  timeoutMs: number
  stereoContainerRef: (leaseId: string) => string
  releaseLateClaim: (claimed: XrV2StoredPostProcessJob) => Promise<void>
}>

const cancelled = () => new DOMException('XR job claim cancelled', 'AbortError')

/** Atomically reclaims an expired lease and its abandoned lease-owned stereo blob. */
export function claimXrV2PostProcessJobInIndexedDb(
  input: ClaimInput,
): Promise<XrV2StoredPostProcessJob | null> {
  if (input.signal?.aborted) return Promise.reject(cancelled())
  return new Promise((resolve, reject) => {
    const transaction = input.database.transaction(['jobs', 'blobs'], 'readwrite')
    let abortRequested = false
    let timedOut = false
    let claimed: XrV2StoredPostProcessJob | null = null
    const failure = () => timedOut ? new Error('XR job claim timed out') : cancelled()
    const abort = () => {
      abortRequested = true
      try { transaction.abort() } catch { /* committed late claims are reconciled below */ }
    }
    input.signal?.addEventListener('abort', abort, { once: true })
    const cleanup = () => { clearTimeout(timeout); input.signal?.removeEventListener('abort', abort) }
    const timeout = setTimeout(() => {
      abortRequested = true
      timedOut = true
      try { transaction.abort() } catch { /* already settled */ }
    }, input.timeoutMs)
    const request = transaction.objectStore('jobs').openCursor()
    request.onerror = () => transaction.abort()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      const current = cursor.value as XrV2StoredPostProcessJob
      if (!isXrV2PostProcessJobClaimable(current, input.nowMs)) {
        cursor.continue()
        return
      }
      if (current.leaseId) {
        transaction.objectStore('blobs').delete(input.stereoContainerRef(current.leaseId))
      }
      claimed = Object.freeze({
        ...current, status: 'running', attempts: Math.max(1, current.attempts),
        leaseId: input.leaseId,
        leaseExpiresAtMs: input.nowMs + XR_V2_POST_PROCESS_LEASE_MS,
        error: null, updatedAtMs: input.nowMs,
      })
      cursor.update(claimed)
    }
    transaction.oncomplete = () => {
      cleanup()
      if (!abortRequested && !input.signal?.aborted) { resolve(claimed); return }
      if (!claimed) { reject(failure()); return }
      void input.releaseLateClaim(claimed).then(() => reject(failure()), reject)
    }
    transaction.onerror = () => { cleanup(); reject(transaction.error || new Error('XR job claim failed')) }
    transaction.onabort = () => { cleanup(); reject(transaction.error || failure()) }
  })
}
