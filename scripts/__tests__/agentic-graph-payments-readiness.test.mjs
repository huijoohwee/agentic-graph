import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

import {
  inspectAgenticGraphPaymentsReadiness,
  AGENTIC_OS_PAYMENTS_PROVIDER_PROOF_SCHEMA_ID,
  validateAgenticGraphPaymentsProviderProof,
} from '../lib/agentic-graph-payments-readiness.mjs'

const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(import.meta.dirname, '..', '..')

const buildRailProof = rail => ({
  rail,
  mode: 'sandbox',
  terminalState: 'paid',
  authenticatedSettlement: true,
  verification:
    rail === 'stripe'
      ? 'stripe-signature-and-provider-read'
      : 'straitsx-raw-hmac-source-and-provider-read',
  providerObjectCount: 1,
  paymentRecordRoundTrip: true,
  providerCallCount: 2,
  costLogEntryCount: 2,
  modelCallCount: 0,
  modelCostUsd: '0.00',
  providerObjectIdDigest: 'a'.repeat(64),
  providerRequestIdDigest: null,
})

const buildProviderProof = sourceEvidenceDigest => ({
  schemaId: AGENTIC_OS_PAYMENTS_PROVIDER_PROOF_SCHEMA_ID,
  sourceEvidenceDigest,
  rails: [buildRailProof('stripe'), buildRailProof('straitsx')],
})

const copyFile = async (sourceRoot, targetRoot, relativePath) => {
  const target = path.join(targetRoot, relativePath)
  await mkdir(path.dirname(target), { recursive: true })
  await cp(path.join(sourceRoot, relativePath), target)
}

const digestDirectory = async root => {
  const entries = []
  const visit = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(absolutePath)
      else if (entry.isFile()) {
        const relativePath = path.relative(root, absolutePath)
        const bytes = await readFile(absolutePath)
        entries.push(`${relativePath}\0${createHash('sha256').update(bytes).digest('hex')}`)
      }
    }
  }
  await visit(root)
  return createHash('sha256').update(entries.sort().join('\n')).digest('hex')
}

async function createSourceFixture(t) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-graph-payments-readiness-'))
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }))
  const manifest = JSON.parse(
    await readFile(
      path.join(repositoryRoot, 'scripts/agentic-graph-payments-readiness-properties.json'),
      'utf8',
    ),
  )
  const relativePaths = new Set([
    '.kiro/specs/agentic-graph-payments/requirements.md',
    'docs/documents/agentic-graph-payments-prd-tad.md',
    'scripts/agentic-graph-payments-readiness-properties.json',
    'scripts/lib/agentic-graph-payments-source-evidence.mjs',
    'cloudflare/workers/agentic-graph-payment/wrangler.toml',
    'grph-shared/src/payments/paymentBuyerProductSsot.ts',
    ...manifest.runtimeEvidence.map(item => item.file),
    ...manifest.requirements.flatMap(requirement =>
      requirement.evidence.map(item => item.file),
    ),
  ])
  await Promise.all([...relativePaths].map(relativePath =>
    copyFile(repositoryRoot, fixtureRoot, relativePath),
  ))
  await mkdir(path.join(fixtureRoot, 'canvas/dist'), { recursive: true })
  await writeFile(path.join(fixtureRoot, 'canvas/dist/index.js'), 'export const built = true\n')
  return fixtureRoot
}

