import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { AGENTIC_GRAPH_CSP } from './pages-mirror-headers.mjs'
import { prepareDevArtifact, runPagesProductionDeployment } from './pages-production-deployment.mjs'
import { verifyDataViewsDev } from './verify-data-views-dev.mjs'

export const DEV_UI_CONVERGENCE_ATTEMPTS = 2
export const DEV_UI_CONVERGENCE_RETRY_DELAY_MS = 15_000

export async function runPagesDevPromotion(env = process.env) {
  const evidenceDir = required(env, 'DEV_EVIDENCE_DIR')
  await fs.mkdir(evidenceDir, { recursive: true })
  const sourceRevision = required(env, 'RELEASE_SHA')
  const manifestDigest = required(env, 'IMMUTABLE_MANIFEST_DIGEST')
  const startedAt = new Date().toISOString()
  const attemptPath = path.join(evidenceDir, 'attempt.json')
  await writeReceipt(attemptPath, {
    schema: 'agentic-graph-dev-promotion-attempt/v1',
    sourceRevision,
    immutableManifestDigest: manifestDigest,
    runId: required(env, 'GITHUB_RUN_ID'),
    runAttempt: required(env, 'GITHUB_RUN_ATTEMPT'),
    startedAt,
  })
  let stage = 'artifact-prepare'
  try {
    const artifactDir = required(env, 'DEV_ARTIFACT_DIR')
    const artifact = await prepareDevArtifact({
      source: required(env, 'PRODUCTION_ARTIFACT_DIR'),
      target: artifactDir,
      commitSha: sourceRevision,
      manifestDigest,
      receiptPath: path.join(evidenceDir, 'artifact.json'),
    })

    stage = 'dev-project-preflight'
    const project = await runPagesProductionDeployment([
      'ensure-dev-project',
      '--create-attempt-receipt', path.join(evidenceDir, 'project-create-attempt.json'),
    ], { env })
    await writeReceipt(path.join(evidenceDir, 'project.json'), {
      schema: 'agentic-graph-dev-project-receipt/v1',
      projectId: project.projectId,
      projectName: project.projectName,
      previousDeploymentId: project.previousDeploymentId,
      previousSourceSha: project.previousSourceSha,
      sourceRevision,
      observedAt: new Date().toISOString(),
    })

    const runIdentity = 'ag-dev:' + sourceRevision.slice(0, 12) + ':' + required(env, 'GITHUB_RUN_ID')
      + ':' + required(env, 'GITHUB_RUN_ATTEMPT')
    stage = 'dev-pages-deployment'
    await writeReceipt(path.join(evidenceDir, 'deployment-attempt.json'), {
      schema: 'agentic-graph-dev-deployment-attempt/v1',
      projectId: project.projectId,
      projectName: project.projectName,
      sourceRevision,
      immutableManifestDigest: manifestDigest,
      staticArtifactDigest: artifact.artifactDigest,
      runIdentity,
      startedAt: new Date().toISOString(),
    })
    const deploymentExitCode = await deployStaticArtifact(artifactDir, runIdentity, sourceRevision, env)
    await writeReceipt(path.join(evidenceDir, 'deployment-process.json'), {
      schema: 'agentic-graph-dev-deployment-process/v1',
      projectId: project.projectId,
      sourceRevision,
      runIdentity,
      exitCode: deploymentExitCode,
      completedAt: new Date().toISOString(),
    })

    stage = 'dev-candidate-capture'
    const deployment = await runPagesProductionDeployment([
      'capture-dev-candidate',
      '--commit-sha', sourceRevision,
      '--manifest-digest', manifestDigest,
      '--run-identity', runIdentity,
      '--project-id', project.projectId,
      '--readiness-marker', path.join(artifactDir, '.well-known/runtime-readiness.json'),
      '--receipt', path.join(evidenceDir, 'deployment.json'),
    ], { env })
    if (deploymentExitCode !== 0) throw new Error('Wrangler Pages deployment exited ' + deploymentExitCode)

    stage = 'dev-csp-verification'
    const cspVerification = await verifyDevGraphCsp({ deployment, artifact })
    await writeReceipt(path.join(evidenceDir, 'csp-verification.json'), cspVerification)

    stage = 'dev-browser-verification'
    const { attempts: uiVerificationAttempts, verification: ui } = await verifyDevUiWithConvergenceRetry({
      origin: deployment.deploymentUrl,
      releaseSha: sourceRevision,
      manifestDigest,
      readinessPath: path.join(artifactDir, '.well-known/runtime-readiness.json'),
      outputPath: path.join(evidenceDir, 'ui-verification.json'),
    })
    const uiReceiptBytes = await fs.readFile(path.join(evidenceDir, 'ui-verification.json'))
    const cspReceiptBytes = await fs.readFile(path.join(evidenceDir, 'csp-verification.json'))
    const receipt = {
      schema: 'agentic-graph-dev-promotion-receipt/v1',
      sourceRevision,
      immutableManifestDigest: manifestDigest,
      projectId: project.projectId,
      deploymentId: deployment.deploymentId,
      deploymentUrl: deployment.deploymentUrl,
      providerDeploymentUrl: deployment.providerDeploymentUrl,
      runIdentity,
      staticArtifactDigest: artifact.artifactDigest,
      cspVerificationDigest: createHash('sha256').update(cspReceiptBytes).digest('hex'),
      uiVerificationDigest: createHash('sha256').update(uiReceiptBytes).digest('hex'),
      uiVerificationAttempts,
      views: ui.views,
      completedAt: new Date().toISOString(),
    }
    const promotionPath = path.join(evidenceDir, 'promotion.json')
    await writeReceipt(promotionPath, receipt)
    const promotionReceiptDigest = createHash('sha256').update(await fs.readFile(promotionPath)).digest('hex')
    const completed = { ...receipt, promotionReceiptDigest }
    await writeDevPromotionOutputs(env, completed)
    return completed
  } catch (error) {
    await writeReceipt(path.join(evidenceDir, 'failure.json'), {
      schema: 'agentic-graph-dev-promotion-failure/v1',
      sourceRevision,
      immutableManifestDigest: manifestDigest,
      stage,
      error: String(error?.message || error).slice(0, 500),
      failedAt: new Date().toISOString(),
    })
    throw error
  }
}

