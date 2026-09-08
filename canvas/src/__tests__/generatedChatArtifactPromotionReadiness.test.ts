import assert from 'node:assert/strict'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { promoteGeneratedChatWorkspacePaths, retryGeneratedChatWorkspaceArtifactPromotion } from '@/features/chat/floatingPanelChat/chatWorkspaceArtifactPromotion'
import { buildAgenticGraphStorageDocPath } from '@/lib/storage/agentic-graph-storage-sync-contract'
import { __resetAgenticGraphStorageDbForTests, getAgenticGraphStorageDb } from '@/lib/storage/agentic-graph-storage-db'
import { createFakeAgenticGraphStorageWorkerEnv } from '@/__tests__/helpers/fake-agentic-graph-storage-d1'
import { createStorageWorkerRequest, readStorageWorker } from '@/__tests__/helpers/fake-agentic-graph-storage-worker-fetch'
import { createAgenticGraphStorageOutboxRecord } from '@/lib/storage/agentic-graph-storage-outbox-record'
import { toAgenticGraphRemoteDocumentRecord } from '@/lib/storage/agentic-graph-storage-record-mapping'
import { publishWorkspaceEntriesToAgenticGraphStorage } from '@/features/source-files/sourceFileShareUrl'
import { withDurableBrowserStorage } from '@/__tests__/helpers/durable-browser-storage'

