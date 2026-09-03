#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import {
  FORWARD_HEAL_BASELINE_OPTIONS,
  runForwardHealBaselineCommand,
} from './lib/production-forward-heal-command.mjs'

export { createForwardHealBaselineEvidence } from './lib/production-forward-heal-evidence.mjs'

const EVIDENCE_SCHEMA = 'agentic-graph-production-transport-evidence/v1'
const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^[0-9a-f]{64}$/
const GITHUB_OUTPUT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const PAGES_DEPLOYMENT_UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/
const PAGES_API_ADAPTER = 'cloudflare-pages/api-canonical-observation-v1'
const PAGES_ATTEMPT_SCHEMA = 'agentic-graph-pages-deployment-attempt/v1'
const PAGES_CURRENT_OBSERVATION_SCHEMA = 'agentic-graph-production-pages-current-observation/v1'

export const digestBytes = value => createHash('sha256').update(value).digest('hex')
const canonicalJson = value => Array.isArray(value)
  ? `[${value.map(canonicalJson).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
    : JSON.stringify(value)
const digestValue = value => digestBytes(canonicalJson(value))
const readJson = async filePath => JSON.parse(await fs.readFile(path.resolve(filePath), 'utf8'))
const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(path.resolve(filePath)), { recursive: true })
  await fs.writeFile(path.resolve(filePath), `${JSON.stringify(value, null, 2)}\n`)
}
const githubOutputLine = (key, value) => {
  if (!GITHUB_OUTPUT_NAME_PATTERN.test(key)) throw new Error(`invalid GitHub output name: ${key}`)
  const normalized = String(value)
  if (/[\r\n]/u.test(normalized)) throw new Error(`GitHub output ${key} contains a line break`)
  return `${key}=${normalized}\n`
}
const appendGitHubOutput = async (enabled, values) => {
  if (!enabled) return
  const outputPath = String(process.env.GITHUB_OUTPUT || '')
  if (!outputPath.trim()) throw new Error('GITHUB_OUTPUT is required with --github-output')
  if (/[\r\n]/u.test(outputPath)) throw new Error('GITHUB_OUTPUT path contains a line break')
  await fs.appendFile(outputPath, Object.entries(values).map(([key, value]) => githubOutputLine(key, value)).join(''))
}
export const normalizeCloudflarePagesDeploymentId = (value, label = 'Cloudflare Pages deployment ID') => {
  const normalized = String(value || '')
  if (!PAGES_DEPLOYMENT_UUID_PATTERN.test(normalized)) throw new Error(`${label} must be a canonical UUID`)
  return normalized
}
export const normalizeTransportInstant = (value, label) => {
  const instant = new Date(String(value || ''))
  assert.ok(!Number.isNaN(instant.getTime()), `${label} must be an ISO timestamp`)
  return instant.toISOString()
}

const exactInstant = (value, label) => normalizeTransportInstant(value, label)

const normalizePagesAttempt = value => {
  assert.deepEqual(Object.keys(value).sort(), [
    'previousDeploymentId', 'runIdentity', 'schema', 'sourceRevision', 'startedAt', 'status',
  ])
  assert.equal(value.schema, PAGES_ATTEMPT_SCHEMA)
  assert.equal(value.status, 'attempt-started')
  assert.ok(String(value.previousDeploymentId || '').trim(), 'Pages attempt requires the previous deployment ID')
  assert.match(value.runIdentity, /^github-actions:[A-Za-z0-9_.:/-]+$/)
  assert.match(value.sourceRevision, SHA_PATTERN)
  exactInstant(value.startedAt, 'Pages deployment attempt start')
  return value
}

const wranglerDeploymentId = bytes => {
  let records
  try { records = String(bytes).split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line)) } catch { return '' }
  const ids = records.filter(record => ['pages-deploy', 'pages-deploy-detailed'].includes(record?.type)
    && record?.version === 1 && record?.deployment_id).map(record => record.deployment_id)
  if (ids.length === 0) return ''
  assert.equal(new Set(ids).size, 1, 'Wrangler Pages deployment identity is ambiguous')
  return ids[0]
}

export const assertCandidatePagesAttribution = ({ identity, deploymentRunIdentity, attempt, wranglerBytes }) => {
  const normalizedAttempt = normalizePagesAttempt(attempt)
  assert.notEqual(identity.deploymentId, normalizedAttempt.previousDeploymentId, 'candidate Pages deployment did not change')
  assert.equal(identity.deploymentCommitRevision, normalizedAttempt.sourceRevision, 'candidate Pages commit revision drifted')
  assert.equal(identity.sourceRevision, normalizedAttempt.sourceRevision, 'candidate Pages runtime revision drifted')
  assert.ok(Date.parse(identity.deployedAt) > Date.parse(normalizedAttempt.startedAt), 'candidate Pages deployment must complete after attempt start')
  assert.equal(deploymentRunIdentity, normalizedAttempt.runIdentity, 'candidate Pages deployment is not owned by this run')
  const outputDeploymentId = wranglerDeploymentId(wranglerBytes)
  if (outputDeploymentId) assert.equal(identity.deploymentId, outputDeploymentId, 'canonical Pages deployment differs from Wrangler output')
  return identity
}

const normalizeOrigin = value => {
  const url = new URL(String(value || ''))
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`production transport must be an HTTPS origin: ${value}`)
  }
  return url.origin
}

const fetchObservation = async ({ origin, pathname, expectedOwner = '' }) => {
  const url = new URL(pathname, `${origin}/`).toString()
  const response = await fetch(url, {
    headers: { accept: 'text/html', 'cache-control': 'no-cache' },
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  })
  const body = Buffer.from(await response.arrayBuffer())
  assert.equal(response.status, 200, `${url} must return HTTP 200`)
  assert.match(String(response.headers.get('content-type') || ''), /^text\/html\b/i, `${url} must return HTML`)
  const routeOwner = String(response.headers.get('x-agentic-graph-route-owner') || '').trim()
  if (expectedOwner) assert.equal(routeOwner, expectedOwner, `${url} route owner drifted`)
  return {
    url,
    status: response.status,
    contentType: String(response.headers.get('content-type') || ''),
    routeOwner,
    routeTag: String(response.headers.get('x-agentic-graph-route-tag') || '').trim(),
    bodyDigest: digestBytes(body),
    byteLength: body.length,
  }
}

const fetchMarker = async ({ origin, pathname }) => {
  const url = new URL(pathname, `${origin}/`).toString()
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  })
  const body = Buffer.from(await response.arrayBuffer())
  assert.equal(response.status, 200, `${url} must return HTTP 200`)
  assert.match(String(response.headers.get('content-type') || ''), /^application\/json\b/i)
  const marker = JSON.parse(body.toString('utf8'))
  return {
    url,
    status: response.status,
    bodyDigest: digestBytes(body),
    byteLength: body.length,
    sourceRevision: marker?.source?.revision,
    agenticCanvasOsRevision: marker?.agenticCanvasOs?.revision,
    catalogRevision: marker?.catalogRevision,
    artifactDigest: marker?.artifact?.digest,
    immutableManifestDigest: marker?.immutableManifest?.digest,
  }
}

const readSmokeEvidence = async filePath => {
  const bytes = await fs.readFile(path.resolve(filePath))
  const text = bytes.toString('utf8')
  const passed = text.match(/\[agentic-graph\] agent-ready smoke passed: (\d+)\/(\d+)/)
  if (!passed || passed[1] !== passed[2] || /(?:^|\n)not ok /m.test(text)) {
    throw new Error(`agent-ready smoke evidence is incomplete: ${filePath}`)
  }
  return {
    evidenceDigest: digestBytes(bytes),
    checkCount: Number(passed[1]),
    byteLength: bytes.length,
  }
}

export const validateTransportEvidence = ({ evidence, sourceRevision, manifestDigest }) => {
  assert.equal(evidence.schema, EVIDENCE_SCHEMA)
  assert.equal(evidence.status, 'passed')
  assert.equal(evidence.sourceRevision, sourceRevision)
  assert.equal(evidence.immutableManifestDigest, manifestDigest)
  assert.deepEqual(evidence.transports.map(item => item.id), ['immutable', 'stable-pages', 'public'])
  assert.equal(new Set(evidence.transports.map(item => normalizeOrigin(item.origin))).size, 3)
  for (const transport of evidence.transports) {
    assert.match(transport.smoke.evidenceDigest, DIGEST_PATTERN, `${transport.id} smoke evidence is missing`)
    assert.ok(transport.smoke.checkCount > 0, `${transport.id} smoke evidence has no checks`)
    assert.deepEqual(Object.keys(transport.markers), ['apex', 'app'])
    for (const [surface, marker] of Object.entries(transport.markers)) {
      assert.equal(marker.sourceRevision, sourceRevision, `${transport.id} ${surface} source revision drifted`)
      assert.equal(marker.catalogRevision, marker.agenticCanvasOsRevision, `${transport.id} ${surface} catalog/docs drifted`)
      assert.equal(marker.immutableManifestDigest, manifestDigest, `${transport.id} ${surface} manifest drifted`)
      assert.match(marker.artifactDigest, DIGEST_PATTERN)
    }
    assert.equal(
      transport.markers.apex.bodyDigest,
      transport.markers.app.bodyDigest,
      `${transport.id} apex/app readiness marker bytes differ`,
    )
    assert.equal(transport.routes.apex.routeOwner, 'root-agent-ready-pages', `${transport.id} apex route owner drifted`)
    assert.equal(transport.routes.app.routeOwner, 'agentic-graph-agent-ready-pages', `${transport.id} app route owner drifted`)
    assert.equal(transport.routes.apex.status, 200, `${transport.id} apex route status drifted`)
    assert.equal(transport.routes.app.status, 200, `${transport.id} app route status drifted`)
  }
  const markerDigests = [...new Set(evidence.transports.flatMap(item => [
    item.markers.apex.bodyDigest,
    item.markers.app.bodyDigest,
  ]))]
  assert.deepEqual(markerDigests, [evidence.markerBytesDigest], 'readiness marker bytes differ across transports')
  assert.equal(evidence.markerBytesParity, true)
  return evidence
}

export const verifyProductionReleaseTransports = async ({
  immutableOrigin,
  stablePagesOrigin,
  publicOrigin,
  sourceRevision,
  immutableManifestDigest,
  smokeEvidencePaths,
}) => {
  if (!SHA_PATTERN.test(sourceRevision)) throw new Error('source revision must be an exact lowercase Git SHA')
  if (!DIGEST_PATTERN.test(immutableManifestDigest)) throw new Error('immutable manifest digest must be SHA-256')
  const targets = [
    { id: 'immutable', origin: normalizeOrigin(immutableOrigin), smokePath: smokeEvidencePaths.immutable },
    { id: 'stable-pages', origin: normalizeOrigin(stablePagesOrigin), smokePath: smokeEvidencePaths.stablePages },
    { id: 'public', origin: normalizeOrigin(publicOrigin), smokePath: smokeEvidencePaths.public },
  ]
  if (new Set(targets.map(target => target.origin)).size !== targets.length) {
    throw new Error('immutable, stable Pages, and public transports must remain distinct')
  }

  const transports = await Promise.all(targets.map(async target => {
    const smoke = await readSmokeEvidence(target.smokePath)
    const [apexMarker, appMarker, apex, app] = await Promise.all([
      fetchMarker({ origin: target.origin, pathname: '/.well-known/runtime-readiness.json' }),
      fetchMarker({ origin: target.origin, pathname: '/agentic-graph/.well-known/runtime-readiness.json' }),
      fetchObservation({
        origin: target.origin,
        pathname: `/?kgTransportProof=${sourceRevision}`,
        expectedOwner: 'root-agent-ready-pages',
      }),
      fetchObservation({
        origin: target.origin,
        pathname: `/agentic-graph/?kgTransportProof=${sourceRevision}`,
        expectedOwner: 'agentic-graph-agent-ready-pages',
      }),
    ])
    return {
      id: target.id,
      origin: target.origin,
      smoke,
      markers: { apex: apexMarker, app: appMarker },
      routes: { apex, app },
    }
  }))
  const evidence = {
    schema: EVIDENCE_SCHEMA,
    status: 'passed',
    sourceRevision,
    immutableManifestDigest,
    markerBytesParity: new Set(transports.flatMap(item => [
      item.markers.apex.bodyDigest,
      item.markers.app.bodyDigest,
    ])).size === 1,
    markerBytesDigest: transports[0].markers.apex.bodyDigest,
    transports,
    verifiedAt: new Date().toISOString(),
  }
  return validateTransportEvidence({ evidence, sourceRevision, manifestDigest: immutableManifestDigest })
}

const pagesApi = async pathname => {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim()
  const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim()
  const project = String(process.env.CLOUDFLARE_PAGES_PROJECT || '').trim()
  if (!accountId || !token || !project) throw new Error('Cloudflare Pages API environment is incomplete')
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(project)}${pathname}`
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.success !== true) throw new Error(`Cloudflare Pages API failed with HTTP ${response.status}`)
  return payload
}

