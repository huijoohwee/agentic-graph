import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { XR_V2_LEGACY_MIRROR_RELATIVE_PATHS } from './xr-v2/production-publish-contract.mjs'

export const productionMirrorArtifactManifestName = '.agenticgraph-production-artifact-manifest.json'
export const productionMirrorArtifactEntries = [
  '404.html',
  'content/agenticgraph',
  'agenticgraph',
  'functions',
  'canvas',
  'contracts',
  'grph-shared',
  '_worker.js',
  '_routes.json',
  '_headers',
  '_redirects',
  '.well-known/runtime-readiness.json',
]
const productionMirrorArtifactDeletionEntries = new Set([
  'index.html',
  ...XR_V2_LEGACY_MIRROR_RELATIVE_PATHS,
])
const manifestSchema = 'agenticgraph-production-mirror-artifact/v1'
export const CANONICAL_DESCENDANT_MIRROR_PROOF_SCHEMA = 'agenticgraph-canonical-descendant-mirror-proof/v1'
export const canonicalDescendantMirrorOptionNames = Object.freeze(['previous-rollback-recapture', 'mirror-repository-root', 'mirror-remote-ref', 'mirror-protected-pr', 'gamexr-source-sha', 'gamexr-artifact-digest'])
const canonicalDescendantIdentity = Object.freeze({
  baseRevision: '12884a1fc526e3366f6b858240fda1892b7c4fa3',
  descendantRevision: '1e184aed1f638c07ed7fdaa67e610c23e5eb09b6',
  protectedPullRequestNumber: 54,
  gamexrSourceRevision: '718298dec9928f30bd24e349a7527aba2c85bfb1',
  gamexrArtifactDigest: 'aa11a21680b1b16951912cc6b2e544127fc7d4a1e4738228686357657bd1e62e',
})
const exactRevisionPattern = /^[0-9a-f]{40}$/
const exactDigestPattern = /^[0-9a-f]{64}$/
const isolatedGitEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
)

const assertSafeRoot = (root, label) => {
  const resolved = path.resolve(root)
  if (resolved === path.parse(resolved).root) throw new Error(`${label} cannot be a filesystem root`)
  return resolved
}

const normalizeRelativePath = value => {
  const normalized = String(value || '').replaceAll('\\', '/')
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) {
    throw new Error(`Invalid artifact-relative path: ${JSON.stringify(value)}`)
  }
  const parts = normalized.split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe artifact-relative path: ${JSON.stringify(value)}`)
  }
  return normalized
}

const resolveWithin = (root, relativePath) => {
  const normalized = normalizeRelativePath(relativePath)
  const resolved = path.resolve(root, ...normalized.split('/'))
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Artifact path escapes its root: ${relativePath}`)
  }
  return resolved
}

const isManagedPath = relativePath => productionMirrorArtifactEntries
  .some(entry => relativePath === entry || relativePath.startsWith(`${entry}/`))
  || productionMirrorArtifactDeletionEntries.has(relativePath)

const readGitText = (root, args) => execFileSync('git', args, {
  cwd: root,
  encoding: 'utf8',
  env: isolatedGitEnvironment,
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim()

const readGitBuffer = (root, args) => execFileSync('git', args, {
  cwd: root,
  encoding: 'buffer',
  env: isolatedGitEnvironment,
  stdio: ['ignore', 'pipe', 'pipe'],
})

const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const digestValue = value => createHash('sha256').update(
  typeof value === 'string' || Buffer.isBuffer(value) ? value : canonicalJson(value),
).digest('hex')

const requireExactRevision = (value, label) => {
  if (!exactRevisionPattern.test(String(value || ''))) throw new Error(`${label} must be an exact Git SHA`)
  return value
}

const requireExactDigest = (value, label) => {
  if (!exactDigestPattern.test(String(value || ''))) throw new Error(`${label} must be a SHA-256 digest`)
  return value
}

const requireExactFields = (value, fields, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  const actual = Object.keys(value).sort(), expected = [...fields].sort()
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new Error(`${label} contains missing or unknown fields`)
  }
}

const requireText = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be non-empty`)
  return value
}

const requireExactInstant = (value, label) => {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN
  if (Number.isNaN(parsed) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    throw new Error(`${label} must be an exact ISO timestamp`)
  }
  return new Date(parsed).toISOString()
}

const normalizeGitRelativePath = value => {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\') || value.includes('\0')) {
    throw new Error(`Git diff contains a noncanonical path: ${JSON.stringify(value)}`)
  }
  const parts = value.split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Git diff contains an unsafe path: ${JSON.stringify(value)}`)
  }
  return value
}

