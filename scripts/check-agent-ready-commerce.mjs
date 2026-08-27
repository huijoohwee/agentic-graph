#!/usr/bin/env node

import { readArgValue } from './stripe-payment-script-runtime.mjs'
import { buildAgentReadyCommerceChecks } from './agent-ready-commerce-checks.mjs'

const args = process.argv.slice(2)
const defaultOrigin = 'https://airvio.co'

const normalizeOriginUrl = (value) => {
  try {
    return new URL(String(value || defaultOrigin)).origin
  } catch {
    return defaultOrigin
  }
}

const baseUrlInput = readArgValue(
  args,
  '--base-url',
  process.env.AGENTICGRAPH_AGENT_READY_BASE_URL || `${defaultOrigin}/agenticgraph`,
)
const originUrl = normalizeOriginUrl(readArgValue(
  args,
  '--origin',
  process.env.AGENTICGRAPH_AGENT_READY_ORIGIN_URL || baseUrlInput,
))
const json = args.includes('--json')

const describeFailure = (response, body) => {
  const contentType = response.headers.get('content-type') || ''
  const routeOwner = response.headers.get('x-agenticgraph-route-owner') || ''
  const routeTag = response.headers.get('x-agenticgraph-route-tag') || ''
  const ownerDetails = routeOwner || routeTag
    ? `; routeOwner=${routeOwner || 'missing'}; routeTag=${routeTag || 'missing'}`
    : ''
  const bodyHint = body && !contentType.includes('json')
    ? `; body=${String(body).slice(0, 120).replace(/\s+/g, ' ').trim()}`
    : ''
  return `${response.status} ${contentType}${ownerDetails}${bodyHint}`
}

const results = []

for (const check of buildAgentReadyCommerceChecks({ originUrl })) {
  try {
    const response = await fetch(check.url, {
      method: check.method || 'GET',
      headers: { accept: check.accept },
      body: check.body,
    })
    const body = check.method === 'HEAD' ? '' : await response.text()
    const ok = await check.assert(response, body)
    results.push({
      name: check.name,
      status: ok ? 'pass' : 'fail',
      details: ok ? check.url : describeFailure(response, body),
    })
  } catch (error) {
    results.push({
      name: check.name,
      status: 'fail',
      details: error instanceof Error ? error.message : String(error),
    })
  }
}

const failed = results.filter(result => result.status !== 'pass').length

if (json) {
  console.log(JSON.stringify({
    ok: failed === 0,
    originUrl,
    checks: results,
  }, null, 2))
} else {
  for (const result of results) {
    if (result.status === 'pass') {
      console.log(`ok ${result.name}`)
    } else {
      console.error(`not ok ${result.name}: ${result.details}`)
    }
  }
  if (failed > 0) {
    console.error(`[agenticgraph] commerce readiness failed: ${failed}/${results.length}`)
  } else {
    console.log(`[agenticgraph] commerce readiness passed: ${results.length}/${results.length}`)
  }
}

if (failed > 0) process.exitCode = 1
