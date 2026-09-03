import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

type PaymentReadinessSummary = {
  ok?: boolean
  components?: Array<{ name?: string; status?: string; summary?: { checks?: Array<{ name?: string; status?: string }> } }>
}

const repoRoot = resolve(process.cwd(), '..')
const scriptPath = resolve(repoRoot, 'scripts', 'check-payment-readiness.mjs')

const REQUIRED_D1_TABLES = [
  'stripe_checkout_sessions',
  'stripe_webhook_events',
  'agentic_commerce_sessions',
  'agentic_commerce_proofs',
  'agentic_commerce_trace_events',
]

const REQUIRED_D1_COLUMNS = {
  stripe_webhook_events: [
    'id',
    'event_type',
    'payload_hash',
    'received_at',
    'processed_at',
    'processing_status',
    'processing_error',
  ],
}

const encodePaymentRequiredHeader = () => Buffer.from(JSON.stringify({
  x402Version: 2,
  accepts: [
    {
      scheme: 'exact',
      network: 'eip155:84532',
      amount: '1000',
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      payTo: '0x1111111111111111111111111111111111111111',
    },
  ],
})).toString('base64')

const waitForReadinessProcess = (
  child: ReturnType<typeof spawn>,
  timeoutMs = 10_000,
) => new Promise<{ status: number | null; stdout: string; stderr: string }>((resolveProcess, rejectProcess) => {
  let stdout = ''
  let stderr = ''
  const timer = setTimeout(() => {
    child.kill('SIGTERM')
    rejectProcess(new Error(`timed out waiting for combined payment readiness script after ${timeoutMs}ms`))
  }, timeoutMs)
  child.stdout?.on('data', chunk => { stdout += String(chunk) })
  child.stderr?.on('data', chunk => { stderr += String(chunk) })
  child.once('error', error => {
    clearTimeout(timer)
    rejectProcess(error)
  })
  child.once('close', status => {
    clearTimeout(timer)
    resolveProcess({ status, stdout, stderr })
  })
})

const createFakeWranglerWorkspace = () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'agentic-graph-payment-readiness-'))
  const configPath = join(tempDir, 'wrangler.toml')
  const binDir = join(tempDir, 'bin')
  const npxPath = join(binDir, 'npx')
  mkdirSync(binDir, { recursive: true })
  writeFileSync(configPath, [
    'name = "agentic-graph-payment-test"',
    '[vars]',
    'SELLER_ID = "airvio.co"',
    'CHECKOUT_BASE_URL = "https://airvio.co"',
    'WEB3_ENABLED = "true"',
    'WEB3_DEPOSIT_ADDRESS = "0x1111111111111111111111111111111111111111"',
    'BASE_RPC_URL = "https://base.example/rpc"',
    'BASE_CONFIRMATION_BLOCKS = "2"',
    'EAS_ATTEST_URL = "https://eas.example/attest"',
    'OPENBOX_API_URL = "https://openbox.example/risk"',
    'OPENBOX_INGEST_URL = "https://openbox.example/ingest"',
    'STRIPE_CHECKOUT_PRICE_ID = "price_configured"',
    'STRIPE_DELEGATE_PAYMENT_URL = "https://airvio.co/api/payments/stripe/delegate"',
    'X402_NETWORK = "eip155:84532"',
    'X402_ASSET = "USDC"',
    'X402_AMOUNT = "1000"',
    'X402_FACILITATOR_URL = "https://x402.org/facilitator"',
    'X402_PRICE = "$0.001"',
    'SOLANA_PAY_RECIPIENT = "3cUh3LBCi9PKYfJmE1vDLteA94ppWKqhzyap5mpQxb38"',
    'SOLANA_PAY_RPC_URL = "https://solana.example/rpc"',
    '',
    '[[d1_databases]]',
    'binding = "DB"',
    'database_name = "agentic-graph-storage-test"',
    'database_id = "test-d1"',
    '',
  ].join('\n'), 'utf8')
  writeFileSync(npxPath, `#!/usr/bin/env node
const args = process.argv.slice(2)
const command = String(args[args.indexOf('--command') + 1] || '')
if (args.includes('secret') && args.includes('list')) {
  console.log(JSON.stringify([
    { name: 'STRIPE_SECRET_KEY' },
    { name: 'STRIPE_WEBHOOK_SECRET' },
    { name: 'ACP_BEARER_TOKEN' },
    { name: 'OPENBOX_API_KEY' },
  ]))
  process.exit(0)
}
if (args.includes('d1') && args.includes('execute')) {
  if (command.includes('pragma_table_info')) {
    const columns = ${JSON.stringify(REQUIRED_D1_COLUMNS)}
    console.log(JSON.stringify([{ success: true, results: Object.entries(columns).flatMap(([table_name, columnNames]) => columnNames.map(column_name => ({ table_name, column_name, not_null: 0 }))) }]))
    process.exit(0)
  }
  console.log(JSON.stringify([{ success: true, results: ${JSON.stringify(REQUIRED_D1_TABLES.map(name => ({ name })))} }]))
  process.exit(0)
}
console.error('unexpected npx args ' + JSON.stringify(args))
process.exit(1)
`, 'utf8')
  chmodSync(npxPath, 0o755)
  return {
    configPath,
    tempDir,
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH || ''}`,
    },
  }
}

const withLocalPaymentReadinessServer = async (run: (baseUrl: string) => Promise<void>) => {
  const checkoutRequests: Array<Record<string, unknown>> = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(Buffer.from(chunk)))
    request.on('end', () => {
      const url = request.url || '/'
      const origin = `http://${request.headers.host}`
      if (url === '/.well-known/acp.json') {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          protocol: { name: 'acp', version: '2026-01-30', supported_versions: ['2026-01-30'] },
          api_base_url: origin,
          transports: ['rest'],
          capabilities: { services: ['checkout'] },
        }))
        return
      }
      if (url === '/.well-known/ucp') {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          ucp: { version: '2026-04-08', services: {}, capabilities: {}, payment_handlers: {}, endpoints: { x402_payment_required: `${origin}/api/payments/commerce/x402` } },
          protocol_version: '2026-04-08',
          services: [{ id: 'commerce' }],
          capabilities: { content_payments: true },
          endpoints: { x402_payment_required: `${origin}/api/payments/commerce/x402` },
        }))
        return
      }
      if (url === '/openapi.json') {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ openapi: '3.1.0', paths: { '/api/payments/commerce/x402': { get: { 'x-payment-info': { intent: 'charge', method: 'x402', amount: '$0.001', currency: 'usdc' } } } } }))
        return
      }
      if (url === '/api/payments/commerce/x402' || url === '/api') {
        response.writeHead(402, {
          'content-type': 'application/json',
          'payment-required': encodePaymentRequiredHeader(),
        })
        response.end(JSON.stringify({ ok: false }))
        return
      }
      if (url === '/api/payments/stripe/checkout/session') {
        checkoutRequests.push(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>)
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ ok: true, id: 'cs_payment_readiness', status: 'expired', readinessSmoke: true }))
        return
      }
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: false, url }))
    })
  })
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => resolveListen())
  })
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error(`unexpected local server address ${JSON.stringify(address)}`)
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close(error => error ? rejectClose(error) : resolveClose())
    })
  }
  return checkoutRequests
}

