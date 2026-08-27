import { buildAgenticGraphStorageBlobPath } from '@/lib/storage/agenticgraphStorageSyncContract'
import { readActiveAgenticGraphStorageWorkspaceId } from '@/features/source-files/sourceFileShareUrl'
import { readAgenticGraphStorageBaseUrl } from '@/features/source-files/sourceFilesAgenticGraphStorageSettings'
import {
  isXrV2PublishedSpatialAsset,
  type XrV2PublishedSpatialAsset,
} from './xrV2SpatialAssetMetadata'

export const XR_V2_CROSS_DEVICE_ASSET_MANIFEST_SCHEMA =
  'agenticgraph-xr-v2-cross-device-asset-manifest/v1' as const
export const XR_V2_CROSS_DEVICE_MANIFEST_ROOT = 'xr-assets' as const
export const XR_V2_CROSS_DEVICE_DEFAULT_MAX_PART_BYTES = 100 * 1024 * 1024
export const XR_V2_CROSS_DEVICE_MAX_MANIFEST_BYTES = 128 * 1024

/**
 * This is inherited from the existing shared blob/document boundary. XR code must
 * expose it and must not describe that boundary as authenticated production storage.
 */
export const XR_V2_CROSS_DEVICE_EXTERNAL_PROMOTION_BLOCKER = Object.freeze({
  code: 'shared-storage-auth-and-server-digest-not-enforced' as const,
  classification: 'external-promotion-blocker' as const,
  owner: 'existing-agenticgraph-storage-boundary' as const,
  authenticatedWorkspaceBoundary: false,
  serverVerifiedContentDigest: false,
  productionReady: false,
  message: 'Existing blob/document routes do not enforce workspace authentication or recompute uploaded digests.',
})

export type XrV2CrossDeviceAssetPart = Readonly<{
  canonical_path: string
  public_path: string
  content_type: string
  content_hash: `sha256:${string}`
  size_bytes: number
}>

export type XrV2CrossDeviceAssetManifest = Readonly<{
  schema: typeof XR_V2_CROSS_DEVICE_ASSET_MANIFEST_SCHEMA
  workspace_id: string
  source_id: string
  source_hash: `sha256:${string}`
  canonical_path: string
  asset: XrV2PublishedSpatialAsset
  raw_kind: 'raw-clip' | 'stereo-container'
  raw_part: XrV2CrossDeviceAssetPart
  frame_bundle_part: XrV2CrossDeviceAssetPart | null
  published_at_ms: number
}>

export type XrV2CrossDeviceAssetConfig = Readonly<{
  workspaceId: string
  baseUrl: string
  manifestRoot: string
  maxPartBytes: number
  maxCatalogAssets: number
  operationTimeoutMs: number
  readiness: 'demo-only-external-promotion-blocked'
  promotionBlocker: typeof XR_V2_CROSS_DEVICE_EXTERNAL_PROMOTION_BLOCKER
}>

export type XrV2CrossDeviceAssetPaths = Readonly<{
  manifestWorkspacePath: string
  manifestCanonicalPath: string
  rawWorkspacePath: string
  rawCanonicalPath: string
  frameBundleWorkspacePath: string
  frameBundleCanonicalPath: string
}>

const HASH = /^sha256:[0-9a-f]{64}$/
const ROOT = /^[A-Za-z0-9](?:[A-Za-z0-9._/-]{0,126}[A-Za-z0-9])?$/
const JSON_START = '<!-- agenticgraph-xr-v2-asset-contract-json:start -->\n```json\n'
const JSON_END = '\n```\n<!-- agenticgraph-xr-v2-asset-contract-json:end -->'

