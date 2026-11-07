import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { readLocalMediaFiles, writeLocalMediaFiles, type LocalMediaFileRecord } from '@/lib/storage/localMediaFileStore'

export type CinemaReferenceAsset = Readonly<{
  id: string
  name: string
  sha256: string
  role: string
}>

export type CinemaShot = Readonly<{
  id: string
  label: string
  startSeconds: number
  endSeconds: number
  referenceAssetId: string | null
  panelIndex: number | null
  /** Optional 1-based join to a numbered location on the environment kit's reference sheet. */
  locationIndex: number | null
  /** Optional printed story beat for the panel: who is on screen, the spoken line, and what it foreshadows. */
  subject: string
  line: string
  foreshadow: string
  /** Optional XR subject ids staged at the shot location; the first is the acting lead. Empty keeps every subject. */
  cast: readonly string[]
  /** Optional performance verb the lead plays through the shot. */
  acting: CinemaShotActing
}>

export const CINEMA_SHOT_ACTINGS = ['idle', 'survey', 'address', 'operate', 'reveal', 'stride', 'brace'] as const
export type CinemaShotActing = typeof CINEMA_SHOT_ACTINGS[number]

export type CinemaTimelineModel = Readonly<{
  title: string
  durationSeconds: number
  environmentKitId: string
  contactSheetAssetId: string | null
  contactSheetLayout: Readonly<{ columns: number; rows: number; cellInsetX: number; cellInsetY: number }>
  assets: readonly CinemaReferenceAsset[]
  shots: readonly CinemaShot[]
}>

export type CinemaStoredAsset = Readonly<{
  asset: CinemaReferenceAsset
  record: LocalMediaFileRecord
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
}>

const MAX_REFERENCE_BYTES = 12 * 1024 * 1024
const CINEMA_MEDIA_KEY_PREFIX = 'cinema-reference:sha256:'
const assetListeners = new Set<() => void>()
let assetRevision = 0

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

const readOptionalText = (value: unknown): string | null => {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length <= 160 ? text : null
}

const readCast = (value: unknown): readonly string[] | null => {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 12) return null
  const ids = value.map(entry => typeof entry === 'string' ? entry.trim() : '')
  return ids.every(id => id && id.length <= 160) && new Set(ids).size === ids.length ? Object.freeze(ids) : null
}

const readActing = (value: unknown): CinemaShotActing | null => {
  if (value === undefined || value === null || value === '') return 'idle'
  return (CINEMA_SHOT_ACTINGS as readonly unknown[]).includes(value) ? value as CinemaShotActing : null
}

const readSeconds = (value: unknown): number | null => {
  const normalized = typeof value === 'number' ? value : Number.parseFloat(String(value || '').trim())
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null
}

export function parseCinemaTimelineSource(sourceText: string): CinemaTimelineModel | null {
  const source = String(sourceText || '')
  if (!source.startsWith('---')) return null
  const parsed = parseMarkdownFrontmatter(splitMarkdownLines(source))
  const planned = asRecord(parsed.meta?.planned_cinema_demo)
  if (!planned) return null
  const rawTitle = planned.title ?? parsed.meta?.title
  const title = readOptionalText(rawTitle)
  if (title === null) return null
  const environmentKitId = String(planned.environment_kit_id || '').trim()
  if (!environmentKitId) return null
  const timeline = asRecord(planned.timeline)
  const intake = asRecord(planned.asset_intake)
  const rawAssets = Array.isArray(intake?.asset_manifest) ? intake.asset_manifest : []
  const rawShots = Array.isArray(timeline?.shot_markers) ? timeline.shot_markers : []
  const durationSeconds = readSeconds(timeline?.duration_seconds)
  if (!durationSeconds || durationSeconds > 60 || rawAssets.length === 0 || rawAssets.length > 48
    || rawShots.length === 0 || rawShots.length > 48) return null

  const assets: CinemaReferenceAsset[] = []
  const assetIds = new Set<string>()
  const assetNames = new Set<string>()
  for (const raw of rawAssets) {
    const entry = asRecord(raw)
    const id = String(entry?.id || '').trim()
    const name = String(entry?.file || '').trim()
    const sha256 = String(entry?.sha256 || '').trim().toLowerCase()
    if (!id || !name || !/^[0-9a-f]{64}$/.test(sha256) || assetIds.has(id) || assetNames.has(name)) return null
    assets.push({ id, name, sha256, role: String(entry?.role || 'reference').trim() || 'reference' })
    assetIds.add(id)
    assetNames.add(name)
  }

  const contactSheetName = String(timeline?.source_contact_sheet || '').trim()
  const contactSheet = contactSheetName ? assets.find(asset => asset.name === contactSheetName) : null
  if (contactSheetName && !contactSheet) return null
  const layoutSource = asRecord(timeline?.contact_sheet_layout)
  const inferredColumns = Math.ceil(Math.sqrt(rawShots.length))
  const inferredRows = Math.ceil(rawShots.length / inferredColumns)
  const columns = layoutSource ? Number(layoutSource.columns) : inferredColumns
  const rows = layoutSource ? Number(layoutSource.rows) : inferredRows
  const cellInsetX = layoutSource ? Number(layoutSource.cell_inset_x ?? layoutSource.cell_inset ?? 1) : 1
  const cellInsetY = layoutSource ? Number(layoutSource.cell_inset_y ?? layoutSource.cell_inset ?? 1) : 1
  if (!Number.isInteger(columns) || columns < 1 || columns > 12
    || !Number.isInteger(rows) || rows < 1 || rows > 12
    || columns * rows > 144
    || !Number.isFinite(cellInsetX) || cellInsetX < 0.5 || cellInsetX > 1
    || !Number.isFinite(cellInsetY) || cellInsetY < 0.5 || cellInsetY > 1) return null
  const shots: CinemaShot[] = []
  const shotIds = new Set<string>()
  let previousEnd = 0
  for (const raw of rawShots) {
    const entry = asRecord(raw)
    const id = String(entry?.id || '').trim()
    const label = String(entry?.label || '').trim()
    const startSeconds = readSeconds(entry?.start)
    const endSeconds = readSeconds(entry?.end)
    const rawPanelIndex = entry?.panel_index
    const panelIndex = rawPanelIndex === undefined || rawPanelIndex === null || rawPanelIndex === ''
      ? null
      : Number(rawPanelIndex)
    const requestedAssetId = entry?.asset_id === undefined || entry?.asset_id === null
      ? ''
      : String(entry.asset_id).trim()
    const referenceAssetId = requestedAssetId || (panelIndex !== null ? contactSheet?.id ?? '' : '')
    const rawLocation = entry?.location_index
    const locationIndex = rawLocation === undefined || rawLocation === null ? null : Number(rawLocation)
    if (locationIndex !== null && (!Number.isInteger(locationIndex) || locationIndex < 1)) return null
    const subject = readOptionalText(entry?.subject)
    const line = readOptionalText(entry?.line)
    const foreshadow = readOptionalText(entry?.foreshadow)
    const cast = readCast(entry?.cast)
    const acting = readActing(entry?.acting)
    if (subject === null || line === null || foreshadow === null || cast === null || acting === null) return null
    if (!id || !label || shotIds.has(id) || startSeconds === null || endSeconds === null
      || endSeconds <= startSeconds || startSeconds < previousEnd || endSeconds > durationSeconds
      || (panelIndex !== null && (!Number.isInteger(panelIndex) || panelIndex < 1 || panelIndex > columns * rows))
      || (requestedAssetId !== '' && !assetIds.has(requestedAssetId))
      || (panelIndex !== null && !referenceAssetId)) return null
    shots.push({ id, label, startSeconds, endSeconds, referenceAssetId: referenceAssetId || null, panelIndex, locationIndex, subject, line, foreshadow, cast, acting })
    shotIds.add(id)
    previousEnd = endSeconds
  }
  return {
    title: title || 'Cinema Timeline',
    durationSeconds,
    environmentKitId,
    contactSheetAssetId: contactSheet?.id ?? null,
    contactSheetLayout: { columns, rows, cellInsetX, cellInsetY },
    assets,
    shots,
  }
}