test('provider proof accepts only two authenticated paid sandbox rails bound to source', () => {
  const sourceEvidenceDigest = 'b'.repeat(64)
  const valid = buildProviderProof(sourceEvidenceDigest)
  const validCandidate = validateAgenticGraphPaymentsProviderProof(valid, sourceEvidenceDigest)
  assert.deepEqual(validCandidate.failures, [])
  assert.equal(validCandidate.candidateValid, true)
  assert.equal(validCandidate.readinessProven, false)
  assert.equal(validCandidate.railResults.get('stripe').candidateEligible, true)

  const expired = structuredClone(valid)
  expired.rails[0].terminalState = 'expired'
  const expiredCandidate = validateAgenticGraphPaymentsProviderProof(expired, sourceEvidenceDigest)
  assert.match(expiredCandidate.failures.join('\n'), /does not describe one authenticated paid sandbox settlement/)
  assert.equal(expiredCandidate.railResults.get('stripe').candidateEligible, false)
  assert.equal(expiredCandidate.railResults.get('straitsx').candidateEligible, true)

  const rawIdentifier = structuredClone(valid)
  rawIdentifier.rails[0].providerObjectId = 'cs_test_raw_identifier'
  assert.match(
    validateAgenticGraphPaymentsProviderProof(rawIdentifier, sourceEvidenceDigest).failures.join('\n'),
    /canonical digest and count fields/,
  )

  const wrongSource = structuredClone(valid)
  wrongSource.sourceEvidenceDigest = 'c'.repeat(64)
  assert.match(
    validateAgenticGraphPaymentsProviderProof(wrongSource, sourceEvidenceDigest).failures.join('\n'),
    /does not match this source evidence/,
  )

  const malformedRails = { ...valid, rails: {} }
  assert.equal(
    validateAgenticGraphPaymentsProviderProof(malformedRails, sourceEvidenceDigest).candidateValid,
    false,
  )
})

test('source inspection is read-only and fails stale companion authority', async t => {
  const fixtureRoot = await createSourceFixture(t)
  const before = await digestDirectory(fixtureRoot)
  const baseline = await inspectAgenticGraphPaymentsReadiness({
    root: fixtureRoot,
    requireTracked: false,
  })
  const after = await digestDirectory(fixtureRoot)
  assert.equal(after, before, 'readiness inspection must not mutate the fixture')
  assert.equal(
    baseline.gates.source.checks.find(check => check.id === 'document-authority')?.status,
    'pass',
  )
  assert.equal(baseline.gates.source.status, 'blocked', 'untrusted source claims remain blocked')
  assert.equal(
    baseline.gates.source.checks.find(check =>
      check.id === 'executed-local-vcc-attestation')?.status,
    'blocked',
  )
  assert.equal(
    baseline.gates.source.checks.find(check => check.id === 'tracked-payment-ssot')?.status,
    'pass',
  )
  const checkIds = baseline.gates.source.checks.map(check => check.id)
  assert.equal(new Set(checkIds).size, checkIds.length, 'readiness check IDs must be unique')
  assert.deepEqual(
    baseline.gates.source.checks.find(check =>
      check.id === 'client-bundle-secret-values')?.evidence,
    ['canvas/dist'],
  )
  assert.equal(baseline.gates.providerSandbox.status, 'blocked')
  assert.equal(baseline.gates.agenticPurchase.status, 'blocked')
  assert.equal(
    baseline.gates.agenticPurchase.localDeterministicStatus,
    'blocked',
  )
  assert.equal(baseline.gates.agenticPurchase.providerCallCount, 0)
  assert.equal(baseline.gates.agenticPurchase.modelCallCount, 0)
  assert.ok(
    baseline.gates.agenticPurchase.blockers.some(blocker =>
      blocker.gate === 'browser'),
  )
  assert.equal(
    baseline.gates.providerSandbox.rails.straitsx.configuredFundFlow,
    null,
  )
  assert.deepEqual(
    baseline.gates.providerSandbox.rails.stripe.buyerProductEnvironmentNames,
    [
      'PAYMENT_BUYER_PRODUCT_AMOUNT_MINOR',
      'PAYMENT_BUYER_PRODUCT_CURRENCY',
      'PAYMENT_BUYER_PRODUCT_SETTLEMENT_ASSET',
    ],
  )
  assert.equal(
    baseline.gates.providerSandbox.rails.stripe.buyerProductConfigured,
    false,
  )
  assert.equal(baseline.gates.browserRuntime.status, 'not-proven')
  assert.equal(baseline.gates.protectedIntegration.status, 'not-proven')
  assert.equal(baseline.gates.productionMirror.status, 'not-authorized')
  assert.equal(baseline.gates.deployment.status, 'not-authorized')

  const requirementsPath = path.join(
    fixtureRoot,
    '.kiro/specs/agentic-graph-payments/requirements.md',
  )
  const requirements = await readFile(requirementsPath, 'utf8')
  await writeFile(
    requirementsPath,
    requirements.replace('companion_document_state: "populated"', 'companion_document_state: "empty"'),
  )
  const stale = await inspectAgenticGraphPaymentsReadiness({
    root: fixtureRoot,
    requireTracked: false,
  })
  assert.equal(
    stale.gates.source.checks.find(check => check.id === 'document-authority')?.status,
    'fail',
  )
})