function boundedString(value: unknown, label: string, maximum: number): string {
  const normalized = String(value || '').trim()
  const containsControlCharacter = Array.from(normalized).some(character => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
  if (!normalized || normalized.length > maximum || containsControlCharacter) {
    throw new Error(`${label} must be a bounded non-empty value without control characters`)
  }
  return normalized
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function integer(value: unknown, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw new Error(`${label} is outside the admitted integer bound`)
  }
  return Number(value)
}

export function readXrV2CrossDeviceAssetConfig(
  overrides: Partial<Pick<XrV2CrossDeviceAssetConfig,
    'workspaceId' | 'baseUrl' | 'manifestRoot' | 'maxPartBytes' | 'maxCatalogAssets' | 'operationTimeoutMs'>> = {},
): XrV2CrossDeviceAssetConfig {
  const workspaceId = boundedString(
    overrides.workspaceId || readActiveAgenticGraphStorageWorkspaceId(),
    'workspaceId',
    256,
  )
  const manifestRoot = String(overrides.manifestRoot || XR_V2_CROSS_DEVICE_MANIFEST_ROOT)
    .trim().replace(/^\/+|\/+$/g, '')
  if (!ROOT.test(manifestRoot) || manifestRoot.split('/').includes('..')) {
    throw new Error('manifestRoot must be a bounded canonical path')
  }
  const maxPartBytes = integer(
    overrides.maxPartBytes ?? XR_V2_CROSS_DEVICE_DEFAULT_MAX_PART_BYTES,
    'maxPartBytes',
    XR_V2_CROSS_DEVICE_DEFAULT_MAX_PART_BYTES,
  )
  const maxCatalogAssets = integer(overrides.maxCatalogAssets ?? 200, 'maxCatalogAssets', 500)
  const operationTimeoutMs = integer(overrides.operationTimeoutMs ?? 60_000, 'operationTimeoutMs', 60_000)
  if (maxPartBytes < 1 || maxCatalogAssets < 1 || operationTimeoutMs < 100) {
    throw new Error('cross-device configuration contains a non-positive bound')
  }
  return Object.freeze({
    workspaceId,
    baseUrl: String(overrides.baseUrl ?? readAgenticGraphStorageBaseUrl()).trim(),
    manifestRoot,
    maxPartBytes,
    maxCatalogAssets,
    operationTimeoutMs,
    readiness: 'demo-only-external-promotion-blocked',
    promotionBlocker: XR_V2_CROSS_DEVICE_EXTERNAL_PROMOTION_BLOCKER,
  })
}

export const readXrV2CrossDeviceAssetStorageConfig = readXrV2CrossDeviceAssetConfig

export async function sha256XrV2CrossDeviceText(value: string): Promise<`sha256:${string}`> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return `sha256:${hex}`
}

export async function resolveXrV2CrossDeviceAssetPaths(
  config: XrV2CrossDeviceAssetConfig,
  sourceIdInput: string,
  assetIdInput: string,
): Promise<XrV2CrossDeviceAssetPaths> {
  const sourceId = boundedString(sourceIdInput, 'sourceId', 1_024)
  const assetId = boundedString(assetIdInput, 'assetId', 160)
  const [sourceHash, assetHash] = await Promise.all([
    sha256XrV2CrossDeviceText(sourceId),
    sha256XrV2CrossDeviceText(assetId),
  ])
  const safeAsset = assetId.replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 72) || 'asset'
  const base = `${safeAsset}-${assetHash.slice(7, 23)}`
  const parent = `${config.manifestRoot}/${sourceHash.slice(7, 31)}`
  const manifestCanonicalPath = `${parent}/${base}.md`
  const rawCanonicalPath = `${parent}/${base}.raw.bin`
  const frameBundleCanonicalPath = `${parent}/${base}.frames.kgxrb`
  return Object.freeze({
    manifestWorkspacePath: `/${manifestCanonicalPath}`,
    manifestCanonicalPath,
    rawWorkspacePath: `/${rawCanonicalPath}`,
    rawCanonicalPath,
    frameBundleWorkspacePath: `/${frameBundleCanonicalPath}`,
    frameBundleCanonicalPath,
  })
}

function part(value: unknown, config: XrV2CrossDeviceAssetConfig, label: string): XrV2CrossDeviceAssetPart {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is malformed`)
  const source = value as Record<string, unknown>
  if (!exactKeys(source, ['canonical_path', 'public_path', 'content_type', 'content_hash', 'size_bytes'])) {
    throw new Error(`${label} fields do not match the pinned manifest schema`)
  }
  const canonicalPath = boundedString(source.canonical_path, `${label} canonical_path`, 1_024)
  const publicPath = boundedString(source.public_path, `${label} public_path`, 2_048)
  const contentType = boundedString(source.content_type, `${label} content_type`, 128)
  const contentHash = String(source.content_hash || '')
  const sizeBytes = integer(source.size_bytes, `${label} size_bytes`, config.maxPartBytes)
  if (!HASH.test(contentHash) || sizeBytes < 1
    || publicPath !== buildAgenticGraphStorageBlobPath(config.workspaceId, canonicalPath)) {
    throw new Error(`${label} identity or integrity fields are malformed`)
  }
  return Object.freeze({
    canonical_path: canonicalPath,
    public_path: publicPath,
    content_type: contentType,
    content_hash: contentHash as `sha256:${string}`,
    size_bytes: sizeBytes,
  })
}

export function serializeXrV2CrossDeviceAssetManifest(manifest: XrV2CrossDeviceAssetManifest): string {
  return [
    '---',
    `title: ${JSON.stringify(`XR asset ${manifest.asset.asset_id}`)}`,
    `doc_type: ${JSON.stringify('XR v2 spatial asset contract')}`,
    `kg_schema: ${JSON.stringify(manifest.schema)}`,
    `kg_source_id: ${JSON.stringify(manifest.source_id)}`,
    `kg_asset_id: ${JSON.stringify(manifest.asset.asset_id)}`,
    '---',
    '',
    `# XR asset ${manifest.asset.asset_id}`,
    '',
    'This editable Markdown manifest is the asset contract used by the existing storage adapter.',
    '',
    `${JSON_START}${JSON.stringify(manifest, null, 2)}${JSON_END}`,
    '',
  ].join('\n')
}

