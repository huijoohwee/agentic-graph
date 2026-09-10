import fs from 'node:fs'
import { parseArgs, TextDecoder } from 'node:util'
import { pathToFileURL } from 'node:url'
import { digest, DIGEST, requireText, seal } from './travel-mesh-release-plan.mjs'
import { assertReleaseAuthority } from './travel-mesh-release.mjs'
import { validateCoreOwnerAuthority } from './core-runtime-release-plan.mjs'
import { readRuntimeProfile } from './runtime-release-profile.mjs'
import { readBoundedProbeBody } from './travel-mesh-release-probes.mjs'

const PLAN_SCHEMA = 'agentic-graph-canonical-document-publication-plan/v1'
const RECEIPT_SCHEMA = 'agentic-graph-core-document-publication-receipt/v1'
const ORIGIN = 'https://airvio.co'
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const boundedText = value => typeof value === 'string' && value.length > 0 && value.length <= 1024 && !/[\u0000-\u001f]/.test(value)

export const validateCanonicalPublicationPlan = (plan, stateEvidence, workspaceId) => {
  if (!exactKeys(plan, ['schema', 'authorizesEffects', 'stateContract', 'stateContractDigest', 'revisions', 'planDigest'])
    || plan.schema !== PLAN_SCHEMA || plan.authorizesEffects !== false) throw new Error('canonical publication plan is invalid')
  const { planDigest, ...body } = plan
  if (!DIGEST.test(planDigest) || digest(body) !== planDigest || !DIGEST.test(plan.stateContractDigest)
    || digest(plan.stateContract) !== plan.stateContractDigest) throw new Error('canonical publication plan digest differs')
  const state = plan.stateContract, documents = state?.documents
  if (state?.workspaceId !== workspaceId || !Array.isArray(documents) || !documents.length || documents.length > 2500
    || !Array.isArray(state.documentChunks) || !Array.isArray(state.graphSnapshots) || state.graphSnapshots.length
    || !Array.isArray(plan.revisions) || plan.revisions.length !== documents.length) throw new Error('canonical publication corpus is invalid')
  if (stateEvidence?.schema !== 'agentic-graph-d1-reconciliation-evidence/v1'
    || stateEvidence.workspaceId !== workspaceId || stateEvidence.stateContractDigest !== plan.stateContractDigest
    || stateEvidence.readbackKind !== 'direct-authoritative' || stateEvidence.pathHashParity !== true || stateEvidence.contentParity !== true
    || stateEvidence.expectedCounts?.documentCount !== documents.length || stateEvidence.observedCounts?.documentCount !== documents.length
    || stateEvidence.expectedCounts?.chunkCount !== state.documentChunks.length || stateEvidence.observedCounts?.chunkCount !== state.documentChunks.length
    || stateEvidence.expectedCounts?.graphCount !== 0 || stateEvidence.observedCounts?.graphCount !== 0) {
    throw new Error('publication plan is not joined to canonical D1 reconciliation')
  }
  const identities = new Set(), paths = new Set()
  return documents.map((document, index) => {
    const revision = plan.revisions[index]
    if (!boundedText(revision?.documentId) || !boundedText(document?.canonicalPath) || !DIGEST.test(document.contentHash)
      || document.canonicalPath.startsWith('/') || document.canonicalPath.split('/').some(part => !part || part === '.' || part === '..')
      || identities.has(revision.documentId) || paths.has(document.canonicalPath)
      || !exactKeys(revision, ['documentId', 'revision'])
      || !Number.isSafeInteger(revision.revision) || revision.revision < 1) throw new Error('canonical publication identity is invalid')
    identities.add(revision.documentId); paths.add(document.canonicalPath)
    return { workspaceId, documentId: revision.documentId, canonicalPath: document.canonicalPath,
      action: 'publish', expectedRevision: revision.revision, expectedContentHash: document.contentHash }
  })
}

