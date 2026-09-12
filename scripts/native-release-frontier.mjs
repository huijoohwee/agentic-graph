import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { load as loadLaneRecords } from 'agentic-os/compat/lane-records'
import { NATIVE_PRESERVATION_IDENTITY, NATIVE_FRONTIER_ADAPTER, validateNativePreservationIdentity } from './native-release-preservation.mjs'
export { NATIVE_PRESERVATION_IDENTITY, NATIVE_FRONTIER_ADAPTER, validateNativePreservationIdentity, nativePreservationKey } from './native-release-preservation.mjs'

const readLaneRecords = root => Object.values(loadLaneRecords(root).lanes)
const REPOSITORY = 'huijoohwee/agentic-graph'
const SHA = /^[0-9a-f]{40}$/
const LIMITS = { worktrees: 64, paths: 50_000, fileBytes: 64 * 1024 * 1024, totalBytes: 512 * 1024 * 1024 }
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value)
const digest = value => createHash('sha256').update(Buffer.isBuffer(value) ? value : canonical(value)).digest('hex')
const text = value => typeof value === 'string' && value.trim() && !value.includes('\0')

const git = (cwd, args, binary = false) => execFileSync('git', args, {
  cwd, encoding: binary ? 'buffer' : 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
})
const line = (cwd, args) => git(cwd, args).trim()
const splitNul = bytes => {
  if (!bytes.length) return []
  assert.equal(bytes.at(-1), 0, 'Git path list is incomplete')
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  return decoded.slice(0, -1).split('\0')
}
const fileIdentity = stat => [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs].map(String)
const directoryIdentity = directory => {
  const stat = fs.lstatSync(directory, { bigint: true })
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'worktree must be a direct directory')
  assert.equal(fs.realpathSync(directory), directory, 'worktree directory resolves elsewhere')
  return [String(stat.dev), String(stat.ino), String(stat.mode), String(stat.ctimeNs)]
}
const safeFile = (root, relative) => {
  assert.ok(relative && !path.isAbsolute(relative) && !relative.includes('\\')
    && relative.split('/').every(part => part && part !== '.' && part !== '..'), 'unsafe Git path')
  const parts = relative.split('/'), ancestors = [{ path: root, identity: directoryIdentity(root) }]
  for (let i = 1; i < parts.length; i += 1) {
    const stat = fs.lstatSync(path.join(root, ...parts.slice(0, i)), { throwIfNoEntry: false })
    // A removed directory can legitimately contain deleted tracked files.
    if (!stat) return { file: null, ancestors }
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'refusing a symlink or non-directory parent')
    const parent = path.join(root, ...parts.slice(0, i))
    ancestors.push({ path: parent, identity: directoryIdentity(parent) })
  }
  return { file: path.join(root, relative), ancestors }
}
const recheckParents = ancestors => {
  for (const parent of ancestors) assert.deepEqual(directoryIdentity(parent.path), parent.identity, 'source parent directory changed')
}
const readContent = (root, relative, budget) => {
  const { file, ancestors } = safeFile(root, relative)
  const before = file && fs.lstatSync(file, { bigint: true, throwIfNoEntry: false })
  recheckParents(ancestors)
  if (!before) return { path: relative, kind: 'absent' }
  assert.ok(before.isFile() || before.isSymbolicLink(), 'unsupported source entry type')
  assert.ok(before.size <= BigInt(LIMITS.fileBytes), 'source file exceeds capture limit')
  let byteLength = 0, contentDigest
  const hash = createHash('sha256')
  const consume = bytes => {
    byteLength += bytes.length; budget.bytes += bytes.length
    assert.ok(byteLength <= LIMITS.fileBytes && budget.bytes <= LIMITS.totalBytes,
      'source frontier exceeds capture byte limit')
    hash.update(bytes)
  }
  if (before.isSymbolicLink()) consume(fs.readlinkSync(file, { encoding: 'buffer' }))
  else {
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    try {
      assert.deepEqual(fileIdentity(fs.fstatSync(descriptor, { bigint: true })), fileIdentity(before), 'source file replaced')
      recheckParents(ancestors)
      const buffer = Buffer.alloc(64 * 1024)
      for (let count; (count = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0;) consume(buffer.subarray(0, count))
      assert.deepEqual(fileIdentity(fs.fstatSync(descriptor, { bigint: true })), fileIdentity(before), 'source file changed')
    } finally { fs.closeSync(descriptor) }
  }
  recheckParents(ancestors)
  contentDigest = hash.digest('hex')
  assert.deepEqual(fileIdentity(fs.lstatSync(file, { bigint: true })), fileIdentity(before), 'source entry changed')
  return { path: relative, kind: before.isSymbolicLink() ? 'symlink' : 'file',
    executable: Boolean(before.mode & 0o111n), bytes: byteLength, digest: contentDigest }
}

const registeredWorktrees = root => {
  const entries = [], records = splitNul(git(root, ['worktree', 'list', '--porcelain', '-z'], true))
  let current
  for (const record of records) {
    if (!record) continue
    const separator = record.indexOf(' '), key = separator < 0 ? record : record.slice(0, separator)
    const value = separator < 0 ? true : record.slice(separator + 1)
    if (key === 'worktree') { current = { path: value }; entries.push(current) }
    else { assert.ok(current, 'malformed worktree inventory'); current[key] = value }
  }
  assert.ok(entries.length > 0 && entries.length <= LIMITS.worktrees, 'worktree inventory exceeds limit')
  assert.equal(new Set(entries.map(entry => entry.path)).size, entries.length, 'duplicate worktree path')
  assert.equal(entries[0].path, root, 'release owner must be the primary canonical worktree')
  return entries.sort((a, b) => a.path.localeCompare(b.path))
}
const snapshotLane = (registration, root, common, records, budget) => {
  // symbolic-ref exits one for detached HEAD, which is a valid retained state.
  const location = registration.path, identity = directoryIdentity(location)
  assert.ok(!registration.prunable && !registration.bare, 'invalid registered worktree')
  assert.equal(line(location, ['rev-parse', '--show-toplevel']), location, 'worktree root drift')
  assert.equal(fs.realpathSync(line(location, ['rev-parse', '--path-format=absolute', '--git-common-dir'])), common)
  const headRevision = line(location, ['rev-parse', 'HEAD']), treeRevision = line(location, ['rev-parse', 'HEAD^{tree}'])
  const branchRef = registration.branch || null
  assert.equal(headRevision, registration.HEAD, 'registered worktree head drift')
  assert.ok(branchRef || registration.detached, 'worktree branch is unavailable')
  assert.equal(line(location, ['branch', '--show-current']), branchRef?.slice('refs/heads/'.length) || '')
  const hidden = splitNul(git(location, ['ls-files', '-v', '-z'], true))
  assert.ok(hidden.every(record => record[0] === 'H'), 'hidden or unsupported tracked source state')
  const index = git(location, ['ls-files', '--stage', '-z'], true)
  const tracked = splitNul(git(location, ['ls-files', '--cached', '-z'], true))
  const headPaths = splitNul(git(location, ['ls-tree', '-r', '--name-only', '-z', 'HEAD'], true))
  const untracked = splitNul(git(location, ['ls-files', '--others', '--exclude-standard', '-z'], true))
  assert.ok(splitNul(index).every(record => /^100(644|755) |^120000 /.test(record)), 'unsupported index mode or unmerged source')
  assert.ok(splitNul(index).every(record => / 0\t/.test(record)), 'unmerged source index')
  const paths = [...new Set([...headPaths, ...tracked, ...untracked])].sort()
  assert.ok(paths.length <= LIMITS.paths, 'source path inventory exceeds limit')
  const content = paths.map(relative => readContent(location, relative, budget))
  const status = git(location, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], true)
  const state = { path: location, branchRef, headRevision, treeRevision, indexDigest: digest(index),
    contentDigest: digest(content), statusDigest: digest(status), dirty: status.length !== 0,
    contentScope: 'tracked-and-visible-untracked', identity }
  assert.deepEqual(directoryIdentity(location), identity, 'worktree replaced during capture')
  if (location === root) return { ...state, content }
  const history = records.filter(record => record.worktree === location)
  const matches = branchRef ? history.filter(record => `refs/heads/${record.ref}` === branchRef) : history
  assert.equal(matches.length, 1, `native lane metadata is missing or ambiguous: ${location}`)
  const record = matches[0]
  for (const predecessor of history.filter(entry => entry !== record)) {
    assert.ok(['published', 'integrated'].includes(predecessor.state), 'historical lane metadata must be retained publication')
    assert.match(predecessor.head || '', SHA, 'historical lane metadata must bind exact head')
    assert.equal(line(location, ['merge-base', predecessor.head, headRevision]), predecessor.head,
      'historical lane metadata must precede the current branch')
  }
  assert.ok(text(record.device) && text(record.scope), 'native lane attribution is missing')
  if (branchRef) assert.equal(`refs/heads/${record.ref}`, branchRef, 'native lane metadata branch is stale')
  else assert.equal(record.head, headRevision, 'detached lane metadata must bind exact head')
  if (record.head) assert.equal(record.head, headRevision, 'native lane metadata head is stale')
  const collaboration = validateNativePreservationIdentity({ schema: NATIVE_PRESERVATION_IDENTITY,
    repository: REPOSITORY, worktreePath: location, branchRef, headRevision, laneRef: record.ref,
    deviceId: record.device, scopeId: record.scope, metadataDigest: digest(record), authorizesEffects: false })
  const mergeBaseRevision = line(location, ['merge-base', headRevision, 'refs/remotes/origin/main'])
  const changed = splitNul(git(location, ['diff', '--name-only', '-z', mergeBaseRevision, headRevision], true))
  const pending = splitNul(git(location, ['diff', '--name-only', '-z', 'HEAD'], true))
  const writeSet = { sourceRevision: line(root, ['rev-parse', 'HEAD']), mergeBaseRevision,
    headRevision, paths: [...new Set([...changed, ...pending, ...untracked])].sort(),
    indexDigest: state.indexDigest, contentDigest: state.contentDigest }
  return { ...state, collaboration, writeSet, content }
}

