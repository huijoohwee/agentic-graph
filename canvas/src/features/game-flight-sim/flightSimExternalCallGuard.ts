import {
  CHAT_DURABLE_STREAM_ATTACH,
  CHAT_DURABLE_STREAM_START,
} from '@/features/chat/floatingPanelChat/floatingPanelChatDurableStream'
import {
  captureFlightSimMission,
  type FlightSimMission,
} from './flightSimMission'

type FlightSimFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

type FlightSimSendBeacon = Navigator['sendBeacon']

type FlightSimNetworkHost = {
  EventSource?: typeof EventSource
  ServiceWorker?: typeof ServiceWorker
  WebSocket?: typeof WebSocket
  XMLHttpRequest?: typeof XMLHttpRequest
  fetch: FlightSimFetch
  location?: {
    origin: string
  }
  navigator?: {
    sendBeacon?: FlightSimSendBeacon
  }
}

type InstalledGameplayNetworkFence = Readonly<{
  guardedEventSource: typeof EventSource | null
  guardedFetch: FlightSimFetch
  guardedSendBeacon: FlightSimSendBeacon | null
  guardedServiceWorkerPostMessage: ServiceWorker['postMessage'] | null
  guardedWebSocket: typeof WebSocket | null
  guardedXmlHttpRequestOpen: XMLHttpRequest['open'] | null
  host: FlightSimNetworkHost
  originalEventSource: typeof EventSource | null
  originalFetch: FlightSimFetch
  originalSendBeacon: FlightSimSendBeacon | null
  originalServiceWorkerPostMessage: ServiceWorker['postMessage'] | null
  originalWebSocket: typeof WebSocket | null
  originalXmlHttpRequestOpen: XMLHttpRequest['open'] | null
  serviceWorkerPrototype: ServiceWorker | null
  xmlHttpRequestPrototype: XMLHttpRequest | null
}>

let installedGameplayNetworkFence: InstalledGameplayNetworkFence | null = null

const FLIGHT_SIM_LOCAL_RUNTIME_ASSET_PATHS = new Set([
  '/litert/litert_wasm_compat_internal.js',
  '/litert/litert_wasm_compat_internal.wasm',
  '/litert/litert_wasm_internal.js',
  '/litert/litert_wasm_internal.wasm',
  '/litert/litert_wasm_jspi_internal.js',
  '/litert/litert_wasm_jspi_internal.wasm',
  '/litert/litert_wasm_threaded_internal.js',
  '/litert/litert_wasm_threaded_internal.wasm',
  '/litert/pose_landmarks_detector.tflite',
])

export class FlightSimExternalCallBlockedError extends Error {
  readonly code = 'FLIGHT_SIM_GAMEPLAY_NETWORK_BLOCKED'
  readonly operation: string
  readonly synchronous = true

  constructor(operation: string) {
    super(`Flight Sim blocked gameplay network operation: ${operation}`)
    this.name = 'FlightSimExternalCallBlockedError'
    this.operation = operation
  }
}

export function blockFlightSimGameplayNetworkAttempt(
  mission: FlightSimMission,
  operation: string,
  _executor: () => unknown,
): never {
  if (!operation || operation.trim() !== operation) {
    throw new Error('Flight Sim gameplay network operation must be a non-empty trimmed string')
  }
  captureFlightSimMission(mission)
  throw new FlightSimExternalCallBlockedError(operation)
}

function describeFetchOperation(
  input: RequestInfo | URL,
  init?: RequestInit,
): string {
  const requestMethod = (
    init?.method
    || (
      typeof Request !== 'undefined'
      && input instanceof Request
        ? input.method
        : 'GET'
    )
  ).toUpperCase()
  const requestUrl = (
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
  )
  return `fetch:${requestMethod}:${requestUrl}`
}

function describeXmlHttpRequestOperation(
  method: string,
  url: string | URL,
): string {
  return `xhr:${String(method).toUpperCase()}:${String(url)}`
}

function requestMethod(
  input: RequestInfo | URL,
  init?: RequestInit,
): string {
  return (
    init?.method
    || (
      typeof Request !== 'undefined'
      && input instanceof Request
        ? input.method
        : 'GET'
    )
  ).toUpperCase()
}

function requestUrl(input: RequestInfo | URL): string {
  return (
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
  )
}

function isAllowedLocalRuntimeAssetRequest(
  method: string,
  url: string | URL,
  hostOrigin: string | undefined,
): boolean {
  const normalizedMethod = method.toUpperCase()
  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') return false
  if (!hostOrigin) return false

  try {
    const normalizedHostOrigin = new URL(hostOrigin).origin
    const resolved = new URL(String(url), normalizedHostOrigin)
    return resolved.origin === normalizedHostOrigin
      && resolved.username === ''
      && resolved.password === ''
      && FLIGHT_SIM_LOCAL_RUNTIME_ASSET_PATHS.has(resolved.pathname)
  } catch {
    return false
  }
}

