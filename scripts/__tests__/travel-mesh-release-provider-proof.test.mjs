import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import YAML from 'yaml'
import { digest, TRAVEL_MESH_PLAN } from '../travel-mesh-release-plan.mjs'
import { commerceProviderRuntimeProofFor, probeMesh } from '../travel-mesh-release.mjs'
import { createD1PublicationPlan, createD1ReconciliationEvidence } from '../lib/seed-storage-documents-d1.mjs'
import { publishCanonicalDocuments, validateCanonicalPublicationPlan } from '../core-runtime-release-publications.mjs'
import { CORE_RUNTIME_PROFILE } from '../runtime-release-profile.mjs'

const sourceRevision = 'a'.repeat(40)
const providerVersionId = 'b'.repeat(64)
const environment = Object.freeze({
  TRAVEL_ACCESS_CLIENT_ID: `access-${'1'.repeat(32)}`,
  TRAVEL_ACCESS_CLIENT_SECRET: `access-${'2'.repeat(32)}`,
  TRAVEL_PUBLIC_ZONE_NAME: 'airvio.co',
})
const spec = JSON.stringify([
  { id: 'mcp', service: 'agentic-mcp', url: 'https://airvio.co/agentic-os/control-plane/mcp/readyz' },
  { id: 'operator-gateway', service: 'agentic-travel-operator-gateway', url: 'https://airvio.co/agentic-os/control-plane/travel/reconciliation/readyz' },
  { id: 'storage', service: 'agentic-storage', url: 'https://storage.airvio.co/readyz' },
])

const serviceFor = url => new URL(url).pathname.includes('/travel/reconciliation/')
  ? 'agentic-travel-operator-gateway'
  : new URL(url).hostname.startsWith('storage.') ? 'agentic-storage' : 'agentic-mcp'

const fetchWithProof = proof => async url => Response.json({
  ok: true,
  service: serviceFor(url),
  ...(new URL(url).pathname.includes('/travel/reconciliation/') ? { providerRuntime: proof } : {}),
})

test('release plan keeps all provider proof hops private and service-bound', () => {
  const marketplace = TRAVEL_MESH_PLAN.find(({ id }) => id === 'marketplace')
  const commerce = TRAVEL_MESH_PLAN.find(({ id }) => id === 'travel-commerce')
  const operator = TRAVEL_MESH_PLAN.find(({ id }) => id === 'operator-gateway')
  assert.equal(marketplace.routeFree, true)
  assert.deepEqual(marketplace.secrets, [
    ['MARKETPLACE_PROVIDER_AUTH_SECRET', 'MARKETPLACE_PROVIDER_AUTH_SECRET'],
  ])
  assert.deepEqual(commerce.serviceTargets.filter(([name]) => ['DISCOVERY_SERVICE', 'MARKETPLACE_SERVICE'].includes(name)), [
    ['DISCOVERY_SERVICE', 'TRAVEL_MCP_SERVICE', 'agentic-mcp'],
    ['MARKETPLACE_SERVICE', 'MARKETPLACE_SERVICE', 'agentic-marketplace-production'],
  ])
  assert.deepEqual(operator.dependencies, ['travel-commerce'])
  assert.deepEqual(commerce.secrets.slice(-2), [
    ['CHECKOUT_PROVIDER_AUTH_SECRET', 'CHECKOUT_PROVIDER_AUTH_SECRET'],
    ['MARKETPLACE_PROVIDER_AUTH_SECRET', 'MARKETPLACE_PROVIDER_AUTH_SECRET'],
  ])
})

test('release probe accepts and records exact provider handler and metadata evidence', async () => {
  const proof = commerceProviderRuntimeProofFor(sourceRevision, providerVersionId)
  const probes = await probeMesh(spec, {
    environment,
    fetchFn: fetchWithProof(proof),
    providerMetadata: { sourceRevision, providerVersionId },
  })
  const observed = probes.find(({ id }) => id === 'operator-gateway').providerRuntime
  assert.deepEqual(observed, proof)
  assert.deepEqual(observed.providers.map(({ id }) => id), ['discovery', 'checkout', 'marketplace'])
})

test('release probe rejects missing handlers and coherent or partial metadata drift', async () => {
  const missingHandler = structuredClone(commerceProviderRuntimeProofFor(sourceRevision, providerVersionId))
  missingHandler.providers[0].capabilitiesDigest = '0'.repeat(64)
  await assert.rejects(() => probeMesh(spec, {
    environment, fetchFn: fetchWithProof(missingHandler), providerMetadata: { sourceRevision, providerVersionId },
  }), /operator-gateway live dependency probe failed/)

  const coherentDrift = commerceProviderRuntimeProofFor('c'.repeat(40), providerVersionId)
  await assert.rejects(() => probeMesh(spec, {
    environment, fetchFn: fetchWithProof(coherentDrift), providerMetadata: { sourceRevision, providerVersionId },
  }), /operator-gateway live dependency probe failed/)

  const partialDrift = structuredClone(commerceProviderRuntimeProofFor(sourceRevision, providerVersionId))
  partialDrift.providers[2].evidence.storageCompatibilityRevision = 'marketplace-d1-drifted'
  await assert.rejects(() => probeMesh(spec, {
    environment, fetchFn: fetchWithProof(partialDrift), providerMetadata: { sourceRevision, providerVersionId },
  }), /operator-gateway live dependency probe failed/)
})

