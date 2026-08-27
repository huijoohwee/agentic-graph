import {
  readUploadedMediaKind,
  uploadMediaFileToAgenticGraphStorage,
  type UploadedMediaStorageResult,
} from '@/lib/storage/uploadedMediaStorage'
import {
  buildUploadedMediaPanelItemId,
  mergeUploadedMediaPanelItems,
  readUploadedMediaFileName,
  readUploadedMediaStorageRuntimeUrl,
  writeStoredUploadedMediaPanelItems,
  type UploadedMediaPanelItem,
} from '@/lib/storage/uploadedMediaPanelItems'

export type UploadedMediaPanelUploadResult = {
  item: UploadedMediaPanelItem
  storage: UploadedMediaStorageResult
}

export type UploadedMediaPanelUploadSetItems = (
  updater: (items: UploadedMediaPanelItem[]) => UploadedMediaPanelItem[],
) => void

const createUploadedMediaPanelItemId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `media-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function uploadFilesToUploadedMediaPanel(args: {
  files: Iterable<File>
  setItems: UploadedMediaPanelUploadSetItems
  registerObjectUrl?: (url: string) => void
  onSynced?: (result: UploadedMediaPanelUploadResult) => void
}): Promise<UploadedMediaPanelUploadResult[]> {
  const results: UploadedMediaPanelUploadResult[] = []
  for (const file of Array.from(args.files || [])) {
    const kind = readUploadedMediaKind(file)
    if (!kind) continue
    const id = createUploadedMediaPanelItemId()
    const localUrl = URL.createObjectURL(file)
    args.registerObjectUrl?.(localUrl)
    const initialItem: UploadedMediaPanelItem = {
      id,
      name: file.name || `uploaded-${kind}`,
      kind,
      localUrl,
      linkUrl: localUrl,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      status: 'uploading',
      storage: null,
      error: null,
    }
    args.setItems(prev => [initialItem, ...prev])
    try {
      const storage = await uploadMediaFileToAgenticGraphStorage({ file, uploadNow: true })
      if (!storage) {
        args.setItems(prev => prev.map(item => item.id === id ? {
          ...item,
          status: 'local',
          error: 'Cloudflare media upload did not confirm R2/D1 persistence',
        } : item))
        continue
      }
      let syncedItem: UploadedMediaPanelItem | null = null
      args.setItems(prev => {
        const accessUrl = readUploadedMediaStorageRuntimeUrl(storage)
        const next = mergeUploadedMediaPanelItems(prev.map(item => {
          if (item.id !== id) return item
          syncedItem = {
            ...item,
            id: buildUploadedMediaPanelItemId(storage),
            name: readUploadedMediaFileName(storage),
            status: 'synced' as const,
            linkUrl: accessUrl,
            storage: { ...storage, accessUrl },
            error: null,
          }
          return syncedItem
        }))
        writeStoredUploadedMediaPanelItems(next)
        return next
      })
      const fallbackAccessUrl = readUploadedMediaStorageRuntimeUrl(storage)
      const resultItem = syncedItem || {
        ...initialItem,
        id: buildUploadedMediaPanelItemId(storage),
        name: readUploadedMediaFileName(storage),
        status: 'synced' as const,
        linkUrl: fallbackAccessUrl,
        storage: { ...storage, accessUrl: fallbackAccessUrl },
        error: null,
      }
      const result = { item: resultItem, storage }
      results.push(result)
      args.onSynced?.(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed'
      args.setItems(prev => prev.map(item => item.id === id ? { ...item, status: 'local', error: message } : item))
    }
  }
  return results
}
