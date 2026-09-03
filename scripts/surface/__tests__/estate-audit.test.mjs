import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { auditRegistry } from '../audit-report.mjs'
import {
  createAuthorityReadRecorder,
  registerStaticAuthorityPaths,
} from '../authority-snapshot.mjs'
import {
  deriveProtectionTier,
  inspectDistributionBoundary,
  prepareAuditEvidence,
} from '../estate-audit.mjs'

test('distribution audit classifies every tracked path and never lets allowlists override source protection', async t => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'surface-estate-audit-'))
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }))
  await mkdir(path.join(repositoryRoot, 'canvas/src'), { recursive: true })
  await mkdir(path.join(repositoryRoot, 'cloudflare/workers/shared'), { recursive: true })
  await mkdir(path.join(repositoryRoot, 'agentic-graph/assets'), { recursive: true })
  await mkdir(path.join(repositoryRoot, 'public'), { recursive: true })
  await writeFile(path.join(repositoryRoot, 'canvas/src/allowlisted.mjs'), 'export const allowed = true\n')
  await writeFile(path.join(repositoryRoot, 'canvas/src/leaked.mjs'), 'export const leaked = true\n')
  await writeFile(path.join(repositoryRoot, 'canvas/src/allowlisted.map'), '{}\n')
  await writeFile(path.join(repositoryRoot, 'cloudflare/workers/shared/worker.ts'), 'export default {}\n')
  await writeFile(path.join(repositoryRoot, 'agentic-graph/assets/app.js'), '(()=>{})()\n')
  await writeFile(path.join(repositoryRoot, 'public/declared.txt'), 'declared\n')
  await writeFile(path.join(repositoryRoot, 'unknown.txt'), 'unknown\n')
  execFileSync('git', ['init', '--quiet'], { cwd: repositoryRoot })
  execFileSync('git', ['add', '.'], { cwd: repositoryRoot })

  const registry = {
    distributionAllowlist: [
      'canvas/src/allowlisted.mjs',
      'canvas/src/allowlisted.map',
      'cloudflare/workers/shared/worker.ts',
      'agentic-graph/assets/**',
    ],
    entries: [
      {
        artifactId: 'private.canvas-source',
        path: 'canvas/src/**',
        pathKind: 'glob',
        artifactClass: 'application-source',
        surfaceTier: 'private',
      },
      {
        artifactId: 'private.worker-source',
        path: 'cloudflare/workers/**',
        pathKind: 'glob',
        artifactClass: 'application-source',
        surfaceTier: 'private',
      },
      {
        artifactId: 'private.source-maps',
        path: '**/*.map',
        pathKind: 'glob',
        artifactClass: 'application-source',
        surfaceTier: 'private',
      },
      {
        artifactId: 'adversarial.public-source-exception',
        path: 'canvas/src/allowlisted.mjs',
        pathKind: 'exact',
        artifactClass: 'dist-module',
        surfaceTier: 'public-artifact',
      },
      {
        artifactId: 'asset.generated-bundle',
        path: 'agentic-graph/assets/**',
        pathKind: 'glob',
        artifactClass: 'bundled-build-output',
        surfaceTier: 'public-artifact',
      },
      {
        artifactId: 'document.declared',
        path: 'public/declared.txt',
        pathKind: 'exact',
        artifactClass: 'published-document',
        surfaceTier: 'public-discoverable',
      },
    ],
  }
  const audit = inspectDistributionBoundary(registry, repositoryRoot)

  assert.deepEqual(audit.result.allowlistOnly, [])
  assert.deepEqual(audit.result.registryOnly, [])
  assert.deepEqual(audit.result.unclassified, ['unknown.txt'])
  assert.equal(audit.result.classifications.length, audit.publicTrackedPaths.length)
  assert.equal(
    audit.result.classifications.find(classification => (
      classification.path === 'canvas/src/allowlisted.mjs'
    )).tier,
    'private',
  )
  assert.equal(
    audit.result.sourceLeaks.includes('agentic-graph/assets/app.js'),
    false,
  )
  assert.equal(
    audit.result.sourceLeaks.includes('public/declared.txt'),
    false,
  )
  assert.deepEqual(audit.result.sourceLeaks, [
    'canvas/src/allowlisted.map',
    'canvas/src/allowlisted.mjs',
    'canvas/src/leaked.mjs',
    'cloudflare/workers/shared/worker.ts',
    'unknown.txt',
  ])
  assert.deepEqual(
    audit.publicTrackedPaths,
    [
      'agentic-graph/assets/app.js',
      'canvas/src/allowlisted.map',
      'canvas/src/allowlisted.mjs',
      'canvas/src/leaked.mjs',
      'cloudflare/workers/shared/worker.ts',
      'public/declared.txt',
      'unknown.txt',
    ],
  )
})

