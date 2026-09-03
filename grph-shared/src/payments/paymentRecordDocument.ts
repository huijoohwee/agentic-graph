import {
  PAYMENT_RAIL_IDS,
  type PaymentSettlementAsset,
  type PaymentRailId,
} from './paymentRailSsot.js'

export const AGENTIC_OS_PAYMENT_TERMINAL_STATES = Object.freeze([
  'paid',
  'refunded',
  'no_payment_required',
  'failed',
  'expired',
  'cancelled',
  'reconciliation_unresolved',
] as const)

export type AgenticGraphPaymentTerminalState = typeof AGENTIC_OS_PAYMENT_TERMINAL_STATES[number]

export const AGENTIC_OS_CHAIN_EVIDENCE_STATES = Object.freeze([
  'chain_unobserved',
  'chain_pending',
  'chain_confirmed',
  'chain_disagreement',
  'chain_verification_unresolved',
] as const)

export type AgenticGraphChainEvidenceState = typeof AGENTIC_OS_CHAIN_EVIDENCE_STATES[number]

export type AgenticGraphPaymentRecordChainEvidence = Readonly<{
  chainId: number
  tokenContract: string
  transactionHash: string
  transferBlockNumber: number
  observationBlockHeight: number
  evidenceState: AgenticGraphChainEvidenceState
}>

export type AgenticGraphTerminalPaymentRecord = {
  intentId: string
  clientIntentKey: string
  rail: PaymentRailId
  amountMinor: number
  currency: string
  settlementAsset: PaymentSettlementAsset
  terminalState: AgenticGraphPaymentTerminalState
  providerObjectId: string | null
  terminalTimestamp: string
  chainEvidence?: AgenticGraphPaymentRecordChainEvidence | null
}

export type AgenticGraphPublicPaymentStatus = Readonly<
  Pick<
    AgenticGraphTerminalPaymentRecord,
    'intentId' | 'amountMinor' | 'currency'
  > & {
    state: AgenticGraphPaymentTerminalState
  }
>

export type AgenticGraphPaymentRecordParseError = {
  code: 'payment_record_parse_error'
  line: number
  reason:
    | 'empty_document'
    | 'invalid_json'
    | 'invalid_record'
    | 'duplicate_intent'
    | 'duplicate_client_intent'
    | 'non_canonical_document'
  message: string
}

export type AgenticGraphPaymentRecordFailure = {
  ok: false
  error: AgenticGraphPaymentRecordParseError
}

export type AgenticGraphPaymentRecordParseResult =
  | { ok: true; records: AgenticGraphTerminalPaymentRecord[] }
  | AgenticGraphPaymentRecordFailure

export type AgenticGraphPaymentRecordAppendResult =
  | { ok: true; records: AgenticGraphTerminalPaymentRecord[]; document: string }
  | AgenticGraphPaymentRecordFailure

const OPAQUE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CURRENCY_PATTERN = /^[a-z]{3}$/
const SETTLEMENT_ASSET_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,31}$/
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const FORBIDDEN_IDENTIFIER_PATTERN =
  /^(?:(?:sk|rk)_(?:live|test)_|whsec_|cus_|customer_)/i
const IDENTIFIER_SEPARATOR_PATTERN = /[._:-]/g
const SENSITIVE_NUMBER_PATTERN = /\d{9,19}/
const CHAIN_EVIDENCE_DOCUMENT_KEYS = Object.freeze([
  'chain_id',
  'token_contract',
  'transaction_hash',
  'transfer_block_number',
  'observation_block_height',
  'evidence_state',
])

