import assert from 'node:assert/strict'
import { test } from 'node:test'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  cancelMarkdownWorkspaceAutosaveSync,
  scheduleMarkdownWorkspaceAutosaveSync,
} from '@/lib/markdown-workspace-runtime/markdownWorkspaceRuntime.stateSync'

test('autosave commits equal-length middle edits and coalesces pending edits per file', async () => {
  const { restore } = initJsdomHarness()
  const path = '/docs/generic.md'
  const first = 'a'.repeat(256) + 'old' + 'z'.repeat(256)
  const second = first.replace('old', 'new')
  const saved: string[] = []
  const schedule = (text: string) => scheduleMarkdownWorkspaceAutosaveSync(() => { saved.push(text) }, { path, text })
  try {
    schedule(first)
    await Promise.resolve()
    schedule(second)
    await Promise.resolve()
    assert.deepEqual(saved, [first, second], 'same-size edits outside the header/tail must reach storage')
    schedule(first)
    schedule(second + '!')
    await Promise.resolve()
    assert.deepEqual(saved, [first, second, second + '!'], 'pending obsolete writes coalesce')
    schedule('cancelled')
    cancelMarkdownWorkspaceAutosaveSync(path)
    await Promise.resolve()
    assert.equal(saved.length, 3)
  } finally {
    cancelMarkdownWorkspaceAutosaveSync(path)
    restore()
  }
})
