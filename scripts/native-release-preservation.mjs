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