test('evidence preparation rejects an exhausted deadline before filesystem work', async () => {
  await assert.rejects(prepareAuditEvidence({
    paths: {
      repositoryRoot: '/unreadable/dev',
      publicOriginRoot: '/unreadable/public',
      agenticCanvasOsRoot: '/unreadable/worker',
      registryPath: '/unreadable/dev/config/surface-registry.json',
      licenseRegistryPath: '/unreadable/dev/config/license-registry.json',
      schemaPath: '/unreadable/dev/schema/surface-registry.json',
    },
    publicTrackedPaths: [],
    registry: {
      catalogSources: [],
      entries: [],
    },
  }, {
    deadlineMs: 0,
  }), /deadline exceeded/u)
})

test('audit evidence digests referenced catalog approval records before and after evaluation', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'surface-approval-audit-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const repositoryRoot = path.join(root, 'dev')
  const publicOriginRoot = path.join(root, 'public')
  const agenticCanvasOsRoot = path.join(root, 'worker')
  const ledgerRoot = path.join(repositoryRoot, 'data/surface/ledger')
  await Promise.all([
    mkdir(path.join(repositoryRoot, 'config'), { recursive: true }),
    mkdir(path.join(repositoryRoot, 'schemas'), { recursive: true }),
    mkdir(publicOriginRoot, { recursive: true }),
    mkdir(agenticCanvasOsRoot, { recursive: true }),
    mkdir(ledgerRoot, { recursive: true }),
  ])
  const paths = {
    repositoryRoot,
    publicOriginRoot,
    agenticCanvasOsRoot,
    ledgerRoot,
    registryPath: path.join(repositoryRoot, 'config/surface-registry.json'),
    licenseRegistryPath: path.join(repositoryRoot, 'config/license-registry.json'),
    schemaPath: path.join(repositoryRoot, 'schemas/surface-registry.json'),
  }
  const approvalPath = path.join(ledgerRoot, 'instruction-allow-action.json')
  await Promise.all([
    writeFile(paths.registryPath, '{}\n'),
    writeFile(paths.licenseRegistryPath, '{}\n'),
    writeFile(paths.schemaPath, '{}\n'),
    writeFile(path.join(publicOriginRoot, '_routes.json'), '{}\n'),
    writeFile(path.join(agenticCanvasOsRoot, 'catalog.md'), 'catalog\n'),
    writeFile(approvalPath, '{"instructionId":"allow-action"}\n', { mode: 0o600 }),
  ])
  const authority = {
    paths,
    publicTrackedPaths: [],
    registry: {
      catalogSources: [{
        catalogId: 'action',
        repository: 'worker',
        path: 'catalog.md',
        approvalInstructionId: 'allow-action',
      }],
      entries: [],
    },
  }
  const evidence = await prepareAuditEvidence(authority)
  const before = evidence.beforeAuthorityDigests.find(record => (
    record.path === 'dev:catalog-approval:action'
  ))
  assert.match(before.digest, /^[a-f0-9]{64}$/u)

  await writeFile(approvalPath, '{"instructionId":"tampered"}\n')
  const afterTamper = await evidence.readAfterAuthorityDigests()
  assert.notDeepEqual(afterTamper, evidence.beforeAuthorityDigests)

  const deletionEvidence = await prepareAuditEvidence(authority)
  await rm(approvalPath)
  const afterDeletion = await deletionEvidence.readAfterAuthorityDigests()
  const deleted = afterDeletion.find(record => (
    record.path === 'dev:catalog-approval:action'
  ))
  assert.deepEqual(deleted, {
    path: 'dev:catalog-approval:action',
    digest: null,
    missing: true,
  })
  assert.notDeepEqual(afterDeletion, deletionEvidence.beforeAuthorityDigests)
})