test('valid provider proof cannot promote incomplete source or local task provenance', async () => {
  const first = await inspectAgenticGraphPaymentsReadiness({
    root: repositoryRoot,
    requireTracked: false,
  })
  assert.match(first.sourceIdentity.evidenceDigest, /^[0-9a-f]{64}$/)
  const report = await inspectAgenticGraphPaymentsReadiness({
    root: repositoryRoot,
    requireTracked: false,
    providerProof: buildProviderProof(first.sourceIdentity.evidenceDigest),
  })
  assert.equal(report.gates.providerSandbox.status, 'blocked')
  assert.equal(report.gates.providerSandbox.rails.stripe.status, 'candidate')
  assert.equal(report.gates.providerSandbox.rails.straitsx.status, 'candidate')
  assert.equal(report.gates.agenticPurchase.status, 'blocked')
  assert.equal(report.gates.agenticPurchase.claims.providerSandboxProven, false)
  assert.notEqual(report.gates.source.status, 'pass')
  assert.equal(report.ok, false)
  assert.equal(report.verdict, 'implemented-runtime-readiness-blocked')
  assert.equal(report.gates.protectedIntegration.status, 'not-proven')
  assert.equal(report.gates.deployment.status, 'not-authorized')

  const invalidCandidate = buildProviderProof(first.sourceIdentity.evidenceDigest)
  invalidCandidate.rails[0].terminalState = 'expired'
  const invalidReport = await inspectAgenticGraphPaymentsReadiness({
    root: repositoryRoot,
    requireTracked: false,
    providerProof: invalidCandidate,
  })
  assert.equal(invalidReport.gates.providerSandbox.status, 'fail')
  assert.equal(invalidReport.gates.providerSandbox.rails.stripe.status, 'fail')
  assert.equal(invalidReport.gates.providerSandbox.rails.straitsx.status, 'candidate')
})

test('editable manifest claims cannot replace an executed source-bound local VCC attestation', async t => {
  const fixtureRoot = await createSourceFixture(t)
  const manifestPath = path.join(
    fixtureRoot,
    'scripts/agentic-graph-payments-readiness-properties.json',
  )
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  for (const requirement of manifest.requirements) requirement.status = 'implemented'
  for (const question of manifest.openQuestions) question.status = 'resolved'
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  const report = await inspectAgenticGraphPaymentsReadiness({
    root: fixtureRoot,
    requireTracked: false,
  })
  assert.equal(
    report.gates.source.checks.find(check => check.id === 'source-coverage')?.status,
    'pass',
    'the manifest claim itself can be complete',
  )
  assert.equal(
    report.gates.source.checks.find(check =>
      check.id === 'executed-local-vcc-attestation')?.status,
    'blocked',
  )
  assert.equal(report.gates.source.status, 'blocked')
  assert.equal(report.ok, false)
})

test('environment-specific visible vars are included in the credential leak boundary', async t => {
  const fixtureRoot = await createSourceFixture(t)
  const configPath = path.join(
    fixtureRoot,
    'cloudflare/workers/agentic-graph-payment/wrangler.toml',
  )
  const config = await readFile(configPath, 'utf8')
  await writeFile(
    configPath,
    `${config}\n[env.production.vars]\nSTRIPE_SECRET_KEY = "sk_test_${'x'.repeat(24)}"\n`,
  )
  const report = await inspectAgenticGraphPaymentsReadiness({
    root: fixtureRoot,
    requireTracked: false,
  })
  const check = report.gates.source.checks.find(item =>
    item.id === 'visible-worker-secret-bindings')
  assert.equal(check?.status, 'fail')
  assert.match(check?.detail || '', /env\.production\.vars:STRIPE_SECRET_KEY/)
})

