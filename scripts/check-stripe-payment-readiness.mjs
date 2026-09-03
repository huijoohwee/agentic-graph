#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  hasFlag,
  loadStripePaymentSsot,
  parseTomlScalar,
  readArgValue,
  readWorkerSecretNames,
  readWranglerVarsFromToml,
} from './stripe-payment-script-runtime.mjs'

const {
  STRIPE_CHECKOUT_MODES,
  STRIPE_PAYMENT_D1_MIGRATION_APPLY_COMMAND_TEMPLATE,
  STRIPE_PAYMENT_REQUIRED_D1_COLUMNS,
  STRIPE_PAYMENT_REQUIRED_D1_NULLABLE_COLUMNS,
  STRIPE_PAYMENT_REQUIRED_D1_TABLES,
  STRIPE_PAYMENT_ENV_KEYS,
  STRIPE_PAYMENT_LIVE_CHECKOUT_TIMEOUT_MS,
  STRIPE_PAYMENT_ROUTE_PATHS,
  STRIPE_PAYMENT_SECRET_ENV_NAMES,
  resolveStripeCheckoutServerConfig,
  validateStripeCheckoutReturnOrigin,
} = await loadStripePaymentSsot()

const defaultWranglerConfig = 'cloudflare/workers/agentic-graph-payment/wrangler.toml'
const args = process.argv.slice(2)

const readPositiveInteger = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const options = {
  baseUrl: String(readArgValue(args, '--base-url', process.env.AGENTIC_OS_PAYMENT_BASE_URL || 'https://airvio.co')).replace(/\/+$/, ''),
  configPath: resolve(process.cwd(), readArgValue(args, '--config', defaultWranglerConfig)),
  liveCheckoutTimeoutMs: readPositiveInteger(
    readArgValue(
      args,
      '--live-checkout-timeout-ms',
      process.env.AGENTIC_OS_STRIPE_LIVE_CHECKOUT_TIMEOUT_MS || STRIPE_PAYMENT_LIVE_CHECKOUT_TIMEOUT_MS,
    ),
    STRIPE_PAYMENT_LIVE_CHECKOUT_TIMEOUT_MS,
  ),
  liveCheckoutCreate: hasFlag(args, '--live-checkout-create'),
  skipD1: hasFlag(args, '--skip-d1'),
  skipWrangler: hasFlag(args, '--skip-wrangler'),
  json: hasFlag(args, '--json'),
}

const results = []
const addResult = (name, status, details) => {
  results.push({ name, status, details })
}

const shellQuote = (value) => {
  const text = String(value || '')
  return /^[A-Za-z0-9_./:@=-]+$/.test(text) ? text : `'${text.replace(/'/g, "'\\''")}'`
}

const buildD1MigrationApplyCommand = (databaseName) =>
  STRIPE_PAYMENT_D1_MIGRATION_APPLY_COMMAND_TEMPLATE
    .replace('<DATABASE>', shellQuote(databaseName))
    .replace('<WRANGLER_CONFIG>', shellQuote(options.configPath))

const readD1DatabaseName = (configText) => {
  let current = null
  const databases = []
  const flush = () => {
    if (current) databases.push(current)
    current = null
  }
  for (const line of String(configText || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (trimmed === '[[d1_databases]]') {
      flush()
      current = {}
      continue
    }
    if (trimmed.startsWith('[')) {
      flush()
      continue
    }
    if (!current) continue
    const assignment = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/)
    if (assignment) current[assignment[1]] = parseTomlScalar(assignment[2])
  }
  flush()
  const dbBinding = databases.find((db) => db.binding === 'DB')
  return dbBinding?.database_name || databases[0]?.database_name || ''
}

const readD1Rows = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (Array.isArray(entry?.results)) return entry.results
      if (Array.isArray(entry?.result)) return entry.result
      return entry && typeof entry === 'object' ? [entry] : []
    })
  }
  if (Array.isArray(value?.results)) return value.results
  if (Array.isArray(value?.result)) return value.result
  return []
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

let wranglerConfigText = ''

