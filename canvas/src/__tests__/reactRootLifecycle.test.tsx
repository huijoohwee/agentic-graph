import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import React, { act, useEffect, useId } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { disposeReactRootsForDocument, readTrackedReactRootCount } from '@/tests/lib/reactRootLifecycle'
import { execTest } from '@/tests/runner/execTest'
import type { TestResult } from '@/tests/runner/testRunnerTypes'

const hostIn = (document: Document) => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return host
}

const Subscriber = ({ listeners, cleanup }: { listeners: Set<() => void>; cleanup?: () => void }) => {
  useEffect(() => {
    const listener = () => void 0
    listeners.add(listener)
    return () => { listeners.delete(listener); cleanup?.() }
  }, [listeners, cleanup])
  return <span>ready</span>
}

const captureExpectedFailure = async (fn: (logs: string[]) => Promise<void>) => {
  const logs: string[] = []
  const originalLog = console.log
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')) }
  try { await fn(logs) } finally { console.log = originalLog }
}

export async function testReactRootFactoriesRetainRealRenderAndHydration() {
  const harness = initJsdomHarness()
  const listeners = new Set<() => void>()
  try {
    const document = harness.dom.window.document
    const esm = await import('react-dom/client')
    const cjs = createRequire(import.meta.url)('react-dom/client') as typeof esm
    const firstHost = hostIn(document)
    const first = createRoot(firstHost, { identifierPrefix: 'lifecycle-proof-' })
    const second = cjs.createRoot(hostIn(document))
    const hydrationHost = hostIn(document)
    hydrationHost.innerHTML = '<span>ready</span>'
    const originalSpan = hydrationHost.firstChild
    const WithId = () => <section id={useId()}><Subscriber listeners={listeners} /></section>
    let hydrated: ReturnType<typeof esm.hydrateRoot> | undefined
    await act(async () => {
      first.render(<WithId />)
      second.render(<Subscriber listeners={listeners} />)
      hydrated = esm.hydrateRoot(hydrationHost, <Subscriber listeners={listeners} />)
    })
    assert.match(firstHost.firstElementChild?.id ?? '', /lifecycle-proof-/)
    assert.equal(hydrationHost.firstChild, originalSpan, 'real hydration must reuse the server node')
    assert.equal(listeners.size, 3)
    assert.equal(readTrackedReactRootCount(), 3, 'static, CJS, and ESM factories share root ownership')
    await act(async () => { first.unmount(); second.unmount() })
    assert.equal(listeners.size, 1)
    assert.equal(readTrackedReactRootCount(), 1)
    assert.throws(() => first.render(<span />), /unmounted root/)
    await act(async () => { hydrated!.unmount() })
    assert.equal(listeners.size, 0)
    assert.equal(readTrackedReactRootCount(), 0)
  } finally { harness.restore() }
}

export async function testReactRootFailedFixtureDisposesBeforeHarnessClose() {
  const listeners = new Set<() => void>()
  const originalWindow = globalThis.window
  let cleaned = 0
  await assert.rejects(async () => {
    const harness = initJsdomHarness()
    const document = harness.dom.window.document
    const host = hostIn(document)
    try {
      const root = createRoot(host)
      await act(async () => root.render(<Subscriber listeners={listeners} cleanup={() => {
        assert.equal(globalThis.window, harness.dom.window)
        assert.equal(globalThis.document, document)
        assert.equal(document.body.contains(host), true, 'DOM must still exist during effect cleanup')
        cleaned += 1
      }} />))
      throw new Error('intentional fixture assertion')
    } finally { harness.restore() }
  }, /intentional fixture assertion/)
  assert.equal(cleaned, 1)
  assert.equal(listeners.size, 0)
  assert.equal(readTrackedReactRootCount(), 0)
  assert.equal(globalThis.window, originalWindow)
}

export async function testReactRootRawClosePreservesOtherDocumentAndGlobals() {
  const outer = initJsdomHarness()
  const raw = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
  const originalClose = Object.getOwnPropertyDescriptor(raw.window, 'close')
  const outerListeners = new Set<() => void>()
  const rawListeners = new Set<() => void>()
  let cleaned = 0
  try {
    const outerRoot = createRoot(hostIn(outer.dom.window.document))
    await act(async () => outerRoot.render(<Subscriber listeners={outerListeners} />))
    const rawRoot = createRoot(hostIn(raw.window.document))
    await act(async () => rawRoot.render(<Subscriber listeners={rawListeners} cleanup={() => {
      assert.equal(globalThis.window, raw.window)
      assert.equal(globalThis.document, raw.window.document)
      cleaned += 1
    }} />))
    const descriptors = Object.getOwnPropertyDescriptors(globalThis)
    raw.window.close()
    assert.equal(cleaned, 1)
    assert.equal(rawListeners.size, 0)
    assert.equal(outerListeners.size, 1, 'closing one document must not unmount another')
    assert.equal(readTrackedReactRootCount(), 1)
    for (const key of ['window', 'document', 'Node', 'HTMLElement', 'Event', 'HTMLIFrameElement', 'requestAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT']) {
      assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, key), descriptors[key], `restore ${key} descriptor`)
    }
    assert.deepEqual(Object.getOwnPropertyDescriptor(raw.window, 'close'), originalClose)
  } finally {
    raw.window.close()
    outer.restore()
  }
  assert.equal(outerListeners.size, 0)
  assert.equal(readTrackedReactRootCount(), 0)
}

