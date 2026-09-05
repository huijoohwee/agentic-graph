import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

import { decodePaymentRequiredHeader } from '@x402/core/http'
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
} from '@x402/core/types'

import type { D1DatabaseLike, D1StatementLike } from '../../shared/d1'
import {
  handleAgenticCommercePaidResourceRoute,
  type AgenticCommercePaidResourceWorkerEnv,
  type PaidResourceDependencies,
} from '../agenticCommercePaidResource'
import { xrplTransactionHash } from '../agenticCommerceX402Xrpl'

const MIGRATION = new URL(
  '../../../d1/migrations/0018_agentic_commerce_paid_resources.sql',
  import.meta.url,
)

export const ROUTE = 'https://payments.test/api/payments/commerce/x402/xrpl/travel-requote'
export const NOW = new Date('2026-09-05T00:15:00.000Z')
export const IDEMPOTENCY_KEY = 'requote-01'
export const SIGNED_TX_BLOB = '120000228000000024000000016140000000000003E8'
export const ALTERNATE_SIGNED_TX_BLOB = '120000228000000024000000016140000000000003E9'
export const PAY_TO = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY'

export const DISCOVERY_REQUEST = Object.freeze({
  operation: 'discoverOffers',
  contractVersion: 'agentic-graph.travel-discovery/v1',
  agentId: 'agent-flight',
  legId: 'leg-01',
  intent: Object.freeze({
    intentId: 'intent-01',
    category: 'flight',
    constraints: Object.freeze({
      bundle_id: 'bundle-01',
      changed_leg_id: 'leg-01',
      prior_offer_id: null,
      prior_amount_minor: null,
    }),
  }),
})

export const CORS_HEADERS = Object.freeze({
  'access-control-allow-origin': 'https://canvas.test',
  'access-control-expose-headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE',
})

export class SqliteD1 implements D1DatabaseLike {
  constructor(readonly sqlite: DatabaseSync) {}

  prepare(query: string): D1StatementLike {
    let values: SQLInputValue[] = []
    const statement = this.sqlite.prepare(query)
    const bound: D1StatementLike = {
      bind: (...next: unknown[]) => {
        values = next as SQLInputValue[]
        return bound
      },
      run: async () => {
        const result = statement.run(...values)
        return { success: true, meta: { changes: Number(result.changes) } }
      },
      all: async <T = Record<string, unknown>>() => ({
        results: statement.all(...values) as T[],
      }),
    }
    return bound
  }
}

export type EffectCounts = {
  ready: number
  supported: number
  verify: number
  resource: number
  settle: number
  rpc: number
}

type Reconciliation = 'pending' | 'fulfilled' | 'fulfilled-v1'
  | 'missing-meta' | 'missing-delivered'
type Settlement = 'success' | 'minimal-success' | 'ambiguous' | 'permanent-failure' | 'pending-failure'
  | 'attempted-failure' | 'absent-failure-200' | 'absent-failure-4xx'
  | 'wrong-hash-failure' | 'wrong-network-failure'
type Verification = 'valid' | 'invalid' | 'unavailable'
type RpcNetwork = 'matches' | 'mismatch' | 'missing' | 'unavailable'

export type RecordedSettleRequest = Readonly<{
  url: string
  body: unknown
}>

export type Runtime = {
  sqlite: DatabaseSync
  db: SqliteD1
  env: AgenticCommercePaidResourceWorkerEnv
  dependencies: PaidResourceDependencies
  counts: EffectCounts
  rpcRequests: ReadonlyArray<Record<string, unknown>>
  settleRequests: RecordedSettleRequest[]
  transactionHash: string
  resetCounts(): void
  setNow(now: Date): void
}

export const responseJson = (body: unknown, status = 200): Response => new Response(
  JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json' } },
)

