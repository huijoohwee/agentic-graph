import { AGENTIC_PURCHASE_AVALANCHE_NETWORK } from './agenticPurchaseRuntimeContract.js'

/**
 * The only environment inputs accepted by the XSGD chain-evidence policy.
 * The Data API read-key value is deliberately not represented in a policy.
 */
export const XSGD_CHAIN_EVIDENCE_ENV_KEYS = Object.freeze({
  adapterId: 'XSGD_CHAIN_EVIDENCE_ADAPTER_ID',
  apiHost: 'XSGD_CHAIN_EVIDENCE_API_HOST',
  apiVersion: 'XSGD_CHAIN_EVIDENCE_API_VERSION',
  readKey: 'XSGD_CHAIN_EVIDENCE_READ_KEY',
  tokenContract: 'XSGD_CHAIN_EVIDENCE_TOKEN_CONTRACT',
  tokenDecimals: 'XSGD_CHAIN_EVIDENCE_TOKEN_DECIMALS',
  confirmationDepthBlocks: 'XSGD_CHAIN_EVIDENCE_CONFIRMATION_DEPTH_BLOCKS',
  maxAdapterRequests: 'XSGD_CHAIN_EVIDENCE_MAX_ADAPTER_REQUESTS',
  maxPages: 'XSGD_CHAIN_EVIDENCE_MAX_PAGES',
  maxRunSeconds: 'XSGD_CHAIN_EVIDENCE_MAX_RUN_SECONDS',
  requestDeadlineMs: 'XSGD_CHAIN_EVIDENCE_REQUEST_DEADLINE_MS',
  retryMinDelayMs: 'XSGD_CHAIN_EVIDENCE_RETRY_MIN_DELAY_MS',
  retryMaxDelayMs: 'XSGD_CHAIN_EVIDENCE_RETRY_MAX_DELAY_MS',
  retryJitterMs: 'XSGD_CHAIN_EVIDENCE_RETRY_JITTER_MS',
  defaultCooldownSeconds: 'XSGD_CHAIN_EVIDENCE_DEFAULT_COOLDOWN_SECONDS',
  maxEvidenceAgeBlocks: 'XSGD_CHAIN_EVIDENCE_MAX_EVIDENCE_AGE_BLOCKS',
  maxCacheEntries: 'XSGD_CHAIN_EVIDENCE_MAX_CACHE_ENTRIES',
  maxCostEntriesPerLifecycle: 'XSGD_CHAIN_EVIDENCE_MAX_COST_ENTRIES_PER_LIFECYCLE',
  costEntryRetentionSeconds: 'XSGD_CHAIN_EVIDENCE_COST_ENTRY_RETENTION_SECONDS',
} as const)

export type XsgdChainEvidenceEnv = Readonly<Record<string, unknown>>

export type XsgdChainEvidencePolicy = Readonly<{
  adapterId: string
  apiHost: string
  apiVersion: string
  readKeyPresent: boolean
  chainId: typeof AGENTIC_PURCHASE_AVALANCHE_NETWORK.chainId
  tokenContract: string
  tokenDecimals: number
  confirmationDepthBlocks: number
  maxAdapterRequests: number
  maxPages: number
  maxRunSeconds: number
  requestDeadlineMs: number
  retryMinDelayMs: number
  retryMaxDelayMs: number
  retryJitterMs: number
  defaultCooldownSeconds: number
  maxEvidenceAgeBlocks: number
  maxCacheEntries: number
  maxCostEntriesPerLifecycle: number
  costEntryRetentionSeconds: number
}>

export type XsgdChainEvidencePolicyResolution =
  | Readonly<{ ok: true; policy: XsgdChainEvidencePolicy }>
  | Readonly<{
      ok: false
      failure:
        | 'chain_verification_disabled'
        | 'chain_token_policy_missing'
        | 'chain_finality_policy_missing'
      absentInputs: readonly string[]
    }>

type PolicyInputName = keyof typeof XSGD_CHAIN_EVIDENCE_ENV_KEYS

type ParsedPolicyInputs = Readonly<{
  adapterId: string | null
  apiHost: string | null
  apiVersion: string | null
  readKeyPresent: boolean
  tokenContract: string | null
  tokenDecimals: number | null
  confirmationDepthBlocks: number | null
  maxAdapterRequests: number | null
  maxPages: number | null
  maxRunSeconds: number | null
  requestDeadlineMs: number | null
  retryMinDelayMs: number | null
  retryMaxDelayMs: number | null
  retryJitterMs: number | null
  defaultCooldownSeconds: number | null
  maxEvidenceAgeBlocks: number | null
  maxCacheEntries: number | null
  maxCostEntriesPerLifecycle: number | null
  costEntryRetentionSeconds: number | null
}>

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/
const UNSIGNED_INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/

