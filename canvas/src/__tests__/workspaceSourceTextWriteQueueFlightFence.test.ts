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
    if (url === '/__agentic_os_fs_write' && init?.method === 'POST') {
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

test('bundled graph source writes stay browser-local while local copies and nested seed paths retain host mirrors', async (t) => {
  const { restore } = initJsdomHarness()
  const previousFetch = globalThis.fetch
  const previousDocsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const docsRoot = '/tmp/agentic-graph-bundled-queue-test'
  const requests: Array<Record<string, unknown>> = []
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = docsRoot
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/__agentic_os_fs_write' && init?.method === 'POST') {
      requests.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    return new Response('', { status: 404 })
  }) as typeof fetch
  resetWorkspaceFsForTests()
  resetWorkspaceSeedSyncRuntimeForTests()
  t.after(async () => {
    await settleWorkspaceSourceTextWrites()
    resetWorkspaceFsForTests()
    resetWorkspaceSeedSyncRuntimeForTests()
    globalThis.fetch = previousFetch
    if (previousDocsRoot === undefined) delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    else process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsRoot
    restore()
  })

  const workspaceFs = await getWorkspaceFs()
  for (const [parentPath, name] of [['/', 'docs'], ['/docs', 'workspace-seeds'], ['/docs/workspace-seeds', 'team']] as const) {
    const path = `${parentPath === '/' ? '' : parentPath}/${name}`
    if (!(await workspaceFs.listEntries()).some(entry => entry.path === path)) {
      await workspaceFs.createFolder({ parentPath, name, mirrorToHost: false })
    }
  }
  const basename = 'agentic-graph-game-flight-sim-demo.md'
  for (const parentPath of ['/docs/workspace-seeds', '/docs', '/docs/workspace-seeds/team'] as const) {
    const path = `${parentPath}/${basename}`
    const before = `# Before ${parentPath}`
    const after = `# Queued ${parentPath}`
    if ((await workspaceFs.listEntries()).some(entry => entry.path === path)) {
      await workspaceFs.writeFileText(path, before, { mirrorToHost: false })
    } else {
      assert.equal(await workspaceFs.createFile({ parentPath, name: basename, text: before, mirrorToHost: false }), path)
    }
    requests.length = 0
    assert.equal(await enqueueWorkspaceSourceTextWrite(path, after), true)
    await settleWorkspaceSourceTextWrites()
    assert.equal(await workspaceFs.readFileText(path), after, 'queued source bytes reach browser storage')
    if (parentPath === '/docs/workspace-seeds') {
      assert.deepEqual(requests, [], 'automatic bundled-example edits must not mutate the host source')
      await workspaceFs.writeFileText(path, '# Explicit source edit')
      await settleWorkspaceSourceTextWrites()
      assert.equal(requests.length, 1, 'explicit source writes retain their host authority')
      assert.equal(requests[0].workspacePath, path)
    } else {
      assert.equal(requests.length, 1, 'ordinary source writes retain their host mirror')
      if (parentPath === '/docs') assert.equal(requests[0].path, `${docsRoot}/${basename}`)
      else assert.equal(requests[0].workspacePath, path, 'custom seed namespace retains logical host authority')
    }
  }
})
