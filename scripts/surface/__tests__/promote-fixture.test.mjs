import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { generateDiscoverySurfaces } from '../discovery-generate.mjs'
import { assembleCatalog } from '../invocation-assemble.mjs'
import {
  appendInstruction,
  appendPromotionRecord,
} from '../ledger.mjs'
import {
  FIXTURE_PROMOTION_ONLY,
  promoteFixture,
} from '../promote-fixture.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '../../..')
const registry = JSON.parse(await fs.readFile(
  path.join(repositoryRoot, 'config/surface-registry.json'),
  'utf8',
))
registry.invocationRegistry ??= { catalogId: 'mcp', entries: [] }
registry.catalogDigest ??= assembleCatalog([registry.invocationRegistry]).digest
const licenseRegistry = JSON.parse(await fs.readFile(
  path.join(repositoryRoot, 'config/license-registry.json'),
  'utf8',
))
const generated = generateDiscoverySurfaces(registry)
assert.deepEqual(generated.generationErrors, [])

const instruction = {
  instructionId: 'instruction-001',
  artifactIds: ['discovery.robots', 'discovery.api-catalog'],
  destination: 'prod',
  timestamp: '2026-07-27T00:00:00.000Z',
}

const artifactRecords = [
  {
    artifactId: 'discovery.robots',
    sourcePath: 'robots.txt',
    destinationPath: 'robots.txt',
  },
  {
    artifactId: 'discovery.api-catalog',
    sourcePath: '.well-known/api-catalog',
    destinationPath: '.well-known/api-catalog',
  },
]

const createFixture = async ({ candidate = generated, recordInstruction = true } = {}) => {
  const permittedTempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'surface-promotion-'))
  const stagingRoot = path.join(permittedTempRoot, 'staging')
  const ledgerRoot = path.join(permittedTempRoot, 'ledger')
  for (const artifact of artifactRecords) {
    const sourcePath = path.join(stagingRoot, artifact.sourcePath)
    await fs.mkdir(path.dirname(sourcePath), { recursive: true })
    await fs.writeFile(sourcePath, candidate.files.get(artifact.destinationPath))
  }
  if (recordInstruction) {
    const recorded = await appendInstruction(ledgerRoot, instruction)
    assert.equal(recorded.written, true)
  }
  return {
    permittedTempRoot,
    stagingRoot,
    destinationRoot: path.join(permittedTempRoot, 'published'),
    ledgerRoot,
  }
}

const requestFor = fixture => ({
  permittedTempRoot: fixture.permittedTempRoot,
  stagingRoot: fixture.stagingRoot,
  destinationRoot: fixture.destinationRoot,
  ledgerRoot: fixture.ledgerRoot,
  destination: 'prod',
  instructionId: instruction.instructionId,
  artifacts: structuredClone(artifactRecords),
  attemptTimestamp: '2026-07-27T00:00:01.000Z',
})

const dependenciesFor = extra => ({
  gateAuthority: {
    registry: structuredClone(registry),
    licenseRegistry: structuredClone(licenseRegistry),
    routesManifest: [],
    catalogSources: [structuredClone(registry.invocationRegistry)],
    approvedCatalogIds: [],
    publishedPaths: ['/agenticgraph/'],
  },
  ...extra,
})

test('fixture promotion reads ledger approval, recomputes the gate, and atomically records artifacts', async () => {
  const fixture = await createFixture()
  try {
    const result = await promoteFixture(requestFor(fixture), dependenciesFor())
    assert.equal(result.promoted, true)
    assert.equal(result.mode, FIXTURE_PROMOTION_ONLY)
    assert.equal(result.gateDecision, 'permit')
    for (const artifact of artifactRecords) {
      assert.deepEqual(
        await fs.readFile(path.join(fixture.destinationRoot, artifact.destinationPath)),
        generated.files.get(artifact.destinationPath),
      )
    }
    assert.equal((await fs.readdir(fixture.ledgerRoot)).length, 3)
  } finally {
    await fs.rm(fixture.permittedTempRoot, { recursive: true, force: true })
  }
})

