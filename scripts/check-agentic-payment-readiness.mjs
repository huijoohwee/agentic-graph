#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  hasFlag,
  loadAgenticCommerceSsot,
  readArgValue,
  readWorkerSecretNames,
  readWranglerVarsFromToml,
} from './stripe-payment-script-runtime.mjs'

const {
  AGENTIC_COMMERCE_ENV_KEYS,
  AGENTIC_COMMERCE_OPTIONAL_VISIBLE_ENV_KEYS,
  AGENTIC_COMMERCE_REQUIRED_SECRET_ENV_KEYS,
  AGENTIC_COMMERCE_REQUIRED_VISIBLE_ENV_KEYS,
} = await loadAgenticCommerceSsot()

const defaultWranglerConfig = 'cloudflare/workers/agenticgraph-payment/wrangler.toml'
const args = process.argv.slice(2)

const options = {
  configPath: resolve(process.cwd(), readArgValue(args, '--config', defaultWranglerConfig)),
  json: hasFlag(args, '--json'),
  skipWrangler: hasFlag(args, '--skip-wrangler'),
}

const results = []
const addResult = (name, status, details) => {
  results.push({ name, status, details })
}

const readConfigVars = () => {
  try {
    const configText = readFileSync(options.configPath, 'utf8')
    const vars = readWranglerVarsFromToml(configText)
    addResult('worker-vars-config', 'pass', `Read ${vars.size} [vars] name(s) from ${options.configPath}.`)
    return vars
  } catch (error) {
    addResult('worker-vars-config', 'fail', `Could not read ${options.configPath}: ${error.message}`)
    return new Map()
  }
}

const readSecretNames = () => {
  if (options.skipWrangler) {
    addResult('worker-secret-list', 'skip', 'Skipped by --skip-wrangler.')
    return new Set()
  }
  const result = readWorkerSecretNames({ configPath: options.configPath })
  if (!result.ok) {
    addResult('worker-secret-list', 'fail', result.error)
    return new Set()
  }
  addResult('worker-secret-list', 'pass', `Read ${result.names.size} Worker secret name(s) from Wrangler.`)
  return result.names
}

const isHttpUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim())
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

const isEvmAddress = (value) => /^0x[0-9a-fA-F]{40}$/.test(String(value || '').trim())
const isPositiveInteger = (value) => /^[1-9][0-9]*$/.test(String(value || '').trim())
const isBase58Value = (value) => /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(String(value || '').trim())
const isTruthyFlag = (value) => ['1', 'true', 'yes'].includes(String(value || '').trim().toLowerCase())

const configVars = readConfigVars()
const configVarNames = new Set(configVars.keys())
const secretNames = readSecretNames()

const missingVisibleNames = AGENTIC_COMMERCE_REQUIRED_VISIBLE_ENV_KEYS.filter((name) => !configVarNames.has(name))
addResult(
  'agentic-visible-vars-presence',
  missingVisibleNames.length > 0 ? 'fail' : 'pass',
  missingVisibleNames.length > 0
    ? `Missing required visible Worker [vars]: ${missingVisibleNames.join(', ')}.`
    : `Found ${AGENTIC_COMMERCE_REQUIRED_VISIBLE_ENV_KEYS.length} required visible Worker [vars] for agentic payment.`,
)

const visibleSecretNames = AGENTIC_COMMERCE_REQUIRED_SECRET_ENV_KEYS.filter((name) => configVarNames.has(name))
addResult(
  'agentic-secret-scope',
  visibleSecretNames.length > 0 ? 'fail' : 'pass',
  visibleSecretNames.length > 0
    ? `Secret-only env names must not appear in visible Worker [vars]: ${visibleSecretNames.join(', ')}.`
    : 'Agentic payment secret names are absent from visible Worker [vars].',
)

if (options.skipWrangler) {
  addResult('agentic-secret-presence', 'skip', 'Skipped by --skip-wrangler.')
} else {
  const missingSecretNames = AGENTIC_COMMERCE_REQUIRED_SECRET_ENV_KEYS.filter((name) => !secretNames.has(name))
  addResult(
    'agentic-secret-presence',
    missingSecretNames.length > 0 ? 'fail' : 'pass',
    missingSecretNames.length > 0
      ? `Missing required Worker secrets: ${missingSecretNames.join(', ')}.`
      : `Found required Worker secrets: ${AGENTIC_COMMERCE_REQUIRED_SECRET_ENV_KEYS.join(', ')}.`,
  )
}

