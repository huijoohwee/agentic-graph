import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createForwardHealBaselineEvidence } from './production-forward-heal-evidence.mjs'

export const FORWARD_HEAL_BASELINE_OPTIONS = {
  'receipt-dir': { type: 'string' },
  'failure-observation': { type: 'string' },
  'failure-detail': { type: 'string' },
  'first-pages-observation': { type: 'string' },
  'first-state-evidence': { type: 'string' },
  'first-mirror-observation': { type: 'string' },
  'second-pages-observation': { type: 'string' },
  'second-state-evidence': { type: 'string' },
  'second-mirror-observation': { type: 'string' },
  'attestation-output': { type: 'string' },
  'rollback-recapture-output': { type: 'string' },
}

const required = (values, name) => {
  const value = String(values[name] || '').trim()
  if (!value) throw new Error(`--${name} is required`)
  return value
}
const readJson = async filePath => JSON.parse(await fs.readFile(path.resolve(filePath), 'utf8'))

const writeReplaySafeJson = async (filePath, value) => {
  const outputPath = path.resolve(filePath)
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  try {
    await fs.writeFile(outputPath, bytes, { flag: 'wx' })
    return 'created'
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    assert.deepEqual(await fs.readFile(outputPath), bytes, `replayed evidence differs from ${outputPath}`)
    return 'replayed'
  }
}

const readForwardHealLifecycle = async receiptDir => {
  const receiptPath = name => path.join(path.resolve(receiptDir), name)
  const [
    preservation, disposition, integration, review, candidate, authorizationInteraction,
    authorizedHuman, authorization, deployment, state, releaseEvidence,
  ] = await Promise.all([
    readJson(receiptPath('overlap-preservation-receipt.json')),
    readJson(receiptPath('overlap-disposition-receipt.json')),
    readJson(receiptPath('integration-receipt.json')),
    readJson(receiptPath('runtime-review-receipt.json')),
    readJson(receiptPath('candidate-manifest.json')),
    readJson(receiptPath('authorization-interaction-receipt.json')),
    readJson(receiptPath('human-authorization-receipt.json')),
    readJson(receiptPath('consumed-human-authorization-receipt.json')),
    readJson(receiptPath('deployment-receipt.json')),
    readJson(receiptPath('state-reconciliation-receipt.json')),
    readJson(receiptPath('release-evidence.json')),
  ])
  return {
    preservation, disposition, integration, review, candidate, authorizationInteraction,
    authorizedHuman, authorization, deployment, state, releaseEvidence,
  }
}

const produceForwardHealBaseline = async options => {
  const failureDetailBytes = await fs.readFile(path.resolve(options.failureDetailPath))
  const [lifecycle, failureObservation, firstPages, firstState, firstMirror, secondPages, secondState, secondMirror] = await Promise.all([
    readForwardHealLifecycle(options.receiptDir),
    readJson(options.failureObservationPath),
    readJson(options.firstPagesPath), readJson(options.firstStatePath), readJson(options.firstMirrorPath),
    readJson(options.secondPagesPath), readJson(options.secondStatePath), readJson(options.secondMirrorPath),
  ])
  const evidence = createForwardHealBaselineEvidence({
    lifecycle,
    failureObservation,
    failureDetail: JSON.parse(String(failureDetailBytes)),
    failureDetailBytes,
    firstObservation: { pages: firstPages, state: firstState, mirror: firstMirror },
    secondObservation: { pages: secondPages, state: secondState, mirror: secondMirror },
  })
  assert.notEqual(path.resolve(options.attestationOutput), path.resolve(options.rollbackRecaptureOutput),
    'attestation and rollback recapture outputs must remain distinct')
  const attestationWrite = await writeReplaySafeJson(options.attestationOutput, evidence.attestation)
  const rollbackWrite = await writeReplaySafeJson(options.rollbackRecaptureOutput, evidence.rollbackRecapture)
  process.stdout.write(`${JSON.stringify({
    status: 'attested',
    attestationDigest: evidence.attestation.attestationDigest,
    rollbackTargetDigest: evidence.attestation.rollbackTargetDigest,
    attestationWrite,
    rollbackWrite,
  })}\n`)
}

export const runForwardHealBaselineCommand = values => produceForwardHealBaseline({
  receiptDir: required(values, 'receipt-dir'),
  failureObservationPath: required(values, 'failure-observation'),
  failureDetailPath: required(values, 'failure-detail'),
  firstPagesPath: required(values, 'first-pages-observation'),
  firstStatePath: required(values, 'first-state-evidence'),
  firstMirrorPath: required(values, 'first-mirror-observation'),
  secondPagesPath: required(values, 'second-pages-observation'),
  secondStatePath: required(values, 'second-state-evidence'),
  secondMirrorPath: required(values, 'second-mirror-observation'),
  attestationOutput: required(values, 'attestation-output'),
  rollbackRecaptureOutput: required(values, 'rollback-recapture-output'),
})
