#!/usr/bin/env node

import fs from 'node:fs'

const [command, ...args] = process.argv.slice(2)
const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID')
const apiToken = requiredEnv('CLOUDFLARE_API_TOKEN')
const projectName = requiredEnv('CLOUDFLARE_PAGES_PROJECT')
if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(projectName)) {
  throw new Error('CLOUDFLARE_PAGES_PROJECT must be one lowercase DNS label')
}
const pagesHostname = `${projectName}.pages.dev`
const productionPagesOrigin = new URL(`https://${pagesHostname}`).origin
const projectUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}`
const baseUrl = `${projectUrl}/deployments`

if (command === 'enforce-direct-upload-owner') {
  let response = await cloudflare(projectUrl)
  let sourceConfig = response.result?.source?.config
  if (!sourceConfig) {
    console.log('Pages project has no Git source integration; Direct Upload is the sole deployment owner.')
  } else {
    if (sourceConfig.production_deployments_enabled !== false || sourceConfig.preview_deployment_setting !== 'none') {
      const sourceType = response.result?.source?.type
      if (sourceType !== 'github' && sourceType !== 'gitlab') throw new Error('Pages Git source type is invalid')
      response = await cloudflare(projectUrl, {
        method: 'PATCH',
        body: JSON.stringify({
          source: {
            type: sourceType,
            config: {
              production_deployments_enabled: false,
              preview_deployment_setting: 'none',
            },
          },
        }),
      })
      sourceConfig = response.result?.source?.config
    }
    if (sourceConfig?.production_deployments_enabled !== false || sourceConfig?.preview_deployment_setting !== 'none') {
      throw new Error('Cloudflare Pages Git deployment ownership reconciliation did not converge')
    }
    console.log('Cloudflare Pages Git deployments are disabled; Direct Upload is now the sole deployment owner.')
  }
} else if (command === 'capture-current') {
  const response = await cloudflare(`${baseUrl}?env=production&per_page=20`)
  const deployment = response.result?.find(item => (
    item?.environment === 'production' && item?.latest_stage?.status === 'success'
  ))
  if (!deployment?.id) throw new Error('no successful production Pages deployment is available for rollback')
  const commitSha = String(deployment.deployment_trigger?.metadata?.commit_hash || '').trim()
  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new Error('the current production deployment has no exact 40-character rollback source SHA')
  }
  writeOutput('deployment_id', deployment.id)
  writeOutput('commit_sha', commitSha)
  writeOutput('production_origin', productionPagesOrigin)
  console.log(`Captured production rollback target ${deployment.id}.`)
} else if (command === 'capture-candidate') {
  const commitSha = option(args, '--commit-sha')
  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new Error('candidate commit SHA must be an exact lowercase 40-character SHA')
  }
  const response = await cloudflare(`${baseUrl}?env=production&per_page=20`)
  const deployment = response.result?.find(item => (
    item?.environment === 'production'
      && item?.latest_stage?.status === 'success'
      && item?.deployment_trigger?.metadata?.commit_hash === commitSha
  ))
  if (!deployment?.id) throw new Error(`no successful production Pages deployment represents ${commitSha}`)
  const deploymentUrl = new URL(String(deployment.url || ''))
  if (
    deploymentUrl.protocol !== 'https:'
      || (deploymentUrl.hostname !== pagesHostname && !deploymentUrl.hostname.endsWith(`.${pagesHostname}`))
  ) {
    throw new Error('candidate deployment URL is not an HTTPS origin owned by the configured Pages project')
  }
  writeOutput('deployment_id', deployment.id)
  writeOutput('deployment_url', deploymentUrl.origin)
  writeOutput('commit_sha', commitSha)
  console.log(`Captured exact candidate deployment ${deployment.id} for ${commitSha}.`)
} else if (command === 'rollback') {
  const deploymentId = option(args, '--deployment-id')
  if (!/^[A-Za-z0-9-]{8,64}$/.test(deploymentId)) throw new Error('rollback deployment id is invalid')
  const response = await cloudflare(`${baseUrl}/${encodeURIComponent(deploymentId)}/rollback`, { method: 'POST' })
  if (!response.result?.id) throw new Error('Cloudflare rollback response did not identify a deployment')
  console.log(`Rolled production back to Pages deployment ${deploymentId}.`)
} else {
  throw new Error('usage: pages-production-deployment.mjs <enforce-direct-upload-owner|capture-current|capture-candidate|rollback> [options]')
}

async function cloudflare(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${apiToken}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.success !== true) {
    const message = payload.errors?.map(error => error.message).filter(Boolean).join('; ') || `HTTP ${response.status}`
    throw new Error(`Cloudflare Pages deployment request failed: ${message}`)
  }
  return payload
}

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function option(values, name) {
  const index = values.indexOf(name)
  return index >= 0 ? String(values[index + 1] || '').trim() : ''
}

function writeOutput(name, value) {
  const outputPath = String(process.env.GITHUB_OUTPUT || '').trim()
  if (!outputPath) throw new Error('GITHUB_OUTPUT is required')
  fs.appendFileSync(outputPath, `${name}=${value}\n`, 'utf8')
}
