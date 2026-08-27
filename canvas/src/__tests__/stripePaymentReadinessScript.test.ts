import { readFileSync } from 'node:fs'
import {
  REQUIRED_D1_COLUMNS,
  REQUIRED_D1_NULLABLE_COLUMNS,
  REQUIRED_D1_TABLES,
  readCheck,
  runReadiness,
  runReadinessWithFakeWrangler,
  runReadinessWithFakeWranglerAsync,
  runtimePath,
  scriptPath,
  wait,
  webhookProcessingMigrationPath,
  withLocalPaymentRoute,
} from './helpers/stripePaymentReadinessScriptHarness'

export function testStripePaymentReadinessScriptUsesSharedPaymentSsot() {
  const text = readFileSync(scriptPath, 'utf8')
  const runtimeText = readFileSync(runtimePath, 'utf8')
  if (!text.includes('stripe-payment-script-runtime.mjs') || !text.includes('loadStripePaymentSsot')) {
    throw new Error('expected Stripe readiness script to load the shared payment SSOT through the shared script runtime')
  }
  if (!runtimeText.includes('grph-shared/src/payments/stripePaymentSsot.ts') || !runtimeText.includes('grph-shared/dist/payments/stripePaymentSsot.js')) {
    throw new Error('expected Stripe script runtime to resolve the shared payment SSOT source and generated runtime path')
  }
  if (!runtimeText.includes("npm', ['--prefix', 'canvas', 'run', 'build:grph-shared']")) {
    throw new Error('expected Stripe script runtime to rebuild grph-shared before loading ignored dist output')
  }
  if (text.includes('const STRIPE_PAYMENT_ENV_KEYS =') || text.includes('const STRIPE_PAYMENT_ROUTE_PATHS =')) {
    throw new Error('expected Stripe readiness script to avoid local Stripe env/route constant copies')
  }
  if (!text.includes('STRIPE_PAYMENT_REQUIRED_D1_TABLES') || !text.includes('STRIPE_PAYMENT_REQUIRED_D1_COLUMNS') || !text.includes('STRIPE_PAYMENT_REQUIRED_D1_NULLABLE_COLUMNS') || !text.includes('STRIPE_PAYMENT_D1_MIGRATION_APPLY_COMMAND_TEMPLATE') || !text.includes('STRIPE_PAYMENT_SECRET_ENV_NAMES') || !text.includes('STRIPE_PAYMENT_LIVE_CHECKOUT_TIMEOUT_MS') || !text.includes('validateStripeCheckoutReturnOrigin') || !text.includes("'d1'") || !text.includes("'execute'")) {
    throw new Error('expected Stripe readiness script to reuse shared D1 table/column/constraint/command names and inspect D1 through wrangler d1 execute')
  }
  if (!text.includes('--live-checkout-timeout-ms') || !text.includes('AbortController')) {
    throw new Error('expected Stripe readiness script to bound the optional live Checkout smoke instead of relying on an unbounded fetch')
  }
}

export function testStripePaymentReadinessMigrationRebuildsWebhookEventsForNullableProcessedAt() {
  const migrationText = readFileSync(webhookProcessingMigrationPath, 'utf8')
  const compact = migrationText.replace(/\s+/g, ' ')
  for (const requiredSnippet of [
    'DROP TABLE IF EXISTS stripe_webhook_events_next',
    'CREATE TABLE IF NOT EXISTS stripe_webhook_events_next',
    'processed_at TEXT',
    'processing_status TEXT NOT NULL DEFAULT',
    'INSERT INTO stripe_webhook_events_next',
    'FROM stripe_webhook_events',
    'DROP TABLE stripe_webhook_events',
    'ALTER TABLE stripe_webhook_events_next RENAME TO stripe_webhook_events',
    'idx_stripe_webhook_events_type_received',
    'idx_stripe_webhook_events_processing_status',
  ]) {
    if (!compact.includes(requiredSnippet)) {
      throw new Error(`expected webhook processing migration to include ${requiredSnippet}`)
    }
  }
  if (compact.includes('processed_at TEXT NOT NULL')) {
    throw new Error('expected webhook processing migration to rebuild processed_at as nullable for in-flight claims')
  }
}

