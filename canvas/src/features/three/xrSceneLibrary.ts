import {
  XR_SINGAPORE_STAGE_SIZE_METERS,
  XR_SINGAPORE_MAJOR_POI_SURFACES,
  XR_SINGAPORE_REGIONAL_POI_PRESENTATION_POLICY,
} from './xrSingaporeEnvironmentSource'
import { SINGAPORE_MAJOR_POI_GEO_PROFILE } from 'grph-shared/geospatial/singaporeMajorPoiGeo'
import type { RegionalPoiProfile } from 'grph-shared/geospatial/regionalPoiGeo'
import type {
  RegionalPoiPresentationPolicy,
} from '@/features/geospatial/regionalPoiPresentationStyle'

export type XrMotionReferenceVector = readonly [number, number, number]

export type XrMotionReferenceStageId =
  | 'singapore'
  | 'tropical-playground'
  | 'neutral-volume'
  | 'street-grid'
  | 'loading-bay'
  | 'downtown'
  | 'residential-street'
  | 'supermarket'
  | 'movie-theater'
  | 'train-car'
  | 'backyard-pool'
  | 'aerial-sky'

export type XrGreyBoxStructure = Readonly<{
  color?: string
  id: string
  kind?: 'poi' | 'structure'
  label?: string
  poiId?: string
  position: XrMotionReferenceVector
  size: XrMotionReferenceVector
  tone: 'light' | 'mid' | 'dark' | 'accent'
  collidable?: boolean
}>

export type XrMotionReferenceStagePreset = Readonly<{
  id: XrMotionReferenceStageId
  label: string
  description: string
  environmentKind: 'terrain' | 'environment'
  regionalPoiProfile?: RegionalPoiProfile
  regionalPoiPresentationPolicy?: RegionalPoiPresentationPolicy
  sizeMeters: readonly [number, number]
  structures: readonly XrGreyBoxStructure[]
}>

export const XR_MOTION_REFERENCE_DEFAULT_STAGE_ID: XrMotionReferenceStageId = 'singapore'

