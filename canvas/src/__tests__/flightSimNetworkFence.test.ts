import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FlightSimExternalCallBlockedError,
  installFlightSimGameplayNetworkFence,
  uninstallFlightSimGameplayNetworkFence,
} from '../features/game-flight-sim/flightSimExternalCallGuard'

type FlightSimNetworkFenceHost = NonNullable<
  Parameters<typeof installFlightSimGameplayNetworkFence>[1]
>

function assertBlockedOperation(expectedOperation: string) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof FlightSimExternalCallBlockedError)
    assert.equal(error.code, 'FLIGHT_SIM_GAMEPLAY_NETWORK_BLOCKED')
    assert.equal(error.synchronous, true)
    assert.equal(error.operation, expectedOperation)
    return true
  }
}

function createNetworkHost(transportOperations: string[]) {
  const originalFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    transportOperations.push(
      `fetch:${String(init?.method ?? 'GET').toUpperCase()}:${String(input)}`,
    )
    return {} as Response
  }
  class TestXmlHttpRequest {
    open(method: string, url: string | URL): void {
      transportOperations.push(
        `xhr:${String(method).toUpperCase()}:${String(url)}`,
      )
    }
  }
  class TestWebSocket {
    constructor(url: string | URL) {
      transportOperations.push(`websocket:${String(url)}`)
    }
  }
  class TestEventSource {
    constructor(url: string | URL) {
      transportOperations.push(`eventsource:${String(url)}`)
    }
  }
  class TestServiceWorker {
    postMessage(message: unknown): void {
      const type = message && typeof message === 'object'
        ? Reflect.get(message, 'type')
        : 'unknown'
      transportOperations.push(`service-worker-message:${String(type)}`)
    }
  }
  const originalSendBeacon = (url: string | URL): boolean => {
    transportOperations.push(`sendBeacon:${String(url)}`)
    return true
  }
  const host = {
    EventSource: TestEventSource,
    ServiceWorker: TestServiceWorker,
    WebSocket: TestWebSocket,
    XMLHttpRequest: TestXmlHttpRequest,
    fetch: originalFetch,
    location: { origin: 'http://127.0.0.1:5173' },
    navigator: { sendBeacon: originalSendBeacon },
  } as unknown as FlightSimNetworkFenceHost

  return {
    host,
    originals: {
      EventSource: host.EventSource!,
      ServiceWorker: host.ServiceWorker!,
      WebSocket: host.WebSocket!,
      XMLHttpRequest: host.XMLHttpRequest!,
      fetch: originalFetch,
      sendBeacon: originalSendBeacon,
      serviceWorkerPostMessage: host.ServiceWorker!.prototype.postMessage,
      xmlHttpRequestOpen: host.XMLHttpRequest!.prototype.open,
    },
  }
}