const readConfigVars = () => {
  try {
    wranglerConfigText = readFileSync(options.configPath, 'utf8')
    const vars = readWranglerVarsFromToml(wranglerConfigText)
    addResult('worker-vars-config', 'pass', `Read ${vars.size} [vars] name(s) from ${options.configPath}.`)
    return vars
  } catch (error) {
    wranglerConfigText = ''
    addResult('worker-vars-config', 'fail', `Could not read ${options.configPath}: ${error.message}`)
    return new Map()
  }
}

const runD1SchemaCheck = () => {
  if (options.skipWrangler || options.skipD1) {
    addResult('worker-d1-schema', 'skip', options.skipWrangler ? 'Skipped by --skip-wrangler.' : 'Skipped by --skip-d1.')
    return 'skip'
  }
  const databaseName = readD1DatabaseName(wranglerConfigText)
  if (!databaseName) {
    addResult('worker-d1-schema', 'fail', `Could not find a D1 database_name in ${options.configPath}.`)
    return 'fail'
  }
  const quotedTableNames = STRIPE_PAYMENT_REQUIRED_D1_TABLES
    .map((tableName) => `'${String(tableName).replace(/'/g, "''")}'`)
    .join(', ')
  const schemaQuery = `SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN (${quotedTableNames}) ORDER BY name`
  const output = spawnSync('npx', [
    '--yes',
    'wrangler',
    'd1',
    'execute',
    databaseName,
    '--remote',
    '--config',
    options.configPath,
    '--json',
    '--command',
    schemaQuery,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  if (output.error || output.status !== 0) {
    const reason = output.error?.message || output.stderr || output.stdout || `wrangler exited ${output.status}`
    addResult('worker-d1-schema', 'fail', String(reason).trim())
    return 'fail'
  }
  try {
    const rows = readD1Rows(JSON.parse(output.stdout || '[]'))
    const tableNames = new Set(rows.map((row) => String(row?.name || '').trim()).filter(Boolean))
    const missing = STRIPE_PAYMENT_REQUIRED_D1_TABLES.filter((tableName) => !tableNames.has(tableName))
    if (missing.length > 0) {
      addResult(
        'worker-d1-schema',
        'fail',
        `Missing payment D1 table(s) on ${databaseName}: ${missing.join(', ')}. Apply pending D1 migrations with: ${buildD1MigrationApplyCommand(databaseName)}.`,
      )
      return 'fail'
    }
  } catch (error) {
    addResult('worker-d1-schema', 'fail', `Could not parse wrangler D1 execute JSON: ${error.message}`)
    return 'fail'
  }
  const requiredColumnEntries = Object.entries(STRIPE_PAYMENT_REQUIRED_D1_COLUMNS || {})
  if (requiredColumnEntries.length > 0) {
    const columnTableNames = requiredColumnEntries.map(([tableName]) => `'${String(tableName).replace(/'/g, "''")}'`).join(', ')
    const columnQuery = [
      'SELECT m.name AS table_name, p.name AS column_name, p."notnull" AS not_null',
      'FROM sqlite_schema AS m',
      'JOIN pragma_table_info(m.name) AS p',
      "WHERE m.type = 'table'",
      `AND m.name IN (${columnTableNames})`,
      'ORDER BY m.name, p.name',
    ].join(' ')
    const columnOutput = spawnSync('npx', [
      '--yes',
      'wrangler',
      'd1',
      'execute',
      databaseName,
      '--remote',
      '--config',
      options.configPath,
      '--json',
      '--command',
      columnQuery,
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })
    if (columnOutput.error || columnOutput.status !== 0) {
      const reason = columnOutput.error?.message || columnOutput.stderr || columnOutput.stdout || `wrangler exited ${columnOutput.status}`
      addResult('worker-d1-schema', 'fail', String(reason).trim())
      return 'fail'
    }
    try {
      const columnRows = readD1Rows(JSON.parse(columnOutput.stdout || '[]'))
      const columnsByTable = new Map()
      const columnMetadataByTable = new Map()
      for (const row of columnRows) {
        const tableName = String(row?.table_name || '').trim()
        const columnName = String(row?.column_name || '').trim()
        if (!tableName || !columnName) continue
        if (!columnsByTable.has(tableName)) columnsByTable.set(tableName, new Set())
        columnsByTable.get(tableName).add(columnName)
        if (!columnMetadataByTable.has(tableName)) columnMetadataByTable.set(tableName, new Map())
        columnMetadataByTable.get(tableName).set(columnName, {
          notNull: Number(row?.not_null ?? row?.notnull ?? 0) === 1,
        })
      }
      const missingColumns = requiredColumnEntries.flatMap(([tableName, columns]) => (
        columns
          .filter((columnName) => !columnsByTable.get(tableName)?.has(columnName))
          .map((columnName) => `${tableName}.${columnName}`)
      ))
      if (missingColumns.length > 0) {
        addResult(
          'worker-d1-schema',
          'fail',
          `Missing payment D1 column(s) on ${databaseName}: ${missingColumns.join(', ')}. Apply pending D1 migrations with: ${buildD1MigrationApplyCommand(databaseName)}.`,
        )
        return 'fail'
      }
      const requiredNullableColumnEntries = Object.entries(STRIPE_PAYMENT_REQUIRED_D1_NULLABLE_COLUMNS || {})
      const nonNullableColumns = requiredNullableColumnEntries.flatMap(([tableName, columns]) => (
        columns
          .filter((columnName) => columnMetadataByTable.get(tableName)?.get(columnName)?.notNull === true)
          .map((columnName) => `${tableName}.${columnName}`)
      ))
      if (nonNullableColumns.length > 0) {
        addResult(
          'worker-d1-schema',
          'fail',
          `Payment D1 column(s) must allow NULL for in-flight Stripe webhook processing: ${nonNullableColumns.join(', ')}. Apply pending D1 migrations with: ${buildD1MigrationApplyCommand(databaseName)}.`,
        )
        return 'fail'
      }
    } catch (error) {
      addResult('worker-d1-schema', 'fail', `Could not parse wrangler D1 column JSON: ${error.message}`)
      return 'fail'
    }
  }
  addResult(
    'worker-d1-schema',
    'pass',
    `Found ${STRIPE_PAYMENT_REQUIRED_D1_TABLES.length} payment D1 table(s), required payment column(s), and webhook-processing column constraint(s) on ${databaseName}.`,
  )
  return 'pass'
}

const hasAny = (names, keys) => keys.some((key) => names.has(key))

const configVars = readConfigVars()
const secretNames = readSecretNames()
const d1SchemaStatus = runD1SchemaCheck()
const configVarNames = new Set(configVars.keys())
const configEnv = Object.fromEntries(configVars)

const serverKeyNames = [STRIPE_PAYMENT_ENV_KEYS.restrictedKey, STRIPE_PAYMENT_ENV_KEYS.secretKey]
const visibleSecretNames = STRIPE_PAYMENT_SECRET_ENV_NAMES.filter((name) => configVarNames.has(name))
const hasServerKey = hasAny(secretNames, serverKeyNames)
const hasWebhookSecret = secretNames.has(STRIPE_PAYMENT_ENV_KEYS.webhookSecret)
const hasVisiblePriceId = configVars.has(STRIPE_PAYMENT_ENV_KEYS.checkoutPriceId)
const inlineTupleNames = [
  STRIPE_PAYMENT_ENV_KEYS.checkoutCurrency,
  STRIPE_PAYMENT_ENV_KEYS.checkoutUnitAmount,
  STRIPE_PAYMENT_ENV_KEYS.checkoutProductName,
]
const checkoutPriceAuthorityNames = [
  STRIPE_PAYMENT_ENV_KEYS.checkoutPriceId,
  ...inlineTupleNames,
]
const hiddenPriceAuthorityNames = checkoutPriceAuthorityNames.filter((name) => secretNames.has(name))
const visibleInlineNames = inlineTupleNames.filter((name) => configVarNames.has(name))
const hasVisibleInlineTuple = visibleInlineNames.length === inlineTupleNames.length
const checkoutModeValue = configVars.get(STRIPE_PAYMENT_ENV_KEYS.checkoutMode) || ''
const checkoutModeKnown = Boolean(checkoutModeValue)
const checkoutModeStoredAsSecret = secretNames.has(STRIPE_PAYMENT_ENV_KEYS.checkoutMode)
const checkoutModeStatus = checkoutModeStoredAsSecret
  ? 'fail'
  : checkoutModeKnown && !STRIPE_CHECKOUT_MODES.includes(checkoutModeValue)
  ? 'fail'
  : 'pass'
addResult(
  'stripe-checkout-mode',
  checkoutModeStatus,
  checkoutModeStoredAsSecret
    ? `${STRIPE_PAYMENT_ENV_KEYS.checkoutMode} is non-secret Worker [vars] configuration. Remove the Worker secret and keep the value in ${options.configPath} [vars] so readiness can validate mode/price compatibility.`
    : checkoutModeKnown
    ? `${STRIPE_PAYMENT_ENV_KEYS.checkoutMode}=${checkoutModeValue}.`
    : `${STRIPE_PAYMENT_ENV_KEYS.checkoutMode} is not set; Worker defaults to one-time payment mode.`,
)
const checkoutReturnOriginValue = configVars.get(STRIPE_PAYMENT_ENV_KEYS.checkoutReturnOrigin) || ''
const checkoutReturnOriginStoredAsSecret = secretNames.has(STRIPE_PAYMENT_ENV_KEYS.checkoutReturnOrigin)
const checkoutReturnOriginError = checkoutReturnOriginStoredAsSecret
  ? `${STRIPE_PAYMENT_ENV_KEYS.checkoutReturnOrigin} is non-secret Worker [vars] configuration. Remove the Worker secret and keep the value in ${options.configPath} [vars] so readiness can validate redirect authority.`
  : validateStripeCheckoutReturnOrigin(checkoutReturnOriginValue)
addResult(
  'stripe-checkout-return-origin',
  checkoutReturnOriginError ? 'fail' : 'pass',
  checkoutReturnOriginError || (
    checkoutReturnOriginValue
      ? `${STRIPE_PAYMENT_ENV_KEYS.checkoutReturnOrigin}=${checkoutReturnOriginValue}.`
      : `${STRIPE_PAYMENT_ENV_KEYS.checkoutReturnOrigin} is not set; Worker validates returns against the Checkout route origin.`
  ),
)
const visibleCheckoutConfig = hasVisiblePriceId || visibleInlineNames.length > 0
  ? resolveStripeCheckoutServerConfig(configEnv)
  : null
const priceAuthorityStatus = (() => {
  if (hiddenPriceAuthorityNames.length > 0) return 'fail'
  if (visibleCheckoutConfig?.ok === false) return 'fail'
  if (checkoutModeValue === 'subscription' && !hasVisiblePriceId) return 'fail'
  return hasVisiblePriceId || hasVisibleInlineTuple ? 'pass' : 'fail'
})()
const hasCheckoutPriceAuthority = priceAuthorityStatus === 'pass' && checkoutModeStatus === 'pass'

addResult(
  'stripe-secret-scope',
  visibleSecretNames.length > 0 ? 'fail' : 'pass',
  visibleSecretNames.length > 0
    ? `Stripe server credential(s) must be Worker secrets, not visible Worker [vars]: ${visibleSecretNames.join(', ')}. Remove them from ${options.configPath} [vars] and apply them with ${STRIPE_PAYMENT_ENV_KEYS.restrictedKey} or ${STRIPE_PAYMENT_ENV_KEYS.secretKey} plus ${STRIPE_PAYMENT_ENV_KEYS.webhookSecret} as Worker secrets.`
    : 'Stripe server credential names are absent from visible Worker [vars].',
)
addResult(
  'stripe-server-key',
  hasServerKey ? 'pass' : 'fail',
  hasServerKey
    ? `Found ${serverKeyNames.filter((name) => secretNames.has(name)).join(' or ')} on the payment Worker secret surface.`
    : `Missing ${serverKeyNames.join(' or ')} on the payment Worker surface.`,
)
addResult(
  'stripe-webhook-secret',
  hasWebhookSecret ? 'pass' : 'fail',
  hasWebhookSecret
    ? `Found ${STRIPE_PAYMENT_ENV_KEYS.webhookSecret}; webhook settlement can verify Stripe signatures.`
    : `Missing ${STRIPE_PAYMENT_ENV_KEYS.webhookSecret}; paid Checkout sessions cannot be trusted for ACP settlement.`,
)
addResult(
  'stripe-checkout-price-authority',
  priceAuthorityStatus,
  hiddenPriceAuthorityNames.length > 0
    ? `Checkout price authority is non-secret Worker [vars] configuration. Remove Worker secret(s): ${hiddenPriceAuthorityNames.join(', ')}. Keep ${STRIPE_PAYMENT_ENV_KEYS.checkoutPriceId} or the inline tuple in ${options.configPath} [vars] so readiness can validate the exact Stripe price source.`
    : visibleCheckoutConfig?.ok === false
    ? visibleCheckoutConfig.error
    : checkoutModeValue === 'subscription' && !hasVisiblePriceId
      ? `${STRIPE_PAYMENT_ENV_KEYS.checkoutMode}=subscription requires ${STRIPE_PAYMENT_ENV_KEYS.checkoutPriceId}; inline price tuples are one-time payment only.`
      : hasVisiblePriceId
    ? `Found visible ${STRIPE_PAYMENT_ENV_KEYS.checkoutPriceId}.`
    : hasVisibleInlineTuple
      ? `Found visible inline price tuple: ${inlineTupleNames.join(', ')}.`
      : `Missing visible Worker [vars] checkout price authority: ${STRIPE_PAYMENT_ENV_KEYS.checkoutPriceId}, or the inline tuple ${inlineTupleNames.join(', ')}.`,
)

const runLiveCheckoutCreate = async () => {
  if (!options.liveCheckoutCreate) {
    addResult('live-checkout-create', 'skip', 'Skipped by default. Pass --live-checkout-create after confirming production Stripe config.')
    return
  }
  if (!hasServerKey || !hasCheckoutPriceAuthority || !hasWebhookSecret || d1SchemaStatus === 'fail') {
    addResult('live-checkout-create', 'skip', 'Skipped because server key, checkout price authority, webhook secret, or payment D1 schema is missing.')
    return
  }
  const checkoutUrl = `${options.baseUrl}${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.liveCheckoutTimeoutMs)
  let response
  try {
    response = await fetch(checkoutUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: new URL(options.baseUrl).origin,
      },
      signal: controller.signal,
      body: JSON.stringify({
        successUrl: `${options.baseUrl}/agentic-graph?stripeCheckout=success`,
        cancelUrl: `${options.baseUrl}/agentic-graph?stripeCheckout=cancel`,
        workspaceId: 'stripe-readiness-smoke',
        readinessSmoke: true,
      }),
    })
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? `Timed out after ${options.liveCheckoutTimeoutMs}ms waiting for hosted Checkout create-and-expire smoke.`
      : error?.message || String(error || 'Checkout smoke request failed.')
    addResult('live-checkout-create', 'fail', message)
    return
  } finally {
    clearTimeout(timeout)
  }
  const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => '') }))
  if (!response.ok) {
    addResult('live-checkout-create', 'fail', `${response.status}: ${JSON.stringify(body)}`)
    return
  }
  const sessionId = typeof body.id === 'string' ? body.id : ''
  if (!sessionId || body.readinessSmoke !== true || body.status !== 'expired' || body.url) {
    addResult('live-checkout-create', 'fail', `Checkout smoke response must create and expire a Session without returning a hosted URL: ${JSON.stringify(body)}`)
    return
  }
  addResult('live-checkout-create', 'pass', `Created and expired hosted Checkout Session ${sessionId}.`)
}

await runLiveCheckoutCreate()

const hasFailures = results.some((result) => result.status === 'fail')
const summary = {
  ok: !hasFailures,
  baseUrl: options.baseUrl,
  wranglerConfig: options.configPath,
  checks: results,
}

if (options.json) {
  console.log(JSON.stringify(summary, null, 2))
} else {
  for (const result of results) {
    console.log(`${result.status.toUpperCase()} ${result.name}: ${result.details}`)
  }
  console.log(`${summary.ok ? 'OK' : 'FAIL'} stripe-payment-readiness`)
}

process.exit(hasFailures ? 1 : 0)
