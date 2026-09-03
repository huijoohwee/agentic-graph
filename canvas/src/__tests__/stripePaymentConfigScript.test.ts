import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

type ConfigSummary = {
  ok?: boolean
  actions?: Array<{ name?: string; source?: string; target?: string }>
  checks?: Array<{ name?: string; status?: string; details?: string }>
}

const repoRoot = resolve(process.cwd(), '..')
const scriptPath = resolve(repoRoot, 'scripts', 'configure-stripe-payment-worker.mjs')
const runtimePath = resolve(repoRoot, 'scripts', 'stripe-payment-script-runtime.mjs')

const STRIPE_ENV_KEYS = [
  'STRIPE_RESTRICTED_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CHECKOUT_PRICE_ID',
  'STRIPE_CHECKOUT_CURRENCY',
  'STRIPE_CHECKOUT_UNIT_AMOUNT',
  'STRIPE_CHECKOUT_PRODUCT_NAME',
  'STRIPE_CHECKOUT_MODE',
  'STRIPE_CHECKOUT_RETURN_ORIGIN',
]

const buildEnv = (overrides: Record<string, string> = {}) => {
  const env = { ...process.env }
  for (const key of STRIPE_ENV_KEYS) env[key] = ''
  return { ...env, ...overrides }
}

const DEFAULT_VISIBLE_PRICE_VARS = `
[vars]
STRIPE_CHECKOUT_PRICE_ID = "price_configured"
`

const runConfig = (
  env: Record<string, string>,
  extraArgs: string[] = [],
  varsToml = DEFAULT_VISIBLE_PRICE_VARS,
  secretNames: string[] = [],
) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'agentic-graph-stripe-config-'))
  const configPath = join(tempDir, 'wrangler.toml')
  const binDir = join(tempDir, 'bin')
  const npxPath = join(binDir, 'npx')
  mkdirSync(binDir, { recursive: true })
  writeFileSync(configPath, `name = "agentic-graph-payment-test"\n${varsToml.trim()}\n`, 'utf8')
  writeFileSync(npxPath, `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args.includes('secret') && args.includes('list')) {
  const names = String(process.env.SECRET_NAMES || '').split(',').filter(Boolean)
  console.log(JSON.stringify(names.map(name => ({ name }))))
  process.exit(0)
}
if (args.includes('secret') && args.includes('put')) process.exit(0)
if (args.includes('wrangler') && args.includes('deploy')) process.exit(0)
if (args.includes('deploy')) process.exit(0)
console.error('unexpected npx args ' + JSON.stringify(args))
process.exit(1)
`, 'utf8')
  chmodSync(npxPath, 0o755)
  try {
    const result = spawnSync(process.execPath, [
      scriptPath,
      '--json',
      '--config',
      configPath,
      ...extraArgs,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...buildEnv(env),
        PATH: `${binDir}:${process.env.PATH || ''}`,
        SECRET_NAMES: secretNames.join(','),
      },
    })
    const configText = readFileSync(configPath, 'utf8')
    const summary = JSON.parse(result.stdout || '{}') as ConfigSummary
    return { result, summary, configText }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

const readCheck = (summary: ConfigSummary, name: string) => {
  const check = summary.checks?.find(entry => entry.name === name)
  if (!check) throw new Error(`expected config check ${name}, got ${JSON.stringify(summary)}`)
  return check
}

export function testStripePaymentConfigScriptUsesSharedSsotAndWranglerSecrets() {
  const text = readFileSync(scriptPath, 'utf8')
  const runtimeText = readFileSync(runtimePath, 'utf8')
  if (!text.includes('stripe-payment-script-runtime.mjs') || !text.includes('resolveStripeCheckoutServerConfig') || !text.includes('validateStripeCheckoutReturnOrigin') || !text.includes('STRIPE_PAYMENT_OPERATOR_COMMANDS') || !text.includes('STRIPE_PAYMENT_D1_MIGRATION_APPLY_COMMAND_TEMPLATE') || !text.includes('STRIPE_PAYMENT_SECRET_ENV_NAMES')) {
    throw new Error('expected Stripe config script to reuse the shared script runtime and shared checkout config resolver')
  }
  if (text.includes("const applyConfirmation = 'apply-stripe-payment-worker-config'")) {
    throw new Error('expected Stripe config script to reuse the shared operator confirmation token')
  }
  if (!runtimeText.includes('grph-shared/src/payments/stripePaymentSsot.ts') || !runtimeText.includes('loadStripePaymentSsot')) {
    throw new Error('expected shared script runtime to own Stripe payment SSOT loading')
  }
  if (!text.includes("'wrangler',") || !text.includes("'secret',") || !text.includes("'put',")) {
    throw new Error('expected Stripe config script to apply Worker values with wrangler secret put')
  }
  if (text.includes('sk_live_') || text.includes('whsec_live_') || text.includes('price_live_')) {
    throw new Error('expected Stripe config script to avoid literal live secret examples')
  }
}

