import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

type ReadinessSummary = {
  ok?: boolean
  checks?: Array<{ name?: string; status?: string; details?: string }>
}

const repoRoot = resolve(process.cwd(), '..')
const scriptPath = resolve(repoRoot, 'scripts', 'check-agentic-payment-readiness.mjs')
const runtimePath = resolve(repoRoot, 'scripts', 'stripe-payment-script-runtime.mjs')

const REQUIRED_VARS_TOML = [
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
  'STRIPE_DELEGATE_PAYMENT_URL = "https://airvio.co/api/payments/stripe/delegate"',
  'X402_NETWORK = "eip155:84532"',
  'X402_ASSET = "USDC"',
  'X402_AMOUNT = "1000"',
  'X402_FACILITATOR_URL = "https://x402.org/facilitator"',
  'X402_PRICE = "$0.001"',
  'SOLANA_PAY_RECIPIENT = "3cUh3LBCi9PKYfJmE1vDLteA94ppWKqhzyap5mpQxb38"',
  'SOLANA_PAY_RPC_URL = "https://solana.example/rpc"',
  '',
].join('\n')

const runReadiness = (
  varsToml = REQUIRED_VARS_TOML,
  secretNames = ['ACP_BEARER_TOKEN', 'OPENBOX_API_KEY'],
) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'agentic-graph-agentic-payment-readiness-'))
  const configPath = join(tempDir, 'wrangler.toml')
  const binDir = join(tempDir, 'bin')
  const npxPath = join(binDir, 'npx')
  mkdirSync(binDir, { recursive: true })
  writeFileSync(configPath, `name = "agentic-graph-payment-test"\n${varsToml}`, 'utf8')
  writeFileSync(npxPath, `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args.includes('secret') && args.includes('list')) {
  console.log(JSON.stringify(${JSON.stringify(secretNames.map(name => ({ name })))}))
  process.exit(0)
}
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
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH || ''}`,
      },
    })
    return {
      result,
      summary: JSON.parse(result.stdout || '{}') as ReadinessSummary,
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

const readCheck = (summary: ReadinessSummary, name: string) => {
  const check = summary.checks?.find(entry => entry.name === name)
  if (!check) throw new Error(`expected readiness check ${name}, got ${JSON.stringify(summary)}`)
  return check
}

export function testAgenticPaymentReadinessScriptUsesSharedSsotLoader() {
  const text = readFileSync(scriptPath, 'utf8')
  const runtimeText = readFileSync(runtimePath, 'utf8')
  if (!text.includes('loadAgenticCommerceSsot') || !text.includes('AGENTIC_COMMERCE_REQUIRED_VISIBLE_ENV_KEYS')) {
    throw new Error('expected agentic payment readiness script to load the shared agentic commerce SSOT')
  }
  if (!runtimeText.includes('loadAgenticCommerceSsot') || !runtimeText.includes('agenticCommerceSsot')) {
    throw new Error('expected shared script runtime to own agentic commerce SSOT loading')
  }
}

export function testAgenticPaymentReadinessScriptRejectsMissingVisibleVars() {
  const { result, summary } = runReadiness('[vars]\nSELLER_ID = "airvio.co"\n')
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected missing visible vars to fail, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const presence = readCheck(summary, 'agentic-visible-vars-presence')
  if (presence.status !== 'fail' || !String(presence.details || '').includes('CHECKOUT_BASE_URL')) {
    throw new Error(`expected missing visible vars to be reported, got ${JSON.stringify(presence)}`)
  }
}

export function testAgenticPaymentReadinessScriptPassesWithRequiredConfigAndSecrets() {
  const { result, summary } = runReadiness()
  if (result.status !== 0 || summary.ok !== true) {
    throw new Error(`expected valid agentic payment readiness to pass, got ${JSON.stringify({ status: result.status, summary, stderr: result.stderr })}`)
  }
  for (const name of ['agentic-visible-vars-presence', 'agentic-secret-scope', 'agentic-secret-presence', 'agentic-visible-vars-values']) {
    if (readCheck(summary, name).status !== 'pass') {
      throw new Error(`expected ${name} to pass, got ${JSON.stringify(summary)}`)
    }
  }
}
