import {
  validateChainEvidenceRequest,
  type ChainEvidenceAdapter,
  type ChainEvidenceRequest,
  type ChainEvidenceResult,
  type TypedVerificationFailure,
} from '../../../grph-shared/src/payments/chainEvidenceContract'

export type {
  AttemptBudget,
  ChainCostEntry,
  ChainEvidenceAdapter,
  ChainEvidenceRecord,
  ChainEvidenceRequest,
  ChainEvidenceResult,
  EvidenceState,
  MatchedTransfer,
  TypedVerificationFailure,
} from '../../../grph-shared/src/payments/chainEvidenceContract'

/**
 * The Worker-only dispatch seam. Implementations may provide transport behind
 * these reads, but the public adapter returned by this module has no write,
 * signing, or transaction-submission operation.
 */
export type ChainEvidenceReadDispatcher = Readonly<{
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

/**
 * Admits every typed, request-bearing read before it reaches a transport.
 * Rejection returns the shared typed failure directly; this boundary owns no
 * attempt budget and therefore cannot consume an entry on that path.
 */
export const createChainEvidenceAdapter = (
  dispatcher: ChainEvidenceReadDispatcher,
): ChainEvidenceAdapter => Object.freeze({
  adapterId: dispatcher.adapterId,
  async readErc20Balance(request: ChainEvidenceRequest): Promise<ChainEvidenceResult> {
    const admission = validateChainEvidenceRequest(request)
    if (!admission.ok) return Object.freeze({ ok: false, error: admission.error })
    return dispatcher.readErc20Balance(admission.request)
  },
  async readErc20Transfers(
    request: ChainEvidenceRequest,
    pageToken: string | null,
  ): Promise<ChainEvidenceResult & Readonly<{ nextPageToken?: string | null }>> {
    const admission = validateChainEvidenceRequest(request)
    if (!admission.ok) return Object.freeze({ ok: false, error: admission.error })
    return dispatcher.readErc20Transfers(admission.request, pageToken)
  },
  readLatestIndexedBlock(chainId: number) {
    return dispatcher.readLatestIndexedBlock(chainId)
  },
})
