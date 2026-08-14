export type ChainEvidenceRequest = Readonly<{
  chainId: number
  tokenContract: string
  watchedAddress: string
  startBlock: number
  endBlock: number
  attemptIndex: number
}>

export type EvidenceState =
  | 'chain_unobserved'
  | 'chain_pending'
  | 'chain_confirmed'
  | 'chain_disagreement'
  | 'chain_verification_unresolved'

export type TypedVerificationFailure = Readonly<{
  failure:
    | 'chain_verification_disabled'
    | 'chain_token_policy_missing'
    | 'chain_finality_policy_missing'
    | 'chain_evidence_malformed'
    | 'chain_request_invalid'
    | 'chain_request_timeout'
    | 'chain_transport_failed'
    | 'chain_rate_limited'
    | 'chain_client_error'
    | 'chain_server_error'
    | 'chain_storage_unavailable'
    | 'chain_cost_write_failed'
  attemptIndex: number
  offendingInputs: readonly string[]
  retryNotBeforeMs: number | null
}>

export type MatchedTransfer = Readonly<{
  transactionHash: string
  transferBlockNumber: number
  valueBaseUnits: string
}>

/** A balance already observed for the source-owned XSGD token. */
export type XsgdBalanceObservation = Readonly<{
  balanceBaseUnits: string
  balanceBlockHeight: number
  decimals: unknown
}>

/** The minimal Data API transfer shape evaluated by the XSGD matcher. */
export type XsgdTransferCandidate = Readonly<{
  blockNumber: unknown
  txHash: unknown
  to: unknown
  value: unknown
  erc20Token: Readonly<{
    address: unknown
    decimals: unknown
  }>
}>

export type InboundXsgdTransferMatchInput = Readonly<{
  /** Source-owned contract and decimal values; never caller-discovered metadata. */
  expectedTokenContract: string
  expectedTokenDecimals: number
  watchedAddress: string
  approvedAmountBaseUnits: string
  startBlock: number
  endBlock: number
  attemptIndex: number
  balance: XsgdBalanceObservation
  transfers: readonly unknown[]
}>

export type InboundXsgdTransferMatch = Readonly<{
  matchedTransfers: readonly MatchedTransfer[]
  balanceBaseUnits: string
  balanceBlockHeight: number
  /** A match is classified by confirmation policy later; no match is unobserved now. */
  evidenceState: 'chain_unobserved' | null
}>

export type InboundXsgdTransferMatchResult =
  | Readonly<{ ok: true; match: InboundXsgdTransferMatch }>
  | Readonly<{ ok: false; error: TypedVerificationFailure }>

const EVM_HEX_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/
const INTEGER_BASE_UNITS_PATTERN = /^\d+$/

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const isEvmHexAddress = (value: unknown): value is string =>
  typeof value === 'string' && EVM_HEX_ADDRESS_PATTERN.test(value)

const isBaseUnitInteger = (value: unknown): value is string =>
  typeof value === 'string' && INTEGER_BASE_UNITS_PATTERN.test(value)

const chainEvidenceMalformed = (
  attemptIndex: number,
  offendingInputs: readonly string[],
): InboundXsgdTransferMatchResult => Object.freeze({
  ok: false,
  error: Object.freeze({
    failure: 'chain_evidence_malformed',
    attemptIndex: isNonNegativeInteger(attemptIndex) ? attemptIndex : 0,
    offendingInputs: Object.freeze([...new Set(offendingInputs)]),
    retryNotBeforeMs: null,
  }),
})

/**
 * Matches independent inbound XSGD transfers in a half-open block range.
 *
 * Token identity is established exclusively by the source-owned contract address;
 * display and provider-reputation metadata are intentionally never read. Amounts
 * remain decimal base-unit strings and are compared only with bigint.
 */
