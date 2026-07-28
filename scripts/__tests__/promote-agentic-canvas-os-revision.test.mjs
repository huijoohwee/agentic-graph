import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  REQUIRED_CHECKS,
  replaceRuntimeDocsRevision,
} from '../promote-agentic-canvas-os-revision.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const workflow = fs.readFileSync(
  path.resolve(repoRoot, '.github', 'workflows', 'promote-agentic-canvas-os.yml'),
  'utf8',
)

test('docs promotion replaces only the exact immutable dependency ref', () => {
  const current = 'a'.repeat(40)
  const next = 'b'.repeat(40)
  const source = `docs_dependency:\n  ref: "${current}"\nproof: "${current}"\n`
  const result = replaceRuntimeDocsRevision(source, current, next)
  assert.match(result, new RegExp(`ref: "${next}"`))
  assert.match(result, new RegExp(`proof: "${current}"`))
})

test('docs promotion fails closed when the ref is missing or duplicated', () => {
  const current = 'a'.repeat(40)
  assert.throws(() => replaceRuntimeDocsRevision('missing', current, 'b'.repeat(40)), /not uniquely addressable/)
  const line = `  ref: "${current}"`
  assert.throws(() => replaceRuntimeDocsRevision(`${line}\n${line}\n`, current, 'b'.repeat(40)), /more than once/)
})

test('docs promotion requires the exact protected Agentic Canvas OS checks', () => {
  assert.deepEqual(REQUIRED_CHECKS, [
    'build',
    'collaboration-integration',
    'docs-contract',
    'test',
  ])
})

test('docs promoter uses a low-cost sibling checkout and skips unchanged installs', () => {
  const detectIndex = workflow.indexOf('name: Detect pending docs revision')
  const installIndex = workflow.indexOf('name: Install dependencies')
  assert.ok(detectIndex >= 0)
  assert.ok(detectIndex < installIndex)
  assert.match(workflow, /cron: '17 3 \* \* \*'/)
  assert.match(workflow, /runs-on: ubuntu-slim/)
  assert.match(workflow, /permissions:\s*\n\s+contents: read/)
  assert.match(workflow, /name: Checkout Knowgrph main[\s\S]*?path: knowgrph/)
  assert.match(workflow, /git ls-remote "\$repository" refs\/heads\/main/)
  assert.match(
    workflow,
    /name: Install dependencies[\s\S]*?if: steps\.pending\.outputs\.changed == 'true'[\s\S]*?working-directory: knowgrph/,
  )
  assert.match(workflow, /git -C \.\.\/agentic-canvas-os rev-parse HEAD/)
  assert.doesNotMatch(workflow, /cache: npm/)
  assert.doesNotMatch(workflow, /npm --prefix (?:\.\.\/)?agentic-canvas-os ci/)
})
