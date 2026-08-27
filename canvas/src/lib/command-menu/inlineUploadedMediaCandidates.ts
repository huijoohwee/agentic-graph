import React from 'react'
import { listUploadedMediaFromAgenticGraphStorage } from '@/lib/storage/uploadedMediaStorage'
import {
  buildUploadedMediaPanelItemFromStorage,
  mergeUploadedMediaPanelItems,
  readStoredUploadedMediaPanelItems,
  readUploadedMediaPanelItemRuntimeUrl,
  UPLOADED_MEDIA_PANEL_ITEMS_CHANGED_EVENT,
  writeStoredUploadedMediaPanelItems,
  type UploadedMediaPanelItem,
} from '@/lib/storage/uploadedMediaPanelItems'
import type { InlineMediaCommandCandidate } from './inlineCommandMenuCatalog'

let storageItemsRequest: Promise<UploadedMediaPanelItem[]> | null = null

export function buildUploadedMediaInlineCommandCandidate(item: UploadedMediaPanelItem): InlineMediaCommandCandidate | null {
  if (item.status !== 'synced' || !item.storage) return null
  const url = readUploadedMediaPanelItemRuntimeUrl(item)
  if (!url) return null
  const sourceKey = String(item.storage.contentHash || item.storage.objectKey || item.id).trim()
  return {
    id: `uploaded-${item.id}`,
    kind: item.kind,
    url,
    thumbnailUrl: item.kind === 'image' ? url : undefined,
    label: item.name,
    sourceKey,
    description: 'Uploaded media from FloatingPanel Media',
    keywords: [item.kind, item.name, sourceKey, url].filter(Boolean),
  }
}

function loadUploadedMediaPanelItems(): Promise<UploadedMediaPanelItem[]> {
  if (storageItemsRequest) return storageItemsRequest
  storageItemsRequest = listUploadedMediaFromAgenticGraphStorage()
    .then(storageItems => {
      const cloudItems = storageItems
        .map(buildUploadedMediaPanelItemFromStorage)
        .filter((item): item is UploadedMediaPanelItem => !!item)
      const next = mergeUploadedMediaPanelItems([...cloudItems, ...readStoredUploadedMediaPanelItems()])
      writeStoredUploadedMediaPanelItems(next)
      return next
    })
    .catch(() => readStoredUploadedMediaPanelItems())
    .finally(() => {
      storageItemsRequest = null
    })
  return storageItemsRequest
}

export function useUploadedMediaInlineCommandCandidates(options?: { enabled?: boolean }): InlineMediaCommandCandidate[] {
  const enabled = options?.enabled !== false
  const [items, setItems] = React.useState<UploadedMediaPanelItem[]>(() => (enabled ? readStoredUploadedMediaPanelItems() : []))

  React.useEffect(() => {
    if (!enabled) {
      setItems([])
      return
    }
    let active = true
    const refreshLocal = () => {
      storageItemsRequest = null
      setItems(readStoredUploadedMediaPanelItems())
    }
    refreshLocal()
    window.addEventListener(UPLOADED_MEDIA_PANEL_ITEMS_CHANGED_EVENT, refreshLocal)
    loadUploadedMediaPanelItems().then(next => {
      if (active) setItems(mergeUploadedMediaPanelItems([...readStoredUploadedMediaPanelItems(), ...next]))
    })
    return () => {
      active = false
      window.removeEventListener(UPLOADED_MEDIA_PANEL_ITEMS_CHANGED_EVENT, refreshLocal)
    }
  }, [enabled])

  return React.useMemo(
    () => items.flatMap(item => {
      const candidate = buildUploadedMediaInlineCommandCandidate(item)
      return candidate ? [candidate] : []
    }),
    [items],
  )
}