export function testPaymentReadinessScriptUsesStripeAgenticAndX402ReadinessOwners() {
  const text = readFileSync(scriptPath, 'utf8')
  if (
    !text.includes('check-stripe-payment-readiness.mjs')
    || !text.includes('check-agentic-payment-readiness.mjs')
    || !text.includes('check-agent-ready-commerce.mjs')
  ) {
    throw new Error('expected combined payment readiness to reuse existing Stripe, agentic, and x402 readiness scripts')
  }
  if (text.includes('STRIPE_CHECKOUT_PRICE_ID') || text.includes('X402_PAY_TO_ADDRESS')) {
    throw new Error('expected combined payment readiness wrapper not to duplicate payment authority constants')
  }
}

export async function testPaymentReadinessScriptAggregatesStripeAgenticAndX402WithLiveSmoke() {
  const workspace = createFakeWranglerWorkspace()
  try {
    const checkoutRequests = await withLocalPaymentReadinessServer(async (baseUrl) => {
      const child = spawn(process.execPath, [
        scriptPath,
        '--json',
        '--config',
        workspace.configPath,
        '--base-url',
        baseUrl,
        '--origin',
        baseUrl,
        '--live-checkout-create',
      ], {
        cwd: repoRoot,
        env: workspace.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const result = await waitForReadinessProcess(child)
      const summary = JSON.parse(result.stdout || '{}') as PaymentReadinessSummary
      if (result.status !== 0 || summary.ok !== true) {
        throw new Error(`expected combined payment readiness to pass with fake Stripe/agentic/x402 gates, got ${JSON.stringify({ status: result.status, summary, stderr: result.stderr })}`)
      }
      for (const name of ['stripe-payment-readiness', 'agentic-payment-readiness', 'x402-payment-readiness']) {
        if (!summary.components?.some(component => component.name === name && component.status === 'pass')) {
          throw new Error(`expected ${name} component to pass, got ${JSON.stringify(summary)}`)
        }
      }
      const stripeComponent = summary.components?.find(component => component.name === 'stripe-payment-readiness')
      const liveCheck = stripeComponent?.summary?.checks?.find(check => check.name === 'live-checkout-create')
      if (liveCheck?.status !== 'pass') {
        throw new Error(`expected live Checkout smoke to pass through combined readiness, got ${JSON.stringify(liveCheck)}`)
      }
    })
    if (checkoutRequests.length !== 1 || checkoutRequests[0]?.readinessSmoke !== true) {
      throw new Error(`expected combined readiness to issue one readinessSmoke Checkout request, got ${JSON.stringify(checkoutRequests)}`)
    }
  } finally {
    rmSync(workspace.tempDir, { recursive: true, force: true })
  }
}