const observeCanonicalPages = async () => {
  const project = await pagesApi('')
  const canonical = project.result?.canonical_deployment
  const deploymentId = normalizeCloudflarePagesDeploymentId(canonical?.id)
  assert.equal(canonical.environment, 'production')
  assert.equal(canonical.latest_stage?.name, 'deploy')
  assert.equal(canonical.latest_stage?.status, 'success')
  const detail = await pagesApi(`/deployments/${encodeURIComponent(deploymentId)}`)
  assert.equal(detail.result?.id, deploymentId)
  assert.equal(detail.result?.environment, 'production')
  assert.equal(detail.result?.latest_stage?.status, 'success')
  const deploymentOrigin = normalizeOrigin(detail.result?.url)
  const deploymentCommitRevision = String(detail.result?.deployment_trigger?.metadata?.commit_hash || '')
  assert.match(deploymentCommitRevision, SHA_PATTERN)
  const deployedAt = exactInstant(detail.result?.latest_stage?.ended_on, 'Pages deployment completion')
  const markerResponse = await fetch(`${deploymentOrigin}/.well-known/runtime-readiness.json`, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(30_000),
  })
  assert.equal(markerResponse.status, 200, 'immutable Pages readiness marker must return HTTP 200')
  const marker = await markerResponse.json()
  assert.match(marker?.source?.revision, SHA_PATTERN)
  assert.match(marker?.immutableManifest?.digest, DIGEST_PATTERN)
  return {
    project,
    detail,
    deploymentRunIdentity: String(detail.result?.deployment_trigger?.metadata?.commit_message || ''),
    identity: {
      deploymentId,
      deploymentOrigin,
      deploymentCommitRevision,
      sourceRevision: marker.source.revision,
      deployedAt,
    },
    manifestDigest: marker.immutableManifest.digest,
    marker,
  }
}