const readString = (env: XsgdChainEvidenceEnv, key: string): string | null => {
  const value = env[key]
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

const readNonNegativeSafeInteger = (
  env: XsgdChainEvidenceEnv,
  key: string,
): number | null => {
  const value = env[key]
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null
  }
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!UNSIGNED_INTEGER_PATTERN.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isSafeInteger(parsed) ? parsed : null
}

const readPositiveSafeInteger = (
  env: XsgdChainEvidenceEnv,
  key: string,
): number | null => {
  const value = readNonNegativeSafeInteger(env, key)
  return value !== null && value >= 1 ? value : null
}

const readPinnedHttpsHost = (env: XsgdChainEvidenceEnv, key: string): string | null => {
  const host = readString(env, key)
  if (!host) return null
  try {
    const url = new URL(host)
    return (
      url.protocol === 'https:'
      && url.pathname === '/'
      && !url.search
      && !url.hash
      && url.username === ''
      && url.password === ''
    )
      ? url.origin
      : null
  } catch {
    return null
  }
}

const readTokenContract = (env: XsgdChainEvidenceEnv, key: string): string | null => {
  const value = readString(env, key)
  return value && EVM_ADDRESS_PATTERN.test(value) ? value : null
}

const collectInvalidInputNames = (
  parsed: ParsedPolicyInputs,
): readonly PolicyInputName[] => {
  const invalid: PolicyInputName[] = []
  const addIfInvalid = (name: PolicyInputName, valid: boolean): void => {
    if (!valid) invalid.push(name)
  }

  addIfInvalid('adapterId', parsed.adapterId !== null)
  addIfInvalid('apiHost', parsed.apiHost !== null)
  addIfInvalid('apiVersion', parsed.apiVersion !== null)
  addIfInvalid('readKey', parsed.readKeyPresent)
  addIfInvalid('tokenContract', parsed.tokenContract !== null)
  addIfInvalid('tokenDecimals', parsed.tokenDecimals !== null)
  addIfInvalid('confirmationDepthBlocks', parsed.confirmationDepthBlocks !== null)
  addIfInvalid('maxAdapterRequests', parsed.maxAdapterRequests !== null)
  addIfInvalid('maxPages', parsed.maxPages !== null)
  addIfInvalid('maxRunSeconds', parsed.maxRunSeconds !== null)
  addIfInvalid('requestDeadlineMs', parsed.requestDeadlineMs !== null)
  addIfInvalid('retryMinDelayMs', parsed.retryMinDelayMs !== null)
  addIfInvalid('retryMaxDelayMs', parsed.retryMaxDelayMs !== null)
  addIfInvalid('retryJitterMs', parsed.retryJitterMs !== null)
  addIfInvalid('defaultCooldownSeconds', parsed.defaultCooldownSeconds !== null)
  addIfInvalid('maxEvidenceAgeBlocks', parsed.maxEvidenceAgeBlocks !== null)
  addIfInvalid('maxCacheEntries', parsed.maxCacheEntries !== null)
  addIfInvalid('maxCostEntriesPerLifecycle', parsed.maxCostEntriesPerLifecycle !== null)
  addIfInvalid('costEntryRetentionSeconds', parsed.costEntryRetentionSeconds !== null)

  if (
    parsed.retryMinDelayMs !== null
    && parsed.retryMaxDelayMs !== null
    && parsed.retryMinDelayMs > parsed.retryMaxDelayMs
  ) {
    invalid.push('retryMinDelayMs', 'retryMaxDelayMs')
  }

  return Object.freeze([...new Set(invalid)])
}

const failureFor = (
  invalidInputs: readonly PolicyInputName[],
): XsgdChainEvidencePolicyResolution => {
  const failure = invalidInputs.some(input => (
    input === 'adapterId'
    || input === 'apiHost'
    || input === 'apiVersion'
    || input === 'readKey'
    || input === 'maxAdapterRequests'
    || input === 'maxPages'
    || input === 'maxRunSeconds'
    || input === 'requestDeadlineMs'
    || input === 'retryMinDelayMs'
    || input === 'retryMaxDelayMs'
    || input === 'retryJitterMs'
    || input === 'defaultCooldownSeconds'
    || input === 'maxEvidenceAgeBlocks'
    || input === 'maxCacheEntries'
    || input === 'maxCostEntriesPerLifecycle'
    || input === 'costEntryRetentionSeconds'
  ))
    ? 'chain_verification_disabled'
    : invalidInputs.some(input => input === 'tokenContract' || input === 'tokenDecimals')
      ? 'chain_token_policy_missing'
      : 'chain_finality_policy_missing'

  return Object.freeze({
    ok: false,
    failure,
    absentInputs: Object.freeze([...invalidInputs]),
  })
}

/**
 * Resolves the complete, repository-owned XSGD chain-evidence policy.
 *
 * It intentionally has no network, cache, adapter, or caller-policy input. A configured
 * read key is reduced to a presence flag before a result is constructed, so its value
 * cannot be returned, logged, cached, or projected by this boundary.
 */
