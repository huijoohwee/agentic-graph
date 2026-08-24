import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import Dexie from 'dexie'
import { IDBKeyRange, indexedDB as fakeIndexedDB } from 'fake-indexeddb'
import { createFakeKnowgrphStorageWorkerEnv, type FakeKnowgrphStorageD1Database } from '@/__tests__/helpers/fakeKnowgrphStorageD1'
import { readStorageWorker } from '@/__tests__/helpers/fakeKnowgrphStorageWorkerFetch'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { __resetKnowgrphStorageDbForTests, getKnowgrphStorageDb } from '@/lib/storage/knowgrphStorageDb'
import { readCanonicalCloudDocumentSnapshot, resolveSourceFileCanonicalCloudTarget, syncWorkspaceEntryToCloudWorkspaceSnapshot, syncWorkspaceEntryToCanonicalCloud } from '@/features/source-files/sourceFileCanonicalCloudSync'
import { syncSourceFilesToKnowgrphStorage } from '@/features/source-files/sourceFilesStorageSync'
import { SourceFileCloudSyncIndicator, resolveSourceFileCloudSyncStatus } from '@/features/markdown-workspace/SourceFileCloudSyncIndicator'
import { beginKnowgrphStorageBrowserSignIn, readKnowgrphStorageBrowserSession } from '@/lib/storage/knowgrphStorageBrowserSession'
import { buildKnowgrphStorageSyncAuthHeaders, getClientFetch } from '@/lib/storage/knowgrphStorageClientTransport'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const SESSION_TOKEN = 'source-file-cloud-session-token-00000001'

const hashToken = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

const seedAuthenticatedWorkspace = async (db: FakeKnowgrphStorageD1Database, workspaceId: string): Promise<void> => {
  const nowIso = '2026-07-24T00:00:00.000Z'
  db.users.set('user:source-file-cloud', {
    id: 'user:source-file-cloud',
    email: 'source-file-cloud@example.com',
    display_name: 'Source File Cloud',
    status: 'active',
  })
  db.authSessions.set('session:source-file-cloud', {
    id: 'session:source-file-cloud',
    user_id: 'user:source-file-cloud',
    session_hash: await hashToken(SESSION_TOKEN),
    expires_at: '2036-01-01T00:00:00.000Z',
    revoked_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  })
  db.workspaceMemberships.set(`membership:${workspaceId}`, {
    id: `membership:${workspaceId}`,
    workspace_id: workspaceId,
    user_id: 'user:source-file-cloud',
    role: 'editor',
    status: 'active',
  })
}

type MutableStorageGlobals = typeof globalThis & { indexedDB?: IDBFactory, IDBKeyRange?: typeof globalThis.IDBKeyRange }