export const matchInboundXsgdTransfers = (
  input: InboundXsgdTransferMatchInput,
): InboundXsgdTransferMatchResult => {
  const malformedInputs: string[] = []
  if (!isEvmHexAddress(input.expectedTokenContract)) {
    malformedInputs.push('expectedTokenContract')
  }
  if (!isEvmHexAddress(input.watchedAddress)) malformedInputs.push('watchedAddress')
  if (!isNonNegativeInteger(input.expectedTokenDecimals)) {
    malformedInputs.push('expectedTokenDecimals')
  }
  if (!isBaseUnitInteger(input.approvedAmountBaseUnits)) {
    malformedInputs.push('approvedAmountBaseUnits')
  }
  if (!isNonNegativeInteger(input.startBlock)) malformedInputs.push('startBlock')
  if (!isNonNegativeInteger(input.endBlock) || input.endBlock <= input.startBlock) {
    malformedInputs.push('endBlock')
  }
  if (!isPlainRecord(input.balance)) {
    malformedInputs.push('balance')
  } else {
    if (!isBaseUnitInteger(input.balance.balanceBaseUnits)) {
      malformedInputs.push('balance.balanceBaseUnits')
    }
    if (!isNonNegativeInteger(input.balance.balanceBlockHeight)) {
      malformedInputs.push('balance.balanceBlockHeight')
    }
    if (input.balance.decimals !== input.expectedTokenDecimals) {
      malformedInputs.push('balance.decimals')
    }
  }
  if (!Array.isArray(input.transfers)) malformedInputs.push('transfers')
  if (malformedInputs.length > 0) {
    return chainEvidenceMalformed(input.attemptIndex, malformedInputs)
  }

  const expectedTokenContract = input.expectedTokenContract.toLowerCase()
  const watchedAddress = input.watchedAddress.toLowerCase()
  const approvedAmountBaseUnits = BigInt(input.approvedAmountBaseUnits)
  const matchedTransfers: MatchedTransfer[] = []

  for (const [index, rawTransfer] of input.transfers.entries()) {
    if (!isPlainRecord(rawTransfer) || !isPlainRecord(rawTransfer.erc20Token)) {
      return chainEvidenceMalformed(input.attemptIndex, [`transfers[${index}]`])
    }

    const token = rawTransfer.erc20Token
    if (token.decimals !== input.expectedTokenDecimals) {
      return chainEvidenceMalformed(input.attemptIndex, [`transfers[${index}].erc20Token.decimals`])
    }
    if (!isEvmHexAddress(token.address)) {
      return chainEvidenceMalformed(input.attemptIndex, [`transfers[${index}].erc20Token.address`])
    }
    if (!isEvmHexAddress(rawTransfer.to)) {
      return chainEvidenceMalformed(input.attemptIndex, [`transfers[${index}].to`])
    }
    if (!isNonNegativeInteger(rawTransfer.blockNumber)) {
      return chainEvidenceMalformed(input.attemptIndex, [`transfers[${index}].blockNumber`])
    }
    if (!isBaseUnitInteger(rawTransfer.value)) {
      return chainEvidenceMalformed(input.attemptIndex, [`transfers[${index}].value`])
    }
    if (typeof rawTransfer.txHash !== 'string' || rawTransfer.txHash.length === 0) {
      return chainEvidenceMalformed(input.attemptIndex, [`transfers[${index}].txHash`])
    }

    const inRange = rawTransfer.blockNumber >= input.startBlock
      && rawTransfer.blockNumber < input.endBlock
    const isExpectedToken = token.address.toLowerCase() === expectedTokenContract
    const isInbound = rawTransfer.to.toLowerCase() === watchedAddress
    if (inRange && isExpectedToken && isInbound && BigInt(rawTransfer.value) >= approvedAmountBaseUnits) {
      matchedTransfers.push(Object.freeze({
        transactionHash: rawTransfer.txHash,
        transferBlockNumber: rawTransfer.blockNumber,
        valueBaseUnits: rawTransfer.value,
      }))
    }
  }

  return Object.freeze({
    ok: true,
    match: Object.freeze({
      matchedTransfers: Object.freeze(matchedTransfers),
      balanceBaseUnits: input.balance.balanceBaseUnits,
      balanceBlockHeight: input.balance.balanceBlockHeight,
      evidenceState: matchedTransfers.length === 0 ? 'chain_unobserved' : null,
    }),
  })
}