export function testStripePaymentConfigScriptFlagsMissingOperatorEnv() {
  const { result, summary } = runConfig({}, [], '')
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected missing operator env to fail config, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  if (readCheck(summary, 'stripe-webhook-secret-input').status !== 'fail') {
    throw new Error(`expected missing webhook secret to fail, got ${JSON.stringify(summary)}`)
  }
  if (readCheck(summary, 'stripe-checkout-price-authority-input').status !== 'fail') {
    throw new Error(`expected missing price authority to fail, got ${JSON.stringify(summary)}`)
  }
  if (readCheck(summary, 'dry-run').status !== 'skip') {
    throw new Error(`expected dry run to skip when validation fails, got ${JSON.stringify(summary)}`)
  }
}

export function testStripePaymentConfigScriptRejectsVisibleWorkerSecretVars() {
  const { result, summary } = runConfig({
    STRIPE_RESTRICTED_KEY: 'rk_test_config_secret_value_12345',
    STRIPE_WEBHOOK_SECRET: 'whsec_config_secret_value_12345',
  }, [], `
[vars]
STRIPE_SECRET_KEY = "sk_test_visible_must_fail"
STRIPE_WEBHOOK_SECRET = "whsec_visible_must_fail"
STRIPE_CHECKOUT_PRICE_ID = "price_configured"
`)
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected visible Worker credential vars to fail config, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const secretScope = readCheck(summary, 'stripe-secret-scope')
  if (
    secretScope.status !== 'fail'
    || !String(secretScope.details || '').includes('Worker secrets')
    || !String(secretScope.details || '').includes('STRIPE_SECRET_KEY')
    || !String(secretScope.details || '').includes('STRIPE_WEBHOOK_SECRET')
  ) {
    throw new Error(`expected visible server credentials to be rejected, got ${JSON.stringify(secretScope)}`)
  }
  if (summary.checks?.some(check => String(check.name || '').startsWith('wrangler-secret-put-'))) {
    throw new Error(`expected visible credential scope failure before wrangler secret put, got ${JSON.stringify(summary)}`)
  }
}

export function testStripePaymentConfigScriptDryRunListsNamesWithoutSecretValues() {
  const sensitiveValues = {
    STRIPE_RESTRICTED_KEY: 'rk_test_config_secret_value_12345',
    STRIPE_WEBHOOK_SECRET: 'whsec_config_secret_value_12345',
  }
  const { result, summary } = runConfig(sensitiveValues)
  if (result.status !== 0 || summary.ok !== true) {
    throw new Error(`expected valid dry-run config to pass, got ${JSON.stringify({ status: result.status, summary, stderr: result.stderr })}`)
  }
  const actionNames = new Set(summary.actions?.map(action => action.name))
  for (const name of Object.keys(sensitiveValues)) {
    if (!actionNames.has(name)) {
      throw new Error(`expected dry run to list action name ${name}, got ${JSON.stringify(summary.actions)}`)
    }
  }
  for (const value of Object.values(sensitiveValues)) {
    if (result.stdout.includes(value) || result.stderr.includes(value)) {
      throw new Error(`expected config dry run not to print secret value ${value}`)
    }
  }
  if (readCheck(summary, 'dry-run').status !== 'pass') {
    throw new Error(`expected dry run to pass, got ${JSON.stringify(summary)}`)
  }
  const d1Scope = readCheck(summary, 'worker-d1-migration-scope')
  if (d1Scope.status !== 'pass' || !String(d1Scope.details || '').includes('wrangler d1 migrations apply <DATABASE> --remote')) {
    throw new Error(`expected config helper to surface D1 migration scope without mutating D1, got ${JSON.stringify(d1Scope)}`)
  }
}