const withDurableBrowserStorage = async <Result,>(callback: () => Promise<Result>): Promise<Result> => {
  const root = globalThis as MutableStorageGlobals
  const prior = [process.env.NODE_ENV, process.env.KG_TEST_QUIET, root.indexedDB, root.IDBKeyRange, Dexie.dependencies.indexedDB, Dexie.dependencies.IDBKeyRange] as const
  try {
    process.env.NODE_ENV = 'development'
    process.env.KG_TEST_QUIET = '0'
    root.indexedDB = fakeIndexedDB
    root.IDBKeyRange = IDBKeyRange
    Dexie.dependencies.indexedDB = fakeIndexedDB
    Dexie.dependencies.IDBKeyRange = IDBKeyRange
    await __resetKnowgrphStorageDbForTests()
    return await callback()
  } finally {
    await __resetKnowgrphStorageDbForTests()
    if (prior[0] === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = prior[0]
    if (prior[1] === undefined) delete process.env.KG_TEST_QUIET
    else process.env.KG_TEST_QUIET = prior[1]
    if (prior[2] === undefined) delete root.indexedDB
    else root.indexedDB = prior[2]
    if (prior[3] === undefined) delete root.IDBKeyRange
    else root.IDBKeyRange = prior[3]
    Dexie.dependencies.indexedDB = prior[4]
    Dexie.dependencies.IDBKeyRange = prior[5]
  }
}

const withBrowserSessionCookie = (request: Request): Request => {
  const headers = new Headers(request.headers)
  headers.set('cookie', `__Host-kg_storage_session=${SESSION_TOKEN}`)
  if (!['GET', 'HEAD'].includes(request.method)) headers.set('origin', new URL(request.url).origin)
  return new Request(request, { headers })
}

export async function testSourceFileCloudUploadCommitsGitHubBeforeCloudflareAndVerifiesReadBack() {
  return withDurableBrowserStorage(async () => {
  const { restore: restoreDom } = initJsdomHarness()
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const previousFetch = globalThis.fetch
  const env = Object.assign(createFakeKnowgrphStorageWorkerEnv(), { KNOWGRPH_STORAGE_DEV_REMOTE_RELAY_ENABLED: 'true', KNOWGRPH_STORAGE_GITHUB_TOKEN: 'test-token', KNOWGRPH_STORAGE_GITHUB_OWNER: 'huijoohwee', KNOWGRPH_STORAGE_GITHUB_WORKSPACE_REPO: 'huijoohwee', KNOWGRPH_STORAGE_GITHUB_BRANCH: 'main' })
  const events: string[] = []
  const saveAuthorizations: string[] = []
  let committedText = ''
  const workspaceId = 'kgws:test-source-file-cloud-sync'
  try {
    resetWorkspaceFsForTests()
    await __resetKnowgrphStorageDbForTests()
    await seedAuthenticatedWorkspace(env.DB, workspaceId)
    const fs = await getWorkspaceFs()
    const path = await fs.createFile({ parentPath: '/', name: 'note-cloud-sync.md', text: '# New cloud note\n\nGitHub first, Cloudflare second.' })
    const entry = (await fs.listEntries()).find(candidate => candidate.path === path)
    if (!entry) throw new Error('expected created workspace entry')

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = String(init?.method || 'GET').toUpperCase()
      if (method === 'GET') return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404, headers: { 'content-type': 'application/json' } })
      const body = JSON.parse(String(init?.body || '{}'))
      committedText = Buffer.from(String(body.content || ''), 'base64').toString('utf8')
      return new Response(JSON.stringify({ content: { sha: 'content-sha-cloud-sync' }, commit: { sha: 'commit-sha-cloud-sync' } }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = withBrowserSessionCookie(input instanceof Request
        ? input
        : new Request(new URL(String(input), 'http://localhost'), init))
      events.push(`${request.method}:${new URL(request.url).pathname}`)
      if (new URL(request.url).pathname === '/api/storage/collab/save') saveAuthorizations.push(String(request.headers.get('authorization') || ''))
      return readStorageWorker().fetch(request, env as never)
    }

    const snapshotPath = await fs.createFile({ parentPath: '/', name: 'selected-only.md', text: '# Selected snapshot' })
    const siblingPath = await fs.createFile({ parentPath: '/', name: 'sibling.md', text: '# Sibling snapshot' })
    await fs.createFile({ parentPath: '/', name: 'sibling.json', text: '{"sibling":true}' })
    const entries = await fs.listEntries()
    const snapshotEntry = entries.find(candidate => candidate.path === snapshotPath)
    const siblingEntry = entries.find(candidate => candidate.path === siblingPath)
    if (!snapshotEntry || !siblingEntry) throw new Error('expected selected snapshot and sibling workspace entries')
    const siblingCanonicalPaths = new Set(['huijoohwee/docs/sibling.md', 'sibling.json'])
    const pushedMutations: Array<{ op?: string, record?: { canonicalPath?: string } }> = []
    const touchesSibling = () => pushedMutations.some(mutation => (mutation.op === 'delete' || mutation.op === 'upsert') && siblingCanonicalPaths.has(String(mutation.record?.canonicalPath || '')))
    const cookieFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = withBrowserSessionCookie(input instanceof Request
        ? input
        : new Request(new URL(String(input), 'http://localhost'), init))
      const url = new URL(request.url)
      events.push(`${request.method}:${url.pathname}`)
      if (url.pathname === '/api/storage/push') {
        const body = await request.clone().json() as { mutations?: Array<{ op?: string, record?: { canonicalPath?: string } }> }
        pushedMutations.push(...(body.mutations || []))
      }
      return readStorageWorker().fetch(request, env as never)
    }
    // The seed is flushed first; later local edits have no pre-existing outbox mutation to filter.
    await syncWorkspaceEntryToCloudWorkspaceSnapshot({ entry: siblingEntry, workspaceId, fetchImpl: cookieFetch })
    await fs.writeFileText(siblingPath, '# Changed only locally')
    await fs.writeFileText(snapshotPath, '# Selected snapshot update')
    events.length = 0
    pushedMutations.length = 0
    const sharedSnapshot = await syncWorkspaceEntryToCloudWorkspaceSnapshot({ entry: snapshotEntry, workspaceId, fetchImpl: cookieFetch })
    if (events.includes('POST:/api/storage/collab/save') || !events.includes('GET:/api/storage/export/kgws%3Atest-source-file-cloud-sync') || touchesSibling()
      || 'githubPath' in sharedSnapshot || 'repositoryTarget' in sharedSnapshot) {
      throw new Error(`expected selected snapshot to preserve changed Markdown and JSON siblings, got ${JSON.stringify({ events, pushedMutations, sharedSnapshot })}`)
    }
    const defaultReconcile = await syncSourceFilesToKnowgrphStorage({ workspaceId, sourceFiles: [] })
    const selectedSnapshotRow = (await (await getKnowgrphStorageDb()).collections.documents.find({ selector: { workspaceId } }).exec()).find(row => String(row.get('canonicalPath') || '') === sharedSnapshot.canonicalPath)
    if (defaultReconcile.queuedMutationCount !== 0 || !selectedSnapshotRow || selectedSnapshotRow.get('isDeleted') === true) throw new Error('expected an omitted prior Source Files inventory to preserve the selected shared snapshot')
    const readRemoteTarget = () => Array.from(env.DB.documents.entries()).find(([, record]) => record.workspace_id === workspaceId && record.canonical_path === sharedSnapshot.canonicalPath)
    const remoteTarget = readRemoteTarget()
    if (!remoteTarget) throw new Error('expected selected snapshot to exist in the remote workspace before deletion')
    env.DB.documents.delete(remoteTarget[0])
    events.length = 0
    pushedMutations.length = 0
    const restoredSnapshot = await syncWorkspaceEntryToCloudWorkspaceSnapshot({ entry: snapshotEntry, workspaceId, fetchImpl: cookieFetch })
    const restoredRemote = readRemoteTarget()
    const restoredExport = await readCanonicalCloudDocumentSnapshot({ workspaceId, fetchImpl: cookieFetch })
    if (!restoredRemote || String(restoredRemote[1].content_md || '') !== restoredSnapshot.syncedText || restoredExport.get(sharedSnapshot.canonicalPath) !== restoredSnapshot.syncedText || !pushedMutations.some(mutation => mutation.op === 'upsert' && mutation.record?.canonicalPath === sharedSnapshot.canonicalPath) || events.includes('POST:/api/storage/collab/save') || touchesSibling()) throw new Error('expected an unchanged explicit snapshot click to restore only its remotely deleted target')
    const newerRemoteText = '# Newer remote revision'
    env.DB.documents.set(restoredRemote[0], { ...restoredRemote[1], content_md: newerRemoteText, content_hash: 'remote-newer-hash', revision: Number(restoredRemote[1].revision || 0) + 1, updated_at: '2036-01-01T00:00:00.000Z' })
    events.length = 0
    pushedMutations.length = 0
    let conflict = false
    try { await syncWorkspaceEntryToCloudWorkspaceSnapshot({ entry: snapshotEntry, workspaceId, fetchImpl: cookieFetch }) } catch (error) { conflict = String(error).includes('read-back did not match') }
    const afterConflict = readRemoteTarget()?.[1]
    if (!conflict || String(afterConflict?.content_md || '') !== newerRemoteText || !pushedMutations.some(mutation => mutation.op === 'upsert' && mutation.record?.canonicalPath === sharedSnapshot.canonicalPath) || events.includes('POST:/api/storage/collab/save') || touchesSibling()) throw new Error('expected a newer remote revision to remain non-overwriting for an explicit target snapshot')
    await __resetKnowgrphStorageDbForTests()
    events.length = 0
    const result = await syncWorkspaceEntryToCanonicalCloud({ entry, workspaceId, baseUrl: '', sessionToken: SESSION_TOKEN, fetchImpl })

    if (result.githubPath !== 'docs/note-cloud-sync.md') {
      throw new Error(`expected root New .md to commit under canonical GitHub docs, got ${result.githubPath}`)
    }
    if (result.repositoryTarget !== 'workspace-docs'
      || result.canonicalPath !== 'huijoohwee/docs/note-cloud-sync.md'
      || result.readBackVerified !== true) {
      throw new Error(`expected verified canonical Cloudflare path, got ${JSON.stringify(result)}`)
    }
    if (committedText !== '# New cloud note\n\nGitHub first, Cloudflare second.') {
      throw new Error(`expected GitHub commit to receive saved local text, got ${JSON.stringify(committedText)}`)
    }
    const githubEventIndex = events.indexOf('POST:/api/storage/collab/save')
    const cloudflarePushEventIndex = events.indexOf('POST:/api/storage/push')
    if (githubEventIndex < 0 || cloudflarePushEventIndex <= githubEventIndex) {
      throw new Error(`expected GitHub bridge before Cloudflare push, got ${events.join(', ')}`)
    }
    if (saveAuthorizations[0] !== `Bearer ${SESSION_TOKEN}`) {
      throw new Error('expected canonical cloud save to authenticate the GitHub bridge')
    }
    const snapshot = await readCanonicalCloudDocumentSnapshot({ workspaceId: result.workspaceId, baseUrl: '', fetchImpl })
    if (snapshot.get(result.canonicalPath) !== committedText) {
      throw new Error('expected exported Cloudflare snapshot to equal the canonical GitHub content')
    }

    events.length = 0
    await syncWorkspaceEntryToCanonicalCloud({ entry, workspaceId: result.workspaceId, baseUrl: '', sessionToken: SESSION_TOKEN, fetchImpl })
    if (events.indexOf('POST:/api/storage/collab/save') < 0
      || events.indexOf('POST:/api/storage/push') <= events.indexOf('POST:/api/storage/collab/save')) {
      throw new Error(`expected a cloud-icon retry to force GitHub and D1 in order, got ${events.join(', ')}`)
    }

    const emptyPath = await fs.createFile({ parentPath: '/', name: 'empty-new-note.md', text: '' })
    const emptyEntry = (await fs.listEntries()).find(candidate => candidate.path === emptyPath)
    if (!emptyEntry) throw new Error('expected empty New .md workspace entry')
    const emptyResult = await syncWorkspaceEntryToCanonicalCloud({ entry: emptyEntry, workspaceId: result.workspaceId, baseUrl: '', sessionToken: SESSION_TOKEN, fetchImpl })
    const snapshotWithEmptyDocument = await readCanonicalCloudDocumentSnapshot({ workspaceId: result.workspaceId, baseUrl: '', fetchImpl })
    if (!snapshotWithEmptyDocument.has(emptyResult.canonicalPath)
      || snapshotWithEmptyDocument.get(emptyResult.canonicalPath) !== '') {
      throw new Error('expected an empty New .md file to remain a valid canonical cloud document')
    }
  } finally {
    globalThis.fetch = previousFetch
    await __resetKnowgrphStorageDbForTests()
    resetWorkspaceFsForTests()
    restoreWindow()
    restoreDom()
  }
  })
}