test('fixture promotion regenerates the approved policy-filtered catalog', async () => {
  const actionCatalog = {
    catalogId: 'action',
    publishPolicy: 'dev-only',
    entries: [{
      token: '/compose',
      prefixRole: 'action',
      label: 'Compose',
      intentSummary: 'Request an approval-gated composition workflow.',
      executionRouteTier: 'gated',
      ingressRoute: 'invocation-forwarder',
      targetExecutionRoute: 'control-plane-mcp',
      spendBearing: true,
      readOnly: false,
    }],
  }
  const catalogSources = [structuredClone(registry.invocationRegistry), actionCatalog]
  const catalog = assembleCatalog(catalogSources, { approvedCatalogIds: ['action'] })
  const approvedRegistry = { ...structuredClone(registry), catalogDigest: catalog.digest }
  const approvedCandidate = generateDiscoverySurfaces(
    approvedRegistry,
    { invocationCatalog: catalog },
  )
  assert.deepEqual(approvedCandidate.generationErrors, [])
  const fixture = await createFixture({ candidate: approvedCandidate })
  try {
    const result = await promoteFixture(requestFor(fixture), {
      gateAuthority: {
        registry: approvedRegistry,
        licenseRegistry: structuredClone(licenseRegistry),
        routesManifest: [],
        catalogSources,
        approvedCatalogIds: ['action'],
        publishedPaths: ['/agenticgraph/'],
      },
    })
    assert.equal(result.promoted, true)
    const publishedCatalog = JSON.parse(await fs.readFile(
      path.join(fixture.destinationRoot, '.well-known/api-catalog'),
      'utf8',
    ))
    assert.equal(
      publishedCatalog.invocationCatalog.entries.some(entry => entry.token === '/compose'),
      true,
    )
  } finally {
    await fs.rm(fixture.permittedTempRoot, { recursive: true, force: true })
  }
})

test('fabricated inline instruction cannot substitute for a recorded instruction', async () => {
  const fixture = await createFixture({ recordInstruction: false })
  try {
    const request = requestFor(fixture)
    request.instruction = {
      ...instruction,
      instructionId: 'fabricated-inline-instruction',
    }
    request.instructionId = 'fabricated-inline-instruction'
    const result = await promoteFixture(request, dependenciesFor())
    assert.equal(result.promoted, false)
    assert.equal(result.code, 'INLINE_INSTRUCTION_FORBIDDEN')
    await assert.rejects(fs.lstat(fixture.destinationRoot), { code: 'ENOENT' })
  } finally {
    await fs.rm(fixture.permittedTempRoot, { recursive: true, force: true })
  }
})

test('missing append-only instruction record blocks promotion', async () => {
  const fixture = await createFixture({ recordInstruction: false })
  try {
    const result = await promoteFixture(requestFor(fixture), dependenciesFor())
    assert.equal(result.promoted, false)
    assert.equal(result.code, 'NO_RECORDED_INSTRUCTION')
    await assert.rejects(fs.lstat(fixture.destinationRoot), { code: 'ENOENT' })
  } finally {
    await fs.rm(fixture.permittedTempRoot, { recursive: true, force: true })
  }
})

test('forged caller permit is rejected without evaluating it', async () => {
  const fixture = await createFixture()
  try {
    const request = requestFor(fixture)
    request.gateResult = { decision: 'permit', blocks: [] }
    const result = await promoteFixture(request, dependenciesFor())
    assert.equal(result.promoted, false)
    assert.equal(result.code, 'CALLER_GATE_RESULT_FORBIDDEN')
    await assert.rejects(fs.lstat(fixture.destinationRoot), { code: 'ENOENT' })
  } finally {
    await fs.rm(fixture.permittedTempRoot, { recursive: true, force: true })
  }
})

test('recomputed scan blocks modified staged bytes even without caller gate evidence', async () => {
  const fixture = await createFixture()
  const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456'
  try {
    await fs.appendFile(path.join(fixture.stagingRoot, 'robots.txt'), `# ${secret}\n`)
    const result = await promoteFixture(requestFor(fixture), dependenciesFor())
    assert.equal(result.promoted, false)
    assert.equal(result.code, 'GATE_NOT_PERMITTED')
    assert.equal(result.blocks.some(block => block.code === 'FC-SECRET'), true)
    assert.equal(JSON.stringify(result).includes(secret), false)
    await assert.rejects(fs.lstat(fixture.destinationRoot), { code: 'ENOENT' })
  } finally {
    await fs.rm(fixture.permittedTempRoot, { recursive: true, force: true })
  }
})

