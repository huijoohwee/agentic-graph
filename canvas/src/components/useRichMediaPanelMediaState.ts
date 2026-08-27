import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { applyImageLikeProxySrc } from '@/lib/url'
import { isCanonicalNodeIdEqual } from '@/lib/graph/canonicalNodeIds'
import { isStoryboardWidgetFrontmatterDocumentModeRequested } from '@/lib/graph/frontmatterMode'
import {
  resolveRichMediaPlayableUrl,
  resolveRichMediaPanelSelectedTab,
} from '@/lib/render/richMediaSsot'
import { resolveRichMediaPanelDisplayText } from '@/lib/render/richMediaPanelState'
import { normalizeRuntimeStorageMediaAccessUrl } from '@/lib/storage/runtimeMediaUrl'
import {
  readLatestGrabMapsPoiRichMediaPreview,
  subscribeGrabMapsPoiRichMediaPreview,
} from '@/features/geospatial/grabMapsPoiRichMedia'
import {
  normalizeRichMediaPanelInlineSrcDoc,
  RICH_MEDIA_PANEL_SRCDOC_SIZE_MESSAGE,
  RICH_MEDIA_PANEL_SRCDOC_THEME_MESSAGE,
  shouldUseMediaOwnedRichMediaPanelSrcDocScroll,
  shouldUsePanelOwnedRichMediaPanelSrcDocScroll,
  shouldUseViewportRichMediaPanelSrcDocSize,
} from '@/lib/render/richMediaPanelSrcDoc'
import { cleanTimelinePreviewDocumentKey } from '@/components/timeline/useTimelinePreviewBootstrap'
import {
  TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT,
  type TimelineTransportPlaybackRequestDetail,
} from '@/components/timeline/videoSequenceTimeline'
import type { WorkspaceViewMode } from '@/hooks/store/types'
import {
  buildRichMediaTimelineTransportFrame,
  publishRichMediaTimelineTransportFrame,
  RICH_MEDIA_TIMELINE_TRANSPORT_EVENT,
  RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_ATTR,
  RICH_MEDIA_TIMELINE_TRANSPORT_READY_MESSAGE,
  type RichMediaTimelineTransportFrame,
  resolveRichMediaTimelineDurationUnits,
  resolveRichMediaTimelineMediaTargetSeconds,
} from '@/lib/render/richMediaTimelineSync'
import { useGraphStore } from '@/hooks/useGraphStore'
import { resolveIframeEmbed, shouldForceSnapshotIframeUrl } from 'grph-shared/rich-media/iframe'
import type { RichMediaKind, RichMediaPanelProps } from './RichMediaPanel.types'

export type RichMediaPanelMediaState = {
  directVideoFallbackFrameRef: React.RefObject<HTMLIFrameElement | null>
  directVideoFallbackSrcDoc: string
  directVideoUsesInlinePreview: boolean
  effectiveInlineSrcDoc: string
  storyboardWidgetFrontmatterDocumentModeFromStore: boolean
  graphData: unknown
  graphDataRevision: number
  handleDirectMediaElement: (element: HTMLMediaElement | null) => void
  handleDirectVideoElement: (element: HTMLVideoElement | null) => void
  headerControlsActive: boolean
  hideUntilReady: boolean
  iframeEmbed: ReturnType<typeof resolveIframeEmbed>
  infiniteCanvasInteractionMode: string
  inlineSrcDocContentSize: { width: number; height: number } | null
  inlineSrcDocFrameRef: React.RefObject<HTMLIFrameElement | null>
  inlineSrcDocRequestsPanelScroll: boolean
  inlineSrcDocUsesViewportSize: boolean
  isStoryboardRenderer: boolean
  kind: RichMediaKind
  markdownDocumentName: string
  mediaSrc: string
  normalizedInlineSrcDoc: string
  openSafeUrl: () => void
  openUrl: string
  panel: RichMediaPanelProps['panel'] | null
  panelDisplayText: string
  panelMarkdownCommandContextText: string
  panelMarkdownDocumentPath: string
  panelSelectedTab: string
  proxiedUrl: string
  rawUrl: string
  ready: boolean
  richMediaPanelMode: string
  safeOpenUrl: string
  scheduleInlineSrcDocTimelineFrameBurst: (override?: Partial<TimelineTransportPlaybackRequestDetail>) => void
  syncInlineSrcDocTheme: () => void
  scrollOwner: 'media' | 'panel'
  setMediaSrc: React.Dispatch<React.SetStateAction<string>>
  setPanelDraftText: React.Dispatch<React.SetStateAction<string>>
  setReady: React.Dispatch<React.SetStateAction<boolean>>
  shouldForceSnapshotIframe: boolean
  title: string
  uiPanelMonospaceTextClass: string
  uiPanelTextFontClass: string
  workspaceCanvasPaneOpen: boolean
  workspaceViewMode: WorkspaceViewMode
}

