import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import YAML from 'yaml'

test('release reconciles the captured schema map before parity without publishing it', () => {
  const workflow = YAML.parse(fs.readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8'))
  const steps = workflow.jobs.verify.steps
  const index = steps.findIndex(step => step.name === 'Reconcile captured schema map from exact source')
  assert.ok(index > steps.findIndex(step => step.name === 'Build and sync verified candidate'))
  assert.equal(steps[index + 1].name, 'Verify source-to-mirror parity')
  assert.equal(steps[index + 1].run, 'npm run conflict:mirror:check')
  assert.equal(steps[index]['working-directory'], 'agentic-graph')
  assert.match(steps[index].run, /test "\$\(git rev-parse HEAD\)" = "\$RELEASE_SHA"/)
  assert.match(steps[index].run, /test -z "\$\(git status --porcelain -- docs\/documents\)"/)
  assert.match(steps[index].run, /sync_map\.py --mode write --docs-dir "\$GITHUB_WORKSPACE\/agentic-graph\/docs\/documents" --map-file "\$GITHUB_WORKSPACE\/huijoohwee\.github\.io\/schema\/AgenticRAG\/agentic-graph-documents-map\.graph\.jsonld"$/)
  assert.equal(steps[index].env, undefined)
  assert.doesNotMatch(steps[index].run, /git (?:push|commit)|wrangler|curl|gh api/)
  assert.deepEqual(workflow.permissions, { actions: 'read', contents: 'read' })
})