test('fixture promotion rejects same-entry candidate tampering by exact authority bytes', async () => {
  const fixture = await createFixture()
  try {
    const robotsPath = path.join(fixture.stagingRoot, 'robots.txt')
    const tampered = (await fs.readFile(robotsPath, 'utf8'))
      .replace('ai-train=no', 'ai-train=yes')
    await fs.writeFile(robotsPath, tampered)

    const result = await promoteFixture(requestFor(fixture), dependenciesFor())
    assert.equal(result.promoted, false)
    assert.equal(result.code, 'GATE_NOT_PERMITTED')
    assert.equal(
      result.blocks.some(block => (
        block.code === 'FC-CANDIDATE-DRIFT'
        && block.subject === 'discovery.robots'
      )),
      true,
    )
    await assert.rejects(fs.lstat(fixture.destinationRoot), { code: 'ENOENT' })
  } finally {
    await fs.rm(fixture.permittedTempRoot, { recursive: true, force: true })
  }
})

test('gate authority is accepted only through the strict trusted dependency shape', async () => {
  const fixture = await createFixture()
  try {
    const missing = await promoteFixture(requestFor(fixture))
    assert.equal(missing.code, 'GATE_AUTHORITY_REQUIRED')

    const withDerivedDecision = dependenciesFor()
    withDerivedDecision.gateAuthority.gateResult = { decision: 'permit', blocks: [] }
    const invalid = await promoteFixture(requestFor(fixture), withDerivedDecision)
    assert.equal(invalid.code, 'INVALID_GATE_AUTHORITY')

    const withoutPublishedEvidence = dependenciesFor()
    delete withoutPublishedEvidence.gateAuthority.publishedPaths
    const missingEvidence = await promoteFixture(
      requestFor(fixture),
      withoutPublishedEvidence,
    )
    assert.equal(missingEvidence.code, 'INVALID_GATE_AUTHORITY')
    await assert.rejects(fs.lstat(fixture.destinationRoot), { code: 'ENOENT' })
  } finally {
    await fs.rm(fixture.permittedTempRoot, { recursive: true, force: true })
  }
})

test('real repository roots are rejected before any filesystem dependency is invoked', async () => {
  let invoked = false
  const repositoryPath = '/Users/example/Documents/GitHub/agenticgraph'
  const result = await promoteFixture({
    permittedTempRoot: repositoryPath,
    stagingRoot: path.join(repositoryPath, 'staging'),
    destinationRoot: path.join(repositoryPath, 'public'),
    ledgerRoot: path.join(repositoryPath, 'ledger'),
  }, {
    pathExists: async () => {
      invoked = true
      return false
    },
  })

  assert.equal(result.promoted, false)
  assert.equal(result.code, 'REAL_ROOT_REJECTED')
  assert.equal(invoked, false)
})

test('resolved temp roots and staged sources cannot escape through symlinks', async () => {
  const fixture = await createFixture()
  const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'surface-outside-'))
  try {
    await fs.rm(fixture.stagingRoot, { recursive: true, force: true })
    await fs.symlink(outsideRoot, fixture.stagingRoot, 'dir')
    const escapedRoot = await promoteFixture(requestFor(fixture), dependenciesFor())
    assert.equal(escapedRoot.promoted, false)
    assert.equal(escapedRoot.code, 'REAL_ROOT_REJECTED')

    await fs.rm(fixture.stagingRoot)
    await fs.mkdir(fixture.stagingRoot)
    await fs.writeFile(path.join(outsideRoot, 'outside.txt'), 'outside fixture bytes')
    await fs.symlink(
      path.join(outsideRoot, 'outside.txt'),
      path.join(fixture.stagingRoot, 'outside.txt'),
    )
    const escapedSourceRequest = requestFor(fixture)
    escapedSourceRequest.artifacts = [{
      artifactId: 'discovery.robots',
      sourcePath: 'outside.txt',
      destinationPath: 'robots.txt',
    }]
    const escapedSource = await promoteFixture(escapedSourceRequest, dependenciesFor())
    assert.equal(escapedSource.promoted, false)
    assert.equal(escapedSource.code, 'SOURCE_OUTSIDE_STAGING')
  } finally {
    await fs.rm(fixture.permittedTempRoot, { recursive: true, force: true })
    await fs.rm(outsideRoot, { recursive: true, force: true })
  }
})

test('ledger failure leaves candidate staging intact and fixture destination absent', async () => {
  const fixture = await createFixture()
  try {
    const result = await promoteFixture(requestFor(fixture), dependenciesFor({
      appendPromotionRecord: async () => ({ written: false, code: 'synthetic' }),
    }))
    assert.equal(result.promoted, false)
    assert.equal(result.code, 'LEDGER_WRITE_FAILED')
    await assert.rejects(fs.lstat(fixture.destinationRoot), { code: 'ENOENT' })
    assert.deepEqual(
      await fs.readFile(path.join(fixture.stagingRoot, 'robots.txt')),
      generated.files.get('robots.txt'),
    )
    const transactionPaths = (await fs.readdir(fixture.permittedTempRoot))
      .filter(name => name.startsWith('.surface-promotion-'))
    assert.deepEqual(transactionPaths, [])
  } finally {
    await fs.rm(fixture.permittedTempRoot, { recursive: true, force: true })
  }
})

