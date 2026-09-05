#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isValidClassicAddress } from 'ripple-address-codec'

import {
  hasFlag,
  readArgValue,
  readWranglerVarsFromToml,
  updateWranglerVarsInToml,
} from './stripe-payment-script-runtime.mjs'

export const XRPL_X402_CONFIG_KEYS = Object.freeze({
  network: 'XRPL_X402_NETWORK',
  payTo: 'XRPL_X402_PAY_TO_ADDRESS',
  amountDrops: 'XRPL_X402_AMOUNT_DROPS',
  sourceTag: 'XRPL_X402_SOURCE_TAG',
  destinationTag: 'XRPL_X402_DESTINATION_TAG',
  facilitatorUrl: 'XRPL_X402_FACILITATOR_URL',
  rpcUrl: 'XRPL_X402_RPC_URL',
  maxTimeoutSeconds: 'XRPL_X402_MAX_TIMEOUT_SECONDS',
})

const REQUIRED_KEYS = Object.freeze([
  XRPL_X402_CONFIG_KEYS.network,
  XRPL_X402_CONFIG_KEYS.payTo,
  XRPL_X402_CONFIG_KEYS.amountDrops,
  XRPL_X402_CONFIG_KEYS.sourceTag,
  XRPL_X402_CONFIG_KEYS.facilitatorUrl,
  XRPL_X402_CONFIG_KEYS.rpcUrl,
  XRPL_X402_CONFIG_KEYS.maxTimeoutSeconds,
])
const OPTIONAL_KEYS = Object.freeze([XRPL_X402_CONFIG_KEYS.destinationTag])
const MANAGED_KEYS = Object.freeze([...REQUIRED_KEYS, ...OPTIONAL_KEYS])
const DEFAULT_CONFIG = 'cloudflare/workers/agentic-graph-payment/wrangler.toml'
const APPLY_CONFIRMATION = 'apply-xrpl-x402-paid-resource'
const UINT32_MAX = 4_294_967_295n
const MAX_XRP_DROPS = 100_000_000_000_000_000n

