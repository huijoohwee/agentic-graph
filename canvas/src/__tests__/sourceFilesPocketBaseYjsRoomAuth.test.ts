import assert from 'node:assert/strict'
import {
  createPocketBaseYjsSourceFileRoom,
  type PocketBaseLike,
} from '@/features/source-files/sourceFilesPocketBaseYjsRoom'
import { __resetKnowgrphStorageDbForTests } from '@/lib/storage/knowgrphStorageDb'
import { KNOWGRPH_STORAGE_API_VERSION } from '@/lib/storage/knowgrphStorageSyncContract'

type FakeRecord = Record<string, unknown> & { id: string }

const createFakeClient = (): PocketBaseLike => {
  const collections = new Map<string, FakeRecord[]>()
  const records = (name: string): FakeRecord[] => {
    const current = collections.get(name)
    if (current) return current
    const created: FakeRecord[] = []
    collections.set(name, created)
    return created
  }
  let nextId = 1
  return {
    collection: name => ({
      getList: async () => ({ items: records(name) }),
      create: async body => {
        const record = { id: `${name}_${nextId++}`, ...body }
        records(name).push(record)
        return record
      },
      update: async (id, body) => {
        const index = records(name).findIndex(record => record.id === id)
        if (index < 0) throw new Error(`Missing ${name} record`)
        records(name)[index] = { ...records(name)[index]!, ...body }
        return records(name)[index]!
      },
      delete: async () => true,
      subscribe: async () => async () => void 0,
    }),
  }
}

const createRoom = (
  overrides: Partial<Parameters<typeof createPocketBaseYjsSourceFileRoom>[0]>,
) => createPocketBaseYjsSourceFileRoom({
  workspaceId: 'kgws:room-auth',
  documentKey: 'docs/shared.md',
  documentKind: 'markdown',
  initialText: '# Shared\n',
  peerId: 'peer:room-auth',
  displayName: 'Room Auth',
  client: createFakeClient(),
  saveBridgeUrl: 'http://127.0.0.1:8787/api/storage/collab/save',
  ...overrides,
})

export async function testPocketBaseYjsRoomSaveUsesAuthenticatedSession(): Promise<void> {
  let savedRequest: Request | null = null
  await __resetKnowgrphStorageDbForTests()
  const room = await createRoom({
    sessionToken: 'room-session',
    fetchImpl: async (input, init) => {
      savedRequest = new Request(input, init)
      return Response.json({
        ok: true,
        apiVersion: KNOWGRPH_STORAGE_API_VERSION,
        workspaceId: 'kgws:room-auth',
        documentKey: 'docs/shared.md',
        repositoryTarget: 'workspace-docs',
        githubPath: 'docs/shared.md',
        commitSha: 'a'.repeat(40),
        contentSha: 'b'.repeat(40),
        committedAtMs: 1,
      })
    },
  })
  try {
    const result = await room.saveSnapshot()
    assert.equal(result?.ok, true)
    assert.ok(savedRequest)
    assert.equal(
      savedRequest.headers.get('authorization'),
      'Bearer room-session',
    )
    assert.equal(
      new URL(savedRequest.url).pathname,
      '/api/storage/collab/save',
    )
  } finally {
    await room.disconnect()
    await __resetKnowgrphStorageDbForTests()
  }
}

export async function testPocketBaseYjsRoomSaveRejectsMissingSessionBeforeNetwork(): Promise<void> {
  const previousToken = process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN
  let fetchCalls = 0
  await __resetKnowgrphStorageDbForTests()
  delete process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN
  const room = await createRoom({
    fetchImpl: async () => {
      fetchCalls += 1
      throw new Error('unexpected network call')
    },
  })
  try {
    await assert.rejects(
      room.saveSnapshot(),
      /Authenticated storage session/,
    )
    assert.equal(fetchCalls, 0)
  } finally {
    await room.disconnect()
    await __resetKnowgrphStorageDbForTests()
    if (typeof previousToken === 'string') {
      process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN = previousToken
    } else {
      delete process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN
    }
  }
}
