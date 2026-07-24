import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createFakeKnowgrphStorageWorkerEnv,
  type FakeKnowgrphStorageD1Database,
} from '@/__tests__/helpers/fakeKnowgrphStorageD1'
import { readStorageWorker } from '@/__tests__/helpers/fakeKnowgrphStorageWorkerFetch'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { __resetKnowgrphStorageDbForTests } from '@/lib/storage/knowgrphStorageDb'
import {
  readCanonicalCloudDocumentSnapshot,
  resolveSourceFileCanonicalCloudTarget,
  syncWorkspaceEntryToCanonicalCloud,
} from '@/features/source-files/sourceFileCanonicalCloudSync'
import {
  SourceFileCloudSyncIndicator,
  resolveSourceFileCloudSyncStatus,
} from '@/features/markdown-workspace/SourceFileCloudSyncIndicator'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const SESSION_TOKEN = 'source-file-cloud-session'

const hashToken = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return Array.from(
    new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, '0'),
  ).join('')
}

const seedAuthenticatedWorkspace = async (
  db: FakeKnowgrphStorageD1Database,
  workspaceId: string,
): Promise<void> => {
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

export async function testSourceFileCloudUploadCommitsGitHubBeforeCloudflareAndVerifiesReadBack() {
  const { restore: restoreDom } = initJsdomHarness()
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const previousFetch = globalThis.fetch
  const env = Object.assign(createFakeKnowgrphStorageWorkerEnv(), {
    KNOWGRPH_STORAGE_DEV_REMOTE_RELAY_ENABLED: 'true',
    KNOWGRPH_STORAGE_GITHUB_TOKEN: 'test-token',
    KNOWGRPH_STORAGE_GITHUB_OWNER: 'huijoohwee',
    KNOWGRPH_STORAGE_GITHUB_WORKSPACE_REPO: 'huijoohwee',
    KNOWGRPH_STORAGE_GITHUB_BRANCH: 'main',
  })
  const events: string[] = []
  const saveAuthorizations: string[] = []
  let committedText = ''
  try {
    resetWorkspaceFsForTests()
    await __resetKnowgrphStorageDbForTests()
    await seedAuthenticatedWorkspace(
      env.DB,
      'kgws:test-source-file-cloud-sync',
    )
    const fs = await getWorkspaceFs()
    const path = await fs.createFile({
      parentPath: '/',
      name: 'note-cloud-sync.md',
      text: '# New cloud note\n\nGitHub first, Cloudflare second.',
    })
    const entry = (await fs.listEntries()).find(candidate => candidate.path === path)
    if (!entry) throw new Error('expected created workspace entry')

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = String(init?.method || 'GET').toUpperCase()
      if (method === 'GET') {
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        })
      }
      const body = JSON.parse(String(init?.body || '{}'))
      committedText = Buffer.from(String(body.content || ''), 'base64').toString('utf8')
      return new Response(JSON.stringify({
        content: { sha: 'content-sha-cloud-sync' },
        commit: { sha: 'commit-sha-cloud-sync' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request
        ? input
        : new Request(new URL(String(input), 'http://127.0.0.1:8787'), init)
      events.push(`${request.method}:${new URL(request.url).pathname}`)
      if (new URL(request.url).pathname === '/api/storage/collab/save') {
        saveAuthorizations.push(
          String(request.headers.get('authorization') || ''),
        )
      }
      return readStorageWorker().fetch(request, env as never)
    }
    const result = await syncWorkspaceEntryToCanonicalCloud({
      entry,
      workspaceId: 'kgws:test-source-file-cloud-sync',
      baseUrl: 'http://127.0.0.1:8787',
      sessionToken: SESSION_TOKEN,
      fetchImpl,
    })

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
    const snapshot = await readCanonicalCloudDocumentSnapshot({
      workspaceId: result.workspaceId,
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl,
    })
    if (snapshot.get(result.canonicalPath) !== committedText) {
      throw new Error('expected exported Cloudflare snapshot to equal the canonical GitHub content')
    }

    events.length = 0
    await syncWorkspaceEntryToCanonicalCloud({
      entry,
      workspaceId: result.workspaceId,
      baseUrl: 'http://127.0.0.1:8787',
      sessionToken: SESSION_TOKEN,
      fetchImpl,
    })
    if (events.indexOf('POST:/api/storage/collab/save') < 0
      || events.indexOf('POST:/api/storage/push') <= events.indexOf('POST:/api/storage/collab/save')) {
      throw new Error(`expected a cloud-icon retry to force GitHub and D1 in order, got ${events.join(', ')}`)
    }

    const emptyPath = await fs.createFile({ parentPath: '/', name: 'empty-new-note.md', text: '' })
    const emptyEntry = (await fs.listEntries()).find(candidate => candidate.path === emptyPath)
    if (!emptyEntry) throw new Error('expected empty New .md workspace entry')
    const emptyResult = await syncWorkspaceEntryToCanonicalCloud({
      entry: emptyEntry,
      workspaceId: result.workspaceId,
      baseUrl: 'http://127.0.0.1:8787',
      sessionToken: SESSION_TOKEN,
      fetchImpl,
    })
    const snapshotWithEmptyDocument = await readCanonicalCloudDocumentSnapshot({
      workspaceId: result.workspaceId,
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl,
    })
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
}

export async function testSourceFileCloudUploadReusesMatchingProtectedGitHubContent() {
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
      baseUrl: 'http://127.0.0.1:8787',
      sessionToken: SESSION_TOKEN,
      fetchImpl: async (input, init) => {
        const request = input instanceof Request
          ? input
          : new Request(
              new URL(String(input), 'http://127.0.0.1:8787'),
              init,
            )
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
        baseUrl: 'http://127.0.0.1:8787',
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
  const previousToken = process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN
  let fetchCalls = 0
  const entry: WorkspaceEntry = {
    path: '/missing-session.md',
    parentPath: '/',
    kind: 'file',
    name: 'missing-session.md',
    text: '# Missing session',
    updatedAtMs: 1,
  }
  try {
    delete process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN
    for (const sessionToken of [undefined, 'invalid token']) {
      let rejected = false
      try {
        await syncWorkspaceEntryToCanonicalCloud({
          entry,
          workspaceId: 'kgws:missing-session',
          baseUrl: 'http://127.0.0.1:8787',
          ...(sessionToken === undefined ? {} : { sessionToken }),
          fetchImpl: async () => {
            fetchCalls += 1
            throw new Error('unexpected network call')
          },
        })
      } catch (error) {
        rejected = String(error).includes('Authenticated storage session')
      }
      if (!rejected) throw new Error('expected missing or invalid session to fail closed')
    }
    if (fetchCalls !== 0) {
      throw new Error(`expected session rejection before fetch, got ${fetchCalls} calls`)
    }
  } finally {
    if (typeof previousToken === 'string') {
      process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN = previousToken
    } else {
      delete process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN
    }
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
    if (!localButton || !String(localButton.getAttribute('aria-label')).includes('Upload to GitHub and Cloudflare')) {
      throw new Error('expected local indicator to expose the explicit canonical upload action')
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
