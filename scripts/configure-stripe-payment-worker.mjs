#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  hasFlag,
  loadStripePaymentSsot,
  readArgValue,
  readWorkerSecretNames,
  readWranglerVarsFromToml,
  updateWranglerVarsInToml,
} from './stripe-payment-script-runtime.mjs'

const {
  STRIPE_CHECKOUT_MODES,
  STRIPE_PAYMENT_D1_MIGRATION_APPLY_COMMAND_TEMPLATE,
  STRIPE_PAYMENT_ENV_KEYS,
  STRIPE_PAYMENT_OPERATOR_COMMANDS,
  STRIPE_PAYMENT_SECRET_ENV_NAMES,
  resolveStripeCheckoutServerConfig,
  validateStripeCheckoutReturnOrigin,
} = await loadStripePaymentSsot()

const defaultWranglerConfig = 'cloudflare/workers/agenticgraph-payment/wrangler.toml'
const applyConfirmation = STRIPE_PAYMENT_OPERATOR_COMMANDS.applyConfirmation
const args = process.argv.slice(2)

const options = {
  apply: hasFlag(args, '--apply'),
  configPath: resolve(process.cwd(), readArgValue(args, '--config', defaultWranglerConfig)),
  confirm: String(readArgValue(args, '--confirm', '') || ''),
  deployVisibleVars: hasFlag(args, STRIPE_PAYMENT_OPERATOR_COMMANDS.deployVisibleVarsFlag),
  json: hasFlag(args, '--json'),
  liveCheckoutCreate: hasFlag(args, '--live-checkout-create'),
  skipReadiness: hasFlag(args, '--skip-readiness'),
  writeVisibleVars: hasFlag(args, STRIPE_PAYMENT_OPERATOR_COMMANDS.writeVisibleVarsFlag),
  yes: hasFlag(args, '--yes'),
}

const checks = []
const actions = []
const sensitiveValues = []
const visibleVarUpdates = new Map()
const visibleVarRemovals = new Set()

const addCheck = (name, status, details) => {
  checks.push({ name, status, details })
}

const readEnv = (key) => String(process.env[key] || '').trim()
const hasEnv = (key) => Boolean(readEnv(key))

const addAction = (name) => {
  const value = readEnv(name)
  if (!value) return
  actions.push({ name, source: 'environment', target: 'cloudflare-worker-secret' })
  sensitiveValues.push(value)
}

const addVisibleVarAction = (name, value) => {
  visibleVarUpdates.set(name, value)
  actions.push({ name, source: 'environment', target: 'local-worker-vars' })
}

const redactKnownValues = (text) => {
  let redacted = String(text || '')
  for (const value of sensitiveValues) {
    if (!value) continue
    redacted = redacted.split(value).join('<redacted>')
  }
  return redacted
}

const serverKeyNames = [
  STRIPE_PAYMENT_ENV_KEYS.restrictedKey,
  STRIPE_PAYMENT_ENV_KEYS.secretKey,
]
const inlinePriceNames = [
  STRIPE_PAYMENT_ENV_KEYS.checkoutCurrency,
  STRIPE_PAYMENT_ENV_KEYS.checkoutUnitAmount,
  STRIPE_PAYMENT_ENV_KEYS.checkoutProductName,
]
const checkoutPriceAuthorityNames = [
  STRIPE_PAYMENT_ENV_KEYS.checkoutPriceId,
  ...inlinePriceNames,
]

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

const configVars = readConfigVars()
const configEnv = Object.fromEntries(configVars)
const visibleSecretNames = STRIPE_PAYMENT_SECRET_ENV_NAMES.filter((name) => configVars.has(name))
let workerSecretNames = null

const readExistingWorkerSecretNames = () => {
  if (workerSecretNames) return workerSecretNames
  const result = readWorkerSecretNames({ configPath: options.configPath })
  if (!result.ok) {
    addCheck('worker-secret-list', 'fail', result.error)
    workerSecretNames = new Set()
    return workerSecretNames
  }
  workerSecretNames = result.names
  addCheck('worker-secret-list', 'pass', `Read ${workerSecretNames.size} Worker secret name(s) from Wrangler.`)
  return workerSecretNames
}

