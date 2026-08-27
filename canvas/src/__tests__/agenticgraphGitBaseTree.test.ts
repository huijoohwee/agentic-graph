import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  AgenticGraphGitCommitRequest,
  AgenticGraphGitObjectRecord,
  AgenticGraphGitResolvedDocument,
} from '../lib/storage/git/agenticgraphGitContracts'
import {
  decodeGitBytesBase64,
  parseGitCommitHeader,
  parseGitTree,
} from '../lib/storage/git/agenticgraphGitObjectCodec'
import {
  buildAgenticGraphGitCommitObjects,
  deriveAgenticGraphGitRepositoryPathScope,
} from '../lib/storage/git/agenticgraphGitRepository'

const identity = {
  name: 'AgenticGraph',
  email: 'git@agenticgraph.dev',
  timestampSeconds: 1_777_000_000,
  timezone: '+0000',
}

const request = (
  canonicalPathScope: string,
  documents: AgenticGraphGitResolvedDocument[],
): AgenticGraphGitCommitRequest => ({
  workspaceId: 'workspace',
  repositoryId: 'repo',
  remoteId: 'origin',
  canonicalPathScope,
  refName: 'refs/heads/main',
  documents,
  message: 'snapshot',
  author: identity,
})

const document = (
  canonicalPath: string,
  repositoryPath: string,
  text: string,
): AgenticGraphGitResolvedDocument => ({
  path: canonicalPath,
  canonicalPath,
  repositoryPath,
  repositoryId: 'repo',
  kind: repositoryPath.endsWith('.json') ? 'json' : 'markdown',
  text,
})

const flattenCommit = (
  commitObjectId: string,
  records: AgenticGraphGitObjectRecord[],
): Map<string, { objectId: string; text: string }> => {
  const objects = new Map(records.map(record => [record.objectId, record]))
  const read = (objectId: string) => {
    const record = objects.get(objectId)
    if (!record) throw new Error(`missing ${objectId}`)
    return { record, body: decodeGitBytesBase64(record.bodyBase64) }
  }
  const commit = read(commitObjectId)
  const header = parseGitCommitHeader(commit.body)
  const files = new Map<string, { objectId: string; text: string }>()
  const walk = (treeObjectId: string, prefix: string) => {
    const tree = read(treeObjectId)
    for (const entry of parseGitTree(tree.body)) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.mode === '40000') walk(entry.objectId, path)
      else {
        const blob = read(entry.objectId)
        files.set(path, {
          objectId: entry.objectId,
          text: new TextDecoder().decode(blob.body),
        })
      }
    }
  }
  walk(header.treeObjectId, '')
  return files
}

test('path-scoped commit replaces its authority snapshot and preserves the fetched base root', async () => {
  const baseDocuments = [
    document('agenticgraph/README.md', 'README.md', '# repository\n'),
    document('agenticgraph/config.json', 'config.json', '{"outside":true}\n'),
    document('agenticgraph/docs/stale.md', 'docs/stale.md', '# stale\n'),
    document('agenticgraph/docs/old.md', 'docs/old.md', '# old\n'),
  ]
  const baseRequest = request('agenticgraph', baseDocuments)
  const base = await buildAgenticGraphGitCommitObjects({
    request: baseRequest,
    documents: baseDocuments,
    parentObjectId: null,
    nowMs: 1,
  })
  const nextDocuments = [
    document('agenticgraph/docs/current.md', 'docs/current.md', '# current\n'),
    document('agenticgraph/docs/index.json', 'docs/index.json', '{"current":true}\n'),
  ]
  const nextRequest = {
    ...request('agenticgraph/docs', nextDocuments),
    message: 'replace docs snapshot',
  }
  const repositoryPathScope = deriveAgenticGraphGitRepositoryPathScope(
    nextRequest.canonicalPathScope,
    nextDocuments,
  )
  assert.equal(repositoryPathScope, 'docs')
  const next = await buildAgenticGraphGitCommitObjects({
    request: nextRequest,
    documents: nextDocuments,
    parentObjectId: base.commitObjectId,
    parentObjects: base.objects,
    repositoryPathScope,
    nowMs: 2,
  })
  const baseFiles = flattenCommit(base.commitObjectId, base.objects)
  const nextFiles = flattenCommit(next.commitObjectId, [...base.objects, ...next.objects])

  assert.deepEqual(Array.from(nextFiles.keys()).sort(), [
    'README.md',
    'config.json',
    'docs/current.md',
    'docs/index.json',
  ])
  assert.deepEqual(nextFiles.get('README.md'), baseFiles.get('README.md'))
  assert.deepEqual(nextFiles.get('config.json'), baseFiles.get('config.json'))
  assert.equal(nextFiles.has('docs/stale.md'), false)
  assert.equal(nextFiles.has('docs/old.md'), false)
})

test('authority canonical-to-repository scope mapping fails closed when paths disagree', () => {
  const documents = [
    document('agenticgraph/docs/a.md', 'docs/a.md', '# a\n'),
    document('agenticgraph/docs/b.md', 'content/b.md', '# b\n'),
  ]
  assert.throws(
    () => deriveAgenticGraphGitRepositoryPathScope('agenticgraph/docs', documents),
    /ambiguous/,
  )
  assert.throws(
    () => deriveAgenticGraphGitRepositoryPathScope(
      'agenticgraph/docs',
      [document('agenticgraph/other/a.md', 'docs/a.md', '# a\n')],
    ),
    /outside/,
  )
})
