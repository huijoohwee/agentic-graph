import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildGitCommitBody,
  buildGitLooseObjectBytes,
  encodeGitBytesBase64,
  encodeGitTree,
  hashGitObject,
  parseGitCommitHeader,
  parseGitTree,
  verifyGitRelayObject,
} from '../lib/storage/git/agenticgraphGitObjectCodec'

test('AgenticGraph Git codec uses the canonical loose-object type and byte-length header', async () => {
  const empty = new Uint8Array()
  assert.equal(await hashGitObject('blob', empty), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')

  const utf8Body = new TextEncoder().encode('é')
  const loose = buildGitLooseObjectBytes('blob', utf8Body)
  assert.deepEqual(
    Array.from(loose),
    Array.from(new Uint8Array([...new TextEncoder().encode('blob 2\0'), ...utf8Body])),
  )
})

test('AgenticGraph Git tree parser rejects truncated, symlink, and submodule forms', () => {
  const objectId = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'
  const valid = encodeGitTree([{ mode: '100644', name: 'readme.md', objectId }])
  assert.deepEqual(parseGitTree(valid), [{ mode: '100644', name: 'readme.md', objectId }])
  assert.throws(() => parseGitTree(valid.subarray(0, valid.byteLength - 1)), /truncated/)

  const rawEntry = (mode: string): Uint8Array => new Uint8Array([
    ...new TextEncoder().encode(`${mode} unsafe\0`),
    ...Array.from({ length: 20 }, () => 0),
  ])
  assert.throws(() => parseGitTree(rawEntry('120000')), /symlinks/)
  assert.throws(() => parseGitTree(rawEntry('160000')), /submodules/)
})

test('AgenticGraph Git commit parser verifies required canonical references', async () => {
  const treeBody = encodeGitTree([])
  const treeObjectId = await hashGitObject('tree', treeBody)
  const body = buildGitCommitBody({
    treeObjectId,
    author: {
      name: 'AgenticGraph',
      email: 'git@agenticgraph.dev',
      timestampSeconds: 1_777_000_000,
      timezone: '+0800',
    },
    message: 'test commit',
  })
  assert.deepEqual(parseGitCommitHeader(body), { treeObjectId, parentObjectIds: [] })
  const objectId = await hashGitObject('commit', body)
  await assert.doesNotReject(() => verifyGitRelayObject({
    objectId,
    objectType: 'commit',
    bodyBase64: encodeGitBytesBase64(body),
    byteLength: body.byteLength,
  }))
  await assert.rejects(() => verifyGitRelayObject({
    objectId: '0000000000000000000000000000000000000000',
    objectType: 'commit',
    bodyBase64: encodeGitBytesBase64(body),
    byteLength: body.byteLength,
  }), /canonical SHA-1 verification/)
})