const buildVisibleConfigEnv = () => {
  const next = { ...configEnv }
  for (const name of visibleVarRemovals) delete next[name]
  for (const [name, value] of visibleVarUpdates) next[name] = value
  return next
}

const validatePrefix = (key, prefix) => {
  const value = readEnv(key)
  if (!value) return false
  if (!value.startsWith(prefix)) {
    addCheck(`env-shape-${key}`, 'fail', `${key} must start with ${prefix}.`)
    return false
  }
  addCheck(`env-shape-${key}`, 'pass', `${key} is present with the expected prefix.`)
  return true
}

const validateReturnOrigin = () => {
  const key = STRIPE_PAYMENT_ENV_KEYS.checkoutReturnOrigin
  if (!hasEnv(key)) return
  const error = validateStripeCheckoutReturnOrigin(readEnv(key))
  if (error) {
    addCheck('stripe-checkout-return-origin-input', 'fail', error)
    return
  }
  addCheck(
    'stripe-checkout-return-origin-input',
    'fail',
    `${key} is non-secret Worker [vars] configuration; keep it in wrangler.toml [vars] so readiness can validate redirect authority.`,
  )
}

const validateServerKeys = () => {
  const suppliedServerKeys = serverKeyNames.filter(hasEnv)
  if (suppliedServerKeys.length > 1) {
    addCheck('stripe-server-key-input', 'fail', `Provide only one server key: ${serverKeyNames.join(' or ')}.`)
    return
  }
  if (hasEnv(STRIPE_PAYMENT_ENV_KEYS.restrictedKey)) {
    if (validatePrefix(STRIPE_PAYMENT_ENV_KEYS.restrictedKey, 'rk_')) {
      addAction(STRIPE_PAYMENT_ENV_KEYS.restrictedKey)
    }
    return
  }
  if (hasEnv(STRIPE_PAYMENT_ENV_KEYS.secretKey)) {
    if (validatePrefix(STRIPE_PAYMENT_ENV_KEYS.secretKey, 'sk_')) {
      addAction(STRIPE_PAYMENT_ENV_KEYS.secretKey)
    }
    return
  }
  const existingSecretNames = readExistingWorkerSecretNames()
  const existingServerKey = serverKeyNames.find((name) => existingSecretNames.has(name))
  if (existingServerKey) {
    addCheck('stripe-server-key-input', 'pass', `Existing ${existingServerKey} Worker secret is present; server key state is left unchanged.`)
    return
  }
  addCheck('stripe-server-key-input', 'skip', `No ${serverKeyNames.join(' or ')} value was supplied; existing Worker secret state is left unchanged.`)
}

const validateSecretScope = () => {
  if (visibleSecretNames.length === 0) {
    addCheck('stripe-secret-scope', 'pass', 'Stripe server credential names are absent from visible Worker [vars].')
    return
  }
  addCheck(
    'stripe-secret-scope',
    'fail',
    `Stripe server credential(s) must be Worker secrets, not visible Worker [vars]: ${visibleSecretNames.join(', ')}. Remove them from ${options.configPath} [vars] and apply ${serverKeyNames.join(' or ')} plus ${STRIPE_PAYMENT_ENV_KEYS.webhookSecret} with this helper.`,
  )
}

const validateWebhookSecret = () => {
  const key = STRIPE_PAYMENT_ENV_KEYS.webhookSecret
  if (!hasEnv(key)) {
    const existingSecretNames = readExistingWorkerSecretNames()
    if (existingSecretNames.has(key)) {
      addCheck('stripe-webhook-secret-input', 'pass', `Existing ${key} Worker secret is present; webhook secret state is left unchanged.`)
      return
    }
    addCheck('stripe-webhook-secret-input', 'fail', `Missing ${key} in the process environment and on the Worker secret surface.`)
    return
  }
  if (validatePrefix(key, 'whsec_')) addAction(key)
}