const parseNulTerminatedGitPaths = output => {
  const records = []
  let start = 0
  for (let index = 0; index < output.length; index += 1) {
    if (output[index] !== 0) continue
    const bytes = output.subarray(start, index)
    start = index + 1
    if (bytes.length === 0) continue
    const decoded = bytes.toString('utf8')
    if (!Buffer.from(decoded, 'utf8').equals(bytes)) throw new Error('Git diff path is not valid UTF-8')
    records.push(normalizeGitRelativePath(decoded))
  }
  if (start !== output.length) throw new Error('Git diff path inventory is not NUL-terminated')
  return records
}

const normalizeCanonicalDescendantMirrorProof = value => {
  requireExactFields(value, ['schema', 'repository', 'baseRevision', 'descendantRevision', 'remoteRevision',
    'changedPaths', 'protectedPullRequest', 'gamexrArtifact', 'proofDigest'], 'canonical descendant mirror proof')
  if (value.schema !== CANONICAL_DESCENDANT_MIRROR_PROOF_SCHEMA) throw new Error('canonical descendant mirror proof schema is invalid')
  requireText(value.repository, 'canonical descendant mirror repository')
  for (const field of ['baseRevision', 'descendantRevision', 'remoteRevision']) requireExactRevision(value[field], `canonical descendant mirror ${field}`)
  if (value.baseRevision === value.descendantRevision || value.remoteRevision !== value.descendantRevision) {
    throw new Error('canonical descendant mirror proof does not bind a remote-exact descendant')
  }
  if (!Array.isArray(value.changedPaths) || value.changedPaths.length === 0) throw new Error('canonical descendant mirror proof requires changed paths')
  const changedPaths = value.changedPaths.map(normalizeGitRelativePath)
  const ordered = [...changedPaths].sort((left, right) => left.localeCompare(right))
  if (new Set(changedPaths).size !== changedPaths.length || canonicalJson(changedPaths) !== canonicalJson(ordered)
      || !changedPaths.includes('content/gamexr/release-manifest.json')
      || changedPaths.some(relativePath => !relativePath.startsWith('content/gamexr/'))) {
    throw new Error('canonical descendant mirror changed paths are incomplete, duplicated, unordered, or outside GameXR')
  }
  requireExactFields(value.protectedPullRequest,
    ['number', 'url', 'state', 'baseRefName', 'headRefName', 'headRefOid', 'mergeRevision', 'mergedAt'],
    'canonical descendant mirror protected pull request')
  const pullRequest = { ...value.protectedPullRequest }
  if (!Number.isSafeInteger(pullRequest.number) || pullRequest.number < 1 || pullRequest.state !== 'MERGED'
      || pullRequest.baseRefName !== 'main') throw new Error('canonical descendant mirror protected pull request is not merged to main')
  requireText(pullRequest.headRefName, 'canonical descendant mirror pull request headRefName')
  requireExactRevision(pullRequest.headRefOid, 'canonical descendant mirror pull request headRefOid')
  requireExactRevision(pullRequest.mergeRevision, 'canonical descendant mirror pull request mergeRevision')
  pullRequest.mergedAt = requireExactInstant(pullRequest.mergedAt, 'canonical descendant mirror pull request mergedAt')
  if (pullRequest.mergeRevision !== value.descendantRevision
      || pullRequest.url !== `https://github.com/${value.repository}/pull/${pullRequest.number}`) {
    throw new Error('canonical descendant mirror protected pull request identity drifted')
  }
  requireExactFields(value.gamexrArtifact, ['root', 'sourceRevision', 'artifactDigest', 'manifestDigest'],
    'canonical descendant mirror GameXR artifact')
  if (value.gamexrArtifact.root !== 'content/gamexr') throw new Error('canonical descendant mirror GameXR artifact root is invalid')
  requireExactRevision(value.gamexrArtifact.sourceRevision, 'canonical descendant mirror GameXR sourceRevision')
  requireExactDigest(value.gamexrArtifact.artifactDigest, 'canonical descendant mirror GameXR artifactDigest')
  requireExactDigest(value.gamexrArtifact.manifestDigest, 'canonical descendant mirror GameXR manifestDigest')
  requireExactDigest(value.proofDigest, 'canonical descendant mirror proofDigest')
  const proof = { schema: value.schema, repository: value.repository, baseRevision: value.baseRevision,
    descendantRevision: value.descendantRevision, remoteRevision: value.remoteRevision, changedPaths,
    protectedPullRequest: pullRequest, gamexrArtifact: { ...value.gamexrArtifact } }
  if (digestValue(proof) !== value.proofDigest) throw new Error('canonical descendant mirror proofDigest drifted')
  return { ...proof, proofDigest: value.proofDigest }
}

