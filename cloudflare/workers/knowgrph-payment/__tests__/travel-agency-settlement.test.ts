import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  ChainEvidenceAdapter,
  ChainEvidenceRecord,
  ChainEvidenceRequest,
  TypedVerificationFailure,
} from '../../../../grph-shared/src/payments/chainEvidenceContract'
import { verifySettlementFromIndependentSources } from '../travelAgency/settlementVerifier'

const request = Object.freeze({
  lifecycleId: 'lifecycle_01',
  chainId: 43114,
  tokenContract: '0x1111111111111111111111111111111111111111',
  watchedAddress: '0x2222222222222222222222222222222222222222',
  startBlock: 100,
  endBlock: 200,
  attemptIndex: 1,
  approvedAmountBaseUnits: '5000000',
  confirmationDepthBlocks: 12,
})

const confirmedRecord = (overrides: Partial<ChainEvidenceRecord> = {}): ChainEvidenceRecord => Object.freeze({
  chainId: request.chainId,
  tokenContract: request.tokenContract,
  watchedAddress: request.watchedAddress,
  balanceBaseUnits: '5000000',
  balanceBlockHeight: 180,
  tokenDecimals: 6,
  matchedTransfers: Object.freeze([Object.freeze({
    transactionHash: '0xabc',
    transferBlockNumber: 150,
    valueBaseUnits: '5000000',
  })]),
  observationBlockHeight: 180,
  observationTime: '2026-08-18T00:00:00.000Z',
  evidenceState: 'chain_confirmed',
  attemptCount: 1,
  ...overrides,
})

const failure: TypedVerificationFailure = Object.freeze({
  failure: 'chain_transport_failed',
  attemptIndex: 1,
  offendingInputs: Object.freeze(['source']),
  retryNotBeforeMs: null,
})

const adapter = (record: ChainEvidenceRecord, latestBlock = 180): ChainEvidenceAdapter => Object.freeze({
  adapterId: 'source',
  async readErc20Balance(_request: ChainEvidenceRequest) {
    return Object.freeze({ ok: true, record })
  },
  async readErc20Transfers(_request: ChainEvidenceRequest, _pageToken: string | null) {
    return Object.freeze({ ok: true, record, nextPageToken: null })
  },
  async readLatestIndexedBlock(_chainId: number) {
    return Object.freeze({ ok: true, blockNumber: latestBlock })
  },
})

const failingAdapter = (): ChainEvidenceAdapter => Object.freeze({
  adapterId: 'failing',
  async readErc20Balance() {
    return Object.freeze({ ok: false, error: failure })
  },
  async readErc20Transfers() {
    return Object.freeze({ ok: false, error: failure })
  },
  async readLatestIndexedBlock() {
    return Object.freeze({ ok: true, blockNumber: 180 })
  },
})

test('settlement verifier opens only after two independent on-chain sources agree', async () => {
  const result = await verifySettlementFromIndependentSources({
    request,
    sources: Object.freeze([
      { sourceId: 'data-api-a', adapter: adapter(confirmedRecord()) },
      { sourceId: 'data-api-b', adapter: adapter(confirmedRecord()) },
    ]),
  })
  assert.deepEqual(result, {
    ok: true,
    state: 'chain_confirmed',
    transactionHash: '0xabc',
    transferBlockNumber: 150,
    valueBaseUnits: '5000000',
    observationBlockHeight: 180,
    sources: ['data-api-a', 'data-api-b'],
  })
})

test('settlement verifier rejects source disagreement and single-source evidence', async () => {
  assert.deepEqual(await verifySettlementFromIndependentSources({
    request,
    sources: Object.freeze([{ sourceId: 'data-api-a', adapter: adapter(confirmedRecord()) }]),
  }), {
    ok: false,
    state: 'chain_verification_unresolved',
    sources: [],
  })

  const disagreement = await verifySettlementFromIndependentSources({
    request,
    sources: Object.freeze([
      { sourceId: 'data-api-a', adapter: adapter(confirmedRecord()) },
      { sourceId: 'data-api-b', adapter: adapter(confirmedRecord({
        matchedTransfers: Object.freeze([Object.freeze({
          transactionHash: '0xdef',
          transferBlockNumber: 150,
          valueBaseUnits: '5000000',
        })]),
      })) },
    ]),
  })
  assert.equal(disagreement.ok, false)
  assert.equal(!disagreement.ok && disagreement.state, 'chain_disagreement')
})

test('settlement verifier rejects over-credit because settlement amount must match exactly', async () => {
  const result = await verifySettlementFromIndependentSources({
    request,
    sources: Object.freeze([
      { sourceId: 'data-api-a', adapter: adapter(confirmedRecord({
        matchedTransfers: Object.freeze([Object.freeze({ transactionHash: '0xabc', transferBlockNumber: 150, valueBaseUnits: '5000001' })]),
      })) },
      { sourceId: 'data-api-b', adapter: adapter(confirmedRecord({
        matchedTransfers: Object.freeze([Object.freeze({ transactionHash: '0xabc', transferBlockNumber: 150, valueBaseUnits: '5000001' })]),
      })) },
    ]),
  })
  assert.equal(result.ok, false)
  assert.equal(!result.ok && result.state, 'chain_unobserved')
})

test('settlement verifier preserves typed unresolved source failures', async () => {
  const result = await verifySettlementFromIndependentSources({
    request,
    sources: Object.freeze([
      { sourceId: 'data-api-a', adapter: adapter(confirmedRecord()) },
      { sourceId: 'data-api-b', adapter: failingAdapter() },
    ]),
  })
  assert.equal(result.ok, false)
  assert.equal(!result.ok && result.state, 'chain_verification_unresolved')
  assert.deepEqual(!result.ok && result.error, failure)
})