export async function testGeneratedChatPromotionWritesGitHubBeforeCloudflareCache() {
  return withDurableBrowserStorage(async () => {
  const previousEnabled = process.env.VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED
  const { restore: restoreDom } = initJsdomHarness()
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const workspaceId = 'kgws:dev-github-canonical-e2e'
  const workspacePath = '/chat-log/dev-canonical-e2e/agenticOs_dev-canonical-e2e.md'
  const content = '# Dev canonical E2E\n\nGitHub owns writes; Cloudflare caches reads.'
  const events: string[] = []
  try {
    resetWorkspaceFsForTests()
    await __resetAgenticGraphStorageDbForTests()
    process.env.VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED = '1'
    const fs = await getWorkspaceFs()
    await fs.createFolder({ parentPath: '/', name: 'chat-log' })
    await fs.createFolder({ parentPath: '/chat-log', name: 'dev-canonical-e2e' })
    await fs.createFile({
      parentPath: '/chat-log/dev-canonical-e2e',
      name: 'agenticOs_dev-canonical-e2e.md',
      text: content,
    })

    const result = await promoteGeneratedChatWorkspacePaths([workspacePath], {
      githubEnabled: true,
      githubBaseUrl: 'https://pages.example',
      githubFetchImpl: async (_input, init) => {
        events.push('github:write')
        const body = JSON.parse(String(init?.body || '{}'))
        if (body.files?.[0]?.workspacePath !== workspacePath || body.files?.[0]?.text !== content) {
          throw new Error(`expected GitHub write to receive canonical workspace content, got ${JSON.stringify(body)}`)
        }
        return new Response(JSON.stringify({
          ok: true,
          status: 'applied',
          repository: 'owner/repo',
          branch: 'main',
          files: [{
            workspacePath,
            repositoryPath: workspacePath.replace(/^\/+/, ''),
            action: 'created',
            commitSha: 'commit-dev-e2e',
          }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
      storageWorkspaceId: workspaceId,
      storageSyncNow: true,
      storageBaseUrl: 'https://storage.example',
      storageDeviceId: 'dev-github-canonical-e2e',
      storageFetchImpl: async (input, init) => {
        const url = input instanceof Request ? input.url : String(input || '')
        events.push(`storage:${new URL(url, 'https://storage.example').pathname}`)
        const request = createStorageWorkerRequest(input, init)
        return readStorageWorker().fetch(request, env as never)
      },
    })

    if (result.githubStatus !== 'applied' || result.storageStatus !== 'applied') {
      throw new Error(`expected GitHub write and Cloudflare cache to apply, got ${JSON.stringify(result)}`)
    }
    const firstStorageEventIndex = events.findIndex(event => event.startsWith('storage:'))
    if (events[0] !== 'github:write' || firstStorageEventIndex <= 0) {
      throw new Error(`expected GitHub write before Cloudflare cache, got ${events.join(',')}`)
    }
    const response = await readStorageWorker().fetch(
      new Request(`https://storage.example${buildAgenticGraphStorageDocPath(workspaceId, workspacePath.replace(/^\/+/, ''))}`),
      env as never,
    )
    const cached = await response.text()
    if (!response.ok || cached !== content) {
      throw new Error(`expected Cloudflare cache read to match canonical GitHub content, got status=${response.status} body=${cached}`)
    }
  } finally {
    await __resetAgenticGraphStorageDbForTests()
    resetWorkspaceFsForTests()
    restoreWindow()
    restoreDom()
    if (typeof previousEnabled === 'string') process.env.VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED = previousEnabled
    else delete process.env.VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED
  }
  })
}

export async function testRetryGeneratedChatPromotionReusesSavedWorkspaceArtifact() {
  return withDurableBrowserStorage(async () => {
  const previousEnabled = process.env.VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED
  const { restore: restoreDom } = initJsdomHarness()
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const workspaceId = 'kgws:retry-promotion'
  const workspacePath = '/chat-log/retry-promotion/agenticOs_retry_promotion.md'
  const content = '# Retry promotion\n\nReuse the saved local artifact without regenerating it.'
  const events: string[] = []
  try {
    resetWorkspaceFsForTests()
    await __resetAgenticGraphStorageDbForTests()
    process.env.VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED = '1'
    const fs = await getWorkspaceFs()
    await fs.createFolder({ parentPath: '/', name: 'chat-log' })
    await fs.createFolder({ parentPath: '/chat-log', name: 'retry-promotion' })
    await fs.createFile({
      parentPath: '/chat-log/retry-promotion',
      name: 'agenticOs_retry_promotion.md',
      text: content,
    })

    const result = await retryGeneratedChatWorkspaceArtifactPromotion({
      paths: [workspacePath],
      githubEnabled: true,
      githubBaseUrl: 'https://pages.example',
      githubFetchImpl: async (_input, init) => {
        events.push('github:write')
        const body = JSON.parse(String(init?.body || '{}'))
        if (body.files?.[0]?.workspacePath !== workspacePath || body.files?.[0]?.text !== content) {
          throw new Error(`expected retry promotion to reuse the saved workspace artifact text, got ${JSON.stringify(body)}`)
        }
        return new Response(JSON.stringify({
          ok: true,
          status: 'applied',
          repository: 'owner/repo',
          files: [{ workspacePath, repositoryPath: workspacePath.replace(/^\/+/, ''), action: 'updated', commitSha: 'retry-commit-sha' }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
      storageWorkspaceId: workspaceId,
      storageSyncNow: true,
      storageBaseUrl: 'https://storage.example',
      storageDeviceId: 'retry-promotion-device',
      storageFetchImpl: async (input, init) => {
        const url = input instanceof Request ? input.url : String(input || '')
        events.push(`storage:${new URL(url, 'https://storage.example').pathname}`)
        const request = createStorageWorkerRequest(input, init)
        return readStorageWorker().fetch(request, env as never)
      },
    })

    if (result.promotion !== 'MIRRORED_GITHUB+STORAGE' || result.failureNote !== null || result.retryHint !== null || result.retryCommand !== null) {
      throw new Error(`expected retry promotion to report a successful mirrored result, got ${JSON.stringify(result)}`)
    }
    if (events[0] !== 'github:write' || !events.some(event => event.startsWith('storage:'))) {
      throw new Error(`expected retry promotion to preserve GitHub-before-storage ordering, got ${JSON.stringify(events)}`)
    }
  } finally {
    await __resetAgenticGraphStorageDbForTests()
    resetWorkspaceFsForTests()
    restoreWindow()
    restoreDom()
    if (typeof previousEnabled === 'string') process.env.VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED = previousEnabled
    else delete process.env.VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED
  }
  })
}

const READINESS_PATH = '/chat-log/readiness/agenticOs_readiness.md'
const READINESS_TEXT = '\ufeff# Saved artifact\n\nKeep the exact bytes, including NUL: \u0000 end.'
type PromotionFixture = {
  fs: WorkspaceFs
  env: ReturnType<typeof createFakeAgenticGraphStorageWorkerEnv>
  options: Parameters<typeof retryGeneratedChatWorkspaceArtifactPromotion>[0]
  events: string[]
  githubBodies: string[]
}
async function withPromotionFixture(run: (fixture: PromotionFixture) => Promise<void>, durable = true): Promise<void> {
  const runFixture = async () => {
    const { restore: restoreDom } = initJsdomHarness()
    const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
    const previousStore = useGraphStore.getState()
    try {
      resetWorkspaceFsForTests()
      await __resetAgenticGraphStorageDbForTests()
      const fs = await getWorkspaceFs()
      await fs.createFolder({ parentPath: '/', name: 'chat-log' })
      await fs.createFolder({ parentPath: '/chat-log', name: 'readiness' })
      await fs.deleteEntry(READINESS_PATH)
      await fs.createFile({ parentPath: '/chat-log/readiness', name: 'agenticOs_readiness.md', text: READINESS_TEXT })
      const env = createFakeAgenticGraphStorageWorkerEnv()
      const events: string[] = [], githubBodies: string[] = []
      const options: PromotionFixture['options'] = {
        paths: [READINESS_PATH], githubEnabled: true, githubBaseUrl: 'https://pages.example',
        storageWorkspaceId: 'kgws:promotion-readiness', storageDeviceId: 'promotion-readiness-device',
        storageSyncNow: true, storageBaseUrl: 'https://storage.example',
        githubFetchImpl: async (_input, init) => {
          events.push('github:write')
          const body = JSON.parse(String(init?.body))
          githubBodies.push(body.files[0].text)
          return Response.json({ ok: true, status: 'applied', files: body.files.map((file: { workspacePath: string }) => ({ workspacePath: file.workspacePath, commitSha: 'fixture-commit' })) })
        },
        storageFetchImpl: async (input, init) => {
          const request = createStorageWorkerRequest(input, init)
          events.push(request.method + ' ' + new URL(request.url).pathname)
          if (request.method === 'GET' && new URL(request.url).pathname.includes('/doc/')) {
            assert.equal(init?.credentials, 'same-origin')
            assert.equal(init?.cache, 'no-store')
            assert.equal(init?.redirect, 'error')
          }
          return readStorageWorker().fetch(request, env as never)
        },
      }
      await run({ fs, env, options, events, githubBodies })
    } finally {
      await __resetAgenticGraphStorageDbForTests()
      resetWorkspaceFsForTests()
      useGraphStore.setState(previousStore, true)
      try { restoreWindow() } finally { restoreDom() }
    }
  }
  if (durable) await withDurableBrowserStorage(runFixture)
  else await runFixture()
}
function assertRetainedRetry(result: Awaited<ReturnType<typeof retryGeneratedChatWorkspaceArtifactPromotion>>): void {
  assert.notEqual(result.storageStatus, 'applied', 'Local storage bookkeeping must not claim a remote mirror')
  assert.notEqual(result.promotion, 'MIRRORED_GITHUB+STORAGE')
  assert.ok(result.failureNote)
  assert.equal(result.retryCommand, '- Retry command: `#promotion.retry ' + READINESS_PATH + '`')
}
export async function testGeneratedPromotionRetainsVolatileStorageRetry() {
  await withPromotionFixture(async ({ fs, options, events }) => {
    const result = await retryGeneratedChatWorkspaceArtifactPromotion(options)
    assertRetainedRetry(result)
    assert.deepEqual(events, ['github:write'])
    assert.equal(await fs.readFileText(READINESS_PATH), READINESS_TEXT)
  }, false)
}
export async function testGeneratedPromotionRetainsDisabledSyncRetry() {
  await withPromotionFixture(async ({ fs, options, events }) => {
    const result = await retryGeneratedChatWorkspaceArtifactPromotion({ ...options, storageSyncNow: false })
    assertRetainedRetry(result)
    assert.deepEqual(events, ['github:write'])
    assert.equal(await fs.readFileText(READINESS_PATH), READINESS_TEXT)
  })
}

const isDocumentRead = (input: RequestInfo | URL, init?: RequestInit) => {
  const request = createStorageWorkerRequest(input, init)
  return request.method === 'GET' && new URL(request.url).pathname.includes('/doc/')
}

export async function testGeneratedPromotionRetriesExactRemoteBytes() {
  await withPromotionFixture(async ({ fs, options, githubBodies }) => {
    const nativeFetch = options.storageFetchImpl!
    let rejectRead = true, readCount = 0
    options.storageFetchImpl = async (input, init) => {
      if (isDocumentRead(input, init)) {
        readCount += 1
        if (rejectRead) return new Response('Not found', { status: 404 })
      }
      return nativeFetch(input, init)
    }
    assertRetainedRetry(await retryGeneratedChatWorkspaceArtifactPromotion(options))
    assert.equal(await fs.readFileText(READINESS_PATH), READINESS_TEXT)
    rejectRead = false
    const retried = await retryGeneratedChatWorkspaceArtifactPromotion(options)
    assert.equal(retried.promotion, 'MIRRORED_GITHUB+STORAGE')
    assert.equal(retried.failureNote, null)
    assert.equal(retried.retryCommand, null)
    assert.equal(readCount, 2, 'A retry must freshly verify its selected private document')
    assert.deepEqual(githubBodies, [READINESS_TEXT, READINESS_TEXT])
    assert.equal(await fs.readFileText(READINESS_PATH), READINESS_TEXT)
  })
}

export async function testGeneratedPromotionRejectsWrongRemoteBytes() {
  for (const response of [
    () => new Response('Denied', { status: 403 }),
    () => new Response(READINESS_TEXT + 'extra'),
    () => new Response(READINESS_TEXT.slice(1)),
    () => new Response(READINESS_TEXT.replace('\u0000', '')),
    () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('readback interrupted')) } })),
  ]) await withPromotionFixture(async ({ fs, options }) => {
    const nativeFetch = options.storageFetchImpl!
    options.storageFetchImpl = (input, init) => isDocumentRead(input, init)
      ? Promise.resolve(response()) : nativeFetch(input, init)
    assertRetainedRetry(await retryGeneratedChatWorkspaceArtifactPromotion(options))
    assert.equal(await fs.readFileText(READINESS_PATH), READINESS_TEXT)
  })
}

export async function testGeneratedPromotionRejectsUnrelatedSyncProgress() {
  await withPromotionFixture(async ({ fs, env, options }) => {
    await publishWorkspaceEntriesToAgenticGraphStorage({
      workspaceId: options.storageWorkspaceId, syncNow: false,
      entries: [{ path: '/chat-log/readiness/unrelated.md', parentPath: '/chat-log/readiness', kind: 'file', name: 'unrelated.md', text: '# Unrelated progress', updatedAtMs: 1 }],
    })
    const nativeFetch = options.storageFetchImpl!
    options.storageFetchImpl = async (input, init) => {
      const request = createStorageWorkerRequest(input, init)
      if (new URL(request.url).pathname.endsWith('/push')) {
        const body = await request.json() as { mutations: Array<{ record: { canonicalPath?: string } }> }
        body.mutations = body.mutations.filter(row => row.record.canonicalPath?.endsWith('unrelated.md'))
        return nativeFetch(request.url, { ...init, body: JSON.stringify(body) })
      }
      return nativeFetch(input, init)
    }
    assertRetainedRetry(await retryGeneratedChatWorkspaceArtifactPromotion(options))
    const unrelated = await readStorageWorker().fetch(new Request('https://storage.example' + buildAgenticGraphStorageDocPath(options.storageWorkspaceId!, 'chat-log/readiness/unrelated.md')), env as never)
    assert.equal(await unrelated.text(), '# Unrelated progress')
    assert.equal(await fs.readFileText(READINESS_PATH), READINESS_TEXT)
  })
}

export async function testGeneratedPromotionRetainsConcurrentSelectedChanges() {
  for (const change of ['workspace', 'outbox', 'conflict', 'visible'] as const) {
    await withPromotionFixture(async ({ fs, options }) => {
      const nativeFetch = options.storageFetchImpl!
      let changed = false
      options.storageFetchImpl = async (input, init) => {
        const response = await nativeFetch(input, init)
        if (isDocumentRead(input, init)) {
          changed = true
          if (change === 'workspace') await fs.writeFileText(READINESS_PATH, '# Newer saved artifact')
          else if (change === 'visible') {
            const collection = (await getAgenticGraphStorageDb()).collections.syncConflicts
            const originalFind = collection.find.bind(collection)
            collection.find = query => {
              const cursor = originalFind(query), originalExec = cursor.exec.bind(cursor)
              cursor.exec = async () => {
                const rows = await originalExec()
                collection.find = originalFind
                useGraphStore.setState({ markdownDocumentName: READINESS_PATH, markdownDocumentText: '# Newer visible draft' })
                return rows
              }
              return cursor
            }
          } else {
            const db = await getAgenticGraphStorageDb()
            const rows = await db.collections.documents.find({ selector: { workspaceId: options.storageWorkspaceId! } }).exec()
            const local = rows.find(row => row.get('canonicalPath') === READINESS_PATH.slice(1))!.toJSON()
            const record = toAgenticGraphRemoteDocumentRecord(local)
            if (change === 'outbox') await db.collections.syncOutbox.incrementalUpsert(createAgenticGraphStorageOutboxRecord({
              workspaceId: options.storageWorkspaceId!, entity: 'document', op: 'upsert', record, baseRevision: record.revision,
            }))
            else await db.collections.syncConflicts.incrementalUpsert({
              id: 'concurrent-selected-conflict', workspaceId: options.storageWorkspaceId!, entity: 'document', recordId: record.id,
              mutationId: 'concurrent-selected-conflict', serverRevision: record.revision, remoteRecord: record, receivedAtMs: Date.now(),
            })
          }
        }
        return response
      }
      assertRetainedRetry(await retryGeneratedChatWorkspaceArtifactPromotion(options))
      assert.equal(changed, true)
      assert.equal(await fs.readFileText(READINESS_PATH), change === 'workspace' ? '# Newer saved artifact' : READINESS_TEXT)
      if (change === 'visible') assert.equal(useGraphStore.getState().markdownDocumentText, '# Newer visible draft')
      if (change === 'outbox' || change === 'conflict') {
        const db = await getAgenticGraphStorageDb()
        const rows = await db.collections[change === 'outbox' ? 'syncOutbox' : 'syncConflicts'].find({ selector: { workspaceId: options.storageWorkspaceId! } }).exec()
        assert.equal(rows.length, 1, 'Verification must retain the concurrent selected record')
      }
    })
  }
}

export async function testGeneratedPromotionSharesSelectedReadbackBudget() {
  await withPromotionFixture(async ({ fs, options }) => {
    const secondPath = '/chat-log/readiness/trace.md'
    await fs.deleteEntry(secondPath)
    await fs.createFile({ parentPath: '/chat-log/readiness', name: 'trace.md', text: '# Exact trace' })
    const signals: AbortSignal[] = []
    const nativeFetch = options.storageFetchImpl!
    options.storageFetchImpl = async (input, init) => {
      if (isDocumentRead(input, init)) {
        assert.ok(init?.signal)
        signals.push(init.signal)
      }
      return nativeFetch(input, init)
    }
    const result = await retryGeneratedChatWorkspaceArtifactPromotion({ ...options, paths: [READINESS_PATH, secondPath] })
    assert.equal(result.storageStatus, 'applied')
    assert.equal(result.retryCommand, null)
    assert.equal(signals.length, 2)
    assert.equal(signals[0], signals[1], 'Selected remote reads must share one aggregate deadline signal')
    assert.equal(signals[0].aborted, true, 'Completed readback must release its shared controller')
    assert.equal(await fs.readFileText(READINESS_PATH), READINESS_TEXT)
    assert.equal(await fs.readFileText(secondPath), '# Exact trace')
  })
}
