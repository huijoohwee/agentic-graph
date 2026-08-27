import type { SharedCanvasNode } from './nodeDeltaContract'

import {
  hasTravelServiceBinding,
  inspectTravelMutationTriggerReadiness,
  isConfiguredTravelToken,
  parseTravelBundleMap,
  parseTravelDispatchTimeoutMs,
  readTravelIdentifier,
  travelBundleLocatorKey,
  TRAVEL_BUNDLE_MAP_SCHEMA,
  type TravelBundleSeed,
  type TravelMutationTriggerEnv,
  type TravelMutationTriggerReadiness,
} from './travelMutationConfig'

export {
  inspectTravelMutationTriggerReadiness,
  TRAVEL_BUNDLE_MAP_SCHEMA,
  type TravelBundleSeed,
  type TravelMutationTriggerEnv,
  type TravelMutationTriggerReadiness,
} from './travelMutationConfig'

export const TRAVEL_MUTATION_OUTBOX_SCHEMA = 'agenticgraph-shared-canvas-travel-mutation-outbox/v1'

const EVENT_PREFIX = 'travel-mutation-outbox:event:'
const SCHEDULE_PREFIX = 'travel-mutation-outbox:schedule:'
const CLAIM_GRACE_MS = 5_000
const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 300_000
const DELIVERED_RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1_000
const MAX_DISPATCH_BATCH = 8

export type TravelMutationOutboxListOptions = Readonly<{
  start?: string
  startAfter?: string
  end?: string
  prefix?: string
  reverse?: boolean
  limit?: number
}>

export type TravelMutationOutboxTransaction = {
  get<T = unknown>(key: string): Promise<T | undefined>
  list<T = unknown>(options?: TravelMutationOutboxListOptions): Promise<Map<string, T>>
  put<T>(key: string, value: T): Promise<void>
  put<T>(entries: Record<string, T>): Promise<void>
  delete(key: string): Promise<boolean | void>
  delete(keys: string[]): Promise<number | void>
  getAlarm(): Promise<number | null>
  setAlarm(scheduledTime: number | Date): Promise<void>
  deleteAlarm(): Promise<void>
}

export type TravelMutationOutboxStorage = TravelMutationOutboxTransaction & {
  list<T = unknown>(options?: TravelMutationOutboxListOptions): Promise<Map<string, T>>
  transaction<T>(closure: (transaction: TravelMutationOutboxTransaction) => Promise<T>): Promise<T>
  deleteAlarm(): Promise<void>
}

export type AcceptedTravelMutation = Readonly<{
  workspaceId: string
  roomId: string
  nodeId: string
  transactionId: string
  legId: string
}>

type BundleResolution =
  | Readonly<{ ok: true; bundleId: string; initializationSeed: TravelBundleSeed; seedDigest: string }>
  | Readonly<{ ok: false; reason: 'bundle-map-missing' | 'bundle-map-invalid' | 'bundle-mapping-unavailable' | 'bundle-seed-leg-unavailable' }>

type DispatchResult =
  | Readonly<{ ok: true; status: number }>
  | Readonly<{ ok: false; reason: string; status: number | null }>

type OutboxRecord = Readonly<{
  schema: typeof TRAVEL_MUTATION_OUTBOX_SCHEMA
  eventDigest: string
  event: AcceptedTravelMutation
  bundleId: string | null
  initializationSeed: TravelBundleSeed | null
  seedDigest: string | null
  status: 'pending' | 'delivered'
  attempts: number
  scheduleKey: string
  nextAttemptAt: number
  lastAttemptAt: number | null
  lastStatus: number | null
  lastError: string | null
  deliveredAt: number | null
}>

type ScheduleRecord = Readonly<{
  schema: typeof TRAVEL_MUTATION_OUTBOX_SCHEMA
  action: 'dispatch' | 'cleanup'
  eventKey: string
  eventDigest: string
  dueAt: number
}>

const isScheduleRecord = (value: unknown): value is ScheduleRecord =>
  isRecord(value)
  && value.schema === TRAVEL_MUTATION_OUTBOX_SCHEMA
  && (value.action === 'dispatch' || value.action === 'cleanup')
  && typeof value.eventKey === 'string'
  && /^[0-9a-f]{64}$/.test(String(value.eventDigest || ''))
  && typeof value.dueAt === 'number'
  && Number.isSafeInteger(value.dueAt)
  && value.dueAt >= 0

