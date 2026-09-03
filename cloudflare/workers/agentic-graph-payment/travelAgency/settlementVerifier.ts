import {
  createConfirmationPolicy,
  type ChainEvidenceAdapter,
  type ChainEvidenceRecord,
  type ChainEvidenceRequest,
  type TypedVerificationFailure,
} from '../../../../grph-shared/src/payments/chainEvidenceContract'

export type SettlementVerificationSource = Readonly<{
  sourceId: string
  adapter: ChainEvidenceAdapter
}>

export type SettlementVerificationRequest = ChainEvidenceRequest & Readonly<{
  lifecycleId: string
  approvedAmountBaseUnits: string
  confirmationDepthBlocks: number
}>

export type SettlementVerificationResult =
  | Readonly<{
      ok: true
      state: 'chain_confirmed'
      transactionHash: string
      transferBlockNumber: number
      valueBaseUnits: string
      observationBlockHeight: number
      sources: readonly string[]
    }>
  | Readonly<{
      ok: false
      state:
        | 'chain_pending'
        | 'chain_unobserved'
        | 'chain_disagreement'
        | 'chain_verification_unresolved'
      sources: readonly string[]
      error?: TypedVerificationFailure
    }>

const isConfirmedRecord = (
  record: ChainEvidenceRecord,
  request: SettlementVerificationRequest,
  latestIndexedBlockNumber: number,
): boolean => {
  const policy = createConfirmationPolicy({ confirmationDepthBlocks: request.confirmationDepthBlocks })
  return record.evidenceState === 'chain_confirmed'
    && record.chainId === request.chainId
    && record.tokenContract.toLowerCase() === request.tokenContract.toLowerCase()
    && record.watchedAddress.toLowerCase() === request.watchedAddress.toLowerCase()
    && record.matchedTransfers.length > 0
    && record.matchedTransfers.some(transfer =>
      transfer.valueBaseUnits === request.approvedAmountBaseUnits
      && policy.classify({
        transferBlockNumber: transfer.transferBlockNumber,
        latestIndexedBlockNumber,
        highestRecordedIndexedHeight: record.observationBlockHeight,
      }) === 'chain_confirmed')
}

const primaryTransfer = (record: ChainEvidenceRecord, approvedAmountBaseUnits: string) =>
  record.matchedTransfers.find(transfer => transfer.valueBaseUnits === approvedAmountBaseUnits) || null

/** Requires two independent on-chain sources to agree before settlement opens. */
export const verifySettlementFromIndependentSources = async (args: {
  request: SettlementVerificationRequest
  sources: readonly SettlementVerificationSource[]
}): Promise<SettlementVerificationResult> => {
  if (args.sources.length < 2) {
    return Object.freeze({ ok: false, state: 'chain_verification_unresolved', sources: Object.freeze([]) })
  }

  const observations = await Promise.all(args.sources.slice(0, 2).map(async source => {
    const latest = await source.adapter.readLatestIndexedBlock(args.request.chainId)
    if (!latest.ok) return Object.freeze({ sourceId: source.sourceId, error: latest.error })
    const balance = await source.adapter.readErc20Balance(args.request)
    if (!balance.ok) return Object.freeze({ sourceId: source.sourceId, error: balance.error })
    const transfers = await source.adapter.readErc20Transfers(args.request, null)
    if (!transfers.ok) return Object.freeze({ sourceId: source.sourceId, error: transfers.error })
    const record = transfers.record.matchedTransfers.length > 0 ? transfers.record : balance.record
    return Object.freeze({ sourceId: source.sourceId, latestBlock: latest.blockNumber, record })
  }))

  const firstFailure = observations.find(observation => 'error' in observation)
  if (firstFailure && 'error' in firstFailure) {
    return Object.freeze({ ok: false, state: 'chain_verification_unresolved', sources: Object.freeze(observations.map(item => item.sourceId)), error: firstFailure.error })
  }

  const records = observations as readonly Readonly<{ sourceId: string; latestBlock: number; record: ChainEvidenceRecord }>[]
  const confirmed = records.filter(item => isConfirmedRecord(item.record, args.request, item.latestBlock))
  if (confirmed.length < 2) {
    const anyPending = records.some(item => item.record.evidenceState === 'chain_pending')
    return Object.freeze({
      ok: false,
      state: anyPending ? 'chain_pending' : 'chain_unobserved',
      sources: Object.freeze(records.map(item => item.sourceId)),
    })
  }

  const transfers = confirmed.map(item => ({ sourceId: item.sourceId, transfer: primaryTransfer(item.record, args.request.approvedAmountBaseUnits), record: item.record }))
  const [first, second] = transfers
  if (!first?.transfer || !second?.transfer) {
    return Object.freeze({ ok: false, state: 'chain_unobserved', sources: Object.freeze(confirmed.map(item => item.sourceId)) })
  }
  const agreement = first.transfer.transactionHash.toLowerCase() === second.transfer.transactionHash.toLowerCase()
    && first.transfer.transferBlockNumber === second.transfer.transferBlockNumber
    && first.transfer.valueBaseUnits === second.transfer.valueBaseUnits
  if (!agreement) {
    return Object.freeze({ ok: false, state: 'chain_disagreement', sources: Object.freeze(confirmed.map(item => item.sourceId)) })
  }
  return Object.freeze({
    ok: true,
    state: 'chain_confirmed',
    transactionHash: first.transfer.transactionHash,
    transferBlockNumber: first.transfer.transferBlockNumber,
    valueBaseUnits: first.transfer.valueBaseUnits,
    observationBlockHeight: Math.min(first.record.observationBlockHeight, second.record.observationBlockHeight),
    sources: Object.freeze(confirmed.map(item => item.sourceId)),
  })
}
