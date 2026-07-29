import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDisabledGeoAuthoringFallbackDraft,
} from '../../canvas/src/features/geospatial/geoAuthoringFallback.ts'
import { runGeoAuthoring } from '../../canvas/src/features/geospatial/geoAuthoringHarness.ts'

const authoringInput = {
  intent: 'Create a building extrusion template',
  datasetId: 'City Buildings',
  kind: 'building' as const,
  maxIterations: 2,
  costBudgetUsd: 0.05,
  modelTimeoutMs: 1_000,
}

const assertDisabledFallback = (draft: Record<string, unknown> | null): void => {
  assert.ok(draft)
  assert.equal(draft.enabled, false)
  assert.deepEqual(draft.source, { kind: 'url', url: '' })
  const render = draft.render as Record<string, unknown>
  assert.equal(render.kind, 'extrusion')
  assert.equal(render.extrusionKind, 'building')
  assert.equal(render.visible, false)
  assert.deepEqual(draft.authoringFallback, {
    state: 'disabled',
    reason: 'model-unavailable',
    intent: authoringInput.intent,
  })
}

test('fallback draft is deterministic, schema-shaped, and disabled', () => {
  const first = createDisabledGeoAuthoringFallbackDraft(authoringInput)
  const second = createDisabledGeoAuthoringFallbackDraft(authoringInput)
  assert.deepEqual(first, second)
  assertDisabledFallback(first)
})

test('absent model adapter returns typed fallback without applying it', async () => {
  let applyCalls = 0
  const result = await runGeoAuthoring(authoringInput, {
    applyDraft: async () => {
      applyCalls += 1
      return true
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.error?.code, 'model-unavailable')
  assertDisabledFallback(result.draft)
  assert.equal(applyCalls, 0)
})

test('transport failure returns the deterministic typed fallback without raw leakage', async () => {
  let applyCalls = 0
  const result = await runGeoAuthoring(authoringInput, {
    callModel: async () => {
      throw new Error('provider-secret-transport-detail')
    },
    applyDraft: async () => {
      applyCalls += 1
      return true
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.error?.code, 'model-unavailable')
  assert.equal(result.error?.code === 'model-unavailable' && result.error.upstream, 'Geo authoring model call failed.')
  assertDisabledFallback(result.draft)
  assert.equal(applyCalls, 0)
})

test('model timeout returns a typed fallback and never partially applies', async () => {
  let applyCalls = 0
  const result = await runGeoAuthoring(authoringInput, {
    callModel: async () => new Promise(() => undefined),
    applyDraft: async () => {
      applyCalls += 1
      return true
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.error?.code, 'model-unavailable')
  assert.equal(
    result.error?.code === 'model-unavailable' && result.error.upstream,
    'Model call exceeded 1000 ms.',
  )
  assertDisabledFallback(result.draft)
  assert.equal(applyCalls, 0)
})