export function testStripePaymentConfigScriptRejectsCheckoutModeSecretInput() {
  const { result, summary } = runConfig({
    STRIPE_WEBHOOK_SECRET: 'whsec_config_secret_value_12345',
    STRIPE_CHECKOUT_MODE: 'subscription',
  })
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected checkout mode env input to fail config, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const checkoutMode = readCheck(summary, 'stripe-checkout-mode-input')
  if (
    checkoutMode.status !== 'fail'
    || !String(checkoutMode.details || '').includes('non-secret Worker [vars] configuration')
    || !String(checkoutMode.details || '').includes('mode/price compatibility')
  ) {
    throw new Error(`expected checkout mode to be rejected as secret configuration, got ${JSON.stringify(checkoutMode)}`)
  }
  if (summary.actions?.some(action => action.name === 'STRIPE_CHECKOUT_MODE')) {
    throw new Error(`expected checkout mode not to be listed as a Worker secret action, got ${JSON.stringify(summary.actions)}`)
  }
}

export function testStripePaymentConfigScriptRejectsCheckoutReturnOriginSecretInput() {
  const { result, summary } = runConfig({
    STRIPE_WEBHOOK_SECRET: 'whsec_config_secret_value_12345',
    STRIPE_CHECKOUT_RETURN_ORIGIN: 'https://airvio.co',
  })
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected checkout return origin env input to fail config, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const returnOrigin = readCheck(summary, 'stripe-checkout-return-origin-input')
  if (
    returnOrigin.status !== 'fail'
    || !String(returnOrigin.details || '').includes('non-secret Worker [vars] configuration')
    || !String(returnOrigin.details || '').includes('redirect authority')
  ) {
    throw new Error(`expected checkout return origin to be rejected as secret configuration, got ${JSON.stringify(returnOrigin)}`)
  }
  if (summary.actions?.some(action => action.name === 'STRIPE_CHECKOUT_RETURN_ORIGIN')) {
    throw new Error(`expected checkout return origin not to be listed as a Worker secret action, got ${JSON.stringify(summary.actions)}`)
  }
}

export function testStripePaymentConfigScriptRejectsCheckoutPriceAuthoritySecretInput() {
  const { result, summary } = runConfig({
    STRIPE_WEBHOOK_SECRET: 'whsec_config_secret_value_12345',
    STRIPE_CHECKOUT_PRICE_ID: 'price_config_secret_value_12345',
  })
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected checkout Price id env input to fail config, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const priceAuthority = readCheck(summary, 'stripe-checkout-price-authority-input')
  if (
    priceAuthority.status !== 'fail'
    || !String(priceAuthority.details || '').includes('non-secret Worker [vars] configuration')
    || !String(priceAuthority.details || '').includes('readiness can validate the exact Stripe price source')
  ) {
    throw new Error(`expected checkout Price id to be rejected as secret configuration, got ${JSON.stringify(priceAuthority)}`)
  }
  if (summary.actions?.some(action => action.name === 'STRIPE_CHECKOUT_PRICE_ID')) {
    throw new Error(`expected checkout Price id not to be listed as a Worker secret action, got ${JSON.stringify(summary.actions)}`)
  }
}

export function testStripePaymentConfigScriptWritesVisibleCheckoutPriceAuthorityWithConfirmation() {
  const { result, summary, configText } = runConfig({
    STRIPE_RESTRICTED_KEY: 'rk_test_config_secret_value_12345',
    STRIPE_WEBHOOK_SECRET: 'whsec_config_secret_value_12345',
    STRIPE_CHECKOUT_PRICE_ID: 'price_config_secret_value_12345',
  }, ['--write-visible-vars', '--yes', '--confirm=apply-stripe-payment-worker-config'], `
[vars]
STRIPE_CHECKOUT_CURRENCY = "usd"
STRIPE_CHECKOUT_UNIT_AMOUNT = "2500"
STRIPE_CHECKOUT_PRODUCT_NAME = "agentic-graph"
`)
  if (result.status !== 0 || summary.ok !== true) {
    throw new Error(`expected explicit visible checkout price write to pass, got ${JSON.stringify({ status: result.status, summary, stderr: result.stderr })}`)
  }
  const priceAuthority = readCheck(summary, 'stripe-checkout-price-authority-input')
  if (priceAuthority.status !== 'pass' || !String(priceAuthority.details || '').includes('Will write visible Worker [vars] checkout price authority as STRIPE_CHECKOUT_PRICE_ID')) {
    throw new Error(`expected visible checkout Price id write to pass, got ${JSON.stringify(priceAuthority)}`)
  }
  if (!configText.includes('STRIPE_CHECKOUT_PRICE_ID = "price_config_secret_value_12345"')) {
    throw new Error(`expected visible Price id to be written to wrangler vars, got ${configText}`)
  }
  for (const staleName of ['STRIPE_CHECKOUT_CURRENCY', 'STRIPE_CHECKOUT_UNIT_AMOUNT', 'STRIPE_CHECKOUT_PRODUCT_NAME']) {
    if (configText.includes(staleName)) {
      throw new Error(`expected stale inline checkout price var ${staleName} to be removed, got ${configText}`)
    }
  }
  if (!summary.actions?.some(action => action.name === 'STRIPE_CHECKOUT_PRICE_ID' && action.target === 'local-worker-vars')) {
    throw new Error(`expected visible Price id write action to target local-worker-vars, got ${JSON.stringify(summary.actions)}`)
  }
  const deployScope = readCheck(summary, 'worker-visible-vars-deploy-scope')
  if (deployScope.status !== 'pass' || !String(deployScope.details || '').includes('payment:worker:deploy')) {
    throw new Error(`expected helper to surface deploy requirement for visible vars, got ${JSON.stringify(deployScope)}`)
  }
}

