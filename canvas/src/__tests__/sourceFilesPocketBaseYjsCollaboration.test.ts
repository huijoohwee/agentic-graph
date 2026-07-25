import storageWorker from '../../../cloudflare/workers/knowgrph-storage/index.ts'
import {
  YJS_MARKDOWN_TEXT_NAME,
  applyYjsUpdateBase64,
  canEditRawJsonForCollaboration,
  createCollaborationYDoc,
  encodeCollaborationYDocStateBase64,
  encodeYjsUpdateBase64,
  serializeCollaborationYDoc,
  setCollaborationJsonObjectField,
} from 'grph-shared/collaboration/yjsSnapshot'
import {
  KNOWGRPH_STORAGE_API_VERSION,
  buildKnowgrphCollaborationSavePath,
  type KnowgrphCollaborationSaveRequest,
} from '@/lib/storage/knowgrphStorageSyncContract'
import {
  shouldSavePocketBaseYjsSnapshotForWorkspacePath,
} from '@/features/source-files/useSourceFilesPocketBaseYjsCollaborationRuntime'
import {
  createPocketBaseYjsSourceFileRoom,
  type PocketBaseLike,
} from '@/features/source-files/sourceFilesPocketBaseYjsRoom'
import {
  createFakeKnowgrphStorageWorkerEnv,
  type FakeKnowgrphStorageD1Database,
} from '@/__tests__/helpers/fakeKnowgrphStorageD1'

type FakePocketBaseRecord = Record<string, unknown> & { id: string }

const waitForMicrotasks = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
  await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0))
}

const createFakePocketBaseClient = () => {
  const collections = new Map<string, FakePocketBaseRecord[]>()
  const readCollection = (name: string): FakePocketBaseRecord[] => {
    const existing = collections.get(name)
    if (existing) return existing
    const records: FakePocketBaseRecord[] = []
    collections.set(name, records)
    return records
  }
  let nextId = 1
  const client: PocketBaseLike = {
    collection: name => ({
      getList: async () => ({ items: readCollection(name) }),
      create: async body => {
        const record = { id: `${name}_${nextId++}`, ...body }
        readCollection(name).push(record)
        return record
      },
      update: async (id, body) => {
        const records = readCollection(name)
        const index = records.findIndex(record => record.id === id)
        if (index < 0) throw new Error(`missing fake PocketBase record ${id}`)
        records[index] = { ...records[index], ...body }
        return records[index]!
      },
      delete: async id => {
        const records = readCollection(name)
        const index = records.findIndex(record => record.id === id)
        if (index >= 0) records.splice(index, 1)
        return true
      },
      subscribe: async () => async () => void 0,
    }),
  }
  return {
    client,
    records: (name: string) => readCollection(name),
  }
}

const readStorageWorker = (): { fetch: (request: Request, env: Record<string, unknown>) => Promise<Response> } => {
  const candidate = storageWorker as unknown as {
    fetch?: (request: Request, env: Record<string, unknown>) => Promise<Response>
    default?: { fetch?: (request: Request, env: Record<string, unknown>) => Promise<Response> }
  }
  const fetchImpl = candidate.fetch || candidate.default?.fetch
  if (!fetchImpl) throw new Error('expected storage worker test module to expose fetch')
  return { fetch: fetchImpl }
}

const SESSION_TOKEN = 'collaboration-save-session'

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