const isCanonicalTimestamp = (value: string): boolean => {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

const containsSensitiveNumber = (value: string): boolean =>
  SENSITIVE_NUMBER_PATTERN.test(value.replace(IDENTIFIER_SEPARATOR_PATTERN, ''))

const isSafeIdentifier = (value: string): boolean =>
  OPAQUE_IDENTIFIER_PATTERN.test(value)
  && !EMAIL_PATTERN.test(value)
  && !FORBIDDEN_IDENTIFIER_PATTERN.test(value)
  && !containsSensitiveNumber(value)

const hasExactKeys = (value: Record<string, unknown>, expectedKeys: readonly string[]): boolean =>
  Object.keys(value).sort().join('\n') === [...expectedKeys].sort().join('\n')

const isNonNegativeSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const isChainEvidence = (value: unknown): value is AgenticGraphPaymentRecordChainEvidence => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const evidence = value as Record<string, unknown>
  return hasExactKeys(evidence, CHAIN_EVIDENCE_DOCUMENT_KEYS.map(key => key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())))
    && isNonNegativeSafeInteger(evidence.chainId)
    && typeof evidence.tokenContract === 'string'
    && evidence.tokenContract.length > 0
    && typeof evidence.transactionHash === 'string'
    && evidence.transactionHash.length > 0
    && isNonNegativeSafeInteger(evidence.transferBlockNumber)
    && isNonNegativeSafeInteger(evidence.observationBlockHeight)
    && typeof evidence.evidenceState === 'string'
    && AGENTIC_OS_CHAIN_EVIDENCE_STATES.includes(evidence.evidenceState as AgenticGraphChainEvidenceState)
}

const fromDocumentChainEvidence = (value: unknown): AgenticGraphPaymentRecordChainEvidence | null | undefined => {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const evidence = value as Record<string, unknown>
  if (!hasExactKeys(evidence, CHAIN_EVIDENCE_DOCUMENT_KEYS)) return undefined
  const parsed = {
    chainId: evidence.chain_id,
    tokenContract: evidence.token_contract,
    transactionHash: evidence.transaction_hash,
    transferBlockNumber: evidence.transfer_block_number,
    observationBlockHeight: evidence.observation_block_height,
    evidenceState: evidence.evidence_state,
  }
  return isChainEvidence(parsed) ? parsed : undefined
}

const toDocumentChainEvidence = (
  evidence: AgenticGraphPaymentRecordChainEvidence | null | undefined,
) => evidence === null || evidence === undefined
  ? null
  : {
      chain_id: evidence.chainId,
      token_contract: evidence.tokenContract,
      transaction_hash: evidence.transactionHash,
      transfer_block_number: evidence.transferBlockNumber,
      observation_block_height: evidence.observationBlockHeight,
      evidence_state: evidence.evidenceState,
    }

export function validateAgenticGraphTerminalPaymentRecord(
  record: AgenticGraphTerminalPaymentRecord,
): string | null {
  if (!isSafeIdentifier(record.intentId)) return 'intentId must be a non-personal opaque identifier.'
  if (!UUID_PATTERN.test(record.clientIntentKey)) return 'clientIntentKey must be a UUID.'
  if (!PAYMENT_RAIL_IDS.includes(record.rail)) return 'rail is not supported.'
  if (!Number.isSafeInteger(record.amountMinor) || record.amountMinor < 0) {
    return 'amountMinor must be a non-negative safe integer.'
  }
  if (!CURRENCY_PATTERN.test(record.currency)) return 'currency must be three lowercase letters.'
  if (!SETTLEMENT_ASSET_PATTERN.test(record.settlementAsset)) {
    return 'settlementAsset must be a lowercase opaque token.'
  }
  if (record.rail === 'stripe' && record.settlementAsset !== 'fiat') {
    return 'stripe records must use fiat settlement.'
  }
  if (
    record.rail === 'straitsx'
    && (record.currency !== 'sgd' || !['fiat', 'xsgd'].includes(record.settlementAsset))
  ) {
    return 'straitsx records must use sgd with fiat or xsgd settlement.'
  }
  if (!AGENTIC_OS_PAYMENT_TERMINAL_STATES.includes(record.terminalState)) {
    return 'terminalState is not supported.'
  }
  if (record.providerObjectId !== null && !isSafeIdentifier(record.providerObjectId)) {
    return 'providerObjectId must be null or a non-personal opaque identifier.'
  }
  if (
    (
      record.terminalState === 'paid'
      || record.terminalState === 'refunded'
      || record.terminalState === 'expired'
    )
    && record.providerObjectId === null
  ) {
    return `providerObjectId must be present for a ${record.terminalState} record.`
  }
  if (!isCanonicalTimestamp(record.terminalTimestamp)) {
    return 'terminalTimestamp must be a canonical ISO-8601 timestamp.'
  }
  if (record.chainEvidence !== undefined && record.chainEvidence !== null && !isChainEvidence(record.chainEvidence)) {
    return 'chainEvidence must be null or contain exactly the supported chain evidence fields.'
  }
  return null
}

