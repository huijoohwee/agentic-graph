import type { GameOsAssetRecord } from './assets.js'

export const GAME_OS_REPOSITORY_ASSET_PROVENANCE_FIXTURE: GameOsAssetRecord = Object.freeze({
  ref: 'neutral-world-mesh',
  localPath: 'fixtures/geospatial/neutral-mesh.json',
  committed: true,
  provenance: Object.freeze({
    origin: 'AgenticGraph repository-authored neutral mesh fixture',
    license: 'CC0-1.0',
    repositoryRevision: '7132c7096539fb1079e00bffc0f2cd024d423d9d',
    contentDigest: 'sha256:ad90e36f1835a97d9559132d28993ea4b3825f2d621217a4fe54054b8fb076eb',
  }),
})

export const GAME_OS_REPOSITORY_ASSET_MANIFEST: readonly GameOsAssetRecord[] = Object.freeze([
  GAME_OS_REPOSITORY_ASSET_PROVENANCE_FIXTURE,
])
