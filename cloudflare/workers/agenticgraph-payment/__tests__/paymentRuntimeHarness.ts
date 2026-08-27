import type {
  PaymentIntentRecord,
  PaymentProviderCostEntry,
} from '../../../../grph-shared/src/payments/paymentRuntimeContract'
import type { PaymentBuyerProduct } from '../../../../grph-shared/src/payments/paymentBuyerProductSsot'
import {
  buildProviderIdempotencyKey,
} from '../../../../grph-shared/src/payments/paymentRuntimeContract'
import type {
  PaymentProviderCreateResult,
  PaymentProviderReadResult,
  PaymentProviderRefundResult,
  PaymentRailAdapter,
} from '../paymentRailAdapters'
import type {
  PaymentEventClaim,
  PaymentIntentUpdateResult,
  PaymentRuntimeStore,
  PersistedPaymentIntentRecord,
} from '../paymentRuntimePersistence'
import { PAYMENT_EVENT_CLAIM_STALE_MS } from '../paymentRuntimePersistence'

export class MemoryPaymentRuntimeStore implements PaymentRuntimeStore {
  readonly intents = new Map<string, PersistedPaymentIntentRecord>()
  readonly clientKeys = new Map<string, string>()
  readonly costs: PaymentProviderCostEntry[] = []
  readonly events = new Map<string, {
    semanticKey: string
    rawBodyHash: string
    status: 'processing' | 'processed' | 'failed'
    receivedAt: string
    claimToken: string | null
    claimExpiresAt: string | null
  }>()
  readonly operationLog: string[] = []
  rejectCostWrites = false
  private claimSequence = 0

  async findIntentByClientKey(
    clientIntentKey: string,
  ): Promise<PersistedPaymentIntentRecord | null> {
    const id = this.clientKeys.get(clientIntentKey)
    return id ? this.intents.get(id) || null : null
  }

  async findIntentById(
    intentId: string,
  ): Promise<PersistedPaymentIntentRecord | null> {
    return this.intents.get(intentId) || null
  }

  async findIntentByProviderObject(
    rail: PaymentIntentRecord['rail'],
    providerObjectId: string,
  ): Promise<PersistedPaymentIntentRecord | null> {
    return [...this.intents.values()].find(record =>
      record.rail === rail && record.providerObjectId === providerObjectId) || null
  }

  async findPaidSettlementEvidence(
    rail: PaymentIntentRecord['rail'],
  ): Promise<PersistedPaymentIntentRecord | null> {
    return [...this.intents.values()].find(record =>
      record.rail === rail
      && record.state === 'paid'
      && record.providerObjectId !== null
      && this.costs.some(cost =>
        cost.intentId === record.id
        && cost.outcome === 'success'
        && (cost.operation === 'payment.read' || cost.operation.endsWith('.read')))
      && [...this.events.entries()].some(([key, event]) =>
        key.startsWith(`${rail}:`)
        && event.status === 'processed'
        && event.semanticKey.endsWith(`:${record.providerObjectId}`))) || null
  }

  async insertIntent(
    record: PaymentIntentRecord,
  ): Promise<PersistedPaymentIntentRecord> {
    this.operationLog.push(`insert:${record.clientIntentKey}`)
    if (this.clientKeys.has(record.clientIntentKey)) throw new Error('duplicate')
    const persisted = structuredClone({
      ...record,
      revision: 0,
    }) as PersistedPaymentIntentRecord
    this.clientKeys.set(record.clientIntentKey, record.id)
    this.intents.set(record.id, persisted)
    return structuredClone(persisted)
  }

  async updateIntent(
    record: PersistedPaymentIntentRecord,
  ): Promise<PaymentIntentUpdateResult> {
    const current = this.intents.get(record.id)
    if (!current || current.revision !== record.revision) {
      this.operationLog.push(`conflict:${record.state}`)
      return {
        ok: false,
        code: 'intent_revision_conflict',
        current: current ? structuredClone(current) : null,
      }
    }
    const persisted = structuredClone({
      ...record,
      revision: record.revision + 1,
    }) as PersistedPaymentIntentRecord
    this.operationLog.push(`update:${record.state}`)
    this.intents.set(record.id, persisted)
    return { ok: true, record: structuredClone(persisted) }
  }

  async claimProviderEvent(args: {
    provider: 'stripe' | 'straitsx'
    eventId: string
    semanticKey: string
    rawBodyHash: string
    receivedAt: string
  }): Promise<PaymentEventClaim> {
    this.claimSequence += 1
    const claimToken = `claim_${this.claimSequence}`
    const claimExpiresAt = new Date(
      Date.parse(args.receivedAt) + PAYMENT_EVENT_CLAIM_STALE_MS,
    ).toISOString()
    const eventKey = `${args.provider}:${args.eventId}`
    const semanticMatch = [...this.events.entries()].find(([key, event]) =>
      key.startsWith(`${args.provider}:`) && event.semanticKey === args.semanticKey)
    const exact = this.events.get(eventKey)
    const existingEntry = exact
      ? [eventKey, exact] as const
      : semanticMatch
    const existing = existingEntry?.[1]
    if (existing) {
      if (exact && (
        existing.rawBodyHash !== args.rawBodyHash
        || existing.semanticKey !== args.semanticKey
      )) {
        return { ok: false, code: 'event_identity_conflict' }
      }
      const staleClaim =
        existing.status === 'processing'
        && existing.claimExpiresAt !== null
        && existing.claimExpiresAt <= args.receivedAt
      if (existing.status !== 'failed' && !staleClaim) {
        return { ok: true, shouldProcess: false, duplicate: true }
      }
      existing.status = 'processing'
      existing.receivedAt = args.receivedAt
      existing.claimToken = claimToken
      existing.claimExpiresAt = claimExpiresAt
      return {
        ok: true,
        shouldProcess: true,
        duplicate: false,
        claimEventId: String(existingEntry?.[0]).slice(args.provider.length + 1),
        claimToken,
      }
    }
    this.events.set(eventKey, {
      semanticKey: args.semanticKey,
      rawBodyHash: args.rawBodyHash,
      status: 'processing',
      receivedAt: args.receivedAt,
      claimToken,
      claimExpiresAt,
    })
    return {
      ok: true,
      shouldProcess: true,
      duplicate: false,
      claimEventId: args.eventId,
      claimToken,
    }
  }