const persistPagesApiEvidence = async ({ observation, evidenceDir, prefix }) => {
  await writeJson(path.join(evidenceDir, `${prefix}-pages-project-api.json`), observation.project)
  await writeJson(path.join(evidenceDir, `${prefix}-pages-deployment-api.json`), observation.detail)
  await writeJson(path.join(evidenceDir, `${prefix}-pages-runtime-readiness.json`), observation.marker)
}

const createPagesAttempt = async ({ releaseEvidencePath, previousDeploymentId, runIdentity, output }) => {
  const releaseEvidence = await readJson(releaseEvidencePath)
  assert.match(releaseEvidence.sourceRevision, SHA_PATTERN)
  const attempt = normalizePagesAttempt({
    schema: PAGES_ATTEMPT_SCHEMA, status: 'attempt-started', previousDeploymentId,
    runIdentity, sourceRevision: releaseEvidence.sourceRevision, startedAt: new Date().toISOString(),
  })
  await writeJson(output, attempt)
}

const capturePages = async ({ mode, evidenceDir, output, previousDeploymentId, releaseEvidencePath, attemptPath, wranglerOutput, attempts, githubOutput }) => {
  assert.ok(['previous', 'predeploy', 'candidate', 'restored', 'current'].includes(mode), `unsupported Pages observation mode: ${mode}`)
  const releaseEvidence = releaseEvidencePath ? await readJson(releaseEvidencePath) : null
  const expected = releaseEvidence?.rollbackIdentity?.pages
  const attempt = mode === 'candidate' ? normalizePagesAttempt(await readJson(attemptPath)) : null
  const wranglerBytes = mode === 'candidate' ? await fs.readFile(path.resolve(wranglerOutput)).catch(() => Buffer.alloc(0)) : null
  if (attempt) assert.equal(previousDeploymentId, attempt.previousDeploymentId, 'Pages attempt previous deployment drifted')
  await appendGitHubOutput(githubOutput, { mutation_possible: mode === 'candidate', mutation_proven: false, mutation_observed: false })
  let observation
  for (let pollAttempt = 1; pollAttempt <= attempts; pollAttempt += 1) {
    try {
      observation = await observeCanonicalPages()
    } catch (error) {
      if (pollAttempt === attempts) throw error
      process.stderr.write(`Canonical Pages observation ${pollAttempt}/${attempts} failed: ${error.message}\n`)
      await new Promise(resolve => setTimeout(resolve, 5_000))
      continue
    }
    const { identity } = observation
    if (mode === 'candidate') await persistPagesApiEvidence({ observation, evidenceDir, prefix: 'candidate' })
    const matches = mode === 'candidate'
      ? identity.deploymentId !== previousDeploymentId && identity.sourceRevision === releaseEvidence.sourceRevision
      : mode === 'restored'
        ? identity.deploymentId === expected.deploymentId
        : true
    if (matches) {
      if (mode === 'candidate') assertCandidatePagesAttribution({
        identity, deploymentRunIdentity: observation.deploymentRunIdentity, attempt, wranglerBytes,
      })
      break
    }
    observation = null
    if (pollAttempt < attempts) await new Promise(resolve => setTimeout(resolve, 5_000))
  }
  if (!observation) throw new Error(`authoritative ${mode} Pages deployment was not observed`)
  const prefix = mode === 'candidate' ? 'candidate' : mode === 'restored' ? 'restored' : mode === 'predeploy' ? 'predeploy' : mode === 'current' ? 'current' : 'previous'
  if (mode === 'candidate') await appendGitHubOutput(githubOutput, { mutation_proven: true, mutation_observed: true, deployment_id: observation.identity.deploymentId })
  if (mode !== 'candidate') await persistPagesApiEvidence({ observation, evidenceDir, prefix })
  if (mode === 'previous' || mode === 'predeploy') {
    if (mode === 'predeploy') {
      for (const field of ['deploymentId', 'deploymentOrigin', 'deploymentCommitRevision', 'sourceRevision']) {
        assert.equal(observation.identity[field], expected[field], `predeployment Pages ${field} drifted`)
      }
    }
    await appendGitHubOutput(githubOutput, {
      deployment_id: observation.identity.deploymentId,
      deployment_origin: observation.identity.deploymentOrigin,
      commit_sha: observation.identity.deploymentCommitRevision,
      source_revision: observation.identity.sourceRevision,
      production_origin: normalizeOrigin(`https://${process.env.CLOUDFLARE_PAGES_PROJECT}.pages.dev`),
    })
    await writeJson(output, observation.identity)
    return
  }
  if (mode === 'current') {
    const capturedAt = new Date().toISOString()
    await writeJson(output, {
      schema: PAGES_CURRENT_OBSERVATION_SCHEMA,
      adapterId: PAGES_API_ADAPTER,
      identity: observation.identity,
      capturedAt,
    })
    await appendGitHubOutput(githubOutput, {
      deployment_id: observation.identity.deploymentId,
      source_revision: observation.identity.sourceRevision,
      captured_at: capturedAt,
    })
    return
  }
  if (mode === 'candidate') {
    assert.equal(observation.identity.deploymentCommitRevision, releaseEvidence.sourceRevision)
    const capture = {
      schema: 'agentic-graph-pages-deployment-capture/v1', status: 'deployed', adapterId: PAGES_API_ADAPTER,
      deploymentId: observation.identity.deploymentId, deploymentOrigin: observation.identity.deploymentOrigin,
      sourceRevision: observation.identity.sourceRevision, deployedAt: observation.identity.deployedAt,
      capturedAt: new Date().toISOString(),
    }
    await writeJson(output, capture)
    await appendGitHubOutput(githubOutput, { deployment_url: observation.identity.deploymentOrigin })
    return
  }
  for (const field of ['deploymentId', 'deploymentOrigin', 'deploymentCommitRevision', 'sourceRevision']) {
    assert.equal(observation.identity[field], expected[field], `restored Pages ${field} drifted`)
  }
  await writeJson(output, {
    schema: 'agentic-graph-production-restored-pages-evidence/v1', status: 'restored', adapterId: PAGES_API_ADAPTER,
    canonicalDeployment: observation.identity, capturedAt: new Date().toISOString(),
  })
  await appendGitHubOutput(githubOutput, {
    deployment_url: observation.identity.deploymentOrigin,
    source_revision: observation.identity.sourceRevision,
    manifest_digest: observation.manifestDigest,
  })
}