const publicationFixture = () => {
  const workspaceId = 'kgws:canonical-docs', candidateDigest = 'c'.repeat(64)
  const now = () => new Date('2026-09-10T00:00:00.000Z')
  const documents = ['b', 'a'].map((name, index) => ({ id: `source:${name}`, workspaceId,
    canonicalPath: `docs/${name}.md`, docType: 'markdown', contentMd: `# ${name}\n`,
    contentHash: createHash('sha256').update(`# ${name}\n`).digest('hex'), revision: index + 5, deleted: false }))
  const documentSeeds = documents.map(record => ({ documentMutation: { record }, chunkMutations: [] }))
  const exported = { documents: documents.map(document => ({ ...document, id: document.id.replace('source:', 'legacy:') })),
    documentChunks: [], graphSnapshots: [] }
  const stateEvidence = createD1ReconciliationEvidence({ workspaceId, documentSeeds, exported, statements: [],
    parity: { documentCount: documents.length, chunkCount: 0 }, snapshotParity: { graphSnapshotCount: 0 }, reconciledAt: now() })
  const plan = createD1PublicationPlan({ workspaceId, documentSeeds, exported })
  const authorization = { schema: 'agentic-human-authorization-receipt/v2', status: 'consumed', candidateDigest,
    controllerId: 'test-release', humanActorId: 'github-user:1234:operator' }
  const environment = { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sourceRevision,
    GITHUB_WORKFLOW: 'Production Release', GITHUB_WORKFLOW_REF: 'owner/repository/.github/workflows/release.yml@refs/heads/main',
    AGENTIC_OS_STORAGE_OWNER_ID: authorization.humanActorId, AGENTIC_OS_STORAGE_OWNER_WORKSPACE_ID: workspaceId,
    AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT: '2026-09-11T00:00:00.000Z', AGENTIC_OS_STORAGE_OWNER_ACCESS_KEY: 'd'.repeat(64) }
  return { workspaceId, documentSeeds, exported, plan, stateEvidence, sourceSha: sourceRevision,
    candidateDigest, authorization, environment, now, profile: CORE_RUNTIME_PROFILE }
}
const publicationResponse = options => {
  const body = JSON.parse(options.body)
  return Response.json({ ok: true, workspaceId: body.workspaceId, documentId: body.documentId,
    canonicalPath: body.canonicalPath, status: 'published', revision: body.expectedRevision, contentHash: body.expectedContentHash })
}
const resealPlan = plan => { const { planDigest: _, ...body } = plan; return { ...body, planDigest: digest(body) } }

