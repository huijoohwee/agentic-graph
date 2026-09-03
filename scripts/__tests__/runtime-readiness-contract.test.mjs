import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import {
  formatGitHubOutput,
  readRuntimeReadinessContract,
  resolveRuntimeDocsDependency,
} from '../runtime-readiness-contract.mjs'
import {
  checkRuntimeDocsWorkflowPolicy,
  validateRuntimeDocsWorkflowPolicy,
} from '../runtime-docs-workflow-policy.mjs'

test('runtime docs dependency resolves one checkout repository and immutable ref', async () => {
  const contract = await readRuntimeReadinessContract()
  const dependency = resolveRuntimeDocsDependency(contract)
  assert.match(contract.docs_dependency.ref, /^[0-9a-f]{40}$/)
  const checkedOutDocsRoot = String(process.env.AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT || '').trim()
  if (checkedOutDocsRoot) {
    const checkedOutDocsRevision = execFileSync(
      'git',
      ['-C', path.dirname(checkedOutDocsRoot), 'rev-parse', 'HEAD'],
      { encoding: 'utf8' },
    ).trim()
    assert.equal(contract.docs_dependency.ref, checkedOutDocsRevision)
  }
  assert.ok(contract.docs_dependency.required_files.includes('AGENTS.md'))
  assert.ok(!contract.docs_dependency.required_files.includes('START-WORKFLOW.md'))
  assert.ok(!contract.docs_dependency.required_files.includes('RELEASE-WORKFLOW.md'))
  assert.ok(!contract.docs_dependency.required_files.includes('CANONICAL-LIFECYCLE.md'))
  assert.ok(contract.docs_dependency.required_files.includes('PROMPT-PRESETS.md'))
  assert.ok(contract.docs_dependency.required_files.includes('AGENT-TOOLKIT.md'))
  assert.ok(contract.docs_dependency.required_files.includes('APPLICATION-COMPOSITION.md'))
  assert.ok(contract.docs_dependency.required_files.includes('SKILL-EVOLUTION.md'))
  assert.ok(contract.docs_dependency.required_files.includes('AGENT-TEAM.md'))
  assert.ok(contract.docs_dependency.required_files.includes('schemas/production-runtime-readiness.v2.schema.json'))
  assert.deepEqual(
    ['/agent.toolkit', '#agent-toolkit', '@agent-toolkit-observer']
      .map((token) => contract.docs_dependency.proof_tokens.includes(token)),
    [true, true, true],
  )
  assert.deepEqual(
    ['/application.compose', '#application-composition', '@application-manifest', '@component-catalog', '@integration-profile', '@runtime-proof']
      .map((token) => contract.docs_dependency.proof_tokens.includes(token)),
    [true, true, true, true, true, true],
  )
  assert.deepEqual(
    ['/skill.evolve', '#skill-evolution', '@skill-catalog', '@skill-policy', '@runtime-proof', '@operator']
      .map((token) => contract.docs_dependency.proof_tokens.includes(token)),
    [true, true, true, true, true, true],
  )
  assert.deepEqual(
    ['/agent.team', '#role-based-agent-team', '@agent-team']
      .map((token) => contract.docs_dependency.proof_tokens.includes(token)),
    [true, true, true],
  )
  assert.deepEqual(
    ['/motion.control', '#pose', '@canvas']
      .map((token) => contract.docs_dependency.proof_tokens.includes(token)),
    [true, true, true],
  )
  assert.deepEqual(dependency, {
    repository: 'huijoohwee/agentic-canvas-os',
    ref: contract.docs_dependency.ref,
  })
  assert.equal(formatGitHubOutput(dependency), (
    `repository=huijoohwee/agentic-canvas-os\nref=${contract.docs_dependency.ref}\n`
  ))
})