const recaptureRollback = async ({ pagesPath, statePath, releaseEvidencePath, mirrorRevision, output, digestOutput }) => {
  const [pages, state, releaseEvidence] = await Promise.all([
    readJson(pagesPath), readJson(statePath), readJson(releaseEvidencePath),
  ])
  const rollbackIdentity = {
    schema: 'agentic-graph-production-rollback-identity/v1',
    pages: {
      deploymentId: pages.deploymentId, deploymentOrigin: pages.deploymentOrigin,
      deploymentCommitRevision: pages.deploymentCommitRevision, sourceRevision: pages.sourceRevision,
    },
    mirror: { repository: releaseEvidence.rollbackIdentity.mirror.repository, revision: mirrorRevision },
    d1: { stateContractDigest: state.stateContractDigest, readbackDigest: state.readbackDigest, counts: state.observedCounts },
  }
  assert.deepEqual(rollbackIdentity, releaseEvidence.rollbackIdentity, 'last-known-good rollback identity drifted')
  const identityDigest = digestValue(rollbackIdentity)
  assert.equal(identityDigest, releaseEvidence.rollbackTargetDigest, 'rollback target digest drifted')
  const capturedAt = new Date().toISOString()
  assert.ok(Date.parse(capturedAt) >= Date.parse(releaseEvidence.rollbackCapturedAt), 'rollback recapture predates release evidence')
  await writeJson(output, { schema: 'agentic-graph-production-rollback-recapture/v1', rollbackIdentity, capturedAt })
  await fs.writeFile(path.resolve(digestOutput), `${identityDigest}\n`)
}

