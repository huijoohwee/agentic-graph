import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateTransportEvidence } from '../verify-production-release-transports.mjs'

export const RELEASE_EVIDENCE_SCHEMA = 'knowgrph-production-release-evidence/v1'
export const ROLLBACK_IDENTITY_SCHEMA = 'knowgrph-production-rollback-identity/v1'
export const ROLLBACK_RECAPTURE_SCHEMA = 'knowgrph-production-rollback-recapture/v1'
export const DEPLOYMENT_CAPTURE_SCHEMA = 'knowgrph-pages-deployment-capture/v1'
export const D1_RECONCILIATION_EVIDENCE_SCHEMA = 'knowgrph-d1-reconciliation-evidence/v1'
export const LIFECYCLE_V2_SCHEMA = 'agentic-collaborative-release-lifecycle/v2'
export const RELEASE_EVIDENCE_CAPTURE_ADAPTER = 'knowgrph-dormant-release-frontier-materializer/v1'
const D1_SNAPSHOT_SCHEMA = 'knowgrph-d1-state-snapshot/v1'
const FAILURE_OBSERVATION_SCHEMA = 'knowgrph-production-release-failure-observation/v1'
const RESTORED_PAGES_SCHEMA = 'knowgrph-production-restored-pages-evidence/v1'
const OBSERVED_MIRROR_SCHEMA = 'knowgrph-production-observed-mirror-identity/v1'
const PAGES_API_ADAPTER = 'cloudflare-pages/api-canonical-observation-v1'
const ROLLBACK_STAGES = ['deployment', 'state-reconciliation', 'live-verification', 'publication', 'receipt-persistence']

const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^[0-9a-f]{64}$/
const COLLABORATION_FIELDS = ['actorId', 'deviceId', 'sessionId', 'worktreeId', 'branchId', 'scopeId', 'leaseEpoch', 'fenceRevision']
const PRESERVATION_FIELDS = ['collaboration', 'writeSetDigest', 'stateDigest', 'recoveryHandle', 'preservationMode', 'overlapClass']
const OBSERVATION_FIELDS = ['collaboration', 'stateDigest', 'recoveryHandle', 'disposition']
const STATE_COUNT_FIELDS = ['documentCount', 'chunkCount', 'graphCount']