export type TravelMutationOutboxOptions = Readonly<{
  storage: TravelMutationOutboxStorage
  env: TravelMutationTriggerEnv
  nowMs?: () => number
  resolveBundleId?: (event: AcceptedTravelMutation) => Promise<BundleResolution>
  dispatch?: (bundleId: string, seed: TravelBundleSeed, event: AcceptedTravelMutation, timeoutMs: number) => Promise<DispatchResult>
}>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const readLocatorPart = (value: unknown): string | null => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized && normalized.length <= 256 && !/[\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : null
}

const padTime = (value: number): string => String(Math.max(0, Math.floor(value))).padStart(13, '0')

const scheduleKey = (dueAt: number, digest: string): string =>
  `${SCHEDULE_PREFIX}${padTime(dueAt)}:${digest}`

const eventKey = (digest: string): string => `${EVENT_PREFIX}${digest}`

export const readAcceptedTravelMutation = (args: {
  node: SharedCanvasNode
  payload: unknown
}): AcceptedTravelMutation | null => {
  if (!isRecord(args.payload) || !Object.hasOwn(args.payload, 'leg_id')) return null
  const workspaceId = readLocatorPart(args.node.workspaceId)
  const roomId = readLocatorPart(args.node.roomId)
  const nodeId = readTravelIdentifier(args.node.nodeId)
  const transactionId = readTravelIdentifier(args.node.transactionId)
  const legId = readTravelIdentifier(args.payload.leg_id)
  if (!workspaceId || !roomId || !nodeId || !transactionId || !legId) return null
  return Object.freeze({ workspaceId, roomId, nodeId, transactionId, legId })
}

const digestEvent = async (event: AcceptedTravelMutation): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify([
    event.workspaceId,
    event.roomId,
    event.nodeId,
    event.transactionId,
    event.legId,
  ]))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

const digestSeed = async (bundleId: string, seed: TravelBundleSeed): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([bundleId, seed])))
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

const retryDelayMs = (attempts: number, digest: string): number => {
  const exponent = Math.min(8, Math.max(0, attempts - 1))
  const base = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** exponent))
  const jitter = Number.parseInt(digest.slice(0, 4), 16) % 1_000
  return Math.min(RETRY_MAX_MS, base + jitter)
}

const boundedReason = (value: unknown): string => {
  const text = value instanceof Error ? value.message : String(value || 'dispatch-unavailable')
  return text.replace(/[\r\n\t]/g, ' ').slice(0, 160) || 'dispatch-unavailable'
}

export class TravelMutationOutbox {
  private readonly storage: TravelMutationOutboxStorage
  private readonly env: TravelMutationTriggerEnv
  private readonly nowMs: () => number
  private readonly injectedResolver: TravelMutationOutboxOptions['resolveBundleId']
  private readonly injectedDispatch: TravelMutationOutboxOptions['dispatch']

  constructor(options: TravelMutationOutboxOptions) {
    this.storage = options.storage
    this.env = options.env
    this.nowMs = options.nowMs ?? Date.now
    this.injectedResolver = options.resolveBundleId
    this.injectedDispatch = options.dispatch
  }

  readiness(): TravelMutationTriggerReadiness {
    return inspectTravelMutationTriggerReadiness(this.env)
  }

  async enqueueAccepted(args: { node: SharedCanvasNode; payload: unknown }): Promise<'ignored' | 'enqueued' | 'duplicate'> {
    return this.enqueueAcceptedAtomically(args, null)
  }

  async enqueueAcceptedAtomically(
    args: { node: SharedCanvasNode; payload: unknown },
    transaction: TravelMutationOutboxTransaction | null,
  ): Promise<'ignored' | 'enqueued' | 'duplicate'> {
    const event = readAcceptedTravelMutation(args)
    if (!event) return 'ignored'
    const digest = await digestEvent(event)
    const key = eventKey(digest)
    const now = this.nowMs()
    const write = async (writer: TravelMutationOutboxTransaction): Promise<'enqueued' | 'duplicate'> => {
      const existing = await writer.get<OutboxRecord>(key)
      if (existing?.schema === TRAVEL_MUTATION_OUTBOX_SCHEMA) {
        if (existing.status === 'pending') await this.ensureAlarm(writer, existing.nextAttemptAt)
        return 'duplicate'
      }
      const dueKey = scheduleKey(now, digest)
      const record: OutboxRecord = Object.freeze({
        schema: TRAVEL_MUTATION_OUTBOX_SCHEMA,
        eventDigest: digest,
        event,
        bundleId: null,
        initializationSeed: null,
        seedDigest: null,
        status: 'pending',
        attempts: 0,
        scheduleKey: dueKey,
        nextAttemptAt: now,
        lastAttemptAt: null,
        lastStatus: null,
        lastError: null,
        deliveredAt: null,
      })
      const schedule: ScheduleRecord = Object.freeze({
        schema: TRAVEL_MUTATION_OUTBOX_SCHEMA,
        action: 'dispatch',
        eventKey: key,
        eventDigest: digest,
        dueAt: now,
      })
      await writer.put({ [key]: record, [dueKey]: schedule })
      await this.ensureAlarm(writer, now)
      return 'enqueued'
    }
    return transaction ? write(transaction) : this.storage.transaction(write)
  }