const normalizePriorRollbackRecapture = value => {
  requireExactFields(value, ['schema', 'rollbackIdentity', 'capturedAt'], 'previous rollback recapture')
  if (value.schema !== 'agenticgraph-production-rollback-recapture/v1') throw new Error('previous rollback recapture schema is invalid')
  const capturedAt = requireExactInstant(value.capturedAt, 'previous rollback recapture capturedAt')
  const identity = value.rollbackIdentity
  requireExactFields(identity, ['schema', 'pages', 'mirror', 'd1'], 'previous rollback identity')
  if (identity.schema !== 'agenticgraph-production-rollback-identity/v1') throw new Error('previous rollback identity schema is invalid')
  requireExactFields(identity.pages, ['deploymentId', 'deploymentOrigin', 'deploymentCommitRevision', 'sourceRevision'], 'previous rollback pages')
  requireExactFields(identity.mirror, ['repository', 'revision'], 'previous rollback mirror')
  requireExactFields(identity.d1, ['stateContractDigest', 'readbackDigest', 'counts'], 'previous rollback D1')
  requireText(identity.pages.deploymentId, 'previous rollback deploymentId')
  requireText(identity.pages.deploymentOrigin, 'previous rollback deploymentOrigin')
  requireText(identity.mirror.repository, 'previous rollback mirror repository')
  for (const field of ['deploymentCommitRevision', 'sourceRevision']) requireExactRevision(identity.pages[field], `previous rollback pages ${field}`)
  requireExactRevision(identity.mirror.revision, 'previous rollback mirror revision')
  for (const field of ['stateContractDigest', 'readbackDigest']) requireExactDigest(identity.d1[field], `previous rollback D1 ${field}`)
  requireExactFields(identity.d1.counts, ['documentCount', 'chunkCount', 'graphCount'], 'previous rollback D1 counts')
  if (Object.values(identity.d1.counts).some(count => !Number.isSafeInteger(count) || count < 0) || identity.d1.counts.graphCount !== 0) {
    throw new Error('previous rollback D1 counts are invalid')
  }
  return { schema: value.schema, rollbackIdentity: identity, capturedAt }
}