test('audit before-digests bind exact authority bytes consumed before evidence preparation', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'surface-consumed-authority-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const repositoryRoot = path.join(root, 'dev')
  const publicOriginRoot = path.join(root, 'public')
  const agenticCanvasOsRoot = path.join(root, 'worker')
  const ledgerRoot = path.join(repositoryRoot, 'data/surface/ledger')
  await Promise.all([
    mkdir(path.join(repositoryRoot, 'config'), { recursive: true }),
    mkdir(path.join(repositoryRoot, 'schemas'), { recursive: true }),
    mkdir(publicOriginRoot, { recursive: true }),
    mkdir(agenticCanvasOsRoot, { recursive: true }),
    mkdir(ledgerRoot, { recursive: true }),
  ])
  execFileSync('git', ['init', '--quiet'], { cwd: publicOriginRoot })
  const paths = {
    repositoryRoot,
    publicOriginRoot,
    agenticCanvasOsRoot,
    ledgerRoot,
    registryPath: path.join(repositoryRoot, 'config/surface-registry.json'),
    licenseRegistryPath: path.join(repositoryRoot, 'config/license-registry.json'),
    schemaPath: path.join(repositoryRoot, 'schemas/surface-registry.json'),
  }
  const catalogPath = path.join(agenticCanvasOsRoot, 'catalog.md')
  const approvalPath = path.join(ledgerRoot, 'instruction-allow-action.json')
  const instruction = {
    instructionId: 'allow-action',
    artifactIds: ['invocation.catalog.action'],
    destination: 'prod',
    timestamp: '2026-07-27T00:00:00.000Z',
  }
  await Promise.all([
    writeFile(paths.registryPath, '{}\n'),
    writeFile(paths.licenseRegistryPath, '{}\n'),
    writeFile(paths.schemaPath, '{}\n'),
    writeFile(path.join(publicOriginRoot, '_routes.json'), '{}\n'),
    writeFile(catalogPath, 'catalog\n'),
    writeFile(approvalPath, `${JSON.stringify(instruction)}\n`, { mode: 0o600 }),
  ])

  const recorder = createAuthorityReadRecorder()
  registerStaticAuthorityPaths(recorder, paths)
  await Promise.all([
    recorder.readFile(paths.registryPath),
    recorder.readFile(paths.licenseRegistryPath),
    recorder.readFile(paths.schemaPath),
    recorder.readFile(path.join(publicOriginRoot, '_routes.json')),
    recorder.readCatalogSource(catalogPath, { catalogId: 'action' }),
  ])
  assert.deepEqual(
    await recorder.readCatalogApproval(
      ledgerRoot,
      instruction.instructionId,
      { catalogId: 'action' },
    ),
    instruction,
  )
  recorder.recordTrackedPaths([])
  const authority = {
    paths,
    publicTrackedPaths: [],
    consumedAuthorityDigests: recorder.snapshot(),
    registry: {
      catalogSources: [{
        catalogId: 'action',
        repository: 'worker',
        path: 'catalog.md',
        approvalInstructionId: instruction.instructionId,
      }],
      entries: [],
    },
  }

  await rm(approvalPath)
  const evidence = await prepareAuditEvidence(authority)
  const beforeApproval = evidence.beforeAuthorityDigests.find(record => (
    record.path === 'dev:catalog-approval:action'
  ))
  const after = await evidence.readAfterAuthorityDigests()
  const afterApproval = after.find(record => (
    record.path === 'dev:catalog-approval:action'
  ))
  assert.match(beforeApproval.digest, /^[a-f0-9]{64}$/u)
  assert.equal(beforeApproval.missing, undefined)
  assert.deepEqual(afterApproval, {
    path: 'dev:catalog-approval:action',
    digest: null,
    missing: true,
  })
  assert.notDeepEqual(after, evidence.beforeAuthorityDigests)
})

test('artifact-class tier derivation independently emits the R12.5 warning', async () => {
  const entry = {
    artifactId: 'mislabeled-source',
    path: 'public/source.js',
    artifactClass: 'application-source',
    surfaceTier: 'public-artifact',
    owningRepository: 'public-origin',
    repositoryVisibility: 'public',
    licenseId: 'LicenseRef-airvio-no-reuse-1.0',
  }
  assert.equal(deriveProtectionTier(entry), 'private')

  const result = await auditRegistry({ entries: [entry] }, {
    now: () => 0,
    inspectEntry: candidate => ({
      permittedRepository: candidate.owningRepository,
      containingRepository: candidate.owningRepository,
      derivedTier: deriveProtectionTier(candidate),
    }),
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.failures, [])
  assert.deepEqual(result.warnings, [{
    code: 'TIER_MISMATCH',
    artifactId: entry.artifactId,
    recordedTier: 'public-artifact',
    derivedTier: 'private',
  }])
})
