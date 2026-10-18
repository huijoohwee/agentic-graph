#!/usr/bin/env node

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEV_PROJECT_NAME = 'agentic-graph-dev'
const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^[0-9a-f]{64}$/
const PAGES_PROJECT_LIMIT = 100
const PAGES_FILE_LIMIT = 20_000
const PAGES_FILE_BYTES_LIMIT = 25 * 1024 * 1024
const DEV_ISOLATION_HEADER = "  Content-Security-Policy: connect-src 'self'; form-action 'self'"

export async function prepareDevArtifact({ source, target, commitSha, manifestDigest, receiptPath }) {
  if (!SHA_PATTERN.test(commitSha)) throw new Error('Dev release SHA must be an exact lowercase 40-character SHA')
  if (!DIGEST_PATTERN.test(manifestDigest)) throw new Error('Dev immutable manifest digest must be exact SHA-256')
  const sourcePath = await fsp.realpath(source)
  const targetPath = path.resolve(target)
  if (sourcePath === targetPath || targetPath.startsWith(`${sourcePath}${path.sep}`) || sourcePath.startsWith(`${targetPath}${path.sep}`)) {
    throw new Error('Dev artifact target must be a separate directory from the verified source artifact')
  }
  const sourceFiles = await collectRegularFiles(sourcePath)
  for (const required of ['_headers', '_routes.json', '_worker.js', '.well-known/runtime-readiness.json']) {
    if (!sourceFiles.some(file => file.relativePath === required)) throw new Error(`Verified artifact is missing ${required}`)
  }
  if (!sourceFiles.some(file => file.relativePath.startsWith('functions/'))) throw new Error('Verified artifact has no Pages Functions tree to isolate')
  const markerBody = await fsp.readFile(path.join(sourcePath, '.well-known/runtime-readiness.json'), 'utf8')
  const marker = JSON.parse(markerBody)
  if (marker?.source?.revision !== commitSha || marker?.immutableManifest?.digest !== manifestDigest) {
    throw new Error('Verified readiness marker does not match the exact Dev release candidate')
  }
  await fsp.mkdir(path.dirname(targetPath), { recursive: true })
  await fsp.cp(sourcePath, targetPath, { recursive: true, errorOnExist: true, force: false })
  await Promise.all(['functions', '_worker.js', '_routes.json'].map(relativePath => fsp.rm(path.join(targetPath, relativePath), { recursive: true })))
  const headerPath = path.join(targetPath, '_headers')
  const headerText = await fsp.readFile(headerPath, 'utf8')
  await fsp.writeFile(headerPath, addDevIsolationHeader(headerText), 'utf8')
  const files = await collectRegularFiles(targetPath)
  if (files.length > PAGES_FILE_LIMIT) throw new Error(`Dev Pages artifact has ${files.length} files; Free limit is ${PAGES_FILE_LIMIT}`)
  const largestFile = files.find(file => file.bytes > PAGES_FILE_BYTES_LIMIT)
  if (largestFile) throw new Error(`Dev Pages artifact file exceeds 25 MiB: ${largestFile.relativePath}`)
  if (files.some(file => ['_worker.js', '_routes.json'].includes(file.relativePath) || file.relativePath.startsWith('functions/'))) {
    throw new Error('Dev artifact still includes executable Pages Functions routes')
  }
  const artifactDigest = await digestFiles(targetPath, files)
  const receipt = {
    schema: 'agentic-graph-dev-artifact-receipt/v1',
    sourceRevision: commitSha,
    immutableManifestDigest: manifestDigest,
    artifactDigest,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    readinessMarkerDigest: createHash('sha256').update(markerBody).digest('hex'),
    disabledRuntimeEntries: ['functions/', '_routes.json', '_worker.js'],
    connectPolicy: "connect-src 'self'; form-action 'self'",
    createdAt: new Date().toISOString(),
  }
  await fsp.mkdir(path.dirname(path.resolve(receiptPath)), { recursive: true })
  await fsp.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' })
  return receipt
}