export const assertSuccessfulReleaseMirrorIdentity = ({
  currentMirror, firstPagesCapturedAt, publication, integration, deployment, stateReceipt,
  previousRollbackRecapture = null, mirrorDescendantProof = null,
}) => {
  const publicationDigest = revision => digestValue({ repository: currentMirror.repository, revision,
    candidateDigest: publication.candidateDigest, liveVerificationReceiptDigest: publication.liveVerificationReceiptDigest })
  const descendantRequested = previousRollbackRecapture !== null || mirrorDescendantProof !== null
  if (publicationDigest(currentMirror.revision) === publication.publicationIdentitiesDigest) {
    if (descendantRequested) throw new Error('canonical descendant mirror proof is not applicable to an exact publication mirror')
    return
  }
  if (previousRollbackRecapture === null || mirrorDescendantProof === null) throw new Error('successful-release mirror identity drifted from the publication receipt')
  const previous = normalizePriorRollbackRecapture(previousRollbackRecapture)
  const proof = normalizeCanonicalDescendantMirrorProof(mirrorDescendantProof)
  if (proof.baseRevision !== canonicalDescendantIdentity.baseRevision || proof.descendantRevision !== canonicalDescendantIdentity.descendantRevision
      || proof.protectedPullRequest.number !== canonicalDescendantIdentity.protectedPullRequestNumber
      || proof.gamexrArtifact.sourceRevision !== canonicalDescendantIdentity.gamexrSourceRevision
      || proof.gamexrArtifact.artifactDigest !== canonicalDescendantIdentity.gamexrArtifactDigest) {
    throw new Error('canonical descendant mirror proof is outside the closed PR54 GameXR transition')
  }
  const expectedPages = { deploymentId: deployment.immutableDeploymentId, deploymentOrigin: deployment.immutableDeploymentOrigin,
    deploymentCommitRevision: integration.sourceRevision, sourceRevision: integration.sourceRevision }
  const expectedD1 = { stateContractDigest: stateReceipt.stateContractDigest, readbackDigest: stateReceipt.readbackDigest,
    counts: stateReceipt.observedCounts }
  if (canonicalJson(previous.rollbackIdentity.pages) !== canonicalJson(expectedPages)
      || canonicalJson(previous.rollbackIdentity.d1) !== canonicalJson(expectedD1)) {
    throw new Error('previous rollback recapture drifted from the production-complete carrier')
  }
  if (previous.rollbackIdentity.mirror.repository !== currentMirror.repository || proof.repository !== currentMirror.repository
      || proof.baseRevision !== previous.rollbackIdentity.mirror.revision || proof.descendantRevision !== currentMirror.revision) {
    throw new Error('canonical descendant mirror proof drifted from the old and current mirror identities')
  }
  if (publicationDigest(previous.rollbackIdentity.mirror.revision) !== publication.publicationIdentitiesDigest) {
    throw new Error('previous rollback mirror did not originate from the terminal publication receipt')
  }
  if (Date.parse(previous.capturedAt) > Date.parse(firstPagesCapturedAt)) throw new Error('previous rollback recapture cannot follow the descendant observation')
  if (Date.parse(proof.protectedPullRequest.mergedAt) > Date.parse(firstPagesCapturedAt)) throw new Error('canonical mirror descendant was not merged before the first observation')
}

