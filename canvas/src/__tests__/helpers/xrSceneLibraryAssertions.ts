import {
  readXrMotionReferencePlan,
  serializeXrMotionReferencePlan,
} from '@/features/three/xrMotionReferenceModel'
import {
  addXrMotionReferenceSubject,
  hydrateXrMotionReferenceRuntime,
  readXrMotionReferenceRuntime,
  setXrMotionReferenceSubjectAsset,
  setXrMotionReferenceSubjectTransform,
} from '@/features/three/xrMotionReferenceRuntime'
import {
  XR_MOTION_REFERENCE_DEFAULT_STAGE_ID,
  XR_MOTION_REFERENCE_STAGE_PRESETS,
  XR_MOTION_REFERENCE_TERRAIN_PRESETS,
  XR_SCENE_LIBRARY_ASSETS,
  XR_SCENE_LIBRARY_DEFAULT_ASSET_ID,
  XR_SCENE_LIBRARY_FEATURED_ASSET_IDS,
} from '@/features/three/xrSceneLibrary'

type InspectedXrCatalog = Readonly<{
  catalogDefaults?: { terrainId?: unknown; assetId?: unknown }
  assets?: Array<{ id?: unknown; default?: unknown }>
  environments?: Array<{ id?: unknown; kind?: unknown; default?: unknown }>
  invocationGrammar?: { transform?: unknown }
}>

export function assertInspectedXrCatalogMatchesNativeLibrary(value: unknown): void {
  const catalog = value as InspectedXrCatalog
  const defaultEnvironment = catalog.environments?.find(environment => environment.id === XR_MOTION_REFERENCE_DEFAULT_STAGE_ID)
  const defaultAsset = catalog.assets?.find(asset => asset.id === XR_SCENE_LIBRARY_DEFAULT_ASSET_ID)
  if (catalog.assets?.length !== XR_SCENE_LIBRARY_ASSETS.length
    || catalog.environments?.length !== XR_MOTION_REFERENCE_STAGE_PRESETS.length
    || catalog.catalogDefaults?.terrainId !== XR_MOTION_REFERENCE_DEFAULT_STAGE_ID
    || catalog.catalogDefaults?.assetId !== XR_SCENE_LIBRARY_DEFAULT_ASSET_ID
    || defaultEnvironment?.kind !== 'terrain'
    || defaultEnvironment.default !== true
    || defaultAsset?.default !== true
    || !String(catalog.invocationGrammar?.transform || '').includes('asset=<asset-id>')) {
    throw new Error(`expected XR WebMCP inspection to list native environments and assets, got ${JSON.stringify(value)}`)
  }
}

export function assertXrDefaultTerrain(actualStageId: string): void {
  if (actualStageId !== 'singapore' || XR_MOTION_REFERENCE_DEFAULT_STAGE_ID !== 'singapore') {
    throw new Error(`expected Singapore to be the explicit default XR terrain, got ${actualStageId}`)
  }
  if (readXrMotionReferencePlan({ stageId: 'neutral-volume' }).stageId !== 'neutral-volume'
    || readXrMotionReferencePlan({ stageId: 'future-unknown-terrain' }).stageId !== 'singapore') {
    throw new Error('expected legacy persisted terrain IDs to remain valid and unknown future IDs to fall back to Singapore')
  }
}

export function assertXrSceneCatalogAndVehiclePlacements(): void {
  const requiredEnvironmentIds = ['singapore', 'downtown', 'residential-street', 'supermarket', 'movie-theater', 'train-car', 'backyard-pool', 'aerial-sky']
  if (!requiredEnvironmentIds.every(id => XR_MOTION_REFERENCE_STAGE_PRESETS.some(stage => stage.id === id))) {
    throw new Error('expected the native XR library to include every requested environment kit')
  }
  const categories = new Set(XR_SCENE_LIBRARY_ASSETS.map(asset => asset.category))
  if (!['people', 'animals', 'vehicles', 'furniture', 'props'].every(category => categories.has(category as never))) {
    throw new Error(`expected a complete native XR subject library, got ${[...categories].join(',')}`)
  }
  const terrainIds = XR_MOTION_REFERENCE_TERRAIN_PRESETS.map(stage => stage.id)
  if (terrainIds[0] !== 'singapore' || !terrainIds.includes('tropical-playground') || new Set(terrainIds).size !== terrainIds.length) {
    throw new Error(`expected default Singapore plus catalog-driven future terrain provisions, got ${terrainIds.join('|')}`)
  }
  const featuredAssets = XR_SCENE_LIBRARY_FEATURED_ASSET_IDS.map(assetId => XR_SCENE_LIBRARY_ASSETS.find(asset => asset.id === assetId))
  if (XR_SCENE_LIBRARY_DEFAULT_ASSET_ID !== 'vehicle-helicopter'
    || featuredAssets.some(asset => !asset)
    || featuredAssets.map(asset => asset!.label).join('|') !== 'Helicopter|Car|Ball'
    || new Set(XR_SCENE_LIBRARY_ASSETS.map(asset => asset.id)).size !== XR_SCENE_LIBRARY_ASSETS.length) {
    throw new Error(`expected unique default Helicopter, Car, and Ball asset provisions, got ${JSON.stringify(featuredAssets)}`)
  }
  hydrateXrMotionReferenceRuntime({ sceneKey: 'vehicle-packing-scene', nodes: [], persistedValue: null })
  for (const assetId of ['vehicle-helicopter', 'vehicle-sedan']) addXrMotionReferenceSubject({ assetId })
  const packedVehicles = readXrMotionReferenceRuntime().plan.subjects
  if (packedVehicles.length !== 2) throw new Error(`expected all showcase vehicles to place, got ${JSON.stringify(packedVehicles)}`)
  const stage = XR_MOTION_REFERENCE_STAGE_PRESETS.find(candidate => candidate.id === 'singapore')!
  for (let leftIndex = 0; leftIndex < packedVehicles.length; leftIndex += 1) {
    const left = packedVehicles[leftIndex]!
    const leftAsset = XR_SCENE_LIBRARY_ASSETS.find(asset => asset.id === left.assetId)!
    if (Math.abs(left.position[0]) + leftAsset.dimensionsMeters[0] / 2 > stage.sizeMeters[0] / 2
      || Math.abs(left.position[2]) + leftAsset.dimensionsMeters[2] / 2 > stage.sizeMeters[1] / 2) {
      throw new Error(`expected ${left.label} to stay inside Singapore terrain bounds, got ${JSON.stringify(left.position)}`)
    }
    for (let rightIndex = leftIndex + 1; rightIndex < packedVehicles.length; rightIndex += 1) {
      const right = packedVehicles[rightIndex]!
      const rightAsset = XR_SCENE_LIBRARY_ASSETS.find(asset => asset.id === right.assetId)!
      const overlapX = Math.abs(left.position[0] - right.position[0]) < (leftAsset.dimensionsMeters[0] + rightAsset.dimensionsMeters[0]) / 2 + 0.8
      const overlapZ = Math.abs(left.position[2] - right.position[2]) < (leftAsset.dimensionsMeters[2] + rightAsset.dimensionsMeters[2]) / 2 + 0.8
      if (overlapX && overlapZ) throw new Error(`expected ${left.label} and ${right.label} default placements not to overlap`)
    }
  }
}

