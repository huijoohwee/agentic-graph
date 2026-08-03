import assert from 'node:assert/strict'

const SHA_PATTERN = /^[0-9a-f]{40}$/

export const classifyServiceWorkerReleaseTransition = ({
  previousRevision,
  expectedRevision,
}) => {
  assert.match(previousRevision, SHA_PATTERN, 'previous revision must be an exact source revision')
  assert.match(expectedRevision, SHA_PATTERN, 'expected revision must be an exact source revision')
  return previousRevision === expectedRevision
    ? 'same-revision-recovery'
    : 'revision-upgrade'
}