const sniffImageMime = async (blob: Blob): Promise<CinemaStoredAsset['mimeType'] | null> => {
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

const sha256 = async (blob: Blob): Promise<string> => {
  if (!globalThis.crypto?.subtle) throw new Error('This browser does not support local SHA-256 verification.')
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

const storageKey = (asset: CinemaReferenceAsset): string => `${CINEMA_MEDIA_KEY_PREFIX}${asset.sha256}`

export async function importCinemaReferenceFiles(
  assets: readonly CinemaReferenceAsset[],
  files: readonly File[],
): Promise<void> {
  const byName = new Map<string, File>()
  for (const file of files) {
    if (byName.has(file.name)) throw new Error(`The selection contains more than one file named “${file.name}”.`)
    byName.set(file.name, file)
  }
  const records: LocalMediaFileRecord[] = []
  for (const asset of assets) {
    const file = byName.get(asset.name)
    if (!file) throw new Error(`Select all ${assets.length} named reference assets to keep the manifest complete.`)
    if (file.size <= 0 || file.size > MAX_REFERENCE_BYTES) throw new Error(`“${file.name}” is empty or exceeds the 12 MiB local import limit.`)
    const mimeType = await sniffImageMime(file)
    if (!mimeType) throw new Error(`“${file.name}” does not contain a supported PNG, JPEG, or WebP image.`)
    if (await sha256(file) !== asset.sha256) throw new Error(`“${file.name}” does not match the source manifest SHA-256.`)
    const key = storageKey(asset)
    records.push({ id: key, keys: [key], blob: file, name: file.name, lastModified: file.lastModified })
  }
  await writeLocalMediaFiles(records)
  assetRevision += 1
  assetListeners.forEach(listener => listener())
}

export async function readCinemaReferenceAssets(assets: readonly CinemaReferenceAsset[]): Promise<CinemaStoredAsset[]> {
  const keys = assets.map(storageKey)
  const { records, ambiguousKeys } = await readLocalMediaFiles(keys)
  if (ambiguousKeys.length) throw new Error('A local reference is linked to more than one media record. Reimport the set.')
  const byKey = new Map<string, LocalMediaFileRecord>()
  for (const record of records) for (const key of record.keys) if (keys.includes(key)) byKey.set(key, record)
  const result: CinemaStoredAsset[] = []
  for (const asset of assets) {
    const key = storageKey(asset)
    const record = byKey.get(key)
    if (!record) continue
    if (record.id !== key || record.name !== asset.name) throw new Error(`Local media provenance does not match “${asset.name}”.`)
    const mimeType = await sniffImageMime(record.blob)
    if (!mimeType || await sha256(record.blob) !== asset.sha256) throw new Error(`Local media bytes changed for “${asset.name}”.`)
    result.push({ asset, record, mimeType })
  }
  return result
}

export function subscribeCinemaAssetChanges(listener: () => void): () => void {
  assetListeners.add(listener)
  return () => assetListeners.delete(listener)
}

export function readCinemaAssetRevision(): number {
  return assetRevision
}
