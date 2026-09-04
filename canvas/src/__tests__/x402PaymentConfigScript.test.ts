import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  AGENTIC_COMMERCE_X402_FALLBACK_PAY_TO_ADDRESS,
  AGENTIC_COMMERCE_X402_PLACEHOLDER_PAY_TO_ADDRESS,
  readAgenticCommerceX402PayToAddress,
} from 'grph-shared/payments/agenticCommerceSsot'

type ConfigSummary = {
  ok?: boolean
  actions?: Array<{ name?: string; source?: string; target?: string }>
  checks?: Array<{ name?: string; status?: string; details?: string }>
}

const repoRoot = resolve(process.cwd(), '..')
const scriptPath = resolve(repoRoot, 'scripts', 'configure-x402-payment-worker.mjs')
const runtimePath = resolve(repoRoot, 'scripts', 'stripe-payment-script-runtime.mjs')

const runConfig = (
  env: Record<string, string>,
  extraArgs: string[] = [],
  varsToml = '',
) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'agentic-graph-x402-config-'))
  const configPath = join(tempDir, 'wrangler.toml')
  const binDir = join(tempDir, 'bin')
  const npxPath = join(binDir, 'npx')
  mkdirSync(binDir, { recursive: true })
  writeFileSync(configPath, `name = "agentic-graph-payment-test"\n${varsToml.trim()}\n`, 'utf8')
  writeFileSync(npxPath, `#!/usr/bin/env node
const args = process.argv.slice(2)
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
        ...process.env,
        X402_PAY_TO_ADDRESS: '',
        ...env,
        PATH: `${binDir}:${process.env.PATH || ''}`,
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
  if (!check) throw new Error(`expected x402 config check ${name}, got ${JSON.stringify(summary)}`)
  return check
}

export function testX402PaymentConfigScriptUsesSharedSsotAndVisibleVars() {
  const text = readFileSync(scriptPath, 'utf8')
  const runtimeText = readFileSync(runtimePath, 'utf8')
  if (!text.includes('loadAgenticCommerceSsot') || !text.includes('AGENTIC_COMMERCE_ENV_KEYS') || !text.includes('AGENTIC_COMMERCE_X402_FALLBACK_PAY_TO_ADDRESS')) {
    throw new Error('expected x402 config helper to load x402 env/fallback authority from shared agentic commerce SSOT')
  }
  if (!runtimeText.includes('loadAgenticCommerceSsot') || !runtimeText.includes('agenticCommerceSsot')) {
    throw new Error('expected shared script runtime to own agentic commerce SSOT loading')
  }
  if (text.includes('0xbb70b0dcbc70b26fbd70b402be70b595b770aa90')) {
    throw new Error('expected x402 config helper to avoid hardcoded fallback payTo values')
  }
}

export function testX402PaymentConfigScriptRejectsMissingPayToAuthority() {
  const { result, summary } = runConfig({})
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected missing x402 payTo to fail, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const payTo = readCheck(summary, 'x402-pay-to-address-input')
  if (payTo.status !== 'fail' || !String(payTo.details || '').includes('must be an EVM address')) {
    throw new Error(`expected missing x402 payTo to fail closed, got ${JSON.stringify(payTo)}`)
  }
}

export function testX402PaymentConfigScriptRejectsFallbackPayToAuthorityInput() {
  const { result, summary } = runConfig({ X402_PAY_TO_ADDRESS: AGENTIC_COMMERCE_X402_FALLBACK_PAY_TO_ADDRESS }, [
    '--write-visible-vars',
    '--yes',
    '--confirm=apply-stripe-payment-worker-config',
  ])
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected fallback x402 payTo input to fail, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const payTo = readCheck(summary, 'x402-pay-to-address-input')
  if (payTo.status !== 'fail' || !String(payTo.details || '').includes('must not equal')) {
    throw new Error(`expected fallback x402 payTo input to be rejected, got ${JSON.stringify(payTo)}`)
  }
}

export function testX402PaymentConfigScriptRejectsPlaceholderPayToAuthorityInput() {
  const { result, summary } = runConfig({ X402_PAY_TO_ADDRESS: AGENTIC_COMMERCE_X402_PLACEHOLDER_PAY_TO_ADDRESS }, [
    '--write-visible-vars',
    '--yes',
    '--confirm=apply-stripe-payment-worker-config',
  ])
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected placeholder x402 payTo input to fail, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const payTo = readCheck(summary, 'x402-pay-to-address-input')
  if (payTo.status !== 'fail' || !String(payTo.details || '').includes('future-setup placeholder')) {
    throw new Error(`expected placeholder x402 payTo input to be rejected, got ${JSON.stringify(payTo)}`)
  }
}

export function testX402PaymentConfigScriptRejectsConfiguredPlaceholderPayToAuthority() {
  const { result, summary } = runConfig({}, [], [
    '[vars]',
    `X402_PAY_TO_ADDRESS = "${AGENTIC_COMMERCE_X402_PLACEHOLDER_PAY_TO_ADDRESS}"`,
  ].join('\n'))
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected configured placeholder x402 payTo to fail, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  const payTo = readCheck(summary, 'x402-pay-to-address-input')
  if (payTo.status !== 'fail' || !String(payTo.details || '').includes('future-setup placeholder')) {
    throw new Error(`expected configured placeholder x402 payTo to be rejected, got ${JSON.stringify(payTo)}`)
  }
}

export function testX402PaymentConfigScriptReaderIgnoresPlaceholderPayToAuthority() {
  const readPayTo = readAgenticCommerceX402PayToAddress({
    X402_PAY_TO_ADDRESS: AGENTIC_COMMERCE_X402_PLACEHOLDER_PAY_TO_ADDRESS,
  })
  if (readPayTo !== null) {
    throw new Error(`expected shared x402 payTo reader to reject placeholder authority, got ${readPayTo}`)
  }
}

export function testX402PaymentConfigScriptRequiresConfirmationBeforeWritingVisibleVars() {
  const { result, summary, configText } = runConfig({ X402_PAY_TO_ADDRESS: '0x1111111111111111111111111111111111111111' }, [
    '--write-visible-vars',
  ])
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected missing write confirmation to fail, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  if (readCheck(summary, 'write-visible-vars-confirmation').status !== 'fail') {
    throw new Error(`expected visible var confirmation guard to fail, got ${JSON.stringify(summary)}`)
  }
  if (configText.includes('X402_PAY_TO_ADDRESS')) {
    throw new Error(`expected x402 payTo not to be written without confirmation, got ${configText}`)
  }
}

export function testX402PaymentConfigScriptWritesVisiblePayToAuthority() {
  const { result, summary, configText } = runConfig({ X402_PAY_TO_ADDRESS: '0x1111111111111111111111111111111111111111' }, [
    '--write-visible-vars',
    '--yes',
    '--confirm=apply-stripe-payment-worker-config',
  ])
  if (result.status !== 0 || summary.ok !== true) {
    throw new Error(`expected x402 payTo write to pass, got ${JSON.stringify({ status: result.status, summary, stderr: result.stderr })}`)
  }
  if (!configText.includes('X402_PAY_TO_ADDRESS = "0x1111111111111111111111111111111111111111"')) {
    throw new Error(`expected x402 payTo to be written to wrangler vars, got ${configText}`)
  }
  if (!summary.actions?.some(action => action.name === 'X402_PAY_TO_ADDRESS' && action.target === 'local-worker-vars')) {
    throw new Error(`expected x402 payTo write action to target local-worker-vars, got ${JSON.stringify(summary.actions)}`)
  }
}

export function testX402PaymentConfigScriptRequiresApplyBeforeDeployingVisibleVars() {
  const { result, summary, configText } = runConfig({ X402_PAY_TO_ADDRESS: '0x1111111111111111111111111111111111111111' }, [
    '--write-visible-vars',
    '--deploy-visible-vars',
    '--yes',
    '--confirm=apply-stripe-payment-worker-config',
  ])
  if (result.status === 0 || summary.ok !== false) {
    throw new Error(`expected visible var deploy without --apply to fail, got ${JSON.stringify({ status: result.status, summary })}`)
  }
  if (readCheck(summary, 'deploy-visible-vars-apply').status !== 'fail') {
    throw new Error(`expected deploy/apply guard to fail, got ${JSON.stringify(summary)}`)
  }
  if (configText.includes('X402_PAY_TO_ADDRESS')) {
    throw new Error(`expected x402 payTo not to be written when deploy/apply guard fails, got ${configText}`)
  }
}