const recordFailure = async ({ stageFile, stepContext, detailOutput, output }) => {
  const failedStage = (await fs.readFile(path.resolve(stageFile), 'utf8').catch(() => 'deployment')).trim()
  assert.match(failedStage, /^(deployment|state-reconciliation|live-verification|publication|receipt-persistence)$/)
  const steps = JSON.parse(stepContext || '{}')
  const outcomes = Object.fromEntries(Object.entries(steps).map(([id, step]) => [id, step?.outcome || 'unknown']))
  const detail = { failedStage, outcomes }
  await writeJson(detailOutput, detail)
  await writeJson(output, {
    schema: 'agentic-graph-production-release-failure-observation/v1', failedStage,
    messageDigest: digestBytes(await fs.readFile(path.resolve(detailOutput))), observedAt: new Date().toISOString(),
  })
}

export const observeMirror = async ({ repositoryRoot, repository, releaseEvidencePath, output, githubOutput }) => {
  await appendGitHubOutput(githubOutput, { eligible: false })
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
    assert.match(head, SHA_PATTERN, 'mirror checkout HEAD must be an exact Git SHA')
    const remoteRecords = execFileSync('git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], {
      cwd: repositoryRoot, encoding: 'utf8',
    }).trim().split(/\r?\n/u).filter(Boolean)
    assert.equal(remoteRecords.length, 1, 'mirror remote main identity is ambiguous')
    const [revision, remoteRef] = remoteRecords[0].trim().split(/\s+/u)
    assert.match(revision, SHA_PATTERN, 'mirror remote main must be an exact Git SHA')
    assert.equal(remoteRef, 'refs/heads/main', 'mirror remote main ref drifted')
    assert.equal(head, revision, 'mirror checkout HEAD drifted from remote main')
    const releaseEvidence = releaseEvidencePath ? await readJson(releaseEvidencePath) : null
    if (!releaseEvidence) {
      const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
        cwd: repositoryRoot, encoding: 'utf8',
      })
      assert.equal(status, '', 'current mirror observation requires a clean exact checkout')
    }
    const readiness = execFileSync('git', ['show', `${head}:.well-known/runtime-readiness.json`], { cwd: repositoryRoot, encoding: 'utf8' })
    const sourceRevision = JSON.parse(readiness).source.revision
    assert.match(sourceRevision, SHA_PATTERN, 'mirror readiness sourceRevision must be an exact Git SHA')
    const expectedRepository = String(releaseEvidence?.rollbackIdentity?.mirror?.repository || '').trim()
    const observedRepository = String(repository || expectedRepository).trim()
    assert.ok(observedRepository, '--repository is required without --release-evidence')
    if (repository && expectedRepository) assert.equal(repository, expectedRepository, 'mirror repository drifted from release evidence')
    const evidence = {
      schema: 'agentic-graph-production-observed-mirror-identity/v1',
      repository: observedRepository, revision, sourceRevision,
      observedAt: new Date().toISOString(),
    }
    await writeJson(output, evidence)
    const eligible = !releaseEvidence || (revision === releaseEvidence.rollbackIdentity.mirror.revision
      && sourceRevision === releaseEvidence.rollbackIdentity.pages.sourceRevision)
    if (eligible) {
      await appendGitHubOutput(githubOutput, { eligible: true, revision, source_revision: sourceRevision })
    }
    return evidence
  } catch (error) {
    process.stderr.write(`Authoritative mirror observation failed closed: ${error.message}\n`)
    if (!releaseEvidencePath) throw error
    return null
  }
}

