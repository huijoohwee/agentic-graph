import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { prepareDevArtifact, runPagesProductionDeployment } from './pages-production-deployment.mjs'
import { verifyDataViewsDev } from './verify-data-views-dev.mjs'

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

    stage = 'dev-browser-verification'
    const ui = await verifyDataViewsDev({
      origin: deployment.deploymentUrl,
      releaseSha: sourceRevision,
      manifestDigest,
      readinessPath: path.join(artifactDir, '.well-known/runtime-readiness.json'),
      outputPath: path.join(evidenceDir, 'ui-verification.json'),
    })
    const uiReceiptBytes = await fs.readFile(path.join(evidenceDir, 'ui-verification.json'))
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
      uiVerificationDigest: createHash('sha256').update(uiReceiptBytes).digest('hex'),
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
