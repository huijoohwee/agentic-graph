import type { LearningRuntimeSnapshot } from './learningRuntime'

export type SpatialView = Readonly<{ selectedId: string; dimensions: boolean; inspection: boolean }>
export const DEFAULT_SPATIAL_VIEW: SpatialView = Object.freeze({ selectedId: 'room', dimensions: true, inspection: false })
export const learningSpatialDocumentKey = (document: LearningRuntimeSnapshot['document']) =>
  JSON.stringify([document?.workspaceId, document?.documentId, document?.lessonId])
export const warehouseInspectionTransportKey = (spatialKey: string) => `${spatialKey}#warehouse-inspection`
export const canInspectWarehouse = (runtime: LearningRuntimeSnapshot) =>
  runtime.document?.lessonId === 'drone' && !['running', 'validating'].includes(runtime.state)

/** One presentation selection, fenced by the bound Python source and execution state. */
export class LearningSpatialSelection {
  private key = ''
  private value = DEFAULT_SPATIAL_VIEW
  private runtime: LearningRuntimeSnapshot | null = null
  private listeners = new Set<() => void>()
  read = (key: string): SpatialView => key === this.key ? this.value : DEFAULT_SPATIAL_VIEW
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  update(key: string, patch: Partial<SpatialView>) {
    const inspection = patch.inspection === true && (!this.runtime || !canInspectWarehouse(this.runtime)
      || key !== learningSpatialDocumentKey(this.runtime.document)) ? false : patch.inspection
    this.value = Object.freeze({ ...this.read(key), ...patch, ...(inspection === undefined ? {} : { inspection }) })
    this.key = key
    this.listeners.forEach(listener => listener())
  }
  /** Returns the revoked transport key so the native clock can be paused by its owner. */
  bind(runtime: LearningRuntimeSnapshot): string | null {
    const previous = this.runtime
    this.runtime = runtime
    if (!this.value.inspection) return null
    const changed = !previous || learningSpatialDocumentKey(runtime.document) !== this.key
      || runtime.document?.source !== previous.document?.source
    if (!changed && canInspectWarehouse(runtime)) return null
    const transportKey = warehouseInspectionTransportKey(this.key)
    this.update(this.key, { inspection: false })
    return transportKey
  }
  releaseWhenTransportChanges(documentKey: string) {
    if (!this.value.inspection || documentKey === warehouseInspectionTransportKey(this.key)) return
    this.update(this.key, { inspection: false })
  }
}
export const learningSpatialSelection = new LearningSpatialSelection()