export const XR_MOTION_REFERENCE_STAGE_PRESETS: readonly XrMotionReferenceStagePreset[] = [
  {
    id: 'singapore',
    label: 'Singapore',
    description: 'Default tropical-city terrain with a waterfront edge, transit spine, garden deck, and compact skyline.',
    environmentKind: 'terrain',
    regionalPoiProfile: SINGAPORE_MAJOR_POI_GEO_PROFILE,
    regionalPoiPresentationPolicy:
      XR_SINGAPORE_REGIONAL_POI_PRESENTATION_POLICY,
    sizeMeters: XR_SINGAPORE_STAGE_SIZE_METERS,
    structures: XR_SINGAPORE_MAJOR_POI_SURFACES,
  },
  {
    id: 'tropical-playground',
    label: 'Tropical Playground',
    description: 'Procedural tropical island with sand, lagoon, palms, palisade, skull grotto, treasure, cannons, and rolling-ball physics.',
    environmentKind: 'terrain',
    sizeMeters: [28, 26],
    structures: [],
  },
  {
    id: 'neutral-volume',
    label: 'Neutral Volume',
    description: 'Open rehearsal floor with framing flats and a raised focus deck.',
    environmentKind: 'environment',
    sizeMeters: [16, 12],
    structures: [
      { id: 'back-flat', position: [0, 2.4, -5.7], size: [16, 4.8, 0.3], tone: 'mid' },
      { id: 'left-flat', position: [-7.7, 1.8, 0], size: [0.3, 3.6, 12], tone: 'dark' },
      { id: 'right-flat', position: [7.7, 1.8, 0], size: [0.3, 3.6, 12], tone: 'dark' },
      { id: 'focus-deck', position: [0, 0.2, 2.7], size: [5.2, 0.4, 2.4], tone: 'light' },
    ],
  },
  {
    id: 'street-grid',
    label: 'Street Grid',
    description: 'Road channel, walkable edges, and neutral building masses for exterior blocking.',
    environmentKind: 'environment',
    sizeMeters: [20, 14],
    structures: [
      { id: 'west-block', position: [-7.6, 2.8, 0], size: [4.2, 5.6, 13], tone: 'mid' },
      { id: 'east-block', position: [7.6, 3.4, 0], size: [4.2, 6.8, 13], tone: 'dark' },
      { id: 'west-walk', position: [-4.8, 0.15, 0], size: [1.4, 0.3, 13], tone: 'light' },
      { id: 'east-walk', position: [4.8, 0.15, 0], size: [1.4, 0.3, 13], tone: 'light' },
      { id: 'crossing', position: [0, 0.04, 1.8], size: [8.2, 0.08, 1.4], tone: 'accent' },
    ],
  },
  {
    id: 'loading-bay',
    label: 'Loading Bay',
    description: 'Deep industrial floor with columns, dock, and movable grey-box obstacles.',
    environmentKind: 'environment',
    sizeMeters: [18, 14],
    structures: [
      { id: 'rear-wall', position: [0, 3, -6.7], size: [18, 6, 0.3], tone: 'dark' },
      { id: 'dock', position: [0, 0.65, -4.8], size: [8, 1.3, 3], tone: 'mid' },
      { id: 'column-a', position: [-5.4, 2.2, 0], size: [0.6, 4.4, 0.6], tone: 'light' },
      { id: 'column-b', position: [5.4, 2.2, 0], size: [0.6, 4.4, 0.6], tone: 'light' },
      { id: 'crate-a', position: [-2.8, 0.75, 2.4], size: [1.5, 1.5, 1.5], tone: 'accent' },
      { id: 'crate-b', position: [3.1, 1.1, 1.4], size: [2.2, 2.2, 2.2], tone: 'mid' },
    ],
  },
  {
    id: 'downtown',
    label: 'Downtown',
    description: 'Four city blocks, a central avenue, sidewalks, and a practical intersection.',
    environmentKind: 'environment',
    sizeMeters: [30, 24],
    structures: [
      { id: 'tower-nw', position: [-9, 5, -7], size: [8, 10, 7], tone: 'dark' },
      { id: 'tower-ne', position: [9, 7, -7], size: [8, 14, 7], tone: 'mid' },
      { id: 'tower-sw', position: [-9, 3.5, 7], size: [8, 7, 7], tone: 'mid' },
      { id: 'tower-se', position: [9, 5.5, 7], size: [8, 11, 7], tone: 'dark' },
      { id: 'crosswalk-x', position: [0, 0.04, 0], size: [10, 0.08, 2.2], tone: 'accent' },
      { id: 'crosswalk-z', position: [0, 0.05, 0], size: [2.2, 0.1, 10], tone: 'accent' },
    ],
  },
  {
    id: 'residential-street',
    label: 'Residential Street',
    description: 'Two home rows, driveways, sidewalks, and a calm neighborhood road.',
    environmentKind: 'environment',
    sizeMeters: [28, 18],
    structures: [
      { id: 'home-west-a', position: [-9, 2.4, -5], size: [6, 4.8, 5], tone: 'mid' },
      { id: 'home-west-b', position: [-9, 2.1, 5], size: [6, 4.2, 5], tone: 'light' },
      { id: 'home-east-a', position: [9, 2.7, -5], size: [6, 5.4, 5], tone: 'dark' },
      { id: 'home-east-b', position: [9, 2.2, 5], size: [6, 4.4, 5], tone: 'mid' },
      { id: 'sidewalk-west', position: [-4.6, 0.12, 0], size: [1.2, 0.24, 18], tone: 'light' },
      { id: 'sidewalk-east', position: [4.6, 0.12, 0], size: [1.2, 0.24, 18], tone: 'light' },
    ],
  },
  {
    id: 'supermarket',
    label: 'Supermarket',
    description: 'Retail shell with parallel aisles, chilled wall, and checkout lanes.',
    environmentKind: 'environment',
    sizeMeters: [24, 18],
    structures: [
      { id: 'rear-wall', position: [0, 2.5, -8.7], size: [24, 5, 0.3], tone: 'dark' },
      { id: 'chilled-wall', position: [-11.4, 1.4, 0], size: [0.4, 2.8, 16], tone: 'accent' },
      { id: 'aisle-a', position: [-6, 1, 0], size: [1.4, 2, 11], tone: 'mid' },
      { id: 'aisle-b', position: [-2, 1, 0], size: [1.4, 2, 11], tone: 'mid' },
      { id: 'aisle-c', position: [2, 1, 0], size: [1.4, 2, 11], tone: 'mid' },
      { id: 'aisle-d', position: [6, 1, 0], size: [1.4, 2, 11], tone: 'mid' },
      { id: 'checkout', position: [8.8, 0.65, 5.8], size: [4.4, 1.3, 2], tone: 'light' },
    ],
  },
  {
    id: 'movie-theater',
    label: 'Movie Theater',
    description: 'Cinema screen, stepped seating masses, aisles, and a rear projection booth.',
    environmentKind: 'environment',
    sizeMeters: [22, 18],
    structures: [
      { id: 'screen', position: [0, 3.2, -8.5], size: [13, 6.2, 0.25], tone: 'light' },
      { id: 'seat-bank-a', position: [-4.8, 0.65, 1], size: [7.4, 1.3, 10], tone: 'dark' },
      { id: 'seat-bank-b', position: [4.8, 0.65, 1], size: [7.4, 1.3, 10], tone: 'dark' },
      { id: 'rear-riser', position: [0, 1.1, 6.8], size: [20, 2.2, 3.6], tone: 'mid' },
      { id: 'center-aisle', position: [0, 0.08, 1], size: [1.2, 0.16, 10], tone: 'accent' },
    ],
  },
  {
    id: 'train-car',
    label: 'Train Car',
    description: 'Narrow carriage with paired seating, doors, and a continuous center aisle.',
    environmentKind: 'environment',
    sizeMeters: [4, 22],
    structures: [
      { id: 'wall-west', position: [-1.9, 1.3, 0], size: [0.2, 2.6, 22], tone: 'mid' },
      { id: 'wall-east', position: [1.9, 1.3, 0], size: [0.2, 2.6, 22], tone: 'mid' },
      { id: 'seat-west-a', position: [-1.25, 0.55, -5.5], size: [0.9, 1.1, 4], tone: 'dark' },
      { id: 'seat-east-a', position: [1.25, 0.55, -5.5], size: [0.9, 1.1, 4], tone: 'dark' },
      { id: 'seat-west-b', position: [-1.25, 0.55, 5.5], size: [0.9, 1.1, 4], tone: 'dark' },
      { id: 'seat-east-b', position: [1.25, 0.55, 5.5], size: [0.9, 1.1, 4], tone: 'dark' },
    ],
  },
  {
    id: 'backyard-pool',
    label: 'Backyard with Pool',
    description: 'Fenced garden, pool volume, patio, and house wall for domestic blocking.',
    environmentKind: 'environment',
    sizeMeters: [22, 16],
    structures: [
      { id: 'house-wall', position: [0, 2.6, -7.7], size: [22, 5.2, 0.3], tone: 'dark' },
      { id: 'pool', position: [3.5, 0.12, 1.5], size: [8, 0.24, 5], tone: 'accent' },
      { id: 'patio', position: [-5.7, 0.14, -2.5], size: [7.5, 0.28, 6], tone: 'light' },
      { id: 'fence-west', position: [-10.8, 1.2, 0], size: [0.2, 2.4, 16], tone: 'mid' },
      { id: 'fence-east', position: [10.8, 1.2, 0], size: [0.2, 2.4, 16], tone: 'mid' },
      { id: 'fence-south', position: [0, 1.2, 7.8], size: [22, 2.4, 0.2], tone: 'mid' },
    ],
  },
  {
    id: 'aerial-sky',
    label: 'Sky for Aerials',
    description: 'Large aerial volume with low ground blocks and cloud-height reference slabs.',
    environmentKind: 'environment',
    sizeMeters: [40, 32],
    structures: [
      { id: 'ground-mass-a', position: [-10, 0.5, -6], size: [14, 1, 11], tone: 'dark' },
      { id: 'ground-mass-b', position: [9, 0.8, 5], size: [16, 1.6, 13], tone: 'mid' },
      { id: 'cloud-bank-a', position: [-12, 8, 9], size: [9, 1.2, 4], tone: 'light' },
      { id: 'cloud-bank-b', position: [11, 12, -8], size: [12, 1.4, 5], tone: 'light' },
      { id: 'flight-corridor', position: [0, 0.08, 0], size: [5, 0.16, 30], tone: 'accent' },
    ],
  },
]

