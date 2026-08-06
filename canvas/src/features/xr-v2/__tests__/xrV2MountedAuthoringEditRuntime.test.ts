import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  applyXrV2MountedAuthoringVisibilityEdit,
  registerXrV2MountedAuthoringEditTarget,
  XR_V2_MOUNTED_AUTHORING_EDIT_SCHEMA,
} from '../xrV2MountedAuthoringEditRuntime'

const SOURCE = Object.freeze({ sourceDigest: 'fnv1a32:12345678', graphDataRevision: 7 })

test('mounted authoring edits are source-bound, rendered, revisioned, and disposed fail-closed', async () => {
  const calls: Array<Readonly<{ entityRef: string; visible: boolean; revision: number }>> = []
  const dispose = registerXrV2MountedAuthoringEditTarget({
    ...SOURCE,
    applyVisibility: async (entityRef, visible, revision, signal) => {
      assert.equal(signal.aborted, false)
      calls.push(Object.freeze({ entityRef, visible, revision }))
      return Object.freeze({ visible, renderedAtMs: 42, attached: true as const })
    },
  })
  const signal = new AbortController().signal
  const first = await applyXrV2MountedAuthoringVisibilityEdit({
    ...SOURCE, entityRef: 'scene.hero', visible: false, signal,
  })
  const second = await applyXrV2MountedAuthoringVisibilityEdit({
    ...SOURCE, entityRef: 'scene.hero', visible: true, signal,
  })
  assert.equal(first.schema, XR_V2_MOUNTED_AUTHORING_EDIT_SCHEMA)
  assert.equal(first.authoringEditRevision, 1)
  assert.equal(second.authoringEditRevision, 2)
  assert.equal(second.authorRenderedAtMs, 42)
  assert.deepEqual(calls, [
    { entityRef: 'scene.hero', visible: false, revision: 1 },
    { entityRef: 'scene.hero', visible: true, revision: 2 },
  ])
  await assert.rejects(applyXrV2MountedAuthoringVisibilityEdit({
    ...SOURCE,
    sourceDigest: 'fnv1a32:87654321',
    entityRef: 'scene.hero',
    visible: false,
    signal,
  }), /does not match the active source/)
  dispose()
  await assert.rejects(applyXrV2MountedAuthoringVisibilityEdit({
    ...SOURCE, entityRef: 'scene.hero', visible: false, signal,
  }), /does not match the active source/)
})

test('mounted authoring edits reject an already-aborted action without touching the target', async () => {
  let calls = 0
  const dispose = registerXrV2MountedAuthoringEditTarget({
    ...SOURCE,
    applyVisibility: async () => {
      calls += 1
      return Object.freeze({ visible: false, renderedAtMs: 1, attached: true as const })
    },
  })
  const abort = new AbortController()
  abort.abort()
  await assert.rejects(applyXrV2MountedAuthoringVisibilityEdit({
    ...SOURCE, entityRef: 'scene.hero', visible: false, signal: abort.signal,
  }), { name: 'AbortError' })
  assert.equal(calls, 0)
  dispose()
})