export type ChainEvidenceRecord = Readonly<{
  chainId: number
  tokenContract: string
  watchedAddress: string
  balanceBaseUnits: string
  balanceBlockHeight: number
  tokenDecimals: number
  matchedTransfers: readonly MatchedTransfer[]
  observationBlockHeight: number
  observationTime: string
  evidenceState: EvidenceState
  attemptCount: number
}>

export type ChainEvidenceResult =
  | Readonly<{ ok: true; record: ChainEvidenceRecord }>
  | Readonly<{ ok: false; error: TypedVerificationFailure }>

export type ChainEvidenceAdapter = Readonly<{
  adapterId: string
  readErc20Balance: (request: ChainEvidenceRequest) => Promise<ChainEvidenceResult>
  readErc20Transfers: (
    request: ChainEvidenceRequest,
    pageToken: string | null,
  ) => Promise<ChainEvidenceResult & Readonly<{ nextPageToken?: string | null }>>
  readLatestIndexedBlock: (chainId: number) => Promise<
    | Readonly<{ ok: true; blockNumber: number }>
    | Readonly<{ ok: false; error: TypedVerificationFailure }>
  >
}>

export type ConfirmationClassificationInput = Readonly<{
  transferBlockNumber: number
  latestIndexedBlockNumber: number
  highestRecordedIndexedHeight: number
}>

export type ConfirmationPolicy = Readonly<{
  depthBlocks: number
  classify: (args: ConfirmationClassificationInput) =>
    'chain_pending' | 'chain_confirmed' | 'index_regression'
}>

export type ConfirmationPolicySource = Readonly<{
  confirmationDepthBlocks: number
}>

