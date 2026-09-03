import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getWorkspaceFs,
  resetWorkspaceFsForTests,
} from '@/features/workspace-fs/workspaceFs'
import {
  enqueueWorkspaceSourceTextWrite,
  settleWorkspaceSourceTextWrites,
} from '@/hooks/store/graph-data-slice/workspaceSourceTextWriteQueue'
import {
  acquireWorkspaceSeedSyncSuspension,
  readWorkspaceSeedSyncRuntimeSnapshot,
  resetWorkspaceSeedSyncRuntimeForTests,
} from '@/lib/workspace/workspaceSeedSyncRuntime'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

test('workspace source text writes wait behind the Flight seed-sync suspension', async (t) => {
  resetWorkspaceFsForTests()
  resetWorkspaceSeedSyncRuntimeForTests()
  t.after(() => {
    resetWorkspaceFsForTests()
    resetWorkspaceSeedSyncRuntimeForTests()
  })

  const workspaceFs = await getWorkspaceFs()
  const folderPath = await workspaceFs.createFolder({
    parentPath: '/',
    name: 'flight-fence-test',
  })
  const filePath = await workspaceFs.createFile({
    parentPath: folderPath,
    name: 'mission.md',
    text: 'before',
  })
  const releaseSuspension = await acquireWorkspaceSeedSyncSuspension()
  let firstWriteSettled = false
  let secondWriteSettled = false
  const firstQueuedWrite = enqueueWorkspaceSourceTextWrite(filePath, 'after')
    .finally(() => {
      firstWriteSettled = true
    })
  const secondQueuedWrite = enqueueWorkspaceSourceTextWrite(filePath, 'final')
    .finally(() => {
      secondWriteSettled = true
    })

  await Promise.resolve()
  await Promise.resolve()
  assert.equal(firstWriteSettled, false)
  assert.equal(secondWriteSettled, false)
  assert.equal(await workspaceFs.readFileText(filePath), 'before')

  releaseSuspension()
  assert.equal(await firstQueuedWrite, true)
  assert.equal(await secondQueuedWrite, true)
  assert.equal(await workspaceFs.readFileText(filePath), 'final')
})

test('Flight handoff settles the debounced docs mirror before suspending source writes', async (t) => {
  const { restore } = initJsdomHarness()
  const previousFetch = globalThis.fetch
  const previousDocsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  let mirrorRequestSettled = false
  let releaseMirrorRequest = () => void 0
  let reportMirrorRequestStarted = () => void 0
  const mirrorRequestStarted = new Promise<void>(resolve => {
    reportMirrorRequestStarted = resolve
  })
  const mirrorRequestRelease = new Promise<void>(resolve => {
    releaseMirrorRequest = resolve
  })

  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = '/tmp/agentic-graph-flight-fence-test'
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = String(input)
    if (url === '/__kg_fs_write' && init?.method === 'POST') {
      reportMirrorRequestStarted()
      await mirrorRequestRelease
      mirrorRequestSettled = true
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('', { status: 404 })
  }) as typeof fetch

  resetWorkspaceFsForTests()
  resetWorkspaceSeedSyncRuntimeForTests()
  t.after(() => {
    resetWorkspaceFsForTests()
    resetWorkspaceSeedSyncRuntimeForTests()
    restore()
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
    if (typeof previousDocsRoot === 'string') {
      process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsRoot
    } else {
      delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    }
  })

  const workspaceFs = await getWorkspaceFs()
  const docsFolderExists = (await workspaceFs.listEntries())
    .some(entry => entry.kind === 'folder' && entry.path === '/docs')
  if (!docsFolderExists) {
    await workspaceFs.createFolder({
      parentPath: '/',
      name: 'docs',
      mirrorToHost: false,
    })
  }
  const filePath = await workspaceFs.createFile({
    parentPath: '/docs',
    name: `flight-handoff-${Date.now()}.md`,
    text: 'before',
    mirrorToHost: false,
  })
  const queuedWrite = enqueueWorkspaceSourceTextWrite(filePath, 'after')
  let handoffSettled = false
  const handoff = settleWorkspaceSourceTextWrites().finally(() => {
    handoffSettled = true
  })

  await mirrorRequestStarted
  assert.equal(await queuedWrite, true)
  assert.equal(handoffSettled, false)
  assert.equal(mirrorRequestSettled, false)

  releaseMirrorRequest()
  await handoff
  assert.equal(mirrorRequestSettled, true)

  const releaseSuspension = await acquireWorkspaceSeedSyncSuspension()
  assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
    activeTaskCount: 0,
    suspensionCount: 1,
  })
  releaseSuspension()
})