export async function verifyDevGraphCsp({ deployment, artifact, fetchImpl = fetch }) {
  const sourceRevision = String(deployment?.sourceRevision || '')
  const manifestDigest = String(deployment?.immutableManifestDigest || '')
  const projectId = String(deployment?.projectId || '')
  const deploymentId = String(deployment?.deploymentId || '')
  const origin = devUrl(deployment?.deploymentUrl, 'stable Dev Pages project URL')
  const providerOrigin = devUrl(deployment?.providerDeploymentUrl, 'immutable Dev Pages deployment URL')
  if (!/^[0-9a-f]{40}$/.test(sourceRevision)) throw new Error('Dev CSP source revision is invalid')
  if (!/^[0-9a-f]{64}$/.test(manifestDigest) || !/^[0-9a-f]{64}$/.test(String(artifact?.artifactDigest || ''))
    || !/^[0-9a-f]{64}$/.test(String(artifact?.readinessMarkerDigest || ''))) {
    throw new Error('Dev CSP artifact identity is invalid')
  }
  if (!projectId || !/^[A-Za-z0-9-]{8,64}$/.test(deploymentId)
    || deployment?.projectName !== 'agentic-graph-dev' || deployment?.usesFunctions !== false
    || artifact?.sourceRevision !== sourceRevision || artifact?.immutableManifestDigest !== manifestDigest
    || artifact?.readinessMarkerDigest !== deployment?.readinessMarkerDigest
    || artifact?.connectPolicy !== "connect-src 'self'; form-action 'self'"
    || JSON.stringify(artifact?.disabledRuntimeEntries) !== JSON.stringify(['functions/', '_routes.json', '_worker.js'])) {
    throw new Error('Dev CSP identity does not bind the exact static Pages candidate')
  }
  if (origin.origin !== 'https://agentic-graph-dev.pages.dev' || origin.pathname !== '/' || origin.search || origin.hash
    || origin.username || origin.password || origin.port
    || providerOrigin.protocol !== 'https:' || !/^[a-z0-9-]+\.agentic-graph-dev\.pages\.dev$/i.test(providerOrigin.hostname)
    || providerOrigin.pathname !== '/' || providerOrigin.search || providerOrigin.hash
    || providerOrigin.username || providerOrigin.password || providerOrigin.port) {
    throw new Error('Dev CSP origin is not the exact isolated Pages project')
  }
  const url = new URL('/agentic-graph/', origin.origin)
  url.searchParams.set('kgTransportProof', sourceRevision)
  const response = await fetchImpl(url, {
    headers: { accept: 'text/html', 'cache-control': 'no-cache' },
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  })
  const body = Buffer.from(await response.arrayBuffer())
  assert.equal(response.status, 200, `${url} must return HTTP 200`)
  assert.match(String(response.headers.get('content-type') || ''), /^text\/html\b/i, `${url} must return HTML`)
  const routeOwner = String(response.headers.get('x-agentic-graph-route-owner') || '').trim()
  assert.equal(routeOwner, '', `${url} static Dev candidate unexpectedly claims a Pages Function route owner`)
  const contentSecurityPolicy = String(response.headers.get('content-security-policy') || '')
  const observedPolicies = contentSecurityPolicy.split(', ').map(policy => policy.trim()).sort()
  const expectedPolicies = [artifact.connectPolicy, AGENTIC_GRAPH_CSP].sort()
  assert.deepEqual(observedPolicies, expectedPolicies, `${url} enforcing CSP policies drifted`)
  return {
    schema: 'agentic-graph-dev-csp-verification/v2',
    projectId,
    deploymentId,
    sourceRevision,
    immutableManifestDigest: manifestDigest,
    staticArtifactDigest: artifact.artifactDigest,
    url: url.toString(),
    status: response.status,
    routeOwner: null,
    contentSecurityPolicies: observedPolicies,
    bodyDigest: createHash('sha256').update(body).digest('hex'),
    byteLength: body.length,
    verifiedAt: new Date().toISOString(),
  }
}

