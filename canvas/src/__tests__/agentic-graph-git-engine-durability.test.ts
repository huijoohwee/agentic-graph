import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AgenticGraphGitAuthorityError,
  type AgenticGraphGitDocumentWriteAuthority,
  type AgenticGraphGitOperationOutboxRecord,
  type AgenticGraphGitRefRecord,
  type AgenticGraphGitRelayFetchResult,
} from '../lib/storage/git/agentic-graph-git-contracts'
import { createAgenticGraphGitEngine } from '../lib/storage/git/agentic-graph-git-engine'
import { buildAgenticGraphGitRemoteTrackingRefName } from '../lib/storage/git/agentic-graph-git-repository'
import {
  buildGitRemoteFixture,
  buildGitRemoteFixtureAfter,
  copyGitTestValue,
  createGitTestAuthority,
  gitTestCommitRequest,
  gitTestRelay,
  MemoryGitCache,
} from './support/agentic-graph-git-engine-test-support'

const repositoryRequest = {
  workspaceId: 'workspace',
  repositoryId: 'repo',
  remoteId: 'origin',
  canonicalPathScope: 'agentic-graph',
  refName: 'refs/heads/main',
}

const fixtureHead = (fixture: AgenticGraphGitRelayFetchResult): string => {
  const target = fixture.refs.find(ref =>
    ref.refName === repositoryRequest.refName && ref.targetKind === 'direct')?.target
  if (!target) throw new Error('Git test fixture has no branch head')
  return target
}

export async function testAgenticGraphGitCloneFetchRefIsolation() {
  const initial = await buildGitRemoteFixture('repo', 'alpha')
  const advanced = await buildGitRemoteFixtureAfter({ parent: initial, names: ['beta'] })
  let fetchIndex = 0
  const cache = new MemoryGitCache()
  const engine = createAgenticGraphGitEngine({
    cache,
    authority: createGitTestAuthority(),
    relay: gitTestRelay(async () =>
      copyGitTestValue(fetchIndex++ === 0 ? initial : advanced)),
    deviceId: 'device',
  })

  assert.equal((await engine.clone(repositoryRequest, 'online')).status, 'complete')
  assert.equal((await engine.fetch(repositoryRequest, 'online')).status, 'complete')
  assert.equal(
    (await cache.getRef('workspace', 'repo', 'refs/heads/main'))?.target,
    fixtureHead(initial),
  )
  assert.equal(
    (await cache.getRef(
      'workspace',
      'repo',
      buildAgenticGraphGitRemoteTrackingRefName('origin', 'refs/heads/main'),
    ))?.target,
    fixtureHead(advanced),
  )
  const head = await cache.getRef('workspace', 'repo', 'HEAD')
  assert.equal(head?.targetKind, 'symbolic')
  assert.equal(head?.target, 'refs/heads/main')
}
test('clone creates local HEAD while fetch advances only the verified tracking ref', testAgenticGraphGitCloneFetchRefIsolation)

export async function testAgenticGraphGitPushTrackingAndReplay() {
  const cache = new MemoryGitCache()
  let pushCalls = 0
  const engine = createAgenticGraphGitEngine({
    cache,
    authority: createGitTestAuthority(),
    relay: gitTestRelay(
      async () => { throw new Error('unexpected fetch') },
      async args => {
        pushCalls += 1
        return { status: 'applied', remoteObjectId: args.targetObjectId, transferBytes: 0 }
      },
    ),
    deviceId: 'device',
  })
  const firstCommit = await engine.commit(gitTestCommitRequest(['alpha']), 'online')
  assert.equal(firstCommit.status, 'complete')
  const firstObjectId = firstCommit.status === 'complete' ? firstCommit.objectId : null
  assert.ok(firstObjectId)
  assert.equal((await engine.push({ ...repositoryRequest, expectedRemoteObjectId: null }, 'online')).status, 'complete')
  const secondCommit = await engine.commit(gitTestCommitRequest(['beta']), 'online')
  assert.equal(secondCommit.status, 'complete')
  const secondObjectId = secondCommit.status === 'complete' ? secondCommit.objectId : null
  assert.ok(secondObjectId)
  assert.equal(
    (await engine.push({ ...repositoryRequest, expectedRemoteObjectId: firstObjectId }, 'online')).status,
    'complete',
  )
  assert.equal(
    (await engine.push({ ...repositoryRequest, expectedRemoteObjectId: secondObjectId }, 'online')).status,
    'complete',
  )
  assert.equal(pushCalls, 2)
  const tracking = await cache.getRef(
    'workspace',
    'repo',
    buildAgenticGraphGitRemoteTrackingRefName('origin', 'refs/heads/main'),
  )
  assert.equal(tracking?.target, secondObjectId)
  assert.equal(cache.outbox.size, 0)
}
test('two pushes atomically advance tracking and an up-to-date replay avoids the relay', testAgenticGraphGitPushTrackingAndReplay)

