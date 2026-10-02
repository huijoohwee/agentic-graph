import { inferCorpusMediaKind } from '@/features/queryable-corpus/corpusGraph'
import type { VideoSequenceTimelineSource } from './videoSequenceTimeline'

type RegisteredVideoSequenceSourceFile = {
  file: File
  fileSignature: string
  objectUrl: string
  originalName: string
  relativePath: string
  mimeHint: string
  byteSize: number
  lastModifiedMs: number
  registeredAtMs: number
}

const OBJECT_URL_REVOKE_DELAY_MS = 2000
const pendingObjectUrlRevokes = new Map<string, ReturnType<typeof setTimeout>>()
const registryBySignature = new Map<string, RegisteredVideoSequenceSourceFile>()
const registry = new Map<string, RegisteredVideoSequenceSourceFile>()
const listeners = new Set<() => void>()
let revision = 0
let pendingPersistence: Promise<void> = Promise.resolve()

export const readVideoSequenceSourceRevision = (): number => revision
export function subscribeVideoSequenceSources(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

const clean = (value: unknown): string => String(value || '').trim()

const cleanKeyPart = (value: unknown): string => clean(value).replace(/\\/g, '/').toLowerCase()

const readFileRelativePath = (file: File): string => {
  const raw = (file as unknown as { webkitRelativePath?: unknown }).webkitRelativePath
  return typeof raw === 'string' ? clean(raw) : ''
}

const readByteSize = (value: unknown): number => {
  const size = Number(value)
  return Number.isFinite(size) && size >= 0 ? Math.floor(size) : 0
}

const readLastModifiedMs = (file: File): number => {
  const value = Number(file.lastModified)
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

const buildVideoSequenceSourceFileSignature = (file: File): string => {
  return [
    cleanKeyPart(readFileRelativePath(file)),
    cleanKeyPart(file.name),
    readByteSize(file.size),
    cleanKeyPart(file.type),
    readLastModifiedMs(file),
  ].join('|')
}

const createObjectUrl = (file: File): string => {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return ''
  try {
    return URL.createObjectURL(file)
  } catch {
    return ''
  }
}

const revokeObjectUrl = (value: string): void => {
  if (!value || !value.startsWith('blob:') || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
  try {
    URL.revokeObjectURL(value)
  } catch {
    void 0
  }
}

const clearPendingObjectUrlRevoke = (value: string): void => {
  const timerId = pendingObjectUrlRevokes.get(value)
  if (!timerId) return
  pendingObjectUrlRevokes.delete(value)
  if (typeof clearTimeout === 'function') clearTimeout(timerId)
}

const scheduleObjectUrlRevoke = (value: string): void => {
  if (!value || !value.startsWith('blob:') || typeof setTimeout !== 'function') {
    revokeObjectUrl(value)
    return
  }
  clearPendingObjectUrlRevoke(value)
  const timerId = setTimeout(() => {
    pendingObjectUrlRevokes.delete(value)
    revokeObjectUrl(value)
  }, OBJECT_URL_REVOKE_DELAY_MS)
  pendingObjectUrlRevokes.set(value, timerId)
}

export function buildVideoSequenceSourceRegistryKeys(source: Pick<VideoSequenceTimelineSource, 'originalName' | 'relativePath' | 'mimeHint' | 'byteSize'>): string[] {
  const names = [
    cleanKeyPart(source.relativePath),
    cleanKeyPart(source.originalName),
    cleanKeyPart(source.relativePath).split('/').filter(Boolean).pop() || '',
  ].filter(Boolean)
  const uniqueNames = Array.from(new Set(names))
  const mimeHint = cleanKeyPart(source.mimeHint)
  const byteSize = readByteSize(source.byteSize)
  const keys: string[] = []
  for (const name of uniqueNames) {
    if (byteSize > 0 && mimeHint) keys.push(`${name}|${byteSize}|${mimeHint}`)
    if (byteSize > 0) keys.push(`${name}|${byteSize}`)
    if (mimeHint) keys.push(`${name}|${mimeHint}`)
    keys.push(name)
  }
  return Array.from(new Set(keys))
}

export function registerVideoSequenceSourceFiles(files: readonly File[]): void {
  registerRuntimeFiles(files)
  const records = files.filter(file => inferCorpusMediaKind(file.name, file.type) === 'video').map(file => ({
    id: buildVideoSequenceSourceFileSignature(file),
    keys: buildVideoSequenceSourceRegistryKeys({ originalName: file.name, relativePath: readFileRelativePath(file), mimeHint: file.type, byteSize: file.size }),
    blob: file,
    name: file.name,
    lastModified: file.lastModified,
  }))
  if (!records.length) return
  pendingPersistence = pendingPersistence.then(async () => {
    const { writeLocalMediaFiles } = await import('@/lib/storage/localMediaFileStore')
    await writeLocalMediaFiles(records)
  }).catch(error => { console.warn('Local video source could not be saved for reopening.', error) })
}

function registerRuntimeFiles(files: readonly File[]): void {
  let changed = false
  for (const file of Array.from(files || [])) {
    if (inferCorpusMediaKind(file.name, file.type) !== 'video') continue
    const fileSignature = buildVideoSequenceSourceFileSignature(file)
    const existing = registryBySignature.get(fileSignature) || null
    const objectUrl = existing?.objectUrl || createObjectUrl(file)
    if (!objectUrl) continue
    const relativePath = readFileRelativePath(file)
    const registered: RegisteredVideoSequenceSourceFile = {
      file: existing?.file || file,
      fileSignature,
      objectUrl,
      originalName: clean(file.name),
      relativePath,
      mimeHint: clean(file.type),
      byteSize: readByteSize(file.size),
      lastModifiedMs: readLastModifiedMs(file),
      registeredAtMs: Date.now(),
    }
    const keys = buildVideoSequenceSourceRegistryKeys({
      originalName: registered.originalName,
      relativePath: registered.relativePath,
      mimeHint: registered.mimeHint,
      byteSize: registered.byteSize,
    })
    clearPendingObjectUrlRevoke(objectUrl)
    registryBySignature.set(fileSignature, registered)
    changed ||= !existing
    const revoked = new Set<string>()
    for (const key of keys) {
      const previous = registry.get(key)
      changed ||= previous?.objectUrl !== objectUrl
      if (previous?.objectUrl && previous.objectUrl !== objectUrl && !revoked.has(previous.objectUrl)) {
        scheduleObjectUrlRevoke(previous.objectUrl)
        revoked.add(previous.objectUrl)
      }
      registry.set(key, registered)
    }
  }
  if (changed) {
    revision += 1
    Array.from(listeners).forEach(listener => listener())
  }
}

export async function restoreVideoSequenceSourceFiles(sources: readonly VideoSequenceTimelineSource[]): Promise<void> {
  const missing = sources.filter(source => !source.sourceUrl && !resolveVideoSequenceSourceRuntimeUrl(source))
  if (!missing.length) return
  await pendingPersistence
  const { readLocalMediaFiles } = await import('@/lib/storage/localMediaFileStore')
  const records = await readLocalMediaFiles(missing.flatMap(buildVideoSequenceSourceRegistryKeys))
  for (const source of missing) {
    // A new import can win while IndexedDB is being read. Never replace its live handle.
    if (resolveVideoSequenceSourceRuntimeUrl(source)) continue
    const keys = buildVideoSequenceSourceRegistryKeys(source)
    const record = records.find(record => keys.some(key => record.keys.includes(key))
      && (!source.byteSize || record.blob.size === source.byteSize)
      && (!source.mimeHint || record.blob.type === source.mimeHint))
    if (!record) continue
    registerRuntimeFiles([new File([record.blob], record.name, { type: record.blob.type, lastModified: record.lastModified })])
  }
}

export function resolveVideoSequenceSourceRuntimeUrl(source: VideoSequenceTimelineSource | null | undefined): string {
  if (!source) return ''
  for (const key of buildVideoSequenceSourceRegistryKeys(source)) {
    const registered = registry.get(key)
    if (registered?.objectUrl) return registered.objectUrl
  }
  return ''
}

export function listVideoSequenceSourceFiles(): RegisteredVideoSequenceSourceFile[] {
  const seen = new Set<string>()
  const out: RegisteredVideoSequenceSourceFile[] = []
  for (const entry of registry.values()) {
    if (!entry.objectUrl || seen.has(entry.objectUrl)) continue
    seen.add(entry.objectUrl)
    out.push(entry)
  }
  return out.sort((a, b) => b.registeredAtMs - a.registeredAtMs)
}
