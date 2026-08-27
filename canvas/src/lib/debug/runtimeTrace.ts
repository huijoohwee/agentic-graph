import {
  isStoryboardWidgetQeTraceEnabled,
  pushStoryboardWidgetQeTrace,
  type StoryboardWidgetQeTraceEntry,
  type StoryboardWidgetQeTraceWindow,
} from '@/lib/storyboardWidget/storyboardWidgetQeTrace'

export const RUNTIME_TRACE_LS_KEY = 'kg:debug:runtimeTrace'
export const RUNTIME_TRACE_QUERY_PARAM_KEYS = [
  'kgRuntimeTrace',
  'kgDebugTrace',
] as const

export type RuntimeTraceEntry = StoryboardWidgetQeTraceEntry & {
  scope: string
}

export type RuntimeTraceWindow = StoryboardWidgetQeTraceWindow & {
  __AG_RUNTIME_TRACE__?: RuntimeTraceEntry[]
}

function isTruthyTraceToggle(raw: string | null | undefined): boolean {
  const value = String(raw || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

export function isRuntimeTraceEnabled(win: Window | null | undefined): win is RuntimeTraceWindow {
  if (!win) return false
  if (isStoryboardWidgetQeTraceEnabled(win)) return true
  try {
    const search = String(win.location?.search || '').trim()
    if (search) {
      const params = new URLSearchParams(search)
      for (let i = 0; i < RUNTIME_TRACE_QUERY_PARAM_KEYS.length; i += 1) {
        if (isTruthyTraceToggle(params.get(RUNTIME_TRACE_QUERY_PARAM_KEYS[i]))) return true
      }
    }
  } catch {
    void 0
  }
  try {
    return isTruthyTraceToggle(win.localStorage?.getItem(RUNTIME_TRACE_LS_KEY))
  } catch {
    return false
  }
}

export function pushRuntimeTrace(
  win: Window | null | undefined,
  entry: RuntimeTraceEntry,
  maxEntries = 300,
): void {
  if (!isRuntimeTraceEnabled(win)) return
  const target = win as RuntimeTraceWindow
  const nextEntry = {
    ...entry,
    ts: typeof entry.ts === 'number' ? entry.ts : Date.now(),
  }
  const buffer = Array.isArray(target.__AG_RUNTIME_TRACE__) ? target.__AG_RUNTIME_TRACE__ : []
  buffer.push(nextEntry)
  if (buffer.length > maxEntries) buffer.splice(0, buffer.length - maxEntries)
  target.__AG_RUNTIME_TRACE__ = buffer
  pushStoryboardWidgetQeTrace(target, nextEntry)
}

export function reportRuntimeTrace(entry: RuntimeTraceEntry): void {
  if (typeof window === 'undefined') return
  pushRuntimeTrace(window, entry)
}
