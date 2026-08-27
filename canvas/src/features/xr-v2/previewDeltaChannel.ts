export const PREVIEW_DELTA_SCHEMA = 'agenticgraph-xr-live-preview-delta/v1' as const
export const PREVIEW_DELTA_MAX_BUFFERED = 256
export const PREVIEW_DELTA_MAX_BYTES = 256 * 1_024
export const PREVIEW_DELTA_MAX_SUBSCRIBERS = 64

export type PreviewJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly PreviewJsonValue[]
  | Readonly<{ [key: string]: PreviewJsonValue }>

export type RevisionedPreviewDelta = Readonly<{
  schema: typeof PREVIEW_DELTA_SCHEMA
  streamId: string
  baseRevision: number
  revision: number
  payload: PreviewJsonValue
}>

export type PreviewDeltaChannelOptions = Readonly<{
  streamId: string
  initialRevision?: number
  maxBufferedDeltas?: number
  maxDeltaBytes?: number
  maxSubscribers?: number
}>

export type PreviewDeltaPublishResult = Readonly<{
  status: 'accepted' | 'stale' | 'out-of-order' | 'invalid' | 'too-large' | 'closed' | 'reentrant'
  currentRevision: number
  subscriberErrors: number
}>

export type PreviewDeltaSubscriptionResult =
  | Readonly<{ status: 'subscribed'; unsubscribe: () => void }>
  | Readonly<{ status: 'full' | 'closed' }>

export type PreviewDeltaChannel = Readonly<{
  publish(delta: RevisionedPreviewDelta): PreviewDeltaPublishResult
  subscribe(listener: (delta: RevisionedPreviewDelta) => void): PreviewDeltaSubscriptionResult
  snapshot(): Readonly<{ streamId: string; revision: number; deltas: readonly RevisionedPreviewDelta[] }>
  close(): void
}>

const SAFE_STREAM_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/

function positiveBound(value: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new TypeError(`${label} is outside the supported range`)
  return value
}

function clonePayload(payload: PreviewJsonValue): Readonly<{ value: PreviewJsonValue; bytes: number }> | null {
  try {
    const serialized = JSON.stringify(payload)
    if (typeof serialized !== 'string') return null
    const bytes = new TextEncoder().encode(serialized).byteLength
    const parsed = JSON.parse(serialized) as PreviewJsonValue
    return { value: parsed, bytes }
  } catch {
    return null
  }
}

function freezeJsonValue(value: PreviewJsonValue): PreviewJsonValue {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeJsonValue))
  if (value && typeof value === 'object') {
    const output: Record<string, PreviewJsonValue> = {}
    for (const key of Object.keys(value).sort()) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new TypeError('unsafe preview payload key')
      }
      output[key] = freezeJsonValue((value as Readonly<Record<string, PreviewJsonValue>>)[key])
    }
    return Object.freeze(output)
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('preview payload number must be finite')
  return value
}

/** In-memory, transport-neutral channel with bounded replay and strict revision admission. */
export function createPreviewDeltaChannel(options: PreviewDeltaChannelOptions): PreviewDeltaChannel {
  if (!SAFE_STREAM_ID.test(options.streamId)) throw new TypeError('invalid preview stream id')
  const initialRevision = options.initialRevision ?? 0
  if (!Number.isSafeInteger(initialRevision) || initialRevision < 0) throw new TypeError('invalid preview revision')
  const maxBufferedDeltas = positiveBound(options.maxBufferedDeltas ?? 32, PREVIEW_DELTA_MAX_BUFFERED, 'preview buffer')
  const maxDeltaBytes = positiveBound(options.maxDeltaBytes ?? 64 * 1_024, PREVIEW_DELTA_MAX_BYTES, 'preview delta bytes')
  const maxSubscribers = positiveBound(options.maxSubscribers ?? 16, PREVIEW_DELTA_MAX_SUBSCRIBERS, 'preview subscribers')

  let revision = initialRevision
  let closed = false
  let notifying = false
  const deltas: RevisionedPreviewDelta[] = []
  const listeners = new Set<(delta: RevisionedPreviewDelta) => void>()

  return Object.freeze({
    publish(delta): PreviewDeltaPublishResult {
      if (closed) return { status: 'closed', currentRevision: revision, subscriberErrors: 0 }
      if (notifying) return { status: 'reentrant', currentRevision: revision, subscriberErrors: 0 }
      if (!delta || delta.schema !== PREVIEW_DELTA_SCHEMA || delta.streamId !== options.streamId
        || !Number.isSafeInteger(delta.revision) || !Number.isSafeInteger(delta.baseRevision)
        || delta.revision < 1 || delta.baseRevision < 0) {
        return { status: 'invalid', currentRevision: revision, subscriberErrors: 0 }
      }
      if (delta.revision <= revision) {
        return { status: 'stale', currentRevision: revision, subscriberErrors: 0 }
      }
      if (delta.baseRevision !== revision || delta.revision !== revision + 1) {
        return { status: 'out-of-order', currentRevision: revision, subscriberErrors: 0 }
      }

      const cloned = clonePayload(delta.payload)
      if (!cloned) return { status: 'invalid', currentRevision: revision, subscriberErrors: 0 }
      if (cloned.bytes > maxDeltaBytes) return { status: 'too-large', currentRevision: revision, subscriberErrors: 0 }

      let payload: PreviewJsonValue
      try {
        payload = freezeJsonValue(cloned.value)
      } catch {
        return { status: 'invalid', currentRevision: revision, subscriberErrors: 0 }
      }
      const accepted = Object.freeze({
        schema: PREVIEW_DELTA_SCHEMA,
        streamId: options.streamId,
        baseRevision: delta.baseRevision,
        revision: delta.revision,
        payload,
      })
      revision = accepted.revision
      deltas.push(accepted)
      if (deltas.length > maxBufferedDeltas) deltas.shift()

      let subscriberErrors = 0
      notifying = true
      try {
        for (const listener of [...listeners]) {
          try {
            listener(accepted)
          } catch {
            subscriberErrors += 1
          }
        }
      } finally {
        notifying = false
      }
      return { status: 'accepted', currentRevision: revision, subscriberErrors }
    },
    subscribe(listener): PreviewDeltaSubscriptionResult {
      if (closed) return { status: 'closed' }
      if (listeners.size >= maxSubscribers) return { status: 'full' }
      listeners.add(listener)
      let subscribed = true
      return Object.freeze({
        status: 'subscribed',
        unsubscribe: () => {
          if (!subscribed) return
          subscribed = false
          listeners.delete(listener)
        },
      })
    },
    snapshot() {
      return Object.freeze({ streamId: options.streamId, revision, deltas: Object.freeze([...deltas]) })
    },
    close() {
      closed = true
      listeners.clear()
      deltas.length = 0
    },
  })
}
