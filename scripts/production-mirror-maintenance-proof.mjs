import fs from 'node:fs/promises'
import { assertSafeRoot, normalizeGitRelativePath } from './production-mirror-artifact-paths.mjs'

export const MIRROR_MAINTENANCE_PROOF_SCHEMA = 'agentic-graph-mirror-maintenance-proof/v1'
const maximumChangedPaths = 64, maximumEntries = 50_000, maximumBytes = 16 * 1024 * 1024
const sha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
const fail = message => { throw new Error(`Mirror maintenance proof: ${message}`) }
const maintenancePath = value => {
  const name = normalizeGitRelativePath(value)
  return ['package.json', 'package-lock.json', '.agentic-os-validation.json', '.github/workflows/runtime-readiness.yml'].includes(name)
    || /^docs\/[A-Za-z0-9_./-]+\.md$/.test(name) || /^scripts\/[A-Za-z0-9_./-]+\.mjs$/.test(name)
}
const parseTree = bytes => {
  if (bytes.length > maximumBytes || bytes.at(-1) !== 0) fail('tree inventory is oversized or not terminated')
  const decoded = bytes.toString('utf8')
  if (!Buffer.from(decoded).equals(bytes)) fail('tree inventory is not UTF-8')
  const rows = decoded.slice(0, -1).split('\0'), entries = new Map()
  if (rows.length > maximumEntries) fail('tree inventory exceeds the entry budget')
  for (const row of rows) {
    const match = /^([0-7]{6}) (blob|commit) ([0-9a-f]{40})\t([^\0]+)$/.exec(row)
    if (!match) fail('malformed tree entry')
    const name = normalizeGitRelativePath(match[4])
    if (entries.has(name)) fail('duplicate tree entry')
    entries.set(name, { mode: match[1], type: match[2], row })
  }
  return entries
}
export const normalizeMirrorMaintenanceProof = (value, { digestValue, isExcluded }) => {
  if (!exact(value, ['schema', 'repository', 'baseRevision', 'descendantRevision', 'remoteRevision',
    'baseTree', 'descendantTree', 'changedPaths', 'unchangedEntryCount', 'unchangedTreeDigest', 'protectedPullRequest', 'proofDigest'])
      || value.schema !== MIRROR_MAINTENANCE_PROOF_SCHEMA || Buffer.byteLength(JSON.stringify(value)) > 500_000) fail('invalid schema or fields')
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository)) fail('invalid repository')
  if (!['baseRevision', 'descendantRevision', 'remoteRevision', 'baseTree', 'descendantTree'].every(key => sha(value[key]))
      || value.baseRevision === value.descendantRevision || value.remoteRevision !== value.descendantRevision
      || value.baseTree === value.descendantTree) fail('invalid revision or tree identity')
  const paths = value.changedPaths
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > maximumChangedPaths
      || new Set(paths).size !== paths.length || paths.some((name, index) => typeof name !== 'string'
        || !maintenancePath(name) || isExcluded(name) || (index > 0 && paths[index - 1].localeCompare(name) >= 0))) fail('non-maintenance, unordered, duplicate, or excessive changed paths')
  if (!Number.isSafeInteger(value.unchangedEntryCount) || value.unchangedEntryCount < 1
      || value.unchangedEntryCount > maximumEntries || !hash(value.unchangedTreeDigest)) fail('invalid unchanged tree evidence')
  const pr = value.protectedPullRequest
  if (!exact(pr, ['number', 'url', 'state', 'baseRefName', 'headRefName', 'headRefOid', 'mergeRevision', 'mergedAt', 'check'])
      || !Number.isSafeInteger(pr.number) || pr.number < 1 || pr.state !== 'MERGED' || pr.baseRefName !== 'main'
      || typeof pr.headRefName !== 'string' || !pr.headRefName.trim() || !sha(pr.headRefOid)
      || pr.mergeRevision !== value.descendantRevision || !instant(pr.mergedAt)
      || pr.url !== `https://github.com/${value.repository}/pull/${pr.number}`) fail('invalid protected pull request')
  const check = pr.check
  if (!exact(check, ['name', 'status', 'conclusion', 'detailsUrl', 'completedAt'])
      || check.name !== 'Runtime Readiness Gate' || check.status !== 'COMPLETED' || check.conclusion !== 'SUCCESS'
      || !new RegExp(`^https://github\\.com/${value.repository.replaceAll('.', '\\.')}\/actions\/runs\/[0-9]+\/job\/[0-9]+$`).test(check.detailsUrl)
      || !instant(check.completedAt) || Date.parse(check.completedAt) > Date.parse(pr.mergedAt)) fail('missing successful protected check before merge')
  const { proofDigest, ...proof } = value
  if (!hash(proofDigest) || digestValue(proof) !== proofDigest) fail('digest drift')
  return value
}