const readDeletedPaths = root => {
  const output = execFileSync('git', ['diff', '--name-only', '--diff-filter=D', '-z', 'HEAD', '--'], {
    cwd: root,
    encoding: 'buffer',
    env: isolatedGitEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return output.toString('utf8').split('\0').filter(Boolean).map(normalizeRelativePath).sort()
}

const readManifest = async artifactRoot => {
  const manifestPath = resolveWithin(artifactRoot, productionMirrorArtifactManifestName)
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  if (manifest?.schema !== manifestSchema) throw new Error(`Unexpected production artifact schema: ${manifest?.schema}`)
  if (!exactRevisionPattern.test(manifest?.mirrorRevision || '')) {
    throw new Error('Production artifact manifest requires an exact mirror revision')
  }
  if (!Array.isArray(manifest?.deletedPaths)) throw new Error('Production artifact manifest requires deletedPaths')
  const deletedPaths = manifest.deletedPaths.map(normalizeRelativePath)
  if (new Set(deletedPaths).size !== deletedPaths.length) throw new Error('Production artifact manifest has duplicate deleted paths')
  for (const deletedPath of deletedPaths) {
    if (!isManagedPath(deletedPath)) throw new Error(`Production artifact cannot delete unmanaged path: ${deletedPath}`)
  }
  return { ...manifest, deletedPaths }
}

const digestFile = async filePath => createHash('sha256').update(await fs.readFile(filePath)).digest('hex')

const collectDirectoryFiles = async (directory, relativeRoot = '') => {
  const files = new Map()
  const entries = await fs.readdir(directory, { withFileTypes: true })
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name
    const entryPath = path.resolve(directory, entry.name)
    if (entry.isDirectory()) {
      const nestedFiles = await collectDirectoryFiles(entryPath, relativePath)
      for (const [nestedPath, digest] of nestedFiles) files.set(nestedPath, digest)
      continue
    }
    if (!entry.isFile()) throw new Error(`Production artifact rejects non-file entry: ${relativePath}`)
    files.set(relativePath, await digestFile(entryPath))
  }
  return files
}

const collectArtifactRecords = async (directory, relativeRoot = '') => {
  const records = []
  const entries = await fs.readdir(directory, { withFileTypes: true })
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name
    const entryPath = path.resolve(directory, entry.name)
    if (entry.isDirectory()) {
      records.push(...await collectArtifactRecords(entryPath, relativePath))
      continue
    }
    if (!entry.isFile()) throw new Error(`GameXR artifact rejects non-file entry: ${relativePath}`)
    if (relativePath === 'release-manifest.json') continue
    const bytes = await fs.readFile(entryPath)
    records.push({ path: relativePath, bytes: bytes.byteLength, sha256: digestValue(bytes) })
  }
  return records.sort((left, right) => left.path.localeCompare(right.path))
}

const validateWholeGamexrArtifact = async ({ root, sourceRevision, artifactDigest }) => {
  const artifactRoot = resolveWithin(root, 'content/gamexr')
  const manifestPath = resolveWithin(artifactRoot, 'release-manifest.json')
  const manifestBytes = await fs.readFile(manifestPath)
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  if (manifest?.schema !== 'gamexr-release-artifact/v1'
      || manifest.application !== 'GameXR'
      || manifest.basePath !== '/gamexr/'
      || manifest.candidateStatus !== 'source-bound-clean'
      || manifest.deploymentAuthorized !== false) {
    throw new Error('GameXR mirror artifact is not a source-bound, non-authorizing production artifact')
  }
  if (manifest.sourceRevision !== sourceRevision
      || manifest.source?.versionControl !== 'git'
      || manifest.source?.head !== 'resolved'
      || manifest.source?.worktree !== 'clean'
      || manifest.source?.statusDigest !== digestValue(Buffer.alloc(0))) {
    throw new Error('GameXR mirror artifact source identity drifted')
  }
  if (manifest.artifactDigest !== artifactDigest) throw new Error('GameXR mirror artifact digest drifted')
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    throw new Error('GameXR mirror artifact must inventory every artifact file')
  }
  const expected = await collectArtifactRecords(artifactRoot)
  const actual = manifest.artifacts.map(record => {
    const relativePath = normalizeGitRelativePath(record?.path)
    if (!Number.isSafeInteger(record?.bytes) || record.bytes < 0) {
      throw new Error(`GameXR artifact byte count is invalid: ${relativePath}`)
    }
    requireExactDigest(record?.sha256, `GameXR artifact digest for ${relativePath}`)
    return { path: relativePath, bytes: record.bytes, sha256: record.sha256 }
  }).sort((left, right) => left.path.localeCompare(right.path))
  if (new Set(actual.map(record => record.path)).size !== actual.length
      || canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error('GameXR mirror artifact manifest does not cover the whole exact artifact')
  }
  const aggregate = digestValue(actual.map(record => `${record.path}\0${record.bytes}\0${record.sha256}`).join('\n'))
  if (aggregate !== artifactDigest) throw new Error('GameXR mirror aggregate artifact digest is invalid')
  return {
    root: 'content/gamexr',
    sourceRevision,
    artifactDigest,
    manifestDigest: digestValue(manifestBytes),
  }
}

