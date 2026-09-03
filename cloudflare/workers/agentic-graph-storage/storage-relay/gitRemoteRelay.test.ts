import assert from 'node:assert/strict'
import { test } from 'node:test'

import { GitRemoteRegistry, type GitRemoteRegistration } from './gitRemoteRegistry'
import {
  GitHubGitDatabaseAdapter,
  type GitRemotePushRequest,
} from './githubGitDatabaseAdapter'
import { createGitRemoteRelayHandler } from './gitRemoteRelay'
import {
  StorageRelayError,
  StorageRelayOperation,
  type StorageRelayAuthHooks,
  type StorageRelayFetch,
} from './storageRelaySafety'

const OLD_OID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const BASE_TREE_OID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const NEW_TREE_OID = 'cccccccccccccccccccccccccccccccccccccccc'
const NEW_COMMIT_OID = 'dddddddddddddddddddddddddddddddddddddddd'
const ADVANCED_OID = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

const registration: GitRemoteRegistration = {
  remoteId: 'git-workspace-docs',
  workspaceId: 'workspace-1',
  owner: 'internal-owner',
  repository: 'internal-repository',
  branch: 'dev/storage-sync',
  token: 'github-provider-secret',
  allowedPathPrefixes: ['docs'],
  fetchPolicy: 'normalized-commits',
}

const activeEditorHooks: StorageRelayAuthHooks<{ userId: string }> = {
  async authenticate() {
    return { userId: 'user-1' }
  },
  async authorizeMembership() {
    return { role: 'editor', status: 'active' }
  },
}

const jsonResponse = (status: number, value: unknown, headers?: HeadersInit): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