  async drain(): Promise<void> {
    const now = this.nowMs()
    const schedules = await this.storage.list<ScheduleRecord>({ prefix: SCHEDULE_PREFIX, limit: MAX_DISPATCH_BATCH })
    const due: Array<readonly [string, ScheduleRecord]> = []
    for (const [key, schedule] of schedules) {
      if (!isScheduleRecord(schedule)) {
        await this.storage.delete(key)
        continue
      }
      if (schedule.dueAt > now) break
      due.push([key, schedule])
    }
    await Promise.all(due.map(async ([key, schedule]) => schedule.action === 'cleanup'
      ? this.cleanupDelivered(key, schedule)
      : this.dispatchScheduled(key, schedule, now)))
    await this.resetAlarmToEarliestSchedule()
  }

  private async dispatchScheduled(key: string, schedule: ScheduleRecord, now: number): Promise<void> {
    const claimed = await this.storage.transaction(async (transaction): Promise<OutboxRecord | null> => {
      const record = await transaction.get<OutboxRecord>(schedule.eventKey)
      if (!record || record.schema !== TRAVEL_MUTATION_OUTBOX_SCHEMA || record.status !== 'pending') {
        await transaction.delete(key)
        return null
      }
      if (record.scheduleKey !== key) {
        await transaction.delete(key)
        return null
      }
      const timeoutMs = parseTravelDispatchTimeoutMs(this.env.SHARED_NODE_TRAVEL_DISPATCH_TIMEOUT_MS) ?? 12_000
      const leaseDueAt = now + timeoutMs + CLAIM_GRACE_MS
      const leaseKey = scheduleKey(leaseDueAt, record.eventDigest)
      const next: OutboxRecord = Object.freeze({
        ...record,
        attempts: record.attempts + 1,
        scheduleKey: leaseKey,
        nextAttemptAt: leaseDueAt,
        lastAttemptAt: now,
      })
      const lease: ScheduleRecord = Object.freeze({ ...schedule, dueAt: leaseDueAt })
      await transaction.put({ [schedule.eventKey]: next, [leaseKey]: lease })
      await transaction.delete(key)
      await this.ensureAlarm(transaction, leaseDueAt)
      return next
    })
    if (!claimed) return

    const timeoutMs = parseTravelDispatchTimeoutMs(this.env.SHARED_NODE_TRAVEL_DISPATCH_TIMEOUT_MS)
    const resolution = claimed.bundleId && claimed.initializationSeed && claimed.seedDigest
      ? {
          ok: true as const,
          bundleId: claimed.bundleId,
          initializationSeed: claimed.initializationSeed,
          seedDigest: claimed.seedDigest,
        }
      : await this.resolveBundleId(claimed.event)
    const dispatchRecord = resolution.ok && (
      claimed.bundleId == null || claimed.initializationSeed == null || claimed.seedDigest == null
    )
      ? await this.lockBundleIdentity(claimed, resolution)
      : claimed
    let result: DispatchResult
    if (timeoutMs == null) {
      result = { ok: false, reason: 'travel-dispatch-timeout-invalid', status: null }
    } else if ('reason' in resolution) {
      result = { ok: false, reason: resolution.reason, status: null }
    } else if (!dispatchRecord) {
      result = { ok: false, reason: 'outbox-claim-lost', status: null }
    } else if (
      !dispatchRecord.seedDigest
      || dispatchRecord.seedDigest !== await digestSeed(
        dispatchRecord.bundleId ?? resolution.bundleId,
        dispatchRecord.initializationSeed ?? resolution.initializationSeed,
      )
    ) {
      result = { ok: false, reason: 'bundle-seed-digest-mismatch', status: null }
    } else {
      result = await this.dispatch(
        dispatchRecord.bundleId ?? resolution.bundleId,
        dispatchRecord.initializationSeed ?? resolution.initializationSeed,
        dispatchRecord.event,
        timeoutMs,
      )
    }
    if (result.ok) {
      await this.markDelivered(dispatchRecord ?? claimed, result.status)
    } else {
      await this.scheduleRetry(dispatchRecord ?? claimed, 'reason' in result ? result.reason : 'dispatch-unavailable', result.status)
    }
  }

