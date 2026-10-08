export type ExplorerRefreshOptions = { silent?: boolean; reconcileSeed?: boolean }

/** Each caller joins the next fresh pass; later requests cannot extend its wait. */
export function createWorkspaceRefreshQueue<Snapshot>(
  run: (options: ExplorerRefreshOptions) => Promise<Snapshot>,
): (options?: ExplorerRefreshOptions) => Promise<Snapshot> {
  type Batch = {
    options: ExplorerRefreshOptions
    promise: Promise<Snapshot>
    resolve: (snapshot: Snapshot) => void
    reject: (error: unknown) => void
  }
  let running = false
  let pending: Batch | null = null
  const drain = async () => {
    try {
      while (pending) {
        const batch = pending
        pending = null
        try { batch.resolve(await run(batch.options)) }
        catch (error) { batch.reject(error) }
      }
    } finally { running = false }
  }
  return (options = {}) => {
    if (!pending) {
      let resolve!: Batch['resolve'], reject!: Batch['reject']
      const promise = new Promise<Snapshot>((yes, no) => { resolve = yes; reject = no })
      pending = { options: { silent: true, reconcileSeed: false }, promise, resolve, reject }
    }
    pending.options = {
      silent: !!options.silent && !!pending.options.silent,
      reconcileSeed: options.reconcileSeed !== false || pending.options.reconcileSeed === true,
    }
    const promise = pending.promise
    if (!running) {
      running = true
      void Promise.resolve().then(drain)
    }
    return promise
  }
}
