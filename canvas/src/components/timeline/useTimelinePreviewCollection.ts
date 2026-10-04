import React from 'react'
import { type CommandMenuRichMediaItem } from '@/lib/command-menu/commandMenuRichMediaInventory'
import { type TimelinePreviewSurfaceItem } from './TimelinePreviewSurface'
import { useTimelinePreviewMediaSession } from './useTimelinePreviewMediaSession'

export type TimelinePreviewCollectionItem = TimelinePreviewSurfaceItem & {
  panel?: CommandMenuRichMediaItem['panel']
}

export type TimelinePreviewCollection = {
  exportPlan: ReturnType<typeof useTimelinePreviewMediaSession>['exportPlan']
  items: TimelinePreviewCollectionItem[]
  previewPlan: ReturnType<typeof useTimelinePreviewMediaSession>['previewPlan']
  sequenceMaxMinutes: number
}

const clean = (value: unknown): string => String(value || '').trim()

const coercePreviewCollectionKind = (kind: CommandMenuRichMediaItem['kind']): TimelinePreviewCollectionItem['kind'] | '' => {
  if (kind === 'image') return 'image'
  if (kind === 'video') return 'video'
  if (kind === 'audio') return 'audio'
  if (kind === 'iframe' || kind === 'youtube' || kind === 'vimeo' || kind === 'webpage' || kind === 'tweet') return 'iframe'
  return ''
}

export const shouldIncludeTimelinePreviewCollectionItem = (item: CommandMenuRichMediaItem): boolean => {
  if (item.kind === 'mermaid') return false
  const nodeId = clean(item.nodeId)
  if (nodeId.startsWith('flow-diagram-')) return false
  const srcDoc = clean(item.srcDoc)
  if (/\bdata-kg-flow-diagram\b/i.test(srcDoc) || /\bdata-kg-mermaid-source\b/i.test(srcDoc)) return false
  return true
}

const toPreviewCollectionItem = (item: CommandMenuRichMediaItem): TimelinePreviewCollectionItem | null => {
  if (!shouldIncludeTimelinePreviewCollectionItem(item)) return null
  const kind = coercePreviewCollectionKind(item.kind)
  if (!kind) return null
  const src = clean(item.src)
  const srcDoc = clean(item.srcDoc)
  if (!src && !srcDoc) return null
  return {
    key: clean(item.key) || `${kind}:${src || srcDoc}`,
    kind,
    label: clean(item.panelTitle) || clean(item.label) || 'Rich media',
    openUrl: clean(item.openUrl) || src,
    panel: item.panel,
    source: item.source,
    src,
    srcDoc: srcDoc || undefined,
  }
}

export function useTimelinePreviewCollection(args: {
  inventoryItems: readonly CommandMenuRichMediaItem[]
  markdownDocumentName: string
  markdownText: string
  selectedRowKey?: string | null
}): TimelinePreviewCollection {
  const session = useTimelinePreviewMediaSession({
    markdownDocumentName: args.markdownDocumentName,
    markdownText: args.markdownText,
    selectedRowKey: args.selectedRowKey,
  })

  const items = React.useMemo<TimelinePreviewCollectionItem[]>(() => {
    const previewItems: TimelinePreviewCollectionItem[] = session.items.map(sourceItem => ({
      key: sourceItem.key,
      kind: sourceItem.kind,
      label: sourceItem.label,
      openUrl: sourceItem.openUrl,
      source: 'video-sequence',
      src: sourceItem.src,
      srcDoc: sourceItem.srcDoc,
      videoSequenceSource: sourceItem.source,
    }))
    const out = [...previewItems]
    const seen = new Set(out.map(item => `${item.kind}:${item.src || item.srcDoc || item.key}`))
    for (const item of args.inventoryItems) {
      const previewItem = toPreviewCollectionItem(item)
      if (!previewItem) continue
      const dedupeKey = `${previewItem.kind}:${previewItem.src || previewItem.srcDoc || previewItem.key}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      out.push(previewItem)
    }
    return out
  }, [args.inventoryItems, session.items])

  return React.useMemo(() => ({
    exportPlan: session.exportPlan,
    items,
    previewPlan: session.previewPlan,
    sequenceMaxMinutes: session.sequenceMaxMinutes,
  }), [items, session.exportPlan, session.previewPlan, session.sequenceMaxMinutes])
}