test('installed gameplay network fence blocks every browser transport surface', async (t) => {
  const transportOperations: string[] = []
  const blockedOperations: string[] = []
  const { host, originals } = createNetworkHost(transportOperations)
  t.after(uninstallFlightSimGameplayNetworkFence)

  installFlightSimGameplayNetworkFence(
    operation => blockedOperations.push(operation),
    host,
  )

  await assert.rejects(
    host.fetch('https://airvio.co/api/storage/push', { method: 'POST' }),
    assertBlockedOperation('fetch:POST:https://airvio.co/api/storage/push'),
  )
  const request = new host.XMLHttpRequest!()
  assert.throws(
    () => request.open('patch', '/api/storage/flight'),
    assertBlockedOperation('xhr:PATCH:/api/storage/flight'),
  )
  assert.throws(
    () => new host.WebSocket!('wss://airvio.co/flight'),
    assertBlockedOperation('websocket:wss://airvio.co/flight'),
  )
  assert.throws(
    () => new host.EventSource!('/api/storage/flight/events'),
    assertBlockedOperation('eventsource:/api/storage/flight/events'),
  )
  assert.throws(
    () => host.navigator!.sendBeacon!('/api/storage/flight/telemetry'),
    assertBlockedOperation('sendBeacon:/api/storage/flight/telemetry'),
  )
  const serviceWorker = new host.ServiceWorker!()
  assert.throws(
    () => serviceWorker.postMessage({ type: 'KG_CHAT_STREAM_START' }),
    assertBlockedOperation('service-worker-message:KG_CHAT_STREAM_START'),
  )
  assert.throws(
    () => serviceWorker.postMessage({ type: 'KG_CHAT_STREAM_ATTACH' }),
    assertBlockedOperation('service-worker-message:KG_CHAT_STREAM_ATTACH'),
  )
  serviceWorker.postMessage({ type: 'KG_CHAT_STREAM_ABORT' })
  assert.deepEqual(blockedOperations, [
    'fetch:POST:https://airvio.co/api/storage/push',
    'xhr:PATCH:/api/storage/flight',
    'websocket:wss://airvio.co/flight',
    'eventsource:/api/storage/flight/events',
    'sendBeacon:/api/storage/flight/telemetry',
    'service-worker-message:KG_CHAT_STREAM_START',
    'service-worker-message:KG_CHAT_STREAM_ATTACH',
  ])
  assert.deepEqual(transportOperations, [
    'service-worker-message:KG_CHAT_STREAM_ABORT',
  ])

  uninstallFlightSimGameplayNetworkFence()
  assert.equal(host.fetch, originals.fetch)
  assert.equal(host.XMLHttpRequest, originals.XMLHttpRequest)
  assert.equal(
    host.XMLHttpRequest!.prototype.open,
    originals.xmlHttpRequestOpen,
  )
  assert.equal(host.WebSocket, originals.WebSocket)
  assert.equal(host.EventSource, originals.EventSource)
  assert.equal(host.ServiceWorker, originals.ServiceWorker)
  assert.equal(
    host.ServiceWorker!.prototype.postMessage,
    originals.serviceWorkerPostMessage,
  )
  assert.equal(host.navigator!.sendBeacon, originals.sendBeacon)

  await host.fetch('https://example.invalid/local-test')
  new host.XMLHttpRequest!().open('GET', '/local-xhr')
  new host.WebSocket!('ws://localhost/local-socket')
  new host.EventSource!('/local-events')
  new host.ServiceWorker!().postMessage({ type: 'KG_CHAT_STREAM_START' })
  host.navigator!.sendBeacon!('/local-beacon')
  assert.deepEqual(transportOperations, [
    'service-worker-message:KG_CHAT_STREAM_ABORT',
    'fetch:GET:https://example.invalid/local-test',
    'xhr:GET:/local-xhr',
    'websocket:ws://localhost/local-socket',
    'eventsource:/local-events',
    'service-worker-message:KG_CHAT_STREAM_START',
    'sendBeacon:/local-beacon',
  ])
})

test('gameplay network fence admits only exact same-origin local Motion Control assets', async (t) => {
  const transportOperations: string[] = []
  const blockedOperations: string[] = []
  const { host } = createNetworkHost(transportOperations)
  t.after(uninstallFlightSimGameplayNetworkFence)

  installFlightSimGameplayNetworkFence(
    operation => blockedOperations.push(operation),
    host,
  )

  await host.fetch(
    '/litert/litert_wasm_jspi_internal.wasm?revision=checked-in',
  )
  await host.fetch(
    new URL(
      'http://127.0.0.1:5173/litert/pose_landmarks_detector.tflite',
    ),
    { method: 'HEAD' },
  )
  new host.XMLHttpRequest!().open(
    'GET',
    '/litert/litert_wasm_threaded_internal.wasm',
  )

  await assert.rejects(
    host.fetch(
      'https://example.invalid/litert/litert_wasm_jspi_internal.wasm',
    ),
    assertBlockedOperation(
      'fetch:GET:https://example.invalid/litert/litert_wasm_jspi_internal.wasm',
    ),
  )
  await assert.rejects(
    host.fetch('/litert/litert_wasm_jspi_internal.wasm', { method: 'POST' }),
    assertBlockedOperation(
      'fetch:POST:/litert/litert_wasm_jspi_internal.wasm',
    ),
  )
  await assert.rejects(
    host.fetch('/litert/untracked-runtime.wasm'),
    assertBlockedOperation('fetch:GET:/litert/untracked-runtime.wasm'),
  )
  const request = new host.XMLHttpRequest!()
  assert.throws(
    () => request.open('GET', '/api/litert/pose_landmarks_detector.tflite'),
    assertBlockedOperation(
      'xhr:GET:/api/litert/pose_landmarks_detector.tflite',
    ),
  )

  assert.deepEqual(transportOperations, [
    'fetch:GET:/litert/litert_wasm_jspi_internal.wasm?revision=checked-in',
    'fetch:HEAD:http://127.0.0.1:5173/litert/pose_landmarks_detector.tflite',
    'xhr:GET:/litert/litert_wasm_threaded_internal.wasm',
  ])
  assert.deepEqual(blockedOperations, [
    'fetch:GET:https://example.invalid/litert/litert_wasm_jspi_internal.wasm',
    'fetch:POST:/litert/litert_wasm_jspi_internal.wasm',
    'fetch:GET:/litert/untracked-runtime.wasm',
    'xhr:GET:/api/litert/pose_landmarks_detector.tflite',
  ])
})