export function testStripePaymentReadinessScriptFlagsMissingProductionConfig() {
  const { result, summary } = runReadiness(`
[vars]
`, ['--live-checkout-create'])
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected missing production config to fail readiness, got ${JSON.stringify({ status: result.status, stdout: result.stdout, stderr: result.stderr })}`)
  }
  if (readCheck(summary, 'stripe-secret-scope').status !== 'pass') {
    throw new Error(`expected visible secret scope to pass when [vars] has no credentials, got ${JSON.stringify(summary)}`)
  }
  if (readCheck(summary, 'stripe-server-key').status !== 'fail') {
    throw new Error(`expected missing server key to fail, got ${JSON.stringify(summary)}`)
  }
  if (readCheck(summary, 'stripe-webhook-secret').status !== 'fail') {
    throw new Error(`expected missing webhook secret to fail, got ${JSON.stringify(summary)}`)
  }
  if (readCheck(summary, 'stripe-checkout-price-authority').status !== 'fail') {
    throw new Error(`expected missing price authority to fail, got ${JSON.stringify(summary)}`)
  }
  if (readCheck(summary, 'live-checkout-create').status !== 'skip') {
    throw new Error(`expected live Checkout create to be skipped while config is incomplete, got ${JSON.stringify(summary)}`)
  }
  if (readCheck(summary, 'worker-d1-schema').status !== 'skip') {
    throw new Error(`expected D1 schema check to be skipped with --skip-wrangler, got ${JSON.stringify(summary)}`)
  }
}

export function testStripePaymentReadinessScriptRejectsVisibleWorkerSecretVars() {
  const { result, summary } = runReadinessWithFakeWrangler({
    varsToml: `
[vars]
STRIPE_SECRET_KEY = "sk_test_visible_must_fail"
STRIPE_WEBHOOK_SECRET = "whsec_visible_must_fail"
STRIPE_CHECKOUT_PRICE_ID = "price_configured"
`,
    d1Tables: REQUIRED_D1_TABLES,
    d1Columns: REQUIRED_D1_COLUMNS,
  })
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected visible Worker credential vars to fail readiness, got ${JSON.stringify({ status: result.status, summary })}`)
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
}

