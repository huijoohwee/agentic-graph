#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { hasFlag, readArgValue } from './stripe-payment-script-runtime.mjs'

const args = process.argv.slice(2)
const defaultOrigin = 'https://airvio.co'
const defaultWranglerConfig = 'cloudflare/workers/agentic-graph-payment/wrangler.toml'

const normalizeOriginUrl = (value) => {
  try {
    return new URL(String(value || defaultOrigin)).origin
  } catch {
    return defaultOrigin
  }
}

const normalizeBaseUrl = (value) => String(value || defaultOrigin).replace(/\/+$/, '')

const baseUrl = normalizeBaseUrl(readArgValue(args, '--base-url', process.env.AGENTIC_OS_PAYMENT_BASE_URL || defaultOrigin))
const originUrl = normalizeOriginUrl(readArgValue(args, '--origin', process.env.AGENTIC_OS_AGENT_READY_ORIGIN_URL || baseUrl))
const configPath = resolve(process.cwd(), readArgValue(args, '--config', defaultWranglerConfig))
const json = hasFlag(args, '--json')
const liveCheckoutCreate = hasFlag(args, '--live-checkout-create')

const runJsonScript = (name, scriptPath, scriptArgs) => {
  const output = spawnSync(process.execPath, [scriptPath, '--json', ...scriptArgs], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  const raw = String(output.stdout || '').trim()
  let summary = null
  try {
    summary = JSON.parse(raw || '{}')
  } catch (error) {
    return {
      name,
      status: 'fail',
      details: `Could not parse ${name} JSON: ${error.message}`,
      exitCode: output.status,
      stderr: String(output.stderr || '').trim(),
      stdout: raw,
    }
  }
  const status = output.status === 0 && summary?.ok === true ? 'pass' : 'fail'
  return {
    name,
    status,
    details: status === 'pass' ? `${name} passed.` : `${name} failed.`,
    exitCode: output.status,
    summary,
    stderr: String(output.stderr || '').trim(),
  }
}

const stripeArgs = ['--config', configPath]
if (baseUrl) stripeArgs.push('--base-url', baseUrl)
if (liveCheckoutCreate) stripeArgs.push('--live-checkout-create')

const components = [
  runJsonScript('stripe-payment-readiness', './scripts/check-stripe-payment-readiness.mjs', stripeArgs),
  runJsonScript('agentic-payment-readiness', './scripts/check-agentic-payment-readiness.mjs', ['--config', configPath]),
  runJsonScript('x402-payment-readiness', './scripts/check-agent-ready-commerce.mjs', ['--origin', originUrl]),
]

const checks = components.map(component => ({
  name: component.name,
  status: component.status,
  details: component.details,
}))
const failed = components.filter(component => component.status !== 'pass')
const summary = {
  ok: failed.length === 0,
  baseUrl,
  originUrl,
  wranglerConfig: configPath,
  liveCheckoutCreate,
  checks,
  components,
}

if (json) {
  console.log(JSON.stringify(summary, null, 2))
} else {
  for (const check of checks) {
    const line = `${check.status === 'pass' ? 'ok' : 'not ok'} ${check.name}: ${check.details}`
    if (check.status === 'pass') console.log(line)
    else console.error(line)
  }
  if (failed.length > 0) {
    console.error(`[agentic-graph] payment readiness failed: ${failed.length}/${components.length}`)
  } else {
    console.log(`[agentic-graph] payment readiness passed: ${components.length}/${components.length}`)
  }
}

if (failed.length > 0) process.exitCode = 1
