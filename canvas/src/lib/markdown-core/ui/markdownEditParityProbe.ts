export const MARKDOWN_EDIT_PARITY_PROBE_EVENT = 'kg-edit-parity-probe' as const
export const MARKDOWN_EDIT_PARITY_PROBE_JSON_LOG_PREFIX = 'kg-edit-parity-probe-json' as const

export type MarkdownEditParityProbeMismatch = {
  key: string
  read: string
  edit: string
}

export type MarkdownEditParityProbePayload = {
  startLine: number
  endLine: number
  mismatches: MarkdownEditParityProbeMismatch[]
}

type MarkdownEditParityProbeWindow = Window & {
  __AG_EDIT_PARITY_LAST_MISMATCH__?: unknown
  __AG_EDIT_PARITY_LAST_PAYLOAD__?: unknown
  __AG_EDIT_PARITY_MISMATCH_COUNT__?: number
}

export function reportMarkdownEditParityProbe(payload: MarkdownEditParityProbePayload): void {
  if (typeof window === 'undefined') return
  try {
    const w = window as MarkdownEditParityProbeWindow
    w.__AG_EDIT_PARITY_LAST_PAYLOAD__ = payload
    if (payload.mismatches.length > 0) {
      w.__AG_EDIT_PARITY_LAST_MISMATCH__ = payload
      w.__AG_EDIT_PARITY_MISMATCH_COUNT__ = Number(w.__AG_EDIT_PARITY_MISMATCH_COUNT__ || 0) + 1
    }
    const CustomEventCtor = typeof window.CustomEvent === 'function' ? window.CustomEvent : CustomEvent
    window.dispatchEvent(new CustomEventCtor(MARKDOWN_EDIT_PARITY_PROBE_EVENT, { detail: payload }))
    if (payload.mismatches.length > 0) console.warn(MARKDOWN_EDIT_PARITY_PROBE_EVENT, payload)
    console.warn(`${MARKDOWN_EDIT_PARITY_PROBE_JSON_LOG_PREFIX} ${JSON.stringify(payload)}`)
  } catch {
    void 0
  }
}
