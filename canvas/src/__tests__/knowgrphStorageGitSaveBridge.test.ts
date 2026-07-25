import assert from 'node:assert/strict'
import {
  saveKnowgrphGitDocumentsThroughBridge,
} from '@/lib/storage/knowgrphStorageGitSaveBridge'
import {
  KnowgrphGitAuthorityError,
  type KnowgrphGitResolvedDocument,
} from '@/lib/storage/git'

const COMMIT_OBJECT_ID = 'a'.repeat(40)

const documents: KnowgrphGitResolvedDocument[] = [
  {
    path: 'knowgrph/docs/alpha.md',
    kind: 'markdown',
    text: '# Alpha\n',
    canonicalPath: 'knowgrph/docs/alpha.md',
    repositoryPath: 'docs/alpha.md',
    repositoryId: 'knowgrph-docs',
  },
  {
    path: 'knowgrph/docs/beta.json',
    kind: 'json',
    text: '{"beta":true}',
    canonicalPath: 'knowgrph/docs/beta.json',
    repositoryPath: 'docs/beta.json',
    repositoryId: 'knowgrph-docs',
  },
]

export async function testKnowgrphGitSaveBridgeWritesEveryCanonicalDocument(): Promise<void> {
  const requests: Request[] = []
  const result = await saveKnowgrphGitDocumentsThroughBridge({
    workspaceId: 'kgws:canonical-docs',
    remoteId: 'origin',
    baseRequestUrl: 'http://127.0.0.1:8787',
    sessionToken: 'browser-session',
    documents,
    signal: new AbortController().signal,
    fetcher: async (input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      const body = JSON.parse(await request.clone().text()) as Record<string, unknown>
      const index = requests.length - 1
      return Response.json({
        ok: true,
        apiVersion: '2026-05-04',
        workspaceId: 'kgws:canonical-docs',
        documentKey: body.documentKey,
        repositoryTarget: body.repositoryTarget,
        githubPath: documents[index]?.repositoryPath,
        commitSha: index === 0 ? COMMIT_OBJECT_ID : null,
        contentSha: 'b'.repeat(40),
        committedAtMs: index + 1,
      })
    },
  })
  assert.equal(result.commitObjectId, COMMIT_OBJECT_ID)
  assert.equal(requests.length, documents.length)
  for (const [index, request] of requests.entries()) {
    assert.equal(request.method, 'POST')
    assert.equal(new URL(request.url).pathname, '/api/storage/collab/save')
    assert.equal(request.headers.get('authorization'), 'Bearer browser-session')
    const body = JSON.parse(await request.text()) as Record<string, unknown>
    assert.equal(body.documentKey, documents[index]?.canonicalPath)
    assert.equal(body.gitRemoteId, 'origin')
    assert.equal(body.serializedText, documents[index]?.text)
  }
}

export async function testKnowgrphGitSaveBridgeFailsClosedOnMismatchedAuthority(): Promise<void> {
  await assert.rejects(
    saveKnowgrphGitDocumentsThroughBridge({
      workspaceId: 'kgws:canonical-docs',
      remoteId: 'origin',
      baseRequestUrl: 'http://127.0.0.1:8787',
      sessionToken: 'browser-session',
      documents: [documents[0]!],
      signal: new AbortController().signal,
      fetcher: async () => Response.json({
        ok: true,
        apiVersion: '2026-05-04',
        workspaceId: 'kgws:canonical-docs',
        remoteId: 'origin',
        documentKey: 'agentic-canvas-os/docs/forbidden.md',
        repositoryTarget: 'knowgrph-docs',
        githubPath: 'docs/alpha.md',
        commitSha: COMMIT_OBJECT_ID,
        contentSha: 'b'.repeat(40),
        committedAtMs: 1,
      }),
    }),
    /rejected the canonical document write/,
  )
}

export async function testKnowgrphGitSaveBridgeClassifiesTransportFailures(): Promise<void> {
  const cases = [
    { status: 401, code: 'auth-failure' },
    { status: 403, code: 'auth-failure' },
    { status: 429, code: 'retryable' },
    { status: 503, code: 'retryable' },
  ] as const
  for (const testCase of cases) {
    await assert.rejects(
      saveKnowgrphGitDocumentsThroughBridge({
        workspaceId: 'kgws:canonical-docs',
        remoteId: 'origin',
        baseRequestUrl: 'http://127.0.0.1:8787',
        sessionToken: 'browser-session',
        documents: [documents[0]!],
        signal: new AbortController().signal,
        fetcher: async () => new Response(null, { status: testCase.status }),
      }),
      error => error instanceof KnowgrphGitAuthorityError
        && error.code === testCase.code,
    )
  }
}