export async function testReactRootRunnerCleansBeforeStoreResetAndRetainsFailure() {
  const harness = initJsdomHarness()
  const results: TestResult[] = []
  let subscriberUpdates = 0
  let cleanupMicrotaskCompleted = false
  let unsubscribeObserver: () => void = () => void 0
  const resetObservations: boolean[] = []
  try {
    await captureExpectedFailure(async logs => {
      const StoreSubscriber = () => {
        useEffect(() => {
          const unsubscribe = useGraphStore.subscribe(() => { subscriberUpdates += 1 })
          return () => {
            assert.ok(logs.some(line => line.includes('intentional runner assertion')), 'report the body error before cleanup')
            unsubscribe()
            queueMicrotask(() => { cleanupMicrotaskCompleted = true })
          }
        }, [])
        return <span>store subscriber</span>
      }
      await execTest(results, 'testIsolation.reactRoots.expectedRunnerFailure', async () => {
        const root = createRoot(hostIn(harness.dom.window.document))
        await act(async () => root.render(<StoreSubscriber />))
        unsubscribeObserver = useGraphStore.subscribe(() => { resetObservations.push(cleanupMicrotaskCompleted) })
        throw new Error('intentional runner assertion')
      })
    })
    assert.equal(results.length, 1)
    assert.equal(results[0].ok, false)
    assert.match(results[0].error ?? '', /intentional runner assertion/)
    assert.equal(subscriberUpdates, 0, 'reset must not notify a mounted subscriber from the finished test')
    assert.ok(resetObservations.length > 0, 'exercise the actual store reset')
    assert.ok(resetObservations.every(Boolean), 'await unmount work before resetting the store')
    assert.equal(readTrackedReactRootCount(), 0)
  } finally { unsubscribeObserver(); harness.restore() }
}

export async function testReactRootCleanupFailurePreservesBodyErrorAndOtherRoots() {
  const harness = initJsdomHarness()
  const listeners = new Set<() => void>()
  const results: TestResult[] = []
  let healthyCleanup = 0
  try {
    await captureExpectedFailure(async () => {
      await execTest(results, 'testIsolation.reactRoots.expectedCleanupFailure', async () => {
        const bad = createRoot(hostIn(harness.dom.window.document))
        const good = createRoot(hostIn(harness.dom.window.document))
        await act(async () => {
          bad.render(<Subscriber listeners={listeners} cleanup={() => { throw new Error('intentional effect cleanup') }} />)
          good.render(<Subscriber listeners={listeners} cleanup={() => { healthyCleanup += 1 }} />)
        })
        throw new Error('intentional body failure')
      })
    })
    assert.equal(results.length, 1)
    assert.equal(results[0].ok, false)
    assert.match(results[0].error ?? '', /intentional body failure/)
    assert.match(results[0].error ?? '', /intentional effect cleanup/)
    assert.equal(healthyCleanup, 1, 'a failing effect must not skip the other root')
    assert.equal(listeners.size, 0)
    assert.equal(readTrackedReactRootCount(), 0)
  } finally { harness.restore() }
}

export async function testReactRootCleanupRejectsRootCreationWithoutRetry() {
  const harness = initJsdomHarness()
  const listeners = new Set<() => void>()
  let attempts = 0
  let healthyCleanup = 0
  try {
    const bad = createRoot(hostIn(harness.dom.window.document))
    const good = createRoot(hostIn(harness.dom.window.document))
    await act(async () => {
      bad.render(<Subscriber listeners={listeners} cleanup={() => {
        attempts += 1
        createRoot(hostIn(harness.dom.window.document))
      }} />)
      good.render(<Subscriber listeners={listeners} cleanup={() => { healthyCleanup += 1 }} />)
    })
    assert.throws(() => disposeReactRootsForDocument(harness.dom.window.document), /root was created during test cleanup/)
    assert.equal(attempts, 1)
    assert.equal(healthyCleanup, 1)
    assert.equal(listeners.size, 0)
    assert.equal(readTrackedReactRootCount(), 0)
  } finally { harness.restore() }
}