export const XR_MOTION_REFERENCE_TERRAIN_PRESETS: readonly XrMotionReferenceStagePreset[] = Object.freeze(
  XR_MOTION_REFERENCE_STAGE_PRESETS.filter(preset => preset.environmentKind === 'terrain'),
)

export type XrSceneLibraryCategory = 'people' | 'animals' | 'vehicles' | 'furniture' | 'props'
export type XrSceneLibraryShape = 'humanoid' | 'quadruped' | 'car' | 'bicycle' | 'helicopter' | 'ball' | 'debris' | 'chair' | 'table' | 'sofa' | 'cart' | 'tree' | 'lamp' | 'crate' | 'umbrella' | 'sailboat'

export type XrSceneLibraryAsset = Readonly<{
  id: string
  label: string
  category: XrSceneLibraryCategory
  description: string
  shape: XrSceneLibraryShape
  dimensionsMeters: XrMotionReferenceVector
  defaultColor: string
  mobile: boolean
  keywords: readonly string[]
}>

export const XR_SCENE_LIBRARY_CATEGORY_LABELS: Readonly<Record<XrSceneLibraryCategory, string>> = {
  people: 'People',
  animals: 'Animals',
  vehicles: 'Vehicles',
  furniture: 'Furniture',
  props: 'Props',
}