export const publishCanonicalDocuments = async ({ plan, stateEvidence, sourceSha, candidateDigest, authorization,
  environment = process.env, fetchFn = fetch, now = () => new Date(), profile = readRuntimeProfile() }) => {
  assertReleaseAuthority({ sourceSha, candidateDigest, authorization, environment })
  if (profile.id !== 'core') throw new Error('canonical publication requires the reviewed core profile')
  const variables = Object.fromEntries(['AGENTIC_OS_STORAGE_OWNER_ID', 'AGENTIC_OS_STORAGE_OWNER_WORKSPACE_ID',
    'AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT'].map(name => [name, requireText(environment[name], name)]))
  if (!Number.isFinite(Date.parse(variables.AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT))) throw new Error('core publication key expiry is invalid')
  validateCoreOwnerAuthority(authorization, { variables }, now)
  const accessKey = requireText(environment.AGENTIC_OS_STORAGE_OWNER_ACCESS_KEY, 'core publication access key')
  if (!/^[a-f0-9]{64}$/.test(accessKey)) throw new Error('core publication access key is invalid')
  const documents = validateCanonicalPublicationPlan(plan, stateEvidence, variables.AGENTIC_OS_STORAGE_OWNER_WORKSPACE_ID)
  const published = [], startedAt = now().toISOString()
  let pending = null
  try {
    for (const document of documents) {
      pending = { documentId: document.documentId, requestDigest: digest(document) }
      const response = await fetchFn(`${ORIGIN}/api/storage/publications`, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000),
        headers: { authorization: `Bearer ${accessKey}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(document),
      })
      if (response.status !== 200) { await response.body?.cancel(); throw new Error(`publication provider returned ${response.status}`) }
      let result
      try { result = JSON.parse(await readBoundedProbeBody(response)) }
      catch { throw new Error('publication provider response is invalid') }
      if (result?.ok !== true || result.status !== 'published' || result.workspaceId !== document.workspaceId
        || result.documentId !== document.documentId || result.canonicalPath !== document.canonicalPath
        || result.revision !== document.expectedRevision || result.contentHash !== document.expectedContentHash) {
        throw new Error('publication provider identity differs')
      }
      published.push({ ...pending, responseDigest: digest(result), revision: result.revision, contentHash: result.contentHash })
      pending = null
    }
    return seal({ schema: RECEIPT_SCHEMA, status: 'published', sourceRevision: sourceSha, candidateDigest,
      actorId: authorization.humanActorId, planDigest: plan.planDigest, stateContractDigest: plan.stateContractDigest,
      documentCount: published.length, published, startedAt, completedAt: now().toISOString() })
  } catch (error) {
    // A lost response may follow a committed publication. Preserve it for the
    // release owner's reconciliation; do not repeat a request speculatively.
    const receipt = seal({ schema: RECEIPT_SCHEMA, status: 'preserve-required', sourceRevision: sourceSha, candidateDigest,
      actorId: authorization.humanActorId, planDigest: plan.planDigest, stateContractDigest: plan.stateContractDigest,
      published, pending, mutationAttempted: true, startedAt, failedAt: now().toISOString() })
    throw Object.assign(new Error('canonical document publication requires reconciliation'), { receipt })
  }
}

const readJson = file => {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    const before = fs.fstatSync(fd)
    if (!before.isFile() || before.size > 16 * 1024 * 1024) throw new Error('publication input exceeds its file bound')
    const bytes = fs.readFileSync(fd), after = fs.fstatSync(fd)
    if (bytes.length !== before.size || after.mtimeMs !== before.mtimeMs || after.size !== before.size) throw new Error('publication input changed during read')
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } finally { fs.closeSync(fd) }
}
const main = async () => {
  const { values } = parseArgs({ strict: true, options: Object.fromEntries(
    ['plan', 'state-evidence', 'authorization', 'source-sha', 'candidate-digest', 'output'].map(name => [name, { type: 'string' }])) })
  for (const name of ['plan', 'state-evidence', 'authorization', 'source-sha', 'candidate-digest', 'output']) requireText(values[name], `--${name}`)
  const output = receipt => fs.writeFileSync(values.output, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  try {
    const receipt = await publishCanonicalDocuments({ plan: readJson(values.plan), stateEvidence: readJson(values['state-evidence']),
      authorization: readJson(values.authorization), sourceSha: values['source-sha'], candidateDigest: values['candidate-digest'] })
    output(receipt)
    process.stdout.write(`Canonical document publication verified: ${receipt.documentCount}\n`)
  } catch (error) { if (error.receipt) output(error.receipt); throw error }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch(error => {
  console.error(error.message); process.exitCode = 1
})
