export type RehearsalDraft = Readonly<{
  recipient: 'demo-merchant' | 'demo-partner' | 'unsupported'
  amountMinor: string
  asset: 'DEMO-SGD' | 'DEMO-USD'
  network: 'local-a' | 'local-b'
}>

export type RehearsalActivity = Readonly<{
  operationId: string
  terms: RehearsalDraft
  feeMinor: 0
  state: 'queued_offline' | 'simulated'
  observedAtMs: number
}>

export type RehearsalSnapshot = Readonly<{
  draft: RehearsalDraft
  operationId: string
  reviewed: Readonly<{ termsKey: string; expiresAtMs: number }> | null
  disconnected: boolean
  activity: readonly RehearsalActivity[]
  message: string
  observedAtMs: number
}>

export type RehearsalStore = Readonly<{
  getSnapshot(): RehearsalSnapshot
  subscribe(listener: () => void): () => void
  edit(patch: Partial<RehearsalDraft>): void
  review(): void
  confirm(): void
  setDisconnected(value: boolean): void
  retry(): void
  clear(): void
}>

const DEFAULT_DRAFT: RehearsalDraft = Object.freeze({
  recipient: 'demo-merchant',
  amountMinor: '1000',
  asset: 'DEMO-SGD',
  network: 'local-a',
})

const termsKey = (draft: RehearsalDraft, expiresAtMs: number): string =>
  JSON.stringify(['simulation', draft.recipient, draft.amountMinor, draft.asset,
    draft.network, 0, expiresAtMs])

const validDraft = (draft: RehearsalDraft): string | null => {
  if (!['demo-merchant', 'demo-partner'].includes(draft.recipient)
    || !['DEMO-SGD', 'DEMO-USD'].includes(draft.asset)
    || !['local-a', 'local-b'].includes(draft.network)) {
    return 'This demo recipient, asset, or network is unavailable. No operation was prepared.'
  }
  if (!/^[0-9]{1,9}$/.test(draft.amountMinor)
    || !Number.isSafeInteger(Number(draft.amountMinor))
    || Number(draft.amountMinor) <= 0) {
    return 'Enter a positive whole number of demo minor units (up to 9 digits).'
  }
  return null
}

let localOperationSequence = 0

export const createCommerceTransferRehearsalStore = (
  now: () => number = Date.now,
  newId: () => string = () => `local-demo-${++localOperationSequence}`,
): RehearsalStore => {
  const initial = (): RehearsalSnapshot => Object.freeze({
    draft: DEFAULT_DRAFT,
    operationId: newId(),
    reviewed: null,
    disconnected: false,
    activity: Object.freeze([]),
    message: 'Prepare demo terms to review a simulation. No money can move here.',
    observedAtMs: now(),
  })
  let snapshot = initial()
  const listeners = new Set<() => void>()
  const publish = (next: RehearsalSnapshot): void => {
    snapshot = Object.freeze(next)
    listeners.forEach(listener => listener())
  }
  const update = (patch: Partial<RehearsalSnapshot>): void =>
    publish({ ...snapshot, ...patch, observedAtMs: now() })

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    edit: (patch: Partial<RehearsalDraft>) => {
      const draft = Object.freeze({ ...snapshot.draft, ...patch })
      if (JSON.stringify(draft) === JSON.stringify(snapshot.draft)) return
      update({
        draft,
        operationId: newId(),
        reviewed: null,
        message: 'Terms changed. Review the full simulation again before confirming.',
      })
    },
    review: () => {
      const error = validDraft(snapshot.draft)
      if (error) { update({ reviewed: null, message: error }); return }
      const expiresAtMs = now() + 5 * 60_000
      update({
        reviewed: Object.freeze({ termsKey: termsKey(snapshot.draft, expiresAtMs), expiresAtMs }),
        message: 'Review these exact demo terms. Confirmation only records a local simulation.',
      })
    },
    confirm: () => {
      const { reviewed, draft, operationId, activity } = snapshot
      if (activity.some(item => item.operationId === operationId)) return
      if (!reviewed || validDraft(draft)
        || reviewed.expiresAtMs <= now()
        || reviewed.termsKey !== termsKey(draft, reviewed.expiresAtMs)) {
        update({ reviewed: null, message: 'Review expired or terms changed. Review again; nothing was submitted.' })
        return
      }
      const state = snapshot.disconnected ? 'queued_offline' : 'simulated'
      const entry: RehearsalActivity = Object.freeze({
        operationId,
        terms: Object.freeze({ ...draft }),
        feeMinor: 0,
        state,
        observedAtMs: now(),
      })
      update({
        activity: Object.freeze([entry, ...activity].slice(0, 10)),
        message: state === 'queued_offline'
          ? 'Simulation queued locally. Offline means no settlement or provider request.'
          : 'Simulation recorded locally. No provider request, transfer, or settlement occurred.',
      })
    },
    setDisconnected: (disconnected: boolean) => {
      update({ disconnected, message: disconnected
        ? 'Simulated connection off. Existing activity remains local.'
        : 'Simulated connection on. Retry a queued demo with the same operation ID.' })
    },
    retry: () => {
      const queued = snapshot.activity.find(item => item.state === 'queued_offline')
      if (!queued) { update({ message: 'No queued simulation needs a retry.' }); return }
      if (snapshot.disconnected) {
        update({ message: 'Still offline in this simulation. No provider request occurred.' })
        return
      }
      update({
        activity: Object.freeze(snapshot.activity.map(item => item.operationId === queued.operationId
          ? Object.freeze({ ...item, state: 'simulated' as const, observedAtMs: now() }) : item)),
        message: 'Same operation resumed as a local simulation. No financial effect occurred.',
      })
    },
    clear: () => publish(initial()),
  })
}

export const commerceTransferRehearsalStore = createCommerceTransferRehearsalStore()