const comparePaymentRecords = (
  left: AgenticGraphTerminalPaymentRecord,
  right: AgenticGraphTerminalPaymentRecord,
): number =>
  left.terminalTimestamp.localeCompare(right.terminalTimestamp)
  || left.intentId.localeCompare(right.intentId)
  || left.clientIntentKey.localeCompare(right.clientIntentKey)

const toDocumentEntry = (record: AgenticGraphTerminalPaymentRecord) => ({
  intent_id: record.intentId,
  client_intent_key: record.clientIntentKey,
  rail: record.rail,
  amount_minor: record.amountMinor,
  currency: record.currency,
  settlement_asset: record.settlementAsset,
  terminal_state: record.terminalState,
  provider_object_id: record.providerObjectId,
  terminal_timestamp: record.terminalTimestamp,
  chain_evidence: toDocumentChainEvidence(record.chainEvidence),
})

const fromDocumentEntry = (value: unknown): AgenticGraphTerminalPaymentRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entry = value as Record<string, unknown>
  const expectedKeys = [
    'intent_id',
    'client_intent_key',
    'rail',
    'amount_minor',
    'currency',
    'settlement_asset',
    'terminal_state',
    'provider_object_id',
    'terminal_timestamp',
    'chain_evidence',
  ]
  if (!hasExactKeys(entry, expectedKeys)) return null
  if (typeof entry.amount_minor !== 'number') return null
  if (entry.provider_object_id !== null && typeof entry.provider_object_id !== 'string') return null
  if (
    typeof entry.intent_id !== 'string'
    || typeof entry.client_intent_key !== 'string'
    || typeof entry.rail !== 'string'
    || typeof entry.currency !== 'string'
    || typeof entry.settlement_asset !== 'string'
    || typeof entry.terminal_state !== 'string'
    || typeof entry.terminal_timestamp !== 'string'
  ) return null
  const chainEvidence = fromDocumentChainEvidence(entry.chain_evidence)
  if (chainEvidence === undefined) return null
  return {
    intentId: entry.intent_id,
    clientIntentKey: entry.client_intent_key,
    rail: entry.rail as PaymentRailId,
    amountMinor: entry.amount_minor,
    currency: entry.currency,
    settlementAsset: entry.settlement_asset as PaymentSettlementAsset,
    terminalState: entry.terminal_state as AgenticGraphPaymentTerminalState,
    providerObjectId: entry.provider_object_id as string | null,
    terminalTimestamp: entry.terminal_timestamp,
    chainEvidence,
  }
}

export function serializeAgenticGraphPaymentRecordDocument(
  records: readonly AgenticGraphTerminalPaymentRecord[],
): string {
  if (records.length === 0) return ''
  const seenIntentIds = new Set<string>()
  const seenClientIntentKeys = new Set<string>()
  const canonicalRecords = [...records].sort(comparePaymentRecords)
  const lines = canonicalRecords.map(record => {
    const validationError = validateAgenticGraphTerminalPaymentRecord(record)
    if (validationError) throw new TypeError(validationError)
    if (seenIntentIds.has(record.intentId)) {
      throw new TypeError(`Duplicate terminal payment intent ${record.intentId}.`)
    }
    seenIntentIds.add(record.intentId)
    if (seenClientIntentKeys.has(record.clientIntentKey)) {
      throw new TypeError(`Duplicate client payment intent ${record.clientIntentKey}.`)
    }
    seenClientIntentKeys.add(record.clientIntentKey)
    return JSON.stringify(toDocumentEntry(record))
  })
  return `${lines.join('\n')}\n`
}

