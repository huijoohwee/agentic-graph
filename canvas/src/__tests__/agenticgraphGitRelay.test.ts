import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENTICGRAPH_GIT_OPERATION_BOUNDS,
  AgenticGraphGitRelayError,
  type AgenticGraphGitObjectRecord,
} from '../lib/storage/git/agenticgraphGitContracts'
import {
  buildGitCommitBody,
  decodeGitBytesBase64,
  encodeGitBytesBase64,
  hashGitObject,
  parseCanonicalGitCommit,
  parseGitTree,
} from '../lib/storage/git/agenticgraphGitObjectCodec'
import {
  buildAgenticGraphGitCommitObjects,
  deriveAgenticGraphGitRepositoryPathScope,
} from '../lib/storage/git/agenticgraphGitRepository'
import {
  AGENTICGRAPH_STORAGE_GIT_RELAY_API_VERSION,
  AGENTICGRAPH_STORAGE_GIT_RELAY_PATH,
  createAgenticGraphStorageGitRelay,
} from '../lib/storage/agenticgraphStorageGitRelay'

const identity = {
  name: 'AgenticGraph',
  email: 'git@agenticgraph.dev',
  timestampSeconds: 1_777_000_000,
  timezone: '+0000',
}
const workspaceId = 'workspace'
const remoteId = 'origin'
const refName = 'refs/heads/main'

const jsonResponse = (status: number, value: unknown, headers?: HeadersInit): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

const resolvedDocument = (canonicalPath: string, repositoryPath: string, text: string) => ({
  path: canonicalPath,
  canonicalPath,
  repositoryPath,
  repositoryId: 'repo',
  kind: (repositoryPath.endsWith('.json') ? 'json' : 'markdown') as 'json' | 'markdown',
  text,
})

const buildFixture = async () => {
  const documents = [
    resolvedDocument('agenticgraph/README.md', 'README.md', '# outside\n'),
    resolvedDocument('agenticgraph/docs/old.md', 'docs/old.md', '# old\n'),
    resolvedDocument('agenticgraph/docs/stale.md', 'docs/stale.md', '# stale\n'),
  ]
  const request = {
    workspaceId,
    repositoryId: 'repo',
    remoteId,
    canonicalPathScope: 'agenticgraph',
    refName,
    documents,
    message: 'base',
    author: identity,
  }
  const base = await buildAgenticGraphGitCommitObjects({
    request,
    documents,
    parentObjectId: null,
    nowMs: 1,
  })
  const nextDocuments = [
    resolvedDocument('agenticgraph/docs/current.md', 'docs/current.md', '# current\n'),
  ]
  const nextRequest = {
    ...request,
    canonicalPathScope: 'agenticgraph/docs',
    documents: nextDocuments,
    message: 'replace docs',
    author: { ...identity, timestampSeconds: identity.timestampSeconds + 1 },
  }
  const target = await buildAgenticGraphGitCommitObjects({
    request: nextRequest,
    documents: nextDocuments,
    parentObjectId: base.commitObjectId,
    parentObjects: base.objects,
    repositoryPathScope: deriveAgenticGraphGitRepositoryPathScope(
      nextRequest.canonicalPathScope,
      nextDocuments,
    ),
    nowMs: 2,
  })
  return { base, target, request, nextRequest }
}

const recordMap = (records: AgenticGraphGitObjectRecord[]) =>
  new Map(records.map(record => [record.objectId, record]))

const identityDate = (timestampSeconds: number): string =>
  new Date(timestampSeconds * 1_000).toISOString().replace('.000Z', 'Z')

const workerRecord = (record: AgenticGraphGitObjectRecord): Record<string, unknown> => {
  const body = decodeGitBytesBase64(record.bodyBase64)
  if (record.objectType === 'commit') {
    const commit = parseCanonicalGitCommit(body)
    return {
      type: 'commit',
      remoteOid: record.objectId,
      canonicalVerified: false,
      representation: 'normalized',
      treeOid: commit.treeObjectId,
      parentOids: commit.parentObjectIds,
      message: commit.message,
      author: {
        name: commit.author.name,
        email: commit.author.email,
        date: identityDate(commit.author.timestampSeconds),
      },
      committer: {
        name: commit.committer.name,
        email: commit.committer.email,
        date: identityDate(commit.committer.timestampSeconds),
      },
    }
  }
  return {
    type: record.objectType,
    remoteOid: record.objectId,
    canonicalVerified: true,
    canonicalPayloadBase64: record.bodyBase64,
    byteLength: record.byteLength,
    ...(record.objectType === 'tree'
      ? {
          entries: parseGitTree(body).map(entry => ({
            path: entry.name,
            mode: entry.mode === '40000' ? '040000' : entry.mode,
            type: entry.mode === '40000' ? 'tree' : 'blob',
            oid: entry.objectId,
            size: null,
          })),
        }
      : {}),
  }
}