  private async lockBundleIdentity(
    claimed: OutboxRecord,
    resolution: Extract<BundleResolution, { ok: true }>,
  ): Promise<OutboxRecord | null> {
    return this.storage.transaction(async (transaction) => {
      const key = eventKey(claimed.eventDigest)
      const current = await transaction.get<OutboxRecord>(key)
      if (!current || current.scheduleKey !== claimed.scheduleKey || current.status !== 'pending') return null
      if (current.bundleId && current.bundleId !== resolution.bundleId) return null
      if (current.bundleId && current.initializationSeed && current.seedDigest) return current
      const locked = Object.freeze({
        ...current,
        bundleId: resolution.bundleId,
        initializationSeed: resolution.initializationSeed,
        seedDigest: resolution.seedDigest,
      })
      await transaction.put(key, locked)
      return locked
    })
  }

  private async resolveBundleId(event: AcceptedTravelMutation): Promise<BundleResolution> {
    if (this.injectedResolver) return this.injectedResolver(event)
    const bundleMap = parseTravelBundleMap(this.env.SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON)
    if (!bundleMap.ok) {
      return { ok: false, reason: 'missing' in bundleMap && bundleMap.missing ? 'bundle-map-missing' : 'bundle-map-invalid' }
    }
    const entry = bundleMap.entries.get(travelBundleLocatorKey(event))
    if (!entry) return { ok: false, reason: 'bundle-mapping-unavailable' }
    if (!entry.initializationSeed.legs.some(leg => leg.leg_id === event.legId)) {
      return { ok: false, reason: 'bundle-seed-leg-unavailable' }
    }
    return {
      ok: true,
      bundleId: entry.bundleId,
      initializationSeed: entry.initializationSeed,
      seedDigest: await digestSeed(entry.bundleId, entry.initializationSeed),
    }
  }