export async function testAgenticGraphGitRemoteSaveMaterialization() {
  const initial = await buildGitRemoteFixture('repo', 'alpha')
  const saved = await buildGitRemoteFixtureAfter({ parent: initial, names: ['beta'] })
  let fetchCalls = 0
  let pushCalls = 0
  const authority: AgenticGraphGitDocumentWriteAuthority = {
    ...createGitTestAuthority(),
    async writeCommit() {
      return { kind: 'remote-save-bridge', commitObjectId: fixtureHead(saved) }
    },
  }
  const cache = new MemoryGitCache()
  const engine = createAgenticGraphGitEngine({
    cache,
    authority,
    relay: gitTestRelay(
      async () => copyGitTestValue(fetchCalls++ === 0 ? initial : saved),
      async args => {
        pushCalls += 1
        return { status: 'applied', remoteObjectId: args.targetObjectId, transferBytes: 0 }
      },
    ),
    deviceId: 'device',
  })
  await engine.clone(repositoryRequest, 'online')
  const committed = await engine.commit(gitTestCommitRequest(['beta']), 'online')
  assert.equal(committed.status, 'complete')
  assert.equal(committed.status === 'complete' ? committed.objectId : null, fixtureHead(saved))
  const pushed = await engine.push({
    ...repositoryRequest,
    expectedRemoteObjectId: fixtureHead(saved),
  }, 'online')
  assert.equal(pushed.status, 'complete')
  assert.equal(pushCalls, 0)
}
test('remote Save Bridge materializes its exact tree and subsequent push is up to date', testAgenticGraphGitRemoteSaveMaterialization)

export async function testAgenticGraphGitRemoteSaveSequentialChain() {
  const firstWrite = await buildGitRemoteFixture('repo', 'alpha')
  const secondWrite = await buildGitRemoteFixtureAfter({
    parent: firstWrite,
    names: ['alpha', 'beta'],
  })
  const sequential = {
    ...secondWrite,
    objects: Array.from(new Map(
      [...firstWrite.objects, ...secondWrite.objects].map(object => [object.objectId, object]),
    ).values()),
    transferBytes: 0,
  }
  sequential.transferBytes = sequential.objects.reduce((sum, object) => sum + object.byteLength, 0)
  const cache = new MemoryGitCache()
  const engine = createAgenticGraphGitEngine({
    cache,
    authority: {
      ...createGitTestAuthority(),
      async writeCommit() {
        return { kind: 'remote-save-bridge', commitObjectId: fixtureHead(sequential) }
      },
    },
    relay: gitTestRelay(async () => copyGitTestValue(sequential)),
    deviceId: 'device',
  })
  const result = await engine.commit(gitTestCommitRequest(['alpha', 'beta']), 'online')
  assert.equal(result.status, 'complete')
  assert.equal(result.status === 'complete' ? result.objectId : null, fixtureHead(sequential))
  assert.equal(cache.outbox.size, 0)
}
test(
  'remote Save Bridge accepts a two-document single-parent commit chain with the exact final tree',
  testAgenticGraphGitRemoteSaveSequentialChain,
)