const computeBlobOid = async (bytes: Uint8Array): Promise<string> => {
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`)
  const object = new Uint8Array(header.byteLength + bytes.byteLength)
  object.set(header)
  object.set(bytes, header.byteLength)
  const digest = await crypto.subtle.digest('SHA-1', object)
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

test('GitHub tree reads fail closed when the provider reports truncation', async () => {
  const operation = new StorageRelayOperation({
    fetcher: async () => jsonResponse(200, {
      sha: BASE_TREE_OID,
      truncated: true,
      tree: [],
    }),
  })
  try {
    await assert.rejects(
      new GitHubGitDatabaseAdapter().readObjects({
        registration,
        requests: [{ oid: BASE_TREE_OID, type: 'tree' }],
        operation,
      }),
      (error: unknown) => error instanceof StorageRelayError
        && error.code === 'limit_exceeded',
    )
  } finally {
    operation.dispose()
  }
})

test('canonical commit reads are rejected before any provider request', async () => {
  let fetchCount = 0
  const operation = new StorageRelayOperation({
    fetcher: async () => {
      fetchCount += 1
      throw new Error('must not fetch')
    },
  })
  try {
    await assert.rejects(
      new GitHubGitDatabaseAdapter().readObjects({
        registration,
        requests: [{ oid: OLD_OID, type: 'commit', representation: 'canonical' }],
        operation,
      }),
      (error: unknown) => error instanceof StorageRelayError
        && error.code === 'invalid_request',
    )
    assert.equal(fetchCount, 0)
  } finally {
    operation.dispose()
  }
})

test('push retry already at the expected target succeeds only after graph attestation', async () => {
  const content = new TextEncoder().encode('hello\n')
  const providerRequests: string[] = []
  const fetcher: StorageRelayFetch = async (input, init = {}) => {
    const url = String(input)
    const method = init.method || 'GET'
    providerRequests.push(`${method} ${url}`)
    if (url.includes('/git/ref/heads/') && method === 'GET') {
      return jsonResponse(200, { object: { type: 'commit', sha: NEW_COMMIT_OID } })
    }
    if (url.endsWith(`/git/commits/${NEW_COMMIT_OID}`) && method === 'GET') {
      return jsonResponse(200, {
        sha: NEW_COMMIT_OID,
        message: 'sync docs',
        tree: { sha: NEW_TREE_OID },
        parents: [{ sha: OLD_OID }],
        author: { name: 'Agent', email: 'agent@example.com', date: '2026-07-24T00:00:00Z' },
        committer: { name: 'Agent', email: 'agent@example.com', date: '2026-07-24T00:00:00Z' },
      })
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  const operation = new StorageRelayOperation({ fetcher })
  const identity = {
    name: 'Agent',
    email: 'agent@example.com',
    date: '2026-07-24T00:00:00Z',
  }
  const request: GitRemotePushRequest = {
    expectedOldOid: OLD_OID,
    expectedTreeOid: NEW_TREE_OID,
    commit: {
      expectedOid: NEW_COMMIT_OID,
      message: 'sync docs',
      author: identity,
      committer: identity,
    },
    changes: [{ path: 'docs/readme.md', mode: '100644', content }],
  }
  try {
    assert.deepEqual(
      await new GitHubGitDatabaseAdapter().pushCommit({ registration, request, operation }),
      { oldOid: OLD_OID, newOid: NEW_COMMIT_OID, treeOid: NEW_TREE_OID },
    )
    assert.equal(providerRequests.length, 2)
    assert.equal(providerRequests.some(providerRequest => !providerRequest.startsWith('GET ')), false)
  } finally {
    operation.dispose()
  }
})

test('push retry already at the expected target rejects a mismatched parent or tree', async () => {
  const content = new TextEncoder().encode('hello\n')
  const identity = {
    name: 'Agent',
    email: 'agent@example.com',
    date: '2026-07-24T00:00:00Z',
  }
  const request: GitRemotePushRequest = {
    expectedOldOid: OLD_OID,
    expectedTreeOid: NEW_TREE_OID,
    commit: {
      expectedOid: NEW_COMMIT_OID,
      message: 'sync docs',
      author: identity,
      committer: identity,
    },
    changes: [{ path: 'docs/readme.md', mode: '100644', content }],
  }
  const mismatchedGraphs = [
    { treeOid: BASE_TREE_OID, parentOids: [OLD_OID] },
    { treeOid: NEW_TREE_OID, parentOids: [OLD_OID, ADVANCED_OID] },
  ]
  for (const graph of mismatchedGraphs) {
    const operation = new StorageRelayOperation({
      fetcher: async (input, init = {}) => {
        const url = String(input)
        const method = init.method || 'GET'
        if (url.includes('/git/ref/heads/') && method === 'GET') {
          return jsonResponse(200, { object: { type: 'commit', sha: NEW_COMMIT_OID } })
        }
        if (url.endsWith(`/git/commits/${NEW_COMMIT_OID}`) && method === 'GET') {
          return jsonResponse(200, {
            sha: NEW_COMMIT_OID,
            message: 'sync docs',
            tree: { sha: graph.treeOid },
            parents: graph.parentOids.map(sha => ({ sha })),
            author: identity,
            committer: identity,
          })
        }
        throw new Error(`Unexpected request: ${method} ${url}`)
      },
    })
    try {
      await assert.rejects(
        new GitHubGitDatabaseAdapter().pushCommit({ registration, request, operation }),
        (error: unknown) => error instanceof StorageRelayError
          && error.code === 'invalid_response',
      )
    } finally {
      operation.dispose()
    }
  }
})

test('push rechecks expected-old and classifies a racing non-fast-forward update', async () => {
  const content = new TextEncoder().encode('hello\n')
  const blobOid = await computeBlobOid(content)
  let refReadCount = 0
  let patchBody: Record<string, unknown> | null = null
  const fetcher: StorageRelayFetch = async (input, init = {}) => {
    const url = String(input)
    const method = init.method || 'GET'
    if (url.includes('/git/ref/heads/') && method === 'GET') {
      refReadCount += 1
      const oid = refReadCount < 3 ? OLD_OID : ADVANCED_OID
      return jsonResponse(200, { object: { type: 'commit', sha: oid } })
    }
    if (url.endsWith(`/git/commits/${OLD_OID}`) && method === 'GET') {
      return jsonResponse(200, {
        sha: OLD_OID,
        message: 'base',
        tree: { sha: BASE_TREE_OID },
        parents: [],
        author: { name: 'Agent', email: 'agent@example.com', date: '2026-07-24T00:00:00Z' },
        committer: { name: 'Agent', email: 'agent@example.com', date: '2026-07-24T00:00:00Z' },
      })
    }
    if (url.endsWith('/git/blobs') && method === 'POST') {
      return jsonResponse(201, { sha: blobOid })
    }
    if (url.endsWith('/git/trees') && method === 'POST') {
      return jsonResponse(201, { sha: NEW_TREE_OID })
    }
    if (url.endsWith('/git/commits') && method === 'POST') {
      return jsonResponse(201, { sha: NEW_COMMIT_OID })
    }
    if (url.includes('/git/refs/heads/') && method === 'PATCH') {
      patchBody = JSON.parse(String(init.body)) as Record<string, unknown>
      return jsonResponse(409, { message: 'provider details must be discarded' })
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  const operation = new StorageRelayOperation({ fetcher })
  const identity = {
    name: 'Agent',
    email: 'agent@example.com',
    date: '2026-07-24T00:00:00Z',
  }
  const request: GitRemotePushRequest = {
    expectedOldOid: OLD_OID,
    expectedTreeOid: NEW_TREE_OID,
    commit: {
      expectedOid: NEW_COMMIT_OID,
      message: 'sync docs',
      author: identity,
      committer: identity,
    },
    changes: [{ path: 'docs/readme.md', mode: '100644', content }],
  }
  try {
    await assert.rejects(
      new GitHubGitDatabaseAdapter().pushCommit({ registration, request, operation }),
      (error: unknown) => error instanceof StorageRelayError
        && error.code === 'conflict',
    )
    assert.deepEqual(patchBody, { sha: NEW_COMMIT_OID, force: false })
    assert.equal(refReadCount, 3)
  } finally {
    operation.dispose()
  }
})

test('authority rejection happens before a GitHub subrequest', async () => {
  let fetchCount = 0
  const handler = createGitRemoteRelayHandler({
    env: { AGENTIC_OS_STORAGE_DEV_REMOTE_RELAY_ENABLED: 'true' },
    authHooks: activeEditorHooks,
    registry: new GitRemoteRegistry([registration]),
    fetcher: async () => {
      fetchCount += 1
      return jsonResponse(500, {})
    },
  })
  const response = await handler(new Request('http://localhost/api/storage/git/relay', {
    method: 'POST',
    headers: {
      authorization: 'Bearer local-session',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      apiVersion: 'agentic-graph-storage-relay/v1',
      workspaceId: 'workspace-1',
      remoteId: 'git-workspace-docs',
      action: 'push-commit',
      expectedOldOid: OLD_OID,
      expectedTreeOid: NEW_TREE_OID,
      commit: {
        expectedOid: NEW_COMMIT_OID,
        message: 'forbidden path',
        author: {
          name: 'Agent',
          email: 'agent@example.com',
          date: '2026-07-24T00:00:00Z',
        },
        committer: {
          name: 'Agent',
          email: 'agent@example.com',
          date: '2026-07-24T00:00:00Z',
        },
      },
      changes: [{
        path: 'outside/secret.md',
        mode: '100644',
        contentBase64: 'aGVsbG8=',
      }],
    }),
  }))
  assert.equal(response.status, 403)
  assert.equal(fetchCount, 0)
})

test('upstream GitHub error bodies, config, and token stay out of relay errors', async () => {
  const handler = createGitRemoteRelayHandler({
    env: { AGENTIC_OS_STORAGE_DEV_REMOTE_RELAY_ENABLED: 'true' },
    authHooks: activeEditorHooks,
    registry: new GitRemoteRegistry([registration]),
    fetcher: async () => jsonResponse(401, {
      message: 'github-provider-secret internal-owner internal-repository',
    }),
  })
  const response = await handler(new Request('http://localhost/api/storage/git/relay', {
    method: 'POST',
    headers: {
      authorization: 'Bearer local-session',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      apiVersion: 'agentic-graph-storage-relay/v1',
      workspaceId: 'workspace-1',
      remoteId: 'git-workspace-docs',
      action: 'resolve-ref',
    }),
  }))
  assert.equal(response.status, 502)
  const text = await response.text()
  assert.equal(text.includes('github-provider-secret'), false)
  assert.equal(text.includes('internal-owner'), false)
  assert.equal(text.includes('internal-repository'), false)
  assert.equal(JSON.parse(text).code, 'provider_auth_failed')
})
