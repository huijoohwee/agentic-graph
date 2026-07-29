import type { NormalizedEnhancedConfig } from 'grph-shared/geospatial/enhancedLayerContract'
import type { Asset3DLayerHandle } from './asset3dCustomLayer.js'
import {
  removeExtrusionLayer,
  setExtrusionLayerVisibility,
} from './maplibreLayers.js'

export type RenderedExtrusionResource = {
  sourceId: string
}

const removeReadyIds = (
  container: HTMLElement | null,
  removedIds: ReadonlySet<string>,
): void => {
  if (!container || removedIds.size === 0) return
  const retained = String(container.dataset.kgEnhancedLayerIds || '')
    .split(',')
    .filter(id => id && !removedIds.has(id))
  if (retained.length === 0) delete container.dataset.kgEnhancedLayerIds
  else container.dataset.kgEnhancedLayerIds = retained.join(',')
}

export function reconcileRemovedEnhancedLayerResources(args: {
  map: any
  container: HTMLElement | null
  renderedExtrusions: Map<string, RenderedExtrusionResource>
  configuredExtrusionIds: ReadonlySet<string>
  assetHandle: Asset3DLayerHandle | null
  loadedAssetIds: Set<string>
  configuredAssetIds: ReadonlySet<string>
}): readonly string[] {
  const removedIds = new Set<string>()
  for (const [layerId, resource] of args.renderedExtrusions) {
    if (args.configuredExtrusionIds.has(layerId)) continue
    removeExtrusionLayer(args.map, layerId, resource.sourceId)
    args.renderedExtrusions.delete(layerId)
    removedIds.add(layerId)
  }
  for (const assetId of args.loadedAssetIds) {
    if (args.configuredAssetIds.has(assetId)) continue
    args.assetHandle?.remove(assetId)
    args.loadedAssetIds.delete(assetId)
    removedIds.add(assetId)
  }
  removeReadyIds(args.container, removedIds)
  return [...removedIds]
}

export function applyEnhancedLayerVisibility(args: {
  map: any
  assetHandle: Asset3DLayerHandle | null
  config: NormalizedEnhancedConfig
  ids?: readonly string[]
}): readonly string[] {
  const targetIds = args.ids ? new Set(args.ids) : null
  const appliedIds: string[] = []
  for (const layer of args.config.extrusions) {
    if (targetIds && !targetIds.has(layer.id)) continue
    setExtrusionLayerVisibility(args.map, layer.id, layer.visible)
    appliedIds.push(layer.id)
  }
  for (const asset of args.config.assets) {
    if (targetIds && !targetIds.has(asset.id)) continue
    args.assetHandle?.setVisible(asset.id, asset.visible)
    appliedIds.push(asset.id)
  }
  return appliedIds
}
