/** Arm before selecting files; each toast channel owns its own freshness baseline. */
export function observeWorkspaceImport() {
  const channels = ['markdown-workspace-status', 'launch:import:localFiles']
  const selector = channels.map(id => `[data-kg-toast-id="${id}"]`).join(',')
  const read = channel => {
    const element = document.querySelector(`[data-kg-toast-id="${channel}"]`)
    return { element, message: element?.querySelector('[data-kg-toast-message]')?.textContent?.trim() || '', role: element?.getAttribute('role') }
  }
  const baselines = new Map(channels.map(channel => [channel, read(channel)]))
  const progressed = new Set()
  let resolve, reject, done = false
  const result = new Promise((yes, no) => { resolve = yes; reject = no })
  result.catch(() => {}) // The chooser may fail before the Node caller starts awaiting this promise.
  const finish = (error, value) => {
    if (done) return
    done = true; observer.disconnect()
    if (error) reject(error); else resolve(value)
  }
  const sample = () => {
    for (const channel of channels) {
      const next = read(channel), prior = baselines.get(channel)
      const changed = next.element !== prior.element || next.message !== prior.message || next.role !== prior.role
      if (!changed && !progressed.has(channel)) continue
      if (!next.message) continue
      if (next.role === 'alert' || /^Import failed:/i.test(next.message) || /^Import\b.*\b(cancelled|canceled|replaced)\b/i.test(next.message)) {
        finish(Error(`Workspace import failed (${channel}): ${next.message}`)); return
      }
      if (/^Imported\b/.test(next.message)) {
        if (next.role !== 'status' || !/^Imported 1(?: file\(s\))?(?:;.*)?$/.test(next.message) || /\b(failed|skipped)\b/i.test(next.message)) {
          finish(Error(`Unexpected workspace import completion (${channel}): ${next.message}`)); return
        }
        finish(null, { channel, message: next.message, role: next.role }); return
      }
      if (/^(Preparing\b|Importing\b|Reading imported\b|Selecting imported\b|Refreshing imported\b|Applying imported\b|Opening imported\b)/.test(next.message)) progressed.add(channel)
    }
  }
  const inChannel = node => (node.nodeType === 1 ? node : node.parentElement)?.closest(selector)
  const containsChannel = node => inChannel(node) || (node.nodeType === 1 && node.querySelector(selector))
  const observer = new MutationObserver(records => {
    if (records.some(record => inChannel(record.target) || [...record.addedNodes, ...record.removedNodes].some(containsChannel))) sample()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['role', 'data-kg-toast-id'] })
  return { result, dispose() { finish(Error('Workspace import proof disposed')) } }
}

async function readImportedSource(path) {
  const read = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
  })
  const key = `entries\u0000${path}`, matches = []
  for (const { name } of await indexedDB.databases()) {
    if (!name?.includes('workspace-fs:indexeddb')) continue
    const db = await read(indexedDB.open(name))
    try {
      if (!db.objectStoreNames.contains('records')) continue
      const entry = await read(db.transaction('records', 'readonly').objectStore('records').get(key))
      if (entry?.key === key && entry.collection === 'entries' && entry.id === path && entry.value?.path === path) {
        matches.push(entry.value.text)
      }
    } finally { db.close() }
  }
  return matches
}

/** One Node deadline covers arming, choosing, fresh completion, and exact persisted source. */
export async function importWorkspaceFile({ page, fileChooser, file, path, source, timeoutMs = 60000 }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60000) throw new RangeError('Invalid workspace import proof deadline')
  if (typeof path !== 'string' || !path.startsWith('/') || typeof source !== 'string') throw new TypeError('Expected exact workspace path and source text')
  const started = performance.now()
  let timer, expired = false, handle
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { expired = true; reject(Error(`Workspace import proof timed out after ${timeoutMs}ms`)) }, timeoutMs)
  })
  const within = promise => Promise.race([promise, deadline])
  const cleanup = async value => {
    try { await value.evaluate(controller => controller.dispose()) }
    finally { await value.dispose() }
  }
  try {
    const acquisition = page.evaluateHandle(observeWorkspaceImport).then(value => {
      if (expired) { void cleanup(value).catch(() => {}); return null }
      return value
    })
    handle = await within(acquisition)
    const completion = handle.evaluate(controller => controller.result)
    const action = Promise.resolve(fileChooser).then(chooser => {
      if (expired) throw Error('Workspace import proof deadline expired before file selection')
      return chooser.setFiles(file, { timeout: Math.max(1, timeoutMs - (performance.now() - started)) })
    })
    const [terminal] = await within(Promise.all([completion, action]))
    const stored = await within(page.evaluate(readImportedSource, path))
    if (stored.length !== 1 || stored[0] !== source) throw Error(`Imported source must have exactly one record with exact bytes at ${path}; found ${stored.length}${stored.length === 1 ? ' (bytes differ)' : ''}`)
    return { ...terminal, path, bytes: Buffer.byteLength(source), elapsedMs: Math.round(performance.now() - started) }
  } finally {
    // Queue cleanup even after deadline expiry without extending the single wall-clock budget.
    if (handle) await within(cleanup(handle)).catch(() => {})
    clearTimeout(timer)
  }
}