export const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonicalJson(value)).digest('hex')
const requireExact = (value, fields, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  const actual = Object.keys(value).sort(), expected = [...fields].sort()
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) throw new Error(`${label} contains missing or unknown fields`)
}
const requireText = (value, label) => { if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be non-empty`) }
const requireSha = (value, label) => { if (!SHA_PATTERN.test(String(value || ''))) throw new Error(`${label} must be an exact Git SHA`) }
const requireDigest = (value, label) => { if (!DIGEST_PATTERN.test(String(value || ''))) throw new Error(`${label} must be a SHA-256 digest`) }
const requireInstant = (value, label) => {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`${label} must be an exact ISO timestamp`)
}
const requireHttpsOrigin = (value, label) => {
  requireText(value, label)
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error(`${label} must be an HTTPS origin`)
  return url.origin
}
const normalizeCounts = (value, label) => {
  requireExact(value, STATE_COUNT_FIELDS, label)
  for (const field of STATE_COUNT_FIELDS) if (!Number.isSafeInteger(value[field]) || value[field] < 0) throw new Error(`${label}.${field} must be a non-negative integer`)
  return { ...value }
}
const normalizeCollaboration = (value, label) => {
  requireExact(value, COLLABORATION_FIELDS, label)
  for (const field of COLLABORATION_FIELDS.filter(field => field !== 'leaseEpoch')) requireText(value[field], `${label}.${field}`)
  if (!Number.isSafeInteger(value.leaseEpoch) || value.leaseEpoch < 1) throw new Error(`${label}.leaseEpoch must be a positive integer`)
  return { ...value }
}
const collaborationKey = collaboration => COLLABORATION_FIELDS.map(field => String(collaboration[field])).join('\u0000')
const normalizePreservationEntry = (value, index) => {
  const label = `release evidence entries[${index}]`
  requireExact(value, PRESERVATION_FIELDS, label)
  const collaboration = normalizeCollaboration(value.collaboration, `${label}.collaboration`)
  requireDigest(value.writeSetDigest, `${label}.writeSetDigest`)
  requireDigest(value.stateDigest, `${label}.stateDigest`)
  requireText(value.recoveryHandle, `${label}.recoveryHandle`)
  if (!['active-lane', 'immutable-recovery-object'].includes(value.preservationMode)) throw new Error(`${label}.preservationMode is invalid`)
  if (!['disjoint', 'overlapping'].includes(value.overlapClass)) throw new Error(`${label}.overlapClass is invalid`)
  return { ...value, collaboration }
}
const normalizeObservation = (value, index) => {
  const label = `release evidence observations[${index}]`
  requireExact(value, OBSERVATION_FIELDS, label)
  const collaboration = normalizeCollaboration(value.collaboration, `${label}.collaboration`)
  requireDigest(value.stateDigest, `${label}.stateDigest`)
  requireText(value.recoveryHandle, `${label}.recoveryHandle`)
  if (value.disposition !== 'retained') throw new Error(`${label}.disposition must be retained for the preserved release frontier`)
  return { ...value, collaboration }
}
export const normalizeRollbackIdentity = value => {
  requireExact(value, ['schema', 'pages', 'mirror', 'd1'], 'rollback identity')
  if (value.schema !== ROLLBACK_IDENTITY_SCHEMA) throw new Error('rollback identity schema is invalid')
  requireExact(value.pages, ['deploymentId', 'deploymentOrigin', 'deploymentCommitRevision', 'sourceRevision'], 'rollback identity pages')
  requireText(value.pages.deploymentId, 'rollback pages deploymentId')
  const deploymentOrigin = requireHttpsOrigin(value.pages.deploymentOrigin, 'rollback pages deploymentOrigin')
  requireSha(value.pages.deploymentCommitRevision, 'rollback pages deploymentCommitRevision')
  requireSha(value.pages.sourceRevision, 'rollback pages sourceRevision')
  requireExact(value.mirror, ['repository', 'revision'], 'rollback identity mirror')
  requireText(value.mirror.repository, 'rollback mirror repository')
  requireSha(value.mirror.revision, 'rollback mirror revision')
  requireExact(value.d1, ['stateContractDigest', 'readbackDigest', 'counts'], 'rollback identity D1')
  requireDigest(value.d1.stateContractDigest, 'rollback D1 stateContractDigest')
  requireDigest(value.d1.readbackDigest, 'rollback D1 readbackDigest')
  const counts = normalizeCounts(value.d1.counts, 'rollback D1 counts')
  if (counts.graphCount !== 0) throw new Error('rollback D1 identity requires zero graph snapshots')
  return { schema: value.schema, pages: { ...value.pages, deploymentOrigin }, mirror: { ...value.mirror }, d1: { ...value.d1, counts } }
}
export const releaseInventoryDigest = value => digest({
  repository: value.repository, sourceRevision: value.sourceRevision, protectedTipDigest: value.protectedTipDigest,
  convergenceBaseDigest: value.convergenceBaseDigest, captureAdapterId: value.captureAdapterId,
  capturedAt: value.capturedAt, observedAt: value.observedAt,
  successorWriteSetDigest: value.successorWriteSetDigest,
  entries: [...(value.entries || [])].sort((left, right) => collaborationKey(left.collaboration).localeCompare(collaborationKey(right.collaboration))),
  observations: [...(value.observations || [])].sort((left, right) => collaborationKey(left.collaboration).localeCompare(collaborationKey(right.collaboration))),
  sourceEvidenceRefs: [...(value.sourceEvidenceRefs || [])].sort((left, right) => left.kind.localeCompare(right.kind) || left.digest.localeCompare(right.digest)),
})
export const normalizeReleaseEvidence = (value, expected = {}) => {
  requireExact(value, ['schema', 'repository', 'sourceRevision', 'protectedTipDigest', 'convergenceBaseDigest', 'captureAdapterId',
    'capturedAt', 'observedAt', 'inventoryDigest', 'successorWriteSetDigest', 'entries', 'observations', 'rollbackIdentity',
    'rollbackCapturedAt', 'rollbackTargetDigest', 'sourceEvidenceRefs'], 'production release evidence')
  if (value.schema !== RELEASE_EVIDENCE_SCHEMA) throw new Error('production release evidence schema is invalid')
  requireText(value.repository, 'release evidence repository')
  requireSha(value.sourceRevision, 'release evidence sourceRevision')
  for (const field of ['protectedTipDigest', 'convergenceBaseDigest', 'inventoryDigest', 'successorWriteSetDigest', 'rollbackTargetDigest']) requireDigest(value[field], `release evidence ${field}`)
  requireText(value.captureAdapterId, 'release evidence captureAdapterId')
  requireInstant(value.capturedAt, 'release evidence capturedAt')
  requireInstant(value.observedAt, 'release evidence observedAt')
  requireInstant(value.rollbackCapturedAt, 'release evidence rollbackCapturedAt')
  if (Date.parse(value.observedAt) < Date.parse(value.capturedAt)) throw new Error('release evidence observation cannot predate capture')
  if (Date.parse(value.rollbackCapturedAt) > Date.parse(value.observedAt)) throw new Error('rollback identity capture cannot follow frontier observation')
  if (expected.repository && value.repository !== expected.repository) throw new Error('release evidence repository drifted from the reviewed source')
  if (expected.sourceRevision && value.sourceRevision !== expected.sourceRevision) throw new Error('release evidence source revision drifted from the reviewed source')
  if (!Array.isArray(value.entries) || value.entries.length !== 19) throw new Error('production release evidence must contain exactly 19 preservation entries')
  if (!Array.isArray(value.observations) || value.observations.length !== 19) throw new Error('production release evidence must contain exactly 19 retained observations')
  const entries = value.entries.map(normalizePreservationEntry)
    .sort((left, right) => collaborationKey(left.collaboration).localeCompare(collaborationKey(right.collaboration)))
  const observations = value.observations.map(normalizeObservation)
    .sort((left, right) => collaborationKey(left.collaboration).localeCompare(collaborationKey(right.collaboration)))
  const entryKeys = entries.map(entry => collaborationKey(entry.collaboration))
  if (new Set(entryKeys).size !== 19) throw new Error('preservation collaborations must be unique')
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const observation = observations[index]
    if (collaborationKey(observation.collaboration) !== collaborationKey(entry.collaboration)
        || observation.stateDigest !== entry.stateDigest || observation.recoveryHandle !== entry.recoveryHandle) {
      throw new Error('retained observation is unjoined from its exact preservation entry')
    }
  }
  if (!Array.isArray(value.sourceEvidenceRefs) || value.sourceEvidenceRefs.length === 0) throw new Error('release evidence must bind at least one authoritative source evidence reference')
  const sourceEvidenceRefs = value.sourceEvidenceRefs.map((reference, index) => {
    requireExact(reference, ['kind', 'digest'], `sourceEvidenceRefs[${index}]`)
    requireText(reference.kind, `sourceEvidenceRefs[${index}].kind`)
    requireDigest(reference.digest, `sourceEvidenceRefs[${index}].digest`)
    return { ...reference }
  }).sort((left, right) => left.kind.localeCompare(right.kind) || left.digest.localeCompare(right.digest))
  if (new Set(sourceEvidenceRefs.map(reference => `${reference.kind}\u0000${reference.digest}`)).size !== sourceEvidenceRefs.length) throw new Error('source evidence references must be unique')
  const rollbackIdentity = normalizeRollbackIdentity(value.rollbackIdentity)
  if (digest(rollbackIdentity) !== value.rollbackTargetDigest) throw new Error('rollbackTargetDigest does not bind the exact substantive rollback identity')
  const normalized = { ...value, entries, observations, rollbackIdentity, sourceEvidenceRefs }
  if (releaseInventoryDigest(normalized) !== value.inventoryDigest) throw new Error('release evidence inventoryDigest does not bind the exact 19-lane inventory')
  return normalized
}
const parseJsonBytes = (bytes, label) => {
  try { return JSON.parse(String(bytes)) } catch { throw new Error(`${label} is not valid JSON`) }
}
const assertSealed = (value, field, label) => {
  if (!value || typeof value !== 'object') throw new Error(`${label} is missing`)
  const { [field]: observed, ...core } = value
  requireDigest(observed, `${label} ${field}`)
  if (digest(core) !== observed) throw new Error(`${label} digest drifted`)
}
const sortedUnique = (values, label) => {
  const result = [...new Set(values.map(value => String(value)))].sort((left, right) => left.localeCompare(right))
  if (result.length !== values.length) throw new Error(`${label} contains duplicates`)
  return result
}
const sameValues = (left, right) => canonicalJson([...left].sort()) === canonicalJson([...right].sort())
const pathsOverlap = (left, right) => left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
const normalizeLaneWriteSet = (value, lane, sourceRevision) => {
  requireExact(value, ['schema', 'path', 'sourceRevision', 'mergeBaseRevision', 'laneHeadRevision', 'paths'], 'lane write set')
  if (value.schema !== 'knowgrph-preserved-lane-write-set/v1' || value.path !== lane.path
      || value.sourceRevision !== sourceRevision || value.laneHeadRevision !== lane.head) throw new Error(`lane write set drifted: ${lane.path}`)
  requireSha(value.mergeBaseRevision, 'lane write-set merge base')
  if (!Array.isArray(value.paths)) throw new Error('lane write-set paths must be an array')
  const paths = sortedUnique(value.paths, 'lane write-set paths')
  paths.forEach(item => requireText(item, 'lane write-set path'))
  return { ...value, paths }
}
const writerCollaboration = (lane, source) => {
  const lease = lane.lease
  if (!lease || lane.leaseAmbiguous || lease.worktreePath !== lane.path) throw new Error(`preserved writer lane has no exact lease record: ${lane.path}`)
  for (const [field, label] of [['device', 'device'], ['sessionId', 'session'], ['branch', 'branch'], ['scope', 'scope']]) requireText(lease[field], `writer lease ${label}`)
  if (!Number.isSafeInteger(lease.epoch) || lease.epoch < 1) throw new Error('writer lease epoch is invalid')
  requireSha(lease.fenceSha, 'writer lease fence')
  const recordDigest = digest(lease)
  const claim = source.cloudInventory?.claims?.find(item => item.claimId === lease.cloudAuthority?.claimId)
  return {
    actorId: claim?.actorId || `agentic-writer-lease-record:${recordDigest}`,
    deviceId: lease.device, sessionId: lease.sessionId, worktreeId: `active-worktree:v1:${recordDigest}`,
    branchId: lease.branch.startsWith('refs/heads/') ? lease.branch : `refs/heads/${lease.branch}`,
    scopeId: `writer-lease-record:${lease.scope}`, leaseEpoch: lease.epoch, fenceRevision: lease.fenceSha,
  }
}
const controllerCollaboration = (lane, selected, source, execution) => ({
  actorId: source.preservation.authenticatedActor.actorId, deviceId: source.candidate.deviceId,
  sessionId: source.preservation.sessionId, worktreeId: `dormant-worktree:v1:${digest({ sourceEvidenceDigest: source.sourceEvidenceDigest, selectionDigest: selected.selectionDigest, stateDigest: lane.stateDigest })}`,
  branchId: `refs/heads/${source.candidate.branch}`, scopeId: `dormant-controller:${selected.selectionDigest}`,
  leaseEpoch: execution.candidate.leaseEpoch, fenceRevision: execution.candidate.headSha,
})
export const createReleaseEvidenceFromSnapshot = ({
  journalBytes, inventoryBytes, manifestBytes, rollbackBytes, laneState, laneWriteSets,
  sourceRevision, sourceTree, capturedAt, observedAt, sourceEvidenceRefs = [], successorContained = false,
}) => {
  requireSha(sourceRevision, 'release source revision'); requireSha(sourceTree, 'release source tree')
  const journal = parseJsonBytes(journalBytes, 'dormant-admission journal')
  if (journal.schema !== 'agentic-dormant-preservation-admission-journal/v1' || journal.intent?.status !== 'complete') throw new Error('dormant-admission journal is not complete')
  const source = journal.intent.planSnapshot?.sourceEvidence
  const execution = journal.intent.phases?.admitted?.values?.executionEvidence
  const completion = journal.intent.phases?.complete?.values?.receipt
  assertSealed(source, 'sourceEvidenceDigest', 'dormant-admission source evidence')
  assertSealed(execution, 'evidenceDigest', 'dormant-admission execution evidence')
  assertSealed(completion, 'receiptDigest', 'dormant-admission completion receipt')
  if (source.schema !== 'agentic-dormant-preservation-admission-source-evidence/v1' || execution.status !== 'admitted'
      || completion.status !== 'admitted' || completion.sourceEvidenceDigest !== source.sourceEvidenceDigest) throw new Error('dormant-admission evidence is unjoined')
  const manifest = parseJsonBytes(manifestBytes, 'successor manifest')
  if (digest(manifestBytes) !== source.candidate.manifestFileDigest || manifest.semanticScope !== source.candidate.semanticScope
      || !sameValues(manifest.paths || [], source.candidate.manifest.paths || [])) throw new Error('successor write-scope manifest drifted from admission')
  const expected = source.canonical.existingLanes
  const preserved = expected.filter(item => item.path !== source.canonical.canonicalPath)
  const selected = new Map(source.preservation.selectedLanes.map(item => [item.path, item]))
  if (expected.length !== 20 || preserved.length !== 19 || selected.size !== 10) throw new Error('admission does not describe the exact 19-lane frontier')
  const liveByPath = new Map(laneState.lanes.map(item => [item.path, item]))
  const historicalPaths = expected.map(item => item.path), successor = liveByPath.get(source.candidate.targetPath)
  const exactFrontier = sameValues(liveByPath.keys(), historicalPaths)
    || sameValues(liveByPath.keys(), [...historicalPaths, source.candidate.targetPath])
  if (liveByPath.size !== laneState.lanes.length || !exactFrontier
      || laneState.canonicalBaseSha !== sourceRevision || laneState.canonicalSourceDisposition !== 'exact'
      || digest(laneState.lanes.map(({ path: lanePath, stateDigest }) => ({ path: lanePath, stateDigest })).sort((a, b) => a.path.localeCompare(b.path))) !== laneState.laneStateDigest) {
    throw new Error('current registered lane frontier is not one exact successor delta')
  }
  if (successor && (successor.dirty || successor.invalid || !successorContained)) throw new Error('completed successor is not clean and contained in protected source')
  const canonical = liveByPath.get(source.canonical.canonicalPath)
  if (canonical?.head !== sourceRevision || canonical.treeSha !== sourceTree || canonical.dirty || canonical.invalid) throw new Error('canonical protected main is not exact and clean')
  for (const item of preserved) if (liveByPath.get(item.path)?.stateDigest !== item.stateDigest) throw new Error(`preserved lane state drifted: ${item.path}`)
  const inventory = parseJsonBytes(inventoryBytes, 'release-frontier inventory')
  const inventoryByPath = new Map((inventory.lanes || []).map(item => [item.worktreePath, item]))
  if (inventory.schema !== 'agentic-release-frontier-inventory/v1' || inventoryByPath.size !== 19
      || !sameValues(inventoryByPath.keys(), preserved.map(item => item.path))) throw new Error('release-frontier inventory is not the exact 19 lanes')
  for (const item of preserved) {
    const lane = liveByPath.get(item.path), disposition = inventoryByPath.get(item.path)
    const retained = disposition.disposition === 'keep' || disposition.disposition === 'port' && disposition.status === 'fulfilled' && disposition.preservationAfterPort === 'keep'
    if (!retained || disposition.headSha !== lane.head || disposition.clean !== !lane.dirty) throw new Error(`release-frontier disposition drifted: ${item.path}`)
  }
  const writeSetByPath = new Map(laneWriteSets.map(item => [item.path, item]))
  if (writeSetByPath.size !== 19 || !sameValues(writeSetByPath.keys(), preserved.map(item => item.path))) throw new Error('lane write sets do not cover the exact 19 lanes')
  const normalizedWriteSets = [], entries = []
  for (const item of preserved) {
    const lane = liveByPath.get(item.path), writeSet = normalizeLaneWriteSet(writeSetByPath.get(item.path), lane, sourceRevision)
    normalizedWriteSets.push(writeSet)
    const dormant = selected.get(item.path)
    if (dormant && dormant.stateDigest !== item.stateDigest) throw new Error(`dormant controller state drifted: ${item.path}`)
    const collaboration = dormant ? controllerCollaboration(lane, dormant, source, execution) : writerCollaboration(lane, source)
    const writeSetDigest = digest(writeSet)
    const recoveryHandle = dormant
      ? `agentic-dormant-preservation:v1:${digest({ receiptDigest: completion.receiptDigest, selectionDigest: dormant.selectionDigest, path: lane.path, stateDigest: lane.stateDigest, writeSetDigest })}`
      : `agentic-active-worktree:v1:${digest({ path: lane.path, head: lane.head, tree: lane.treeSha, stateDigest: lane.stateDigest, writeSetDigest })}`
    entries.push({ collaboration, writeSetDigest, stateDigest: lane.stateDigest,
      recoveryHandle, preservationMode: dormant ? 'immutable-recovery-object' : 'active-lane',
      overlapClass: writeSet.paths.some(itemPath => manifest.paths.some(successorPath => pathsOverlap(itemPath, successorPath))) ? 'overlapping' : 'disjoint' })
  }
  const rollback = normalizeRollbackRecapture(parseJsonBytes(rollbackBytes, 'rollback recapture'))
  const refs = [...sourceEvidenceRefs,
    ['dormant-admission-journal', digest(journalBytes)], ['release-frontier-inventory', digest(inventoryBytes)],
    ['successor-write-scope-manifest', digest(manifestBytes)], ['rollback-recapture', digest(rollbackBytes)],
    ['writer-lease-registry-snapshot', laneState.registryDigest], ['release-frontier-lane-state', laneState.laneStateDigest],
    ['release-frontier-write-sets', digest(normalizedWriteSets.sort((a, b) => a.path.localeCompare(b.path)))],
    ['dormant-controller-source', digest({ revision: source.controller.headSha, tree: source.controller.treeSha })],
  ].map(reference => Array.isArray(reference) ? { kind: reference[0], digest: reference[1] } : reference)
  const evidence = { schema: RELEASE_EVIDENCE_SCHEMA, repository: source.canonical.targetRepository, sourceRevision,
    protectedTipDigest: digest({ sourceRevision, sourceTree }), convergenceBaseDigest: digest({ sourceRevision, sourceTree, ref: 'refs/heads/main' }),
    captureAdapterId: RELEASE_EVIDENCE_CAPTURE_ADAPTER, capturedAt, observedAt, inventoryDigest: '0'.repeat(64),
    successorWriteSetDigest: source.candidate.manifest.writeSetDigest, entries,
    observations: entries.map(entry => ({ collaboration: entry.collaboration, stateDigest: entry.stateDigest, recoveryHandle: entry.recoveryHandle, disposition: 'retained' })),
    rollbackIdentity: rollback.rollbackIdentity, rollbackCapturedAt: rollback.capturedAt,
    rollbackTargetDigest: digest(rollback.rollbackIdentity), sourceEvidenceRefs: refs }
  requireDigest(evidence.successorWriteSetDigest, 'successor write-set digest')
  evidence.inventoryDigest = releaseInventoryDigest(evidence)
  return normalizeReleaseEvidence(evidence, { repository: source.canonical.targetRepository, sourceRevision })
}
const runGitRead = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
const proveAncestor = (git, cwd, ancestor, descendant) => { git(cwd, ['merge-base', '--is-ancestor', ancestor, descendant]); return true }
const nullList = value => String(value).split('\0').filter(Boolean)
const captureWriteSet = (lane, sourceRevision, git) => {
  const mergeBaseRevision = git(lane.path, ['merge-base', sourceRevision, lane.head]).trim()
  const committed = nullList(git(lane.path, ['diff', '--name-only', '-z', mergeBaseRevision, lane.head]))
  const working = nullList(git(lane.path, ['ls-files', '--modified', '--deleted', '--others', '--exclude-standard', '-z']))
  return { schema: 'knowgrph-preserved-lane-write-set/v1', path: lane.path, sourceRevision, mergeBaseRevision,
    laneHeadRevision: lane.head, paths: [...new Set([...committed, ...working])].sort((a, b) => a.localeCompare(b)) }
}
export const materializeReleaseEvidence = async ({
  repository, controllerRoot, journalBytes, inventoryBytes, manifestBytes, rollbackBytes,
  sourceRevision, sourceTree, sourceEvidenceRefs = [], collectLaneState, git = runGitRead,
  clock = () => new Date().toISOString(), writeSetCapture = captureWriteSet,
}) => {
  const journal = parseJsonBytes(journalBytes, 'dormant-admission journal'), controller = journal.intent?.planSnapshot?.sourceEvidence?.controller
  const resolvedController = path.resolve(controllerRoot || controller?.path || '')
  const controllerHead = git(resolvedController, ['rev-parse', 'HEAD']).trim()
  const controllerTree = git(resolvedController, ['rev-parse', 'HEAD^{tree}']).trim()
  const trackingHead = git(resolvedController, ['rev-parse', 'refs/remotes/origin/main']).trim()
  const remoteHead = git(resolvedController, ['ls-remote', '--exit-code', 'origin', 'refs/heads/main']).trim().split(/\s+/u)[0]
  git(resolvedController, ['cat-file', '-e', `${controller?.headSha}^{commit}`])
  if (git(resolvedController, ['rev-parse', `${controller?.headSha}^{tree}`]).trim() !== controller?.treeSha
      || !proveAncestor(git, resolvedController, controller.headSha, controllerHead)
      || controllerHead !== trackingHead || controllerHead !== remoteHead
      || git(resolvedController, ['status', '--porcelain']).trim()) throw new Error('current protected controller is not clean, remote-exact, or descended from completed admission source')
  const collect = collectLaneState || (await import(pathToFileURL(path.join(resolvedController, 'scripts/scoped-lane-admission-state.mjs')).href)).collectScopedLaneState
  const capturedAt = clock(), first = collect({ repository: path.resolve(repository) })
  const expectedPaths = new Set(journal.intent.planSnapshot.sourceEvidence.canonical.existingLanes
    .filter(item => item.path !== journal.intent.planSnapshot.sourceEvidence.canonical.canonicalPath).map(item => item.path))
  const laneWriteSets = first.lanes.filter(lane => expectedPaths.has(lane.path)).map(lane => writeSetCapture(lane, sourceRevision, git))
  const successor = first.lanes.find(lane => lane.path === journal.intent.planSnapshot.sourceEvidence.candidate.targetPath)
  const successorContained = successor ? proveAncestor(git, path.resolve(repository), successor.head, sourceRevision) : false
  const second = collect({ repository: path.resolve(repository) }), observedAt = clock()
  const fence = value => ({ canonicalBaseSha: value.canonicalBaseSha, canonicalSourceDisposition: value.canonicalSourceDisposition,
    laneStateDigest: value.laneStateDigest, registryDigest: value.registryDigest })
  if (canonicalJson(fence(first)) !== canonicalJson(fence(second))) throw new Error('registered lanes, leases, or bytes changed during release-frontier capture')
  return createReleaseEvidenceFromSnapshot({ journalBytes, inventoryBytes, manifestBytes, rollbackBytes,
    laneState: second, laneWriteSets, sourceRevision, sourceTree, capturedAt, observedAt, successorContained,
    sourceEvidenceRefs: [...sourceEvidenceRefs, { kind: 'current-dormant-controller-source', digest: digest({ revision: controllerHead, tree: controllerTree }) }] })
}
export const normalizeRollbackRecapture = value => {
  requireExact(value, ['schema', 'rollbackIdentity', 'capturedAt'], 'rollback recapture')
  if (value.schema !== ROLLBACK_RECAPTURE_SCHEMA) throw new Error('rollback recapture schema is invalid')
  requireInstant(value.capturedAt, 'rollback recapture capturedAt')
  return { schema: value.schema, rollbackIdentity: normalizeRollbackIdentity(value.rollbackIdentity), capturedAt: value.capturedAt }
}
export const normalizeDeploymentCapture = value => {
  requireExact(value, ['schema', 'status', 'adapterId', 'deploymentId', 'deploymentOrigin', 'sourceRevision', 'deployedAt', 'capturedAt'], 'Pages deployment capture')
  if (value.schema !== DEPLOYMENT_CAPTURE_SCHEMA) throw new Error('Pages deployment capture schema is invalid')
  if (value.status !== 'deployed' || value.adapterId !== PAGES_API_ADAPTER) throw new Error('Pages deployment capture is not an authoritative canonical deployment observation')
  requireText(value.deploymentId, 'Pages deployment capture deploymentId')
  const deploymentOrigin = requireHttpsOrigin(value.deploymentOrigin, 'Pages deployment capture deploymentOrigin')
  requireSha(value.sourceRevision, 'Pages deployment capture sourceRevision')
  requireInstant(value.deployedAt, 'Pages deployment capture deployedAt')
  requireInstant(value.capturedAt, 'Pages deployment capture capturedAt')
  if (Date.parse(value.capturedAt) < Date.parse(value.deployedAt)) throw new Error('Pages deployment observation cannot predate deployment completion')
  return { ...value, deploymentOrigin }
}
const parseNdjson = bytes => String(bytes).split(/\r?\n/u).filter(line => line.trim()).map((line, index) => {
  try { return JSON.parse(line) } catch { throw new Error(`Wrangler output line ${index + 1} is not JSON`) }
})
export const parseWranglerPagesDeployment = ({ bytes, deploymentCapture, sourceRevision }) => {
  const capture = normalizeDeploymentCapture(deploymentCapture)
  if (capture.sourceRevision !== sourceRevision) throw new Error('Pages deployment capture source revision drifted')
  let records = []
  try { records = parseNdjson(bytes) } catch { return deploymentResultFromCapture(capture) }
  const simple = records.filter(record => record?.type === 'pages-deploy' && record?.version === 1)
  const detailed = records.filter(record => record?.type === 'pages-deploy-detailed' && record?.version === 1)
  if (simple.length === 0 || detailed.length === 0) return deploymentResultFromCapture(capture)
  if (simple.length !== 1 || detailed.length !== 1) throw new Error('Wrangler Pages deployment evidence is ambiguous')
  const [summary] = simple
  const [detail] = detailed
  if (
    summary.pages_project !== detail.pages_project
    || summary.deployment_id !== detail.deployment_id
    || requireHttpsOrigin(summary.url, 'Wrangler Pages deployment URL') !== requireHttpsOrigin(detail.url, 'Wrangler detailed Pages deployment URL')
    || detail.environment !== 'production'
    || detail.production_branch !== 'main'
    || detail.deployment_trigger?.metadata?.commit_hash !== sourceRevision
    || capture.deploymentId !== detail.deployment_id
    || capture.deploymentOrigin !== requireHttpsOrigin(detail.url, 'Wrangler detailed Pages deployment URL')
  ) throw new Error('Wrangler Pages deployment evidence is internally unjoined or drifted')
  return { deploymentAdapterId: 'cloudflare-pages/wrangler-output-v1', immutableDeploymentId: detail.deployment_id,
    immutableDeploymentOrigin: capture.deploymentOrigin, deployedAt: capture.deployedAt }
}
const deploymentResultFromCapture = capture => ({ deploymentAdapterId: capture.adapterId,
  immutableDeploymentId: capture.deploymentId, immutableDeploymentOrigin: capture.deploymentOrigin, deployedAt: capture.deployedAt })

export const normalizeD1ReconciliationEvidence = value => {
  requireExact(value, [
    'schema', 'workspaceId', 'stateContractDigest', 'operationsDigest', 'operationCount',
    'operationLimit', 'readbackAdapterId', 'readbackKind', 'readbackDigest',
    'expectedCounts', 'observedCounts', 'pathHashParity', 'contentParity', 'reconciledAt',
  ], 'D1 reconciliation evidence')
  if (value.schema !== D1_RECONCILIATION_EVIDENCE_SCHEMA) throw new Error('D1 reconciliation evidence schema is invalid')
  requireText(value.workspaceId, 'D1 workspaceId')
  for (const field of ['stateContractDigest', 'operationsDigest', 'readbackDigest']) {
    requireDigest(value[field], `D1 ${field}`)
  }
  if (!Number.isSafeInteger(value.operationCount) || value.operationCount < 0) {
    throw new Error('D1 operationCount must be a non-negative integer')
  }
  if (!Number.isSafeInteger(value.operationLimit) || value.operationLimit < 1 || value.operationLimit > 10_000) {
    throw new Error('D1 operationLimit must be between 1 and 10000')
  }
  if (value.operationCount > value.operationLimit) throw new Error('D1 operation count exceeds its limit')
  if (value.readbackAdapterId !== 'cloudflare-wrangler-d1-direct-readback/v1') {
    throw new Error('D1 readback adapter is not the repository-owned direct Wrangler adapter')
  }
  if (value.readbackKind !== 'direct-authoritative') throw new Error('D1 readback must be direct-authoritative')
  const expectedCounts = normalizeCounts(value.expectedCounts, 'D1 expectedCounts')
  const observedCounts = normalizeCounts(value.observedCounts, 'D1 observedCounts')
  if (canonicalJson(expectedCounts) !== canonicalJson(observedCounts)) throw new Error('D1 direct readback counts drifted')
  if (value.pathHashParity !== true || value.contentParity !== true) throw new Error('D1 state parity must be exact')
  requireInstant(value.reconciledAt, 'D1 reconciledAt')
  return { ...value, expectedCounts, observedCounts }
}

const normalizeRollbackState = (value, lastKnownGood) => {
  const reconciliation = value?.schema === D1_RECONCILIATION_EVIDENCE_SCHEMA
  if (reconciliation) normalizeD1ReconciliationEvidence(value)
  else {
    requireExact(value, ['schema', 'workspaceId', 'readbackAdapterId', 'readbackKind', 'stateContractDigest', 'readbackDigest', 'observedCounts', 'capturedAt'], 'D1 state snapshot')
    if (value.schema !== D1_SNAPSHOT_SCHEMA) throw new Error('restored D1 evidence schema is invalid')
    requireText(value.workspaceId, 'D1 workspaceId')
    requireDigest(value.stateContractDigest, 'D1 stateContractDigest')
    requireDigest(value.readbackDigest, 'D1 readbackDigest')
    normalizeCounts(value.observedCounts, 'D1 observedCounts')
    if (value.readbackAdapterId !== 'cloudflare-wrangler-d1-direct-readback/v1' || value.readbackKind !== 'direct-authoritative') {
      throw new Error('restored D1 evidence is not direct-authoritative')
    }
    requireInstant(value.capturedAt, 'D1 capturedAt')
  }
  const counts = value.observedCounts
  if (value.stateContractDigest !== lastKnownGood.stateContractDigest || value.readbackDigest !== lastKnownGood.readbackDigest || canonicalJson(counts) !== canonicalJson(lastKnownGood.counts)) {
    throw new Error('restored D1 state contract, readback, or counts drifted from last-known-good')
  }
  const disposition = reconciliation ? 'restored' : 'retained-compatible'
  const observedAt = reconciliation ? value.reconciledAt : value.capturedAt
  return {
    disposition,
    observedAt,
    dispositionDigest: digest({
      schema: 'knowgrph-production-rollback-state-disposition/v1',
      disposition,
      lastKnownGood: { stateContractDigest: lastKnownGood.stateContractDigest, readbackDigest: lastKnownGood.readbackDigest, counts: lastKnownGood.counts },
      observed: {
        stateContractDigest: value.stateContractDigest,
        readbackDigest: value.readbackDigest,
        counts,
        readbackAdapterId: value.readbackAdapterId,
        readbackKind: value.readbackKind,
        observedAt,
      },
    }),
  }
}

export const createRollbackEvidenceInput = ({
  releaseEvidence, failureObservation, restoredPages, restoredState, restoredTransports, observedMirror, rolledBackAt,
}) => {
  const frontier = normalizeReleaseEvidence(releaseEvidence)
  requireExact(failureObservation, ['schema', 'failedStage', 'messageDigest', 'observedAt'], 'release failure observation')
  if (failureObservation.schema !== FAILURE_OBSERVATION_SCHEMA || !ROLLBACK_STAGES.includes(failureObservation.failedStage)) {
    throw new Error('release failure observation schema or failedStage is invalid')
  }
  requireDigest(failureObservation.messageDigest, 'failure messageDigest')
  requireInstant(failureObservation.observedAt, 'failure observedAt')
  requireExact(restoredPages, ['schema', 'status', 'adapterId', 'canonicalDeployment', 'capturedAt'], 'restored Pages evidence')
  if (restoredPages.schema !== RESTORED_PAGES_SCHEMA || restoredPages.status !== 'restored' || restoredPages.adapterId !== PAGES_API_ADAPTER) {
    throw new Error('restored Pages evidence is not an authoritative canonical observation')
  }
  requireExact(restoredPages.canonicalDeployment, ['deploymentId', 'deploymentOrigin', 'deploymentCommitRevision', 'sourceRevision', 'deployedAt'], 'restored canonical Pages deployment')
  const pages = { ...restoredPages.canonicalDeployment, deploymentOrigin: requireHttpsOrigin(restoredPages.canonicalDeployment.deploymentOrigin, 'restored Pages origin') }
  requireText(pages.deploymentId, 'restored Pages deploymentId')
  requireSha(pages.deploymentCommitRevision, 'restored Pages deploymentCommitRevision')
  requireSha(pages.sourceRevision, 'restored Pages sourceRevision')
  requireInstant(pages.deployedAt, 'restored Pages deployedAt')
  requireInstant(restoredPages.capturedAt, 'restored Pages capturedAt')
  const expectedPages = frontier.rollbackIdentity.pages
  for (const field of ['deploymentId', 'deploymentOrigin', 'deploymentCommitRevision', 'sourceRevision']) {
    if (pages[field] !== expectedPages[field]) throw new Error(`restored Pages ${field} drifted from last-known-good`)
  }
  if (Date.parse(restoredPages.capturedAt) < Date.parse(pages.deployedAt)) throw new Error('restored Pages capture predates deployment')
  const state = normalizeRollbackState(restoredState, frontier.rollbackIdentity.d1)
  validateTransportEvidence({ evidence: restoredTransports, sourceRevision: expectedPages.sourceRevision, manifestDigest: restoredTransports?.immutableManifestDigest })
  requireInstant(restoredTransports.verifiedAt, 'restored transport verifiedAt')
  if (restoredTransports.transports[0].origin !== expectedPages.deploymentOrigin) throw new Error('restored immutable transport is not last-known-good Pages')
  requireExact(observedMirror, ['schema', 'repository', 'revision', 'sourceRevision', 'observedAt'], 'observed mirror identity')
  if (observedMirror.schema !== OBSERVED_MIRROR_SCHEMA) throw new Error('observed mirror identity schema is invalid')
  requireSha(observedMirror.revision, 'observed mirror revision')
  requireSha(observedMirror.sourceRevision, 'observed mirror sourceRevision')
  requireInstant(observedMirror.observedAt, 'observed mirror observedAt')
  const expectedMirror = { ...frontier.rollbackIdentity.mirror, sourceRevision: expectedPages.sourceRevision }
  const actualMirror = { repository: observedMirror.repository, revision: observedMirror.revision, sourceRevision: observedMirror.sourceRevision }
  if (canonicalJson(expectedMirror) !== canonicalJson(actualMirror)) throw new Error('observed mirror drifted from last-known-good')
  requireInstant(rolledBackAt, 'rollback completion time')
  const observedTimes = [failureObservation.observedAt, restoredPages.capturedAt, state.observedAt, restoredTransports.verifiedAt, observedMirror.observedAt]
  if (observedTimes.some(value => Date.parse(value) > Date.parse(rolledBackAt))) throw new Error('rollback completion predates authoritative rollback evidence')
  return {
    failedStage: failureObservation.failedStage,
    failureDigest: failureObservation.messageDigest,
    lastKnownGoodIdentityDigest: frontier.rollbackTargetDigest,
    restoredDeploymentIdentityDigest: frontier.rollbackTargetDigest,
    stateDisposition: state.disposition,
    stateDispositionDigest: state.dispositionDigest,
    restoredProbesDigest: digest(restoredTransports),
    mirrorDisposition: 'unchanged-last-known-good',
    lastKnownGoodMirrorIdentityDigest: digest(expectedMirror),
    observedMirrorIdentityDigest: digest(actualMirror),
    terminalResult: 'restored-last-known-good',
    rolledBackAt,
  }
}

export const evidenceFileDigest = filePath => digest(fs.readFileSync(path.resolve(filePath)))

export const readEvidenceBytes = filePath => fs.readFileSync(path.resolve(filePath))

export const createLiveEvidenceInput = ({
  deployment,
  state,
  sourceRevision,
  immutableOriginSmoke,
  publicRouteProbes,
  browserFidelity,
  clientCacheConvergence,
  markerParity,
  verifiedAt,
}) => {
  requireSha(sourceRevision, 'live source revision')
  requireInstant(verifiedAt, 'live verifiedAt')
  const marker = JSON.parse(markerParity.toString('utf8'))
  if (marker?.markerBytesParity !== true || marker?.status !== 'passed' || marker?.sourceRevision !== sourceRevision) {
    throw new Error('live marker parity evidence is not an exact passed source observation')
  }
  const immutableOriginProbesDigest = digest(immutableOriginSmoke)
  const publicRouteProbesDigest = digest(publicRouteProbes)
  const browserFidelityDigest = digest(browserFidelity)
  const clientCacheConvergenceDigest = digest(clientCacheConvergence)
  const markerParityDigest = digest(markerParity)
  return {
    observedRuntimeDigest: digest({
      sourceRevision,
      deploymentReceiptDigest: deployment.receiptDigest,
      stateReconciliationReceiptDigest: state.receiptDigest,
      immutableOriginProbesDigest,
      publicRouteProbesDigest,
      browserFidelityDigest,
      clientCacheConvergenceDigest,
      markerParityDigest,
    }),
    immutableOriginProbesDigest,
    publicRouteProbesDigest,
    browserFidelityDigest,
    clientCacheConvergenceDigest,
    markerParityDigest,
    markerBytesParity: true,
    verifiedAt,
  }
}

const receiptFiles = ['overlap-preservation-receipt.json', 'overlap-disposition-receipt.json', 'integration-receipt.json', 'runtime-review-receipt.json', 'candidate-manifest.json', 'authorization-interaction-receipt.json', 'human-authorization-receipt.json', 'consumed-human-authorization-receipt.json', 'deployment-receipt.json', 'state-reconciliation-receipt.json', 'live-verification-receipt-v2.json', 'publication-receipt-v2.json']
const schemasInOrder = ['agentic-overlap-preservation-receipt/v1', 'agentic-overlap-disposition-receipt/v1', 'agentic-integration-receipt/v2', 'agentic-runtime-review-receipt/v1', 'agentic-candidate-manifest/v1', 'agentic-authorization-interaction-receipt/v1', 'agentic-human-authorization-receipt/v2', 'agentic-human-authorization-receipt/v2', 'agentic-deployment-receipt/v1', 'agentic-state-reconciliation-receipt/v1', 'agentic-live-verification-receipt/v2', 'agentic-publication-receipt/v2']
const constructors = [
  ['createOverlapPreservationReceipt', [], ['convergenceBaseDigest', 'protectedTipDigest', 'captureAdapterId', 'entries', 'capturedAt']],
  ['createOverlapDispositionReceipt', [0], ['preservationReceiptDigest', 'convergenceBaseDigest', 'protectedTipDigest', 'observations', 'observedAt']],
  ['createIntegrationReceipt', [0, 1], ['sourceRevision', 'sourceDigest', 'dependencyClosureDigest', 'checksDigest', 'evaluatorId', 'collaboration', 'integrationTargetDigest', 'integratedAt']],
  ['createRuntimeReviewReceipt', [2], ['reviewSurfaceDigest', 'policyDigest', 'probesDigest', 'reviewerId', 'issuedAt', 'expiresAt']],
  ['createCandidateManifest', [3], ['targetDigest', 'artifactDigest', 'manifestDigest', 'rollbackTargetDigest', 'builtAt']],
  ['createAuthorizationInteractionReceipt', [4], ['humanActorId', 'interactionAdapterId', 'transportClass', 'browserRequired', 'challengeDigest', 'responseDigest', 'recordedAt']],
  ['createHumanAuthorizationReceipt', [4, 5], ['decisionKind', 'humanActorId', 'decisionRef', 'authorityAdapterId', 'issuedAt', 'expiresAt']],
  ['consumeHumanAuthorizationReceipt', [6], ['consumedAt', 'controllerId']],
  ['createDeploymentReceipt', [4, 7], ['deploymentAdapterId', 'deployedArtifactDigest', 'immutableDeploymentId', 'immutableDeploymentOrigin', 'rollbackTargetDigest', 'deployedAt']],
  ['createStateReconciliationReceipt', [8], ['stateContractDigest', 'operationsDigest', 'operationCount', 'operationLimit', 'readbackAdapterId', 'readbackKind', 'readbackDigest', 'expectedCounts', 'observedCounts', 'pathHashParity', 'contentParity', 'reconciledAt']],
  ['createLiveVerificationReceiptV2', [8, 9], ['observedRuntimeDigest', 'immutableOriginProbesDigest', 'publicRouteProbesDigest', 'browserFidelityDigest', 'clientCacheConvergenceDigest', 'markerParityDigest', 'markerBytesParity', 'verifiedAt']],
  ['createPublicationReceiptV2', [10], ['publicationIdentitiesDigest', 'publishedAt']],
]
const readReceiptFiles = (receiptDir, files) => files.map(file => JSON.parse(fs.readFileSync(path.join(path.resolve(receiptDir), file), 'utf8')))
export const readProductionCompleteReceipts = receiptDir => readReceiptFiles(receiptDir, receiptFiles)
export const readRolledBackReceipts = receiptDir => {
  const rollback = readReceiptFiles(receiptDir, ['rollback-receipt.json'])[0]
  const length = ['deployment', 'state-reconciliation'].includes(rollback.failedStage) ? 9 : rollback.failedStage === 'live-verification' ? 10 : 11
  return [...readReceiptFiles(receiptDir, receiptFiles.slice(0, length)), rollback]
}
const pick = (value, fields) => Object.fromEntries(fields.map(field => [field, value[field]]))
const assertRebuilt = (contract, receipts, index) => {
  const [method, dependencies, fields] = constructors[index]
  const rebuilt = contract[method](...dependencies.map(dependency => receipts[dependency]), pick(receipts[index], fields))
  if (canonicalJson(receipts[index]) !== canonicalJson(rebuilt)) throw new Error(`${receipts[index].schema} failed constructor-level reconstruction`)
}
export const validateTerminalCarrier = ({ contract, schemas, Ajv2020, carrier }) => {
  requireExact(carrier, ['schema', 'completion', 'receipts'], 'production lifecycle carrier')
  if (carrier.schema !== LIFECYCLE_V2_SCHEMA || !['production-complete', 'rolled-back'].includes(carrier.completion)) throw new Error('production lifecycle carrier is not terminal v2')
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  ajv.addFormat('date-time', { type: 'string', validate: value => !Number.isNaN(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value })
  ajv.addSchema(schemas.v1)
  const validate = ajv.compile(schemas.v2)
  if (!validate(carrier)) throw new Error(`collaborative release lifecycle v2 schema validation failed: ${(validate.errors || []).map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')}`)
  const rollback = carrier.completion === 'rolled-back' ? carrier.receipts.at(-1) : null
  const prefixLength = !rollback ? 12 : ['deployment', 'state-reconciliation'].includes(rollback.failedStage) ? 9 : rollback.failedStage === 'live-verification' ? 10 : 11
  const expected = [...schemasInOrder.slice(0, prefixLength), ...(rollback ? ['agentic-rollback-receipt/v1'] : [])]
  if (carrier.receipts.length !== expected.length || carrier.receipts.some((receipt, index) => receipt.schema !== expected[index])) throw new Error('production lifecycle receipts are not in exact causal order')
  for (let index = 0; index < prefixLength; index += 1) assertRebuilt(contract, carrier.receipts, index)
  if (rollback) {
    const rebuilt = contract.createRollbackReceipt(carrier.receipts[8], pick(rollback, ['failedStage', 'failureDigest', 'lastKnownGoodIdentityDigest', 'restoredDeploymentIdentityDigest', 'stateDisposition', 'stateDispositionDigest', 'restoredProbesDigest', 'mirrorDisposition', 'lastKnownGoodMirrorIdentityDigest', 'observedMirrorIdentityDigest', 'terminalResult', 'rolledBackAt']))
    if (canonicalJson(rollback) !== canonicalJson(rebuilt)) throw new Error('rollback failed constructor-level reconstruction')
  }
  return carrier
}
export const validateProductionCompleteCarrier = args => validateTerminalCarrier(args)
const createCarrier = ({ contract, schemas, Ajv2020, receipts, completion }) => validateTerminalCarrier({ contract, schemas, Ajv2020, carrier: { schema: LIFECYCLE_V2_SCHEMA, completion, receipts } })
export const createProductionCompleteCarrier = args => createCarrier({ ...args, completion: 'production-complete' })
export const createRolledBackCarrier = args => createCarrier({ ...args, completion: 'rolled-back' })
