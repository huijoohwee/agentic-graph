import React from 'react'
import { resolveMediaPreviewSurfaceCardProps, resolveMediaPreviewSurfaceSelectionProps } from '@/lib/cards/mediaPreviewSurfaceSelection'
import {
  isDirectPlayableCardMedia,
  type CardMediaPlaceholderVariant,
  type CardMediaSkeletonVariant,
} from '@/lib/cards/cardMediaPreviewUtils'
import { isWorkspaceEditorOverlayOpen } from '@/features/workspace-table/workspaceTableSsot'
import {
  readOverlayPointerTargetState,
  shouldBlockOverlayPanTarget,
} from 'grph-shared/dom/overlayPointerGuards'
import {
  MEDIA_IMAGE_FORMAT_PREFERENCE_ATTR,
  MEDIA_VIDEO_FORMAT_PREFERENCE_ATTR,
} from '@/lib/media/mediaFormatPreference'
import {
  PANEL_FRAME_BODY_STYLE,
  PANEL_FRAME_ROOT_STYLE,
} from '@/lib/ui/panelFrame'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readCanvasAspectRatioWidthToHeight } from '@/lib/canvas/canvasAspectRatioDisplayControls'
import { getStoryboardWidgetPanelSurfaceChromeClassName } from '@/components/StoryboardWidget/storyboardWidgetPanelChromeClassName'
import { handleRichMediaPanelOverlayDragStartCapture, handleRichMediaPanelOverlayNativeDragStartCapture, installRichMediaOverlayWheelForwarding, startRichMediaPanelHeaderDrag } from './RichMediaPanelOverlayDrag'
import { beginRichMediaPanelResizeDrag } from './RichMediaPanelResizeHandle'
import type { RichMediaPanelProps } from './RichMediaPanel.types'
import type { RichMediaPanelMediaState } from './useRichMediaPanelMediaState'

const isPointerLikeEvent = (event: unknown): event is PointerEvent => {
  if (!event || typeof event !== 'object') return false
  if (typeof PointerEvent !== 'undefined' && event instanceof PointerEvent) return true
  const candidate = event as {
    clientX?: unknown
    clientY?: unknown
    pointerId?: unknown
    pointerType?: unknown
  }
  return Number.isFinite(candidate.clientX)
    && Number.isFinite(candidate.clientY)
    && Number.isFinite(candidate.pointerId)
    && typeof candidate.pointerType === 'string'
}

export type RichMediaPanelSurfaceState = {
  allowClickToOpenOverlay: boolean
  allowPanelContentPointerEvents: boolean
  bodySurfaceStyle: React.CSSProperties
  buildDirectMediaStyle: (display: 'block' | 'flex', background: string) => React.CSSProperties
  canvasOverlayProxyEnabled: boolean
  chromeBodySurfaceStyle: React.CSSProperties
  contentInteractive: boolean
  directMediaPreviewCardProps: ReturnType<typeof resolveMediaPreviewSurfaceCardProps>
  directMediaPreviewSelectionProps: ReturnType<typeof resolveMediaPreviewSurfaceSelectionProps>
  directMediaZoomContentSize: { w: number; h: number }
  expectedEmptyPlaceholderVariant: CardMediaPlaceholderVariant
  fallbackToRawSrc: () => boolean
  storyboardWidgetFrontmatterDocumentMode: boolean
  storyboardWidgetInteractionMode: boolean
  storyboardWidgetRichMediaOverlayRoot: boolean
  forwardingEnabled: boolean
  handleRootMouseDownCapture: React.MouseEventHandler<HTMLElement>
  handleRootPointerDownCapture: React.PointerEventHandler<HTMLElement>
  iframeSurfaceStyle: React.CSSProperties
  inlineSrcDocEmbeddedSurfaceStyle: React.CSSProperties
  inlineSrcDocPanelContentHeight: number
  inlineSrcDocSurfaceStyle: React.CSSProperties
  installResize: boolean
  isEmptyPanel: boolean
  isSnapshotIframe: boolean
  loadingSkeletonVariant: CardMediaSkeletonVariant
  onResizePointerDown: React.PointerEventHandler<HTMLButtonElement>
  panelIsLoading: boolean
  panelLoadingLabel: string
  panelOwnsInlineSrcDocScroll: boolean
  preferEmbed: boolean
  resizeHandlePlacement: 'root' | 'external'
  resizeHandleVisible: boolean
  rootAttributes: Record<string, string | undefined>
  rootClassName: string
  rootRef: React.RefCallback<HTMLElement>
  rootStyle: React.CSSProperties
  showStoryboardWidgetChrome: boolean
  panelTextEditable: boolean
  showPanelTextSurface: boolean
  shouldHideSurfaceUntilReady: boolean
  useSurfaceFrame: boolean
}