const parseError = (
  line: number,
  reason: AgenticGraphPaymentRecordParseError['reason'],
  message: string,
): AgenticGraphPaymentRecordFailure => ({
  ok: false,
  error: { code: 'payment_record_parse_error', line, reason, message },
})

export function parseAgenticGraphPaymentRecordDocument(
  document: string,
): AgenticGraphPaymentRecordParseResult {
  if (document === '') return { ok: true, records: [] }
  if (!document.endsWith('\n')) {
    return parseError(document.split('\n').length, 'non_canonical_document', 'Document must end with one LF.')
  }
  if (document.includes('\r')) {
    return parseError(1, 'non_canonical_document', 'Document must use LF line endings.')
  }
  const lines = document.slice(0, -1).split('\n')
  if (lines.length === 1 && lines[0] === '') {
    return parseError(1, 'empty_document', 'Empty documents are represented by zero bytes.')
  }
  const records: AgenticGraphTerminalPaymentRecord[] = []
  const seenIntentIds = new Set<string>()
  const seenClientIntentKeys = new Set<string>()
  for (const [index, line] of lines.entries()) {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      return parseError(index + 1, 'invalid_json', 'Line is not valid JSON.')
    }
    const record = fromDocumentEntry(parsed)
    const validationError = record ? validateAgenticGraphTerminalPaymentRecord(record) : 'Entry shape is invalid.'
    if (!record || validationError) {
      return parseError(index + 1, 'invalid_record', validationError || 'Entry shape is invalid.')
    }
    if (seenIntentIds.has(record.intentId)) {
      return parseError(index + 1, 'duplicate_intent', `Intent ${record.intentId} appears more than once.`)
    }
    seenIntentIds.add(record.intentId)
    if (seenClientIntentKeys.has(record.clientIntentKey)) {
      return parseError(
        index + 1,
        'duplicate_client_intent',
        `Client intent ${record.clientIntentKey} appears more than once.`,
      )
    }
    seenClientIntentKeys.add(record.clientIntentKey)
    records.push(record)
  }
  const canonical = serializeAgenticGraphPaymentRecordDocument(records)
  if (canonical !== document) {
    const canonicalLines = canonical.split('\n')
    const firstDifference = lines.findIndex((line, index) => line !== canonicalLines[index])
    return parseError(
      firstDifference < 0 ? lines.length : firstDifference + 1,
      'non_canonical_document',
      'Entries or fields are not in canonical order.',
    )
  }
  return { ok: true, records }
}

export function appendAgenticGraphPaymentRecordDocument(
  document: string,
  record: AgenticGraphTerminalPaymentRecord,
): AgenticGraphPaymentRecordAppendResult {
  const parsed = parseAgenticGraphPaymentRecordDocument(document)
  if (parsed.ok === false) return parsed
  const validationError = validateAgenticGraphTerminalPaymentRecord(record)
  if (validationError) return parseError(parsed.records.length + 1, 'invalid_record', validationError)
  if (parsed.records.some(existing => existing.intentId === record.intentId)) {
    return parseError(
      parsed.records.length + 1,
      'duplicate_intent',
      `Intent ${record.intentId} appears more than once.`,
    )
  }
  if (parsed.records.some(existing => existing.clientIntentKey === record.clientIntentKey)) {
    return parseError(
      parsed.records.length + 1,
      'duplicate_client_intent',
      `Client intent ${record.clientIntentKey} appears more than once.`,
    )
  }
  const documentWithRecord = serializeAgenticGraphPaymentRecordDocument([...parsed.records, record])
  const canonical = parseAgenticGraphPaymentRecordDocument(documentWithRecord)
  if (canonical.ok === false) return canonical
  return {
    ok: true,
    records: canonical.records,
    document: documentWithRecord,
  }
}

export function buildAgenticGraphPublicPaymentStatus(
  record: AgenticGraphTerminalPaymentRecord,
): AgenticGraphPublicPaymentStatus {
  const validationError = validateAgenticGraphTerminalPaymentRecord(record)
  if (validationError) throw new TypeError(validationError)
  return Object.freeze({
    intentId: record.intentId,
    state: record.terminalState,
    amountMinor: record.amountMinor,
    currency: record.currency,
  })
}
