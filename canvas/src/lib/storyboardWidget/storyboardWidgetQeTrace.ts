export const STORYBOARD_WIDGET_QE_TRACE_LS_KEY = 'kg:debug:storyboardWidgetTrace'
export const STORYBOARD_WIDGET_QE_TRACE_QUERY_PARAM_KEYS = [
  'kgStoryboardWidgetTrace',
  'kgStoryboardWidgetTrace',
  'kgStoryboardWidgetEdgeTrace',
  'kgStoryboardWidgetEdgeHarness',
] as const

export type StoryboardWidgetQeTraceEntry = Record<string, unknown>

export type StoryboardWidgetQeTraceWindow = Window & {
  localStorage?: Storage
  __AG_STORYBOARD_WIDGET_QE_TRACE__?: StoryboardWidgetQeTraceEntry[]
  __AG_STORYBOARD_WIDGET_EDGE_HARNESS__?: Record<string, unknown> | null
}

function isTruthyTraceToggle(raw: string | null | undefined): boolean {
  const value = String(raw || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

export function isStoryboardWidgetQeTraceEnabled(win: Window | null | undefined): win is StoryboardWidgetQeTraceWindow {
  if (!win) return false
  try {
    const search = String(win.location?.search || '').trim()
    if (search) {
      const params = new URLSearchParams(search)
      for (let i = 0; i < STORYBOARD_WIDGET_QE_TRACE_QUERY_PARAM_KEYS.length; i += 1) {
        if (isTruthyTraceToggle(params.get(STORYBOARD_WIDGET_QE_TRACE_QUERY_PARAM_KEYS[i]))) return true
      }
    }
  } catch {
    void 0
  }
  try {
    return Boolean(win.localStorage && win.localStorage.getItem(STORYBOARD_WIDGET_QE_TRACE_LS_KEY) === '1')
  } catch {
    return false
  }
}

export function pushStoryboardWidgetQeTrace(
  win: Window | null | undefined,
  entry: StoryboardWidgetQeTraceEntry,
  maxEntries = 300,
): void {
  if (!isStoryboardWidgetQeTraceEnabled(win)) return
  const target = win as StoryboardWidgetQeTraceWindow
  const buf = Array.isArray(target.__AG_STORYBOARD_WIDGET_QE_TRACE__) ? target.__AG_STORYBOARD_WIDGET_QE_TRACE__ : []
  buf.push({
    ts: typeof entry.ts === 'number' ? entry.ts : Date.now(),
    ...entry,
  })
  if (buf.length > maxEntries) buf.splice(0, buf.length - maxEntries)
  target.__AG_STORYBOARD_WIDGET_QE_TRACE__ = buf
}
