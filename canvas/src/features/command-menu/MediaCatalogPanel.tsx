import React from 'react'
import { INLINE_VARIABLE_COMMAND_ACTIONS, type InlineVariableCommandId } from '@/lib/command-menu/inlineCommandMenuCatalog'
import { type CommandMenuRichMediaItem, renameCommandMenuRichMediaMarkdownHref, useCommandMenuRichMediaInventory } from '@/lib/command-menu/commandMenuRichMediaInventory'
import { readCommandMenuMediaNameDraft, useCommandMenuMediaNameDrafts, writeCommandMenuMediaNameDraft } from '@/lib/command-menu/commandMenuMediaNameSync'
import { useGraphStore } from '@/hooks/useGraphStore'
import { mergeTimelineMediaReaderSummaryWithSource, useTimelineMediaReaderSummary } from '@/components/timeline/timelineMediaReader'
import { resolveTimelinePlanSourceUrl } from '@/components/timeline/timelinePlanSync'
import { readVideoSequenceTimelineModelFromMarkdown } from '@/components/timeline/videoSequenceTimeline'
import { writeWorkspaceSourceTextIfPresent } from '@/hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'
import { deleteUploadedMediaFromAgenticGraphStorage, listUploadedMediaFromAgenticGraphStorage, renameUploadedMediaInAgenticGraphStorage, type UploadedMediaStorageResult } from '@/lib/storage/uploadedMediaStorage'
import { buildUploadedMediaPanelItemFromStorage, buildUploadedMediaPanelItemId, mergeUploadedMediaPanelItems, readStoredUploadedMediaPanelItems, readUploadedMediaFileName, readUploadedMediaPanelDedupeKey, readUploadedMediaPanelItemRuntimeUrl, readUploadedMediaStorageRuntimeUrl, UPLOADED_MEDIA_PANEL_ITEMS_CHANGED_EVENT, writeStoredUploadedMediaPanelItems, type UploadedMediaPanelItem } from '@/lib/storage/uploadedMediaPanelItems'
import { uploadFilesToUploadedMediaPanel } from '@/lib/storage/uploadedMediaPanelUpload'
import { importUrlToUploadedMediaPanel } from '@/lib/storage/uploadedMediaPanelImportUrl'
import { UI_TOAST_TTL_MS } from '@/lib/ui/toastTiming'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import type { MediaLightboxPromptParameters } from '@/lib/ui/MediaLightbox'
import { buildMediaLightboxPromptParameters } from '@/lib/ui/mediaLightboxPromptParameters'
import { insertMediaIntoActiveCardInlineTextEditor } from '@/lib/cards/cardInlineTextExternalCommands'
import { MEDIA_LIBRARY_OPEN_TOP_EVENT } from '@/features/canvas/utils'
import { buildVideoSequenceTimelineImportMarkdown } from '@/features/markdown-workspace/workspaceImport/videoSequenceTimelineImport'
import { selectMediaCatalogAction } from './mediaCatalogActionSelection'
import { MediaCatalogPanelView } from './MediaCatalogPanelView'
import { MEDIA_NEW_ACTIONS, readStoredMediaCatalogLayout, readStoredMediaDescriptionDrafts, readStoredMediaFieldDrafts, writeStoredMediaCatalogLayout, writeStoredMediaDescriptionDrafts, writeStoredMediaFieldDrafts, type MediaCatalogLayout, type MediaCatalogSourceMetadataItem, type MediaPanelActionSpec, type UploadedMediaDescriptionDrafts, type UploadedMediaFieldDrafts } from './mediaCatalogTypes'
import { buildUploadedMediaMarkdown } from './mediaCatalogUploadedItems'
import { getUploadedMediaDescriptionKey, buildCommandMenuMediaDragPayload, buildUploadedMediaDragPayload, getMediaNameSyncKey, readRichMediaInsertUrl, startMediaDrag, type UploadedMediaDragMetadata } from './mediaCatalogShared'
import { buildProceduralMediaMarkdown, generateProceduralMediaArtifact, readProceduralMediaGenerationSettings, type ProceduralMediaArtifact } from './proceduralMediaGenerator'