const main = async () => {
  const rawArguments = process.argv.slice(2)
  const command = rawArguments[0]?.startsWith('--') ? 'verify' : rawArguments.shift() || 'verify'
  const { values } = parseArgs({
    args: rawArguments,
    options: {
      ...FORWARD_HEAL_BASELINE_OPTIONS,
      mode: { type: 'string' },
      'evidence-dir': { type: 'string' },
      'previous-deployment-id': { type: 'string' },
      'release-evidence': { type: 'string' },
      attempt: { type: 'string' },
      'wrangler-output': { type: 'string' },
      'reconciliation-output': { type: 'string' },
      'run-identity': { type: 'string' },
      'pages-observation': { type: 'string' },
      'state-evidence': { type: 'string' },
      'mirror-revision': { type: 'string' },
      'digest-output': { type: 'string' },
      'stage-file': { type: 'string' },
      'step-context': { type: 'string' },
      'detail-output': { type: 'string' },
      'repository-root': { type: 'string' },
      repository: { type: 'string' },
      'immutable-origin': { type: 'string' },
      'stable-pages-origin': { type: 'string' },
      'public-origin': { type: 'string' },
      'source-sha': { type: 'string' },
      'manifest-digest': { type: 'string' },
      'immutable-smoke': { type: 'string' },
      'stable-pages-smoke': { type: 'string' },
      'public-smoke': { type: 'string' },
      output: { type: 'string' },
      'github-output': { type: 'boolean' },
    },
    strict: true,
  })
  const required = (name) => {
    const value = String(values[name] || '').trim()
    if (!value) throw new Error(`--${name} is required`)
    return value
  }
  if (command === 'attempt') {
    await createPagesAttempt({
      releaseEvidencePath: required('release-evidence'), previousDeploymentId: required('previous-deployment-id'),
      runIdentity: required('run-identity'), output: required('output'),
    })
    return
  }
  if (command === 'pages') {
    const mode = required('mode')
    try {
      await capturePages({
        mode, evidenceDir: required('evidence-dir'), output: required('output'),
        previousDeploymentId: String(values['previous-deployment-id'] || ''),
        releaseEvidencePath: String(values['release-evidence'] || ''),
        attemptPath: String(values.attempt || ''), wranglerOutput: String(values['wrangler-output'] || ''),
        attempts: ['candidate', 'restored'].includes(mode) ? 60 : 1,
        githubOutput: values['github-output'],
      })
    } catch (error) {
      if (mode === 'candidate') {
        const attempt = await readJson(required('attempt')).catch(() => null)
        const wranglerBytes = await fs.readFile(path.resolve(required('wrangler-output'))).catch(() => Buffer.alloc(0))
        await writeJson(required('reconciliation-output'), {
          schema: 'agentic-graph-pages-mutation-reconciliation/v1', status: 'preserve-required', attempt,
          mutationPossible: true, mutationProven: false,
          wranglerOutputDigest: digestBytes(wranglerBytes), reasonDigest: digestBytes(error.message),
          observedAt: new Date().toISOString(),
        })
      }
      throw error
    }
    return
  }
  if (command === 'recapture-rollback') {
    await recaptureRollback({
      pagesPath: required('pages-observation'), statePath: required('state-evidence'),
      releaseEvidencePath: required('release-evidence'), mirrorRevision: required('mirror-revision'),
      output: required('output'), digestOutput: required('digest-output'),
    })
    return
  }
  if (command === 'forward-heal-baseline') {
    await runForwardHealBaselineCommand(values)
    return
  }
  if (command === 'failure') {
    await recordFailure({
      stageFile: required('stage-file'), stepContext: required('step-context'),
      detailOutput: required('detail-output'), output: required('output'),
    })
    return
  }
  if (command === 'mirror') {
    await observeMirror({
      repositoryRoot: required('repository-root'), repository: String(values.repository || ''),
      releaseEvidencePath: String(values['release-evidence'] || ''), output: required('output'),
      githubOutput: values['github-output'],
    })
    return
  }
  if (command !== 'verify') throw new Error(
    'command must be verify, attempt, pages, recapture-rollback, forward-heal-baseline, failure, or mirror',
  )
  const outputPath = path.resolve(required('output'))
  const evidence = await verifyProductionReleaseTransports({
    immutableOrigin: required('immutable-origin'),
    stablePagesOrigin: required('stable-pages-origin'),
    publicOrigin: required('public-origin'),
    sourceRevision: required('source-sha'),
    immutableManifestDigest: required('manifest-digest'),
    smokeEvidencePaths: {
      immutable: required('immutable-smoke'),
      stablePages: required('stable-pages-smoke'),
      public: required('public-smoke'),
    },
  })
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await appendGitHubOutput(values['github-output'], {
    evidence_path: outputPath,
    marker_bytes_digest: evidence.markerBytesDigest,
  })
  process.stdout.write(`${JSON.stringify(evidence)}\n`)
}

if (path.resolve(process.argv[1] || '') === path.resolve(import.meta.filename)) await main()