export function testStripePaymentConfigScriptUsesExistingWorkerSecretsForVisiblePriceWrite() {
  const { result, summary, configText } = runConfig({
    STRIPE_CHECKOUT_PRICE_ID: 'price_config_secret_value_12345',
  }, ['--write-visible-vars', '--yes', '--confirm=apply-stripe-payment-worker-config'], '', [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ])
  if (result.status !== 0 || summary.ok !== true) {
    throw new Error(`expected existing Worker secrets to satisfy visible price write, got ${JSON.stringify({ status: result.status, summary, stderr: result.stderr })}`)
  }
  if (readCheck(summary, 'stripe-server-key-input').status !== 'pass') {
    throw new Error(`expected existing server key check to pass, got ${JSON.stringify(summary)}`)
  }
  if (readCheck(summary, 'stripe-webhook-secret-input').status !== 'pass') {
    throw new Error(`expected existing webhook secret check to pass, got ${JSON.stringify(summary)}`)
  }
  if (!configText.includes('STRIPE_CHECKOUT_PRICE_ID = "price_config_secret_value_12345"')) {
    throw new Error(`expected visible Price id to be written with existing Worker secrets, got ${configText}`)
  }
  if (summary.actions?.some(action => action.target === 'cloudflare-worker-secret')) {
    throw new Error(`expected existing Worker secret state not to create secret actions, got ${JSON.stringify(summary.actions)}`)
  }
}

export function testStripePaymentConfigScriptRequiresConfirmationBeforeWritingVisibleVars() {
  const { result, summary, configText } = runConfig({
    STRIPE_RESTRICTED_KEY: 'rk_test_config_secret_value_12345',
    STRIPE_WEBHOOK_SECRET: 'whsec_config_secret_value_12345',
    STRIPE_CHECKOUT_PRICE_ID: 'price_config_secret_value_12345',
  }, ['--write-visible-vars'], '')
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected visible var write without confirmation to fail, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  if (readCheck(summary, 'write-visible-vars-confirmation').status !== 'fail') {
    throw new Error(`expected visible var confirmation guard to fail, got ${JSON.stringify(summary)}`)
  }
  if (configText.includes('STRIPE_CHECKOUT_PRICE_ID')) {
    throw new Error(`expected visible Price id not to be written without confirmation, got ${configText}`)
  }
}

export function testStripePaymentConfigScriptRequiresApplyBeforeDeployingVisibleVars() {
  const { result, summary, configText } = runConfig({
    STRIPE_RESTRICTED_KEY: 'rk_test_config_secret_value_12345',
    STRIPE_WEBHOOK_SECRET: 'whsec_config_secret_value_12345',
    STRIPE_CHECKOUT_PRICE_ID: 'price_config_secret_value_12345',
  }, ['--write-visible-vars', '--deploy-visible-vars', '--yes', '--confirm=apply-stripe-payment-worker-config'], '')
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected visible var deploy without --apply to fail, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  if (readCheck(summary, 'deploy-visible-vars-apply').status !== 'fail') {
    throw new Error(`expected visible var deploy apply guard to fail, got ${JSON.stringify(summary)}`)
  }
  if (configText.includes('STRIPE_CHECKOUT_PRICE_ID')) {
    throw new Error(`expected visible Price id not to be written when deploy/apply guard fails, got ${configText}`)
  }
}