  private async dispatch(
    bundleId: string,
    seed: TravelBundleSeed,
    event: AcceptedTravelMutation,
    timeoutMs: number,
  ): Promise<DispatchResult> {
    if (this.injectedDispatch) return this.injectedDispatch(bundleId, seed, event, timeoutMs)
    const binding = this.env.AGENTICGRAPH_TRAVEL_COMMERCE
    const token = typeof this.env.AGENTICGRAPH_TRAVEL_COMMERCE_API_TOKEN === 'string'
      ? this.env.AGENTICGRAPH_TRAVEL_COMMERCE_API_TOKEN.trim()
      : ''
    if (!hasTravelServiceBinding(binding)) return { ok: false, reason: 'travel-service-binding-missing', status: null }
    if (!isConfiguredTravelToken(token)) return { ok: false, reason: 'travel-service-token-missing-or-weak', status: null }
    const deadlineAt = Date.now() + timeoutMs
    const fetchTravel = async (path: string, method: 'PUT' | 'POST', body: unknown): Promise<Response> => {
      const remainingMs = deadlineAt - Date.now()
      if (remainingMs < 1) throw new DOMException('travel-dispatch-timeout', 'TimeoutError')
      return binding.fetch(new Request(`https://agenticgraph-travel-commerce.internal${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(remainingMs),
      }))
    }
    try {
      const bundlePath = `/v1/bundles/${encodeURIComponent(bundleId)}`
      const initialized = await fetchTravel(bundlePath, 'PUT', seed)
      if (initialized.body) await initialized.body.cancel()
      if (!initialized.ok) {
        return { ok: false, reason: `travel-seed-http-${initialized.status}`, status: initialized.status }
      }
      const response = await fetchTravel(
        `${bundlePath}/mutations`,
        'POST',
        { leg_id: event.legId, event_id: event.transactionId },
      )
      if (response.body) await response.body.cancel()
      return (response.status >= 200 && response.status < 300) || response.status === 422
        ? { ok: true, status: response.status }
        : { ok: false, reason: `travel-service-http-${response.status}`, status: response.status }
    } catch (error) {
      return { ok: false, reason: boundedReason(error), status: null }
    }
  }

  private async markDelivered(claimed: OutboxRecord, status: number): Promise<void> {
    const deliveredAt = this.nowMs()
    await this.storage.transaction(async (transaction) => {
      const current = await transaction.get<OutboxRecord>(eventKey(claimed.eventDigest))
      if (!current || current.scheduleKey !== claimed.scheduleKey || current.status !== 'pending') return
      const cleanupAt = deliveredAt + DELIVERED_RECEIPT_TTL_MS
      const cleanupKey = scheduleKey(cleanupAt, current.eventDigest)
      const delivered: OutboxRecord = Object.freeze({
        ...current,
        status: 'delivered',
        scheduleKey: cleanupKey,
        nextAttemptAt: cleanupAt,
        lastStatus: status,
        lastError: null,
        deliveredAt,
      })
      const cleanup: ScheduleRecord = Object.freeze({
        schema: TRAVEL_MUTATION_OUTBOX_SCHEMA,
        action: 'cleanup',
        eventKey: eventKey(current.eventDigest),
        eventDigest: current.eventDigest,
        dueAt: cleanupAt,
      })
      await transaction.put({ [eventKey(current.eventDigest)]: delivered, [cleanupKey]: cleanup })
      await transaction.delete(current.scheduleKey)
      await this.ensureAlarm(transaction, cleanupAt)
    })
  }

  private async scheduleRetry(claimed: OutboxRecord, reason: string, status: number | null): Promise<void> {
    const now = this.nowMs()
    await this.storage.transaction(async (transaction) => {
      const current = await transaction.get<OutboxRecord>(eventKey(claimed.eventDigest))
      if (!current || current.scheduleKey !== claimed.scheduleKey || current.status !== 'pending') return
      const dueAt = now + retryDelayMs(current.attempts, current.eventDigest)
      const dueKey = scheduleKey(dueAt, current.eventDigest)
      const next: OutboxRecord = Object.freeze({
        ...current,
        scheduleKey: dueKey,
        nextAttemptAt: dueAt,
        lastStatus: status,
        lastError: boundedReason(reason),
      })
      const schedule: ScheduleRecord = Object.freeze({
        schema: TRAVEL_MUTATION_OUTBOX_SCHEMA,
        action: 'dispatch',
        eventKey: eventKey(current.eventDigest),
        eventDigest: current.eventDigest,
        dueAt,
      })
      await transaction.put({ [eventKey(current.eventDigest)]: next, [dueKey]: schedule })
      await transaction.delete(current.scheduleKey)
      await this.ensureAlarm(transaction, dueAt)
    })
  }

  private async cleanupDelivered(key: string, schedule: ScheduleRecord): Promise<void> {
    await this.storage.transaction(async (transaction) => {
      const record = await transaction.get<OutboxRecord>(schedule.eventKey)
      if (record?.status === 'delivered' && record.scheduleKey === key) {
        await transaction.delete([schedule.eventKey, key])
      } else {
        await transaction.delete(key)
      }
    })
  }

  private async resetAlarmToEarliestSchedule(): Promise<void> {
    await this.storage.transaction(async (transaction) => {
      const entries = await transaction.list<ScheduleRecord>({ prefix: SCHEDULE_PREFIX, limit: MAX_DISPATCH_BATCH })
      for (const [key, schedule] of entries) {
        if (isScheduleRecord(schedule)) {
          await transaction.setAlarm(schedule.dueAt)
          return
        }
        await transaction.delete(key)
      }
      await transaction.deleteAlarm()
    })
  }

  private async ensureAlarm(storage: TravelMutationOutboxTransaction, dueAt: number): Promise<void> {
    const current = await storage.getAlarm()
    if (current == null || dueAt < current) await storage.setAlarm(dueAt)
  }
}

export const supportsTravelMutationOutbox = (
  storage: unknown,
): storage is TravelMutationOutboxStorage => {
  if (!isRecord(storage)) return false
  return ['get', 'list', 'put', 'delete', 'transaction', 'getAlarm', 'setAlarm', 'deleteAlarm']
    .every((method) => typeof storage[method] === 'function')
}

export const supportsTravelMutationOutboxTransaction = (
  storage: unknown,
): storage is TravelMutationOutboxTransaction => {
  if (!isRecord(storage)) return false
  return ['get', 'list', 'put', 'delete', 'getAlarm', 'setAlarm', 'deleteAlarm']
    .every((method) => typeof storage[method] === 'function')
}