export async function testAgenticGraphGitRemoteSaveRejectsMissingDeletion() {
  const initial = await buildGitRemoteFixture('repo', 'alpha')
  const retainedDeletion = await buildGitRemoteFixtureAfter({
    parent: initial,
    names: ['alpha', 'beta'],
  })
  let fetchCalls = 0
  const cache = new MemoryGitCache()
  const engine = createAgenticGraphGitEngine({
    cache,
    authority: {
      ...createGitTestAuthority(),
      async writeCommit() {
        return { kind: 'remote-save-bridge', commitObjectId: null }
      },
    },
    relay: gitTestRelay(async () =>
      copyGitTestValue(fetchCalls++ === 0 ? initial : retainedDeletion)),
    deviceId: 'device',
  })
  await engine.clone(repositoryRequest, 'online')
  const result = await engine.commit(gitTestCommitRequest(['beta']), 'online')
  assert.equal(result.status, 'invalid-remote')
  assert.equal(
    (await cache.getRef('workspace', 'repo', repositoryRequest.refName))?.target,
    fixtureHead(initial),
  )
  assert.equal(cache.outbox.size, 1)
}
test(
  'remote Save Bridge cannot complete when the fetched tree retained a deleted document',
  testAgenticGraphGitRemoteSaveRejectsMissingDeletion,
)

export async function testAgenticGraphGitCommitReportsVerifiedDocumentDeletion() {
  const parent = await buildGitRemoteFixture('repo', 'alpha')
  const current = await buildGitRemoteFixtureAfter({
    parent,
    names: ['alpha', 'beta'],
  })
  const fixture = {
    ...current,
    objects: Array.from(new Map(
      [...parent.objects, ...current.objects].map(object => [object.objectId, object]),
    ).values()),
  }
  const writes: Array<Parameters<AgenticGraphGitDocumentWriteAuthority['writeCommit']>[0]> = []
  const cache = new MemoryGitCache()
  const engine = createAgenticGraphGitEngine({
    cache,
    authority: createGitTestAuthority(writes),
    relay: gitTestRelay(async () => copyGitTestValue(fixture)),
    deviceId: 'device',
  })
  await engine.clone(repositoryRequest, 'online')
  const result = await engine.commit(gitTestCommitRequest(['alpha']), 'online')
  assert.equal(result.status, 'complete')
  assert.deepEqual(writes[0]?.deletions, [{
    kind: 'markdown',
    canonicalPath: 'agentic-graph/docs/beta.md',
    repositoryPath: 'docs/beta.md',
    repositoryId: 'repo',
  }])
}
test(
  'commit authority receives deletions derived from the verified parent tree',
  testAgenticGraphGitCommitReportsVerifiedDocumentDeletion,
)

class CrashOnceGitCache extends MemoryGitCache {
  private crashNextAcknowledgement = false
  private crashFailurePatch = false

  enableAcknowledgementCrash(): void {
    this.crashNextAcknowledgement = true
  }

  override async acknowledgeClaimedOutbox(
    id: string,
    claimToken: string,
    refWrites: AgenticGraphGitRefRecord[] = [],
  ) {
    if (this.crashNextAcknowledgement) {
      this.crashNextAcknowledgement = false
      this.crashFailurePatch = true
      throw new Error('simulated process crash before acknowledgement')
    }
    return super.acknowledgeClaimedOutbox(id, claimToken, refWrites)
  }

  override async patchClaimedOutbox(
    id: string,
    claimToken: string,
    patch: Partial<AgenticGraphGitOperationOutboxRecord>,
    releaseClaim = false,
  ) {
    if (this.crashFailurePatch && patch.lastStatus && patch.lastStatus !== 'queued') {
      this.crashFailurePatch = false
      throw new Error('simulated process terminated')
    }
    return super.patchClaimedOutbox(id, claimToken, patch, releaseClaim)
  }
}

export async function testAgenticGraphGitCloneCrashReplay() {
  const fixture = await buildGitRemoteFixture('repo', 'alpha')
  const cache = new CrashOnceGitCache()
  cache.enableAcknowledgementCrash()
  let fetchCalls = 0
  let clockMs = 0
  const dependencies = {
    cache,
    authority: createGitTestAuthority(),
    relay: gitTestRelay(async () => {
      fetchCalls += 1
      return copyGitTestValue(fixture)
    }),
    deviceId: 'device',
    now: () => clockMs,
  }
  await assert.rejects(
    createAgenticGraphGitEngine(dependencies).clone(repositoryRequest, 'online'),
    /simulated process terminated/,
  )
  clockMs = 300_001
  const replay = await createAgenticGraphGitEngine(dependencies).drain('workspace')
  assert.equal(replay[0]?.status, 'complete')
  assert.equal(fetchCalls, 1)
  assert.equal(cache.outbox.size, 0)
}
test('fully materialized clone replay acknowledges without fetching twice', testAgenticGraphGitCloneCrashReplay)