test('readiness names the configured fund flow and validates all buyer-product inputs', async t => {
  const fixtureRoot = await createSourceFixture(t)
  const configPath = path.join(
    fixtureRoot,
    'cloudflare/workers/agentic-graph-payment/wrangler.toml',
  )
  const config = await readFile(configPath, 'utf8')
  const configured = config
    .replace(
      'PAYMENT_BUYER_PRODUCT_AMOUNT_MINOR = ""',
      'PAYMENT_BUYER_PRODUCT_AMOUNT_MINOR = "1200"',
    )
    .replace(
      'PAYMENT_BUYER_PRODUCT_CURRENCY = ""',
      'PAYMENT_BUYER_PRODUCT_CURRENCY = "sgd"',
    )
    .replace(
      'PAYMENT_BUYER_PRODUCT_SETTLEMENT_ASSET = ""',
      'PAYMENT_BUYER_PRODUCT_SETTLEMENT_ASSET = "fiat"',
    )
    .replace(
      'STRAITSX_FUND_FLOW = ""',
      'STRAITSX_FUND_FLOW = "own_account_collection"',
    )
  await writeFile(configPath, configured)

  const report = await inspectAgenticGraphPaymentsReadiness({
    root: fixtureRoot,
    requireTracked: false,
  })

  assert.equal(
    report.gates.providerSandbox.rails.straitsx.configuredFundFlow,
    'own_account_collection',
  )
  assert.equal(
    report.gates.providerSandbox.rails.stripe.buyerProductConfigured,
    true,
  )
})

test('malformed manifest objects return structured source failures', async t => {
  const fixtureRoot = await createSourceFixture(t)
  const manifestPath = path.join(
    fixtureRoot,
    'scripts/agentic-graph-payments-readiness-properties.json',
  )
  for (const malformed of ['null\n', '{}\n']) {
    await writeFile(manifestPath, malformed)
    const report = await inspectAgenticGraphPaymentsReadiness({
      root: fixtureRoot,
      requireTracked: false,
    })
    assert.equal(report.gates.source.status, 'fail')
    assert.equal(
      report.gates.source.checks.find(check => check.id === 'manifest-structure')?.status,
      'fail',
    )
    assert.equal(report.ok, false)
  }
})

test('exact-main source identity alone cannot prove canonical runtime', async t => {
  const fixtureRoot = await createSourceFixture(t)
  await execFileAsync('git', ['init', '-b', 'main'], { cwd: fixtureRoot })
  await execFileAsync('git', ['config', 'user.name', 'Readiness Test'], { cwd: fixtureRoot })
  await execFileAsync('git', ['config', 'user.email', 'readiness@example.invalid'], {
    cwd: fixtureRoot,
  })
  await execFileAsync('git', ['add', '.'], { cwd: fixtureRoot })
  await execFileAsync('git', ['commit', '-m', 'fixture'], { cwd: fixtureRoot })
  await execFileAsync(
    'git',
    ['update-ref', 'refs/remotes/origin/main', 'HEAD'],
    { cwd: fixtureRoot },
  )

  const report = await inspectAgenticGraphPaymentsReadiness({
    root: fixtureRoot,
    requireTracked: true,
  })
  assert.equal(report.sourceIdentity.clean, true)
  assert.equal(report.gates.canonicalRuntime.sourceIdentityExactMain, true)
  assert.equal(report.gates.canonicalRuntime.status, 'not-proven')
})

test('CLI JSON output rejects an unsigned provider candidate with a non-zero exit', async t => {
  const first = await inspectAgenticGraphPaymentsReadiness({
    root: repositoryRoot,
    requireTracked: false,
  })
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-graph-payments-candidate-'))
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }))
  const candidatePath = path.join(fixtureRoot, 'provider-candidate.json')
  await writeFile(
    candidatePath,
    `${JSON.stringify(buildProviderProof(first.sourceIdentity.evidenceDigest))}\n`,
  )
  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        'scripts/check-agentic-graph-payments-readiness.mjs',
        '--provider-proof',
        candidatePath,
        '--json',
      ],
      { cwd: repositoryRoot },
    ),
    error => {
      assert.equal(error.code, 1)
      const report = JSON.parse(error.stdout)
      assert.equal(report.schemaId, 'agentic-graph-payments-readiness/v1')
      assert.equal(report.ok, false)
      assert.equal(report.verdict, 'implemented-runtime-readiness-blocked')
      assert.equal(report.gates.source.status, 'pass')
      assert.equal(report.gates.localVcc.status, 'pass')
      assert.equal(report.localDevelopmentReady, true)
      assert.equal(report.gates.providerSandbox.status, 'blocked')
      assert.equal(report.gates.providerSandbox.rails.stripe.status, 'candidate')
      return true
    },
  )
})