const validateCheckoutPriceAuthority = () => {
  const priceIdKey = STRIPE_PAYMENT_ENV_KEYS.checkoutPriceId
  const hasPriceIdInput = hasEnv(priceIdKey)
  const suppliedInlinePriceNames = inlinePriceNames.filter(hasEnv)
  const suppliedPriceAuthorityNames = checkoutPriceAuthorityNames.filter(hasEnv)
  if (hasPriceIdInput && suppliedInlinePriceNames.length > 0) {
    addCheck('stripe-checkout-price-authority-input', 'fail', `Provide ${priceIdKey} or the inline price tuple, not both.`)
    return
  }
  if (suppliedInlinePriceNames.length > 0 && suppliedInlinePriceNames.length !== inlinePriceNames.length) {
    addCheck('stripe-checkout-price-authority-input', 'fail', `Inline price authority requires all of ${inlinePriceNames.join(', ')}.`)
    return
  }
  if (suppliedPriceAuthorityNames.length > 0) {
    if (!options.writeVisibleVars) {
      const checkoutConfig = resolveStripeCheckoutServerConfig(process.env)
      if (!checkoutConfig.ok) {
        addCheck('stripe-checkout-price-authority-input', 'fail', checkoutConfig.error)
        return
      }
      addCheck(
        'stripe-checkout-price-authority-input',
        'fail',
        checkoutConfig.ok && checkoutConfig.priceId
          ? `${priceIdKey} is non-secret Worker [vars] configuration; keep checkout price authority in wrangler.toml [vars] so readiness can validate the exact Stripe price source. Pass ${STRIPE_PAYMENT_OPERATOR_COMMANDS.writeVisibleVarsFlag} --yes --confirm=${applyConfirmation} to update ${options.configPath}.`
          : `${inlinePriceNames.join(', ')} are non-secret Worker [vars] configuration; keep checkout price authority in wrangler.toml [vars] so readiness can validate the exact Stripe price source. Pass ${STRIPE_PAYMENT_OPERATOR_COMMANDS.writeVisibleVarsFlag} --yes --confirm=${applyConfirmation} to update ${options.configPath}.`,
      )
      return
    }
    if (hasPriceIdInput) {
      addVisibleVarAction(priceIdKey, readEnv(priceIdKey))
      for (const name of inlinePriceNames) visibleVarRemovals.add(name)
    } else {
      for (const name of inlinePriceNames) addVisibleVarAction(name, readEnv(name))
      visibleVarRemovals.add(priceIdKey)
    }
    const checkoutConfig = resolveStripeCheckoutServerConfig(buildVisibleConfigEnv())
    if (!checkoutConfig.ok) {
      addCheck('stripe-checkout-price-authority-input', 'fail', checkoutConfig.error)
      return
    }
    addCheck(
      'stripe-checkout-price-authority-input',
      'pass',
      checkoutConfig.priceId
        ? `Will write visible Worker [vars] checkout price authority as ${priceIdKey}. Deploy the payment Worker before live Checkout smoke.`
        : `Will write visible Worker [vars] checkout price authority as inline tuple: ${inlinePriceNames.join(', ')}. Deploy the payment Worker before live Checkout smoke.`,
    )
    return
  }
  const checkoutConfig = resolveStripeCheckoutServerConfig(configEnv)
  if (!checkoutConfig.ok) {
    addCheck('stripe-checkout-price-authority-input', 'fail', `Missing visible checkout price authority in Worker [vars]: ${checkoutConfig.error}`)
    return
  }
  if (checkoutConfig.priceId) {
    addCheck('stripe-checkout-price-authority-input', 'pass', `Visible Worker [vars] checkout price authority is configured as ${priceIdKey}.`)
  } else {
    addCheck('stripe-checkout-price-authority-input', 'pass', `Visible Worker [vars] checkout price authority is configured as inline tuple: ${inlinePriceNames.join(', ')}.`)
  }
}

const validateCheckoutMode = () => {
  const key = STRIPE_PAYMENT_ENV_KEYS.checkoutMode
  const value = readEnv(key)
  if (!value) {
    addCheck('stripe-checkout-mode-input', 'skip', `${key} is not supplied; Worker default payment mode remains active.`)
    return
  }
  if (!STRIPE_CHECKOUT_MODES.includes(value)) {
    addCheck('stripe-checkout-mode-input', 'fail', `${key} must be one of ${STRIPE_CHECKOUT_MODES.join(', ')}.`)
    return
  }
  addCheck(
    'stripe-checkout-mode-input',
    'fail',
    `${key} is non-secret Worker [vars] configuration; keep it in wrangler.toml [vars] so readiness can validate mode/price compatibility.`,
  )
}