// Git and publication policy are supplied by the existing mirror owner; no second authority.
export const createMirrorMaintenanceProof = async (input, helpers) => {
  const { readGitText, readGitBuffer, normalizeProtectedPullRequest, digestValue, isExcluded } = helpers
  const { repository, baseRevision, descendantRevision, remoteRef, protectedPullRequest } = input
  const root = assertSafeRoot(input.mirrorRoot, 'Production mirror root')
  if (!sha(baseRevision) || !sha(descendantRevision) || baseRevision === descendantRevision) fail('exact distinct revisions required')
  if (remoteRef !== 'refs/remotes/origin/main') fail('canonical remote main required')
  if (await fs.realpath(readGitText(root, ['rev-parse', '--show-toplevel'])) !== await fs.realpath(root)) fail('exact repository root required')
  const assertCurrent = () => {
    if (readGitBuffer(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']).length) fail('checkout must be clean')
    if (readGitText(root, ['rev-parse', 'HEAD']) !== descendantRevision
        || readGitText(root, ['rev-parse', remoteRef]) !== descendantRevision) fail('HEAD and remote main must be exact')
  }
  assertCurrent()
  const pr = normalizeProtectedPullRequest({ value: protectedPullRequest, repository, baseRevision, descendantRevision, root })
  const checks = protectedPullRequest.statusCheckRollup?.filter(check => check.name === 'Runtime Readiness Gate') || []
  if (checks.length !== 1) fail('one required protected check must be observed')
  const check = Object.fromEntries(['name', 'status', 'conclusion', 'detailsUrl', 'completedAt'].map(key => [key, checks[0][key]]))
  const before = parseTree(readGitBuffer(root, ['ls-tree', '-r', '-z', '--full-tree', baseRevision]))
  const after = parseTree(readGitBuffer(root, ['ls-tree', '-r', '-z', '--full-tree', descendantRevision]))
  const allPaths = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a.localeCompare(b))
  const changedPaths = allPaths.filter(name => before.get(name)?.row !== after.get(name)?.row)
  for (const name of changedPaths) {
    if (!maintenancePath(name) || isExcluded(name)) fail(`changed publication or non-maintenance path: ${name}`)
    for (const entry of [before.get(name), after.get(name)].filter(Boolean)) {
      if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) fail(`non-regular maintenance entry: ${name}`)
    }
  }
  const changed = new Set(changedPaths), unchanged = allPaths.filter(name => !changed.has(name))
  const beforeDigest = digestValue(unchanged.map(name => before.get(name).row))
  if (beforeDigest !== digestValue(unchanged.map(name => after.get(name).row))) fail('remaining tree bytes changed')
  const proof = { schema: MIRROR_MAINTENANCE_PROOF_SCHEMA, repository, baseRevision, descendantRevision,
    remoteRevision: descendantRevision, baseTree: readGitText(root, ['rev-parse', `${baseRevision}^{tree}`]),
    descendantTree: readGitText(root, ['rev-parse', `${descendantRevision}^{tree}`]), changedPaths,
    unchangedEntryCount: unchanged.length, unchangedTreeDigest: beforeDigest, protectedPullRequest: { ...pr, check } }
  assertCurrent()
  return normalizeMirrorMaintenanceProof({ ...proof, proofDigest: digestValue(proof) }, helpers)
}
