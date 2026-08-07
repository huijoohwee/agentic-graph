export type XrV2PackagingObservationSource = Readonly<{
  assetId: string
  sessionId: string
  rawClipRef: string
  depthMetadataRef: string
  rawClipSha256: `sha256:${string}`
}>

export type XrV2ConnectedPreviewObservationSource = Readonly<{
  sourceDigest: string
  graphDataRevision: number
  entityRef: string
  authoringEditRevision: number
}>

export type XrV2DeliveryObservation = Readonly<{
  packagingObserved: boolean
  packagingSource: XrV2PackagingObservationSource | null
  connectedPreviewObserved: boolean
  connectedPreviewSource: XrV2ConnectedPreviewObservationSource | null
  revision: number
}>

export const ZERO_XR_V2_DELIVERY_OBSERVATION: XrV2DeliveryObservation = Object.freeze({
  packagingObserved: false,
  packagingSource: null,
  connectedPreviewObserved: false,
  connectedPreviewSource: null,
  revision: 0,
})

const listeners = new Set<() => void>()
let observation = ZERO_XR_V2_DELIVERY_OBSERVATION

function publish(next: XrV2DeliveryObservation): XrV2DeliveryObservation {
  observation = next
  for (const listener of listeners) listener()
  return observation
}

function validPackagingSource(value: XrV2PackagingObservationSource): boolean {
  return Boolean(value.assetId && value.sessionId && value.rawClipRef && value.depthMetadataRef)
    && /^sha256:[0-9a-f]{64}$/.test(value.rawClipSha256)
}

function validPreviewSource(value: XrV2ConnectedPreviewObservationSource): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value.entityRef)
    && /^fnv1a32:[0-9a-f]{8}$/.test(value.sourceDigest)
    && Number.isSafeInteger(value.graphDataRevision) && value.graphDataRevision >= 0
    && Number.isSafeInteger(value.authoringEditRevision) && value.authoringEditRevision >= 1
}

/** Clears one criterion before an explicit rerun; the other criterion is retained. */
export function beginXrV2DeliveryCriterionObservation(
  criterion: 'AC-11' | 'AC-12',
): XrV2DeliveryObservation {
  return publish(Object.freeze({
    ...observation,
    ...(criterion === 'AC-11'
      ? { packagingObserved: false, packagingSource: null }
      : { connectedPreviewObserved: false, connectedPreviewSource: null }),
    revision: observation.revision + 1,
  }))
}

export function reportXrV2DeliveryCriterionObservation(
  criterion: 'AC-11',
  source: XrV2PackagingObservationSource,
): XrV2DeliveryObservation
export function reportXrV2DeliveryCriterionObservation(
  criterion: 'AC-12',
  source: XrV2ConnectedPreviewObservationSource,
): XrV2DeliveryObservation
/** Called only after the explicit action's complete source-bound browser evidence validates. */
export function reportXrV2DeliveryCriterionObservation(
  criterion: 'AC-11' | 'AC-12',
  source: XrV2PackagingObservationSource | XrV2ConnectedPreviewObservationSource,
): XrV2DeliveryObservation {
  if (criterion === 'AC-11') {
    const packagingSource = source as XrV2PackagingObservationSource
    if (!validPackagingSource(packagingSource)) throw new Error('AC-11 observation source is invalid')
    return publish(Object.freeze({
      ...observation,
      packagingObserved: true,
      packagingSource: Object.freeze({ ...packagingSource }),
      revision: observation.revision + 1,
    }))
  }
  const connectedPreviewSource = source as XrV2ConnectedPreviewObservationSource
  if (!validPreviewSource(connectedPreviewSource)) throw new Error('AC-12 observation source is invalid')
  return publish(Object.freeze({
    ...observation,
    connectedPreviewObserved: true,
    connectedPreviewSource: Object.freeze({ ...connectedPreviewSource }),
    revision: observation.revision + 1,
  }))
}

export function matchesXrV2PackagingObservation(
  value: XrV2DeliveryObservation,
  assetId: string | null | undefined,
): boolean {
  return value.packagingObserved && Boolean(assetId)
    && value.packagingSource?.assetId === assetId
}

export function matchesXrV2ConnectedPreviewObservation(
  value: XrV2DeliveryObservation,
  source: Readonly<{ sourceDigest: string; graphDataRevision: number }> | null | undefined,
): boolean {
  return value.connectedPreviewObserved && Boolean(source)
    && value.connectedPreviewSource?.sourceDigest === source?.sourceDigest
    && value.connectedPreviewSource?.graphDataRevision === source?.graphDataRevision
}

export function resetXrV2DeliveryObservation(): XrV2DeliveryObservation {
  return publish(ZERO_XR_V2_DELIVERY_OBSERVATION)
}

export function readXrV2DeliveryObservation(): XrV2DeliveryObservation {
  return observation
}

export function subscribeXrV2DeliveryObservation(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