validateSecretScope()
validateServerKeys()
validateWebhookSecret()
validateCheckoutPriceAuthority()
validateCheckoutMode()
validateReturnOrigin()

addCheck(
  'stripe-resource-mutation',
  'pass',
  'This helper does not create Stripe Products, Prices, Checkout Sessions, or webhook endpoints.',
)
addCheck(
  'worker-d1-migration-scope',
  'pass',
  `This helper does not mutate D1. Apply pending D1 migrations separately before deploy/readiness with: ${STRIPE_PAYMENT_D1_MIGRATION_APPLY_COMMAND_TEMPLATE}.`,
)
addCheck(
  'worker-visible-vars-deploy-scope',
  'pass',
  `Visible Worker [vars] changes are local ${options.configPath} updates. Deploy them with npm run payment:worker:deploy before live Checkout smoke.`,
)

const hasFailures = () => checks.some((check) => check.status === 'fail')
const hasVisibleVarMutation = () => visibleVarUpdates.size > 0 || visibleVarRemovals.size > 0
const secretActions = () => actions.filter((entry) => entry.target === 'cloudflare-worker-secret')
let deployedVisibleVars = false

const putWorkerSecret = (name) => {
  const value = readEnv(name)
  const output = spawnSync('npx', [
    '--yes',
    'wrangler',
    'secret',
    'put',
    name,
    '--config',
    options.configPath,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    input: `${value}\n`,
  })
  if (output.error || output.status !== 0) {
    const reason = output.error?.message || output.stderr || output.stdout || `wrangler exited ${output.status}`
    addCheck(`wrangler-secret-put-${name}`, 'fail', redactKnownValues(reason).trim())
    return false
  }
  addCheck(`wrangler-secret-put-${name}`, 'pass', `Applied ${name} with wrangler secret put.`)
  return true
}

const writeVisibleVars = () => {
  try {
    const configText = readFileSync(options.configPath, 'utf8')
    const nextConfigText = updateWranglerVarsInToml(configText, visibleVarUpdates, Array.from(visibleVarRemovals))
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
    addCheck('worker-visible-vars-deploy', 'fail', redactKnownValues(reason).trim())
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
      'Skipped because visible Worker [vars] changed locally. Deploy with npm run payment:worker:deploy, then run payment:stripe:readiness.',
    )
    return true
  }
  const readinessArgs = [
    'run',
    'payment:stripe:readiness',
    '--',
    '--config',
    options.configPath,
  ]
  if (options.liveCheckoutCreate) readinessArgs.push('--live-checkout-create')
  const output = spawnSync('npm', readinessArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  if (output.error || output.status !== 0) {
    const reason = output.error?.message || output.stdout || output.stderr || `readiness exited ${output.status}`
    addCheck('post-apply-readiness', 'fail', redactKnownValues(reason).trim())
    return false
  }
  addCheck('post-apply-readiness', 'pass', 'payment:stripe:readiness passed after applying Worker secrets.')
  return true
}

if (!hasFailures() && options.apply && (!options.yes || options.confirm !== applyConfirmation)) {
  addCheck(
    'apply-confirmation',
    'fail',
    `Applying Cloudflare Worker secrets requires --apply --yes --confirm=${applyConfirmation}.`,
  )
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

if (!hasFailures() && hasVisibleVarMutation()) {
  writeVisibleVars()
}

if (!hasFailures() && options.apply) {
  for (const action of secretActions()) {
    if (!putWorkerSecret(action.name)) break
  }
  if (!hasFailures()) deployVisibleVars()
  if (!hasFailures()) runReadiness()
}

if (!options.apply) {
  addCheck(
    'dry-run',
    hasFailures() ? 'skip' : 'pass',
    hasFailures()
      ? 'No Cloudflare changes were attempted because validation failed.'
      : `Would apply ${secretActions().length} Worker secret binding(s) with wrangler secret put. Pass --apply --yes --confirm=${applyConfirmation} to mutate Cloudflare.`,
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
  if (actions.length > 0) {
    console.log(`ACTIONS ${actions.map((action) => action.name).join(', ')}`)
  }
  console.log(`${summary.ok ? 'OK' : 'FAIL'} stripe-payment-worker-config`)
}

process.exit(summary.ok ? 0 : 1)