test('publication preparation binds verified canonical contents to current legacy row identities', () => {
  const input = publicationFixture()
  assert.equal(input.plan.authorizesEffects, false)
  assert.deepEqual(validateCanonicalPublicationPlan(input.plan, input.stateEvidence, input.workspaceId),
    [...input.exported.documents].sort((a, b) => a.canonicalPath.localeCompare(b.canonicalPath)).map(document => ({
      workspaceId: input.workspaceId, documentId: document.id, canonicalPath: document.canonicalPath, action: 'publish',
      expectedRevision: document.revision, expectedContentHash: document.contentHash })))
  input.exported.documents[0].contentMd = 'unverified bytes'
  assert.throws(() => createD1PublicationPlan(input), /content|corpus/)
})
test('publication rejects altered plans, incomplete reconciliation, and malformed identities before requests', async () => {
  const alterations = [
    value => { value.plan.revisions[0].revision++ },
    value => { value.plan.stateContract.documents[0].contentMd = 'different'; value.plan.stateContractDigest = digest(value.plan.stateContract); value.plan = resealPlan(value.plan) },
    value => { value.stateEvidence.stateContractDigest = '0'.repeat(64) },
    value => { value.stateEvidence.contentParity = false },
    value => { value.stateEvidence.readbackKind = 'public-api' },
    value => { value.stateEvidence.observedCounts.documentCount-- },
    value => { value.stateEvidence.observedCounts.chunkCount++ },
    value => { value.plan.revisions[1].documentId = value.plan.revisions[0].documentId; value.plan = resealPlan(value.plan) },
    value => { value.plan.revisions[0].revision = 0; value.plan = resealPlan(value.plan) },
  ]
  for (const alter of alterations) {
    const input = publicationFixture(); alter(input)
    await assert.rejects(publishCanonicalDocuments({ ...input, fetchFn: () => { assert.fail('invalid publication must not request the provider') } }))
  }
})
test('publication requires exact candidate, protected main, matching operator and a valid unexpired key', async () => {
  for (const alter of [
    value => { value.authorization.candidateDigest = 'e'.repeat(64) },
    value => { value.environment.GITHUB_REF = 'refs/heads/feature' },
    value => { value.environment.GITHUB_SHA = 'e'.repeat(40) },
    value => { value.environment.AGENTIC_OS_STORAGE_OWNER_ID = 'another operator' },
    value => { value.environment.AGENTIC_OS_STORAGE_OWNER_WORKSPACE_ID = 'another workspace' },
    value => { value.environment.AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT = 'invalid' },
    value => { value.environment.AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT = '2026-09-09T00:00:00Z' },
    value => { value.environment.AGENTIC_OS_STORAGE_OWNER_ACCESS_KEY = '' },
    value => { value.profile = { id: 'travel' } },
  ]) {
    const input = publicationFixture(); alter(input)
    await assert.rejects(publishCanonicalDocuments({ ...input, fetchFn: () => { assert.fail('missing authority must not contact the provider') } }))
  }
})
test('publication uses authenticated owner requests and records exact provider identities without credentials', async () => {
  const input = publicationFixture(), calls = []
  const receipt = await publishCanonicalDocuments({ ...input, fetchFn: async (url, options) => {
    assert.equal(url, 'https://airvio.co/api/storage/publications')
    assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'manual')
    assert.equal(options.headers.authorization, `Bearer ${input.environment.AGENTIC_OS_STORAGE_OWNER_ACCESS_KEY}`)
    calls.push(JSON.parse(options.body)); return publicationResponse(options)
  } })
  assert.equal(calls.length, 2)
  assert.equal(receipt.status, 'published'); assert.equal(receipt.documentCount, 2)
  assert.equal(receipt.planDigest, input.plan.planDigest)
  assert.deepEqual(receipt.published.map(row => row.requestDigest), calls.map(digest))
  assert.equal(JSON.stringify(receipt).includes(input.environment.AGENTIC_OS_STORAGE_OWNER_ACCESS_KEY), false)
  const { receiptDigest, ...body } = receipt; assert.equal(receiptDigest, digest(body))
})
test('publication stops on response loss or invalid identity and retains partial effects without retry', async () => {
  for (const failedResponse of [
    () => { throw new Error('lost response including private provider detail') },
    () => new Response(null, { status: 302, headers: { location: 'https://another.invalid' } }),
    () => new Response('not json'),
    () => Response.json({ ok: true, status: 'published', documentId: 'wrong' }),
    () => new Response('x'.repeat(65_537)),
  ]) {
    const input = publicationFixture(); let requests = 0
    await assert.rejects(publishCanonicalDocuments({ ...input, fetchFn: async (_url, options) => {
      requests++; return requests === 1 ? publicationResponse(options) : failedResponse()
    } }), error => {
      assert.equal(error.receipt.status, 'preserve-required')
      assert.equal(error.receipt.published.length, 1)
      assert.equal(error.receipt.pending.documentId, 'legacy:b')
      assert.equal(error.receipt.mutationAttempted, true)
      assert.equal(JSON.stringify(error.receipt).includes('private provider detail'), false)
      return true
    })
    assert.equal(requests, 2)
  }
})
test('protected workflow publishes only reconciled core documents before anonymous runtime verification', () => {
  const workflow = YAML.parse(fs.readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8'))
  const steps = workflow.jobs.deploy.steps, publish = steps.find(step => step.id === 'publish_docs')
  const index = id => steps.findIndex(step => step.id === id)
  assert(index('state_receipt') < index('publish_docs') && index('publish_docs') < index('immutable_smoke'))
  assert.equal(publish.if, "steps.runtime_profile.outputs.profile == 'core'")
  assert.equal(workflow.jobs.deploy.environment.name, 'production')
  assert.deepEqual(Object.keys(publish.env).sort(), ['AGENTIC_OS_STORAGE_OWNER_ACCESS_KEY', 'AGENTIC_OS_STORAGE_OWNER_ID',
    'AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT', 'AGENTIC_OS_STORAGE_OWNER_WORKSPACE_ID'])
  assert.match(publish.run, /release:main-authority:check/)
  assert.match(publish.run, /--authorization .*consumed-human-authorization-receipt/)
  assert.match(publish.run, /--state-evidence .*d1-reconciliation-evidence/)
  assert.match(steps.find(step => step.id === 'reconcile_state').run, /--publication-plan-output/)
})
