import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import YAML from 'yaml'
import { prepareDevArtifact, runPagesProductionDeployment } from '../pages-production-deployment.mjs'
import { writeDevPromotionOutputs } from '../run-pages-dev-promotion.mjs'

const sourceSha = 'a'.repeat(40)
const manifestDigest = 'b'.repeat(64)
const marker = JSON.stringify({
  source: { revision: sourceSha },
  immutableManifest: { digest: manifestDigest },
})

test('Dev artifact preserves the exact marker and removes executable routes', async t => {
  const root = await fixture(t)
  const result = await prepareDevArtifact({
    source: root.source,
    target: root.target,
    commitSha: sourceSha,
    manifestDigest,
    receiptPath: root.receipt,
  })
  const headers = await fs.readFile(path.join(root.target, '_headers'), 'utf8')
  assert.match(headers, /Content-Security-Policy: connect-src 'self'; form-action 'self'/)
  assert.equal(await fs.readFile(path.join(root.target, '.well-known/runtime-readiness.json'), 'utf8'), marker)
  assert.equal(result.sourceRevision, sourceSha)
  assert.equal(result.immutableManifestDigest, manifestDigest)
  assert.equal(result.fileCount, 3)
  assert.deepEqual(result.disabledRuntimeEntries, ['functions/', '_routes.json', '_worker.js'])
  for (const removed of ['functions', '_routes.json', '_worker.js']) {
    await assert.rejects(fs.access(path.join(root.target, removed)))
  }
  assert.equal(JSON.parse(await fs.readFile(root.receipt, 'utf8')).artifactDigest, result.artifactDigest)
})

test('Dev artifact refuses source marker drift before copying', async t => {
  const root = await fixture(t)
  await assert.rejects(
    prepareDevArtifact({
      source: root.source,
      target: root.target,
      commitSha: 'c'.repeat(40),
      manifestDigest,
      receiptPath: root.receipt,
    }),
    /readiness marker does not match/,
  )
  await assert.rejects(fs.access(root.target))
})

test('Dev project creation uses the Free project ceiling and validates isolation', async () => {
  const calls = []
  const receiptDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-pages-dev-project-'))
  try {
  const project = {
    id: 'dev-project-id',
    name: 'agentic-graph-dev',
    production_branch: 'main',
    source: null,
    build_config: {},
    deployment_configs: {},
  }
  const createReceipt = path.join(receiptDir, 'create-attempt.json')
  const result = await runPagesProductionDeployment(['ensure-dev-project', '--create-attempt-receipt', createReceipt], {
    env: {
      CLOUDFLARE_API_TOKEN: 'test-token',
      CLOUDFLARE_ACCOUNT_ID: 'account-id',
      CLOUDFLARE_PAGES_PROJECT: 'agentic-graph-prod',
    },
    fetchImpl: async (url, init = {}) => {
      const parsed = new URL(url)
      const route = parsed.pathname.replace('/client/v4/accounts/account-id', '')
      const requestPath = route + parsed.search
      calls.push({ route, method: init.method || 'GET' })
      if (route === '/pages/projects/agentic-graph-prod') return jsonResponse({ result: { id: 'prod-project-id' } })
      if (route === '/pages/projects/agentic-graph-dev' && init.method !== 'POST') return jsonResponse({ errors: [{ message: 'not found' }] }, 404)
      if (requestPath === '/pages/projects?per_page=20&page=1') {
        return jsonResponse({ result: [], result_info: { total_count: 4 } })
      }
      if (route === '/pages/projects' && init.method === 'POST') return jsonResponse({ result: project })
      if (route === '/pages/projects/agentic-graph-dev/domains') return jsonResponse({ result: [] })
      throw new Error('unexpected Cloudflare Pages request: ' + route)
    },
  })
  assert.equal(result.projectId, 'dev-project-id')
  assert.equal(result.projectName, 'agentic-graph-dev')
  assert.equal(calls.filter(call => call.method === 'POST').length, 1)
  assert.equal(calls.at(-1).route, '/pages/projects/agentic-graph-dev/domains')
  assert.equal(JSON.parse(await fs.readFile(createReceipt, 'utf8')).observedProjectCount, 4)
  } finally {
    await fs.rm(receiptDir, { recursive: true, force: true })
  }
})