const successEnvelope = (body: Record<string, unknown>) => ({
  ok: true,
  apiVersion: AGENTICGRAPH_STORAGE_GIT_RELAY_API_VERSION,
  operationId: 'relay:test',
  remoteId,
  ...body,
})

export async function testAgenticGraphGitRelayRecursiveCanonicalFetch() {
  const { base } = await buildFixture()
  const records = recordMap(base.objects)
  const requests: Array<Record<string, unknown>> = []
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    assert.equal(url.pathname, AGENTICGRAPH_STORAGE_GIT_RELAY_PATH)
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer session-only-secret')
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    requests.push(body)
    for (const forbidden of ['url', 'baseUrl', 'owner', 'repository', 'repo', 'branch', 'ref', 'token']) {
      assert.equal(Object.hasOwn(body, forbidden), false)
    }
    if (body.action === 'resolve-ref') {
      return jsonResponse(200, successEnvelope({
        branch: 'main',
        oid: base.commitObjectId,
        objectFormat: 'sha1',
      }))
    }
    const objectRequests = body.objects as Array<{ oid: string }>
    return jsonResponse(200, successEnvelope({
      records: objectRequests.map(request => workerRecord(records.get(request.oid)!)),
    }))
  }
  const relay = createAgenticGraphStorageGitRelay({
    baseRequestUrl: 'http://127.0.0.1:8787/ignored/path?secret=forbidden',
    sessionToken: 'session-only-secret',
    fetcher,
  })
  const result = await relay.fetch({
    kind: 'clone',
    workspaceId,
    repositoryId: 'repo',
    remoteId,
    canonicalPathScope: 'agenticgraph/docs',
    refName,
    knownObjectIds: [],
    signal: new AbortController().signal,
  })
  assert.deepEqual(
    new Set(result.objects.map(object => object.objectId)),
    new Set(base.objects.map(object => object.objectId)),
  )
  assert.ok(requests.length >= 3, 'commit, tree, and blob graph must be traversed')
  assert.equal(JSON.stringify({ relay }).includes('session-only-secret'), false)

  requests.length = 0
  const reused = await relay.fetch({
    kind: 'fetch',
    workspaceId,
    repositoryId: 'repo',
    remoteId,
    canonicalPathScope: 'agenticgraph/docs',
    refName,
    knownObjectIds: [base.commitObjectId],
    signal: new AbortController().signal,
  })
  assert.deepEqual(reused.objects, [])
  assert.equal(requests.length, 1)
}

test(
  'browser relay recursively fetches only canonical verified objects and stops at known OIDs',
  testAgenticGraphGitRelayRecursiveCanonicalFetch,
)

export async function testAgenticGraphGitRelayRejectsSignedAndMergeCommits() {
  const { base } = await buildFixture()
  const commitRecord = recordMap(base.objects).get(base.commitObjectId)!
  const simpleBody = decodeGitBytesBase64(commitRecord.bodyBase64)
  const simpleText = new TextDecoder().decode(simpleBody)
  const signedBody = new TextEncoder().encode(
    simpleText.replace('\nauthor ', '\ngpgsig fake-signature\n continuation\nauthor '),
  )
  const signedOid = await hashGitObject('commit', signedBody)
  const normalized = workerRecord(commitRecord)
  const run = async (record: Record<string, unknown>) => {
    const relay = createAgenticGraphStorageGitRelay({
      baseRequestUrl: 'http://localhost:8787',
      sessionToken: 'session',
      fetcher: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        return body.action === 'resolve-ref'
          ? jsonResponse(200, successEnvelope({
              branch: 'main',
              oid: signedOid,
              objectFormat: 'sha1',
            }))
          : jsonResponse(200, successEnvelope({ records: [record] }))
      },
    })
    return relay.fetch({
      kind: 'clone',
      workspaceId,
      repositoryId: 'repo',
      remoteId,
      canonicalPathScope: 'agenticgraph',
      refName,
      knownObjectIds: [],
      signal: new AbortController().signal,
    })
  }
  await assert.rejects(
    run({ ...normalized, remoteOid: signedOid }),
    (error: unknown) => error instanceof AgenticGraphGitRelayError
      && error.code === 'invalid-response',
  )
  await assert.rejects(
    run({
      ...normalized,
      remoteOid: signedOid,
      parentOids: [
        '1111111111111111111111111111111111111111',
        '2222222222222222222222222222222222222222',
      ],
    }),
    (error: unknown) => error instanceof AgenticGraphGitRelayError
      && error.code === 'invalid-response',
  )
}

test(
  'normalized signed or merge commits fail canonical SHA-1 admission',
  testAgenticGraphGitRelayRejectsSignedAndMergeCommits,
)