export function resolveXsgdChainEvidencePolicy(
  env: XsgdChainEvidenceEnv,
): XsgdChainEvidencePolicyResolution {
  const parsed: ParsedPolicyInputs = {
    adapterId: readString(env, XSGD_CHAIN_EVIDENCE_ENV_KEYS.adapterId),
    apiHost: readPinnedHttpsHost(env, XSGD_CHAIN_EVIDENCE_ENV_KEYS.apiHost),
    apiVersion: readString(env, XSGD_CHAIN_EVIDENCE_ENV_KEYS.apiVersion),
    readKeyPresent: readString(env, XSGD_CHAIN_EVIDENCE_ENV_KEYS.readKey) !== null,
    tokenContract: readTokenContract(env, XSGD_CHAIN_EVIDENCE_ENV_KEYS.tokenContract),
    tokenDecimals: readNonNegativeSafeInteger(env, XSGD_CHAIN_EVIDENCE_ENV_KEYS.tokenDecimals),
    confirmationDepthBlocks: readPositiveSafeInteger(
      env,
      XSGD_CHAIN_EVIDENCE_ENV_KEYS.confirmationDepthBlocks,
    ),
    maxAdapterRequests: readPositiveSafeInteger(env, XSGD_CHAIN_EVIDENCE_ENV_KEYS.maxAdapterRequests),
    maxPages: readPositiveSafeInteger(env, XSGD_CHAIN_EVIDENCE_ENV_KEYS.maxPages),
    maxRunSeconds: readPositiveSafeInteger(env, XSGD_CHAIN_EVIDENCE_ENV_KEYS.maxRunSeconds),
    requestDeadlineMs: readPositiveSafeInteger(env, XSGD_CHAIN_EVIDENCE_ENV_KEYS.requestDeadlineMs),
    retryMinDelayMs: readNonNegativeSafeInteger(env, XSGD_CHAIN_EVIDENCE_ENV_KEYS.retryMinDelayMs),
    retryMaxDelayMs: readNonNegativeSafeInteger(env, XSGD_CHAIN_EVIDENCE_ENV_KEYS.retryMaxDelayMs),
    retryJitterMs: readNonNegativeSafeInteger(env, XSGD_CHAIN_EVIDENCE_ENV_KEYS.retryJitterMs),
    defaultCooldownSeconds: readNonNegativeSafeInteger(
      env,
      XSGD_CHAIN_EVIDENCE_ENV_KEYS.defaultCooldownSeconds,
    ),
    maxEvidenceAgeBlocks: readPositiveSafeInteger(env, XSGD_CHAIN_EVIDENCE_ENV_KEYS.maxEvidenceAgeBlocks),
    maxCacheEntries: readPositiveSafeInteger(env, XSGD_CHAIN_EVIDENCE_ENV_KEYS.maxCacheEntries),
    maxCostEntriesPerLifecycle: readPositiveSafeInteger(
      env,
      XSGD_CHAIN_EVIDENCE_ENV_KEYS.maxCostEntriesPerLifecycle,
    ),
    costEntryRetentionSeconds: readPositiveSafeInteger(
      env,
      XSGD_CHAIN_EVIDENCE_ENV_KEYS.costEntryRetentionSeconds,
    ),
  }
  const invalidInputs = collectInvalidInputNames(parsed)
  if (invalidInputs.length > 0) return failureFor(invalidInputs)

  return Object.freeze({
    ok: true,
    policy: Object.freeze({
      adapterId: parsed.adapterId!,
      apiHost: parsed.apiHost!,
      apiVersion: parsed.apiVersion!,
      readKeyPresent: true,
      chainId: AGENTIC_PURCHASE_AVALANCHE_NETWORK.chainId,
      tokenContract: parsed.tokenContract!,
      tokenDecimals: parsed.tokenDecimals!,
      confirmationDepthBlocks: parsed.confirmationDepthBlocks!,
      maxAdapterRequests: parsed.maxAdapterRequests!,
      maxPages: parsed.maxPages!,
      maxRunSeconds: parsed.maxRunSeconds!,
      requestDeadlineMs: parsed.requestDeadlineMs!,
      retryMinDelayMs: parsed.retryMinDelayMs!,
      retryMaxDelayMs: parsed.retryMaxDelayMs!,
      retryJitterMs: parsed.retryJitterMs!,
      defaultCooldownSeconds: parsed.defaultCooldownSeconds!,
      maxEvidenceAgeBlocks: parsed.maxEvidenceAgeBlocks!,
      maxCacheEntries: parsed.maxCacheEntries!,
      maxCostEntriesPerLifecycle: parsed.maxCostEntriesPerLifecycle!,
      costEntryRetentionSeconds: parsed.costEntryRetentionSeconds!,
    }),
  })
}
