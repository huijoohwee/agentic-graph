#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  hasFlag,
  loadAgenticCommerceSsot,
  loadStripePaymentSsot,
  readArgValue,
  readWranglerVarsFromToml,
  updateWranglerVarsInToml,
} from './stripe-payment-script-runtime.mjs'

const {
  AGENTIC_COMMERCE_ENV_KEYS,
  AGENTIC_COMMERCE_X402_FALLBACK_PAY_TO_ADDRESS,
  AGENTIC_COMMERCE_X402_PLACEHOLDER_PAY_TO_ADDRESS,
  readAgenticCommerceX402PayToAddress,
} = await loadAgenticCommerceSsot()
const {
  STRIPE_PAYMENT_OPERATOR_COMMANDS,
} = await loadStripePaymentSsot()

const defaultWranglerConfig = 'cloudflare/workers/agentic-graph-payment/wrangler.toml'
const applyConfirmation = STRIPE_PAYMENT_OPERATOR_COMMANDS.applyConfirmation
const args = process.argv.slice(2)

const options = {
  apply: hasFlag(args, '--apply'),
  configPath: resolve(process.cwd(), readArgValue(args, '--config', defaultWranglerConfig)),
  confirm: String(readArgValue(args, '--confirm', '') || ''),
  deployVisibleVars: hasFlag(args, STRIPE_PAYMENT_OPERATOR_COMMANDS.deployVisibleVarsFlag),
  json: hasFlag(args, '--json'),
  skipReadiness: hasFlag(args, '--skip-readiness'),
  writeVisibleVars: hasFlag(args, STRIPE_PAYMENT_OPERATOR_COMMANDS.writeVisibleVarsFlag),
  yes: hasFlag(args, '--yes'),
}

const checks = []
const actions = []
const visibleVarUpdates = new Map()

const addCheck = (name, status, details) => {
  checks.push({ name, status, details })
}

const readEnv = (key) => String(process.env[key] || '').trim()
const normalizeAddress = (value) => String(value || '').trim().toLowerCase()
const x402PayToKey = AGENTIC_COMMERCE_ENV_KEYS.x402PayToAddress

const addVisibleVarAction = (name, value) => {
  visibleVarUpdates.set(name, value)
  actions.push({ name, source: 'environment', target: 'local-worker-vars' })
}

const readConfigVars = () => {
  try {
    const configText = readFileSync(options.configPath, 'utf8')
    const vars = readWranglerVarsFromToml(configText)
    addCheck('worker-vars-config', 'pass', `Read ${vars.size} [vars] name(s) from ${options.configPath}.`)
    return vars
  } catch (error) {
    addCheck('worker-vars-config', 'fail', `Could not read ${options.configPath}: ${error.message}`)
    return new Map()
  }
}

const validateX402PayToAddress = (value, source) => {
  const normalized = String(value || '').trim()
  if (!/^0x[0-9a-fA-F]{40}$/.test(normalized)) {
    return `${x402PayToKey} from ${source} must be an EVM address.`
  }
  if (normalizeAddress(normalized) === normalizeAddress(AGENTIC_COMMERCE_X402_FALLBACK_PAY_TO_ADDRESS)) {
    return `${x402PayToKey} from ${source} must not equal the deterministic fallback payTo address.`
  }
  if (normalizeAddress(normalized) === normalizeAddress(AGENTIC_COMMERCE_X402_PLACEHOLDER_PAY_TO_ADDRESS)) {
    return `${x402PayToKey} from ${source} is only a future-setup placeholder; replace it with an operator-owned receiving wallet before deploying x402.`
  }
  return null
}

const configVars = readConfigVars()
const configEnv = Object.fromEntries(configVars)

const validateX402PayToInput = () => {
  const envValue = readEnv(x402PayToKey)
  if (envValue) {
    const error = validateX402PayToAddress(envValue, 'environment')
    if (error) {
      addCheck('x402-pay-to-address-input', 'fail', error)
      return
    }
    if (!options.writeVisibleVars) {
      addCheck(
        'x402-pay-to-address-input',
        'fail',
        `${x402PayToKey} is non-secret Worker [vars] configuration; pass ${STRIPE_PAYMENT_OPERATOR_COMMANDS.writeVisibleVarsFlag} --yes --confirm=${applyConfirmation} to update ${options.configPath}.`,
      )
      return
    }
    addVisibleVarAction(x402PayToKey, envValue)
    addCheck('x402-pay-to-address-input', 'pass', `Will write visible Worker [vars] x402 payTo authority as ${x402PayToKey}.`)
    return
  }

  const source = configVars.has(x402PayToKey) ? `${options.configPath} [vars]` : 'shared fallback'
  const configuredPayTo = configVars.has(x402PayToKey)
    ? configVars.get(x402PayToKey)
    : readAgenticCommerceX402PayToAddress(configEnv)
  const error = validateX402PayToAddress(configuredPayTo, source)
  if (error) {
    addCheck('x402-pay-to-address-input', 'fail', error)
    return
  }
  addCheck('x402-pay-to-address-input', 'pass', `Visible Worker [vars] x402 payTo authority is configured as ${x402PayToKey}.`)
}

