type ProbeEvent = {
  t: number
  name: string
  data?: Record<string, unknown>
}

const getProbeState = (): { enabled: boolean; events: ProbeEvent[] } => {
  const g = globalThis as unknown as Record<string, unknown>
  const existing = g.__AG_MD_PROBE as { enabled?: boolean; events?: ProbeEvent[] } | undefined
  const enabled = (() => {
    if (existing && typeof existing.enabled === 'boolean') return existing.enabled
    try {
      const ls = (globalThis as unknown as { localStorage?: Storage }).localStorage
      return ls?.getItem('kg:md:probe') === '1'
    } catch {
      return false
    }
  })()
  const events = (existing?.events && Array.isArray(existing.events)) ? existing.events : []
  const next = { enabled, events }
  g.__AG_MD_PROBE = next
  return next
}

export const isMarkdownRuntimeProbeEnabled = (): boolean => getProbeState().enabled

export const recordMarkdownRuntimeProbe = (name: string, data?: Record<string, unknown>): void => {
  const state = getProbeState()
  if (!state.enabled) return
  const now = (() => {
    const p = (globalThis as unknown as { performance?: Performance }).performance
    return typeof p?.now === 'function' ? p.now() : Date.now()
  })()
  state.events.push({ t: now, name, data })
  if (state.events.length > 250) state.events.splice(0, state.events.length - 250)
}

export const resetMarkdownRuntimeProbe = (): void => {
  const state = getProbeState()
  state.events.splice(0, state.events.length)
}

export const dumpMarkdownRuntimeProbe = (): string => {
  const g = globalThis as unknown as Record<string, unknown>
  const state = g.__AG_MD_PROBE as { events?: ProbeEvent[] } | undefined
  const events = Array.isArray(state?.events) ? state!.events! : []
  return events
    .slice(Math.max(0, events.length - 80))
    .map(e => `${Math.round(e.t)} ${e.name} ${e.data ? JSON.stringify(e.data) : ''}`.trim())
    .join('\n')
}

const g = globalThis as unknown as Record<string, unknown>
if (!g.__AG_MD_PROBE_API__) {
  g.__AG_MD_PROBE_API__ = {
    dump: dumpMarkdownRuntimeProbe,
    reset: resetMarkdownRuntimeProbe,
  }
}