export async function runPagesProductionDeployment(argv = process.argv.slice(2), options = {}) {
  const [command, ...args] = argv
  const env = options.env || process.env
  if (command === 'prepare-dev-artifact') {
    const receipt = await prepareDevArtifact({
      source: option(args, '--source'), target: option(args, '--target'),
      commitSha: option(args, '--commit-sha'), manifestDigest: option(args, '--manifest-digest'),
      receiptPath: option(args, '--receipt'),
    })
    writeOutput('artifact_digest', receipt.artifactDigest, env)
    writeOutput('file_count', receipt.fileCount, env)
    return receipt
  }
  const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID', env)
  const apiToken = requiredEnv('CLOUDFLARE_API_TOKEN', env)
  const projectName = requiredEnv('CLOUDFLARE_PAGES_PROJECT', env)
  validateProjectName(projectName)
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const api = createCloudflareClient({ accountId, apiToken, fetchImpl })
  const pagesHostname = `${projectName}.pages.dev`
  const productionPagesOrigin = new URL(`https://${pagesHostname}`).origin
  const projectPath = name => `/pages/projects/${encodeURIComponent(name)}`
  const projectUrl = projectPath(projectName)
  const baseUrl = `${projectUrl}/deployments`

  if (command === 'ensure-dev-project') {
    const production = await api(projectUrl)
    if (!production.result?.id) throw new Error('Configured production Pages project identity is unavailable')
    if (projectName === DEV_PROJECT_NAME) throw new Error('Dev and production Pages projects must have different identities')
    let dev = await api(projectPath(DEV_PROJECT_NAME), {}, { allowNotFound: true })
    if (!dev) {
      const projects = await api('/pages/projects')
      const count = Number(projects.result_info?.total_count)
      if (!Array.isArray(projects.result) || !Number.isInteger(count)) throw new Error('Pages project count is unavailable; refusing to create a Dev project')
      if (count >= PAGES_PROJECT_LIMIT) throw new Error(`Cloudflare Free Pages project limit (${PAGES_PROJECT_LIMIT}) would be exceeded`)
      const attemptPath = option(args, '--create-attempt-receipt')
      if (!attemptPath) throw new Error('Dev project creation requires an immutable pre-mutation attempt receipt')
      await fsp.mkdir(path.dirname(path.resolve(attemptPath)), { recursive: true })
      const attemptReceipt = {
        schema: 'agentic-graph-dev-project-create-attempt/v1',
        projectName: DEV_PROJECT_NAME,
        productionProjectId: production.result.id,
        observedProjectCount: count,
        observedAt: new Date().toISOString(),
      }
      await fsp.writeFile(attemptPath, JSON.stringify(attemptReceipt, null, 2) + '\n', { flag: 'wx' })
      dev = await api('/pages/projects', { method: 'POST', body: JSON.stringify({ name: DEV_PROJECT_NAME, production_branch: 'main' }) })
    }
    const project = dev.result
    await validateDevProject({ api, project, productionProjectId: production.result.id })
    const previous = project.canonical_deployment
    let previousId = ''
    let previousSha = ''
    if (previous?.id && previous.environment === 'production' && previous.latest_stage?.status === 'success') {
      previousId = String(previous.id)
      previousSha = String(previous.deployment_trigger?.metadata?.commit_hash || '')
      if (!/^[0-9a-f]{40}$/.test(previousSha)) throw new Error('Dev rollback baseline lacks an exact source SHA')
    } else if (previous?.id) {
      throw new Error('Dev Pages project has an ambiguous or unsuccessful canonical deployment')
    }
    writeOutput('project_id', project.id, env)
    writeOutput('project_name', DEV_PROJECT_NAME, env)
    writeOutput('project_origin', `https://${DEV_PROJECT_NAME}.pages.dev`, env)
    writeOutput('previous_deployment_id', previousId, env)
    writeOutput('previous_source_sha', previousSha, env)
    return { projectId: project.id, projectName: DEV_PROJECT_NAME, previousDeploymentId: previousId, previousSourceSha: previousSha }
  }

  if (command === 'capture-dev-candidate') {
    const commitSha = option(args, '--commit-sha')
    const manifestDigest = option(args, '--manifest-digest')
    const runIdentity = option(args, '--run-identity')
    const expectedProjectId = option(args, '--project-id')
    const receiptPath = option(args, '--receipt')
    const readinessPath = option(args, '--readiness-marker')
    if (!SHA_PATTERN.test(commitSha) || !DIGEST_PATTERN.test(manifestDigest)) throw new Error('Dev candidate identity is invalid')
    if (!runIdentity || !expectedProjectId || !receiptPath || !readinessPath) throw new Error('Dev candidate capture inputs are incomplete')
    const projectResponse = await api(projectPath(DEV_PROJECT_NAME))
    const project = projectResponse.result
    await validateDevProject({ api, project, productionProjectId: projectName === DEV_PROJECT_NAME ? '' : (await api(projectUrl)).result?.id })
    if (project.id !== expectedProjectId) throw new Error('Dev Pages project identity changed after preflight')
    const deployments = await api(`${projectPath(DEV_PROJECT_NAME)}/deployments?env=production&per_page=20`)
    if (!Array.isArray(deployments.result)) throw new Error('Dev Pages deployment inventory is unavailable')
    const exact = deployments.result.filter(item => item?.environment === 'production'
      && item?.project_id === expectedProjectId
      && item?.latest_stage?.status === 'success'
      && item?.deployment_trigger?.metadata?.commit_hash === commitSha
      && item?.deployment_trigger?.metadata?.commit_message === runIdentity
      && item?.deployment_trigger?.metadata?.branch === 'main')
    if (exact.length !== 1) throw new Error(`Expected one successful Dev deployment for the exact attempt; observed ${exact.length}`)
    const listed = exact[0]
    const deploymentId = String(listed.id || '')
    if (!/^[A-Za-z0-9-]{8,64}$/.test(deploymentId)) throw new Error('Dev deployment identifier is invalid')
    const detail = await api(`${projectPath(DEV_PROJECT_NAME)}/deployments/${encodeURIComponent(deploymentId)}`)
    const deployment = detail.result
    if (deployment.id !== deploymentId || deployment.project_id !== expectedProjectId || deployment.environment !== 'production'
      || deployment.latest_stage?.status !== 'success' || deployment.deployment_trigger?.metadata?.commit_hash !== commitSha
      || deployment.deployment_trigger?.metadata?.commit_message !== runIdentity) {
      throw new Error('Dev deployment detail does not prove the exact candidate')
    }
    const deploymentUrl = new URL(String(deployment.url || ''))
    if (deploymentUrl.protocol !== 'https:' || !isPagesDevHost(deploymentUrl.hostname)) throw new Error('Dev deployment URL is outside the isolated pages.dev project')
    const localMarker = await fsp.readFile(readinessPath, 'utf8')
    const response = await fetchImpl(`${deploymentUrl.origin}/.well-known/runtime-readiness.json`, {
      headers: { accept: 'application/json', 'cache-control': 'no-cache' }, cache: 'no-store', signal: AbortSignal.timeout(30_000),
    })
    const liveMarker = await response.text()
    if (response.status !== 200 || liveMarker !== localMarker) throw new Error('Dev Pages readiness marker bytes differ from the exact artifact')
    const parsedMarker = JSON.parse(liveMarker)
    if (parsedMarker?.source?.revision !== commitSha || parsedMarker?.immutableManifest?.digest !== manifestDigest) {
      throw new Error('Dev Pages readiness marker does not identify the exact candidate')
    }
    const receipt = {
      schema: 'agentic-graph-dev-deployment-receipt/v1', projectId: expectedProjectId, projectName: DEV_PROJECT_NAME,
      deploymentId, deploymentUrl: deploymentUrl.origin, runIdentity, sourceRevision: commitSha,
      immutableManifestDigest: manifestDigest, readinessMarkerDigest: createHash('sha256').update(liveMarker).digest('hex'),
      usesFunctions: deployment.uses_functions === true, observedAt: new Date().toISOString(),
    }
    if (receipt.usesFunctions) throw new Error('Dev candidate unexpectedly runs Pages Functions')
    await fsp.mkdir(path.dirname(path.resolve(receiptPath)), { recursive: true })
    await fsp.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' })
    writeOutput('deployment_id', deploymentId, env)
    writeOutput('deployment_url', deploymentUrl.origin, env)
    writeOutput('source_sha', commitSha, env)
    writeOutput('manifest_digest', manifestDigest, env)
    writeOutput('receipt_path', receiptPath, env)
    return receipt
  }

  if (command === 'enforce-direct-upload-owner') {
    let response = await api(projectUrl)
    let sourceConfig = response.result?.source?.config
    if (!sourceConfig) {
      console.log('Pages project has no Git source integration; Direct Upload is the sole deployment owner.')
    } else {
      if (sourceConfig.production_deployments_enabled !== false || sourceConfig.preview_deployment_setting !== 'none') {
        const sourceType = response.result?.source?.type
        if (sourceType !== 'github' && sourceType !== 'gitlab') throw new Error('Pages Git source type is invalid')
        response = await api(projectUrl, {
          method: 'PATCH',
          body: JSON.stringify({ source: { type: sourceType, config: { production_deployments_enabled: false, preview_deployment_setting: 'none' } } }),
        })
        sourceConfig = response.result?.source?.config
      }
      if (sourceConfig?.production_deployments_enabled !== false || sourceConfig?.preview_deployment_setting !== 'none') {
        throw new Error('Cloudflare Pages Git deployment ownership reconciliation did not converge')
      }
      console.log('Cloudflare Pages Git deployments are disabled; Direct Upload is now the sole deployment owner.')
    }
  } else if (command === 'capture-current') {
    const response = await api(`${baseUrl}?env=production&per_page=20`)
    const deployment = response.result?.find(item => item?.environment === 'production' && item?.latest_stage?.status === 'success')
    if (!deployment?.id) throw new Error('no successful production Pages deployment is available for rollback')
    const commitSha = String(deployment.deployment_trigger?.metadata?.commit_hash || '').trim()
    if (!SHA_PATTERN.test(commitSha)) throw new Error('the current production deployment has no exact 40-character rollback source SHA')
    writeOutput('deployment_id', deployment.id, env)
    writeOutput('commit_sha', commitSha, env)
    writeOutput('production_origin', productionPagesOrigin, env)
    console.log(`Captured production rollback target ${deployment.id}.`)
  } else if (command === 'capture-candidate') {
    const commitSha = option(args, '--commit-sha')
    if (!SHA_PATTERN.test(commitSha)) throw new Error('candidate commit SHA must be an exact lowercase 40-character SHA')
    const response = await api(`${baseUrl}?env=production&per_page=20`)
    const deployment = response.result?.find(item => item?.environment === 'production' && item?.latest_stage?.status === 'success' && item?.deployment_trigger?.metadata?.commit_hash === commitSha)
    if (!deployment?.id) throw new Error(`no successful production Pages deployment represents ${commitSha}`)
    const deploymentUrl = new URL(String(deployment.url || ''))
    if (deploymentUrl.protocol !== 'https:' || (deploymentUrl.hostname !== pagesHostname && !deploymentUrl.hostname.endsWith(`.${pagesHostname}`))) {
      throw new Error('candidate deployment URL is not an HTTPS origin owned by the configured Pages project')
    }
    writeOutput('deployment_id', deployment.id, env)
    writeOutput('deployment_url', deploymentUrl.origin, env)
    writeOutput('commit_sha', commitSha, env)
    console.log(`Captured exact candidate deployment ${deployment.id} for ${commitSha}.`)
  } else if (command === 'rollback') {
    const deploymentId = option(args, '--deployment-id')
    if (!/^[A-Za-z0-9-]{8,64}$/.test(deploymentId)) throw new Error('rollback deployment id is invalid')
    const response = await api(`${baseUrl}/${encodeURIComponent(deploymentId)}/rollback`, { method: 'POST' })
    if (!response.result?.id) throw new Error('Cloudflare rollback response did not identify a deployment')
    console.log(`Rolled production back to Pages deployment ${deploymentId}.`)
  } else {
    throw new Error('usage: pages-production-deployment.mjs <ensure-dev-project|prepare-dev-artifact|capture-dev-candidate|enforce-direct-upload-owner|capture-current|capture-candidate|rollback> [options]')
  }
}

