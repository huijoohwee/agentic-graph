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

test('XR gate retains both browser suites exactly once and exports observation on failure', () => {
  const workflow = load(readFileSync(new URL('../../.github/workflows/integration.yml', import.meta.url), 'utf8'))
  const steps = Object.values(workflow.jobs).flatMap(job => job.steps || [])
  const gate = steps.find(step => step.run?.includes('npm run xr-v2:unit'))
  const scripts = JSON.parse(readFileSync(new URL('../../canvas/package.json', import.meta.url), 'utf8')).scripts
  const expand = (text, depth = 0) => depth > 8 ? text : text.replace(/npm run ([a-zA-Z0-9:._-]+)/g, (match, name) => scripts[name] ? expand(scripts[name], depth + 1) : match)
  const expanded = expand(gate.run.replace('npm -C canvas run test:smoke:xr-v2:browser', scripts['test:smoke:xr-v2:browser']))
  for (const name of ['run_xr_v2_browser_smoke.mjs', 'run_xr_v2_workspace_seed_browser_smoke.mjs'])
    assert.equal(expanded.split(name).length - 1, 1, name)
  const observation = steps.find(step => step.id === 'validation_observation')
  assert.match(observation.if, /always\(\)/)
  assert.equal(observation['continue-on-error'], true)
  assert.ok(steps.some(step => step.with?.name?.startsWith('validation-observation-') && step.with['retention-days'] === 7))
  assert.notEqual(steps.find(step => step.id === 'integration')['continue-on-error'], true)
})