export const XR_SCENE_LIBRARY_DEFAULT_ASSET_ID = 'vehicle-helicopter' as const
export const XR_SCENE_LIBRARY_FEATURED_ASSET_IDS = Object.freeze([
  XR_SCENE_LIBRARY_DEFAULT_ASSET_ID,
  'vehicle-sedan',
  'prop-ball',
] as const)

export const XR_SCENE_LIBRARY_ASSETS: readonly XrSceneLibraryAsset[] = [
  {"id": "character-pig", "label": "Pig performer", "category": "people", "description": "Round snout, curled tail and colorful overalls.", "shape": "humanoid", "dimensionsMeters": [0.82, 1.3, 0.6], "defaultColor": "#eb8c43", "mobile": true, "keywords": ["pig", "sailor", "story"]},
  {"id": "character-wolf", "label": "Wolf performer", "category": "people", "description": "Pointed ears, long muzzle and an expressive storybook silhouette.", "shape": "humanoid", "dimensionsMeters": [0.8, 1.9, 0.68], "defaultColor": "#526b85", "mobile": true, "keywords": ["wolf", "story"]},
  {"id": "vehicle-sailboat", "label": "Sailboat", "category": "vehicles", "description": "Wooden hull, cream sail and deck for a sea journey.", "shape": "sailboat", "dimensionsMeters": [3.4, 4, 5.2], "defaultColor": "#a66743", "mobile": true, "keywords": ["boat", "sea", "journey"]},
  {"id": "prop-house-straw", "label": "Straw house", "category": "props", "description": "Golden thatch and bundled straw walls.", "shape": "crate", "dimensionsMeters": [2, 2.3, 2], "defaultColor": "#eec86d", "mobile": false, "keywords": ["straw", "house", "story"]},
  {"id": "prop-house-stick", "label": "Stick house", "category": "props", "description": "Timber posts, log walls and pitched wooden roof.", "shape": "crate", "dimensionsMeters": [2, 2.3, 2], "defaultColor": "#bb8050", "mobile": false, "keywords": ["stick", "house", "story"]},
  {"id": "prop-house-brick", "label": "Brick house", "category": "props", "description": "Brick courses, solid roof and a chimney by the sea.", "shape": "crate", "dimensionsMeters": [2.2, 2.4, 2.2], "defaultColor": "#c66b50", "mobile": false, "keywords": ["brick", "house", "story"]},
  {"id": "prop-soup-pot", "label": "Soup pot", "category": "props", "description": "Open metal pot with warm soup and a rim.", "shape": "crate", "dimensionsMeters": [1.8, 1.6, 1.8], "defaultColor": "#445464", "mobile": false, "keywords": ["soup", "pot", "story"]},
  { id: 'person-adult', label: 'Adult', category: 'people', description: 'Neutral standing performer at human scale.', shape: 'humanoid', dimensionsMeters: [0.65, 1.75, 0.45], defaultColor: '#38bdf8', mobile: true, keywords: ['cast', 'actor', 'human'] },
  { id: 'person-child', label: 'Child', category: 'people', description: 'Smaller neutral performer for family blocking.', shape: 'humanoid', dimensionsMeters: [0.52, 1.25, 0.38], defaultColor: '#f97316', mobile: true, keywords: ['cast', 'actor', 'human'] },
  { id: 'animal-dog', label: 'Dog', category: 'animals', description: 'Medium quadruped with a clear facing direction.', shape: 'quadruped', dimensionsMeters: [0.45, 0.72, 1.05], defaultColor: '#a78bfa', mobile: true, keywords: ['pet', 'cast'] },
  { id: 'animal-cat', label: 'Cat', category: 'animals', description: 'Small quadruped for close domestic staging.', shape: 'quadruped', dimensionsMeters: [0.3, 0.42, 0.72], defaultColor: '#ec4899', mobile: true, keywords: ['pet', 'cast'] },
  { id: 'vehicle-sedan', label: 'Car', category: 'vehicles', description: 'Four-seat road car at practical scale.', shape: 'car', dimensionsMeters: [1.82, 1.45, 4.55], defaultColor: '#60a5fa', mobile: true, keywords: ['car', 'sedan', 'traffic'] },
  { id: 'vehicle-van', label: 'Van', category: 'vehicles', description: 'Tall cargo or passenger vehicle.', shape: 'car', dimensionsMeters: [2, 2.35, 5.1], defaultColor: '#f8fafc', mobile: true, keywords: ['car', 'traffic', 'delivery'] },
  { id: 'vehicle-bicycle', label: 'Bicycle', category: 'vehicles', description: 'Two-wheel silhouette for rider and street marks.', shape: 'bicycle', dimensionsMeters: [0.55, 1.1, 1.8], defaultColor: '#22c55e', mobile: true, keywords: ['bike', 'cycle'] },
  { id: 'vehicle-helicopter', label: 'Helicopter', category: 'vehicles', description: 'Detailed procedural rotorcraft for hover and orbit choreography.', shape: 'helicopter', dimensionsMeters: [7.4, 3.4, 9], defaultColor: '#f59e0b', mobile: true, keywords: ['helicopter', 'rotorcraft', 'aerial', 'orbit'] },
  { id: 'prop-ball', label: 'Ball', category: 'props', description: 'Procedural segmented ball for rolling, bounce, and impact choreography.', shape: 'ball', dimensionsMeters: [1.2, 1.2, 1.2], defaultColor: '#2e8ee6', mobile: true, keywords: ['ball', 'sphere', 'rolling', 'bounce', 'physics'] },
  { id: 'furniture-chair', label: 'Chair', category: 'furniture', description: 'Single upright chair with readable seat direction.', shape: 'chair', dimensionsMeters: [0.52, 0.92, 0.55], defaultColor: '#c084fc', mobile: false, keywords: ['seat', 'interior'] },
  { id: 'furniture-table', label: 'Table', category: 'furniture', description: 'Four-seat rectangular table.', shape: 'table', dimensionsMeters: [1.6, 0.76, 0.9], defaultColor: '#94a3b8', mobile: false, keywords: ['dining', 'desk', 'interior'] },
  { id: 'furniture-sofa', label: 'Sofa', category: 'furniture', description: 'Three-seat sofa with clear front and back.', shape: 'sofa', dimensionsMeters: [2.1, 0.9, 0.9], defaultColor: '#14b8a6', mobile: false, keywords: ['couch', 'seat', 'interior'] },
  { id: 'prop-shopping-cart', label: 'Shopping Cart', category: 'props', description: 'Retail trolley for aisle and checkout movement.', shape: 'cart', dimensionsMeters: [0.65, 1.05, 1.1], defaultColor: '#e2e8f0', mobile: true, keywords: ['supermarket', 'trolley'] },
  { id: 'prop-tree', label: 'Tree', category: 'props', description: 'Simple trunk and canopy spatial marker.', shape: 'tree', dimensionsMeters: [2.8, 5.5, 2.8], defaultColor: '#84cc16', mobile: false, keywords: ['outdoor', 'landscape'] },
  { id: 'prop-streetlight', label: 'Streetlight', category: 'props', description: 'Tall street fixture and pool-of-light marker.', shape: 'lamp', dimensionsMeters: [0.55, 4.5, 0.55], defaultColor: '#facc15', mobile: false, keywords: ['exterior', 'lamp'] },
  { id: 'prop-crate', label: 'Crate', category: 'props', description: 'Meter-scale obstacle and practical hand prop.', shape: 'crate', dimensionsMeters: [1, 1, 1], defaultColor: '#fb7185', mobile: false, keywords: ['box', 'obstacle'] },
  { id: 'prop-debris-cluster', label: 'Debris Cluster', category: 'props', description: 'Procedural loose fragments for collapse, impact, and settle paths.', shape: 'debris', dimensionsMeters: [2.4, 2.2, 2.2], defaultColor: '#94a3b8', mobile: true, keywords: ['debris', 'collapse', 'impact', 'fragments'] },
  { id: 'prop-pool-umbrella', label: 'Pool Umbrella', category: 'props', description: 'Patio umbrella with a wide overhead footprint.', shape: 'umbrella', dimensionsMeters: [2.6, 2.5, 2.6], defaultColor: '#f43f5e', mobile: false, keywords: ['backyard', 'patio', 'shade'] },
]