export async function testAgenticGraphGitRelayPushGraphTranslation() {
  const { base, target, nextRequest } = await buildFixture()
  const objects = Array.from(recordMap([...base.objects, ...target.objects]).values())
  let requestBody: Record<string, unknown> | null = null
  let callCount = 0
  const relay = createAgenticGraphStorageGitRelay({
    baseRequestUrl: 'http://localhost:8787/task',
    sessionToken: 'session-only-secret',
    fetcher: async (_input, init) => {
      callCount += 1
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return jsonResponse(200, successEnvelope({
        oldOid: base.commitObjectId,
        newOid: target.commitObjectId,
        treeOid: target.treeObjectId,
      }))
    },
  })
  const result = await relay.push({
    ...nextRequest,
    expectedRemoteObjectId: base.commitObjectId,
    targetObjectId: target.commitObjectId,
    objects: objects.map(record => ({
      objectId: record.objectId,
      objectType: record.objectType,
      bodyBase64: record.bodyBase64,
      byteLength: record.byteLength,
    })),
    signal: new AbortController().signal,
  })
  assert.equal(result.status, 'applied')
  assert.equal(callCount, 1)
  assert.equal(requestBody?.action, 'push-commit')
  assert.equal(requestBody?.expectedOldOid, base.commitObjectId)
  assert.equal(requestBody?.expectedTreeOid, target.treeObjectId)
  const commit = requestBody?.commit as Record<string, unknown>
  assert.equal(commit.expectedOid, target.commitObjectId)
  assert.equal(
    (commit.author as Record<string, unknown>).date,
    identityDate(identity.timestampSeconds + 1).replace(/Z$/, '+00:00'),
  )
  const changes = requestBody?.changes as Array<Record<string, unknown>>
  assert.deepEqual(changes.map(change => ({
    path: change.path,
    delete: change.delete === true,
    text: typeof change.contentBase64 === 'string'
      ? new TextDecoder().decode(decodeGitBytesBase64(change.contentBase64))
      : null,
  })), [
    { path: 'docs/current.md', delete: false, text: '# current\n' },
    { path: 'docs/old.md', delete: true, text: null },
    { path: 'docs/stale.md', delete: true, text: null },
  ])
  assert.equal(changes.some(change => change.path === 'README.md'), false)
  assert.equal(JSON.stringify(requestBody).includes('session-only-secret'), false)
}

test(
  'push translates the verified parent-to-target graph into bounded Worker changes',
  testAgenticGraphGitRelayPushGraphTranslation,
)

export async function testAgenticGraphGitRelayConflictAndBounds() {
  const { base, target, nextRequest } = await buildFixture()
  const objects = Array.from(recordMap([...base.objects, ...target.objects]).values())
  let calls = 0
  const relay = createAgenticGraphStorageGitRelay({
    baseRequestUrl: 'http://localhost:8787',
    sessionToken: 'session',
    fetcher: async () => {
      calls += 1
      return jsonResponse(409, {
        ok: false,
        apiVersion: AGENTICGRAPH_STORAGE_GIT_RELAY_API_VERSION,
        code: 'conflict',
        retryable: false,
        operationId: 'relay:conflict',
      })
    },
  })
  const result = await relay.push({
    ...nextRequest,
    expectedRemoteObjectId: base.commitObjectId,
    targetObjectId: target.commitObjectId,
    objects: objects.map(record => ({
      objectId: record.objectId,
      objectType: record.objectType,
      bodyBase64: record.bodyBase64,
      byteLength: record.byteLength,
    })),
    signal: new AbortController().signal,
  })
  assert.equal(result.status, 'remote-advanced')
  assert.equal(calls, 1)

  const oversizedRelay = createAgenticGraphStorageGitRelay({
    baseRequestUrl: 'http://localhost:8787',
    sessionToken: 'session',
    fetcher: async () => jsonResponse(
      200,
      successEnvelope({ branch: 'main', oid: base.commitObjectId, objectFormat: 'sha1' }),
      { 'content-length': String(AGENTICGRAPH_GIT_OPERATION_BOUNDS.maxTransferBytes + 1) },
    ),
  })
  await assert.rejects(
    oversizedRelay.fetch({
      kind: 'clone',
      workspaceId,
      repositoryId: 'repo',
      remoteId,
      canonicalPathScope: 'agenticgraph',
      refName,
      knownObjectIds: [],
      signal: new AbortController().signal,
    }),
    (error: unknown) => error instanceof AgenticGraphGitRelayError
      && error.code === 'limit-exceeded',
  )
}

test(
  'push maps one 409 to remote-advanced without retry and enforces local bounds',
  testAgenticGraphGitRelayConflictAndBounds,
)
