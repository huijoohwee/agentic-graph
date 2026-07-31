export type GeoXrOverlayPublisherLease = Readonly<{
  canClearAfterRelease: () => boolean
  isCurrent: () => boolean
  onBecameCurrent: (listener: () => void) => () => void
  release: () => boolean
}>

type PublisherLeaseEntry = {
  listeners: Set<() => void>
  released: boolean
}

const publisherLeaseStack: PublisherLeaseEntry[] = []
const publisherLeaseChangeListeners = new Set<() => void>()

function readCurrentPublisher(): PublisherLeaseEntry | null {
  return publisherLeaseStack[publisherLeaseStack.length - 1] ?? null
}

function notifyPublisherLeaseChange(): void {
  for (const listener of publisherLeaseChangeListeners) {
    try {
      listener()
    } catch {
      void 0
    }
  }
}

export function claimGeoXrOverlayPublisherLease(): GeoXrOverlayPublisherLease {
  const entry: PublisherLeaseEntry = {
    listeners: new Set(),
    released: false,
  }
  publisherLeaseStack.push(entry)
  notifyPublisherLeaseChange()
  return Object.freeze({
    canClearAfterRelease: () => (
      entry.released && readCurrentPublisher() === null
    ),
    isCurrent: () => (
      !entry.released && readCurrentPublisher() === entry
    ),
    onBecameCurrent: listener => {
      if (entry.released) return () => void 0
      entry.listeners.add(listener)
      if (readCurrentPublisher() === entry) listener()
      return () => entry.listeners.delete(listener)
    },
    release: () => {
      if (entry.released) return false
      const wasCurrent = readCurrentPublisher() === entry
      entry.released = true
      const index = publisherLeaseStack.indexOf(entry)
      if (index >= 0) publisherLeaseStack.splice(index, 1)
      const replacement = readCurrentPublisher()
      if (wasCurrent && replacement) {
        for (const listener of replacement.listeners) listener()
      }
      notifyPublisherLeaseChange()
      return wasCurrent && replacement === null
    },
  })
}

export function claimActiveGeoXrOverlayPublisherLease(
  active: boolean,
  composedWithXr: boolean,
): GeoXrOverlayPublisherLease | null {
  return active && composedWithXr
    ? claimGeoXrOverlayPublisherLease()
    : null
}

export function canClearGeoXrOverlaysAfterPublisherRelease(
  publisherLease: GeoXrOverlayPublisherLease,
  gameplayRuntimeActive: boolean,
): boolean {
  return !gameplayRuntimeActive && publisherLease.canClearAfterRelease()
}

export async function clearGeoXrOverlaysAfterPublisherRelease(
  publisherLease: GeoXrOverlayPublisherLease,
  readGameplayRuntimeActive: () => boolean,
  subscribeGameplayRuntime: (listener: () => void) => () => void,
  loadOverlayModule: () => Promise<Readonly<{
    clearCityGeoOverlay: () => void
    clearFlightGeoOverlay: () => void
  }>>,
): Promise<boolean> {
  const module = await loadOverlayModule()
  if (!publisherLease.canClearAfterRelease()) return false
  if (!readGameplayRuntimeActive()) {
    module.clearFlightGeoOverlay()
    module.clearCityGeoOverlay()
    return true
  }
  return new Promise(resolve => {
    let settled = false
    let unsubscribeGameplayRuntime = () => void 0
    let unsubscribePublisherChanges = () => void 0
    const settle = (cleared: boolean) => {
      if (settled) return
      settled = true
      unsubscribeGameplayRuntime()
      unsubscribePublisherChanges()
      resolve(cleared)
    }
    const evaluate = () => {
      if (settled) return
      if (!publisherLease.canClearAfterRelease()) {
        settle(false)
        return
      }
      if (readGameplayRuntimeActive()) return
      module.clearFlightGeoOverlay()
      module.clearCityGeoOverlay()
      settle(true)
    }
    unsubscribeGameplayRuntime = subscribeGameplayRuntime(evaluate)
    if (settled) {
      unsubscribeGameplayRuntime()
      return
    }
    publisherLeaseChangeListeners.add(evaluate)
    unsubscribePublisherChanges = () => {
      publisherLeaseChangeListeners.delete(evaluate)
    }
    evaluate()
  })
}