async function validateDevProject({ api, project, productionProjectId }) {
  if (!project?.id || project.id === productionProjectId || project.name !== DEV_PROJECT_NAME) throw new Error('Dev Pages project identity is invalid or overlaps production')
  if (project.production_branch !== 'main') throw new Error('Dev Pages project production branch must be main')
  if (project.source && (project.source.type || hasNonEmptyValues(project.source.config))) throw new Error('Dev Pages project must have no Git source integration')
  if (hasNonEmptyValues(project.build_config) || project.web_analytics_tag || project.web_analytics_token) throw new Error('Dev Pages project must have no build integration or analytics injection')
  for (const environment of ['preview', 'production']) {
    const config = project.deployment_configs?.[environment] || {}
    for (const [key, value] of Object.entries(config)) {
      if (isEmpty(value)) continue
      if (!['always_use_latest_compatibility_date', 'build_image_major_version', 'compatibility_date', 'compatibility_flags', 'fail_open', 'usage_model'].includes(key)) {
        throw new Error(`Dev Pages ${environment} configuration must not contain ${key}`)
      }
      if (key === 'usage_model' && value !== 'standard') throw new Error('Dev Pages must retain the standard Free usage model')
    }
  }
  const domains = await api(`/pages/projects/${encodeURIComponent(DEV_PROJECT_NAME)}/domains`)
  if (!Array.isArray(domains.result) || domains.result.length !== 0) throw new Error('Dev Pages project must have no custom domains')
  return project
}