export async function parseXrV2CrossDeviceAssetManifest(
  text: string,
  config: XrV2CrossDeviceAssetConfig,
  expectedCanonicalPath?: string,
): Promise<XrV2CrossDeviceAssetManifest> {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > XR_V2_CROSS_DEVICE_MAX_MANIFEST_BYTES) {
    throw new Error('XR asset manifest exceeds the admitted byte bound')
  }
  const start = text.indexOf(JSON_START)
  const end = start < 0 ? -1 : text.indexOf(JSON_END, start + JSON_START.length)
  if (start < 0 || end < 0 || text.indexOf(JSON_START, start + 1) >= 0) {
    throw new Error('XR asset Markdown manifest does not contain one canonical JSON contract')
  }
  let parsed: unknown
  try { parsed = JSON.parse(text.slice(start + JSON_START.length, end)) } catch {
    throw new Error('XR asset manifest JSON is malformed')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('XR asset manifest is malformed')
  const source = parsed as Record<string, unknown>
  if (!exactKeys(source, [
    'schema', 'workspace_id', 'source_id', 'source_hash', 'canonical_path', 'asset',
    'raw_kind', 'raw_part', 'frame_bundle_part', 'published_at_ms',
  ]) || source.schema !== XR_V2_CROSS_DEVICE_ASSET_MANIFEST_SCHEMA
    || source.workspace_id !== config.workspaceId || !isXrV2PublishedSpatialAsset(source.asset)) {
    throw new Error('XR asset manifest identity or fields are malformed')
  }
  const sourceId = boundedString(source.source_id, 'source_id', 1_024)
  const sourceHash = String(source.source_hash || '')
  const canonicalPath = boundedString(source.canonical_path, 'canonical_path', 1_024)
  const rawKind = source.raw_kind
  if (!HASH.test(sourceHash) || sourceHash !== await sha256XrV2CrossDeviceText(sourceId)
    || (rawKind !== 'raw-clip' && rawKind !== 'stereo-container')) {
    throw new Error('XR asset source or raw kind is malformed')
  }
  const paths = await resolveXrV2CrossDeviceAssetPaths(config, sourceId, source.asset.asset_id)
  const expectedRawKind = source.asset.raw_clip_ref.startsWith('indexeddb://agenticgraph-xr-v2/stereo-container/')
    ? 'stereo-container'
    : 'raw-clip'
  if (canonicalPath !== paths.manifestCanonicalPath
    || rawKind !== expectedRawKind
    || (expectedCanonicalPath && canonicalPath !== expectedCanonicalPath)) {
    throw new Error('XR asset manifest canonical identity does not match source and asset')
  }
  const rawPart = part(source.raw_part, config, 'raw_part')
  const framePart = source.frame_bundle_part === null
    ? null
    : part(source.frame_bundle_part, config, 'frame_bundle_part')
  if (rawPart.canonical_path !== paths.rawCanonicalPath
    || (framePart && (framePart.canonical_path !== paths.frameBundleCanonicalPath
      || framePart.content_type !== 'application/vnd.agenticgraph.xr-v2-frame-bundle'))
    || (source.asset.metadata.depth_metadata_ref && !framePart)) {
    throw new Error('XR asset part paths do not match the deterministic manifest identity')
  }
  return Object.freeze({
    schema: XR_V2_CROSS_DEVICE_ASSET_MANIFEST_SCHEMA,
    workspace_id: config.workspaceId,
    source_id: sourceId,
    source_hash: sourceHash as `sha256:${string}`,
    canonical_path: canonicalPath,
    asset: Object.freeze(structuredClone(source.asset)),
    raw_kind: rawKind,
    raw_part: rawPart,
    frame_bundle_part: framePart,
    published_at_ms: integer(source.published_at_ms, 'published_at_ms'),
  })
}

export function equivalentXrV2CrossDeviceAssetManifests(
  left: XrV2CrossDeviceAssetManifest,
  right: XrV2CrossDeviceAssetManifest,
): boolean {
  const stable = (value: XrV2CrossDeviceAssetManifest) => JSON.stringify({ ...value, published_at_ms: 0 })
  return stable(left) === stable(right)
}