export function assertXrSubjectAssetSwapCrud(): void {
  hydrateXrMotionReferenceRuntime({ sceneKey: 'asset-swap-scene', nodes: [], persistedValue: null })
  addXrMotionReferenceSubject({ assetId: XR_SCENE_LIBRARY_DEFAULT_ASSET_ID, label: 'AIR ONE' })
  const helicopter = readXrMotionReferenceRuntime().plan.subjects[0]!
  setXrMotionReferenceSubjectTransform({ subjectId: helicopter.id, position: [2, 3, -4], rotationYDegrees: 35, scale: 1.4 })
  const constrainedTransform = readXrMotionReferenceRuntime().plan.subjects.find(subject => subject.id === helicopter.id)!
  if (constrainedTransform.position[0] !== 2 || constrainedTransform.position[1] !== 3
    || constrainedTransform.position[2] < -4 || constrainedTransform.rotationYDegrees !== 35 || constrainedTransform.scale !== 1.4) {
    throw new Error(`expected subject transform to retain requested axes that fit and constrain only the stage-overflowing axis, got ${JSON.stringify(constrainedTransform)}`)
  }
  setXrMotionReferenceSubjectAsset({ subjectId: helicopter.id, assetId: 'vehicle-sedan' })
  let swapped = readXrMotionReferenceRuntime().plan
  const car = swapped.subjects.find(subject => subject.id === helicopter.id)
  if (!car || car.assetId !== 'vehicle-sedan' || car.label !== 'AIR ONE'
    || car.position.join('|') !== constrainedTransform.position.join('|') || car.rotationYDegrees !== 35 || car.scale !== 1.4
    || swapped.cast.find(track => track.actorId === car.id)?.marks[0]?.gait !== 'wheeled') {
    throw new Error(`expected Helicopter to change to Car without changing subject identity or transform, got ${JSON.stringify(swapped)}`)
  }
  setXrMotionReferenceSubjectAsset({ subjectId: helicopter.id, assetId: 'prop-ball' })
  swapped = readXrMotionReferenceRuntime().plan
  if (swapped.subjects.find(subject => subject.id === helicopter.id)?.assetId !== 'prop-ball'
    || swapped.cast.find(track => track.actorId === helicopter.id)?.marks[0]?.gait !== 'wheeled') {
    throw new Error('expected the native Ball asset to remain a mobile rolling cast subject')
  }
  setXrMotionReferenceSubjectAsset({ subjectId: helicopter.id, assetId: 'furniture-chair' })
  if (readXrMotionReferenceRuntime().plan.cast.some(track => track.actorId === helicopter.id)) {
    throw new Error('expected changing a placed object to a static asset to remove only its cast track')
  }
  setXrMotionReferenceSubjectAsset({ subjectId: helicopter.id, assetId: XR_SCENE_LIBRARY_DEFAULT_ASSET_ID })
  const restoredPlan = readXrMotionReferenceRuntime().plan
  if (restoredPlan.subjects.find(subject => subject.id === helicopter.id)?.assetId !== XR_SCENE_LIBRARY_DEFAULT_ASSET_ID
    || restoredPlan.cast.find(track => track.actorId === helicopter.id)?.marks[0]?.gait !== 'flight') {
    throw new Error('expected changing a static asset back to Helicopter to restore one flight cast track')
  }
  const roundTrip = readXrMotionReferencePlan(serializeXrMotionReferencePlan(restoredPlan))
  if (roundTrip.subjects[0]?.assetId !== XR_SCENE_LIBRARY_DEFAULT_ASSET_ID
    || roundTrip.subjects[0]?.position.join('|') !== constrainedTransform.position.join('|')) {
    throw new Error('expected changed 3D assets and transforms to survive canonical plan serialization')
  }
}

export function assertXrTerrainAssetsAreCleanRoom(sources: readonly string[]): void {
  const implementation = sources.join('\n').toLowerCase()
  for (const forbidden of ['8thwall', '8thwall.org', 'https://', 'http://', '.glb', '.gltf', 'cdn.']) {
    if (implementation.includes(forbidden)) {
      throw new Error(`expected Singapore terrain and native object assets to avoid external dependency token ${forbidden}`)
    }
  }
}