export const collectNativeReleaseFrontier = ({ repository, sourceRevision, sourceTree,
  readMetadata = readLaneRecords, betweenObservations = () => {} }) => {
  assert.match(sourceRevision, SHA); assert.match(sourceTree, SHA)
  const root = path.resolve(repository), common = fs.realpathSync(line(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']))
  const observe = () => {
    assert.equal(line(root, ['branch', '--show-current']), 'main', 'release owner must be canonical main')
    assert.equal(line(root, ['rev-parse', 'HEAD']), sourceRevision, 'canonical source drift')
    assert.equal(line(root, ['rev-parse', 'HEAD^{tree}']), sourceTree, 'canonical source tree drift')
    assert.equal(line(root, ['rev-parse', 'refs/remotes/origin/main']), sourceRevision, 'tracking source drift')
    const remote = line(root, ['ls-remote', '--exit-code', 'origin', 'refs/heads/main']).split(/\s+/)[0]
    assert.equal(remote, sourceRevision, 'remote protected source drift')
    const records = readMetadata(root)
    assert.ok(Array.isArray(records) && records.length <= 1024, 'native metadata inventory exceeds limit')
    const registrations = registeredWorktrees(root), budget = { bytes: 0 }
    assert.ok(registrations.some(entry => entry.path === root), 'canonical owner is not registered')
    const lanes = registrations.map(entry => snapshotLane(entry, root, common, records, budget))
    assert.equal(lanes.find(lane => lane.path === root).dirty, false, 'canonical source must be clean')
    return { registrations, metadataDigest: digest(records), lanes }
  }
  const capturedAt = new Date().toISOString(), first = observe()
  betweenObservations()
  const second = observe(), observedAt = new Date().toISOString()
  assert.deepEqual(second, first, 'native release frontier changed during capture')
  return { schema: NATIVE_FRONTIER_ADAPTER, authorizesEffects: false, repository: REPOSITORY,
    sourceRevision, sourceTree, capturedAt, observedAt, ...second }
}

export const materializeNativeFrontierReleaseEvidence = async options => {
  const { normalizeRollbackRecapture, normalizeReleaseEvidence, releaseInventoryDigest } =
    await import('./lib/production-release-lifecycle-evidence.mjs')
  const frontier = collectNativeReleaseFrontier(options)
  const rollback = normalizeRollbackRecapture(JSON.parse(String(options.rollbackBytes)))
  const entries = frontier.lanes.filter(lane => lane.path !== path.resolve(options.repository)).map(lane => {
    const stateDigest = digest(lane), writeSetDigest = digest(lane.writeSet)
    return { collaboration: lane.collaboration, stateDigest, writeSetDigest,
      recoveryHandle: `retained-git-worktree:v1:${stateDigest}`, preservationMode: 'active-lane',
      // No assumption about concurrent edits being disjoint is necessary.
      overlapClass: 'overlapping' }
  })
  const evidence = { schema: 'agentic-graph-production-release-evidence/v1', repository: REPOSITORY,
    sourceRevision: options.sourceRevision, protectedTipDigest: digest({ sourceRevision: options.sourceRevision, sourceTree: options.sourceTree }),
    convergenceBaseDigest: digest({ sourceRevision: options.sourceRevision, sourceTree: options.sourceTree, ref: 'refs/heads/main' }),
    captureAdapterId: NATIVE_FRONTIER_ADAPTER, capturedAt: frontier.capturedAt, observedAt: frontier.observedAt,
    inventoryDigest: '0'.repeat(64), successorWriteSetDigest: digest(frontier.lanes.map(lane => lane.writeSet || null)),
    entries, observations: entries.map(({ collaboration, stateDigest, recoveryHandle }) =>
      ({ collaboration, stateDigest, recoveryHandle, disposition: 'retained' })),
    rollbackIdentity: rollback.rollbackIdentity, rollbackCapturedAt: rollback.capturedAt,
    rollbackTargetDigest: digest(rollback.rollbackIdentity), sourceEvidenceRefs: [
      ...(options.sourceEvidenceRefs || []), { kind: NATIVE_FRONTIER_ADAPTER, digest: digest(frontier) },
      { kind: 'descriptive-agentic-os-lane-cache', digest: frontier.metadataDigest },
      { kind: 'rollback-recapture', digest: digest(options.rollbackBytes) },
    ] }
  evidence.inventoryDigest = releaseInventoryDigest(evidence)
  return { evidence: normalizeReleaseEvidence(evidence), frontier }
}

export const sourceEvidenceRefsFrom = values => (values || []).map(value => {
  const separator = value.indexOf('=')
  if (separator < 1) throw new Error('--source-evidence-ref must be kind=/absolute/path')
  const kind = value.slice(0, separator), filePath = path.resolve(value.slice(separator + 1))
  if (typeof kind !== 'string' || !kind.trim()) throw new Error('source evidence kind must be non-empty')
  return { kind, digest: digest(fs.readFileSync(filePath)) }
})

export const writeNativeFrontierEvidence = async (values, { required, readEvidenceBytes, writeJson, writeGitHubOutput }) => {
  const output = path.resolve(required(values.output, '--output'))
  const { evidence, frontier } = await materializeNativeFrontierReleaseEvidence({
    repository: required(values['repository-root'], '--repository-root'),
    rollbackBytes: readEvidenceBytes(required(values['rollback-recapture'], '--rollback-recapture')),
    sourceRevision: required(values['source-sha'], '--source-sha'),
    sourceTree: required(values['source-tree'], '--source-tree'),
    sourceEvidenceRefs: sourceEvidenceRefsFrom(values['source-evidence-ref']),
  })
  writeJson(`${output}.frontier.json`, frontier)
  writeJson(output, evidence)
  writeGitHubOutput(values['github-output'], 'release_evidence_digest', digest(evidence))
}