const isSecureOrLoopbackUrl = (value) => {
  try {
    const url = new URL(value)
    if (url.username || url.password || url.search || url.hash || !url.hostname) return false
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

const isPositiveDrops = (value) => /^[1-9][0-9]{0,17}$/.test(value)
  && BigInt(value) <= MAX_XRP_DROPS
const isUint32 = (value) => {
  if (!/^(?:0|[1-9][0-9]{0,9})$/.test(value)) return false
  return BigInt(value) <= UINT32_MAX
}

export const validateXrplX402Config = (values) => {
  const errors = []
  const get = (key) => String(values.get(key) || '').trim()
  const network = get(XRPL_X402_CONFIG_KEYS.network)
  if (!['xrpl:0', 'xrpl:1', 'xrpl:2'].includes(network)) {
    errors.push(`${XRPL_X402_CONFIG_KEYS.network} must be xrpl:0, xrpl:1, or xrpl:2.`)
  }
  if (!isValidClassicAddress(get(XRPL_X402_CONFIG_KEYS.payTo))) {
    errors.push(`${XRPL_X402_CONFIG_KEYS.payTo} must be a classic XRPL receiving address.`)
  }
  if (!isPositiveDrops(get(XRPL_X402_CONFIG_KEYS.amountDrops))) {
    errors.push(`${XRPL_X402_CONFIG_KEYS.amountDrops} must be 1-${MAX_XRP_DROPS} drops.`)
  }
  if (!isUint32(get(XRPL_X402_CONFIG_KEYS.sourceTag))) {
    errors.push(`${XRPL_X402_CONFIG_KEYS.sourceTag} must be an unsigned 32-bit integer.`)
  }
  const destinationTag = get(XRPL_X402_CONFIG_KEYS.destinationTag)
  if (destinationTag && !isUint32(destinationTag)) {
    errors.push(`${XRPL_X402_CONFIG_KEYS.destinationTag} must be an unsigned 32-bit integer when set.`)
  }
  if (!isSecureOrLoopbackUrl(get(XRPL_X402_CONFIG_KEYS.facilitatorUrl))) {
    errors.push(`${XRPL_X402_CONFIG_KEYS.facilitatorUrl} must use HTTPS or loopback HTTP.`)
  }
  if (!isSecureOrLoopbackUrl(get(XRPL_X402_CONFIG_KEYS.rpcUrl))) {
    errors.push(`${XRPL_X402_CONFIG_KEYS.rpcUrl} must use HTTPS or loopback HTTP.`)
  }
  const timeout = get(XRPL_X402_CONFIG_KEYS.maxTimeoutSeconds)
  if (!/^[1-9][0-9]{0,2}$/.test(timeout) || Number(timeout) > 300) {
    errors.push(`${XRPL_X402_CONFIG_KEYS.maxTimeoutSeconds} must be an integer from 1 through 300.`)
  }
  return errors
}

const forbiddenInputNames = (args, environment) => {
  const names = []
  for (const arg of args) {
    if (/(?:seed|private[-_]?key|mnemonic)/i.test(arg)) names.push(`argument:${arg.split('=')[0]}`)
  }
  for (const [name, value] of Object.entries(environment)) {
    if (value && /XRPL/i.test(name) && /(?:SEED|PRIVATE_KEY|MNEMONIC)/i.test(name)) names.push(`environment:${name}`)
  }
  return names
}

const mergeConfiguration = (configVars, environment) => {
  const values = new Map(configVars)
  const updates = new Map()
  for (const key of MANAGED_KEYS) {
    if (!Object.hasOwn(environment, key)) continue
    const value = String(environment[key] || '').trim()
    if (value) {
      values.set(key, value)
      updates.set(key, value)
    } else if (OPTIONAL_KEYS.includes(key)) {
      values.delete(key)
    }
  }
  return { values, updates }
}

export const runConfigureXrplX402PaidResource = ({
  args = process.argv.slice(2),
  environment = process.env,
  cwd = process.cwd(),
} = {}) => {
  const checks = []
  const add = (name, status, detail) => checks.push({ name, status, detail })
  const configPath = path.resolve(cwd, readArgValue(args, '--config', DEFAULT_CONFIG))
  const apply = hasFlag(args, '--apply')
  const json = hasFlag(args, '--json')
  const forbidden = forbiddenInputNames(args, environment)
  if (forbidden.length > 0) {
    add('private-input-boundary', 'fail', `Wallet secrets are forbidden in this tool: ${forbidden.join(', ')}.`)
  } else {
    add('private-input-boundary', 'pass', 'No wallet seed, private key, or mnemonic input was accepted.')
  }

  let source = ''
  let configVars = new Map()
  try {
    source = readFileSync(configPath, 'utf8')
    configVars = readWranglerVarsFromToml(source)
    add('worker-config-readable', 'pass', `Read ${path.relative(cwd, configPath) || configPath}.`)
  } catch (error) {
    add('worker-config-readable', 'fail', `Could not read Worker configuration: ${error.message}`)
  }

  const { values, updates } = mergeConfiguration(configVars, environment)
  for (const error of validateXrplX402Config(values)) add('visible-configuration', 'fail', error)
  if (!checks.some((check) => check.name === 'visible-configuration')) {
    add('visible-configuration', 'pass', 'Required visible XRPL x402 values are valid.')
  }

  const confirmation = String(readArgValue(args, '--confirm', '') || '')
  if (apply && (!hasFlag(args, '--yes') || confirmation !== APPLY_CONFIRMATION)) {
    add('apply-confirmation', 'fail', `Local configuration write requires --apply --yes --confirm=${APPLY_CONFIRMATION}.`)
  }

  if (apply && !checks.some((check) => check.status === 'fail')) {
    const removals = Object.hasOwn(environment, XRPL_X402_CONFIG_KEYS.destinationTag)
      && !String(environment[XRPL_X402_CONFIG_KEYS.destinationTag] || '').trim()
      ? [XRPL_X402_CONFIG_KEYS.destinationTag]
      : []
    const next = updateWranglerVarsInToml(source, updates, removals)
    if (next !== source) writeFileSync(configPath, next, 'utf8')
    add('local-worker-config-write', 'pass', `Updated ${updates.size} visible value(s); no deployment was attempted.`)
  } else if (!apply) {
    add(
      'dry-run',
      checks.some((check) => check.status === 'fail') ? 'skip' : 'pass',
      checks.some((check) => check.status === 'fail')
        ? 'No file or provider mutation was attempted because validation failed.'
        : `Would update ${updates.size} visible value(s); pass the explicit apply confirmation to write locally.`,
    )
  }

  const summary = {
    ok: !checks.some((check) => check.status === 'fail'),
    applied: apply && !checks.some((check) => check.status === 'fail'),
    configPath,
    managedNames: MANAGED_KEYS,
    checks,
  }
  return { summary, json }
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMain) {
  const { summary, json } = runConfigureXrplX402PaidResource()
  if (json) console.log(JSON.stringify(summary, null, 2))
  else {
    for (const check of summary.checks) console.log(`${check.status.toUpperCase()} ${check.name}: ${check.detail}`)
    console.log(`${summary.ok ? 'OK' : 'FAIL'} xrpl-x402-paid-resource-config`)
  }
  process.exitCode = summary.ok ? 0 : 1
}