const MEDIA_INLINE_INSERT_ACTION_IDS: readonly InlineVariableCommandId[] = ['insert-image', 'insert-audio', 'insert-video']
type MediaInlineInsertAction = (typeof INLINE_VARIABLE_COMMAND_ACTIONS)[number]
const MEDIA_INLINE_INSERT_ACTIONS = MEDIA_INLINE_INSERT_ACTION_IDS
  .map(actionId => INLINE_VARIABLE_COMMAND_ACTIONS.find(action => action.id === actionId))
  .filter((action): action is MediaInlineInsertAction => !!action)

export function MediaCatalogPanel() {
  const panelTypography = usePanelTypography()
  const panelRef = React.useRef<HTMLElement | null>(null)
  const mediaListRef = React.useRef<HTMLElement | null>(null)
  const uploadInputRef = React.useRef<HTMLInputElement | null>(null)
  const objectUrlsRef = React.useRef<Set<string>>(new Set())
  const [catalogLayout, setCatalogLayoutState] = React.useState<MediaCatalogLayout>(readStoredMediaCatalogLayout)
  const [uploadedMediaItems, setUploadedMediaItems] = React.useState<UploadedMediaPanelItem[]>(readStoredUploadedMediaPanelItems)
  const [mediaDescriptionDrafts, setMediaDescriptionDrafts] = React.useState<UploadedMediaDescriptionDrafts>(readStoredMediaDescriptionDrafts)
  const [mediaFieldDrafts, setMediaFieldDrafts] = React.useState<UploadedMediaFieldDrafts>(readStoredMediaFieldDrafts)
  const [previewItem, setPreviewItem] = React.useState<UploadedMediaPanelItem | null>(null)
  const [generateLightboxOpen, setGenerateLightboxOpen] = React.useState(false), [generateMediaBusy, setGenerateMediaBusy] = React.useState(false)
  const [generateMediaPrompt, setGenerateMediaPrompt] = React.useState(''), [generatedMediaItem, setGeneratedMediaItem] = React.useState<UploadedMediaPanelItem | null>(null)
  const [importUrlPromptOpen, setImportUrlPromptOpen] = React.useState(false)
  const [importUrlDraft, setImportUrlDraft] = React.useState('')
  const [importUrlBusy, setImportUrlBusy] = React.useState(false)
  const setActiveMediaKey = useGraphStore(s => s.setMarkdownPreviewActiveMediaKey)
  const setMermaidFocus = useGraphStore(s => s.setMarkdownPreviewMermaidFocus)
  const selectNode = useGraphStore(s => s.selectNode)
  const setSelectionSource = useGraphStore(s => s.setSelectionSource)
  const updateNode = useGraphStore(s => s.updateNode)
  const markdownDocumentName = useGraphStore(s => s.markdownDocumentName)
  const markdownDocumentText = useGraphStore(s => s.markdownDocumentText || '')
  const setMarkdownDocument = useGraphStore(s => s.setMarkdownDocument)
  const sourceFiles = useGraphStore(s => s.sourceFiles)
  const setSourceFiles = useGraphStore(s => s.setSourceFiles)
  const setBottomSurfaceCollapsed = useGraphStore(s => s.setBottomSurfaceCollapsed)
  const setBottomSurfaceTab = useGraphStore(s => s.setBottomSurfaceTab)
  const pushUiToast = useGraphStore(s => s.pushUiToast)
  const { items } = useCommandMenuRichMediaInventory()
  const uploadedMediaKeys = React.useMemo(() => new Set(uploadedMediaItems.flatMap(item => {
    const storage = item.storage
    if (!storage) return []
    return [
      storage.contentHash,
      storage.objectKey,
      storage.publicPath,
      storage.publicUrl.split('?')[0] || storage.publicUrl,
      storage.accessUrl.split('?')[0] || storage.accessUrl,
    ].map(value => String(value || '').trim()).filter(Boolean)
  })), [uploadedMediaItems])
  const mediaItems = React.useMemo(
    () => items.filter(item => {
      if (item.kind === 'mermaid') return false
      const candidate = [item.openUrl, item.src, item.thumbnailUrl].map(value => String(value || '').split('?')[0] || String(value || ''))
      return !candidate.some(value => uploadedMediaKeys.has(value.trim()))
    }),
    [items, uploadedMediaKeys],
  )
  const mediaNameDrafts = useCommandMenuMediaNameDrafts()
  const videoSequenceMetadataSource = React.useMemo(() => {
    const sourceTexts = [
      markdownDocumentText,
      ...sourceFiles.map(file => String(file?.text || '')),
    ]
    for (const sourceText of sourceTexts) {
      if (!sourceText.includes('kgVideoSequence')) continue
      const timelineModel = readVideoSequenceTimelineModelFromMarkdown(sourceText)
      const source = timelineModel?.sources.find(candidate => resolveTimelinePlanSourceUrl(candidate))
      if (source) return source
    }
    return null
  }, [markdownDocumentText, sourceFiles])
  const videoSequenceMetadataSourceUrl = videoSequenceMetadataSource ? resolveTimelinePlanSourceUrl(videoSequenceMetadataSource) : ''
  const videoSequenceMetadataSummaryRaw = useTimelineMediaReaderSummary({
    active: !!videoSequenceMetadataSourceUrl,
    url: videoSequenceMetadataSourceUrl,
  })
  const videoSequenceMetadataSummary = React.useMemo(
    () => mergeTimelineMediaReaderSummaryWithSource(videoSequenceMetadataSummaryRaw, videoSequenceMetadataSource),
    [videoSequenceMetadataSource, videoSequenceMetadataSummaryRaw],
  )
  const sourceMetadataItem = React.useMemo<MediaCatalogSourceMetadataItem | null>(() => {
    if (!videoSequenceMetadataSource || !videoSequenceMetadataSourceUrl) return null
    return {
      byteSize: videoSequenceMetadataSource.byteSize,
      id: videoSequenceMetadataSource.id || videoSequenceMetadataSourceUrl,
      importMode: videoSequenceMetadataSource.importMode,
      mimeHint: videoSequenceMetadataSource.mimeHint,
      name: videoSequenceMetadataSource.originalName || videoSequenceMetadataSource.relativePath || videoSequenceMetadataSourceUrl,
      sourceUrl: videoSequenceMetadataSourceUrl,
      summary: videoSequenceMetadataSummary,
    }
  }, [videoSequenceMetadataSource, videoSequenceMetadataSourceUrl, videoSequenceMetadataSummary])
  const mediaActions = React.useMemo(
    () => [
      ...MEDIA_NEW_ACTIONS,
      ...MEDIA_INLINE_INSERT_ACTIONS,
    ],
    [],
  )
  const generatePromptParameters = React.useMemo(
    () => buildMediaLightboxPromptParameters({ kind: 'media' }),
    [],
  )
  const scrollMediaPanelToTop = React.useCallback((behavior: ScrollBehavior = 'auto') => {
    try {
      panelRef.current?.scrollTo?.({ top: 0, behavior })
    } catch {
      if (panelRef.current) panelRef.current.scrollTop = 0
    }
    mediaListRef.current?.focus?.({ preventScroll: true })
  }, [])
  const openMediaLibraryTop = React.useCallback(() => {
    const run = () => {
      scrollMediaPanelToTop('smooth')
    }
    if (typeof window === 'undefined') {
      run()
      return
    }
    window.requestAnimationFrame(run)
  }, [scrollMediaPanelToTop])
  const setCatalogLayout = React.useCallback((layout: MediaCatalogLayout) => {
    setCatalogLayoutState(layout)
    writeStoredMediaCatalogLayout(layout)
  }, [])
  React.useEffect(() => () => {
    objectUrlsRef.current.forEach(url => {
      try {
        URL.revokeObjectURL(url)
      } catch {
        void 0
      }
    })
    objectUrlsRef.current.clear()
  }, [])
  React.useEffect(() => {
    let cancelled = false
    listUploadedMediaFromAgenticGraphStorage().then(storageItems => {
      if (cancelled || storageItems.length === 0) return
      const cloudflareItems = storageItems
        .map(buildUploadedMediaPanelItemFromStorage)
        .filter((item): item is UploadedMediaPanelItem => !!item)
      if (cloudflareItems.length === 0) return
      setUploadedMediaItems(prev => {
        const next = mergeUploadedMediaPanelItems([...cloudflareItems, ...prev.map(item => (
          item.status === 'synced' ? { ...item, linkUrl: readUploadedMediaPanelItemRuntimeUrl(item) } : item
        ))])
        writeStoredUploadedMediaPanelItems(next)
        return next
      })
    }).catch(() => {
      void 0
    })
    return () => {
      cancelled = true
    }
  }, [])
  React.useEffect(() => {
    const onItemsChanged = () => setUploadedMediaItems(readStoredUploadedMediaPanelItems())
    window.addEventListener(UPLOADED_MEDIA_PANEL_ITEMS_CHANGED_EVENT, onItemsChanged)
    return () => {
      window.removeEventListener(UPLOADED_MEDIA_PANEL_ITEMS_CHANGED_EVENT, onItemsChanged)
    }
  }, [])
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    window.addEventListener(MEDIA_LIBRARY_OPEN_TOP_EVENT, openMediaLibraryTop)
    return () => {
      window.removeEventListener(MEDIA_LIBRARY_OPEN_TOP_EVENT, openMediaLibraryTop)
    }
  }, [openMediaLibraryTop])
  React.useEffect(() => {
    scrollMediaPanelToTop('auto')
  }, [catalogLayout, mediaItems.length, scrollMediaPanelToTop, uploadedMediaItems.length])
  const appendSyncedUploadedMediaSource = React.useCallback((args: {
    itemId: string
    name: string
    kind: UploadedMediaPanelItem['kind']
    storage: UploadedMediaStorageResult
  }) => {
    const sourceId = `media-upload:${args.storage.contentHash}`
    const currentSourceFiles = useGraphStore.getState().sourceFiles || []
    if (currentSourceFiles.some(file => String(file?.id || '') === sourceId)) return
    const text = buildUploadedMediaMarkdown({
      name: args.name,
      kind: args.kind,
      url: readUploadedMediaStorageRuntimeUrl(args.storage),
      contentHash: args.storage.contentHash,
      objectKey: args.storage.objectKey,
    })
    const nextFile = {
      id: sourceId,
      name: `${args.name || args.itemId}.media.md`,
      text,
      enabled: true,
      geoLayerEnabled: false,
      status: 'idle' as const,
      parsedTextHash: '',
      source: {
        kind: 'local' as const,
        path: `workspace:/media/${args.storage.objectKey}.md`,
      },
    }
    setSourceFiles([...currentSourceFiles, nextFile])
  }, [setSourceFiles])
  const materializeGeneratedMediaSource = React.useCallback((artifact: ProceduralMediaArtifact, url: string) => {
    const sourceId = `media-procedural:${artifact.id}`
    const currentSourceFiles = useGraphStore.getState().sourceFiles || []
    const mediaText = buildProceduralMediaMarkdown({ artifact, url })
    const mediaFile = {
      id: sourceId, name: `${artifact.fileName}.media.md`, text: mediaText, enabled: true, geoLayerEnabled: false, status: 'idle' as const, parsedTextHash: '',
      source: { kind: 'local' as const, path: `workspace:/media/${artifact.fileName}.media.md` },
    }
    setSourceFiles([...currentSourceFiles.filter(file => String(file?.id || '') !== sourceId), mediaFile])
    if (artifact.kind === 'video') {
      const sequenceText = buildVideoSequenceTimelineImportMarkdown([{
        byteSize: artifact.sizeBytes, displayHeight: artifact.height, displayWidth: artifact.width, durationSeconds: artifact.durationSeconds, frameRate: artifact.frameRate, importMode: 'workspace', mimeHint: artifact.contentType, originalName: artifact.fileName, relativePath: artifact.fileName, sourceUrl: url,
      }])
      setBottomSurfaceTab('timeline')
      setBottomSurfaceCollapsed(false)
      setMarkdownDocument(`${artifact.fileName}.video-sequence.timeline.md`, sequenceText)
      return
    }
    setMarkdownDocument(`${artifact.fileName}.media.md`, mediaText)
  }, [setBottomSurfaceCollapsed, setBottomSurfaceTab, setMarkdownDocument, setSourceFiles])
  const removeGeneratedMediaSources = React.useCallback((item: UploadedMediaPanelItem) => {
    if (!item.id.startsWith('procedural-media:')) return
    const signature = item.id.slice('procedural-media:'.length)
    const nextSourceFiles = sourceFiles.filter(file => {
      const id = String(file?.id || '')
      const text = String(file?.text || '')
      return !id.includes(signature) && !text.includes(item.linkUrl)
    })
    if (nextSourceFiles.length !== sourceFiles.length) setSourceFiles(nextSourceFiles)
  }, [setSourceFiles, sourceFiles])
  const handleGenerateMedia = React.useCallback(async (prompt: string, parameters?: MediaLightboxPromptParameters) => {
    if (generateMediaBusy) return
    const settings = readProceduralMediaGenerationSettings(prompt, parameters)
    setGenerateMediaBusy(true)
    pushUiToast({ id: 'media:procedural-generate', kind: 'neutral', message: 'Generating media…', ttlMs: null, dismissible: false, busy: true })
    try {
      const artifact = await generateProceduralMediaArtifact(settings)
      const localUrl = URL.createObjectURL(artifact.blob)
      objectUrlsRef.current.add(localUrl)
      const item: UploadedMediaPanelItem = {
        id: `procedural-media:${artifact.id}`,
        name: artifact.fileName,
        kind: artifact.kind,
        localUrl,
        linkUrl: localUrl,
        contentType: artifact.contentType,
        sizeBytes: artifact.sizeBytes,
        displayHeight: artifact.height,
        displayWidth: artifact.width,
        durationSeconds: artifact.durationSeconds,
        frameRate: artifact.frameRate,
        status: 'local',
        storage: null,
        error: null,
      }
      setGeneratedMediaItem(item)
      setUploadedMediaItems(prev => [item, ...prev.filter(candidate => candidate.id !== item.id)])
      materializeGeneratedMediaSource(artifact, localUrl)
      pushUiToast({ id: 'media:procedural-generate', kind: 'success', message: `Generated ${artifact.kind} media`, ttlMs: UI_TOAST_TTL_MS.actionFeedback, dismissible: false })
    } catch (error) {
      pushUiToast({ id: 'media:procedural-generate', kind: 'error', message: `Generation failed: ${error instanceof Error ? error.message : 'Request failed'}`, ttlMs: UI_TOAST_TTL_MS.warningExtended, dismissible: true })
    } finally {
      setGenerateMediaBusy(false)
    }
  }, [generateMediaBusy, materializeGeneratedMediaSource, pushUiToast])
  const handleUploadMediaFiles = React.useCallback(async (fileList: FileList | null) => {
    await uploadFilesToUploadedMediaPanel({
      files: Array.from(fileList || []),
      setItems: setUploadedMediaItems,
      registerObjectUrl: url => objectUrlsRef.current.add(url),
      onSynced: ({ item, storage }) => {
        appendSyncedUploadedMediaSource({ itemId: item.id, name: item.name, kind: item.kind, storage })
      },
    })
  }, [appendSyncedUploadedMediaSource])
  const handleImportMediaUrl = React.useCallback(async (urlRaw: string) => {
    const url = String(urlRaw || '').trim()
    if (!url || importUrlBusy) return
    setImportUrlBusy(true)
    pushUiToast({
      id: 'media:import-url',
      kind: 'neutral',
      message: 'Importing media URL…',
      ttlMs: null,
      dismissible: false,
      busy: true,
    })
    try {
      const results = await importUrlToUploadedMediaPanel({
        urlRaw: url,
        setItems: setUploadedMediaItems,
        registerObjectUrl: objectUrl => objectUrlsRef.current.add(objectUrl),
        onSynced: ({ item, storage }) => {
          appendSyncedUploadedMediaSource({ itemId: item.id, name: item.name, kind: item.kind, storage })
        },
      })
      if (results.length === 0) throw new Error('URL did not resolve to image, audio, or video media')
      setImportUrlDraft('')
      setImportUrlPromptOpen(false)
      pushUiToast({
        id: 'media:import-url',
        kind: 'success',
        message: `Imported ${results.length} media URL${results.length === 1 ? '' : 's'}`,
        ttlMs: UI_TOAST_TTL_MS.actionFeedback,
        dismissible: false,
      })
    } catch (error) {
      pushUiToast({
        id: 'media:import-url',
        kind: 'error',
        message: `Import failed: ${error instanceof Error ? error.message : 'Request failed'}`,
        ttlMs: UI_TOAST_TTL_MS.warningExtended,
        dismissible: true,
      })
    } finally {
      setImportUrlBusy(false)
    }
  }, [appendSyncedUploadedMediaSource, importUrlBusy, pushUiToast])
  const handleSelectMedia = React.useCallback((item: CommandMenuRichMediaItem) => {
    if (item.kind === 'image' || item.kind === 'audio' || item.kind === 'video') {
      const inserted = insertMediaIntoActiveCardInlineTextEditor({
        kind: item.kind,
        url: readRichMediaInsertUrl(item),
        label: readCommandMenuMediaNameDraft(mediaNameDrafts, getMediaNameSyncKey(item)) || item.label,
        sourceKey: item.key,
      })
      if (inserted) return
    }
    setMermaidFocus(null)
    setActiveMediaKey(item.key)
    if (item.source === 'graph' && item.nodeId) {
      setSelectionSource('toolbar')
      selectNode(item.nodeId)
    }
  }, [mediaNameDrafts, selectNode, setActiveMediaKey, setMermaidFocus, setSelectionSource])
  const handleMediaNameDraftChange = React.useCallback((item: CommandMenuRichMediaItem, nextName: string) => {
    const syncKey = getMediaNameSyncKey(item)
    writeCommandMenuMediaNameDraft(syncKey, nextName)
  }, [])
  const removeUploadedMediaSources = React.useCallback((storage: UploadedMediaStorageResult) => {
    const artifactSourceId = `media-upload:${storage.contentHash}`
    const nextSourceFiles = sourceFiles.filter(file => {
      const id = String(file?.id || '')
      const text = String(file?.text || '')
      return id !== artifactSourceId && !text.includes(storage.contentHash) && !text.includes(storage.objectKey)
    })
    if (nextSourceFiles.length !== sourceFiles.length) setSourceFiles(nextSourceFiles)
  }, [setSourceFiles, sourceFiles])
  const renameUploadedMediaSources = React.useCallback((storage: UploadedMediaStorageResult, nextName: string) => {
    const artifactSourceId = `media-upload:${storage.contentHash}`
    const nextSourceFiles = sourceFiles.map(file => {
      const id = String(file?.id || '')
      const text = String(file?.text || '')
      if (id !== artifactSourceId && !text.includes(storage.contentHash) && !text.includes(storage.objectKey)) return file
      const renamedText = buildUploadedMediaMarkdown({
        name: nextName,
        kind: storage.stageId === 'audio' || storage.stageId === 'video' ? storage.stageId : 'image',
        url: readUploadedMediaStorageRuntimeUrl(storage),
        contentHash: storage.contentHash,
        objectKey: storage.objectKey,
      })
      const nextFile = { ...file, name: `${nextName}.media.md`, text: renamedText, parsedTextHash: '' }
      writeWorkspaceSourceTextIfPresent(nextFile, renamedText, 'Command Menu uploaded media rename')
      return nextFile
    })
    setSourceFiles(nextSourceFiles)
  }, [setSourceFiles, sourceFiles])
  const handleUploadedMediaNameChange = React.useCallback((item: UploadedMediaPanelItem, nextName: string) => {
    setUploadedMediaItems(prev => prev.map(candidate => candidate.id === item.id ? { ...candidate, name: nextName } : candidate))
  }, [])
  const handleUploadedMediaDescriptionChange = React.useCallback((item: UploadedMediaPanelItem, nextDescription: string) => {
    const descriptionKey = getUploadedMediaDescriptionKey(item)
    const description = String(nextDescription || '')
    setMediaDescriptionDrafts(prev => {
      const next = { ...prev }
      if (description.trim()) {
        next[descriptionKey] = description
      } else {
        delete next[descriptionKey]
      }
      writeStoredMediaDescriptionDrafts(next)
      return next
    })
  }, [])
  const handleUploadedMediaFieldChange = React.useCallback((item: UploadedMediaPanelItem, nextFieldText: string) => {
    const fieldKey = getUploadedMediaDescriptionKey(item)
    const fieldText = String(nextFieldText || '')
    setMediaFieldDrafts(prev => {
      const next = { ...prev }
      if (fieldText.trim()) {
        next[fieldKey] = fieldText
      } else {
        delete next[fieldKey]
      }
      writeStoredMediaFieldDrafts(next)
      return next
    })
  }, [])
  const handleRenameUploadedMedia = React.useCallback((item: UploadedMediaPanelItem, nextName: string) => {
    const name = String(nextName || '').trim()
    if (!name || !item.storage) return
    setUploadedMediaItems(prev => {
      const next = prev.map(candidate => candidate.id === item.id ? { ...candidate, name } : candidate)
      writeStoredUploadedMediaPanelItems(next)
      return next
    })
    renameUploadedMediaSources(item.storage, name)
    void renameUploadedMediaInAgenticGraphStorage({ storage: item.storage, name }).then(storage => {
      if (!storage) return
      setUploadedMediaItems(prev => {
        const next = mergeUploadedMediaPanelItems(prev.map(candidate => (
          candidate.id === item.id || readUploadedMediaPanelDedupeKey(candidate) === storage.contentHash
            ? (() => {
                const accessUrl = readUploadedMediaStorageRuntimeUrl(storage)
                return { ...candidate, id: buildUploadedMediaPanelItemId(storage), name: readUploadedMediaFileName(storage), linkUrl: accessUrl, storage: { ...storage, accessUrl } }
              })()
            : candidate
        )))
        writeStoredUploadedMediaPanelItems(next)
        return next
      })
    }).catch(() => {
      void 0
    })
  }, [renameUploadedMediaSources])
  const handleDeleteUploadedMedia = React.useCallback((item: UploadedMediaPanelItem) => {
    setUploadedMediaItems(prev => {
      const next = prev.filter(candidate => readUploadedMediaPanelDedupeKey(candidate) !== readUploadedMediaPanelDedupeKey(item))
      writeStoredUploadedMediaPanelItems(next)
      return next
    })
    if (generatedMediaItem?.id === item.id) setGeneratedMediaItem(null)
    if (previewItem?.id === item.id) setPreviewItem(null)
    removeGeneratedMediaSources(item)
    if (!item.storage) return
    removeUploadedMediaSources(item.storage)
    void deleteUploadedMediaFromAgenticGraphStorage({ storage: item.storage }).catch(() => {
      void 0
    })
  }, [generatedMediaItem?.id, previewItem?.id, removeGeneratedMediaSources, removeUploadedMediaSources])
  const handleSelectUploadedMedia = React.useCallback((item: UploadedMediaPanelItem) => {
    if (!item.storage || item.status !== 'synced') return
    appendSyncedUploadedMediaSource({ itemId: item.id, name: item.name, kind: item.kind, storage: item.storage })
    const inserted = insertMediaIntoActiveCardInlineTextEditor({
      kind: item.kind,
      url: readUploadedMediaPanelItemRuntimeUrl(item),
      label: item.name,
      sourceKey: item.storage.contentHash,
    })
    if (inserted) return
    setMermaidFocus(null)
    setActiveMediaKey(`media-upload:${item.storage.contentHash}`)
  }, [appendSyncedUploadedMediaSource, setActiveMediaKey, setMermaidFocus])
  const handlePreviewUploadedMedia = React.useCallback((item: UploadedMediaPanelItem) => {
    setPreviewItem(item)
  }, [])
  const handleDragCommandMenuMedia = React.useCallback((event: React.DragEvent<HTMLElement>, item: CommandMenuRichMediaItem) => {
    startMediaDrag(event, buildCommandMenuMediaDragPayload(item))
  }, [])
  const handleDragUploadedMedia = React.useCallback((event: React.DragEvent<HTMLElement>, item: UploadedMediaPanelItem, metadata?: UploadedMediaDragMetadata) => {
    startMediaDrag(event, buildUploadedMediaDragPayload(item, metadata))
  }, [])
  const handleSelectMediaAction = React.useCallback((action: MediaPanelActionSpec) => {
    selectMediaCatalogAction({
      action,
      setGenerateLightboxOpen,
      setImportUrlPromptOpen,
      setMermaidFocus,
      uploadInputRef,
    })
  }, [setMermaidFocus])
  const handleRenameMedia = React.useCallback((item: CommandMenuRichMediaItem, nextName: string) => {
    const owner = item.renameOwner
    const name = String(nextName || '').trim()
    if (!owner || !name) return
    const mediaNameSyncKey = getMediaNameSyncKey(item)
    const markdownRenameItem: CommandMenuRichMediaItem = owner.type === 'markdownLine'
      ? item
      : mediaNameSyncKey
        ? {
            ...item,
            renameOwner: {
              type: 'markdownLine',
              startLine: item.startLine || 1,
              href: mediaNameSyncKey,
              syntax: 'link',
            },
          }
        : item
    if (owner.type === 'graphNodeLabel') {
      updateNode(owner.nodeId, { label: name })
    }
    const nextText = renameCommandMenuRichMediaMarkdownHref({
      markdownText: markdownDocumentText,
      item: markdownRenameItem,
      nextName: name,
    })
    let sourceFilesChanged = false
    const nextSourceFiles = sourceFiles.map(file => {
      const fileText = String(file?.text || '')
      const renamedText = renameCommandMenuRichMediaMarkdownHref({
        markdownText: fileText,
        item: markdownRenameItem,
        nextName: name,
      })
      if (renamedText === fileText) return file
      sourceFilesChanged = true
      const nextFile = { ...file, text: renamedText, parsedTextHash: '' }
      writeWorkspaceSourceTextIfPresent(nextFile, renamedText, 'Command Menu media rename')
      return nextFile
    })
    if (sourceFilesChanged) setSourceFiles(nextSourceFiles)
    if (nextText !== markdownDocumentText) {
      setMarkdownDocument(markdownDocumentName, nextText, { applyViewPreset: false })
    }
  }, [markdownDocumentName, markdownDocumentText, setMarkdownDocument, setSourceFiles, sourceFiles, updateNode])
  return (
    <MediaCatalogPanelView
      catalogLayout={catalogLayout}
      generateLightboxOpen={generateLightboxOpen}
      generateMediaBusy={generateMediaBusy}
      generatedMediaItem={generatedMediaItem}
      generateMediaPrompt={generateMediaPrompt}
      generatePromptParameters={generatePromptParameters}
      importUrlBusy={importUrlBusy}
      importUrlDraft={importUrlDraft}
      importUrlPromptOpen={importUrlPromptOpen}
      previewItem={previewItem}
      mediaActions={mediaActions}
      mediaDescriptionDrafts={mediaDescriptionDrafts}
      mediaFieldDrafts={mediaFieldDrafts}
      mediaItems={mediaItems}
      mediaListRef={mediaListRef}
      mediaNameDrafts={mediaNameDrafts}
      panelRef={panelRef}
      panelTextClass={panelTypography.panelTextClass}
      sourceMetadataItem={sourceMetadataItem}
      uploadInputRef={uploadInputRef}
      uploadedMediaItems={uploadedMediaItems}
      onCloseGenerateLightbox={() => setGenerateLightboxOpen(false)}
      onClosePreview={() => setPreviewItem(null)}
      onDeleteUploadedMedia={handleDeleteUploadedMedia}
      onDescriptionChange={handleUploadedMediaDescriptionChange}
      onDragCommandMenuMedia={handleDragCommandMenuMedia}
      onDragUploadedMedia={handleDragUploadedMedia}
      onFieldChange={handleUploadedMediaFieldChange}
      onGeneratePromptChange={setGenerateMediaPrompt}
      onGeneratePromptSubmit={handleGenerateMedia}
      onImportUrlChange={setImportUrlDraft}
      onImportUrlConfirm={handleImportMediaUrl}
      onImportUrlPromptOpenChange={setImportUrlPromptOpen}
      onLayoutChange={setCatalogLayout}
      onMediaNameDraftChange={handleMediaNameDraftChange}
      onNameChange={handleUploadedMediaNameChange}
      onNewMedia={openMediaLibraryTop}
      onPreviewUploadedMedia={handlePreviewUploadedMedia}
      onRenameMedia={handleRenameMedia}
      onRenameUploadedMedia={handleRenameUploadedMedia}
      onSelectMedia={handleSelectMedia}
      onSelectMediaAction={handleSelectMediaAction}
      onSelectUploadedMedia={handleSelectUploadedMedia}
      onUploadMediaFiles={handleUploadMediaFiles}
    />
  )
}
export default MediaCatalogPanel