const normalizeProtectedPullRequest = ({ value, repository, baseRevision, descendantRevision, root }) => {
  if (!Number.isSafeInteger(value?.number) || value.number < 1
      || value.state !== 'MERGED'
      || value.baseRefName !== 'main'
      || typeof value.headRefName !== 'string' || !value.headRefName.trim()) {
    throw new Error('Mirror descendant requires one exact merged protected pull request')
  }
  requireExactRevision(value.headRefOid, 'mirror pull request head')
  const mergeRevision = requireExactRevision(value.mergeCommit?.oid, 'mirror pull request merge revision')
  const mergedAt = requireExactInstant(value.mergedAt, 'mirror pull request mergedAt')
  const expectedUrl = `https://github.com/${repository}/pull/${value.number}`
  if (value.url !== expectedUrl || mergeRevision !== descendantRevision) {
    throw new Error('Mirror pull request identity drifted from the exact descendant')
  }
  const parents = readGitText(root, ['rev-list', '--parents', '-n', '1', descendantRevision]).split(' ')
  if (parents.length !== 2 || parents[0] !== descendantRevision || parents[1] !== baseRevision) {
    throw new Error('Mirror descendant is not the direct protected squash successor of the rollback mirror')
  }
  const descendantTree = readGitText(root, ['rev-parse', `${descendantRevision}^{tree}`])
  const reviewedTree = readGitText(root, ['rev-parse', `${value.headRefOid}^{tree}`])
  if (descendantTree !== reviewedTree) throw new Error('Mirror protected pull request tree drifted from the merged descendant')
  return {
    number: value.number,
    url: value.url,
    state: value.state,
    baseRefName: value.baseRefName,
    headRefName: value.headRefName,
    headRefOid: value.headRefOid,
    mergeRevision,
    mergedAt,
  }
}

export const createCanonicalDescendantMirrorRollbackProof = async ({
  mirrorRoot,
  repository,
  baseRevision,
  descendantRevision,
  remoteRef,
  protectedPullRequest,
  gamexrSourceRevision,
  gamexrArtifactDigest,
}) => {
  const root = assertSafeRoot(mirrorRoot, 'Production mirror root')
  if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('Production mirror repository identity is invalid')
  }
  requireExactRevision(baseRevision, 'rollback mirror revision')
  requireExactRevision(descendantRevision, 'descendant mirror revision')
  requireExactRevision(gamexrSourceRevision, 'GameXR source revision')
  requireExactDigest(gamexrArtifactDigest, 'GameXR artifact digest')
  if (baseRevision === descendantRevision) throw new Error('Mirror descendant proof requires a newer revision')
  if (typeof remoteRef !== 'string'
      || !/^refs\/remotes\/[A-Za-z0-9._/-]+$/.test(remoteRef)
      || remoteRef.includes('..')
      || remoteRef.endsWith('/')) {
    throw new Error('Production mirror remote ref is invalid')
  }
  const topLevel = readGitText(root, ['rev-parse', '--show-toplevel'])
  if (await fs.realpath(topLevel) !== await fs.realpath(root)) {
    throw new Error('Production mirror root must be the exact Git worktree root')
  }
  if (readGitBuffer(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']).length !== 0) {
    throw new Error('Production mirror checkout must be clean for descendant proof')
  }
  const head = readGitText(root, ['rev-parse', 'HEAD'])
  const remoteRevision = readGitText(root, ['rev-parse', remoteRef])
  if (head !== descendantRevision || remoteRevision !== descendantRevision) {
    throw new Error('Production mirror descendant must equal clean local HEAD and the exact remote ref')
  }
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', baseRevision, descendantRevision], {
      cwd: root,
      env: isolatedGitEnvironment,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
  } catch {
    throw new Error('Rollback mirror revision is not an ancestor of the current production mirror')
  }
  const changedPaths = parseNulTerminatedGitPaths(readGitBuffer(root, [
    'diff', '--no-renames', '--name-only', '-z', `${baseRevision}..${descendantRevision}`, '--',
  ])).sort((left, right) => left.localeCompare(right))
  if (changedPaths.length === 0
      || !changedPaths.includes('content/gamexr/release-manifest.json')
      || new Set(changedPaths).size !== changedPaths.length) {
    throw new Error('Mirror descendant has no complete unique GameXR artifact delta')
  }
  if (changedPaths.some(relativePath => isManagedPath(relativePath)
      || !relativePath.startsWith('content/gamexr/'))) {
    throw new Error('Mirror descendant changed AgenticGraph-managed or non-GameXR publication bytes')
  }
  const gamexrArtifact = await validateWholeGamexrArtifact({
    root,
    sourceRevision: gamexrSourceRevision,
    artifactDigest: gamexrArtifactDigest,
  })
  const normalizedPullRequest = normalizeProtectedPullRequest({
    value: protectedPullRequest,
    repository,
    baseRevision,
    descendantRevision,
    root,
  })
  const proof = {
    schema: CANONICAL_DESCENDANT_MIRROR_PROOF_SCHEMA,
    repository,
    baseRevision,
    descendantRevision,
    remoteRevision,
    changedPaths,
    protectedPullRequest: normalizedPullRequest,
    gamexrArtifact,
  }
  return { ...proof, proofDigest: digestValue(proof) }
}