export async function testSourceFileCloudUploadReusesMatchingProtectedGitHubContent() {
  return withDurableBrowserStorage(async () => {
  const { restore: restoreDom } = initJsdomHarness()
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const previousFetch = globalThis.fetch
  const env = Object.assign(createFakeKnowgrphStorageWorkerEnv(), {
    KNOWGRPH_STORAGE_DEV_REMOTE_RELAY_ENABLED: 'true',
    KNOWGRPH_STORAGE_GITHUB_TOKEN: 'test-token',
    KNOWGRPH_STORAGE_GITHUB_OWNER: 'huijoohwee',
    KNOWGRPH_STORAGE_GITHUB_KNOWGRPH_REPO: 'knowgrph',
    KNOWGRPH_STORAGE_GITHUB_BRANCH: 'main',
  })
  const githubMethods: string[] = []
  const text = '# Existing canonical document\n'
  try {
    resetWorkspaceFsForTests()
    await __resetKnowgrphStorageDbForTests()
    await seedAuthenticatedWorkspace(
      env.DB,
      'kgws:test-source-file-protected-noop',
    )
    const fs = await getWorkspaceFs()
    const repositoryRoot = await fs.createFolder({ parentPath: '/', name: 'knowgrph' })
    const docsRoot = await fs.createFolder({ parentPath: repositoryRoot, name: 'docs' })
    const path = await fs.createFile({ parentPath: docsRoot, name: 'existing.md', text })
    const entry = (await fs.listEntries()).find(candidate => candidate.path === path)
    if (!entry) throw new Error('expected existing canonical workspace entry')

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = String(init?.method || 'GET').toUpperCase()
      githubMethods.push(method)
      if (method !== 'GET') throw new Error(`expected matching GitHub content to avoid writes, got ${method}`)
      return new Response(JSON.stringify({
        sha: 'existing-content-sha',
        content: Buffer.from(text, 'utf8').toString('base64'),
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const result = await syncWorkspaceEntryToCanonicalCloud({
      entry,
      workspaceId: 'kgws:test-source-file-protected-noop',
      baseUrl: '',
      sessionToken: SESSION_TOKEN,
      fetchImpl: async (input, init) => {
        const request = withBrowserSessionCookie(input instanceof Request
          ? input
          : new Request(
              new URL(String(input), 'http://localhost'),
              init,
            ))
        if (
          new URL(request.url).pathname === '/api/storage/collab/save'
          && request.headers.get('authorization') !== `Bearer ${SESSION_TOKEN}`
        ) {
          throw new Error('expected protected save to authenticate the bridge')
        }
        return readStorageWorker().fetch(request, env as never)
      },
    })
    if (githubMethods.join('|') !== 'GET') {
      throw new Error(`expected one read-only GitHub check, got ${githubMethods.join(',')}`)
    }
    if (result.contentSha !== 'existing-content-sha' || result.readBackVerified !== true) {
      throw new Error(`expected matching protected content and D1 read-back, got ${JSON.stringify(result)}`)
    }
    if (result.githubPath !== 'docs/existing.md') {
      throw new Error(`expected repository-root workspace path to normalize once, got ${result.githubPath}`)
    }
    if (result.repositoryTarget !== 'knowgrph-docs' || result.canonicalPath !== 'knowgrph/docs/existing.md') {
      throw new Error(`expected product docs to retain knowgrph authority, got ${JSON.stringify(result)}`)
    }
  } finally {
    globalThis.fetch = previousFetch
    await __resetKnowgrphStorageDbForTests()
    resetWorkspaceFsForTests()
    restoreWindow()
    restoreDom()
  }
  })
}

export async function testSourceFileCloudUploadStopsBeforeCloudflareWhenGitHubBridgeFails() {
  const { restore: restoreDom } = initJsdomHarness()
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const calls: string[] = []
  try {
    resetWorkspaceFsForTests()
    await __resetKnowgrphStorageDbForTests()
    const fs = await getWorkspaceFs()
    const path = await fs.createFile({ parentPath: '/', name: 'local-only.md', text: '# Local only' })
    const entry = (await fs.listEntries()).find(candidate => candidate.path === path)
    if (!entry) throw new Error('expected created workspace entry')
    let rejected = false
    try {
      await syncWorkspaceEntryToCanonicalCloud({
        entry,
        workspaceId: 'kgws:test-source-file-cloud-failure',
      baseUrl: '',
        sessionToken: SESSION_TOKEN,
        fetchImpl: async (input, init) => {
          const pathname = new URL(String(input), 'https://storage.example').pathname
          if (
            new Headers(init?.headers).get('authorization')
            !== `Bearer ${SESSION_TOKEN}`
          ) {
            throw new Error('expected failed bridge calls to stay authenticated')
          }
          calls.push(pathname)
          return new Response(JSON.stringify({ ok: false, error: 'missing GitHub bridge token' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          })
        },
      })
    } catch (error) {
      rejected = String(error).includes('missing GitHub bridge token')
    }
    if (!rejected
      || calls.length !== 3
      || calls.some(pathname => pathname !== '/api/storage/collab/save')) {
      throw new Error(`expected three bounded GitHub retries to keep D1 untouched, got rejected=${rejected} calls=${calls.join(',')}`)
    }
  } finally {
    await __resetKnowgrphStorageDbForTests()
    resetWorkspaceFsForTests()
    restoreWindow()
    restoreDom()
  }
}

export async function testSourceFileCloudUploadRejectsMissingSessionBeforeNetwork() {
  const harness = initJsdomHarness()
  const previousToken = process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN
  let fetchCalls = 0
  let observedCredentials = ''
  let observedAuthorization = 'not-read'
  try {
    process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN = 'must-not-be-used-in-browser'
    const unauthenticated = await readKnowgrphStorageBrowserSession({
      workspaceId: 'kgws:browser-session-test',
      fetchImpl: async (input, init) => {
        fetchCalls += 1
        const url = new URL(String(input))
        if (url.pathname !== '/api/storage/auth/session') {
          throw new Error(`expected the browser session endpoint, got ${url.pathname}`)
        }
        if (url.searchParams.get('workspace_id') !== 'kgws:browser-session-test') {
          throw new Error(`expected workspace-scoped session check, got ${url.search}`)
        }
        observedCredentials = String(init?.credentials || '')
        observedAuthorization = new Headers(init?.headers).get('authorization') || ''
        return new Response(JSON.stringify({ ok: false, error: 'unauthenticated' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      },
    })
    if (unauthenticated.status !== 'unauthenticated' || fetchCalls !== 1) {
      throw new Error(`expected one unauthenticated browser session check, got ${JSON.stringify(unauthenticated)}`)
    }
    if (observedCredentials !== 'same-origin' || observedAuthorization !== '') {
      throw new Error('expected browser session checks to use only same-origin cookies, never a bearer header')
    }
    if (Object.keys(buildKnowgrphStorageSyncAuthHeaders()).length !== 0) {
      throw new Error('expected a public Vite session token to be ignored by generic storage transport')
    }

    const denied = await readKnowgrphStorageBrowserSession({
      fetchImpl: async () => new Response(JSON.stringify({ ok: false, error: 'access-denied' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    })
    if (denied.status !== 'access-denied') {
      throw new Error(`expected membership denial to remain non-retryable, got ${JSON.stringify(denied)}`)
    }

    const unavailable = await readKnowgrphStorageBrowserSession({
      fetchImpl: async () => new Response(JSON.stringify({ ok: false, error: 'access-unconfigured' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    })
    if (unavailable.status !== 'unavailable') {
      throw new Error(`expected an unconfigured Access boundary to fail closed, got ${JSON.stringify(unavailable)}`)
    }

    const globalScope = globalThis as unknown as { window?: unknown }
    const browserWindow = globalScope.window
    let crossOriginFetchCalls = 0
    try {
      globalScope.window = {
        location: {
          origin: 'https://canvas.example.test',
          hostname: 'canvas.example.test',
          pathname: '/',
          search: '',
        },
      }
      const crossOrigin = await readKnowgrphStorageBrowserSession({
        baseUrl: 'https://storage.example.test',
        fetchImpl: async () => {
          crossOriginFetchCalls += 1
          throw new Error('cross-origin browser session request must not be sent')
        },
      })
      if (crossOrigin.status !== 'unavailable' || crossOriginFetchCalls !== 0) {
        throw new Error(`expected cross-origin storage configuration to fail before fetch, got ${JSON.stringify(crossOrigin)}`)
      }
      let transportFetchCalls = 0
      const storageFetch = getClientFetch(async () => {
        transportFetchCalls += 1
        return new Response('{}', { headers: { 'content-type': 'application/json' } })
      })
      for (const [url, init] of [
        ['https://storage.example.test/api/storage/push', { method: 'POST', body: '{"workspaceId":"private"}' }],
        ['https://storage.example.test/api/storage/pull', { method: 'POST', body: '{"workspaceId":"private"}' }],
        ['https://storage.example.test/api/storage/export/private', { method: 'GET' }],
      ] as const) {
        let rejected = false
        try { await storageFetch(url, init) } catch (error) { rejected = String(error).includes('must use this browser') }
        if (!rejected) throw new Error(`expected browser transport to reject cross-origin ${url} before fetch`)
      }
      if (transportFetchCalls !== 0) throw new Error('expected cross-origin push, pull, and export to make no fetch calls')
    } finally {
      globalScope.window = browserWindow
    }

    let loginDestination = ''
    beginKnowgrphStorageBrowserSignIn({
      returnTo: '/?kgPath=%2Fknowgrph%2F',
      navigate: destination => { loginDestination = destination },
    })
    const loginUrl = new URL(loginDestination)
    if (
      loginUrl.pathname !== '/api/storage/auth/login'
      || loginUrl.searchParams.get('return_to') !== '/?kgPath=%2Fknowgrph%2F'
    ) {
      throw new Error(`expected sign-in to keep a relative return path, got ${loginDestination}`)
    }
  } finally {
    if (typeof previousToken === 'string') {
      process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN = previousToken
    } else {
      delete process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN
    }
    harness.restore()
  }
}

export async function testSourceFileCloudIndicatorShowsLocalAndCloudStatesAndUploadsOnClick() {
  const harness = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const container = harness.dom.window.document.getElementById('root')
  if (!container) throw new Error('missing test root')
  const entry: WorkspaceEntry = {
    path: '/new-note.md',
    parentPath: '/',
    kind: 'file',
    name: 'new-note.md',
    text: '# New note',
    updatedAtMs: 1,
  }
  const target = resolveSourceFileCanonicalCloudTarget(entry.path)
  if (!target) throw new Error('expected Markdown file to have a canonical cloud target')
  const root = createRoot(container)
  let uploadCount = 0
  try {
    const localStatus = resolveSourceFileCloudSyncStatus({
      entry,
      remoteContentByCanonicalPath: new Map(),
      snapshotStatus: 'ready',
    })
    await act(async () => {
      root.render(<SourceFileCloudSyncIndicator entry={entry} status={localStatus} onUpload={() => { uploadCount += 1 }} />)
      await tick()
    })
    const localButton = container.querySelector('button[data-source-file-cloud-status="local"]') as HTMLButtonElement | null
    if (!localButton || !String(localButton.getAttribute('aria-label')).includes('Upload a shared cloud snapshot')) {
      throw new Error('expected local indicator to expose the shared cloud snapshot action')
    }
    await act(async () => {
      localButton.dispatchEvent(new harness.dom.window.MouseEvent('click', { bubbles: true }))
      await tick()
    })
    if (uploadCount !== 1) throw new Error(`expected local icon click to upload once, got ${uploadCount}`)

    const cloudStatus = resolveSourceFileCloudSyncStatus({
      entry,
      remoteContentByCanonicalPath: new Map([[target.canonicalPath, '# New note']]),
      snapshotStatus: 'ready',
    })
    await act(async () => {
      root.render(<SourceFileCloudSyncIndicator entry={entry} status={cloudStatus} onUpload={() => { uploadCount += 1 }} />)
      await tick()
    })
    const cloudButton = container.querySelector('button[data-source-file-cloud-status="cloud"]')
    if (!cloudButton || !String(cloudButton.getAttribute('aria-label')).startsWith('Cloud synced: new-note.md')) {
      throw new Error('expected matching remote content to render a cloud-synced indicator')
    }

    const authRequiredStatus = resolveSourceFileCloudSyncStatus({
      entry,
      remoteContentByCanonicalPath: new Map(),
      snapshotStatus: 'auth-required',
    })
    await act(async () => {
      root.render(<SourceFileCloudSyncIndicator entry={entry} status={authRequiredStatus} onUpload={() => { uploadCount += 1 }} />)
      await tick()
    })
    const authRequiredButton = container.querySelector('button[data-source-file-cloud-status="auth-required"]') as HTMLButtonElement | null
    if (
      !authRequiredButton
      || authRequiredButton.disabled
      || !String(authRequiredButton.getAttribute('aria-label')).includes('requires sign-in')
      || String(authRequiredButton.getAttribute('aria-label')).includes('Retry')
    ) {
      throw new Error('expected sign-in-required state to replace the futile retry action')
    }
    await act(async () => {
      authRequiredButton.dispatchEvent(new harness.dom.window.MouseEvent('click', { bubbles: true }))
      await tick()
    })
    if (Number(uploadCount) !== 2) throw new Error(`expected sign-in-required indicator click to begin sign-in once, got ${uploadCount}`)

    const accessRequiredStatus = resolveSourceFileCloudSyncStatus({
      entry,
      remoteContentByCanonicalPath: new Map(),
      snapshotStatus: 'access-required',
    })
    await act(async () => {
      root.render(<SourceFileCloudSyncIndicator entry={entry} status={accessRequiredStatus} onUpload={() => { uploadCount += 1 }} />)
      await tick()
    })
    const accessRequiredButton = container.querySelector('button[data-source-file-cloud-status="access-required"]') as HTMLButtonElement | null
    if (!accessRequiredButton || !accessRequiredButton.disabled || !String(accessRequiredButton.getAttribute('aria-label')).includes('access is required')) {
      throw new Error('expected membership denial to disable retry and preserve the local copy')
    }
  } finally {
    await act(async () => {
      root.unmount()
      await tick()
    })
    harness.restore()
  }
}

export function testSourceFileCloudTargetsRespectDocumentRepositoryAuthority() {
  const workspace = resolveSourceFileCanonicalCloudTarget('/docs/team-note.md')
  const product = resolveSourceFileCanonicalCloudTarget('/knowgrph/docs/documents/storage.md')
  const seed = resolveSourceFileCanonicalCloudTarget('/docs/workspace-seeds/demo.md')
  const staleWorkspaceSeed = resolveSourceFileCanonicalCloudTarget('/huijoohwee/docs/workspace-seeds/demo.md')
  const governance = resolveSourceFileCanonicalCloudTarget('/agentic-canvas-os/docs/FACTS.md')
  if (workspace?.repositoryTarget !== 'workspace-docs' || workspace.canonicalPath !== 'huijoohwee/docs/team-note.md') {
    throw new Error(`expected collaborative docs to route to huijoohwee/docs, got ${JSON.stringify(workspace)}`)
  }
  if (product?.repositoryTarget !== 'knowgrph-docs' || product.canonicalPath !== 'knowgrph/docs/documents/storage.md') {
    throw new Error(`expected product docs to route to knowgrph/docs, got ${JSON.stringify(product)}`)
  }
  if (seed?.repositoryTarget !== 'knowgrph-docs' || seed.canonicalPath !== 'knowgrph/docs/workspace-seeds/demo.md') {
    throw new Error(`expected workspace seeds to remain authored in knowgrph/docs, got ${JSON.stringify(seed)}`)
  }
  if (staleWorkspaceSeed !== null) throw new Error('expected the duplicate huijoohwee workspace-seeds root to be read-only')
  if (governance !== null) throw new Error('expected Agentic Canvas OS governance docs to remain read-only')
}
