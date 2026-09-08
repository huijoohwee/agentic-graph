type CoalescedEntry = {
  cancelTimer: (() => void) | null
  fn: (() => void) | null
  owner: Window | null
  generation: number
  microtaskPending: boolean
}

const entries = new Map<string, CoalescedEntry>()
type CoalescedStats = { scheduled: number; executed: number; canceled: number }
const stats = new Map<string, CoalescedStats>()
const currentOwner = (): Window | null => typeof window === 'undefined' ? null : window

const getEntry = (key: string): CoalescedEntry => {
  const existing = entries.get(key)
  if (existing) return existing
  const next: CoalescedEntry = { cancelTimer: null, fn: null, owner: null, generation: 0, microtaskPending: false }
  entries.set(key, next)
  return next
}

const getStatsEntry = (key: string): CoalescedStats => {
  const existing = stats.get(key)
  if (existing) return existing
  const next: CoalescedStats = { scheduled: 0, executed: 0, canceled: 0 }
  stats.set(key, next)
  return next
}

const retireEntry = (entry: CoalescedEntry): void => {
  const cancel = entry.cancelTimer
  entry.generation += 1
  entry.cancelTimer = null
  entry.fn = null
  entry.owner = null
  entry.microtaskPending = false
  try { cancel?.() } catch { void 0 }
}

export const scheduleCoalescedTask = (rawKey: string, fn: () => void, delayMs: number): void => {
  const key = rawKey || 'default'
  const entry = getEntry(key)
  const stat = getStatsEntry(key)
  const owner = currentOwner()
  const ms = Number.isFinite(delayMs) && delayMs >= 0 ? Math.floor(delayMs) : 0
  stat.scheduled += 1
  if (owner && entry.owner === owner && ms === 0 && entry.microtaskPending) {
    entry.fn = fn
    return
  }
  retireEntry(entry)
  entry.fn = fn
  entry.owner = owner
  const generation = entry.generation
  const run = () => {
    if (entry.generation !== generation) return
    if (currentOwner() !== owner) { retireEntry(entry); return }
    const callback = entry.fn
    // Release the completed generation before invoking user code; reentrant work owns its own entry.
    entry.cancelTimer = null
    entry.fn = null
    entry.owner = null
    entry.microtaskPending = false
    if (!callback) return
    try { callback(); stat.executed += 1 } catch { void 0 }
  }
  if (!owner) { run(); return }
  if (ms === 0) {
    entry.microtaskPending = true
    const enqueue = typeof queueMicrotask === 'function' ? queueMicrotask : (callback: () => void) => Promise.resolve().then(callback)
    enqueue(run)
    return
  }
  // Timer IDs belong to the creating Window, including when another Window becomes current.
  const clear = owner.clearTimeout.bind(owner)
  const timerId = owner.setTimeout(run, ms)
  entry.cancelTimer = () => clear(timerId)
}

export const cancelCoalescedTask = (rawKey: string): void => {
  const key = rawKey || 'default'
  const entry = entries.get(key)
  if (!entry) return
  if (entry.cancelTimer) getStatsEntry(key).canceled += 1
  retireEntry(entry)
}

export const hasPendingCoalescedTask = (rawKey: string): boolean => {
  const entry = entries.get(rawKey || 'default')
  return !!entry && entry.owner === currentOwner() && entry.fn !== null
    && (entry.cancelTimer !== null || entry.microtaskPending)
}

export const getCoalescedSchedulerStats = (): Record<string, CoalescedStats> => {
  const out: Record<string, CoalescedStats> = {}
  stats.forEach((value, key) => {
    out[key] = { ...value }
  })
  return out
}

export const logCoalescedSchedulerStats = (label?: string): void => {
  if (typeof console === 'undefined') return
  const snapshot = getCoalescedSchedulerStats()
  const header = label && label.length > 0 ? `Coalesced scheduler stats (${label})` : 'Coalesced scheduler stats'
  console.log(header)
  console.table(
    Object.entries(snapshot).map(([key, value]) => ({
      key,
      scheduled: value.scheduled,
      executed: value.executed,
      canceled: value.canceled,
    })),
  )
}
