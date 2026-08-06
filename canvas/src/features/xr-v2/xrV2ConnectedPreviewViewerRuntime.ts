export type XrV2ConnectedPreviewViewerEdit = Readonly<{
  entityRef: string
  visible: boolean
  sourceDigest: string
  graphDataRevision: number
  authoringEditRevision: number
  authorRenderedAtMs: number
}>

export type XrV2ConnectedPreviewRenderedState = Readonly<{
  entityRef: string
  visible: boolean
  sourceDigest: string
  graphDataRevision: number
  authoringEditRevision: number
  authorRenderedAtMs: number
  revision: number
  renderedAtMs: number
  attached: true
}>

export type XrV2ConnectedPreviewViewerSession = Readonly<{
  applyEdit(
    edit: XrV2ConnectedPreviewViewerEdit,
    revision: number,
    signal: AbortSignal,
  ): Promise<XrV2ConnectedPreviewRenderedState>
  snapshot(): XrV2ConnectedPreviewRenderedState | null
  dispose(): void
}>

type FrameHandle = number | ReturnType<typeof setTimeout>

type ViewerDependencies = Readonly<{
  requestFrame?: (callback: FrameRequestCallback) => FrameHandle
  cancelFrame?: (handle: FrameHandle) => void
  now?: () => number
}>

type PendingFrame = {
  handle: FrameHandle | null
  reject: (error: Error) => void
  signal: AbortSignal
  onAbort: () => void
}

const ENTITY_REF = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
const SOURCE_DIGEST = /^fnv1a32:[0-9a-f]{8}$/

function assertEdit(edit: XrV2ConnectedPreviewViewerEdit, revision: number): void {
  if (!edit || !ENTITY_REF.test(edit.entityRef) || !SOURCE_DIGEST.test(edit.sourceDigest)
    || typeof edit.visible !== 'boolean' || !Number.isSafeInteger(edit.graphDataRevision)
    || edit.graphDataRevision < 0 || !Number.isSafeInteger(edit.authoringEditRevision)
    || edit.authoringEditRevision < 1 || !Number.isFinite(edit.authorRenderedAtMs)
    || edit.authorRenderedAtMs < 0 || !Number.isSafeInteger(revision) || revision < 1) {
    throw new Error('Connected preview viewer rejected a malformed authored edit')
  }
}

function abortError(): DOMException {
  return new DOMException('Connected preview viewer render was cancelled', 'AbortError')
}

/**
 * Owns one attached viewer canvas. Transport acknowledgement is withheld until
 * the authored visibility change has been painted in a later browser frame.
 */
export function createXrV2ConnectedPreviewCanvasSession(
  canvas: HTMLCanvasElement,
  dependencies: ViewerDependencies = {},
): XrV2ConnectedPreviewViewerSession {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new Error('Connected preview requires its mounted viewer canvas')
  }
  const requestFrame = dependencies.requestFrame || (callback => {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      return globalThis.requestAnimationFrame(callback)
    }
    return setTimeout(() => callback(performance.now()), 0)
  })
  const cancelFrame = dependencies.cancelFrame || (handle => {
    if (typeof handle === 'number' && typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(handle)
    } else clearTimeout(handle as ReturnType<typeof setTimeout>)
  })
  const now = dependencies.now || (() => performance.now())
  let current: XrV2ConnectedPreviewRenderedState | null = null
  let disposed = false
  let pending: PendingFrame | null = null

  const dispose = () => {
    if (disposed) return
    disposed = true
    if (pending) {
      const active = pending
      pending = null
      if (active.handle !== null) cancelFrame(active.handle)
      active.signal.removeEventListener('abort', active.onAbort)
      active.reject(new Error('Connected preview viewer was disposed'))
    }
    current = null
    delete canvas.dataset.kgXrV2PreviewRevision
    delete canvas.dataset.kgXrV2PreviewVisible
  }

  return Object.freeze({
    applyEdit: (edit, revision, signal) => {
      assertEdit(edit, revision)
      if (disposed) return Promise.reject(new Error('Connected preview viewer is disposed'))
      if (signal.aborted) return Promise.reject(abortError())
      if (pending) return Promise.reject(new Error('Connected preview viewer already has an edit in flight'))
      return new Promise<XrV2ConnectedPreviewRenderedState>((resolve, reject) => {
        const active: PendingFrame = {
          handle: null,
          reject,
          signal,
          onAbort: () => undefined,
        }
        const onAbort = () => {
          if (pending !== active) return
          pending = null
          if (active.handle !== null) cancelFrame(active.handle)
          signal.removeEventListener('abort', onAbort)
          reject(abortError())
        }
        active.onAbort = onAbort
        pending = active
        signal.addEventListener('abort', onAbort, { once: true })
        try {
          active.handle = requestFrame(() => {
            if (pending !== active) return
            pending = null
            signal.removeEventListener('abort', onAbort)
            if (disposed || signal.aborted) {
              reject(abortError())
              return
            }
            if (!canvas.isConnected) {
              reject(new Error('Connected preview viewer canvas detached before render'))
              return
            }
            const context = canvas.getContext('2d', { alpha: false })
            if (!context) {
              reject(new Error('Connected preview viewer could not acquire a render context'))
              return
            }
            canvas.width = Math.max(96, canvas.width || 0)
            canvas.height = Math.max(64, canvas.height || 0)
            context.fillStyle = '#09111f'
            context.fillRect(0, 0, canvas.width, canvas.height)
            if (edit.visible) {
              context.fillStyle = '#38bdf8'
              context.fillRect(20, 14, canvas.width - 40, canvas.height - 28)
            }
            canvas.dataset.kgXrV2PreviewRevision = String(revision)
            canvas.dataset.kgXrV2PreviewVisible = String(edit.visible)
            current = Object.freeze({ ...edit, revision, renderedAtMs: now(), attached: true as const })
            resolve(current)
          })
        } catch (error) {
          if (pending === active) pending = null
          signal.removeEventListener('abort', onAbort)
          reject(error instanceof Error ? error : new Error('Connected preview viewer could not schedule a render'))
        }
      })
    },
    snapshot: () => current,
    dispose,
  })
}