export function resolveXrMotionReferenceStage(stageId: XrMotionReferenceStageId): XrMotionReferenceStagePreset {
  return XR_MOTION_REFERENCE_STAGE_PRESETS.find(preset => preset.id === stageId)
    || XR_MOTION_REFERENCE_STAGE_PRESETS.find(preset => preset.id === XR_MOTION_REFERENCE_DEFAULT_STAGE_ID)!
}

export function resolveXrMotionReferenceColliderStructures(
  stage: XrMotionReferenceStagePreset,
): readonly XrGreyBoxStructure[] {
  return stage.structures.filter(structure => structure.collidable !== false)
}

export function resolveXrSceneLibraryAsset(assetId: string): XrSceneLibraryAsset {
  return XR_SCENE_LIBRARY_ASSETS.find(asset => asset.id === String(assetId || '').trim())
    || XR_SCENE_LIBRARY_ASSETS.find(asset => asset.id === XR_SCENE_LIBRARY_DEFAULT_ASSET_ID)!
}

export function isXrSceneLibraryAssetId(assetId: unknown): boolean {
  const normalized = String(assetId || '').trim()
  return XR_SCENE_LIBRARY_ASSETS.some(asset => asset.id === normalized)
}

export const XR_PLAYGROUND_PALMS = [
  [-8.8, -8.8, 1.25, -0.08],
  [7.5, -9, 1.05, 0.1],
  [11.2, -6.6, 1.18, -0.1],
  [-12.1, 3.6, 0.95, 0.14],
  [12.2, 3.3, 0.88, -0.12],
  [-10.4, -4.2, 0.82, 0.09],
  [9.6, 6.1, 0.78, -0.07],
  [-5.6, 8.4, 0.7, 0.11],
  [4.8, 8.8, 0.66, -0.09],
  [-3.2, -9.6, 0.92, 0.05],
  [1.4, -10.2, 0.74, -0.06],
  [13.1, -1.8, 0.8, 0.08],
] as const