function blockedDurableChatStreamMessageType(message: unknown): string | null {
  if (!message || typeof message !== 'object') return null
  const type = Reflect.get(message, 'type')
  return type === CHAT_DURABLE_STREAM_START
    || type === CHAT_DURABLE_STREAM_ATTACH
    ? type
    : null
}

function reportBlockedOperation(
  reportBlocked: (operation: string) => unknown,
  operation: string,
): FlightSimExternalCallBlockedError {
  reportBlocked(operation)
  return new FlightSimExternalCallBlockedError(operation)
}

function guardedConstructor<T extends typeof EventSource | typeof WebSocket>(
  originalConstructor: T,
  operationPrefix: 'eventsource' | 'websocket',
  reportBlocked: (operation: string) => unknown,
): T {
  return new Proxy(originalConstructor, {
    construct(_target, argumentsList) {
      const operation = `${operationPrefix}:${String(argumentsList[0])}`
      throw reportBlockedOperation(reportBlocked, operation)
    },
  }) as T
}

function restoreInstalledNetworkFence(
  installed: InstalledGameplayNetworkFence,
): void {
  const restorationFailures: string[] = []
  const restore = (surface: string, action: () => void): void => {
    try {
      action()
    } catch (error) {
      restorationFailures.push(
        `${surface}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  if (
    installed.guardedServiceWorkerPostMessage
    && installed.originalServiceWorkerPostMessage
    && installed.serviceWorkerPrototype?.postMessage
      === installed.guardedServiceWorkerPostMessage
  ) {
    restore('ServiceWorker.postMessage', () => {
      installed.serviceWorkerPrototype!.postMessage
        = installed.originalServiceWorkerPostMessage!
    })
  }
  if (
    installed.guardedSendBeacon
    && installed.originalSendBeacon
    && installed.host.navigator?.sendBeacon === installed.guardedSendBeacon
  ) {
    restore('navigator.sendBeacon', () => {
      installed.host.navigator!.sendBeacon = installed.originalSendBeacon!
    })
  }
  if (
    installed.guardedEventSource
    && installed.originalEventSource
    && installed.host.EventSource === installed.guardedEventSource
  ) {
    restore('EventSource', () => {
      installed.host.EventSource = installed.originalEventSource!
    })
  }
  if (
    installed.guardedWebSocket
    && installed.originalWebSocket
    && installed.host.WebSocket === installed.guardedWebSocket
  ) {
    restore('WebSocket', () => {
      installed.host.WebSocket = installed.originalWebSocket!
    })
  }
  if (
    installed.guardedXmlHttpRequestOpen
    && installed.originalXmlHttpRequestOpen
    && installed.xmlHttpRequestPrototype?.open
      === installed.guardedXmlHttpRequestOpen
  ) {
    restore('XMLHttpRequest.open', () => {
      installed.xmlHttpRequestPrototype!.open
        = installed.originalXmlHttpRequestOpen!
    })
  }
  if (installed.host.fetch === installed.guardedFetch) {
    restore('fetch', () => {
      installed.host.fetch = installed.originalFetch
    })
  }

  if (restorationFailures.length > 0) {
    throw new Error(
      `Flight Sim gameplay network fence restoration failed: ${
        restorationFailures.join('; ')
      }`,
    )
  }
}

export function uninstallFlightSimGameplayNetworkFence(): void {
  const installed = installedGameplayNetworkFence
  if (!installed) return
  restoreInstalledNetworkFence(installed)
  if (installedGameplayNetworkFence === installed) {
    installedGameplayNetworkFence = null
  }
}

export function installFlightSimGameplayNetworkFence(
  reportBlocked: (operation: string) => unknown,
  host: FlightSimNetworkHost = globalThis,
): void {
  if (typeof reportBlocked !== 'function') {
    throw new Error('Flight Sim gameplay network fence requires a blocked-request reporter')
  }
  if (!host || typeof host.fetch !== 'function') {
    throw new Error('Flight Sim gameplay network fence requires a fetch-capable host')
  }
  uninstallFlightSimGameplayNetworkFence()
  const originalFetch = host.fetch
  const originalXmlHttpRequest = host.XMLHttpRequest ?? null
  const xmlHttpRequestPrototype = originalXmlHttpRequest?.prototype ?? null
  const originalXmlHttpRequestOpen = xmlHttpRequestPrototype?.open ?? null
  if (
    originalXmlHttpRequest !== null
    && typeof originalXmlHttpRequestOpen !== 'function'
  ) {
    throw new Error(
      'Flight Sim gameplay network fence requires XMLHttpRequest.open when XMLHttpRequest is present',
    )
  }
  const originalWebSocket = host.WebSocket ?? null
  if (originalWebSocket !== null && typeof originalWebSocket !== 'function') {
    throw new Error(
      'Flight Sim gameplay network fence requires a constructable WebSocket when WebSocket is present',
    )
  }
  const originalEventSource = host.EventSource ?? null
  if (originalEventSource !== null && typeof originalEventSource !== 'function') {
    throw new Error(
      'Flight Sim gameplay network fence requires a constructable EventSource when EventSource is present',
    )
  }
  const originalSendBeacon = host.navigator?.sendBeacon ?? null
  if (originalSendBeacon !== null && typeof originalSendBeacon !== 'function') {
    throw new Error(
      'Flight Sim gameplay network fence requires a callable navigator.sendBeacon when sendBeacon is present',
    )
  }
  const originalServiceWorker = host.ServiceWorker ?? null
  if (originalServiceWorker !== null && typeof originalServiceWorker !== 'function') {
    throw new Error(
      'Flight Sim gameplay network fence requires a constructable ServiceWorker when ServiceWorker is present',
    )
  }
  const serviceWorkerPrototype = originalServiceWorker?.prototype ?? null
  const originalServiceWorkerPostMessage =
    serviceWorkerPrototype?.postMessage ?? null
  if (
    originalServiceWorker !== null
    && typeof originalServiceWorkerPostMessage !== 'function'
  ) {
    throw new Error(
      'Flight Sim gameplay network fence requires ServiceWorker.postMessage when ServiceWorker is present',
    )
  }

  const guardedFetch: FlightSimFetch = (input, init) => {
    const operation = describeFetchOperation(input, init)
    if (
      isAllowedLocalRuntimeAssetRequest(
        requestMethod(input, init),
        requestUrl(input),
        host.location?.origin,
      )
    ) {
      return Reflect.apply(originalFetch, host, [input, init])
    }
    try {
      return Promise.reject(reportBlockedOperation(reportBlocked, operation))
    } catch (error) {
      return Promise.reject(error)
    }
  }
  const guardedXmlHttpRequestOpen = originalXmlHttpRequestOpen
    ? function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
    ): void {
      if (
        isAllowedLocalRuntimeAssetRequest(
          method,
          url,
          host.location?.origin,
        )
      ) {
        Reflect.apply(originalXmlHttpRequestOpen, this, arguments)
        return
      }
      throw reportBlockedOperation(
        reportBlocked,
        describeXmlHttpRequestOperation(method, url),
      )
    } as XMLHttpRequest['open']
    : null
  const guardedWebSocket = originalWebSocket
    ? guardedConstructor(originalWebSocket, 'websocket', reportBlocked)
    : null
  const guardedEventSource = originalEventSource
    ? guardedConstructor(originalEventSource, 'eventsource', reportBlocked)
    : null
  const guardedSendBeacon: FlightSimSendBeacon | null = originalSendBeacon
    ? function (url: string | URL): never {
      throw reportBlockedOperation(
        reportBlocked,
        `sendBeacon:${String(url)}`,
      )
    }
    : null
  const guardedServiceWorkerPostMessage = originalServiceWorkerPostMessage
    ? function (
      this: ServiceWorker,
      ...messageArguments: unknown[]
    ): void {
      const blockedType = blockedDurableChatStreamMessageType(
        messageArguments[0],
      )
      if (blockedType) {
        throw reportBlockedOperation(
          reportBlocked,
          `service-worker-message:${blockedType}`,
        )
      }
      Reflect.apply(
        originalServiceWorkerPostMessage,
        this,
        messageArguments,
      )
    } as ServiceWorker['postMessage']
    : null
  const candidateFence: InstalledGameplayNetworkFence = Object.freeze({
    guardedEventSource,
    guardedFetch,
    guardedSendBeacon,
    guardedServiceWorkerPostMessage,
    guardedWebSocket,
    guardedXmlHttpRequestOpen,
    host,
    originalEventSource,
    originalFetch,
    originalSendBeacon,
    originalServiceWorkerPostMessage,
    originalWebSocket,
    originalXmlHttpRequestOpen,
    serviceWorkerPrototype,
    xmlHttpRequestPrototype,
  })

  try {
    host.fetch = guardedFetch
    if (guardedXmlHttpRequestOpen && xmlHttpRequestPrototype) {
      xmlHttpRequestPrototype.open = guardedXmlHttpRequestOpen
    }
    if (guardedWebSocket) host.WebSocket = guardedWebSocket
    if (guardedEventSource) host.EventSource = guardedEventSource
    if (guardedServiceWorkerPostMessage && serviceWorkerPrototype) {
      serviceWorkerPrototype.postMessage = guardedServiceWorkerPostMessage
    }
    if (guardedSendBeacon && host.navigator) {
      host.navigator.sendBeacon = guardedSendBeacon
    }
    installedGameplayNetworkFence = candidateFence
  } catch (error) {
    try {
      restoreInstalledNetworkFence(candidateFence)
    } catch (rollbackError) {
      installedGameplayNetworkFence = candidateFence
      throw new Error(
        `Flight Sim gameplay network fence installation failed: ${
          error instanceof Error ? error.message : String(error)
        }; rollback failed: ${
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError)
        }`,
      )
    }
    throw error
  }
}