export function useRichMediaPanelSurfaceState(
  props: RichMediaPanelProps,
  ref: React.ForwardedRef<HTMLElement>,
  mediaState: RichMediaPanelMediaState,
): RichMediaPanelSurfaceState {
  const rootElementRef = React.useRef<HTMLElement | null>(null)
  const lastPointerDownAtRef = React.useRef(0)
  const strybldrStoryboardCardAspectMode = useGraphStore(s => s.strybldrStoryboardCardAspectMode)
  const panelChrome = props.panelChrome === 'storyboardWidget' ? 'storyboardWidget' : 'none'
  const showStoryboardWidgetChrome = panelChrome === 'storyboardWidget'
  const frameMode = props.frameMode === 'surface' ? 'surface' : 'panel'
  const useSurfaceFrame = frameMode === 'surface' && !showStoryboardWidgetChrome
  const resizeHandlePlacement = props.resizeHandlePlacement === 'external' ? 'external' : 'root'
  const headerPassthrough = props.headerPassthrough === true
  const storyboardWidgetFrontmatterDocumentMode =
    props.storyboardWidgetFrontmatterDocumentMode === true || mediaState.storyboardWidgetFrontmatterDocumentModeFromStore
  const storyboardWidgetOverlayProxyMode = props.storyboardWidgetInteractionMode === true
  const storyboardWidgetInteractionMode = storyboardWidgetOverlayProxyMode || storyboardWidgetFrontmatterDocumentMode
  const panelTextEditable = Boolean(
    mediaState.panel
    && mediaState.panelSelectedTab === 'text'
    && typeof props.onPanelChange === 'function',
  )
  const showPanelTextSurface = Boolean(
    mediaState.panel
    && mediaState.panelSelectedTab === 'text'
    && !mediaState.effectiveInlineSrcDoc
    && (panelTextEditable || mediaState.panelDisplayText.trim()),
  )
  const hasDirectRenderableUrl = Boolean(mediaState.rawUrl)
  const isTextPanelEmpty =
    mediaState.kind === 'iframe'
    && !hasDirectRenderableUrl
    && !mediaState.effectiveInlineSrcDoc
    && !showPanelTextSurface
  const isStaticMediaPanelEmpty =
    (mediaState.kind === 'image' || mediaState.kind === 'svg' || mediaState.kind === 'video' || mediaState.kind === 'audio')
    && !hasDirectRenderableUrl
  const isEmptyPanel = isTextPanelEmpty || isStaticMediaPanelEmpty
  const workspaceEditorOverlayOpen = isWorkspaceEditorOverlayOpen({
    workspaceViewMode: mediaState.workspaceViewMode,
    workspaceCanvasPaneOpen: mediaState.workspaceCanvasPaneOpen,
  })
  const allowPanelContentPointerEvents =
    !workspaceEditorOverlayOpen || storyboardWidgetInteractionMode === true || mediaState.isStoryboardRenderer === true
  const allowEmbedFromStore =
    mediaState.richMediaPanelMode === 'embed' || mediaState.infiniteCanvasInteractionMode === 'interactive'
  const preferEmbed = allowEmbedFromStore && props.interactive !== false
  const playableCardMedia = isDirectPlayableCardMedia({ kind: mediaState.kind, url: mediaState.rawUrl }) && props.interactive !== false
  const installWheelForwarding =
    typeof props.forwardWheelTo === 'function'
    && (
      props.forwardWheelBeforeScrollableTarget === true
      || !preferEmbed
      || storyboardWidgetFrontmatterDocumentMode === true
    )
  const forwardModifierWheelZoomOnly = installWheelForwarding && storyboardWidgetFrontmatterDocumentMode === true
  const forwardingEnabled =
    !playableCardMedia
    && !preferEmbed
    && storyboardWidgetFrontmatterDocumentMode !== true
    && (typeof props.forwardWheelTo === 'function' || typeof props.forwardPointerTo === 'function')
  React.useEffect(() => {
    if (!mediaState.hideUntilReady || mediaState.ready) return
    const timeoutId = window.setTimeout(() => mediaState.setReady(true), 1400)
    return () => window.clearTimeout(timeoutId)
  }, [mediaState.hideUntilReady, mediaState.kind, mediaState.proxiedUrl, mediaState.ready, mediaState.setReady])
  React.useEffect(() => {
    if (isEmptyPanel) mediaState.setReady(true)
  }, [isEmptyPanel, mediaState.setReady])
  const installOverlayPan = Boolean(props.onOverlayPanStart || props.onOverlayPan || props.onOverlayPanEnd)
  const installHeaderDrag = Boolean(props.onHeaderDragStart || props.onHeaderDrag || props.onHeaderDragEnd)
  const installResize =
    props.resizable === true && Boolean(props.onResizeStart || props.onResize || props.onResizeEnd)
  const resizeHandleVisible = props.resizeHandleVisible === true || installResize
  const canvasOverlayProxyEnabled = installOverlayPan || installHeaderDrag || typeof props.forwardWheelTo === 'function'
  const storyboardWidgetRichMediaOverlayRoot = storyboardWidgetInteractionMode || canvasOverlayProxyEnabled
  const fallbackToRawSrc = React.useCallback(() => {
    if (!mediaState.rawUrl || mediaState.rawUrl === mediaState.mediaSrc) return false
    mediaState.setMediaSrc(mediaState.rawUrl)
    return true
  }, [mediaState.mediaSrc, mediaState.rawUrl, mediaState.setMediaSrc])
  const isSnapshotIframe =
    mediaState.kind === 'iframe'
    && !!(mediaState.iframeEmbed && !mediaState.iframeEmbed.direct)
    && (!preferEmbed || mediaState.shouldForceSnapshotIframe)
  const contentInteractive =
    (preferEmbed
      || playableCardMedia
      || (props.interactive !== false && !isSnapshotIframe && mediaState.kind !== 'image' && mediaState.kind !== 'svg'))
    && (!mediaState.hideUntilReady || mediaState.ready)
  const canClickToOpen =
    !headerPassthrough
    && mediaState.kind !== 'video'
    && mediaState.kind !== 'audio'
    && mediaState.kind !== 'image'
    && mediaState.kind !== 'svg'
    && !contentInteractive
    && !!mediaState.safeOpenUrl
  const allowClickToOpenOverlay = canClickToOpen && !workspaceEditorOverlayOpen
  const rootRef = React.useCallback((element: HTMLElement | null) => {
    rootElementRef.current = element
    if (element && props.placementOwner === 'parent') {
      element.style.position = 'relative'
      element.style.left = '0px'
      element.style.top = '0px'
      element.style.width = '100%'
      element.style.height = '100%'
      element.style.transform = 'none'
      ;(element.style as CSSStyleDeclaration & { zoom: string }).zoom = '1'
    }
    if (typeof ref === 'function') {
      ref(element)
      return
    }
    if (ref && typeof ref === 'object') {
      try {
        ref.current = element
      } catch {
        void 0
      }
    }
  }, [props.placementOwner, ref])
  React.useEffect(() => {
    const element = rootElementRef.current
    if (!element) return
    return installRichMediaOverlayWheelForwarding(element, {
      forwardWheelBeforeScrollableTarget: props.forwardWheelBeforeScrollableTarget === true,
      forwardWheelTo: installWheelForwarding ? props.forwardWheelTo : undefined,
      forwardedFlagKey: '__kgForwarded',
      shouldForwardWheel: forwardModifierWheelZoomOnly ? event => event.ctrlKey === true || event.metaKey === true : undefined,
      stopPropagationOnForward: true,
      stopPropagationOnPreventZoom: false,
    })
  }, [forwardModifierWheelZoomOnly, installWheelForwarding, props.forwardWheelBeforeScrollableTarget, props.forwardWheelTo])
  const selectSelf = React.useCallback((native: PointerEvent | null) => {
    if (!storyboardWidgetInteractionMode) return
    const id = String(props.overlayId || '').trim()
    if (!id || (native && native.button !== 0)) return
    try {
      const store = useGraphStore.getState() as {
        selectEdge?: (id: string | null) => void
        selectNode?: (id: string | null) => void
        setSelectionSource?: (source: string) => void
      }
      store.setSelectionSource?.('canvas')
      store.selectEdge?.(null)
      store.selectNode?.(id)
    } catch {
      void 0
    }
  }, [storyboardWidgetInteractionMode, props.overlayId])
  const onResizePointerDown = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!installResize) return
    beginRichMediaPanelResizeDrag({
      event,
      onBeforeStart: selectSelf,
      onResizeStart: props.onResizeStart,
      onResize: props.onResize,
      onResizeEnd: props.onResizeEnd,
    })
  }, [installResize, props.onResize, props.onResizeEnd, props.onResizeStart, selectSelf])
  const startHeaderDrag = React.useCallback((native: PointerEvent | MouseEvent, target?: Element | null) => {
    if (!installHeaderDrag) return false
    selectSelf(native as PointerEvent)
    return startRichMediaPanelHeaderDrag(native, props, target)
  }, [installHeaderDrag, props, selectSelf])
  const handleRootDragStartCapture = React.useCallback((event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
    const targetEl = event.target instanceof Element ? event.target : null
    if (targetEl?.closest('[data-kg-rich-media-resize-handle="1"]')) return false
    const isHeaderTarget = !!targetEl?.closest('[data-kg-rich-media-storyboard-widget-header="1"]')
    const pointerTarget = readOverlayPointerTargetState(targetEl)
    const scrollSurfaceCanForwardPointer = forwardModifierWheelZoomOnly || props.forwardWheelBeforeScrollableTarget === true
    const nativePointerEvent = event.nativeEvent as PointerEvent | undefined
    if (!isHeaderTarget && pointerTarget.isSelectableSurface && !installOverlayPan) {
      selectSelf(nativePointerEvent || null)
      return false
    }
    const canForwardPointerDown =
      typeof props.forwardPointerTo === 'function'
      && typeof props.shouldForwardPointerDown === 'function'
      && isPointerLikeEvent(nativePointerEvent)
      && props.shouldForwardPointerDown(nativePointerEvent)
    if (!isHeaderTarget && shouldBlockOverlayPanTarget(pointerTarget, { scrollSurfaceCanForwardPointer }) && !canForwardPointerDown) {
      return false
    }
    return handleRichMediaPanelOverlayDragStartCapture({
      event,
      handlers: props,
      installHeaderDrag,
      installOverlayPan,
      selectSelf,
      startHeaderDrag,
    })
  }, [forwardModifierWheelZoomOnly, installHeaderDrag, installOverlayPan, props, selectSelf, startHeaderDrag])
  React.useEffect(() => {
    const root = rootElementRef.current
    if (!root || (!installHeaderDrag && !installOverlayPan)) return
    const handleNativeStart = (native: PointerEvent | MouseEvent) => {
      const targetEl = native.target instanceof Element ? native.target : null
      if (targetEl?.closest('[data-kg-rich-media-resize-handle="1"]')) return
      const pointerTarget = readOverlayPointerTargetState(targetEl)
      const scrollSurfaceCanForwardPointer = forwardModifierWheelZoomOnly || props.forwardWheelBeforeScrollableTarget === true
      const canForwardPointerDown =
        typeof props.forwardPointerTo === 'function'
        && typeof props.shouldForwardPointerDown === 'function'
        && isPointerLikeEvent(native)
        && props.shouldForwardPointerDown(native)
      if (!pointerTarget.isHeader && shouldBlockOverlayPanTarget(pointerTarget, { scrollSurfaceCanForwardPointer }) && !canForwardPointerDown) return
      handleRichMediaPanelOverlayNativeDragStartCapture({
        native,
        currentTarget: root,
        handlers: props,
        installHeaderDrag,
        installOverlayPan,
        selectSelf,
        startHeaderDrag,
      })
    }
    root.addEventListener('pointerdown', handleNativeStart, { capture: true })
    root.addEventListener('mousedown', handleNativeStart, { capture: true })
    return () => {
      root.removeEventListener('pointerdown', handleNativeStart, { capture: true })
      root.removeEventListener('mousedown', handleNativeStart, { capture: true })
    }
  }, [forwardModifierWheelZoomOnly, installHeaderDrag, installOverlayPan, props, selectSelf, startHeaderDrag])
  const handleRootPointerDownCapture = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    props.onPointerDownCapture?.(event)
    const handled = handleRootDragStartCapture(event)
    if (!handled) return
    lastPointerDownAtRef.current = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
  }, [handleRootDragStartCapture, props])
  const handleRootMouseDownCapture = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
    if (now - lastPointerDownAtRef.current < 400) return
    handleRootDragStartCapture(event)
  }, [handleRootDragStartCapture])
  const panelIsLoading = mediaState.panel?.isLoading === true
  const panelLoadingLabel = String(mediaState.panel?.loadingLabel || '').trim() || 'Generating output...'
  const loadingSkeletonVariant: CardMediaSkeletonVariant =
    mediaState.panelSelectedTab === 'text'
      ? 'text'
      : (mediaState.kind === 'image' || mediaState.kind === 'video' || mediaState.kind === 'audio' ? mediaState.kind : 'iframe')
  const expectedEmptyPlaceholderVariant: CardMediaPlaceholderVariant =
    mediaState.panelSelectedTab === 'text'
    || mediaState.panelSelectedTab === 'image'
    || mediaState.panelSelectedTab === 'video'
    || mediaState.panelSelectedTab === 'audio'
      ? mediaState.panelSelectedTab
      : mediaState.kind === 'audio'
        ? 'audio'
        : mediaState.panel?.hasImage && !mediaState.panel.hasText && !mediaState.panel.hasVideo && !mediaState.panel.hasAudio
          ? 'image'
          : mediaState.panel?.hasVideo && !mediaState.panel.hasText && !mediaState.panel.hasImage && !mediaState.panel.hasAudio
            ? 'video'
            : mediaState.panel?.hasAudio && !mediaState.panel.hasText && !mediaState.panel.hasImage && !mediaState.panel.hasVideo
              ? 'audio'
              : mediaState.panel?.hasText && !mediaState.panel.hasImage && !mediaState.panel.hasVideo && !mediaState.panel.hasAudio
                ? 'text'
                : 'undefined'
  const shouldHideSurfaceUntilReady = mediaState.hideUntilReady && !mediaState.ready && !isEmptyPanel && !panelIsLoading
  const panelOwnsInlineSrcDocScroll =
    useSurfaceFrame
    && mediaState.scrollOwner === 'panel'
    && mediaState.kind === 'iframe'
    && !!mediaState.effectiveInlineSrcDoc
    && (!mediaState.inlineSrcDocUsesViewportSize || mediaState.inlineSrcDocRequestsPanelScroll)
  const inlineSrcDocPanelContentHeight =
    panelOwnsInlineSrcDocScroll && mediaState.inlineSrcDocContentSize && mediaState.inlineSrcDocContentSize.height > 0
      ? Math.ceil(mediaState.inlineSrcDocContentSize.height)
      : 0
  const inlineSrcDocPanelContentHeightCss = inlineSrcDocPanelContentHeight > 0 ? `${inlineSrcDocPanelContentHeight}px` : ''
  const rootStyle: React.CSSProperties = {
    ...PANEL_FRAME_ROOT_STYLE,
    position: useSurfaceFrame || panelOwnsInlineSrcDocScroll ? 'relative' : (storyboardWidgetInteractionMode ? 'absolute' : 'relative'),
    ...(showStoryboardWidgetChrome ? { borderRadius: undefined, boxShadow: undefined } : null),
    ...(useSurfaceFrame
      ? {
          background: 'transparent',
          border: 0,
          borderRadius: 0,
          boxShadow: 'none',
          overflow: panelOwnsInlineSrcDocScroll ? 'visible' : undefined,
        }
      : null),
    opacity: shouldHideSurfaceUntilReady ? 0 : 1,
    pointerEvents: shouldHideSurfaceUntilReady
      ? 'none'
      : headerPassthrough
        ? 'none'
        : workspaceEditorOverlayOpen || canvasOverlayProxyEnabled
          ? 'auto'
          : (contentInteractive || canClickToOpen ? 'auto' : 'none'),
    transition: 'opacity 180ms ease-out',
    ...(props.style || null),
    ...(inlineSrcDocPanelContentHeight > 0 ? { height: inlineSrcDocPanelContentHeightCss, minHeight: '100%' } : null),
    ...(props.placementOwner === 'parent'
      ? { position: 'relative', left: 0, top: 0, width: '100%', height: '100%', transform: 'none', zoom: 1 }
      : null),
  }
  const bodySurfaceStyle: React.CSSProperties = {
    ...PANEL_FRAME_BODY_STYLE,
    overflow: panelOwnsInlineSrcDocScroll ? 'visible' : undefined,
    padding: 0,
    pointerEvents: headerPassthrough ? (contentInteractive ? 'auto' : 'none') : undefined,
    position: useSurfaceFrame || panelOwnsInlineSrcDocScroll ? 'relative' : (storyboardWidgetInteractionMode ? 'absolute' : 'relative'),
  }
  const chromeBodySurfaceStyle: React.CSSProperties = {
    ...PANEL_FRAME_BODY_STYLE,
    flex: '1 1 0%',
    minHeight: 0,
    overflow: 'hidden',
    padding: 'var(--kg-media-panel-padding, 6px)',
    pointerEvents: headerPassthrough ? (contentInteractive ? 'auto' : 'none') : undefined,
    position: 'relative',
  }
  const iframeSurfaceStyle = React.useMemo<React.CSSProperties>(() => ({
    background: 'transparent',
    border: 0,
    borderRadius: 'calc(var(--kg-media-panel-radius, 10px) * 0.8)',
    display: 'block',
    height: '100%',
    pointerEvents: allowPanelContentPointerEvents ? (forwardingEnabled ? 'none' : undefined) : 'none',
    touchAction: 'auto',
    width: '100%',
  }), [allowPanelContentPointerEvents, forwardingEnabled])
  const buildDirectMediaStyle = React.useCallback((display: 'block' | 'flex', background: string): React.CSSProperties => ({
    background,
    border: 0,
    borderRadius: 'calc(var(--kg-media-panel-radius, 10px) * 0.8)',
    display,
    height: '100%',
    pointerEvents: allowPanelContentPointerEvents ? (forwardingEnabled ? 'none' : undefined) : 'none',
    position: 'relative',
    width: '100%',
  }), [allowPanelContentPointerEvents, forwardingEnabled])
  const inlineSrcDocSurfaceStyle = React.useMemo<React.CSSProperties>(() => ({
    ...iframeSurfaceStyle,
    ...(inlineSrcDocPanelContentHeight > 0 ? { height: `${inlineSrcDocPanelContentHeight}px`, minHeight: '100%' } : null),
    ...(panelOwnsInlineSrcDocScroll ? { pointerEvents: 'none', touchAction: 'pan-y' } : null),
    borderRadius: 0,
  }), [iframeSurfaceStyle, inlineSrcDocPanelContentHeight, panelOwnsInlineSrcDocScroll])
  const inlineSrcDocEmbeddedSurfaceStyle = React.useMemo<React.CSSProperties>(() => ({
    boxSizing: 'border-box',
    borderRadius: 'calc(var(--kg-media-panel-radius, 10px) * 0.8)',
    display: 'block',
    height: '100%',
    maxWidth: '100%',
    minHeight: '100%',
    overflow: 'hidden',
    pointerEvents: 'auto',
    touchAction: panelOwnsInlineSrcDocScroll ? 'pan-y' : 'auto',
    width: '100%',
    ...(inlineSrcDocPanelContentHeight > 0 ? { height: inlineSrcDocPanelContentHeightCss, minHeight: '100%' } : null),
  }), [inlineSrcDocPanelContentHeight, inlineSrcDocPanelContentHeightCss, panelOwnsInlineSrcDocScroll])
  const directMediaZoomContentSize = React.useMemo(() => {
    const ratio = readCanvasAspectRatioWidthToHeight(strybldrStoryboardCardAspectMode)
    return ratio >= 1 ? { h: 1, w: ratio } : { h: 1 / ratio, w: 1 }
  }, [strybldrStoryboardCardAspectMode])
  const directMediaPreviewUsesCollectivePan =
    storyboardWidgetInteractionMode && props.headerPinned === true && !installHeaderDrag && !installOverlayPan
  const canvasOverlayPanOwnedByCollective =
    directMediaPreviewUsesCollectivePan
    || storyboardWidgetInteractionMode
  const directMediaPreviewClaimsPointerDown = !installOverlayPan && !directMediaPreviewUsesCollectivePan
  const directMediaPreviewMarksSelectableSurface = !directMediaPreviewUsesCollectivePan
  const directMediaPreviewSelectionProps = React.useMemo(() => resolveMediaPreviewSurfaceSelectionProps({
    ariaLabel: `${mediaState.title} media preview`,
    claimPointerDown: directMediaPreviewClaimsPointerDown,
    selectableSurface: directMediaPreviewMarksSelectableSurface,
    enabled: mediaState.kind === 'image' || mediaState.kind === 'svg' || mediaState.kind === 'video' || mediaState.kind === 'audio',
    onSelect: event => selectSelf(event.nativeEvent as PointerEvent),
  }), [directMediaPreviewClaimsPointerDown, directMediaPreviewMarksSelectableSurface, mediaState.kind, mediaState.title, selectSelf])
  const directMediaPreviewCardProps = React.useMemo(() => resolveMediaPreviewSurfaceCardProps({
    enabled: mediaState.kind === 'image' || mediaState.kind === 'svg' || mediaState.kind === 'video' || mediaState.kind === 'audio',
    interactive: false,
    selectableSurface: directMediaPreviewMarksSelectableSurface,
  }), [directMediaPreviewMarksSelectableSurface, mediaState.kind])
  const rootClassName = [
    'kg-media',
    'kg-mediaBody',
    showStoryboardWidgetChrome ? getStoryboardWidgetPanelSurfaceChromeClassName({
      className: props.className,
      panelTextClass: mediaState.uiPanelTextFontClass,
      selected: props.selected === true,
    }) : props.className || '',
  ].filter(Boolean).join(' ')
  const rootAttributes = {
    'aria-label': mediaState.title,
    role: 'group',
    'data-kg-canvas-overlay-drag-handle': installHeaderDrag ? 'true' : undefined,
    'data-kg-canvas-overlay-pinned': canvasOverlayProxyEnabled ? (props.canvasOverlayPinned === false ? '0' : '1') : undefined,
    'data-kg-canvas-wheel-ignore': canvasOverlayProxyEnabled ? 'true' : undefined,
    'data-kg-overlay-placement-owner': props.placementOwner === 'parent' ? 'parent' : undefined,
    'data-kg-overlay-pan-owner': canvasOverlayPanOwnedByCollective ? 'canvas' : undefined,
    'data-kg-storyboard-widget-mode': storyboardWidgetInteractionMode ? '1' : undefined,
    'data-kg-storyboard-widget-surface': storyboardWidgetInteractionMode ? (props.storyboardWidgetSurfaceId || undefined) : undefined,
    'data-kg-storyboard-widget-selected': showStoryboardWidgetChrome && props.selected === true ? '1' : undefined,
    'data-kg-frontmatter-document-mode': storyboardWidgetFrontmatterDocumentMode ? '1' : undefined,
    'data-kg-rich-media-header-pinned': typeof props.headerPinned === 'boolean' ? (props.headerPinned ? '1' : '0') : undefined,
    'data-kg-kind': mediaState.kind,
    'data-kg-open-url': mediaState.openUrl,
    'data-kg-resize-enabled': installResize ? '1' : undefined,
    'data-kg-rich-media-storyboard-widget-chrome': showStoryboardWidgetChrome ? '1' : undefined,
    'data-kg-rich-media-frame-mode': useSurfaceFrame ? 'surface' : undefined,
    'data-kg-rich-media-image-format-preference': MEDIA_IMAGE_FORMAT_PREFERENCE_ATTR,
    'data-kg-rich-media-overlay': storyboardWidgetRichMediaOverlayRoot && props.placementOwner !== 'parent' ? '1' : undefined,
    'data-kg-rich-media-panel': '1',
    'data-kg-rich-media-selectable-surface': '1',
    'data-kg-rich-media-render-surface': '1',
    'data-kg-rich-media-shared-pan-drag-zoom': mediaState.kind === 'image' || mediaState.kind === 'svg' || mediaState.kind === 'video' ? '1' : undefined,
    'data-kg-rich-media-video-format-preference': MEDIA_VIDEO_FORMAT_PREFERENCE_ATTR,
    'data-kg-url': mediaState.rawUrl,
    'data-node-id': props.overlayId,
  }

  return {
    allowClickToOpenOverlay,
    allowPanelContentPointerEvents,
    bodySurfaceStyle,
    buildDirectMediaStyle,
    canvasOverlayProxyEnabled,
    chromeBodySurfaceStyle,
    contentInteractive,
    directMediaPreviewCardProps,
    directMediaPreviewSelectionProps,
    directMediaZoomContentSize,
    expectedEmptyPlaceholderVariant,
    fallbackToRawSrc,
    storyboardWidgetFrontmatterDocumentMode,
    storyboardWidgetInteractionMode,
    storyboardWidgetRichMediaOverlayRoot,
    forwardingEnabled,
    handleRootMouseDownCapture,
    handleRootPointerDownCapture,
    iframeSurfaceStyle,
    inlineSrcDocEmbeddedSurfaceStyle,
    inlineSrcDocPanelContentHeight,
    inlineSrcDocSurfaceStyle,
    installResize,
    isEmptyPanel,
    isSnapshotIframe,
    loadingSkeletonVariant,
    onResizePointerDown,
    panelIsLoading,
    panelLoadingLabel,
    panelOwnsInlineSrcDocScroll,
    preferEmbed,
    resizeHandlePlacement,
    resizeHandleVisible,
    rootAttributes,
    rootClassName,
    rootRef,
    rootStyle,
    showStoryboardWidgetChrome,
    panelTextEditable,
    showPanelTextSurface,
    shouldHideSurfaceUntilReady,
    useSurfaceFrame,
  }
}
