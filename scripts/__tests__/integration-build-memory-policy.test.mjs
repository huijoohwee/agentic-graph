import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const REQUIRED_NODE_OPTIONS = 'NODE_OPTIONS: --max-old-space-size=4096'

for (const workflow of ['integration.yml', 'promote-agentic-canvas-os.yml', 'release.yml']) {
  test(`${workflow} gives production builds an explicit Node heap`, () => {
    const source = readFileSync(new URL(`../../.github/workflows/${workflow}`, import.meta.url), 'utf8')

    assert.match(
      source,
      new RegExp(`^      ${REQUIRED_NODE_OPTIONS}$`, 'm'),
      `${workflow} must retain the protected build heap policy`,
    )
  })
}

test('protected refresh enrollment pins the generic controller and repository policy', () => {
  const source = readFileSync(
    new URL('../../.github/workflows/auto-delivery.yml', import.meta.url),
    'utf8',
  )

  assert.match(source, /ref: 76c4c722616a45a3c2a1a115987a10ed204a3212/)
  assert.match(source, /node \.agentic-canvas-os\/scripts\/sync-open-pr\.mjs --protected-head-refresh/)
  assert.match(source, /PROTECTED_HEAD_REFRESH_CI_WORKFLOW: integration\.yml/)
  assert.match(source, /PROTECTED_HEAD_REFRESH_REQUIRED_CI_CONTEXTS_JSON: '\["Integration Gate"\]'/)
  assert.match(source, /PROTECTED_HEAD_REFRESH_CLASSIC_REQUIRED_CHECKS_JSON: '\["Integration Gate"\]'/)
  assert.match(source, /PROTECTED_HEAD_REFRESH_RULESET_REQUIRED_CHECKS_JSON: '\[\]'/)
  assert.doesNotMatch(source, /pull_request_target:/)
})

test('integration workflow authorizes the exact protected refresh candidate', () => {
  const source = readFileSync(
    new URL('../../.github/workflows/integration.yml', import.meta.url),
    'utf8',
  )

  assert.match(source, /workflow_dispatch:/)
  assert.match(source, /Protected head refresh \{0\} \{1\}/)
  assert.match(source, /test "\$GITHUB_REF" = "refs\/heads\/\$EXPECTED_BRANCH"/)
  assert.match(source, /test "\$GITHUB_SHA" = "\$EXPECTED_HEAD_SHA"/)
  assert.match(source, /pullRequest\.head\?\.repo\?\.full_name !== process\.env\.GITHUB_REPOSITORY/)
  assert.match(source, /KNOWGRPH_PR_BODY<<\$\{delimiter\}/)
  assert.match(source, /KNOWGRPH_REQUIRE_REMOTE_SCOPE_CHECK: \$\{\{ github\.event_name == 'pull_request' \|\| github\.event_name == 'workflow_dispatch' \}\}/)
})