validateX402PayToInput()

addCheck(
  'x402-resource-mutation',
  'pass',
  'This helper does not create wallets, tokens, facilitator resources, or onchain transactions.',
)
addCheck(
  'worker-visible-vars-deploy-scope',
  'pass',
  `Visible Worker [vars] changes are local ${options.configPath} updates. Deploy them with npm run payment:worker:deploy before x402 readiness.`,
)

const hasFailures = () => checks.some((check) => check.status === 'fail')
const hasVisibleVarMutation = () => visibleVarUpdates.size > 0
let deployedVisibleVars = false

const writeVisibleVars = () => {
  try {
    const configText = readFileSync(options.configPath, 'utf8')
    const nextConfigText = updateWranglerVarsInToml(configText, visibleVarUpdates)
    writeFileSync(options.configPath, nextConfigText, 'utf8')
    addCheck('worker-visible-vars-write', 'pass', `Updated visible Worker [vars] in ${options.configPath}.`)
    return true
  } catch (error) {
    addCheck('worker-visible-vars-write', 'fail', `Could not update ${options.configPath}: ${error.message}`)
    return false
  }
}

const deployVisibleVars = () => {
  if (!hasVisibleVarMutation() || !options.deployVisibleVars) return true
  const output = spawnSync('npx', [
    '--yes',
    'wrangler',
    'deploy',
    '--config',
    options.configPath,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  if (output.error || output.status !== 0) {
    const reason = output.error?.message || output.stderr || output.stdout || `wrangler exited ${output.status}`
    addCheck('worker-visible-vars-deploy', 'fail', String(reason).trim())
    return false
  }
  deployedVisibleVars = true
  addCheck('worker-visible-vars-deploy', 'pass', `Deployed visible Worker [vars] with wrangler deploy --config ${options.configPath}.`)
  return true
}

const runReadiness = () => {
  if (options.skipReadiness) {
    addCheck('post-apply-readiness', 'skip', 'Skipped by --skip-readiness.')
    return true
  }
  if (hasVisibleVarMutation() && !deployedVisibleVars) {
    addCheck(
      'post-apply-readiness',
      'skip',
      'Skipped because visible Worker [vars] changed locally. Deploy with npm run payment:worker:deploy, then run payment:x402:readiness.',
    )
    return true
  }
  const output = spawnSync('npm', ['run', 'payment:x402:readiness'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  if (output.error || output.status !== 0) {
    const reason = output.error?.message || output.stdout || output.stderr || `readiness exited ${output.status}`
    addCheck('post-apply-readiness', 'fail', String(reason).trim())
    return false
  }
  addCheck('post-apply-readiness', 'pass', 'payment:x402:readiness passed after applying visible Worker [vars].')
  return true
}

if (!hasFailures() && options.deployVisibleVars && !options.apply) {
  addCheck(
    'deploy-visible-vars-apply',
    'fail',
    `Deploying visible Worker [vars] requires --apply ${STRIPE_PAYMENT_OPERATOR_COMMANDS.deployVisibleVarsFlag} --yes --confirm=${applyConfirmation}.`,
  )
}

if (!hasFailures() && hasVisibleVarMutation() && (!options.yes || options.confirm !== applyConfirmation)) {
  addCheck(
    'write-visible-vars-confirmation',
    'fail',
    `Writing visible Worker [vars] requires ${STRIPE_PAYMENT_OPERATOR_COMMANDS.writeVisibleVarsFlag} --yes --confirm=${applyConfirmation}.`,
  )
}

if (!hasFailures() && hasVisibleVarMutation()) writeVisibleVars()

if (!hasFailures() && options.apply) {
  if (!hasFailures()) deployVisibleVars()
  if (!hasFailures()) runReadiness()
}

if (!options.apply) {
  addCheck(
    'dry-run',
    hasFailures() ? 'skip' : 'pass',
    hasFailures()
      ? 'No Cloudflare changes were attempted because validation failed.'
      : `Would update ${visibleVarUpdates.size} visible Worker [vars] binding(s). Pass --apply --yes --confirm=${applyConfirmation} to deploy through Wrangler when requested.`,
  )
}

const summary = {
  ok: !hasFailures(),
  applied: options.apply && !hasFailures(),
  wranglerConfig: options.configPath,
  actions,
  checks,
}

if (options.json) {
  console.log(JSON.stringify(summary, null, 2))
} else {
  for (const check of checks) {
    console.log(`${check.status.toUpperCase()} ${check.name}: ${check.details}`)
  }
  if (actions.length > 0) console.log(`ACTIONS ${actions.map((action) => action.name).join(', ')}`)
  console.log(`${summary.ok ? 'OK' : 'FAIL'} x402-payment-worker-config`)
}

process.exit(summary.ok ? 0 : 1)