function devUrl(value, label) {
  try { return new URL(String(value || '')) }
  catch { throw new Error(`${label} is invalid`) }
}

export async function verifyDevUiWithConvergenceRetry(input, {
  verify = verifyDataViewsDev,
  sleep = delay,
} = {}) {
  let failure = null
  for (let attempt = 1; attempt <= DEV_UI_CONVERGENCE_ATTEMPTS; attempt += 1) {
    try {
      return { attempts: attempt, verification: await verify(input) }
    } catch (error) {
      failure = error
      if (attempt === DEV_UI_CONVERGENCE_ATTEMPTS || !isTransientDevUiConvergenceFailure(error)) throw error
      await sleep(DEV_UI_CONVERGENCE_RETRY_DELAY_MS)
    }
  }
  throw failure
}

function isTransientDevUiConvergenceFailure(error) {
  const message = String(error?.message || error)
  return /Canvas View Mode|locator\.waitFor timeout|waiting for locator\(/i.test(message)
}

export async function writeDevPromotionOutputs(env, receipt) {
  const sourceRevision = String(receipt?.sourceRevision || '')
  const manifestDigest = String(receipt?.immutableManifestDigest || '')
  const deploymentId = String(receipt?.deploymentId || '')
  const deploymentUrl = String(receipt?.deploymentUrl || '')
  const promotionDigest = String(receipt?.promotionReceiptDigest || '')
  if (!/^[0-9a-f]{40}$/.test(sourceRevision)) throw new Error('Dev promotion source revision is invalid')
  if (!/^[0-9a-f]{64}$/.test(manifestDigest) || !/^[0-9a-f]{64}$/.test(promotionDigest)) {
    throw new Error('Dev promotion receipt digest is invalid')
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deploymentId)) {
    throw new Error('Dev deployment id is invalid')
  }
  const url = new URL(deploymentUrl)
  if (url.protocol !== 'https:' || !/^(?:agentic-graph-dev|[a-z0-9-]+\.agentic-graph-dev)\.pages\.dev$/i.test(url.hostname)
    || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Dev deployment URL is not the isolated Pages deployment')
  }
  const values = {
    source_revision: sourceRevision,
    manifest_digest: manifestDigest,
    deployment_id: deploymentId,
    deployment_url: url.origin,
    promotion_digest: promotionDigest,
  }
  const outputPath = required(env, 'GITHUB_OUTPUT')
  await fs.appendFile(outputPath, Object.entries(values).map(([key, value]) => key + '=' + value).join('\n') + '\n')
  return values
}

function deployStaticArtifact(artifactDir, runIdentity, sourceRevision, env) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const args = [
    '--no-install', 'wrangler', 'pages', 'deploy', artifactDir,
    '--project-name=agentic-graph-dev',
    '--branch=main',
    '--commit-hash=' + sourceRevision,
    '--commit-message=' + runIdentity,
    '--commit-dirty=true',
    '--no-bundle',
  ]
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: process.cwd(), env: { ...env, WRANGLER_SEND_METRICS: 'false' }, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error('Wrangler Pages deploy was terminated by ' + signal))
      else resolve(Number(code ?? 1))
    })
  })
}

async function writeReceipt(filePath, receipt) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' })
}

function required(env, name) {
  const value = String(env[name] || '').trim()
  if (!value) throw new Error(name + ' is required for the protected Dev promotion')
  return value
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPagesDevPromotion().then(receipt => {
    console.log('Dev promotion verified: ' + receipt.deploymentUrl + ' (' + receipt.deploymentId + ')')
  }).catch(error => {
    console.error('Dev promotion failed closed: ' + String(error?.message || error))
    process.exitCode = 1
  })
}
