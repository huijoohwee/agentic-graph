import assert from 'node:assert/strict'
import path from 'node:path'

export const NATIVE_PRESERVATION_IDENTITY = 'agentic-graph-native-preservation-identity/v1'
export const NATIVE_FRONTIER_ADAPTER = 'agentic-graph-native-release-frontier/v1'
const REPOSITORY = 'huijoohwee/agentic-graph'
const SHA = /^[0-9a-f]{40}$/
const DIGEST = /^[0-9a-f]{64}$/
const fields = ['schema', 'repository', 'worktreePath', 'branchRef', 'headRevision', 'laneRef',
  'deviceId', 'scopeId', 'metadataDigest', 'authorizesEffects']
const text = value => typeof value === 'string' && value.trim() && !value.includes('\0')
const exact = (value, keys, label) => assert.deepEqual(Object.keys(value || {}).sort(), [...keys].sort(), label)

// Descriptive, content-bound attribution only. This type is deliberately not a
// lease and must never be admitted as integration or deployment collaboration.
export const validateNativePreservationIdentity = value => {
  exact(value, fields, 'native preservation identity shape')
  assert.equal(value.schema, NATIVE_PRESERVATION_IDENTITY)
  assert.equal(value.repository, REPOSITORY)
  assert.equal(value.authorizesEffects, false)
  assert.ok(text(value.worktreePath) && path.isAbsolute(value.worktreePath)
    && path.resolve(value.worktreePath) === value.worktreePath, 'native worktree path must be canonical')
  assert.ok(value.branchRef === null || /^refs\/heads\/[^\s\0]+$/.test(value.branchRef), 'native branch reference')
  assert.match(value.headRevision, SHA)
  assert.match(value.laneRef, /^agent\/[^\s/]+\/[^\s]+$/)
  assert.ok(text(value.deviceId) && text(value.scopeId), 'native lane attribution is missing')
  assert.match(value.metadataDigest, DIGEST)
  if (value.branchRef !== null) assert.equal(value.branchRef, `refs/heads/${value.laneRef}`)
  return value
}
export const nativePreservationKey = value => {
  validateNativePreservationIdentity(value)
  return `${NATIVE_PRESERVATION_IDENTITY}\0${JSON.stringify(fields.map(field => value[field]))}`
}

const collaborationFields = ['actorId', 'deviceId', 'sessionId', 'worktreeId', 'branchId', 'scopeId', 'leaseEpoch', 'fenceRevision']
export const normalizePreservationCollaboration = (value, label) => {
  if (value?.schema === NATIVE_PRESERVATION_IDENTITY) return { ...validateNativePreservationIdentity(value) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  const actual = Object.keys(value).sort(), expected = [...collaborationFields].sort()
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new Error(`${label} contains missing or unknown fields`)
  }
  for (const field of collaborationFields.filter(field => field !== 'leaseEpoch')) {
    if (typeof value[field] !== 'string' || !value[field].trim()) throw new Error(`${label}.${field} must be non-empty`)
  }
  if (!Number.isSafeInteger(value.leaseEpoch) || value.leaseEpoch < 1) throw new Error(`${label}.leaseEpoch must be a positive integer`)
  return { ...value }
}
export const preservationCollaborationKey = value => value?.schema === NATIVE_PRESERVATION_IDENTITY
  ? nativePreservationKey(value) : collaborationFields.map(field => String(value[field])).join('\u0000')
export const validateNativeFrontierAdapter = ({ entries, captureAdapterId }) => {
  if (captureAdapterId === NATIVE_FRONTIER_ADAPTER) {
    if (entries.some(entry => entry.collaboration?.schema !== NATIVE_PRESERVATION_IDENTITY)) {
      throw new Error('native frontier requires native preservation identities')
    }
  } else if (entries.some(entry => entry.collaboration?.schema === NATIVE_PRESERVATION_IDENTITY)) {
    throw new Error('native preservation identity requires its native capture adapter')
  }
}