export const createRuntime = async (options: {
  settlement?: Settlement
  settlements?: Settlement[]
  reconciliation?: Reconciliation[]
  rpcNetwork?: RpcNetwork
  resourceBody?: unknown
  verification?: Verification
} = {}): Promise<Runtime> => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(MIGRATION, 'utf8'))
  const db = new SqliteD1(sqlite)
  const transactionHash = await xrplTransactionHash(SIGNED_TX_BLOB)
  assert.ok(transactionHash)
  const counts: EffectCounts = {
    ready: 0,
    supported: 0,
    verify: 0,
    resource: 0,
    settle: 0,
    rpc: 0,
  }
  const reconciliation = [...(options.reconciliation ?? ['fulfilled'])]
  const settlements = [...(options.settlements ?? [])]
  const settleRequests: RecordedSettleRequest[] = []
  const rpcRequests: Record<string, unknown>[] = []

  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
    if (url.pathname === '/supported') {
      counts.supported += 1
      return responseJson({
        kinds: [{ x402Version: 2, scheme: 'exact', network: 'xrpl:1' }],
      })
    }
    if (url.pathname === '/verify') {
      counts.verify += 1
      if (options.verification === 'unavailable') return responseJson({ error: 'timeout' }, 503)
      if (options.verification === 'invalid') return responseJson({ isValid: false })
      return responseJson({ isValid: true, payer: 'rBuyer' })
    }
    if (url.pathname === '/settle') {
      counts.settle += 1
      const settleBody = typeof init?.body === 'string' ? JSON.parse(init.body) : null
      settleRequests.push(Object.freeze({
        url: url.toString(),
        body: settleBody,
      }))
      const submittedBlob = (settleBody as {
        paymentPayload?: { payload?: { signedTxBlob?: unknown } }
      } | null)?.paymentPayload?.payload?.signedTxBlob
      const settledTransactionHash = typeof submittedBlob === 'string'
        ? await xrplTransactionHash(submittedBlob)
        : null
      assert.ok(settledTransactionHash)
      const settlement = settlements.shift() ?? options.settlement ?? 'success'
      if (settlement === 'ambiguous') {
        return responseJson({ error: 'upstream_timeout' }, 504)
      }
      if (settlement === 'permanent-failure') {
        return responseJson({
          success: false,
          errorReason: 'invalid_payment',
          settlementAttempted: false,
          transaction: settledTransactionHash,
          network: 'xrpl:1',
          amount: '1000',
        }, 422)
      }
      if (settlement === 'wrong-hash-failure' || settlement === 'wrong-network-failure') {
        return responseJson({
          success: false,
          errorReason: 'invalid_payment',
          settlementAttempted: false,
          transaction: settlement === 'wrong-hash-failure' ? 'CD'.repeat(32) : settledTransactionHash,
          network: settlement === 'wrong-network-failure' ? 'xrpl:2' : 'xrpl:1',
          amount: '1000',
        }, 422)
      }
      if (settlement === 'absent-failure-200' || settlement === 'absent-failure-4xx') {
        return responseJson({
          success: false,
          errorReason: 'invalid_payment',
          transaction: settledTransactionHash,
          network: 'xrpl:1',
          amount: '1000',
        }, settlement === 'absent-failure-200' ? 200 : 422)
      }
      if (settlement === 'pending-failure' || settlement === 'attempted-failure') {
        return responseJson({
          success: false,
          errorReason: settlement === 'pending-failure' ? 'settlement_pending' : 'invalid_payment',
          settlementAttempted: true,
          transaction: settledTransactionHash,
          network: 'xrpl:1',
          amount: '1000',
        }, 422)
      }
      return responseJson({
        success: true,
        transaction: settledTransactionHash,
        network: 'xrpl:1',
        ...(settlement === 'minimal-success' ? {} : { amount: '1000', payer: 'rBuyer' }),
      })
    }
    if (url.origin === 'https://rpc.test') {
      counts.rpc += 1
      const request = typeof init?.body === 'string'
        ? JSON.parse(init.body) as Record<string, unknown> & { method?: string }
        : null
      if (request) rpcRequests.push(request)
      if (request?.method === 'server_info') {
        if (options.rpcNetwork === 'unavailable') return responseJson({ error: 'unavailable' }, 503)
        if (options.rpcNetwork === 'missing') return responseJson({ result: { info: {} } })
        return responseJson({
          result: { info: { network_id: options.rpcNetwork === 'mismatch' ? 2 : 1 } },
        })
      }
      assert.equal(request?.method, 'tx')
      const next = reconciliation.shift() ?? 'fulfilled'
      if (next === 'pending') return responseJson({ result: { error: 'txnNotFound' } })
      const row = sqlite.prepare(
        'SELECT requirements_json FROM agentic_commerce_paid_resources',
      ).get() as { requirements_json: string }
      const requirements = JSON.parse(row.requirements_json) as {
        extra: { invoiceId: string; sourceTag: number }
      }
      const memoData = Array.from(
        new TextEncoder().encode(requirements.extra.invoiceId),
        byte => byte.toString(16).padStart(2, '0'),
      ).join('').toUpperCase()
      const payment = {
        hash: transactionHash,
        Account: 'rBuyer',
        TransactionType: 'Payment',
        Destination: PAY_TO,
        Amount: '1000',
        SourceTag: requirements.extra.sourceTag,
        Memos: [{ Memo: { MemoData: memoData } }],
      }
      const result: Record<string, unknown> = {
        validated: true,
        meta: next === 'missing-meta'
          ? undefined
          : {
              TransactionResult: 'tesSUCCESS',
              ...(next === 'missing-delivered' ? {} : { delivered_amount: '1000' }),
            },
        ...(next === 'fulfilled-v1'
          ? payment
          : { hash: transactionHash, tx_json: payment }),
      }
      return responseJson({ result })
    }
    throw new Error(`unexpected outbound URL: ${url.toString()}`)
  }

  const binding = {
    fetch: async (request: Request): Promise<Response> => {
      const url = new URL(request.url)
      if (url.pathname === '/readyz') {
        counts.ready += 1
        return responseJson({ ok: true })
      }
      if (url.pathname === '/v1/requote') {
        counts.resource += 1
        return responseJson(options.resourceBody ?? {
          kind: 'offer',
          legId: DISCOVERY_REQUEST.legId,
          offerId: 'offer-live-01',
          amountMinor: 125_00,
          currency: 'SGD',
          priceVerification: 'verified',
          agentId: DISCOVERY_REQUEST.agentId,
          promptTokens: 0,
          completionTokens: 0,
          dollarCost: 0,
          provenance: {
            provider: 'atlas-atriptech',
            providerReference: 'atlas-routing-reference-1',
            providerReferenceDigest: 'a'.repeat(64),
            currency: 'SGD',
            priceVerification: 'verified',
            verificationSessionDigest: 'b'.repeat(64),
            verificationValidForSeconds: '1800',
            inventoryState: 'not-held-until-order',
            bookability: 'verified-not-ordered',
            contractVersion: 'agentic-graph.travel-discovery/v1',
          },
        })
      }
      throw new Error(`unexpected binding URL: ${url.toString()}`)
    },
  }
  let uuid = 0
  let currentNow = new Date(NOW)
  const dependencies: PaidResourceDependencies = {
    fetchFn,
    now: () => new Date(currentNow),
    randomUuid: () => `claim-${++uuid}`,
    sleep: async () => await new Promise(resolve => setTimeout(resolve, 0)),
  }
  const env: AgenticCommercePaidResourceWorkerEnv = {
    XRPL_X402_NETWORK: 'xrpl:1',
    XRPL_X402_PAY_TO_ADDRESS: PAY_TO,
    XRPL_X402_AMOUNT_DROPS: '1000',
    XRPL_X402_SOURCE_TAG: '804681468',
    XRPL_X402_DESTINATION_TAG: '',
    XRPL_X402_FACILITATOR_URL: 'https://facilitator.test',
    XRPL_X402_RPC_URL: 'https://rpc.test',
    XRPL_X402_MAX_TIMEOUT_SECONDS: '300',
    TRAVEL_DISCOVERY_HARNESS: binding,
  }
  return {
    sqlite,
    db,
    env,
    dependencies,
    counts,
    rpcRequests,
    settleRequests,
    transactionHash,
    resetCounts: () => {
      for (const key of Object.keys(counts) as (keyof EffectCounts)[]) counts[key] = 0
    },
    setNow: (now: Date) => { currentNow = new Date(now) },
  }
}