const assertIntegerBlockHeight = (name: string, value: number): void => {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer block height`)
  }
}

/**
 * Creates a confirmation classifier from the already-resolved, source-owned
 * depth. Regression is evaluated before depth so its latest and recorded
 * indexed heights remain available to the caller in the classification input.
 */
export const createConfirmationPolicy = (
  policy: ConfirmationPolicySource,
): ConfirmationPolicy => {
  const depthBlocks = policy.confirmationDepthBlocks
  if (!Number.isInteger(depthBlocks) || depthBlocks < 1) {
    throw new TypeError('confirmationDepthBlocks must be an integer of at least 1')
  }

  return Object.freeze({
    depthBlocks,
    classify: (args: ConfirmationClassificationInput) => {
      assertIntegerBlockHeight('transferBlockNumber', args.transferBlockNumber)
      assertIntegerBlockHeight('latestIndexedBlockNumber', args.latestIndexedBlockNumber)
      assertIntegerBlockHeight(
        'highestRecordedIndexedHeight',
        args.highestRecordedIndexedHeight,
      )

      if (
        args.latestIndexedBlockNumber < args.transferBlockNumber
        || args.latestIndexedBlockNumber < args.highestRecordedIndexedHeight
      ) {
        return 'index_regression'
      }

      return args.latestIndexedBlockNumber - args.transferBlockNumber < depthBlocks
        ? 'chain_pending'
        : 'chain_confirmed'
    },
  })
}

export type AttemptBudget = Readonly<{
  maxRequests: number
  maxPages: number
  maxRunSeconds: number
  consumedRequests: number
  consumedPages: number
  elapsedSeconds: number
  reachedCeiling: 'requests' | 'pages' | 'run_seconds' | null
}>

export type DisagreementClass =
  | 'provider_hold'
  | 'provider_status_conflict'
  | 'chain_amount_under_credit'
  | 'chain_amount_over_credit'
  | 'provider_credit_missing'
  | 'chain_evidence_missing'

export type ReconciliationResult = Readonly<{
  lifecycleId: string
  agreement: boolean
  disagreementClass: DisagreementClass | null
  gateOpen: boolean
  observationBlockHeight: number
  chainValueBaseUnits: string | null
  providerCreditBaseUnits: string | null
  transactionHash: string | null
  providerCreditRef: string | null
}>

export type Reconciler = Readonly<{
  reconcile: (args: Readonly<{
    evidence: ChainEvidenceRecord | null
    providerCredit: Readonly<{
      creditBaseUnits: string | null
      creditRef: string | null
      callbackStatus: 'pending' | 'completed' | 'failed' | null
      blockedReasonCount: number
    }>
    budget: AttemptBudget
  }>) => ReconciliationResult
}>

export type EvidenceFreshnessLabel = 'fresh' | 'stale' | 'expired'

export type FundingVerificationProjection = Readonly<{
  lifecycleId: string
  evidenceState: EvidenceState
  providerCreditState: 'credited' | 'held' | 'absent' | 'failed'
  observationBlockHeight: number | null
  evidenceObservationTime: string | null
  evidenceFreshness: EvidenceFreshnessLabel
  agreement: boolean
}>

export type EvidenceCacheKey = Readonly<{
  chainId: number
  tokenContract: string
  watchedAddress: string
  observationBlockHeight: number
}>

export type EvidenceCache = Readonly<{
  read: (key: EvidenceCacheKey) => Promise<ChainEvidenceRecord | null>
  write: (record: ChainEvidenceRecord) => Promise<
    | Readonly<{ ok: true; replaced: boolean }>
    | Readonly<{ ok: false; error: TypedVerificationFailure }>
  >
  evictUnparseable: (id: string) => Promise<void>
}>

export type ChainCostEntry = Readonly<{
  id: string
  lifecycleId: string
  adapterId: string
  operation:
    | 'list_erc20_balances'
    | 'list_erc20_transfers'
    | 'latest_indexed_block'
  attemptIndex: number
  chainId: number
  statusClass:
    | '2xx'
    | '4xx'
    | '429'
    | '5xx'
    | 'transport'
    | 'timeout'
    | 'unobserved'
    | null
  elapsedMs: number | null
  responseBytes: number | null
  modelCallCount: 0
  createdAt: string
}>

export type ChainEvidenceRequestValidationResult =
  | Readonly<{ ok: true; request: ChainEvidenceRequest }>
  | Readonly<{ ok: false; error: TypedVerificationFailure }>

const REQUIRED_REQUEST_FIELDS = [
  'chainId',
  'tokenContract',
  'watchedAddress',
  'startBlock',
  'endBlock',
  'attemptIndex',
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isMissing = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '')

const invalidRequest = (
  attemptIndex: number,
  offendingInputs: readonly string[],
): ChainEvidenceRequestValidationResult => Object.freeze({
  ok: false,
  error: Object.freeze({
    failure: 'chain_request_invalid',
    attemptIndex,
    offendingInputs: Object.freeze([...offendingInputs]),
    retryNotBeforeMs: null,
  }),
})

/**
 * Validates a request before adapter dispatch. Invalid requests return a typed
 * failure and never consume an AttemptBudget entry.
 */
export const validateChainEvidenceRequest = (
  value: unknown,
): ChainEvidenceRequestValidationResult => {
  const request = isRecord(value) ? value : {}
  const attemptIndex = Number.isInteger(request.attemptIndex)
    && (request.attemptIndex as number) >= 0
    ? request.attemptIndex as number
    : 0
  const offendingInputs = REQUIRED_REQUEST_FIELDS.filter(field => isMissing(request[field]))

  if (!isMissing(request.startBlock)
    && (!Number.isInteger(request.startBlock) || (request.startBlock as number) < 0)) {
    offendingInputs.push('startBlock')
  }
  if (!isMissing(request.endBlock)
    && (!Number.isInteger(request.endBlock) || (request.endBlock as number) < 0)) {
    offendingInputs.push('endBlock')
  }
  if (
    Number.isInteger(request.startBlock)
    && (request.startBlock as number) >= 0
    && Number.isInteger(request.endBlock)
    && (request.endBlock as number) >= 0
    && (request.endBlock as number) <= (request.startBlock as number)
  ) {
    offendingInputs.push('endBlock')
  }

  if (offendingInputs.length > 0) {
    return invalidRequest(attemptIndex, [...new Set(offendingInputs)])
  }

  return Object.freeze({
    ok: true,
    request: Object.freeze({
      chainId: request.chainId as number,
      tokenContract: request.tokenContract as string,
      watchedAddress: request.watchedAddress as string,
      startBlock: request.startBlock as number,
      endBlock: request.endBlock as number,
      attemptIndex,
    }),
  })
}
