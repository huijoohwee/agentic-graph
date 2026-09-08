import React from 'react'
import assert from 'node:assert/strict'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForReactCondition } from '@/tests/lib/reactRootHarness'

export async function testReactReadinessWaitsForLazyCommit(): Promise<void> {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  let release!: (module: { default: () => React.ReactElement }) => void
  const pending = new Promise<{ default: () => React.ReactElement }>(resolve => { release = resolve })
  const Lazy = React.lazy(() => pending)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await mountReactRoot(root, <React.Suspense fallback={<span>Pending</span>}><Lazy /></React.Suspense>)
    assert.equal(container.textContent, 'Pending')
    timer = setTimeout(() => release({ default: () => <span data-ready="1">Ready</span> }), 80)
    await waitForReactCondition(() => Boolean(container.querySelector('[data-ready="1"]')), {
      timeoutMs: 2000, describe: () => 'lazy fixture commit',
    })
    assert.equal(container.textContent, 'Ready')
  } finally {
    clearTimeout(timer)
    release({ default: () => <span>Released</span> })
    try { await unmountReactRoot(root) } finally { restore() }
  }
}

export async function testReactReadinessFailsWithBoundedDiagnostics(): Promise<void> {
  await assert.rejects(waitForReactCondition(() => false, {
    timeoutMs: 20, describe: () => 'presentation apiReady=false',
  }), /Timed out after 20ms waiting for presentation apiReady=false/)
  const error = new Error('predicate failed')
  await assert.rejects(waitForReactCondition(() => { throw error }), failure => failure === error)
  await assert.rejects(waitForReactCondition(() => true, { timeoutMs: Infinity }), RangeError)
}
