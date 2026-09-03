import assert from 'node:assert/strict'
import test from 'node:test'

import {
  acquireDurableChatStreamTransportSuspension,
  attachDurableChatStreamResponse,
  CHAT_DURABLE_STREAM_ABORT,
  CHAT_DURABLE_STREAM_START,
  clearActiveDurableChatStreamRun,
  DurableChatStreamTransportSuspendedError,
  fetchWithDurableChatStream,
  readActiveDurableChatStreamRun,
  writeActiveDurableChatStreamRun,
  type DurableChatStreamRequestMetadata,
} from '@/features/chat/floatingPanelChat/floatingPanelChatDurableStream'
import {
  resetFlightSimDecisionStoreForTests,
} from '@/features/game-flight-sim/flightSimDecisionStore'
import {
  exitFlightSimSurface,
  openFlightSimSurface,
  readFlightSimSnapshot,
  resetFlightSimRuntimeForTests,
  startFlightSim,
} from '@/features/game-flight-sim/flightSimRuntime'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { initWindowHarness } from '@/tests/lib/windowHarness'

const DURABLE_RUN: DurableChatStreamRequestMetadata = Object.freeze({
  runId: 'flight-sim-durable-chat-test',
  traceId: 'flight-sim-durable-chat-test',
  assistantMessageId: 'assistant-flight-sim-durable-chat-test',
  requestText: 'Keep chat transport local while Flight Sim owns the runtime.',
  requestTimestampMs: Date.UTC(2026, 6, 24, 12, 0, 0),
  chatStorageTarget: 'chatAgenticGraph',
  liveAgenticOsPath: null,
  providerSummary: 'Local test',
  defaultLocalRootPath: '/workspace/chat',
})

test('durable chat transport suspension blocks start and attach without clearing an active run', async t => {
  const { restore } = initWindowHarness({ storage: new MemoryStorage() })
  t.after(() => {
    clearActiveDurableChatStreamRun()
    restore()
  })

  const release = acquireDurableChatStreamTransportSuspension()
  t.after(release)
  let fallbackCalled = false
  await assert.rejects(
    fetchWithDurableChatStream({
      runMetadata: DURABLE_RUN,
      input: '/api/chat',
      fallbackFetch: async () => {
        fallbackCalled = true
        return new Response()
      },
    }),
    DurableChatStreamTransportSuspendedError,
  )
  await assert.rejects(
    attachDurableChatStreamResponse(DURABLE_RUN.runId),
    DurableChatStreamTransportSuspendedError,
  )
  assert.equal(fallbackCalled, false)

  release()
  writeActiveDurableChatStreamRun(DURABLE_RUN)
  assert.throws(
    acquireDurableChatStreamTransportSuspension,
    /while a durable chat run is active/i,
  )
  assert.equal(readActiveDurableChatStreamRun()?.runId, DURABLE_RUN.runId)
})

test('Flight admission rejects an existing durable chat run without clearing it', async t => {
  const { restore } = initWindowHarness({ storage: new MemoryStorage() })
  resetFlightSimDecisionStoreForTests()
  resetFlightSimRuntimeForTests()
  useGraphStore.getState().resetAll()
  writeActiveDurableChatStreamRun(DURABLE_RUN)
  t.after(() => {
    clearActiveDurableChatStreamRun()
    resetFlightSimDecisionStoreForTests()
    resetFlightSimRuntimeForTests()
    useGraphStore.getState().resetAll()
    restore()
  })

  const rejected = await openFlightSimSurface({
    openPanel: false,
    webglSupported: true,
    workspace: {
      readFileText: async () => null,
    } as unknown as WorkspaceFs,
  })

  assert.equal(rejected.active, false)
  assert.match(
    rejected.runtimeError || '',
    /cannot suspend durable chat stream transport while a durable chat run is active/i,
  )
  assert.equal(readActiveDurableChatStreamRun()?.runId, DURABLE_RUN.runId)
})

test('Flight suspends canonical durable chat without replacing raw Service Worker transport', async t => {
  const acceptedWorkerMessages: unknown[] = []
  class TestServiceWorker {
    postMessage(message: unknown): void {
      acceptedWorkerMessages.push(message)
    }
  }
  const serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'ServiceWorker',
  )
  Object.defineProperty(globalThis, 'ServiceWorker', {
    configurable: true,
    value: TestServiceWorker,
    writable: true,
  })
  const { restore } = initWindowHarness({ storage: new MemoryStorage() })
  resetFlightSimDecisionStoreForTests()
  resetFlightSimRuntimeForTests()
  useGraphStore.getState().resetAll()
  const serviceWorker = new TestServiceWorker()
  t.after(() => {
    if (readFlightSimSnapshot().active) exitFlightSimSurface()
    resetFlightSimDecisionStoreForTests()
    resetFlightSimRuntimeForTests()
    useGraphStore.getState().resetAll()
    if (serviceWorkerDescriptor) {
      Object.defineProperty(
        globalThis,
        'ServiceWorker',
        serviceWorkerDescriptor,
      )
    } else {
      Reflect.deleteProperty(globalThis, 'ServiceWorker')
    }
    restore()
  })

  const opened = await openFlightSimSurface({
    openPanel: false,
    webglSupported: true,
    workspace: {
      readFileText: async () => null,
    } as unknown as WorkspaceFs,
  })
  assert.equal(opened.active, true)
  const started = startFlightSim()
  assert.equal(started.active, true)

  serviceWorker.postMessage({ type: CHAT_DURABLE_STREAM_START })
  serviceWorker.postMessage({ type: CHAT_DURABLE_STREAM_ABORT })
  assert.deepEqual(acceptedWorkerMessages, [
    { type: CHAT_DURABLE_STREAM_START },
    { type: CHAT_DURABLE_STREAM_ABORT },
  ])
  const active = readFlightSimSnapshot()
  assert.equal(active.active, true)
  assert.equal(active.runId, started.runId)
  assert.equal(active.runtimeError, null)
  let fallbackCalled = false
  await assert.rejects(
    fetchWithDurableChatStream({
      runMetadata: DURABLE_RUN,
      input: '/api/chat',
      fallbackFetch: async () => {
        fallbackCalled = true
        return new Response()
      },
    }),
    DurableChatStreamTransportSuspendedError,
  )
  assert.equal(fallbackCalled, false)

  exitFlightSimSurface()
  serviceWorker.postMessage({ type: CHAT_DURABLE_STREAM_START })
  assert.deepEqual(acceptedWorkerMessages, [
    { type: CHAT_DURABLE_STREAM_START },
    { type: CHAT_DURABLE_STREAM_ABORT },
    { type: CHAT_DURABLE_STREAM_START },
  ])
  await fetchWithDurableChatStream({
    runMetadata: DURABLE_RUN,
    input: '/api/chat',
    fallbackFetch: async () => {
      fallbackCalled = true
      return new Response()
    },
  })
  assert.equal(fallbackCalled, true)
})
