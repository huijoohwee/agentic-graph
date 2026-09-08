import type { GameOsAssetRecord } from './assets.js'

export const GAME_OS_REPOSITORY_ASSET_PROVENANCE_FIXTURE: GameOsAssetRecord = Object.freeze({
  ref: 'neutral-world-mesh',
  localPath: 'fixtures/geospatial/neutral-mesh.json',
  committed: true,
  provenance: Object.freeze({
    origin: 'agentic-graph repository-authored neutral mesh fixture',
    license: 'CC0-1.0',
    repositoryRevision: '90b4276e4fac76c8f06b734c9cdc8c0bd71dc789',
    contentDigest: 'sha256:4d07f7b7dc264ff2ff2cf7cf5c86133c570d7e930ef88e8453866eb1f69e13b6',
  }),
})

export const GAME_OS_REPOSITORY_ASSET_MANIFEST: readonly GameOsAssetRecord[] = Object.freeze([
  GAME_OS_REPOSITORY_ASSET_PROVENANCE_FIXTURE,
])
