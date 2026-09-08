import { cancelStorageStream } from '@/lib/storage/agentic-graph-storage-client-transport'
import type { XrV2CrossDeviceAssetConfig } from './xrV2CrossDeviceAssetManifest'

export type XrV2CrossDeviceAssetErrorCode =
  | 'cancelled'
  | 'deadline-exceeded'
  | 'identity-conflict'
  | 'integrity-failed'
  | 'not-found'
  | 'catalog-bound-exceeded'
  | 'local-import-failed'

export class XrV2CrossDeviceAssetError extends Error {
  readonly code: XrV2CrossDeviceAssetErrorCode
  readonly causeValue: unknown

  constructor(code: XrV2CrossDeviceAssetErrorCode, message: string, causeValue?: unknown) {
    super(message)
    this.name = 'XrV2CrossDeviceAssetError'
    this.code = code
    this.causeValue = causeValue
  }
}

export type LifecycleInput = Readonly<{
  signal?: AbortSignal
  deadlineAtMs?: number
  timeoutMs?: number
}>

type Lifecycle = Readonly<{ signal: AbortSignal; dispose(): void; kind(): 'active' | 'cancelled' | 'deadline' }>

function lifecycle(config: XrV2CrossDeviceAssetConfig, input: LifecycleInput): Lifecycle {
  const controller = new AbortController()
  let state: 'active' | 'cancelled' | 'deadline' = 'active'
  const timeoutMs = input.timeoutMs ?? config.operationTimeoutMs
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs! < 100 || timeoutMs! > 60_000) {
    throw new Error('cross-device operation timeout is outside the admitted bound')
  }
  const remaining = input.deadlineAtMs == null ? timeoutMs! : Math.min(timeoutMs!, input.deadlineAtMs - Date.now())
  if (!Number.isFinite(remaining) || remaining <= 0) {
    throw new XrV2CrossDeviceAssetError('deadline-exceeded', 'XR cross-device operation deadline elapsed')
  }
  const cancel = () => {
    if (state !== 'active') return
    state = 'cancelled'; controller.abort(input.signal?.reason)
  }
  if (input.signal?.aborted) cancel()
  else input.signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => {
    if (state !== 'active') return
    state = 'deadline'
    controller.abort(new DOMException('XR cross-device operation deadline elapsed', 'TimeoutError'))
  }, remaining)
  return Object.freeze({
    signal: controller.signal,
    kind: () => state,
    dispose: () => { clearTimeout(timer); input.signal?.removeEventListener('abort', cancel) },
  })
}

export async function runLifecycle<T>(
  config: XrV2CrossDeviceAssetConfig,
  input: LifecycleInput,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const active = lifecycle(config, input)
  let onAbort: (() => void) | undefined
  try {
    if (active.kind() === 'cancelled') throw new XrV2CrossDeviceAssetError('cancelled', 'XR cross-device operation was cancelled')
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(active.signal.reason)
      active.signal.addEventListener('abort', onAbort, { once: true })
    })
    const result = await Promise.race([operation(active.signal), aborted])
    active.signal.throwIfAborted()
    return result
  } catch (error) {
    if (active.kind() === 'deadline') {
      throw new XrV2CrossDeviceAssetError('deadline-exceeded', 'XR cross-device operation deadline elapsed', error)
    }
    if (active.kind() === 'cancelled' || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new XrV2CrossDeviceAssetError('cancelled', 'XR cross-device operation was cancelled', error)
    }
    throw error
  } finally {
    if (onAbort) active.signal.removeEventListener('abort', onAbort)
    active.dispose()
  }
}

export function lifecycleFetch(fetchImpl: typeof fetch, signal: AbortSignal): typeof fetch {
  return (input, init) => {
    const requestSignal = init?.signal ?? (input instanceof Request ? input.signal : null)
    const combined = requestSignal && requestSignal !== signal
      ? AbortSignal.any([signal, requestSignal]) : signal
    combined.throwIfAborted()
    return fetchImpl(input, { ...init, signal: combined }).then(response => {
      if (combined.aborted) {
        cancelStorageStream(response.body, 'XR fetch completed after its request ended')
        combined.throwIfAborted()
      }
      return response
    })
  }
}