test('Dev project creation refuses to cross the Free project limit', async () => {
  let createCalls = 0
  await assert.rejects(
    runPagesProductionDeployment(['ensure-dev-project'], {
      env: {
        CLOUDFLARE_API_TOKEN: 'test-token',
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        CLOUDFLARE_PAGES_PROJECT: 'agentic-graph-prod',
      },
      fetchImpl: async (url, init = {}) => {
        const parsed = new URL(url)
        const route = parsed.pathname.replace('/client/v4/accounts/account-id', '')
        const requestPath = route + parsed.search
        if (route === '/pages/projects/agentic-graph-prod') return jsonResponse({ result: { id: 'prod-id' } })
        if (route === '/pages/projects/agentic-graph-dev' && init.method !== 'POST') return jsonResponse({}, 404)
        if (requestPath === '/pages/projects?per_page=20&page=1') return jsonResponse({ result: [], result_info: { total_count: 100 } })
        if (init.method === 'POST') createCalls += 1
        throw new Error('unexpected Cloudflare Pages request: ' + route)
      },
    }),
    /Free Pages project limit/,
  )
  assert.equal(createCalls, 0)
})

test('Dev candidate capture requires exact project, run identity, and marker bytes', async t => {
  const root = await fixture(t)
  const deploymentId = 'dev-deployment-123'
  const runIdentity = 'ag-dev:aaaaaaaaaaaa:17:1'
  const deployment = {
    id: deploymentId,
    project_id: 'dev-project-id',
    environment: 'production',
    latest_stage: { status: 'success' },
    deployment_trigger: { metadata: { commit_hash: sourceSha, commit_message: runIdentity, branch: 'main' } },
    url: 'https://hash1234.agentic-graph-dev.pages.dev',
    uses_functions: false,
  }
  const result = await runPagesProductionDeployment([
    'capture-dev-candidate',
    '--commit-sha', sourceSha,
    '--manifest-digest', manifestDigest,
    '--run-identity', runIdentity,
    '--project-id', 'dev-project-id',
    '--readiness-marker', path.join(root.source, '.well-known/runtime-readiness.json'),
    '--receipt', root.receipt,
  ], {
    env: {
      CLOUDFLARE_API_TOKEN: 'test-token',
      CLOUDFLARE_ACCOUNT_ID: 'account-id',
      CLOUDFLARE_PAGES_PROJECT: 'agentic-graph-prod',
    },
    fetchImpl: async input => {
      const url = String(input)
      const parsed = new URL(url)
      if (parsed.hostname === 'api.cloudflare.com') {
        const route = parsed.pathname.replace('/client/v4/accounts/account-id', '')
          const requestPath = route + parsed.search
        if (route === '/pages/projects/agentic-graph-prod') return jsonResponse({ result: { id: 'prod-project-id' } })
        if (route === '/pages/projects/agentic-graph-dev') return jsonResponse({ result: { id: 'dev-project-id', name: 'agentic-graph-dev', production_branch: 'main', source: null, build_config: {}, deployment_configs: {} } })
        if (route === '/pages/projects/agentic-graph-dev/domains') return jsonResponse({ result: [] })
          if (requestPath === '/pages/projects/agentic-graph-dev/deployments?env=production&per_page=20') return jsonResponse({ result: [deployment] })
        if (route === '/pages/projects/agentic-graph-dev/deployments/' + deploymentId) return jsonResponse({ result: deployment })
        throw new Error('unexpected Cloudflare Pages request: ' + route)
      }
      if (url === deployment.url + '/.well-known/runtime-readiness.json') return new Response(marker, { status: 200 })
      throw new Error('unexpected network request: ' + url)
    },
  })
  assert.equal(result.deploymentId, deploymentId)
  assert.equal(result.deploymentUrl, 'https://hash1234.agentic-graph-dev.pages.dev')
  assert.equal(result.usesFunctions, false)
  assert.equal(JSON.parse(await fs.readFile(root.receipt, 'utf8')).runIdentity, runIdentity)
})

