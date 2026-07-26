import assert from 'node:assert/strict'
import type { SourceFile } from '@/hooks/store/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import type {
  KnowgrphGitDocument,
  KnowgrphGitDocumentWriteAuthority,
  KnowgrphGitIdentity,
  KnowgrphGitResolvedDocument,
} from '@/lib/storage/git/knowgrphGitContracts'
import {
  collectScopedDocuments,
  createSaveBridgeDocumentAuthority,
} from '@/lib/storage/knowgrphStorageGitDocumentAuthority'

const SCOPE = 'knowgrph/docs'
const REPOSITORY_ID = 'knowgrph-docs'
const WORKSPACE_ID = 'kgws:document-authority'
const COMMIT_OBJECT_ID = 'a'.repeat(40)
const identity: KnowgrphGitIdentity = {
  name: 'Knowgrph Browser',
  email: 'browser@knowgrph.local',
  timestampSeconds: 1,
  timezone: '+0000',
}

const sourceFiles: SourceFile[] = [
  {
    id: 'source-alpha',
    name: 'alpha.md',
    text: '# Alpha\n',
    enabled: true,
    status: 'parsed',
    source: { kind: 'local', path: 'workspace:/docs/alpha.md' },
  },
  {
    id: 'source-beta',
    name: 'beta.json',
    text: '{"beta":true}',
    enabled: true,
    status: 'parsed',
    source: { kind: 'local', path: 'workspace:/knowgrph/docs/beta.json' },
  },
]

const resolveDocuments = async (
  authority: KnowgrphGitDocumentWriteAuthority,
  documents: readonly KnowgrphGitDocument[],
): Promise<KnowgrphGitResolvedDocument[]> => Promise.all(
  documents.map(async document => {
    const result = await authority.resolveDocument(document)
    if (result.ok === false) {
      throw new Error(`Expected authority for ${document.path}`)
    }
    return { ...document, ...result.document }
  }),
)

const writeCommit = (
  authority: KnowgrphGitDocumentWriteAuthority,
  documents: KnowgrphGitResolvedDocument[],
) => authority.writeCommit({
  operationId: 'operation-document-authority',
  workspaceId: WORKSPACE_ID,
  repositoryId: REPOSITORY_ID,
  refName: 'refs/heads/main',
  parentObjectId: null,
  treeObjectId: 'b'.repeat(40),
  expectedCommitObjectId: COMMIT_OBJECT_ID,
  message: 'Save canonical documents',
  author: identity,
  committer: identity,
  documents,
  deletions: [],
  signal: new AbortController().signal,
})

export async function testKnowgrphGitDocumentAuthorityWritesCanonicalSnapshotThroughBridge(): Promise<void> {
  const previous = useGraphStore.getState().sourceFiles
  const requests: Request[] = []
  try {
    useGraphStore.getState().setSourceFiles(sourceFiles)
    const authority = createSaveBridgeDocumentAuthority({
      scope: SCOPE,
      repositoryId: REPOSITORY_ID,
      workspaceId: WORKSPACE_ID,
      remoteId: 'origin',
      baseRequestUrl: 'http://127.0.0.1:8787',
      sessionToken: 'browser-session',
      fetcher: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        const body = JSON.parse(
          await request.clone().text(),
        ) as Record<string, unknown>
        return Response.json({
          ok: true,
          apiVersion: '2026-05-04',
          operation: 'upsert',
          workspaceId: WORKSPACE_ID,
          documentKey: body.documentKey,
          repositoryTarget: body.repositoryTarget,
          githubPath: String(body.documentKey).replace(/^knowgrph\//, ''),
          commitSha: COMMIT_OBJECT_ID,
          contentSha: 'c'.repeat(40),
          committedAtMs: 1,
        })
      },
    })
    const documents = await resolveDocuments(
      authority,
      collectScopedDocuments(SCOPE),
    )
    const result = await writeCommit(authority, documents)

    assert.deepEqual(result, {
      kind: 'remote-save-bridge',
      commitObjectId: COMMIT_OBJECT_ID,
    })
    assert.equal(requests.length, documents.length)
    for (const [index, request] of requests.entries()) {
      assert.equal(request.method, 'POST')
      assert.equal(new URL(request.url).pathname, '/api/storage/collab/save')
      assert.equal(
        request.headers.get('authorization'),
        'Bearer browser-session',
      )
      const body = JSON.parse(
        await request.text(),
      ) as Record<string, unknown>
      assert.equal(body.documentKey, documents[index]?.canonicalPath)
      assert.equal(body.gitRemoteId, 'origin')
      assert.equal(body.serializedText, documents[index]?.text)
    }
  } finally {
    useGraphStore.getState().setSourceFiles(previous)
  }
}

export async function testKnowgrphGitDocumentAuthorityRejectsChangedSnapshotBeforeBridge(): Promise<void> {
  const previous = useGraphStore.getState().sourceFiles
  let bridgeCalls = 0
  try {
    useGraphStore.getState().setSourceFiles(sourceFiles)
    const authority = createSaveBridgeDocumentAuthority({
      scope: SCOPE,
      repositoryId: REPOSITORY_ID,
      workspaceId: WORKSPACE_ID,
      remoteId: 'origin',
      baseRequestUrl: 'http://127.0.0.1:8787',
      sessionToken: 'browser-session',
      fetcher: async () => {
        bridgeCalls += 1
        throw new Error('Save Bridge must not run for a stale snapshot')
      },
    })
    const documents = await resolveDocuments(
      authority,
      collectScopedDocuments(SCOPE),
    )
    useGraphStore.getState().setSourceFiles([
      { ...sourceFiles[0]!, text: '# Changed after commit preflight\n' },
      sourceFiles[1]!,
    ])

    await assert.rejects(
      writeCommit(authority, documents),
      /snapshot changed before persistence/,
    )
    assert.equal(bridgeCalls, 0)
  } finally {
    useGraphStore.getState().setSourceFiles(previous)
  }
}