export const XR_PLAYGROUND_ROCKS = [
  [-6.8, 1.25, -9.5, 3.1, 1.8, 1.4, '#66747a'],
  [0, 1.35, -10, 4.3, 2.1, 1.25, '#66747a'],
  [6.4, 1.2, -9.6, 2.4, 1.8, 1.5, '#66747a'],
  [11.8, 0.8, -1.5, 1.45, 1.1, 1.25, '#77817c'],
  [-12.3, 0.7, -1.2, 1.2, 1, 1.4, '#77817c'],
  [-9.4, 0.42, 8.8, 1.05, 0.62, 0.88, '#7d8680'],
  [8.6, 0.38, 9.4, 0.92, 0.55, 0.78, '#7d8680'],
] as const

export type XrStageObject = Readonly<{
  id: string; label: string; position: XrMotionReferenceVector; size: XrMotionReferenceVector
  category: XrSceneLibraryCategory; color: string; nativeBodyId?: string
}>
const stageObject = (id: string, label: string, position: XrMotionReferenceVector, size: XrMotionReferenceVector,
  category: XrSceneLibraryCategory = 'props', nativeBodyId?: string): XrStageObject => Object.freeze({
  id: `xr-stage:${id}`, label, position, size, category, color: '#9b7653', ...(nativeBodyId ? { nativeBodyId } : {}),
})
export const XR_PLAYGROUND_OBJECTS: readonly XrStageObject[] = Object.freeze([
  stageObject('cannon-left', 'Left Cannon', [1.6, 0, -6.25], [1.8, 1.5, 2.7]),
  stageObject('cannon-right', 'Right Cannon', [4.15, 0, -6.25], [1.8, 1.5, 2.7]),
  stageObject('chest', 'Treasure Chest', [0, 0, 0], [2.4, 2, 1.6]),
  stageObject('key', 'Treasure Key', [0, 0, 0], [1.8, 0.8, 0.3]),
  stageObject('fence', 'Palisade', [0, 0, -9.35], [21, 2.6, 0.7]),
  stageObject('ramp', 'Wooden Ramp', [-8.8, 0, -0.4], [4, 1.4, 3.5]),
  stageObject('grotto', 'Skull Grotto', [-11, 0, -7.6], [6.5, 5, 5.6]),
  stageObject('skeleton', 'Skeleton', [8.2, 0.18, -6.8], [2, 0.8, 3]),
  stageObject('hazards', 'Moving Platforms', [0, 3.3, -8.35], [12, 1.8, 2]),
  stageObject('ship', 'Pirate Ship', [17.3, -0.55, -2.2], [5, 7, 10], 'vehicles'),
  stageObject('tentacles', 'Sea Tentacles', [20.7, -0.85, -1.7], [5, 8, 12], 'animals'),
  stageObject('player', 'Playground Player', [0, 0, 0], [1.2, 1.2, 1.2], 'vehicles', 'native-controller'),
  ...XR_PLAYGROUND_PALMS.map(([x, z, scale], i) => stageObject(`palm-${i + 1}`, `Palm ${i + 1}`, [x, 0, z], [3 * scale, 5 * scale, 3 * scale])),
  ...XR_PLAYGROUND_ROCKS.map(([x, y, z, sx, sy, sz], i) => stageObject(`rock-${i + 1}`, `Rock ${i + 1}`, [x, y, z], [sx * 2, sy * 2, sz * 2])),
  ...['a', 'b', 'c'].map((name, i) => stageObject(`barrel-${name}`, `Barrel ${i + 1}`, [0, 0, 0], [1.6, 1.8, 1.6], 'props', `native-crate-${name}`)),
  ...['left', 'right'].map(side => stageObject(`cannonball-${side}`, `${side === 'left' ? 'Left' : 'Right'} Cannonball`, [0, 0, 0], [0.55, 0.55, 0.55], 'props', `native-cannonball-${side}`)),
  ...Array.from({length: 6}, (_, i) => stageObject(`pin-${i + 1}`, `Bowling Pin ${i + 1}`, [0, 0, 0], [0.5, 1.2, 0.5], 'props', `native-pin-${i + 1}`)),
])
export function resolveXrStageObjects(stageId: string): readonly XrStageObject[] {
  return stageId === 'tropical-playground' ? XR_PLAYGROUND_OBJECTS : []
}