test('protected release authorizes first, then binds isolated Dev verification before Production mutation', async () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
  const workflow = YAML.parse(await fs.readFile(path.join(root, '.github/workflows/release.yml'), 'utf8'))
  const verify = workflow.jobs.verify
  const deploy = workflow.jobs.deploy
  const verifySteps = verify.steps
  assert.equal(verifySteps.some(step => step.id === 'dev_promotion'), false)
  assert.equal(Object.keys(verify.outputs).some(output => output.startsWith('dev_')), false)
  assert.equal(deploy.needs, 'verify')
  assert.equal(deploy.environment.name, 'production')
  const deploySteps = deploy.steps
  const auth = deploySteps.findIndex(step => step.name === 'Record exact human authorization and claim release controller')
  const dev = deploySteps.findIndex(step => step.id === 'dev_promotion')
  const bind = deploySteps.findIndex(step => step.name === 'Bind Dev receipt to exact candidate')
  const mutationGate = deploySteps.findIndex(step => step.name === 'Enforce sole deployment ownership')
  const productionDeploy = deploySteps.findIndex(step => step.name === 'Deploy verified artifact')
  const persist = deploySteps.findIndex(step => step.name === 'Persist isolated Dev receipts')
  assert.ok(auth >= 0 && dev > auth && bind > dev && persist > bind && mutationGate > bind && productionDeploy > mutationGate)
  assert.match(deploySteps[dev].run, /run-pages-dev-promotion\.mjs/)
  assert.equal(deploySteps[dev].env.PRODUCTION_ARTIFACT_DIR, '${{ runner.temp }}/production-mirror-artifact')
  assert.equal(deploySteps[dev].env.CLOUDFLARE_PAGES_PROJECT, '${{ vars.CLOUDFLARE_PAGES_PROJECT }}')
  assert.match(deploySteps[bind].run, /steps\.dev_promotion\.outputs\.source_revision/)
})

test('Dev outputs bind exact source, manifest, deployment, URL, and promotion digest', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-dev-outputs-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const outputPath = path.join(root, 'github-output')
  const result = await writeDevPromotionOutputs({ GITHUB_OUTPUT: outputPath }, {
    sourceRevision: sourceSha,
    immutableManifestDigest: manifestDigest,
    deploymentId: '01234567-89ab-cdef-0123-456789abcdef',
    deploymentUrl: 'https://hash1234.agentic-graph-dev.pages.dev',
    promotionReceiptDigest: 'c'.repeat(64),
  })
  assert.deepEqual(result, {
    source_revision: sourceSha,
    manifest_digest: manifestDigest,
    deployment_id: '01234567-89ab-cdef-0123-456789abcdef',
    deployment_url: 'https://hash1234.agentic-graph-dev.pages.dev',
    promotion_digest: 'c'.repeat(64),
  })
  assert.equal(await fs.readFile(outputPath, 'utf8'), [
    `source_revision=${sourceSha}`,
    `manifest_digest=${manifestDigest}`,
    'deployment_id=01234567-89ab-cdef-0123-456789abcdef',
    'deployment_url=https://hash1234.agentic-graph-dev.pages.dev',
    `promotion_digest=${'c'.repeat(64)}`,
    '',
  ].join('\n'))
  await assert.rejects(writeDevPromotionOutputs({ GITHUB_OUTPUT: outputPath }, {
    sourceRevision: sourceSha,
    immutableManifestDigest: manifestDigest,
    deploymentId: 'not-a-uuid',
    deploymentUrl: 'https://hash1234.agentic-graph-dev.pages.dev',
    promotionReceiptDigest: 'c'.repeat(64),
  }), /deployment id is invalid/)
})

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-pages-dev-'))
  const source = path.join(root, 'source')
  const target = path.join(root, 'target')
  const receipt = path.join(root, 'receipts', 'receipt.json')
  await fs.mkdir(path.join(source, '.well-known'), { recursive: true })
  await fs.mkdir(path.join(source, 'functions'))
  await fs.writeFile(path.join(source, '_headers'), '/*\n  X-Frame-Options: DENY\n\n', 'utf8')
  await fs.writeFile(path.join(source, '_routes.json'), '{}\n', 'utf8')
  await fs.writeFile(path.join(source, '_worker.js'), 'export default {};\n', 'utf8')
  await fs.writeFile(path.join(source, 'functions', 'api.js'), 'export function onRequest() {}\n', 'utf8')
  await fs.writeFile(path.join(source, 'index.html'), '<!doctype html>\n', 'utf8')
  await fs.writeFile(path.join(source, '.well-known/runtime-readiness.json'), marker, 'utf8')
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return { root, source, target, receipt }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify({ success: status >= 200 && status < 300, ...payload }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
