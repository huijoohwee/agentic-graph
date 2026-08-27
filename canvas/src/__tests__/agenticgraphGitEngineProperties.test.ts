import assert from 'node:assert/strict'
import test from 'node:test'
import fc from 'fast-check'
import {
  KNOWGRPH_GIT_OPERATION_BOUNDS,
  KnowgrphGitRelayError,
  type KnowgrphGitDocumentWriteAuthority,
  type KnowgrphGitIssue,
  type KnowgrphGitRelayFetchResult,
} from '../lib/storage/git/knowgrphGitContracts'
import { createKnowgrphGitEngine } from '../lib/storage/git/knowgrphGitEngine'
import { buildKnowgrphGitRemoteTrackingRefName } from '../lib/storage/git/knowgrphGitRepository'
import {
  buildGitRemoteFixture as buildRemoteFixture,
  copyGitTestValue as copy,
  createGitTestAuthority as createAuthority,
  gitTestCommitRequest as commitRequest,
  gitTestRelay as relayWithFetch,
  gitTestRemoteRequest as remoteRequest,
  MemoryGitCache,
} from './support/knowgrphGitEngineTestSupport'

const PROPERTY_RUNS = 100
const identifierArbitrary = fc.array(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
  { minLength: 1, maxLength: 10 },
).map(parts => parts.join(''))

export async function testKnowgrphGitProperty40VerifiedObjectsBeforeRefs() {
  await fc.assert(fc.asyncProperty(identifierArbitrary, async name => {
    const cache = new MemoryGitCache()
    const fixture = await buildRemoteFixture('remote', name)
    const engine = createKnowgrphGitEngine({
      cache,
      authority: createAuthority(),
      relay: relayWithFetch(async () => copy(fixture)),
      deviceId: 'device',
    })
    const result = await engine.clone(remoteRequest(), 'online')
    assert.equal(result.status, 'complete')
    assert.ok(cache.events.findIndex(event => event.startsWith('objects:')) >= 0)
    assert.ok(
      cache.events.findIndex(event => event.startsWith('objects:'))
        < cache.events.findIndex(event => event.startsWith('refs:')),
    )
    assert.equal(cache.outbox.size, 0)
    const ref = await cache.getRef('workspace', 'remote', 'refs/heads/main')
    assert.equal(ref?.target, result.status === 'complete' ? result.objectId : null)
    const trackingRef = await cache.getRef(
      'workspace',
      'remote',
      buildKnowgrphGitRemoteTrackingRefName('origin-remote', 'refs/heads/main'),
    )
    assert.equal(trackingRef?.target, result.status === 'complete' ? result.objectId : null)
    assert.ok(result.status === 'complete' && await cache.getObject('workspace', 'remote', result.objectId!))
  }), { numRuns: PROPERTY_RUNS })
}

test(
  'Property 40: clone and fetch materialize verified objects before refs and completion',
  testKnowgrphGitProperty40VerifiedObjectsBeforeRefs,
)

export async function testKnowgrphGitProperty41AuthorityBatchPreflight() {
  await fc.assert(fc.asyncProperty(
    fc.uniqueArray(identifierArbitrary, { minLength: 1, maxLength: 4 }),
    async names => {
      const cache = new MemoryGitCache()
      const writeCalls: Array<Parameters<KnowgrphGitDocumentWriteAuthority['writeCommit']>[0]> = []
      const engine = createKnowgrphGitEngine({
        cache,
        authority: createAuthority(writeCalls),
        relay: relayWithFetch(async () => { throw new Error('unexpected relay') }),
        deviceId: 'device',
      })
      const result = await engine.commit(commitRequest(names), 'online')
      assert.equal(result.status, 'complete')
      assert.equal(writeCalls.length, 1)
      assert.deepEqual(writeCalls[0]!.documents.map(document => document.path), names.map(name => `knowgrph/docs/${name}.md`))
      assert.equal(writeCalls[0]!.expectedCommitObjectId, result.status === 'complete' ? result.objectId : null)
      assert.equal(cache.outbox.size, 0)
    },
  ), { numRuns: PROPERTY_RUNS })
}

test(
  'Property 41: commit preflights and dispatches every document through one authority batch',
  testKnowgrphGitProperty41AuthorityBatchPreflight,
)