test('destination rename failure writes no promotion records', async () => {
  const fixture = await createFixture()
  let recordCalls = 0
  try {
    const result = await promoteFixture(requestFor(fixture), dependenciesFor({
      rename: async () => {
        throw new Error('synthetic rename failure')
      },
      appendPromotionRecord: async () => {
        recordCalls += 1
        return { written: true }
      },
    }))
    assert.equal(result.promoted, false)
    assert.equal(result.code, 'FIXTURE_PROMOTION_FAILED')
    assert.equal(recordCalls, 0)
    assert.deepEqual(await fs.readdir(fixture.ledgerRoot), [
      `instruction-${instruction.instructionId}.json`,
    ])
    await assert.rejects(fs.lstat(fixture.destinationRoot), { code: 'ENOENT' })
  } finally {
    await fs.rm(fixture.permittedTempRoot, { recursive: true, force: true })
  }
})

test('partial promotion-record failure rolls back destination and earlier records', async () => {
  const fixture = await createFixture()
  let recordCalls = 0
  try {
    const result = await promoteFixture(requestFor(fixture), dependenciesFor({
      appendPromotionRecord: async (ledgerRoot, record) => {
        recordCalls += 1
        return recordCalls === 1
          ? appendPromotionRecord(ledgerRoot, record)
          : { written: false, code: 'synthetic-second-record-failure' }
      },
    }))
    assert.equal(result.promoted, false)
    assert.equal(result.code, 'LEDGER_WRITE_FAILED')
    assert.equal(recordCalls, 2)
    assert.deepEqual(await fs.readdir(fixture.ledgerRoot), [
      `instruction-${instruction.instructionId}.json`,
    ])
    await assert.rejects(fs.lstat(fixture.destinationRoot), { code: 'ENOENT' })
  } finally {
    await fs.rm(fixture.permittedTempRoot, { recursive: true, force: true })
  }
})

test('instruction scope, destination, and safe relative paths are enforced', async () => {
  const fixture = await createFixture()
  try {
    const unauthorised = requestFor(fixture)
    unauthorised.artifacts = [{
      artifactId: 'not-authorised',
      sourcePath: 'robots.txt',
      destinationPath: 'robots.txt',
    }]
    assert.equal(
      (await promoteFixture(unauthorised, dependenciesFor())).code,
      'UNAUTHORISED_ARTIFACT',
    )

    const wrongDestination = requestFor(fixture)
    wrongDestination.destination = 'edge'
    assert.equal(
      (await promoteFixture(wrongDestination, dependenciesFor())).code,
      'UNAUTHORISED_DESTINATION',
    )

    const unsafePath = requestFor(fixture)
    unsafePath.artifacts[0].destinationPath = '../public/robots.txt'
    assert.equal(
      (await promoteFixture(unsafePath, dependenciesFor())).code,
      'UNSAFE_ARTIFACT_PATH',
    )

    const mislabeledPath = requestFor(fixture)
    mislabeledPath.artifacts = [{
      artifactId: 'discovery.api-catalog',
      sourcePath: 'robots.txt',
      destinationPath: 'robots.txt',
    }]
    const mislabeledResult = await promoteFixture(mislabeledPath, dependenciesFor())
    assert.equal(mislabeledResult.code, 'GATE_NOT_PERMITTED')
    assert.equal(
      mislabeledResult.blocks.some(block => block.code === 'FC-NO-APPROVAL'),
      true,
    )
  } finally {
    await fs.rm(fixture.permittedTempRoot, { recursive: true, force: true })
  }
})

test('dependency exceptions become typed failures', async () => {
  const fixture = await createFixture()
  try {
    const result = await promoteFixture(requestFor(fixture), dependenciesFor({
      pathExists: async () => {
        throw new Error('filesystem unavailable')
      },
    }))
    assert.equal(result.promoted, false)
    assert.equal(result.code, 'FIXTURE_PROMOTION_FAILED')
    assert.match(result.detail, /filesystem unavailable/)
  } finally {
    await fs.rm(fixture.permittedTempRoot, { recursive: true, force: true })
  }
})