  async completeProviderEvent(args: {
    provider: 'stripe' | 'straitsx'
    eventId: string
    claimToken: string
    processedAt: string
  }): Promise<boolean> {
    void args.processedAt
    const event = this.events.get(`${args.provider}:${args.eventId}`)
    if (
      !event
      || event.status !== 'processing'
      || event.claimToken !== args.claimToken
    ) return false
    event.status = 'processed'
    event.claimToken = null
    event.claimExpiresAt = null
    return true
  }

  async failProviderEvent(args: {
    provider: 'stripe' | 'straitsx'
    eventId: string
    claimToken: string
    error: string
  }): Promise<boolean> {
    void args.error
    const event = this.events.get(`${args.provider}:${args.eventId}`)
    if (
      !event
      || event.status !== 'processing'
      || event.claimToken !== args.claimToken
    ) return false
    event.status = 'failed'
    event.claimToken = null
    event.claimExpiresAt = null
    return true
  }

  async appendCostEntry(entry: PaymentProviderCostEntry): Promise<void> {
    if (this.rejectCostWrites) throw new Error('cost ledger unavailable')
    this.costs.push(structuredClone(entry))
  }

  async listCostEntries(): Promise<readonly PaymentProviderCostEntry[]> {
    return structuredClone(this.costs)
  }
}

export const buildAdapter = (args: {
  store?: MemoryPaymentRuntimeStore
  create?: (record: PaymentIntentRecord) => Promise<PaymentProviderCreateResult>
  read?: (record: PaymentIntentRecord) => Promise<PaymentProviderReadResult>
  refund?: (record: PaymentIntentRecord) => Promise<PaymentProviderRefundResult>
} = {}): PaymentRailAdapter => Object.freeze({
  async create(record) {
    args.store?.operationLog.push(`provider-create:${record.clientIntentKey}`)
    if (args.create) return args.create(record)
    return {
      ok: true,
      state: 'pending_provider',
      providerObjectId: `provider_${record.clientIntentKey}`,
      providerRequestId: 'request_create',
      instruction: null,
      calls: [{
        operation: 'payment.create',
        requestId: 'request_create',
        outcome: 'success',
        elapsedMs: 1,
      }],
    }
  },
  async read(record) {
    args.store?.operationLog.push(`provider-read:${record.clientIntentKey}`)
    if (args.read) return args.read(record)
    return {
      ok: true,
      state: 'paid',
      amountMinor: record.amountMinor,
      currency: record.currency,
      providerObjectId: record.providerObjectId || '',
      clientIntentReference: buildProviderIdempotencyKey(
        record.rail,
        record.clientIntentKey,
      ),
      providerRequestId: 'request_read',
      refundTargetId: 'payment_intent_1',
      calls: [{
        operation: 'payment.read',
        requestId: 'request_read',
        outcome: 'success',
        elapsedMs: 1,
      }],
    }
  },
  async refund(record) {
    args.store?.operationLog.push(`provider-refund:${record.clientIntentKey}`)
    if (args.refund) return args.refund(record)
    return {
      ok: true,
      refundReference: 'refund_1',
      providerRequestId: 'request_refund',
      calls: [{
        operation: 'refund.create',
        requestId: 'request_refund',
        outcome: 'success',
        elapsedMs: 1,
      }],
    }
  },
})

export const TEST_COMMAND = Object.freeze({
  clientIntentKey: '019fac4b-2bfc-7363-9fea-dcab0282cfe8',
  amountMinor: 1200,
  currency: 'sgd',
  settlementAsset: 'fiat',
  origin: 'buyer',
})

export const TEST_BUYER_PRODUCT: PaymentBuyerProduct = Object.freeze({
  amountMinor: TEST_COMMAND.amountMinor,
  currency: TEST_COMMAND.currency,
  settlementAsset: TEST_COMMAND.settlementAsset,
})

export const TEST_READINESS = Object.freeze({
  rails: Object.freeze({ stripe: true, straitsx: true, xsgd: false }),
  admissionRails: Object.freeze({ stripe: true, straitsx: true, xsgd: false }),
  cardSettledCurrencies: Object.freeze(['sgd', 'usd']),
  entries: Object.freeze([
    Object.freeze({
      rail: 'stripe' as const,
      ready: true,
      missing: Object.freeze([]),
      admissionReady: true,
      admissionMissing: Object.freeze([]),
    }),
    Object.freeze({
      rail: 'straitsx' as const,
      ready: true,
      missing: Object.freeze([]),
      admissionReady: true,
      admissionMissing: Object.freeze([]),
    }),
  ]),
  unavailableSources: Object.freeze(['authenticated_paid_sandbox_attestation']),
})
