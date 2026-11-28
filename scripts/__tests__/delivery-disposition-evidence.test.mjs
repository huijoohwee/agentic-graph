import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { governanceDigest } from '../../node_modules/agentic-os/src/governance.mjs'
import { readContract, selectAffectedCommands } from '../collaboration-contract.mjs'
import { validateDeliveryEvidenceMetadata } from '../check-delivery-disposition-evidence.mjs'

const sha256 = value => createHash('sha256').update(value).digest('hex')

test('delivery ledger and evidence paths select only the delivery metadata checks', async () => {
  const contract = await readContract()
  const expected = [
    ['node', '--test', 'scripts/__tests__/ci-evidence-inputs.test.mjs', 'scripts/__tests__/delivery-disposition-evidence.test.mjs'],
  ]
  for (const changedPath of [
    '.agentic-os-delivery-dispositions.json',
    'docs/reports/production-delivery-evidence-999999.json',
    'docs/reports/agentic-graph-delivery-evidence-example.json',
    'docs/reports/miaoxyz-production-delivery-evidence-example.json',
  ]) {
    const plan = selectAffectedCommands([changedPath], contract)
    assert.deepEqual(plan.scopes, changedPath.startsWith('docs/reports/')
      ? ['protected_ci_evidence', 'documentation'] : ['protected_ci_evidence'])
    assert.deepEqual(plan.unmatchedPaths, [])
    assert.deepEqual(plan.commands, expected)
  }
  assert.deepEqual(selectAffectedCommands(['src/runtime/new-source.mjs'], contract).scopes, ['travel_commerce'])
})

test('delivery metadata checker validates the ledger digest and changed report JSON', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'delivery-evidence-metadata-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'docs', 'reports'), { recursive: true })
  const evidencePath = 'docs/reports/production-delivery-evidence-999999.json'
  const evidence = '{"schema":"evidence/v1"}\n'
  await writeFile(path.join(root, evidencePath), evidence)
  const row = {
    schema: 'agentic-os/delivery-disposition/v1',
    ref: 'agent/device-test/delivery-evidence',
    laneHead: 'a'.repeat(40),
    paths: [evidencePath],
    disposition: 'no-deploy',
    candidateRevision: 'b'.repeat(40),
    candidateDigest: 'c'.repeat(64),
    sourceReleaseReceiptDigest: null,
    deploymentReceiptDigest: null,
    runtimeVerificationReceiptDigest: null,
    evidencePath,
    evidenceDigest: sha256(evidence),
    decisionRef: 'https://github.com/huijoohwee/agentic-graph/pull/999999',
    reason: 'The report is excluded from the product artifact.',
  }
  const body = { schema: 'agentic-os/delivery-disposition-set/v1', repository: 'github.com/huijoohwee/agentic-graph', dispositions: [row] }
  await writeFile(path.join(root, '.agentic-os-delivery-dispositions.json'), JSON.stringify({ ...body, receiptDigest: governanceDigest(body) }))
  assert.deepEqual(validateDeliveryEvidenceMetadata(root, { changedPaths: [evidencePath] }), {
    schema: 'agentic-graph/delivery-evidence-metadata-check/v1',
    rows: 1,
    reports: 1,
    digest: governanceDigest(body),
  })
  await writeFile(path.join(root, evidencePath), 'not-json')
  assert.throws(() => validateDeliveryEvidenceMetadata(root, { changedPaths: [evidencePath] }), SyntaxError)
})

test('committed delivery evidence metadata passes the read-only checker', () => {
  const result = validateDeliveryEvidenceMetadata()
  assert.equal(result.schema, 'agentic-graph/delivery-evidence-metadata-check/v1')
  assert.ok(result.rows > 0)
  assert.ok(result.reports >= 0)
  assert.match(result.digest, /^[0-9a-f]{64}$/)
})