export const prepareCanonicalDescendantMirrorRollbackInputs = async ({ options, readJson, currentMirror }) => {
  const supplied = canonicalDescendantMirrorOptionNames.filter(name => options[name] !== undefined)
  if (supplied.length === 0) return { previousRollbackRecapture: null, mirrorDescendantProof: null }
  if (supplied.length !== canonicalDescendantMirrorOptionNames.length) {
    throw new Error('canonical descendant mirror recapture requires the complete explicit descendant option set')
  }
  const option = name => requireText(options[name], `--${name}`)
  const previousRollbackRecapture = readJson(option('previous-rollback-recapture'))
  const mirrorDescendantProof = await createCanonicalDescendantMirrorRollbackProof({
    mirrorRoot: option('mirror-repository-root'), repository: currentMirror.repository,
    baseRevision: previousRollbackRecapture.rollbackIdentity?.mirror?.revision,
    descendantRevision: currentMirror.revision, remoteRef: option('mirror-remote-ref'),
    protectedPullRequest: readJson(option('mirror-protected-pr')),
    gamexrSourceRevision: option('gamexr-source-sha'), gamexrArtifactDigest: option('gamexr-artifact-digest'),
  })
  return { previousRollbackRecapture, mirrorDescendantProof }
}

const assertEntryParity = async (artifactRoot, mirrorRoot, relativePath) => {
  const artifactPath = resolveWithin(artifactRoot, relativePath)
  const mirrorPath = resolveWithin(mirrorRoot, relativePath)
  const artifactStat = await fs.stat(artifactPath)
  const mirrorStat = await fs.stat(mirrorPath)
  if (artifactStat.isFile() && mirrorStat.isFile()) {
    if (await digestFile(artifactPath) !== await digestFile(mirrorPath)) {
      throw new Error(`Production artifact file parity failed: ${relativePath}`)
    }
    return
  }
  if (!artifactStat.isDirectory() || !mirrorStat.isDirectory()) {
    throw new Error(`Production artifact entry type mismatch: ${relativePath}`)
  }
  const artifactFiles = await collectDirectoryFiles(artifactPath)
  const mirrorFiles = await collectDirectoryFiles(mirrorPath)
  if (JSON.stringify([...artifactFiles]) !== JSON.stringify([...mirrorFiles])) {
    throw new Error(`Production artifact directory parity failed: ${relativePath}`)
  }
}