export const routeRequest = (args: {
  body?: string
  idempotencyKey?: string
  paymentSignature?: string
} = {}): Request => {
  const headers = new Headers({
    'content-type': 'application/json',
    'IDEMPOTENCY-KEY': args.idempotencyKey ?? IDEMPOTENCY_KEY,
  })
  if (args.paymentSignature) headers.set('PAYMENT-SIGNATURE', args.paymentSignature)
  return new Request(ROUTE, {
    method: 'POST',
    headers,
    body: args.body ?? JSON.stringify(DISCOVERY_REQUEST),
  })
}

export const issueChallenge = async (
  runtime: Runtime,
  body?: string,
): Promise<PaymentRequired> => {
  const response = await handleAgenticCommercePaidResourceRoute(
    routeRequest({ body }),
    runtime.env,
    runtime.db,
    CORS_HEADERS,
    runtime.dependencies,
  )
  assert.equal(response.status, 402)
  const header = response.headers.get('PAYMENT-REQUIRED')
  assert.ok(header)
  return decodePaymentRequiredHeader(header)
}

export const paymentPayload = (
  challenge: PaymentRequired,
  acceptedOverrides: Partial<PaymentRequirements> = {},
  signedTxBlob = SIGNED_TX_BLOB,
): PaymentPayload => {
  assert.equal(challenge.x402Version, 2)
  if (challenge.x402Version !== 2) throw new Error('v2 challenge required')
  const accepted = {
    ...challenge.accepts[0],
    ...acceptedOverrides,
  } as PaymentRequirements
  const invoiceId = challenge.accepts[0]?.extra?.invoiceId
  assert.equal(typeof invoiceId, 'string')
  return {
    x402Version: 2,
    resource: challenge.resource,
    accepted,
    payload: { invoiceId, signedTxBlob },
  }
}

export const paidRequest = async (
  runtime: Runtime,
  signature: string,
): Promise<Response> => await handleAgenticCommercePaidResourceRoute(
  routeRequest({ paymentSignature: signature }),
  runtime.env,
  runtime.db,
  CORS_HEADERS,
  runtime.dependencies,
)