export async function testKnowgrphGitProperty42AtomicPathRejection() {
  await fc.assert(fc.asyncProperty(identifierArbitrary, fc.boolean(), async (name, duplicate) => {
    const cache = new MemoryGitCache()
    const writeCalls: Array<Parameters<KnowgrphGitDocumentWriteAuthority['writeCommit']>[0]> = []
    const request = commitRequest([name])
    request.documents = duplicate
      ? [request.documents[0]!, copy(request.documents[0]!)]
      : [{
          ...request.documents[0]!,
          path: `huijoohwee/docs/workspace-seeds/${name}.md`,
        }]
    const engine = createKnowgrphGitEngine({
      cache,
      authority: createAuthority(writeCalls),
      relay: relayWithFetch(async () => { throw new Error('unexpected relay') }),
      deviceId: 'device',
    })
    const result = await engine.commit(request, 'online')
    assert.equal(result.status, 'unsupported-path')
    assert.equal(writeCalls.length, 0)
    assert.equal(cache.objects.size, 0)
    assert.equal(cache.refs.size, 0)
    assert.equal(cache.outbox.size, 0)
  }), { numRuns: PROPERTY_RUNS })
}

test(
  'Property 42: forbidden or duplicate paths reject atomically before write or persistence',
  testKnowgrphGitProperty42AtomicPathRejection,
)

export async function testKnowgrphGitProperty43DurableFifoDrain() {
  await fc.assert(fc.asyncProperty(
    fc.uniqueArray(identifierArbitrary, { minLength: 1, maxLength: 4 }),
    async repositoryIds => {
      const cache = new MemoryGitCache()
      const fixtures = new Map<string, KnowgrphGitRelayFetchResult>()
      for (const repositoryId of repositoryIds) {
        fixtures.set(repositoryId, await buildRemoteFixture(repositoryId, repositoryId))
      }
      const callOrder: string[] = []
      const engine = createKnowgrphGitEngine({
        cache,
        authority: createAuthority(),
        relay: relayWithFetch(async args => {
          callOrder.push(args.repositoryId)
          return copy(fixtures.get(args.repositoryId)!)
        }),
        deviceId: 'device',
      })
      for (const repositoryId of repositoryIds) {
        assert.equal((await engine.clone(remoteRequest(repositoryId), 'offline-only')).status, 'queued')
      }
      assert.equal(cache.outbox.size, repositoryIds.length)
      const [results, concurrentResults] = await Promise.all([
        engine.drain('workspace'),
        engine.drain('workspace'),
      ])
      assert.ok(results.every(result => result.status === 'complete'))
      assert.deepEqual(concurrentResults, results)
      assert.deepEqual(callOrder, repositoryIds)
      assert.equal(cache.outbox.size, 0)
    },
  ), { numRuns: PROPERTY_RUNS })
}

test(
  'Property 43: offline operations remain durable and drain in exact FIFO order',
  testKnowgrphGitProperty43DurableFifoDrain,
)

export async function testKnowgrphGitProperty44CumulativeBoundsRetainOutbox() {
  await fc.assert(fc.asyncProperty(fc.boolean(), async exceedBytes => {
    const cache = new MemoryGitCache()
    let clockMs = 0
    const issues: KnowgrphGitIssue[] = []
    const engine = createKnowgrphGitEngine({
      cache,
      authority: createAuthority(),
      relay: relayWithFetch(async () => {
        if (!exceedBytes) {
          clockMs += KNOWGRPH_GIT_OPERATION_BOUNDS.timeoutMs
          throw new KnowgrphGitRelayError('retryable')
        }
        return {
          objects: [],
          refs: [],
          headRefName: 'HEAD',
          transferBytes: KNOWGRPH_GIT_OPERATION_BOUNDS.maxTransferBytes + 1,
        }
      }),
      deviceId: 'device',
      now: () => clockMs,
      sleep: async delayMs => { clockMs += delayMs },
      reportIssue: issue => { issues.push(issue) },
    })
    const result = await engine.clone(remoteRequest(), 'online')
    assert.equal(result.status, 'limit-exceeded')
    assert.equal(cache.outbox.size, 1)
    assert.equal(Array.from(cache.outbox.values())[0]!.lastStatus, 'limit-exceeded')
    assert.equal(issues[0]?.issue, 'limit-exceeded')
  }), { numRuns: PROPERTY_RUNS })
}

test(
  'Property 44: cumulative time or byte limit aborts and retains the outbox entry',
  testKnowgrphGitProperty44CumulativeBoundsRetainOutbox,
)

export async function testKnowgrphGitProperty45RemoteAdvancedUsesIssueReporter() {
  await fc.assert(fc.asyncProperty(identifierArbitrary, async name => {
    const cache = new MemoryGitCache()
    const issues: KnowgrphGitIssue[] = []
    const engine = createKnowgrphGitEngine({
      cache,
      authority: createAuthority(),
      relay: relayWithFetch(
        async () => { throw new Error('unexpected fetch') },
        async () => ({
          status: 'remote-advanced',
          remoteObjectId: '0000000000000000000000000000000000000000',
          transferBytes: 1,
        }),
      ),
      deviceId: 'device',
      reportIssue: issue => { issues.push(issue) },
    })
    assert.equal((await engine.commit(commitRequest([name]), 'online')).status, 'complete')
    const result = await engine.push({ ...remoteRequest('repo'), remoteId: 'origin', expectedRemoteObjectId: null }, 'online')
    assert.equal(result.status, 'conflict')
    assert.equal(issues.at(-1)?.issue, 'conflict')
    assert.equal(cache.outbox.size, 1)
  }), { numRuns: PROPERTY_RUNS })
}