export function useRichMediaPanelMediaState(props: RichMediaPanelProps): RichMediaPanelMediaState {
  const inlineSrcDocFrameRef = React.useRef<HTMLIFrameElement | null>(null)
  const directVideoFallbackFrameRef = React.useRef<HTMLIFrameElement | null>(null)
  const inlineSrcDocMessageTargetRef = React.useRef<MessageEventSource | null>(null)
  const inlineSrcDocTimelineDeliveryNowRef = React.useRef(0)
  const inlineSrcDocTimelineFrameBurstTimeoutsRef = React.useRef<number[]>([])
  const directMediaElementRef = React.useRef<HTMLMediaElement | null>(null)
  const [directMediaElement, setDirectMediaElement] = React.useState<HTMLMediaElement | null>(null)
  const title = String(props.title || '').trim() || 'Media node'
  const panelChrome = props.panelChrome === 'storyboardWidget' ? 'storyboardWidget' : 'none'
  const headerControlsActive = props.widgetToolbarActive !== false
  const declaredScrollOwner = props.scrollOwner === 'panel' ? 'panel' : 'media'
  const kind: RichMediaKind =
    props.kind === 'image'
    || props.kind === 'svg'
    || props.kind === 'video'
    || props.kind === 'audio'
    || props.kind === 'model'
      ? props.kind
      : 'iframe'
  const rawUrl = React.useMemo(() => normalizeRuntimeStorageMediaAccessUrl({
    url: props.url,
  }), [props.url])
  const openUrl = React.useMemo(() => (
    normalizeRuntimeStorageMediaAccessUrl({ url: props.openUrl }) || rawUrl
  ), [props.openUrl, rawUrl])
  const safeOpenUrl = React.useMemo(() => {
    if (!openUrl) return ''
    try {
      const base =
        typeof window !== 'undefined' && typeof window.location?.origin === 'string'
          ? window.location.origin
          : 'http://localhost'
      const nextUrl = new URL(openUrl, base)
      const protocol = String(nextUrl.protocol || '').toLowerCase()
      return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:' || protocol === 'tel:'
        ? nextUrl.toString()
        : ''
    } catch {
      return ''
    }
  }, [openUrl])
  const openSafeUrl = React.useCallback(() => {
    if (!safeOpenUrl) return
    try {
      window.open(safeOpenUrl, '_blank', 'noopener,noreferrer')
    } catch {
      void 0
    }
  }, [safeOpenUrl])
  const iframeEmbed = React.useMemo(() => (
    kind === 'iframe' ? resolveIframeEmbed({ url: rawUrl }) : null
  ), [kind, rawUrl])
  const versionedTextOutputActive = (props.panel?.outputVersions?.length || 0) > 0
  const inlineSrcDoc = React.useMemo(() => (
    versionedTextOutputActive ? '' : typeof props.srcDoc === 'string' ? props.srcDoc.trim() : ''
  ), [props.srcDoc, versionedTextOutputActive])
  const [grabMapsPoiPreviewSrcDoc, setGrabMapsPoiPreviewSrcDoc] = React.useState<string>(() => {
    const payload = readLatestGrabMapsPoiRichMediaPreview()
    if (!payload) return ''
    const targetNodeId = String(payload.targetNodeId || '').trim()
    const overlayId = String(props.overlayId || '').trim()
    return targetNodeId && overlayId && !isCanonicalNodeIdEqual(targetNodeId, overlayId)
      ? ''
      : String(payload.srcDoc || '').trim()
  })
  const [grabMapsPoiPreviewLabel, setGrabMapsPoiPreviewLabel] = React.useState<string>(() => {
    const payload = readLatestGrabMapsPoiRichMediaPreview()
    if (!payload) return ''
    const targetNodeId = String(payload.targetNodeId || '').trim()
    const overlayId = String(props.overlayId || '').trim()
    return targetNodeId && overlayId && !isCanonicalNodeIdEqual(targetNodeId, overlayId)
      ? ''
      : String(payload.label || '').trim()
  })
  React.useEffect(() => {
    const overlayId = String(props.overlayId || '').trim()
    const applyPayload = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const next = payload as { label?: unknown; srcDoc?: unknown; targetNodeId?: unknown }
      const targetNodeId = String(next.targetNodeId || '').trim()
      if (targetNodeId && overlayId && !isCanonicalNodeIdEqual(targetNodeId, overlayId)) return
      setGrabMapsPoiPreviewSrcDoc(typeof next.srcDoc === 'string' ? next.srcDoc.trim() : '')
      setGrabMapsPoiPreviewLabel(typeof next.label === 'string' ? next.label.trim() : '')
    }
    applyPayload(readLatestGrabMapsPoiRichMediaPreview())
    return subscribeGrabMapsPoiRichMediaPreview(payload => applyPayload(payload))
  }, [props.overlayId])
  const effectiveInlineSrcDoc = inlineSrcDoc || grabMapsPoiPreviewSrcDoc
  const inlineSrcDocRequestsPanelScroll = React.useMemo(() => shouldUsePanelOwnedRichMediaPanelSrcDocScroll(effectiveInlineSrcDoc), [effectiveInlineSrcDoc])
  const inlineSrcDocRequestsMediaScroll = React.useMemo(() => shouldUseMediaOwnedRichMediaPanelSrcDocScroll(effectiveInlineSrcDoc), [effectiveInlineSrcDoc])
  const inlineSrcDocUsesViewportSize = React.useMemo(() => shouldUseViewportRichMediaPanelSrcDocSize(effectiveInlineSrcDoc), [effectiveInlineSrcDoc])
  const scrollOwner = inlineSrcDocRequestsPanelScroll ? 'panel' : inlineSrcDocRequestsMediaScroll ? 'media' : declaredScrollOwner
  const normalizedInlineSrcDoc = React.useMemo(() => normalizeRichMediaPanelInlineSrcDoc({
    srcDoc: effectiveInlineSrcDoc,
    title,
    scrollOwner,
  }), [effectiveInlineSrcDoc, scrollOwner, title])
  const playableRawUrl = React.useMemo(() => resolveRichMediaPlayableUrl({
    fallbackSrcDocAvailable: kind === 'video' && !!normalizedInlineSrcDoc,
    url: rawUrl,
  }), [kind, normalizedInlineSrcDoc, rawUrl])
  const proxiedUrl = React.useMemo(() => (
    kind === 'iframe' || kind === 'model' ? rawUrl : applyImageLikeProxySrc(playableRawUrl)
  ), [kind, playableRawUrl, rawUrl])
  const [inlineSrcDocContentSize, setInlineSrcDocContentSize] = React.useState<{ width: number; height: number } | null>(null)
  React.useEffect(() => {
    setInlineSrcDocContentSize(null)
  }, [normalizedInlineSrcDoc])
  React.useEffect(() => {
    if (!normalizedInlineSrcDoc || scrollOwner !== 'panel' || (inlineSrcDocUsesViewportSize && !inlineSrcDocRequestsPanelScroll)) return
    const onMessage = (event: MessageEvent) => {
      const frame = inlineSrcDocFrameRef.current
      if (!frame || event.source !== frame.contentWindow) return
      if (!event.data || typeof event.data !== 'object') return
      const payload = event.data as { height?: unknown; type?: unknown; width?: unknown }
      if (payload.type !== RICH_MEDIA_PANEL_SRCDOC_SIZE_MESSAGE) return
      const width = typeof payload.width === 'number' && Number.isFinite(payload.width) ? Math.ceil(payload.width) : 0
      const height = typeof payload.height === 'number' && Number.isFinite(payload.height) ? Math.ceil(payload.height) : 0
      if (!(width > 0) || !(height > 0)) return
      const nextSize = { width, height }
      setInlineSrcDocContentSize(previous => (
        previous && Math.abs(previous.width - width) <= 1 && Math.abs(previous.height - height) <= 1
          ? previous
          : nextSize
      ))
      props.onInlineContentSize?.(nextSize)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [inlineSrcDocRequestsPanelScroll, inlineSrcDocUsesViewportSize, normalizedInlineSrcDoc, props.onInlineContentSize, scrollOwner])

  const panel = props.panel || null
  const panelSelectedTab = resolveRichMediaPanelSelectedTab({
    activeTab: panel ? panel.activeTab : 'auto',
    hasText: panel?.hasText === true,
    hasImage: panel?.hasImage === true,
    hasVideo: panel?.hasVideo === true,
    hasAudio: panel?.hasAudio === true,
    hasModel: panel?.hasModel === true,
    hasPoi: panel ? panel.hasPoi : Boolean(grabMapsPoiPreviewSrcDoc.trim() || grabMapsPoiPreviewLabel.trim()),
    renderKind: kind,
    hasRenderableUrl: !!rawUrl,
    hasInlineSrcDoc: !!effectiveInlineSrcDoc,
  })
  const [panelDraftText, setPanelDraftText] = React.useState('')
  React.useEffect(() => {
    if (!panel) {
      setPanelDraftText('')
      return
    }
    if (panelSelectedTab !== 'text') return
    const nextText = panel.freezeConnectedOutput ? panel.text : (panel.connectedText || panel.text)
    setPanelDraftText(previous => (previous === nextText ? previous : nextText))
  }, [panel, panelSelectedTab])
  const panelDisplayText = React.useMemo(() => {
    if (!panel || panelSelectedTab !== 'text') return ''
    return resolveRichMediaPanelDisplayText(panel, panelDraftText)
  }, [panel, panelDraftText, panelSelectedTab])
  const panelMarkdownCommandContextText = React.useMemo(() => (
    [
      kind === 'image' || kind === 'svg' ? `imageUrl: "${rawUrl}"` : '',
      kind === 'video' ? `videoUrl: "${rawUrl}"` : '',
      kind === 'model' ? `modelUrl: "${rawUrl}"` : '',
      openUrl && openUrl !== rawUrl ? `sourceUrl: "${openUrl}"` : '',
      effectiveInlineSrcDoc ? `srcDoc: "${title}"` : '',
    ].filter(Boolean).join('\n')
  ), [effectiveInlineSrcDoc, kind, openUrl, rawUrl, title])
  const panelMarkdownDocumentPath = React.useMemo(() => {
    const base = String(props.overlayId || title || 'rich-media-panel').trim() || 'rich-media-panel'
    return `/__rich_media_panel/${encodeURIComponent(base)}.md`
  }, [props.overlayId, title])
  const shouldForceSnapshotIframe = React.useMemo(() => (
    kind === 'iframe' ? shouldForceSnapshotIframeUrl(rawUrl) : false
  ), [kind, rawUrl])
  const [mediaSrc, setMediaSrc] = React.useState(proxiedUrl)
  React.useEffect(() => {
    setMediaSrc(proxiedUrl)
  }, [proxiedUrl])
  const hideUntilReady = props.hideUntilReady === true
  const {
    storyboardWidgetFrontmatterDocumentModeFromStore,
    graphData,
    graphDataRevision,
    infiniteCanvasInteractionMode,
    isStoryboardRenderer,
    markdownDocumentName,
    richMediaPanelMode,
    resolvedThemeMode,
    timelineTransportDocumentKey,
    timelineTransportPlaybackRate,
    timelineTransportPlaying,
    timelineTransportPosition,
    uiPanelMonospaceTextClass,
    uiPanelTextFontClass,
    workspaceCanvasPaneOpen,
    workspaceViewMode,
  } = useGraphStore(
    useShallow(store => ({
      storyboardWidgetFrontmatterDocumentModeFromStore: isStoryboardWidgetFrontmatterDocumentModeRequested({
        canvas2dRenderer: String(store.canvas2dRenderer || ''),
        frontmatterModeEnabled: store.frontmatterModeEnabled === true,
        documentSemanticMode: String(store.documentSemanticMode || ''),
      }),
      graphData: store.graphData,
      graphDataRevision: store.graphDataRevision || 0,
      infiniteCanvasInteractionMode: store.infiniteCanvasInteractionMode,
      isStoryboardRenderer: String(store.canvas2dRenderer || '') === 'storyboard',
      markdownDocumentName: store.markdownDocumentName || '',
      richMediaPanelMode: store.richMediaPanelMode,
      resolvedThemeMode: (store.resolvedThemeMode || 'light') as 'light' | 'dark',
      timelineTransportDocumentKey: store.timelineTransportDocumentKey || '',
      timelineTransportPlaybackRate: store.timelineTransportPlaybackRate || 1,
      timelineTransportPlaying: store.timelineTransportPlaying === true,
      timelineTransportPosition: Number.isFinite(store.timelineTransportPosition) ? store.timelineTransportPosition : 0,
      uiPanelMonospaceTextClass: store.uiPanelMonospaceTextClass || 'font-mono text-xs',
      uiPanelTextFontClass: store.uiPanelTextFontClass || 'font-sans',
      workspaceCanvasPaneOpen: store.workspaceCanvasPaneOpen,
      workspaceViewMode: store.workspaceViewMode,
    })),
  )
  const timelineDurationUnits = React.useMemo(() => resolveRichMediaTimelineDurationUnits(graphData), [graphData, graphDataRevision])
  const timelineDocumentKey = React.useMemo(() => cleanTimelinePreviewDocumentKey(markdownDocumentName), [markdownDocumentName])
  const resolveTimelineTransportFrame = React.useCallback((override?: Partial<TimelineTransportPlaybackRequestDetail>) => {
    if (!normalizedInlineSrcDoc) return null
    return buildRichMediaTimelineTransportFrame({
      localDocumentKey: timelineDocumentKey,
      transportDocumentKey: timelineTransportDocumentKey,
      transportPlaybackRate: timelineTransportPlaybackRate,
      transportPlaying: timelineTransportPlaying,
      transportPosition: timelineTransportPosition,
      override,
    })
  }, [
    normalizedInlineSrcDoc,
    timelineDocumentKey,
    timelineTransportDocumentKey,
    timelineTransportPlaybackRate,
    timelineTransportPlaying,
    timelineTransportPosition,
  ])
  const deliverTimelineFrameToSrcDocPreview = React.useCallback((
    frame: HTMLIFrameElement | null,
    payload: RichMediaTimelineTransportFrame,
  ) => {
    if (!frame) return
    try {
      const serialized = JSON.stringify(payload)
      frame.setAttribute(RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_ATTR, serialized)
    } catch {
      void 0
    }
    try {
      inlineSrcDocMessageTargetRef.current?.postMessage(payload, { targetOrigin: '*' })
    } catch {
      void 0
    }
    try {
      frame.contentWindow?.postMessage(payload, '*')
    } catch {
      void 0
    }
  }, [])
  const syncInlineSrcDocTheme = React.useCallback(() => {
    const payload = { type: RICH_MEDIA_PANEL_SRCDOC_THEME_MESSAGE, theme: resolvedThemeMode }
    try {
      inlineSrcDocMessageTargetRef.current?.postMessage(payload, { targetOrigin: '*' })
    } catch {
      void 0
    }
    for (const frame of [inlineSrcDocFrameRef.current, directVideoFallbackFrameRef.current]) {
      try {
        frame?.contentWindow?.postMessage(payload, '*')
      } catch {
        void 0
      }
    }
  }, [resolvedThemeMode])
  React.useEffect(() => {
    if (!normalizedInlineSrcDoc) return
    syncInlineSrcDocTheme()
  }, [normalizedInlineSrcDoc, syncInlineSrcDocTheme])
  const postTimelineFrameToSrcDocPreview = React.useCallback((
    frame: HTMLIFrameElement | null,
    override?: Partial<TimelineTransportPlaybackRequestDetail>,
  ) => {
    const payload = resolveTimelineTransportFrame(override)
    if (!payload) return
    publishRichMediaTimelineTransportFrame(payload)
    deliverTimelineFrameToSrcDocPreview(frame, payload)
  }, [deliverTimelineFrameToSrcDocPreview, resolveTimelineTransportFrame])
  const postInlineSrcDocTimelineFrame = React.useCallback((override?: Partial<TimelineTransportPlaybackRequestDetail>) => {
    postTimelineFrameToSrcDocPreview(inlineSrcDocFrameRef.current, override)
    postTimelineFrameToSrcDocPreview(directVideoFallbackFrameRef.current, override)
  }, [postTimelineFrameToSrcDocPreview])
  const clearInlineSrcDocTimelineFrameBurst = React.useCallback(() => {
    inlineSrcDocTimelineFrameBurstTimeoutsRef.current.forEach(timeoutId => window.clearTimeout(timeoutId))
    inlineSrcDocTimelineFrameBurstTimeoutsRef.current = []
  }, [])
  const scheduleInlineSrcDocTimelineFrameBurst = React.useCallback((override?: Partial<TimelineTransportPlaybackRequestDetail>) => {
    if (typeof window === 'undefined') return
    clearInlineSrcDocTimelineFrameBurst()
    postInlineSrcDocTimelineFrame(override)
    inlineSrcDocTimelineFrameBurstTimeoutsRef.current = [50, 150, 350, 750, 1200].map(delayMs => (
      window.setTimeout(() => postInlineSrcDocTimelineFrame(override), delayMs)
    ))
  }, [clearInlineSrcDocTimelineFrameBurst, postInlineSrcDocTimelineFrame])
  React.useEffect(() => () => clearInlineSrcDocTimelineFrameBurst(), [clearInlineSrcDocTimelineFrameBurst])
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const handleTimelineFrame = (event: Event) => {
      const payload = (event as CustomEvent<RichMediaTimelineTransportFrame>).detail
      if (!payload || payload.type !== 'agenticgraph:timeline-transport-frame') return
      if (payload.playing) {
        const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now()
        if (now - inlineSrcDocTimelineDeliveryNowRef.current < 70) return
        inlineSrcDocTimelineDeliveryNowRef.current = now
      }
      deliverTimelineFrameToSrcDocPreview(inlineSrcDocFrameRef.current, payload)
      deliverTimelineFrameToSrcDocPreview(directVideoFallbackFrameRef.current, payload)
    }
    window.addEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, handleTimelineFrame)
    return () => window.removeEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, handleTimelineFrame)
  }, [deliverTimelineFrameToSrcDocPreview])
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const handleSrcDocReady = (event: MessageEvent) => {
      const payload = event.data as { type?: unknown } | null
      if (!payload || payload.type !== RICH_MEDIA_TIMELINE_TRANSPORT_READY_MESSAGE) return
      inlineSrcDocMessageTargetRef.current = event.source
      syncInlineSrcDocTheme()
    }
    window.addEventListener('message', handleSrcDocReady)
    return () => window.removeEventListener('message', handleSrcDocReady)
  }, [syncInlineSrcDocTheme])
  const handleDirectMediaElement = React.useCallback((element: HTMLMediaElement | null) => {
    directMediaElementRef.current = element
    setDirectMediaElement(previous => (previous === element ? previous : element))
    props.onMediaElement?.(element)
  }, [props.onMediaElement])
  const handleDirectVideoElement = React.useCallback((element: HTMLVideoElement | null) => {
    props.onVideoElement?.(element)
  }, [props.onVideoElement])
  const syncDirectMediaElementToTimeline = React.useCallback((
    media: HTMLMediaElement,
    override?: Partial<TimelineTransportPlaybackRequestDetail>,
  ) => {
    if (kind !== 'video' && kind !== 'audio') return
    const documentKey = cleanTimelinePreviewDocumentKey(override?.documentKey || timelineTransportDocumentKey)
    if (!timelineDocumentKey || documentKey !== timelineDocumentKey) return
    const positionSource = typeof override?.position === 'number' ? override.position : timelineTransportPosition
    const playing = typeof override?.playing === 'boolean' ? override.playing : timelineTransportPlaying
    const playbackRateSource = typeof override?.playbackRate === 'number' ? override.playbackRate : timelineTransportPlaybackRate
    const playbackRate = Number.isFinite(playbackRateSource) && playbackRateSource > 0 ? playbackRateSource : 1
    const mediaDuration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0
    const targetSecondsRaw = resolveRichMediaTimelineMediaTargetSeconds({
      mediaDurationSeconds: mediaDuration,
      positionUnits: positionSource,
      timelineDurationUnits,
    })
    const targetSeconds = media.duration > 0 ? Math.min(media.duration, targetSecondsRaw) : targetSecondsRaw
    if (!playing || Math.abs((Number.isFinite(media.currentTime) ? media.currentTime : 0) - targetSeconds) > 0.18) {
      try {
        media.currentTime = targetSeconds
      } catch {
        void 0
      }
    }
    if (media.playbackRate !== playbackRate) media.playbackRate = playbackRate
    if (playing) {
      if (media.paused) {
        try {
          const nextPlay = media.play()
          if (nextPlay && typeof nextPlay.catch === 'function') nextPlay.catch(() => undefined)
        } catch {
          void 0
        }
      }
      return
    }
    if (!media.paused) {
      try {
        media.pause()
      } catch {
        void 0
      }
    }
  }, [
    kind,
    timelineDocumentKey,
    timelineDurationUnits,
    timelineTransportDocumentKey,
    timelineTransportPlaybackRate,
    timelineTransportPlaying,
    timelineTransportPosition,
  ])
  React.useEffect(() => {
    if (kind !== 'video' && kind !== 'audio') return
    const media = directMediaElement || directMediaElementRef.current
    if (!media) return
    const sync = () => syncDirectMediaElementToTimeline(media)
    sync()
    media.addEventListener('loadedmetadata', sync)
    media.addEventListener('durationchange', sync)
    return () => {
      media.removeEventListener('loadedmetadata', sync)
      media.removeEventListener('durationchange', sync)
    }
  }, [directMediaElement, kind, syncDirectMediaElementToTimeline])
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const handlePlaybackRequest = (event: Event) => {
      const detail = (event as CustomEvent<TimelineTransportPlaybackRequestDetail>).detail
      if (!detail || cleanTimelinePreviewDocumentKey(detail.documentKey) !== timelineDocumentKey) return
      if (detail.playing) postInlineSrcDocTimelineFrame(detail)
      else scheduleInlineSrcDocTimelineFrameBurst(detail)
      if (directMediaElementRef.current) syncDirectMediaElementToTimeline(directMediaElementRef.current, detail)
    }
    window.addEventListener(TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT, handlePlaybackRequest)
    return () => window.removeEventListener(TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT, handlePlaybackRequest)
  }, [
    postInlineSrcDocTimelineFrame,
    scheduleInlineSrcDocTimelineFrameBurst,
    syncDirectMediaElementToTimeline,
    timelineDocumentKey,
  ])
  const [ready, setReady] = React.useState<boolean>(() => !hideUntilReady)
  React.useEffect(() => {
    setReady(!hideUntilReady)
  }, [hideUntilReady, proxiedUrl, kind])
  const directVideoFallbackSrcDoc = kind === 'video' ? normalizedInlineSrcDoc : ''
  const directVideoUsesInlinePreview = kind === 'video' && !!directVideoFallbackSrcDoc
  void panelChrome

  return {
    directVideoFallbackFrameRef,
    directVideoFallbackSrcDoc,
    directVideoUsesInlinePreview,
    effectiveInlineSrcDoc,
    storyboardWidgetFrontmatterDocumentModeFromStore,
    graphData,
    graphDataRevision,
    handleDirectMediaElement,
    handleDirectVideoElement,
    headerControlsActive,
    hideUntilReady,
    iframeEmbed,
    infiniteCanvasInteractionMode,
    inlineSrcDocContentSize,
    inlineSrcDocFrameRef,
    inlineSrcDocRequestsPanelScroll,
    inlineSrcDocUsesViewportSize,
    isStoryboardRenderer,
    kind,
    markdownDocumentName,
    mediaSrc,
    normalizedInlineSrcDoc,
    openSafeUrl,
    openUrl,
    panel,
    panelDisplayText,
    panelMarkdownCommandContextText,
    panelMarkdownDocumentPath,
    panelSelectedTab,
    proxiedUrl,
    rawUrl,
    ready,
    richMediaPanelMode,
    safeOpenUrl,
    scheduleInlineSrcDocTimelineFrameBurst,
    scrollOwner,
    setMediaSrc,
    setPanelDraftText,
    setReady,
    syncInlineSrcDocTheme,
    shouldForceSnapshotIframe,
    title,
    uiPanelMonospaceTextClass,
    uiPanelTextFontClass,
    workspaceCanvasPaneOpen,
    workspaceViewMode,
  }
}