export function testStripePaymentReadinessScriptRejectsSubscriptionWithoutPriceId() {
  const { result, summary } = runReadinessWithFakeWrangler({
    varsToml: `
[vars]
STRIPE_CHECKOUT_MODE = "subscription"
STRIPE_CHECKOUT_CURRENCY = "usd"
STRIPE_CHECKOUT_UNIT_AMOUNT = "2500"
STRIPE_CHECKOUT_PRODUCT_NAME = "AgenticGraph"
`,
    d1Tables: REQUIRED_D1_TABLES,
    d1Columns: REQUIRED_D1_COLUMNS,
  })
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected subscription mode without Price id to fail readiness, got ${JSON.stringify(summary)}`)
  }
  const priceAuthority = readCheck(summary, 'stripe-checkout-price-authority')
  if (priceAuthority.status !== 'fail' || !String(priceAuthority.details || '').includes('STRIPE_CHECKOUT_MODE=subscription requires STRIPE_CHECKOUT_PRICE_ID')) {
    throw new Error(`expected subscription mode to require a Stripe Price id, got ${JSON.stringify(priceAuthority)}`)
  }
}

export function testStripePaymentReadinessScriptPassesCompleteServerConfigWithoutLiveCreate() {
  const { result, summary } = runReadinessWithFakeWrangler({
    varsToml: `
[vars]
STRIPE_CHECKOUT_MODE = "subscription"
STRIPE_CHECKOUT_PRICE_ID = "price_configured"
`,
    d1Tables: REQUIRED_D1_TABLES,
    d1Columns: REQUIRED_D1_COLUMNS,
  })
  if (result.status !== 0 || summary.ok !== true) {
    throw new Error(`expected complete server config to pass readiness without live create, got ${JSON.stringify({ status: result.status, summary, stderr: result.stderr })}`)
  }
  if (readCheck(summary, 'stripe-checkout-mode').status !== 'pass') {
    throw new Error(`expected checkout mode to pass, got ${JSON.stringify(summary)}`)
  }
  if (readCheck(summary, 'stripe-checkout-price-authority').status !== 'pass') {
    throw new Error(`expected checkout price authority to pass, got ${JSON.stringify(summary)}`)
  }
  if (readCheck(summary, 'live-checkout-create').status !== 'skip') {
    throw new Error(`expected live Checkout create to be skipped by default, got ${JSON.stringify(summary)}`)
  }
}

export async function testStripePaymentReadinessScriptLiveSmokeRequiresExpiredWorkerSession() {
  const requests: Array<{ method?: string; url?: string; body: Record<string, unknown> }> = []
  await withLocalPaymentRoute((request) => {
    const body = JSON.parse(request.body || '{}') as Record<string, unknown>
    requests.push({ method: request.method, url: request.url, body })
    return {
      status: 200,
      body: {
        ok: true,
        id: 'cs_readiness_smoke_expired',
        status: 'expired',
        paymentStatus: 'unpaid',
        readinessSmoke: true,
      },
    }
  }, async (baseUrl) => {
    const { result, summary } = await runReadinessWithFakeWranglerAsync({
      varsToml: `
[vars]
STRIPE_CHECKOUT_PRICE_ID = "price_configured"
`,
      d1Tables: REQUIRED_D1_TABLES,
      d1Columns: REQUIRED_D1_COLUMNS,
      extraArgs: ['--live-checkout-create', '--base-url', baseUrl],
    })
    if (result.status !== 0 || summary.ok !== true) {
      throw new Error(`expected live readiness smoke to pass with expired Worker Session response, got ${JSON.stringify({ status: result.status, summary, stderr: result.stderr })}`)
    }
    const liveCheck = readCheck(summary, 'live-checkout-create')
    if (liveCheck.status !== 'pass' || !String(liveCheck.details || '').includes('Created and expired hosted Checkout Session cs_readiness_smoke_expired')) {
      throw new Error(`expected live readiness smoke to report create-and-expire, got ${JSON.stringify(liveCheck)}`)
    }
  })

  if (requests.length !== 1) {
    throw new Error(`expected one local payment route request, got ${JSON.stringify(requests)}`)
  }
  const request = requests[0]
  if (
    request.method !== 'POST'
    || request.url !== '/api/payments/stripe/checkout/session'
    || request.body.readinessSmoke !== true
    || request.body.workspaceId !== 'stripe-readiness-smoke'
  ) {
    throw new Error(`expected readiness script to request an expiring Worker smoke Session, got ${JSON.stringify(request)}`)
  }
}

export async function testStripePaymentReadinessScriptLiveSmokeTimesOut() {
  const requests: Array<{ method?: string; url?: string; body: Record<string, unknown> }> = []
  await withLocalPaymentRoute(async (request) => {
    const body = JSON.parse(request.body || '{}') as Record<string, unknown>
    requests.push({ method: request.method, url: request.url, body })
    await wait(1000)
    return {
      status: 200,
      body: {
        ok: true,
        id: 'cs_readiness_smoke_late',
        status: 'expired',
        paymentStatus: 'unpaid',
        readinessSmoke: true,
      },
    }
  }, async (baseUrl) => {
    const { result, summary } = await runReadinessWithFakeWranglerAsync({
      varsToml: `
[vars]
STRIPE_CHECKOUT_PRICE_ID = "price_configured"
`,
      d1Tables: REQUIRED_D1_TABLES,
      d1Columns: REQUIRED_D1_COLUMNS,
      extraArgs: ['--live-checkout-create', '--base-url', baseUrl, '--live-checkout-timeout-ms', '250'],
    })
    if (result.status === 0 || summary.ok !== false) {
      throw new Error(`expected live readiness smoke timeout to fail readiness, got ${JSON.stringify({ status: result.status, summary, stderr: result.stderr })}`)
    }
    const liveCheck = readCheck(summary, 'live-checkout-create')
    if (liveCheck.status !== 'fail' || !String(liveCheck.details || '').includes('Timed out after 250ms')) {
      throw new Error(`expected live readiness smoke timeout to be reported, got ${JSON.stringify(liveCheck)}`)
    }
  })

  if (requests.length > 0 && requests[0]?.body.readinessSmoke !== true) {
    throw new Error(`expected timeout smoke to use readinessSmoke payload, got ${JSON.stringify(requests)}`)
  }
}

export function testStripePaymentReadinessScriptRejectsCheckoutModeSecret() {
  const { result, summary } = runReadinessWithFakeWrangler({
    varsToml: `
[vars]
STRIPE_CHECKOUT_PRICE_ID = "price_configured"
`,
    d1Tables: REQUIRED_D1_TABLES,
    d1Columns: REQUIRED_D1_COLUMNS,
    secretNames: ['STRIPE_CHECKOUT_MODE'],
  })
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected hidden checkout mode secret to fail readiness, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const checkoutMode = readCheck(summary, 'stripe-checkout-mode')
  if (
    checkoutMode.status !== 'fail'
    || !String(checkoutMode.details || '').includes('non-secret Worker [vars] configuration')
    || !String(checkoutMode.details || '').includes('mode/price compatibility')
  ) {
    throw new Error(`expected hidden checkout mode secret to be rejected, got ${JSON.stringify(checkoutMode)}`)
  }
}

export function testStripePaymentReadinessScriptRejectsCheckoutReturnOriginSecret() {
  const { result, summary } = runReadinessWithFakeWrangler({
    varsToml: `
[vars]
STRIPE_CHECKOUT_PRICE_ID = "price_configured"
`,
    d1Tables: REQUIRED_D1_TABLES,
    d1Columns: REQUIRED_D1_COLUMNS,
    secretNames: ['STRIPE_CHECKOUT_RETURN_ORIGIN'],
  })
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected hidden checkout return origin secret to fail readiness, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const returnOrigin = readCheck(summary, 'stripe-checkout-return-origin')
  if (
    returnOrigin.status !== 'fail'
    || !String(returnOrigin.details || '').includes('non-secret Worker [vars] configuration')
    || !String(returnOrigin.details || '').includes('redirect authority')
  ) {
    throw new Error(`expected hidden checkout return origin secret to be rejected, got ${JSON.stringify(returnOrigin)}`)
  }
}

export function testStripePaymentReadinessScriptAcceptsVisibleCheckoutReturnOrigin() {
  const { result, summary } = runReadinessWithFakeWrangler({
    varsToml: `
[vars]
STRIPE_CHECKOUT_PRICE_ID = "price_configured"
STRIPE_CHECKOUT_RETURN_ORIGIN = "https://airvio.co"
`,
    d1Tables: REQUIRED_D1_TABLES,
    d1Columns: REQUIRED_D1_COLUMNS,
  })
  if (result.status !== 0 || summary.ok !== true) {
    throw new Error(`expected visible checkout return origin to pass readiness, got ${JSON.stringify({ status: result.status, summary, stderr: result.stderr })}`)
  }
  const returnOrigin = readCheck(summary, 'stripe-checkout-return-origin')
  if (returnOrigin.status !== 'pass' || !String(returnOrigin.details || '').includes('https://airvio.co')) {
    throw new Error(`expected visible checkout return origin to be reported, got ${JSON.stringify(returnOrigin)}`)
  }
}

export function testStripePaymentReadinessScriptRejectsCheckoutPriceAuthoritySecret() {
  const { result, summary } = runReadinessWithFakeWrangler({
    varsToml: `
[vars]
`,
    d1Tables: REQUIRED_D1_TABLES,
    d1Columns: REQUIRED_D1_COLUMNS,
    secretNames: ['STRIPE_CHECKOUT_PRICE_ID'],
  })
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected hidden checkout Price id secret to fail readiness, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const priceAuthority = readCheck(summary, 'stripe-checkout-price-authority')
  if (
    priceAuthority.status !== 'fail'
    || !String(priceAuthority.details || '').includes('non-secret Worker [vars] configuration')
    || !String(priceAuthority.details || '').includes('STRIPE_CHECKOUT_PRICE_ID')
    || !String(priceAuthority.details || '').includes('exact Stripe price source')
  ) {
    throw new Error(`expected hidden checkout Price id secret to be rejected, got ${JSON.stringify(priceAuthority)}`)
  }
}

export function testStripePaymentReadinessScriptRejectsInlineCheckoutPriceAuthoritySecrets() {
  const { result, summary } = runReadinessWithFakeWrangler({
    varsToml: `
[vars]
`,
    d1Tables: REQUIRED_D1_TABLES,
    d1Columns: REQUIRED_D1_COLUMNS,
    secretNames: [
      'STRIPE_CHECKOUT_CURRENCY',
      'STRIPE_CHECKOUT_UNIT_AMOUNT',
      'STRIPE_CHECKOUT_PRODUCT_NAME',
    ],
  })
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected hidden inline checkout price secrets to fail readiness, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const priceAuthority = readCheck(summary, 'stripe-checkout-price-authority')
  if (
    priceAuthority.status !== 'fail'
    || !String(priceAuthority.details || '').includes('non-secret Worker [vars] configuration')
    || !String(priceAuthority.details || '').includes('STRIPE_CHECKOUT_CURRENCY')
    || !String(priceAuthority.details || '').includes('STRIPE_CHECKOUT_UNIT_AMOUNT')
    || !String(priceAuthority.details || '').includes('STRIPE_CHECKOUT_PRODUCT_NAME')
  ) {
    throw new Error(`expected hidden inline checkout price secrets to be rejected, got ${JSON.stringify(priceAuthority)}`)
  }
}

export function testStripePaymentReadinessScriptAcceptsVisibleInlineCheckoutPriceAuthority() {
  const { result, summary } = runReadinessWithFakeWrangler({
    varsToml: `
[vars]
STRIPE_CHECKOUT_CURRENCY = "usd"
STRIPE_CHECKOUT_UNIT_AMOUNT = "2500"
STRIPE_CHECKOUT_PRODUCT_NAME = "AgenticGraph"
`,
    d1Tables: REQUIRED_D1_TABLES,
    d1Columns: REQUIRED_D1_COLUMNS,
  })
  if (result.status !== 0 || summary.ok !== true) {
    throw new Error(`expected visible inline checkout price authority to pass readiness, got ${JSON.stringify({ status: result.status, summary, stderr: result.stderr })}`)
  }
  const priceAuthority = readCheck(summary, 'stripe-checkout-price-authority')
  if (priceAuthority.status !== 'pass' || !String(priceAuthority.details || '').includes('Found visible inline price tuple')) {
    throw new Error(`expected visible inline checkout price authority to be reported, got ${JSON.stringify(priceAuthority)}`)
  }
}

export function testStripePaymentReadinessScriptRejectsConflictingVisibleCheckoutPriceAuthority() {
  const { result, summary } = runReadinessWithFakeWrangler({
    varsToml: `
[vars]
STRIPE_CHECKOUT_PRICE_ID = "price_configured"
STRIPE_CHECKOUT_CURRENCY = "usd"
STRIPE_CHECKOUT_UNIT_AMOUNT = "2500"
STRIPE_CHECKOUT_PRODUCT_NAME = "AgenticGraph"
`,
    d1Tables: REQUIRED_D1_TABLES,
    d1Columns: REQUIRED_D1_COLUMNS,
  })
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected conflicting visible checkout price authority to fail readiness, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const priceAuthority = readCheck(summary, 'stripe-checkout-price-authority')
  if (priceAuthority.status !== 'fail' || !String(priceAuthority.details || '').includes('not both')) {
    throw new Error(`expected conflicting visible checkout price authority to be rejected, got ${JSON.stringify(priceAuthority)}`)
  }
}

export function testStripePaymentReadinessScriptChecksRemoteD1PaymentSchema() {
  const { result, summary } = runReadinessWithFakeWrangler({
    varsToml: `
[vars]
STRIPE_CHECKOUT_PRICE_ID = "price_configured"
`,
    d1Tables: REQUIRED_D1_TABLES,
    d1Columns: REQUIRED_D1_COLUMNS,
  })
  if (result.status !== 0 || summary.ok !== true) {
    throw new Error(`expected complete config with remote D1 schema to pass, got ${JSON.stringify({ status: result.status, summary, stderr: result.stderr })}`)
  }
  const d1Schema = readCheck(summary, 'worker-d1-schema')
  if (d1Schema.status !== 'pass' || !String(d1Schema.details || '').includes('5 payment D1 table')) {
    throw new Error(`expected remote D1 schema check to pass, got ${JSON.stringify(d1Schema)}`)
  }
}

export function testStripePaymentReadinessScriptFailsWhenRemoteD1WebhookProcessingColumnMissing() {
  const { result, summary } = runReadinessWithFakeWrangler({
    varsToml: `
[vars]
STRIPE_CHECKOUT_PRICE_ID = "price_configured"
`,
    d1Tables: REQUIRED_D1_TABLES,
    d1Columns: {
      stripe_webhook_events: REQUIRED_D1_COLUMNS.stripe_webhook_events.filter(column => column !== 'processing_status'),
    },
  })
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected missing webhook processing column to fail readiness, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const d1Schema = readCheck(summary, 'worker-d1-schema')
  if (d1Schema.status !== 'fail' || !String(d1Schema.details || '').includes('stripe_webhook_events.processing_status')) {
    throw new Error(`expected missing processing_status column to be named, got ${JSON.stringify(d1Schema)}`)
  }
  if (!String(d1Schema.details || '').includes('wrangler d1 migrations apply agenticgraph-storage-test --remote')) {
    throw new Error(`expected missing processing_status column to include remote migration command, got ${JSON.stringify(d1Schema)}`)
  }
}

export function testStripePaymentReadinessScriptFailsWhenRemoteD1WebhookProcessingErrorColumnMissing() {
  const { result, summary } = runReadinessWithFakeWrangler({
    varsToml: `
[vars]
STRIPE_CHECKOUT_PRICE_ID = "price_configured"
`,
    d1Tables: REQUIRED_D1_TABLES,
    d1Columns: {
      stripe_webhook_events: REQUIRED_D1_COLUMNS.stripe_webhook_events.filter(column => column !== 'processing_error'),
    },
  })
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected missing webhook processing_error column to fail readiness, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const d1Schema = readCheck(summary, 'worker-d1-schema')
  if (d1Schema.status !== 'fail' || !String(d1Schema.details || '').includes('stripe_webhook_events.processing_error')) {
    throw new Error(`expected missing processing_error column to be named, got ${JSON.stringify(d1Schema)}`)
  }
}

export function testStripePaymentReadinessScriptFailsWhenRemoteD1WebhookProcessedAtIsNotNullable() {
  const { result, summary } = runReadinessWithFakeWrangler({
    varsToml: `
[vars]
STRIPE_CHECKOUT_PRICE_ID = "price_configured"
`,
    d1Tables: REQUIRED_D1_TABLES,
    d1Columns: REQUIRED_D1_COLUMNS,
    d1NotNullColumns: {
      stripe_webhook_events: REQUIRED_D1_NULLABLE_COLUMNS.stripe_webhook_events.filter(column => column === 'processed_at'),
    },
  })
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected non-null processed_at column to fail readiness, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const d1Schema = readCheck(summary, 'worker-d1-schema')
  if (
    d1Schema.status !== 'fail'
    || !String(d1Schema.details || '').includes('must allow NULL')
    || !String(d1Schema.details || '').includes('stripe_webhook_events.processed_at')
  ) {
    throw new Error(`expected non-null processed_at column to be named, got ${JSON.stringify(d1Schema)}`)
  }
}

export function testStripePaymentReadinessScriptFailsWhenRemoteD1PaymentSchemaMissing() {
  const { result, summary } = runReadinessWithFakeWrangler({
    varsToml: `
[vars]
STRIPE_CHECKOUT_PRICE_ID = "price_configured"
`,
    d1Tables: ['stripe_checkout_sessions'],
    extraArgs: ['--live-checkout-create'],
  })
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected missing remote D1 schema to fail readiness, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const d1Schema = readCheck(summary, 'worker-d1-schema')
  if (d1Schema.status !== 'fail' || !String(d1Schema.details || '').includes('agentic_commerce_sessions')) {
    throw new Error(`expected missing D1 tables to be named, got ${JSON.stringify(d1Schema)}`)
  }
  if (readCheck(summary, 'live-checkout-create').status !== 'skip') {
    throw new Error(`expected live checkout to skip when payment D1 schema is missing, got ${JSON.stringify(summary)}`)
  }
}