test(
  'Property 45: remote-advanced push uses the shared issue reporter',
  testKnowgrphGitProperty45RemoteAdvancedUsesIssueReporter,
)

export async function testKnowgrphGitProperty46BoundedRetryBackoff() {
  await fc.assert(fc.asyncProperty(identifierArbitrary, async name => {
    const cache = new MemoryGitCache()
    const delays: number[] = []
    let attempts = 0
    const engine = createKnowgrphGitEngine({
      cache,
      authority: createAuthority(),
      relay: relayWithFetch(async () => {
        attempts += 1
        throw new KnowgrphGitRelayError('retryable', `private-${name}`)
      }),
      deviceId: 'device',
      sleep: async delayMs => { delays.push(delayMs) },
    })
    const result = await engine.fetch(remoteRequest(), 'online')
    assert.equal(result.status, 'retry-exhausted')
    assert.equal(attempts, 3)
    assert.deepEqual(delays, [1_000, 2_000])
    assert.equal(Array.from(cache.outbox.values())[0]!.attemptCount, 3)
  }), { numRuns: PROPERTY_RUNS })
}

test(
  'Property 46: retryable failures use 1s and 2s backoff then retain on attempt three',
  testKnowgrphGitProperty46BoundedRetryBackoff,
)

export async function testKnowgrphGitProperty47KnownObjectReuse() {
  await fc.assert(fc.asyncProperty(identifierArbitrary, async name => {
    const cache = new MemoryGitCache()
    const fixture = await buildRemoteFixture('remote', name)
    let fetchCount = 0
    let secondKnownIds: string[] = []
    const engine = createKnowgrphGitEngine({
      cache,
      authority: createAuthority(),
      relay: relayWithFetch(async args => {
        fetchCount += 1
        if (fetchCount === 1) return copy(fixture)
        secondKnownIds = [...args.knownObjectIds]
        return { ...copy(fixture), objects: [], transferBytes: 0 }
      }),
      deviceId: 'device',
    })
    assert.equal((await engine.clone(remoteRequest(), 'online')).status, 'complete')
    const result = await engine.fetch(remoteRequest(), 'online')
    assert.equal(result.status, 'complete')
    assert.deepEqual(new Set(secondKnownIds), new Set(fixture.objects.map(object => object.objectId)))
    assert.equal(result.status === 'complete' ? result.objectsReused : -1, fixture.objects.length)
  }), { numRuns: PROPERTY_RUNS })
}

test(
  'Property 47: known object hashes are reused and never returned as fetched bytes',
  testKnowgrphGitProperty47KnownObjectReuse,
)

export async function testKnowgrphGitProperty48CredentialSafeAuthFailure() {
  await fc.assert(fc.asyncProperty(identifierArbitrary, async fragment => {
    const cache = new MemoryGitCache()
    const issues: KnowgrphGitIssue[] = []
    const secret = `token-${fragment}-private`
    const engine = createKnowgrphGitEngine({
      cache,
      authority: createAuthority(),
      relay: relayWithFetch(async () => {
        throw new KnowgrphGitRelayError('auth-failure', secret)
      }),
      deviceId: 'device',
      reportIssue: issue => { issues.push(issue) },
    })
    const result = await engine.clone(remoteRequest(), 'online')
    assert.equal(result.status, 'auth-failure')
    const serialized = JSON.stringify({
      result,
      issues,
      outbox: Array.from(cache.outbox.values()),
      objects: Array.from(cache.objects.values()),
      repositories: Array.from(cache.repositories.values()),
    })
    assert.equal(serialized.includes(secret), false)
    assert.equal(cache.outbox.size, 1)
  }), { numRuns: PROPERTY_RUNS })
}

test(
  'Property 48: auth failures retain work without exposing credential-bearing errors',
  testKnowgrphGitProperty48CredentialSafeAuthFailure,
)

test('empty remote repositories fail closed and retain the operation for inspection', async () => {
  const cache = new MemoryGitCache()
  const engine = createKnowgrphGitEngine({
    cache,
    authority: createAuthority(),
    relay: relayWithFetch(async () => ({
      objects: [],
      refs: [],
      headRefName: 'HEAD',
      transferBytes: 0,
    })),
    deviceId: 'device',
  })
  const result = await engine.clone(remoteRequest(), 'online')
  assert.equal(result.status, 'invalid-remote')
  assert.equal(cache.objects.size, 0)
  assert.equal(cache.refs.size, 0)
  assert.equal(cache.outbox.size, 1)
})