export async function testAgenticGraphGitRemoteSaveCrashReplay() {
  const initial = await buildGitRemoteFixture('repo', 'alpha')
  const saved = await buildGitRemoteFixtureAfter({ parent: initial, names: ['beta'] })
  const cache = new CrashOnceGitCache()
  let fetchCalls = 0
  let authorityCalls = 0
  let clockMs = 0
  const authority: AgenticGraphGitDocumentWriteAuthority = {
    ...createGitTestAuthority(),
    async writeCommit() {
      authorityCalls += 1
      return { kind: 'remote-save-bridge', commitObjectId: null }
    },
  }
  const relay = gitTestRelay(async () => {
    fetchCalls += 1
    if (fetchCalls === 1) return copyGitTestValue(initial)
    if (fetchCalls === 2) return copyGitTestValue(saved)
    return { ...copyGitTestValue(saved), objects: [], transferBytes: 0 }
  })
  const dependencies = {
    cache,
    authority,
    relay,
    deviceId: 'device',
    now: () => clockMs,
  }
  await createAgenticGraphGitEngine(dependencies).clone(repositoryRequest, 'online')
  cache.enableAcknowledgementCrash()
  await assert.rejects(
    createAgenticGraphGitEngine(dependencies).commit(gitTestCommitRequest(['beta']), 'online'),
    /simulated process terminated/,
  )
  clockMs = 300_001
  const replay = await createAgenticGraphGitEngine(dependencies).drain('workspace')
  assert.equal(replay[0]?.status, 'complete')
  assert.equal(replay[0]?.status === 'complete' ? replay[0].objectId : null, fixtureHead(saved))
  assert.equal(authorityCalls, 1)
  assert.equal(fetchCalls, 3)
  assert.equal(cache.outbox.size, 0)
}
test(
  'remote-save replay attests fetched parent and tree without invoking the bridge twice',
  testAgenticGraphGitRemoteSaveCrashReplay,
)

export async function testAgenticGraphGitAuthorityTransportClassification() {
  for (const [code, expectedStatus, expectedCalls] of [
    ['retryable', 'retry-exhausted', 3],
    ['auth-failure', 'auth-failure', 1],
  ] as const) {
    let calls = 0
    const cache = new MemoryGitCache()
    const engine = createAgenticGraphGitEngine({
      cache,
      authority: {
        ...createGitTestAuthority(),
        async writeCommit() {
          calls += 1
          throw new AgenticGraphGitAuthorityError(code)
        },
      },
      relay: gitTestRelay(async () => { throw new Error('unexpected fetch') }),
      deviceId: 'device',
      sleep: async () => undefined,
    })
    assert.equal((await engine.commit(gitTestCommitRequest(['alpha']), 'online')).status, expectedStatus)
    assert.equal(calls, expectedCalls)
    assert.equal(cache.outbox.size, 1)
  }
}
test(
  'typed Save Bridge transport failures map to retry and authentication outcomes',
  testAgenticGraphGitAuthorityTransportClassification,
)

export async function testAgenticGraphGitRetainedFailureRequeuesOnLaterDrain() {
  let failing = true
  let writes = 0
  const cache = new MemoryGitCache()
  const engine = createAgenticGraphGitEngine({
    cache,
    authority: {
      ...createGitTestAuthority(),
      async writeCommit(args) {
        writes += 1
        if (failing) throw new AgenticGraphGitAuthorityError('retryable')
        return { kind: 'local-attestation', commitObjectId: args.expectedCommitObjectId }
      },
    },
    relay: gitTestRelay(async () => ({
      objects: [],
      refs: [],
      headRefName: 'HEAD',
      transferBytes: 0,
    })),
    deviceId: 'device',
    sleep: async () => undefined,
  })
  assert.equal((await engine.commit(gitTestCommitRequest(['alpha']), 'online')).status, 'retry-exhausted')
  assert.equal(writes, 3)
  failing = false
  const resumed = await engine.drain('workspace')
  assert.equal(resumed[0]?.status, 'complete')
  assert.equal(writes, 4)
  assert.equal(cache.outbox.size, 0)
}
test(
  'retained Git failure is requeued only by a later drain and can recover',
  testAgenticGraphGitRetainedFailureRequeuesOnLaterDrain,
)
