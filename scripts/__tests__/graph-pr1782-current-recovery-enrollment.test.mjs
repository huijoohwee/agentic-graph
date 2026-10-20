import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  assertGitHubTransitionPolicyOperation,
  GITHUB_HISTORICAL_CONTENT_MODE,
  validateGitHubTransitionPolicy,
} from 'agentic-os/adapters/github-transition-policy'

const policy = validateGitHubTransitionPolicy(
  JSON.parse(readFileSync(new URL('../../.agentic-os/github-transition-policy.json', import.meta.url), 'utf8')),
)

test('graph PR 1782 current recovery enrollment matches the historical integration contract', () => {
  const entry = policy.historicalIntegrations.find(candidate =>
    candidate.reviewLocator === 'https://github.com/huijoohwee/agentic-graph/pull/1782')
  assert.ok(entry, 'expected a historical integration entry for graph PR #1782')
  assert.equal(entry.baseRevision, 'd923e660f19d1c22ec94821ba6b8316b71e22b65')
  assert.equal(entry.headRevision, '2c6ed1967188187fd21556d1ab0a406bb3f13b63')
  assert.equal(entry.mergeRevision, '680121e0d4ff9862e146bca519f9acad26e47f9e')
  assert.equal(entry.treeRevision, 'c7de204a7bf100f49e213e07ec32534feead4bfc')
  assert.deepEqual(entry.checkContexts, ['Integration Gate'])
  assert.deepEqual(entry.adoptionScope, ['recovery/current-historical-content/refresh3/pr-1782'])

  const matched = assertGitHubTransitionPolicyOperation(policy, {
    request: {
      repository: 'github.com/huijoohwee/agentic-graph',
      reviewLocator: 'https://github.com/huijoohwee/agentic-graph/pull/1782',
      scope: ['recovery/current-historical-content/refresh3/pr-1782'],
    },
    plan: { target: { immutableRevision: '680121e0d4ff9862e146bca519f9acad26e47f9e' } },
    predecessorIssuance: {
      storedBundle: {
        authorityBundle: {
          candidate: {
            canonicalRevision: 'd923e660f19d1c22ec94821ba6b8316b71e22b65',
            headRevision: '2c6ed1967188187fd21556d1ab0a406bb3f13b63',
          },
        },
      },
    },
    integrationMode: GITHUB_HISTORICAL_CONTENT_MODE,
  })

  assert.deepEqual(matched, entry)
})