const createAuthorizedWorkerEnv = async (
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> => {
  const env = Object.assign(createFakeKnowgrphStorageWorkerEnv(), {
    KNOWGRPH_STORAGE_DEV_REMOTE_RELAY_ENABLED: 'true',
    ...overrides,
  })
  const db = env.DB as FakeKnowgrphStorageD1Database
  db.users.set('user:collaboration-save', {
    id: 'user:collaboration-save',
    email: 'collaboration-save@example.com',
    display_name: 'Collaboration Save',
    status: 'active',
  })
  db.authSessions.set('session:collaboration-save', {
    id: 'session:collaboration-save',
    user_id: 'user:collaboration-save',
    session_hash: await hashToken(SESSION_TOKEN),
    expires_at: '2036-01-01T00:00:00.000Z',
    revoked_at: null,
  })
  db.workspaceMemberships.set('membership:collaboration-save', {
    id: 'membership:collaboration-save',
    workspace_id: 'kgws:test',
    user_id: 'user:collaboration-save',
    role: 'editor',
    status: 'active',
  })
  return env
}

const collaborationSaveRequest = (
  body: KnowgrphCollaborationSaveRequest,
): Request => new Request(
  `http://127.0.0.1${buildKnowgrphCollaborationSavePath()}`,
  {
    method: 'POST',
    headers: {
      authorization: `Bearer ${SESSION_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  },
)

export function testPocketBaseYjsMarkdownConcurrentUpdatesMergeThroughYText() {
  const left = createCollaborationYDoc({
    documentKey: 'docs/shared.md',
    documentKind: 'markdown',
    initialText: 'Hello',
  })
  const right = createCollaborationYDoc({
    documentKey: 'docs/shared.md',
    documentKind: 'markdown',
    initialText: '',
  })
  applyYjsUpdateBase64({
    doc: right,
    updateBase64: encodeCollaborationYDocStateBase64(left),
  })

  const leftUpdates: Uint8Array[] = []
  const rightUpdates: Uint8Array[] = []
  left.on('update', update => leftUpdates.push(update))
  right.on('update', update => rightUpdates.push(update))

  left.getText(YJS_MARKDOWN_TEXT_NAME).insert(5, ' from A')
  right.getText(YJS_MARKDOWN_TEXT_NAME).insert(0, 'B says ')

  for (const update of leftUpdates) applyYjsUpdateBase64({ doc: right, updateBase64: encodeYjsUpdateBase64(update) })
  for (const update of rightUpdates) applyYjsUpdateBase64({ doc: left, updateBase64: encodeYjsUpdateBase64(update) })

  const leftText = serializeCollaborationYDoc({ doc: left, documentKind: 'markdown' })
  const rightText = serializeCollaborationYDoc({ doc: right, documentKind: 'markdown' })
  if (leftText !== rightText) throw new Error(`expected Y.Text peers to converge, got ${JSON.stringify({ leftText, rightText })}`)
  if (!leftText.includes('B says ') || !leftText.includes('from A')) {
    throw new Error(`expected both concurrent Markdown edits to survive, got ${JSON.stringify(leftText)}`)
  }
}

export function testPocketBaseYjsJsonUsesSharedMapAndBlocksRawConcurrentJson() {
  const left = createCollaborationYDoc({
    documentKey: 'docs/shared.json',
    documentKind: 'json',
    initialText: '{"base":true}',
  })
  const right = createCollaborationYDoc({
    documentKey: 'docs/shared.json',
    documentKind: 'json',
    initialText: '{}',
  })
  applyYjsUpdateBase64({
    doc: right,
    updateBase64: encodeCollaborationYDocStateBase64(left),
  })

  const leftUpdates: Uint8Array[] = []
  const rightUpdates: Uint8Array[] = []
  left.on('update', update => leftUpdates.push(update))
  right.on('update', update => rightUpdates.push(update))

  setCollaborationJsonObjectField({ doc: left, key: 'fromA', value: { count: 1 } })
  setCollaborationJsonObjectField({ doc: right, key: 'fromB', value: ['ok'] })

  for (const update of leftUpdates) applyYjsUpdateBase64({ doc: right, updateBase64: encodeYjsUpdateBase64(update) })
  for (const update of rightUpdates) applyYjsUpdateBase64({ doc: left, updateBase64: encodeYjsUpdateBase64(update) })

  const parsed = JSON.parse(serializeCollaborationYDoc({ doc: left, documentKind: 'json' })) as Record<string, unknown>
  if ((parsed.fromA as { count?: unknown })?.count !== 1 || !Array.isArray(parsed.fromB)) {
    throw new Error(`expected Y.Map JSON peers to merge field-level edits, got ${JSON.stringify(parsed)}`)
  }
  if (canEditRawJsonForCollaboration({ documentKind: 'json', activePeerCount: 2 })) {
    throw new Error('expected raw JSON editing to be blocked when a second collaborator is active')
  }
}

export function testPocketBaseYjsSaveSnapshotRequiresPathDocumentKeyMatch() {
  const videoPath = '/docs/knowgrph-video-demo.md'
  const tokenEconomicsPath = '/docs/knowgrph-token-economics-model-demo.md'
  if (shouldSavePocketBaseYjsSnapshotForWorkspacePath({
    activeDocumentKey: 'docs/knowgrph-token-economics-model-demo.md',
    roomDocumentKey: 'docs/knowgrph-video-demo.md',
    savePath: tokenEconomicsPath,
  })) {
    throw new Error('expected stale video collaboration room not to save token economics text')
  }
  if (!shouldSavePocketBaseYjsSnapshotForWorkspacePath({
    activeDocumentKey: 'docs/knowgrph-video-demo.md',
    roomDocumentKey: 'docs/knowgrph-video-demo.md',
    savePath: videoPath,
  })) {
    throw new Error('expected matching video collaboration room to save video text')
  }
  if (!shouldSavePocketBaseYjsSnapshotForWorkspacePath({
    activeDocumentKey: 'docs/knowgrph-video-demo.md',
    roomDocumentKey: 'docs/knowgrph-video-demo.md',
    savePath: null,
  })) {
    throw new Error('expected active document key fallback to allow matching saves')
  }
}

export async function testPocketBaseYjsRoomPersistsLatestRoomSnapshotAfterLocalUpdate() {
  const fake = createFakePocketBaseClient()
  const room = await createPocketBaseYjsSourceFileRoom({
    workspaceId: 'kgws:test',
    documentKey: 'docs/shared.md',
    documentKind: 'markdown',
    initialText: 'Before',
    peerId: 'peer:a',
    displayName: 'A',
    client: fake.client,
  })
  try {
    if (!room.applyLocalText('After')) throw new Error('expected local Yjs text update to apply')
    await waitForMicrotasks()
    const roomRecord = fake.records('collab_rooms')[0]
    const yjsStateBase64 = String(roomRecord?.yjsStateBase64 || '')
    if (!yjsStateBase64) throw new Error('expected room snapshot to persist yjsStateBase64 after local update')
    const snapshotDoc = createCollaborationYDoc({
      documentKey: 'docs/shared.md',
      documentKind: 'markdown',
      initialText: '',
    })
    applyYjsUpdateBase64({ doc: snapshotDoc, updateBase64: yjsStateBase64 })
    const snapshotText = serializeCollaborationYDoc({ doc: snapshotDoc, documentKind: 'markdown' })
    if (snapshotText !== 'After') {
      throw new Error(`expected persisted room snapshot to contain latest text, got ${JSON.stringify(snapshotText)}`)
    }
  } finally {
    await room.disconnect()
  }
}

export async function testCollaborationSaveBridgeCommitsFormattedJsonThroughGitHubOnly() {
  const requests: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = String(init?.method || 'GET')
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null
    requests.push({ url, method, body })
    if (method === 'GET') return new Response(JSON.stringify({ sha: 'base-sha' }), { status: 200 })
    return new Response(JSON.stringify({ content: { sha: 'content-sha' }, commit: { sha: 'commit-sha' } }), { status: 200 })
  }) as typeof fetch
  try {
    const doc = createCollaborationYDoc({
      documentKey: '/docs/shared.json',
      documentKind: 'json',
      initialText: '{"z":1}',
    })
    const body: KnowgrphCollaborationSaveRequest = {
      apiVersion: KNOWGRPH_STORAGE_API_VERSION,
      workspaceId: 'kgws:test',
      documentKey: '/docs/shared.json',
      documentKind: 'json',
      repositoryTarget: 'workspace-docs',
      serializedText: '{"rawEditorTextMustNotWin":true}',
      yjsStateBase64: encodeCollaborationYDocStateBase64(doc),
      activePeerCount: 2,
      pocketBaseRoomId: 'room_a',
      savedByPeerId: 'peer_a',
      saveBoundary: 'explicit',
    }
    const response = await readStorageWorker().fetch(
      collaborationSaveRequest(body),
      await createAuthorizedWorkerEnv({
        KNOWGRPH_STORAGE_GITHUB_TOKEN: 'test-token',
        KNOWGRPH_STORAGE_GITHUB_OWNER: 'owner',
        KNOWGRPH_STORAGE_GITHUB_WORKSPACE_REPO: 'repo',
        KNOWGRPH_STORAGE_GITHUB_BRANCH: 'main',
      }),
    )
    const result = await response.json() as { ok?: boolean; githubPath?: string }
    if (!response.ok || result.ok !== true || result.githubPath !== 'docs/shared.json') {
      throw new Error(`expected bridge save response, got ${JSON.stringify(result)}`)
    }
    const putRequest = requests.find(request => request.method === 'PUT')
    const content = String(putRequest?.body?.content || '')
    const decoded = Buffer.from(content, 'base64').toString('utf8')
    if (decoded !== '{\n  "z": 1\n}\n') {
      throw new Error(`expected bridge to format concurrent JSON before GitHub commit, got ${JSON.stringify(decoded)}`)
    }
    if (String(putRequest?.body?.message || '') !== 'chore(sync): save shared.json from workspace-docs collaboration bridge') {
      throw new Error(`expected bridge-owned commit message, got ${JSON.stringify(putRequest?.body?.message)}`)
    }
  } finally {
    globalThis.fetch = previousFetch
  }
}

export async function testCollaborationSaveBridgeRejectsConcurrentJsonWithoutCrdtState() {
  const response = await readStorageWorker().fetch(
    collaborationSaveRequest({
      apiVersion: KNOWGRPH_STORAGE_API_VERSION,
      workspaceId: 'kgws:test',
      documentKey: '/docs/shared.json',
      documentKind: 'json',
      repositoryTarget: 'workspace-docs',
      serializedText: '{"z":1}',
      yjsStateBase64: '',
      activePeerCount: 2,
      pocketBaseRoomId: 'room_a',
      savedByPeerId: 'peer_a',
      saveBoundary: 'explicit',
    }),
    await createAuthorizedWorkerEnv({
      KNOWGRPH_STORAGE_GITHUB_TOKEN: 'test-token',
    }),
  )
  const result = await response.json() as { ok?: boolean; code?: string; error?: string }
  if (response.status !== 409 || result.code !== 'conflict' || !String(result.error || '').includes('requires Yjs CRDT state')) {
    throw new Error(`expected bridge to reject concurrent raw JSON saves without CRDT state, got ${JSON.stringify(result)}`)
  }
}

export async function testCollaborationSaveBridgeRejectsRepositoryTargetMismatch() {
  const response = await readStorageWorker().fetch(
    collaborationSaveRequest({
      apiVersion: KNOWGRPH_STORAGE_API_VERSION,
      workspaceId: 'kgws:test',
      documentKey: '/docs/team-note.md',
      documentKind: 'markdown',
      repositoryTarget: 'knowgrph-docs',
      serializedText: '# Team note',
      yjsStateBase64: '',
      activePeerCount: 1,
      pocketBaseRoomId: null,
      savedByPeerId: 'peer_a',
      saveBoundary: 'explicit',
    }),
    await createAuthorizedWorkerEnv(),
  )
  const result = await response.json() as { code?: string; error?: string }
  if (response.status !== 400 || result.code !== 'bad_request'
    || !String(result.error || '').includes('repository target does not match path authority')) {
    throw new Error(`expected repository authority mismatch rejection, got ${JSON.stringify(result)}`)
  }
}

export async function testCollaborationSaveBridgeIgnoresStalePocketBaseAwarenessPeers() {
  const requests: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = String(init?.method || 'GET')
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null
    requests.push({ url, method, body })
    if (url.includes('pocketbase.test/api/collections/collab_rooms/records/room_a')) {
      return new Response(JSON.stringify({ id: 'room_a', yjsStateBase64: '' }), { status: 200 })
    }
    if (url.includes('pocketbase.test/api/collections/collab_awareness/records')) {
      return new Response(JSON.stringify({ items: [{ peerId: 'stale-peer', lastSeenAtMs: 1 }] }), { status: 200 })
    }
    if (method === 'GET') return new Response(JSON.stringify({ sha: 'base-sha' }), { status: 200 })
    return new Response(JSON.stringify({ content: { sha: 'content-sha' }, commit: { sha: 'commit-sha' } }), { status: 200 })
  }) as typeof fetch
  try {
    const response = await readStorageWorker().fetch(
      collaborationSaveRequest({
        apiVersion: KNOWGRPH_STORAGE_API_VERSION,
        workspaceId: 'kgws:test',
        documentKey: '/docs/shared.json',
        documentKind: 'json',
        repositoryTarget: 'workspace-docs',
        serializedText: '{"z":1}',
        yjsStateBase64: '',
        activePeerCount: 2,
        pocketBaseRoomId: 'room_a',
        savedByPeerId: 'peer_a',
        saveBoundary: 'explicit',
      }),
      await createAuthorizedWorkerEnv({
        KNOWGRPH_STORAGE_GITHUB_TOKEN: 'test-token',
        KNOWGRPH_STORAGE_GITHUB_OWNER: 'owner',
        KNOWGRPH_STORAGE_GITHUB_WORKSPACE_REPO: 'repo',
        KNOWGRPH_STORAGE_POCKETBASE_URL: 'https://pocketbase.test',
      }),
    )
    const result = await response.json() as { ok?: boolean; code?: string; error?: string }
    if (!response.ok || result.ok !== true) {
      throw new Error(`expected stale awareness peers not to force concurrent JSON conflict, got ${JSON.stringify(result)}`)
    }
    if (!requests.some(request => request.method === 'PUT')) {
      throw new Error('expected bridge to commit after filtering stale PocketBase awareness peers')
    }
  } finally {
    globalThis.fetch = previousFetch
  }
}

export async function testCollaborationSaveBridgePrefersRequestYjsStateOverStalePocketBaseState() {
  const requests: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = []
  const previousFetch = globalThis.fetch
  const staleDoc = createCollaborationYDoc({
    documentKey: '/docs/shared.json',
    documentKind: 'json',
    initialText: '{"z":1}',
  })
  const freshDoc = createCollaborationYDoc({
    documentKey: '/docs/shared.json',
    documentKind: 'json',
    initialText: '{"z":2}',
  })
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = String(init?.method || 'GET')
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null
    requests.push({ url, method, body })
    if (url.includes('pocketbase.test/api/collections/collab_rooms/records/room_a')) {
      return new Response(JSON.stringify({ id: 'room_a', yjsStateBase64: encodeCollaborationYDocStateBase64(staleDoc) }), { status: 200 })
    }
    if (url.includes('pocketbase.test/api/collections/collab_awareness/records')) {
      return new Response(JSON.stringify({ items: [{ peerId: 'peer_a', lastSeenAtMs: Date.now() }, { peerId: 'peer_b', lastSeenAtMs: Date.now() }] }), { status: 200 })
    }
    if (method === 'GET') return new Response(JSON.stringify({ sha: 'base-sha' }), { status: 200 })
    return new Response(JSON.stringify({ content: { sha: 'content-sha' }, commit: { sha: 'commit-sha' } }), { status: 200 })
  }) as typeof fetch
  try {
    const response = await readStorageWorker().fetch(
      collaborationSaveRequest({
        apiVersion: KNOWGRPH_STORAGE_API_VERSION,
        workspaceId: 'kgws:test',
        documentKey: '/docs/shared.json',
        documentKind: 'json',
        repositoryTarget: 'workspace-docs',
        serializedText: '{"rawEditorTextMustNotWin":true}',
        yjsStateBase64: encodeCollaborationYDocStateBase64(freshDoc),
        activePeerCount: 2,
        pocketBaseRoomId: 'room_a',
        savedByPeerId: 'peer_a',
        saveBoundary: 'explicit',
      }),
      await createAuthorizedWorkerEnv({
        KNOWGRPH_STORAGE_GITHUB_TOKEN: 'test-token',
        KNOWGRPH_STORAGE_GITHUB_OWNER: 'owner',
        KNOWGRPH_STORAGE_GITHUB_WORKSPACE_REPO: 'repo',
        KNOWGRPH_STORAGE_POCKETBASE_URL: 'https://pocketbase.test',
      }),
    )
    const result = await response.json() as { ok?: boolean; code?: string; error?: string }
    if (!response.ok || result.ok !== true) {
      throw new Error(`expected bridge to save fresh request snapshot, got ${JSON.stringify(result)}`)
    }
    const putRequest = requests.find(request => request.method === 'PUT')
    const decoded = Buffer.from(String(putRequest?.body?.content || ''), 'base64').toString('utf8')
    if (decoded !== '{\n  "z": 2\n}\n') {
      throw new Error(`expected request Yjs state to win over stale PocketBase state, got ${JSON.stringify(decoded)}`)
    }
  } finally {
    globalThis.fetch = previousFetch
  }
}