test('runtime docs dependency rejects mutable or non-GitHub sources', () => {
  assert.throws(() => resolveRuntimeDocsDependency({
    docs_dependency: {
      repository: 'https://github.com/huijoohwee/agentic-canvas-os.git',
      ref: 'main',
    },
  }), /exact lowercase 40-character Git commit SHA/)
  assert.throws(() => resolveRuntimeDocsDependency({
    docs_dependency: {
      repository: 'https://example.com/huijoohwee/agentic-canvas-os.git',
      ref: 'a'.repeat(40),
    },
  }), /HTTPS GitHub repository URL/)
})

test('all auto-discovered workflow checkouts satisfy the shared runtime docs policy', async () => {
  const report = await checkRuntimeDocsWorkflowPolicy()
  assert.equal(report.status, 'passed')
  assert.ok(report.consumerCount > 0)
  assert.equal(report.consumers.length, report.consumerCount)
})

test('runtime docs workflow policy fails closed for missing consumers and copied refs', () => {
  assert.throws(
    () => validateRuntimeDocsWorkflowPolicy([]),
    /expected at least one Agentic Canvas OS workflow consumer/,
  )
  assert.throws(
    () => validateRuntimeDocsWorkflowPolicy([{
      workflowPath: '.github/workflows/example.yml',
      source: `
- name: Checkout application source
  with:
    fetch-depth: 0
- name: Install dependencies
- name: Resolve Agentic Canvas OS docs dependency
  id: agentic_canvas_os_docs
  run: npm run --silent runtime:docs-dependency:resolve -- --github-output
- name: Checkout Agentic Canvas OS docs SSOT
  with:
    repository: \${{ steps.agentic_canvas_os_docs.outputs.repository }}
    ref: \${{ steps.agentic_canvas_os_docs.outputs.ref }}
    fetch-depth: 0
    fallback_ref: ${'a'.repeat(40)}
  note: agentic-canvas-os
`,
    }]),
    /must not copy an immutable checkout ref/,
  )
})

test('runtime docs workflow policy ignores pinned controller checkouts without the docs resolver contract', () => {
  const validConsumer = {
    workflowPath: '.github/workflows/integration.yml',
    source: `
- name: Install dependencies
- name: Resolve Agentic Canvas OS docs dependency
  id: agentic_canvas_os_docs
  run: npm run --silent runtime:docs-dependency:resolve -- --github-output
- name: Checkout Agentic Canvas OS docs SSOT
  with:
    repository: \${{ steps.agentic_canvas_os_docs.outputs.repository }}
    ref: \${{ steps.agentic_canvas_os_docs.outputs.ref }}
    fetch-depth: 0
  note: agentic-canvas-os
`,
  }
  const controllerCheckout = {
    workflowPath: '.github/workflows/auto-delivery.yml',
    source: `
- name: Checkout pinned delivery controller
  uses: actions/checkout@v4
  with:
    repository: huijoohwee/agentic-canvas-os
    ref: ${'a'.repeat(40)}
`,
  }

  const report = validateRuntimeDocsWorkflowPolicy([validConsumer, controllerCheckout])
  assert.equal(report.consumerCount, 1)
  assert.deepEqual(report.consumers, ['.github/workflows/integration.yml'])
})

test('runtime docs workflow policy requires full local history for proof provenance', () => {
  assert.throws(
    () => validateRuntimeDocsWorkflowPolicy([{
      workflowPath: '.github/workflows/example.yml',
      source: `
- name: Install dependencies
- name: Resolve Agentic Canvas OS docs dependency
  id: agentic_canvas_os_docs
  run: npm run --silent runtime:docs-dependency:resolve -- --github-output
- name: Checkout Agentic Canvas OS docs SSOT
  with:
    repository: \${{ steps.agentic_canvas_os_docs.outputs.repository }}
    ref: \${{ steps.agentic_canvas_os_docs.outputs.ref }}
  note: agentic-canvas-os
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
`,
    }]),
    /must fetch full Git history/,
  )
})