export const createProductionMirrorArtifactManifest = async ({ mirrorRoot }) => {
  const root = assertSafeRoot(mirrorRoot, 'Production mirror root')
  const mirrorRevision = readGitText(root, ['rev-parse', 'HEAD'])
  if (!exactRevisionPattern.test(mirrorRevision)) throw new Error('Production mirror base must be an exact revision')
  const deletedPaths = readDeletedPaths(root)
  for (const deletedPath of deletedPaths) {
    if (!isManagedPath(deletedPath)) throw new Error(`Production sync deleted unmanaged path: ${deletedPath}`)
  }
  const manifest = { schema: manifestSchema, mirrorRevision, deletedPaths }
  const manifestPath = resolveWithin(root, productionMirrorArtifactManifestName)
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return { manifest, manifestPath }
}

export const reconcileProductionMirrorArtifact = async ({ artifactRoot, mirrorRoot }) => {
  const sourceRoot = assertSafeRoot(artifactRoot, 'Production artifact root')
  const targetRoot = assertSafeRoot(mirrorRoot, 'Production mirror root')
  if (sourceRoot === targetRoot) throw new Error('Production artifact and mirror roots must differ')
  const manifest = await readManifest(sourceRoot)
  const targetRevision = readGitText(targetRoot, ['rev-parse', 'HEAD'])
  if (targetRevision !== manifest.mirrorRevision) {
    throw new Error(`Production mirror base mismatch: expected ${manifest.mirrorRevision}, received ${targetRevision}`)
  }
  if (readGitText(targetRoot, ['status', '--porcelain=v1'])) {
    throw new Error('Production mirror checkout must be clean before artifact reconciliation')
  }

  const readinessPath = '.well-known/runtime-readiness.json'
  const contentReadinessPath = `content/agenticgraph/${readinessPath}`
  const [rootReadiness, contentReadiness] = await Promise.all([
    fs.readFile(resolveWithin(sourceRoot, readinessPath)),
    fs.readFile(resolveWithin(sourceRoot, contentReadinessPath)),
  ])
  if (!rootReadiness.equals(contentReadiness)) throw new Error('Production artifact readiness markers must be byte-identical')

  for (const relativePath of productionMirrorArtifactEntries) await fs.stat(resolveWithin(sourceRoot, relativePath))
  for (const deletedPath of manifest.deletedPaths) {
    await fs.rm(resolveWithin(targetRoot, deletedPath), { force: true, recursive: true })
  }
  for (const relativePath of productionMirrorArtifactEntries) {
    const sourcePath = resolveWithin(sourceRoot, relativePath)
    const targetPath = resolveWithin(targetRoot, relativePath)
    const sourceStat = await fs.stat(sourcePath)
    await fs.rm(targetPath, { force: true, recursive: true })
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.cp(sourcePath, targetPath, { force: true, recursive: sourceStat.isDirectory() })
  }
  for (const relativePath of productionMirrorArtifactEntries) {
    await assertEntryParity(sourceRoot, targetRoot, relativePath)
  }
  return manifest
}

const run = async () => {
  const [command, firstRoot, secondRoot] = process.argv.slice(2)
  if (command === 'create' && firstRoot && !secondRoot) {
    const { manifestPath } = await createProductionMirrorArtifactManifest({ mirrorRoot: firstRoot })
    console.log(`[agenticgraph] production mirror artifact manifest: ${manifestPath}`)
    return
  }
  if (command === 'reconcile' && firstRoot && secondRoot) {
    const manifest = await reconcileProductionMirrorArtifact({ artifactRoot: firstRoot, mirrorRoot: secondRoot })
    console.log(`[agenticgraph] reconciled production mirror artifact from ${manifest.mirrorRevision}`)
    return
  }
  throw new Error('Usage: production-mirror-artifact.mjs create <mirror-root> | reconcile <artifact-root> <mirror-root>')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await run()
}