test('reinstalling the gameplay network fence replaces every prior owner cleanly', async (t) => {
  const calls: string[] = []
  const { host, originals } = createNetworkHost([])
  t.after(uninstallFlightSimGameplayNetworkFence)

  installFlightSimGameplayNetworkFence(
    operation => calls.push(`first:${operation}`),
    host,
  )
  const firstOwners = {
    EventSource: host.EventSource,
    serviceWorkerPostMessage: host.ServiceWorker!.prototype.postMessage,
    WebSocket: host.WebSocket,
    fetch: host.fetch,
    sendBeacon: host.navigator!.sendBeacon,
    xmlHttpRequestOpen: host.XMLHttpRequest!.prototype.open,
  }
  installFlightSimGameplayNetworkFence(
    operation => calls.push(`second:${operation}`),
    host,
  )

  assert.notEqual(host.fetch, firstOwners.fetch)
  assert.notEqual(host.XMLHttpRequest!.prototype.open, firstOwners.xmlHttpRequestOpen)
  assert.notEqual(host.WebSocket, firstOwners.WebSocket)
  assert.notEqual(host.EventSource, firstOwners.EventSource)
  assert.notEqual(
    host.ServiceWorker!.prototype.postMessage,
    firstOwners.serviceWorkerPostMessage,
  )
  assert.notEqual(host.navigator!.sendBeacon, firstOwners.sendBeacon)
  assert.throws(
    () => new host.WebSocket!('ws://localhost/flight'),
    assertBlockedOperation('websocket:ws://localhost/flight'),
  )
  assert.deepEqual(calls, [
    'second:websocket:ws://localhost/flight',
  ])
  uninstallFlightSimGameplayNetworkFence()
  assert.equal(host.fetch, originals.fetch)
  assert.equal(
    host.XMLHttpRequest!.prototype.open,
    originals.xmlHttpRequestOpen,
  )
  assert.equal(host.WebSocket, originals.WebSocket)
  assert.equal(host.EventSource, originals.EventSource)
  assert.equal(
    host.ServiceWorker!.prototype.postMessage,
    originals.serviceWorkerPostMessage,
  )
  assert.equal(host.navigator!.sendBeacon, originals.sendBeacon)
})

test('failed gameplay network fence installation rolls back every installed owner', () => {
  const { host, originals } = createNetworkHost([])
  Object.defineProperty(host.navigator!, 'sendBeacon', {
    configurable: true,
    value: originals.sendBeacon,
    writable: false,
  })

  assert.throws(
    () => installFlightSimGameplayNetworkFence(() => undefined, host),
    /read only|writable|assign/i,
  )
  assert.equal(host.fetch, originals.fetch)
  assert.equal(
    host.XMLHttpRequest!.prototype.open,
    originals.xmlHttpRequestOpen,
  )
  assert.equal(host.WebSocket, originals.WebSocket)
  assert.equal(host.EventSource, originals.EventSource)
  assert.equal(
    host.ServiceWorker!.prototype.postMessage,
    originals.serviceWorkerPostMessage,
  )
  assert.equal(host.navigator!.sendBeacon, originals.sendBeacon)
  assert.doesNotThrow(uninstallFlightSimGameplayNetworkFence)
})

test('uninstall restores only network surfaces still owned by the flight fence', () => {
  const { host, originals } = createNetworkHost([])
  installFlightSimGameplayNetworkFence(() => undefined, host)
  const externalWebSocket = class ExternalWebSocket {}
  const externalSendBeacon = () => false
  const externalServiceWorkerPostMessage = () => undefined
  host.WebSocket = externalWebSocket as unknown as typeof WebSocket
  host.navigator!.sendBeacon = externalSendBeacon
  host.ServiceWorker!.prototype.postMessage =
    externalServiceWorkerPostMessage as ServiceWorker['postMessage']

  uninstallFlightSimGameplayNetworkFence()

  assert.equal(host.fetch, originals.fetch)
  assert.equal(
    host.XMLHttpRequest!.prototype.open,
    originals.xmlHttpRequestOpen,
  )
  assert.equal(host.EventSource, originals.EventSource)
  assert.equal(
    host.ServiceWorker!.prototype.postMessage,
    externalServiceWorkerPostMessage,
  )
  assert.equal(host.WebSocket, externalWebSocket)
  assert.equal(host.navigator!.sendBeacon, externalSendBeacon)
})