const validateVisibleValue = (name, value) => {
  if (!String(value || '').trim()) return `${name} must not be empty.`
  switch (name) {
    case AGENTIC_COMMERCE_ENV_KEYS.sellerId:
      return null
    case AGENTIC_COMMERCE_ENV_KEYS.checkoutBaseUrl:
    case AGENTIC_COMMERCE_ENV_KEYS.baseRpcUrl:
    case AGENTIC_COMMERCE_ENV_KEYS.easAttestUrl:
    case AGENTIC_COMMERCE_ENV_KEYS.openboxApiUrl:
    case AGENTIC_COMMERCE_ENV_KEYS.openboxIngestUrl:
    case AGENTIC_COMMERCE_ENV_KEYS.stripeDelegatePaymentUrl:
    case AGENTIC_COMMERCE_ENV_KEYS.x402FacilitatorUrl:
    case 'SOLANA_PAY_RPC_URL':
      return isHttpUrl(value) ? null : `${name} must be an absolute http(s) URL.`
    case AGENTIC_COMMERCE_ENV_KEYS.web3Enabled:
      return isTruthyFlag(value) ? null : `${name} must be enabled for full agentic-payment readiness.`
    case AGENTIC_COMMERCE_ENV_KEYS.web3DepositAddress:
      return isEvmAddress(value) ? null : `${name} must be an operator-owned EVM address.`
    case AGENTIC_COMMERCE_ENV_KEYS.baseConfirmationBlocks:
    case AGENTIC_COMMERCE_ENV_KEYS.x402Amount:
      return isPositiveInteger(value) ? null : `${name} must be a positive integer string.`
    case AGENTIC_COMMERCE_ENV_KEYS.x402Network:
      return /^[a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,64}$/.test(String(value || '').trim())
        ? null
        : `${name} must follow CAIP-style network syntax such as eip155:84532.`
    case AGENTIC_COMMERCE_ENV_KEYS.x402Asset:
      return /^[A-Za-z0-9:_-]{2,128}$/.test(String(value || '').trim())
        ? null
        : `${name} must be a token symbol or asset identifier.`
    case AGENTIC_COMMERCE_ENV_KEYS.x402Price:
      return null
    case 'SOLANA_PAY_RECIPIENT':
      return isBase58Value(value) ? null : `${name} must be a base58 Solana address.`
    default:
      return null
  }
}

const invalidVisibleEntries = []
for (const name of AGENTIC_COMMERCE_REQUIRED_VISIBLE_ENV_KEYS) {
  const value = configVars.get(name)
  const error = validateVisibleValue(name, value)
  if (error) invalidVisibleEntries.push(error)
}

addResult(
  'agentic-visible-vars-values',
  invalidVisibleEntries.length > 0 ? 'fail' : 'pass',
  invalidVisibleEntries.length > 0
    ? invalidVisibleEntries.join(' ')
    : 'Required visible Worker [vars] values are syntactically valid for ACP, Web3, x402, OpenBOX, and Solana Pay.',
)

const optionalVisibleErrors = []
for (const name of AGENTIC_COMMERCE_OPTIONAL_VISIBLE_ENV_KEYS) {
  if (!configVarNames.has(name)) continue
  const value = String(configVars.get(name) || '').trim()
  if (!value) continue
  if (name === 'SOLANA_PAY_SPL_TOKEN' && !isBase58Value(value)) {
    optionalVisibleErrors.push(`${name} must be a base58 Solana mint address when configured.`)
  }
  if (name === 'SOLANA_PAY_AMOUNT_SCALE' && !isPositiveInteger(value)) {
    optionalVisibleErrors.push(`${name} must be a positive integer string when configured.`)
  }
  if (name === 'SOLANA_PAY_NETWORK' && !/^[a-z0-9_-]{3,32}$/i.test(value)) {
    optionalVisibleErrors.push(`${name} must be a simple network label when configured.`)
  }
  if (name === 'SOLANA_PAY_COMMITMENT' && !['processed', 'confirmed', 'finalized'].includes(value)) {
    optionalVisibleErrors.push(`${name} must be processed, confirmed, or finalized when configured.`)
  }
}

addResult(
  'agentic-optional-vars-values',
  optionalVisibleErrors.length > 0 ? 'fail' : 'pass',
  optionalVisibleErrors.length > 0
    ? optionalVisibleErrors.join(' ')
    : 'Optional agentic-payment Worker [vars] are either absent or valid.',
)

const hasFailures = results.some((result) => result.status === 'fail')
const summary = {
  ok: !hasFailures,
  wranglerConfig: options.configPath,
  checks: results,
}

if (options.json) {
  console.log(JSON.stringify(summary, null, 2))
} else {
  for (const result of results) {
    console.log(`${result.status.toUpperCase()} ${result.name}: ${result.details}`)
  }
  console.log(`${summary.ok ? 'OK' : 'FAIL'} agentic-payment-readiness`)
}

process.exit(hasFailures ? 1 : 0)
