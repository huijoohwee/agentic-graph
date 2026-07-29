export type FlightGeoOverlayPublisherLease = Readonly<{
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

function readCurrentPublisher(): PublisherLeaseEntry | null {
  return publisherLeaseStack[publisherLeaseStack.length - 1] ?? null
}

export function claimFlightGeoOverlayPublisherLease(): FlightGeoOverlayPublisherLease {
  const entry: PublisherLeaseEntry = {
    listeners: new Set(),
    released: false,
  }
  publisherLeaseStack.push(entry)
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
      return wasCurrent && replacement === null
    },
  })
}

export function claimActiveFlightGeoOverlayPublisherLease(
  active: boolean,
  composedWithXr: boolean,
): FlightGeoOverlayPublisherLease | null {
  return active && composedWithXr
    ? claimFlightGeoOverlayPublisherLease()
    : null
}