export function testStripePaymentConfigScriptRejectsInlineCheckoutPriceAuthoritySecretInput() {
  const { result, summary } = runConfig({
    STRIPE_WEBHOOK_SECRET: 'whsec_config_secret_value_12345',
    STRIPE_CHECKOUT_CURRENCY: 'usd',
    STRIPE_CHECKOUT_UNIT_AMOUNT: '2500',
    STRIPE_CHECKOUT_PRODUCT_NAME: 'agentic-graph',
  })
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected inline checkout price env input to fail config, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const priceAuthority = readCheck(summary, 'stripe-checkout-price-authority-input')
  if (
    priceAuthority.status !== 'fail'
    || !String(priceAuthority.details || '').includes('non-secret Worker [vars] configuration')
    || !String(priceAuthority.details || '').includes('readiness can validate the exact Stripe price source')
  ) {
    throw new Error(`expected inline checkout price tuple to be rejected as secret configuration, got ${JSON.stringify(priceAuthority)}`)
  }
  for (const name of ['STRIPE_CHECKOUT_CURRENCY', 'STRIPE_CHECKOUT_UNIT_AMOUNT', 'STRIPE_CHECKOUT_PRODUCT_NAME']) {
    if (summary.actions?.some(action => action.name === name)) {
      throw new Error(`expected ${name} not to be listed as a Worker secret action, got ${JSON.stringify(summary.actions)}`)
    }
  }
}

export function testStripePaymentConfigScriptAcceptsVisibleInlineCheckoutPriceAuthority() {
  const { result, summary } = runConfig({
    STRIPE_RESTRICTED_KEY: 'rk_test_config_secret_value_12345',
    STRIPE_WEBHOOK_SECRET: 'whsec_config_secret_value_12345',
  }, [], `
[vars]
STRIPE_CHECKOUT_CURRENCY = "usd"
STRIPE_CHECKOUT_UNIT_AMOUNT = "2500"
STRIPE_CHECKOUT_PRODUCT_NAME = "agentic-graph"
`)
  if (result.status !== 0 || summary.ok !== true) {
    throw new Error(`expected visible inline checkout price authority to pass config, got ${JSON.stringify({ status: result.status, summary, stderr: result.stderr })}`)
  }
  const priceAuthority = readCheck(summary, 'stripe-checkout-price-authority-input')
  if (priceAuthority.status !== 'pass' || !String(priceAuthority.details || '').includes('Visible Worker [vars]')) {
    throw new Error(`expected visible inline checkout price authority to pass, got ${JSON.stringify(priceAuthority)}`)
  }
}

export function testStripePaymentConfigScriptRejectsSubscriptionInlineTuple() {
  const { result, summary } = runConfig({
    STRIPE_WEBHOOK_SECRET: 'whsec_config_secret_value_12345',
    STRIPE_CHECKOUT_MODE: 'subscription',
    STRIPE_CHECKOUT_CURRENCY: 'usd',
    STRIPE_CHECKOUT_UNIT_AMOUNT: '2500',
    STRIPE_CHECKOUT_PRODUCT_NAME: 'agentic-graph',
  })
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected subscription inline tuple to fail config, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const priceAuthority = readCheck(summary, 'stripe-checkout-price-authority-input')
  if (priceAuthority.status !== 'fail' || !String(priceAuthority.details || '').includes('subscription requires STRIPE_CHECKOUT_PRICE_ID')) {
    throw new Error(`expected subscription mode to require Price id, got ${JSON.stringify(priceAuthority)}`)
  }
}

export function testStripePaymentConfigScriptRequiresExplicitApplyConfirmation() {
  const { result, summary } = runConfig({
    STRIPE_WEBHOOK_SECRET: 'whsec_config_secret_value_12345',
  }, ['--apply', '--skip-readiness'])
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected --apply without explicit confirmation to fail, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  if (readCheck(summary, 'apply-confirmation').status !== 'fail') {
    throw new Error(`expected apply confirmation guard to fail, got ${JSON.stringify(summary)}`)
  }
  if (summary.checks?.some(check => String(check.name || '').startsWith('wrangler-secret-put-'))) {
    throw new Error(`expected apply confirmation failure before wrangler secret put, got ${JSON.stringify(summary)}`)
  }
}
