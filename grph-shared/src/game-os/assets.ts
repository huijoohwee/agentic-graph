import { cloneCanonicalGameOsValue, compareGameOsText, deepFreezeGameOsValue } from './canonical.js'
import { GAME_OS_REPOSITORY_ASSET_MANIFEST } from './assetManifest.js'
import { exactText } from './schema.js'
import { GameOsError } from './types.js'

export const GAME_OS_REDISTRIBUTABLE_LICENSES = Object.freeze([
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'MIT',
  'Unlicense',
] as const)

export type GameOsRedistributableLicense = typeof GAME_OS_REDISTRIBUTABLE_LICENSES[number]

export type GameOsAssetProvenance = {
  origin: string
  license: GameOsRedistributableLicense
  repositoryRevision: string
  contentDigest: string
}

export type GameOsAssetRecord = {
  ref: string
  localPath: string
  committed: true
  provenance: GameOsAssetProvenance
}

export type GameOsAssetHandle = GameOsAssetRecord & {
  loadPolicy: 'committed-local-only'
}

const requiredText = (value: unknown, field: string): string => {
  try { return exactText(value, field) } catch {
    throw new GameOsError('asset-provenance-invalid', `Asset ${field} is required.`, { field })
  }
}

const assertLocalPath = (value: unknown): string => {
  const localPath = requiredText(value, 'localPath')
  const segments = localPath.split('/')
  if (
    /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(localPath)
    || localPath.startsWith('/')
    || /[\\?#]/u.test(localPath)
    || localPath.includes('%')
    || /[\u0000-\u001f\u007f]/u.test(localPath)
    || segments.some(segment => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new GameOsError('asset-provenance-invalid', 'Asset path must resolve inside the committed local bundle.', {
      localPath,
    })
  }
  return localPath
}

export const validateGameOsAssetRecord = (input: GameOsAssetRecord): GameOsAssetRecord => {
  const ref = requiredText(input?.ref, 'ref')
  const localPath = assertLocalPath(input?.localPath)
  if (input?.committed !== true) {
    throw new GameOsError('asset-provenance-invalid', `Asset ${ref} is not marked as committed.`, { ref })
  }
  const origin = requiredText(input?.provenance?.origin, 'provenance.origin')
  const license = requiredText(input?.provenance?.license, 'provenance.license')
  if (!GAME_OS_REDISTRIBUTABLE_LICENSES.includes(license as GameOsRedistributableLicense)) {
    throw new GameOsError('asset-provenance-invalid', `Asset ${ref} has a non-redistributable licence.`, {
      ref,
      license,
    })
  }
  const repositoryRevision = requiredText(
    input?.provenance?.repositoryRevision,
    'provenance.repositoryRevision',
  )
  if (!/^[a-f0-9]{40}$/u.test(repositoryRevision)) {
    throw new GameOsError('asset-provenance-invalid', `Asset ${ref} lacks an exact committed revision.`, { ref })
  }
  const contentDigest = requiredText(input?.provenance?.contentDigest, 'provenance.contentDigest')
  if (!/^sha256:[a-f0-9]{64}$/u.test(contentDigest)) {
    throw new GameOsError('asset-provenance-invalid', `Asset ${ref} content digest is invalid.`, { ref })
  }
  return deepFreezeGameOsValue({
    ref,
    localPath,
    committed: true,
    provenance: {
      origin,
      license: license as GameOsRedistributableLicense,
      repositoryRevision,
      contentDigest,
    },
  }) as GameOsAssetRecord
}

export const validateGameOsAssetManifest = (
  records: readonly GameOsAssetRecord[],
): readonly GameOsAssetRecord[] => {
  const assets = new Map<string, GameOsAssetRecord>()
  for (const input of records) {
    const record = validateGameOsAssetRecord(input)
    if (assets.has(record.ref)) {
      throw new GameOsError('asset-provenance-invalid', `Asset ${record.ref} is declared more than once.`, {
        ref: record.ref,
      })
    }
    assets.set(record.ref, record)
  }
  return deepFreezeGameOsValue(Array.from(assets.values())
    .sort((left, right) => compareGameOsText(left.ref, right.ref))) as readonly GameOsAssetRecord[]
}

export class GameOsAssetProvenanceGate {
  private readonly assets = new Map<string, GameOsAssetRecord>()

  constructor() {
    for (const record of validateGameOsAssetManifest(GAME_OS_REPOSITORY_ASSET_MANIFEST)) {
      this.assets.set(record.ref, record)
    }
  }

  resolve(assetRefValue: string): GameOsAssetHandle {
    let assetRef: string
    try { assetRef = exactText(assetRefValue, 'assetRef') } catch { assetRef = '' }
    const record = this.assets.get(assetRef)
    if (!record) {
      throw new GameOsError('asset-not-found', `Asset ${assetRef || '(empty)'} is not in the committed local set.`, {
        ref: assetRef,
      })
    }
    const verified = validateGameOsAssetRecord(record)
    return deepFreezeGameOsValue({
      ...cloneCanonicalGameOsValue(verified),
      loadPolicy: 'committed-local-only',
    }) as GameOsAssetHandle
  }

  list(): GameOsAssetRecord[] {
    return Array.from(this.assets.values())
      .map(record => cloneCanonicalGameOsValue(record))
      .sort((left, right) => compareGameOsText(left.ref, right.ref))
  }
}