function createCloudflareClient({ accountId, apiToken, fetchImpl }) {
  const accountPath = `/accounts/${encodeURIComponent(accountId)}`
  return async (route, init = {}, { allowNotFound = false } = {}) => {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4${accountPath}${route}`, {
      ...init,
      headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json', ...init.headers },
      signal: init.signal || AbortSignal.timeout(30_000),
    })
    const payload = await response.json().catch(() => ({}))
    if (allowNotFound && response.status === 404) return null
    if (!response.ok || payload.success !== true) {
      const message = payload.errors?.map(error => error.message).filter(Boolean).join('; ') || `HTTP ${response.status}`
      throw new Error(`Cloudflare Pages deployment request failed: ${message}`)
    }
    return payload
  }
}

function addDevIsolationHeader(text) {
  const lines = text.split('\n')
  const roots = lines.map((line, index) => line.trim() === '/*' ? index : -1).filter(index => index >= 0)
  if (roots.length !== 1) throw new Error('Dev artifact needs one canonical global _headers rule')
  const start = roots[0]
  let end = lines.findIndex((line, index) => index > start && line.trim() === '')
  if (end < 0) end = lines.length
  if (lines.slice(start + 1, end).some(line => /^\s*Content-Security-Policy:/i.test(line))) throw new Error('Dev artifact already has an enforcing global CSP')
  lines.splice(end, 0, DEV_ISOLATION_HEADER)
  return lines.join('\n')
}

async function collectRegularFiles(root) {
  const files = []
  const visit = async relative => {
    const absolute = path.join(root, relative)
    const entries = await fsp.readdir(absolute, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const child = relative ? `${relative}/${entry.name}` : entry.name
      const childPath = path.join(root, child)
      const stat = await fsp.lstat(childPath)
      if (stat.isSymbolicLink()) throw new Error(`Artifact contains a symbolic link: ${child}`)
      if (stat.isDirectory()) await visit(child)
      else if (stat.isFile()) files.push({ relativePath: child, bytes: stat.size })
      else throw new Error(`Artifact contains an unsupported filesystem entry: ${child}`)
    }
  }
  await visit('')
  return files
}

async function digestFiles(root, files) {
  const hash = createHash('sha256')
  for (const file of files) {
    const bytes = await fsp.readFile(path.join(root, file.relativePath))
    hash.update(file.relativePath).update('\0').update(createHash('sha256').update(bytes).digest('hex')).update('\n')
  }
  return hash.digest('hex')
}

function hasNonEmptyValues(value) {
  if (!value || typeof value !== 'object') return value !== undefined && value !== null && value !== ''
  return Object.values(value).some(item => !isEmpty(item))
}

function isEmpty(value) {
  return value === undefined || value === null || value === '' || value === false || (Array.isArray(value) && value.length === 0)
    || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
}

function isPagesDevHost(hostname) {
  return hostname === `${DEV_PROJECT_NAME}.pages.dev` || hostname.endsWith(`.${DEV_PROJECT_NAME}.pages.dev`)
}

function validateProjectName(value) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) throw new Error('CLOUDFLARE_PAGES_PROJECT must be one lowercase DNS label')
}

function requiredEnv(name, env) {
  const value = String(env[name] || '').trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function option(values, name) {
  const index = values.indexOf(name)
  return index >= 0 ? String(values[index + 1] || '').trim() : ''
}

function writeOutput(name, value, env = process.env) {
  const outputPath = String(env.GITHUB_OUTPUT || '').trim()
  if (outputPath) fs.appendFileSync(outputPath, `${name}=${value}\n`, 'utf8')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runPagesProductionDeployment()
}
