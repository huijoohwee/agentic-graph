import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { load } from 'js-yaml'

const REQUIRED_NODE_OPTIONS = '--max-old-space-size=4096'

for (const workflow of ['integration.yml', 'promote-agentic-canvas-os.yml', 'release.yml']) {
  test(`${workflow} gives production builds an explicit Node heap`, () => {
    const source = readFileSync(new URL(`../../.github/workflows/${workflow}`, import.meta.url), 'utf8')

    assert.ok(
      Object.values(load(source).jobs).some(job => job.env?.NODE_OPTIONS === REQUIRED_NODE_OPTIONS),
      `${workflow} must retain the protected build heap policy`,
    )
  })
}

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
  assert.match(source, /AGENTIC_OS_PR_BODY<<\$\{delimiter\}/)
  assert.match(source, /AGENTIC_OS_REQUIRE_REMOTE_SCOPE_CHECK: \$\{\{ github\.event_name == 'pull_request' \|\| github\.event_name == 'workflow_dispatch' \}\}/)
})
