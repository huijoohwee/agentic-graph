import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
const LIFECYCLE_SCHEMA_ROOT = path.resolve(import.meta.dirname, '..')

export const loadContract = async (docsRootValue, expectedRevisionValue, releaseLifecycleContract) => {
  const docsRoot = path.resolve(required(docsRootValue, '--docs-root'))
  const expectedRevision = required(expectedRevisionValue, '--docs-sha')
  requireSha(expectedRevision, 'Agentic Canvas OS revision')
  const repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: docsRoot, encoding: 'utf8' }).trim()
  const actualRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim()
  if (actualRevision !== expectedRevision) {
    throw new Error(`Agentic Canvas OS source identity drift: expected ${expectedRevision}, received ${actualRevision}`)
  }
  return releaseLifecycleContract
}
export const loadLifecycleSchemas = ([v1, v2]) => {
  return { v1: readJson(path.join(LIFECYCLE_SCHEMA_ROOT, v1)), v2: readJson(path.join(LIFECYCLE_SCHEMA_ROOT, v2)) }
}
export const loadAjv2020 = () => {
  const require = createRequire(import.meta.url)
  const module = require('ajv/dist/2020.js')
  return module.default || module
}
export const deploymentIdentity = ({ integration, review, candidate, authorization }) => ({
  preservationReceiptDigest: integration.preservationReceiptDigest,
  overlapDispositionReceiptDigest: integration.overlapDispositionReceiptDigest,
  integrationReceiptDigest: integration.receiptDigest,
  runtimeReviewReceiptDigest: review.receiptDigest,
  candidateDigest: candidate.receiptDigest,
  authorizationReceiptDigest: authorization.receiptDigest,
  sourceDigest: candidate.sourceDigest,
  dependencyClosureDigest: candidate.dependencyClosureDigest,
  policyDigest: candidate.policyDigest,
  targetDigest: candidate.targetDigest,
  artifactDigest: candidate.artifactDigest,
  manifestDigest: candidate.manifestDigest,
})
export const collaborationFrom = values => ({
  actorId: required(values['actor-id'], '--actor-id'),
  deviceId: required(values['device-id'], '--device-id'),
  sessionId: required(values['session-id'], '--session-id'),
  worktreeId: required(values['worktree-id'], '--worktree-id'),
  branchId: required(values['branch-id'], '--branch-id'),
  scopeId: required(values['scope-id'], '--scope-id'),
  leaseEpoch: positiveInteger(values['lease-epoch'], '--lease-epoch'),
  fenceRevision: required(values['fence-revision'], '--fence-revision'),
})
export const readJson = filePath => JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'))
export const readReceipt = (receiptDir, fileName) => readJson(path.join(receiptDir, fileName))
export const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true })
  fs.writeFileSync(path.resolve(filePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
const inspectReplaySafeBytes = ({ key, path: filePath, bytes }) => {
  const outputPath = path.resolve(filePath)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  try {
    const stat = fs.lstatSync(outputPath)
    if (!stat.isFile()) throw new Error(`replayed evidence target is not a regular file: ${outputPath}`)
    if (!fs.readFileSync(outputPath).equals(bytes)) throw new Error(`replayed evidence differs from ${outputPath}`)
    return { key, outputPath, bytes, disposition: 'replayed', stagePath: '' }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    return { key, outputPath, bytes, disposition: 'created', stagePath: '' }
  }
}
const stageReplaySafeBytes = plan => {
  if (plan.disposition !== 'created') return plan
  const stagePath = path.join(
    path.dirname(plan.outputPath),
    `.${path.basename(plan.outputPath)}.stage-${process.pid}-${randomUUID()}`,
  )
  const descriptor = fs.openSync(stagePath, 'wx', 0o600)
  try {
    fs.writeFileSync(descriptor, plan.bytes)
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
  return { ...plan, stagePath }
}
const publishStagedBytes = plan => {
  if (plan.disposition !== 'created') return plan
  try {
    fs.linkSync(plan.stagePath, plan.outputPath)
    return plan
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    const replay = inspectReplaySafeBytes({ key: plan.key, path: plan.outputPath, bytes: plan.bytes })
    return { ...plan, disposition: replay.disposition }
  }
}
export const publishReplaySafeRecapturePair = ({ output, digest: digestArtifact }) => {
  const plans = [
    inspectReplaySafeBytes({ key: 'digestWrite', ...digestArtifact }),
    inspectReplaySafeBytes({ key: 'outputWrite', ...output }),
  ]
  try {
    for (let index = 0; index < plans.length; index += 1) plans[index] = stageReplaySafeBytes(plans[index])
    const published = plans.map(publishStagedBytes)
    return Object.fromEntries(published.map(plan => [plan.key, plan.disposition]))
  } finally {
    for (const plan of plans) {
      if (!plan.stagePath) continue
      try { fs.unlinkSync(plan.stagePath) } catch (error) { if (error?.code !== 'ENOENT') throw error }
    }
  }
}
const githubOutputLine = (name, value) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`invalid GitHub output name: ${name}`)
  const normalized = String(value)
  if (/[\r\n]/u.test(normalized)) throw new Error(`GitHub output ${name} contains a line break`)
  return `${name}=${normalized}\n`
}
export const prepareGitHubOutput = (enabled, values) => {
  if (!enabled) return null
  const outputPath = String(process.env.GITHUB_OUTPUT || '')
  if (!outputPath.trim()) throw new Error('GITHUB_OUTPUT is required')
  if (/[\r\n]/u.test(outputPath)) throw new Error('GITHUB_OUTPUT path contains a line break')
  const bytes = Object.entries(values).map(([name, value]) => githubOutputLine(name, value)).join('')
  const descriptor = fs.openSync(outputPath, 'a')
  fs.closeSync(descriptor)
  return { outputPath, bytes }
}
export const publishPreparedGitHubOutput = prepared => {
  if (prepared) fs.appendFileSync(prepared.outputPath, prepared.bytes, 'utf8')
}
export const writeGitHubOutput = (enabled, name, value) => {
  publishPreparedGitHubOutput(prepareGitHubOutput(enabled, { [name]: value }))
}
export const requireOutputDir = value => { if (!value) throw new Error('--output-dir is required') }
export const required = (value, label) => {
  const normalized = String(value || '').trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}
export const positiveInteger = (value, label) => {
  const number = Number(required(value, label))
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${label} must be a positive integer`)
  return number
}
export const requireSha = (value, label) => { if (!/^[0-9a-f]{40}$/.test(String(value || ''))) throw new Error(`${label} must be an exact Git SHA`) }
export const requireText = (value, label) => { if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be non-empty`) }
export const requireInstant = (value, label) => {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`${label} must be an ISO timestamp`)
}
export const requireIdentity = (identity, revision, tree, label) => {
  if (identity?.revision !== revision || identity?.tree !== tree) {
    throw new Error(`${label} identity drifted from localhost review`)
  }
}
