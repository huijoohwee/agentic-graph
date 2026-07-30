import type React from 'react'
import type { RichMediaPanelTab } from '@/lib/render/richMediaPanelState'
import type { MediaDragPayload } from '@/lib/ui/mediaDragPayload'
import type { ImageToThreeJsRenderMode } from '@/features/image-to-threejs/imageToThreeJsContract'
import type { XrSceneMediaDragProjection } from '@/lib/ui/mediaDragPayload'

export type RichMediaKind = 'iframe' | 'image' | 'svg' | 'video' | 'audio' | 'model'

export type RichMediaPanelProps = {
  overlayId?: string
  title: string
  url: string
  srcDoc?: string
  openUrl?: string
  kind?: RichMediaKind
  renderMode?: ImageToThreeJsRenderMode
  interactive?: boolean
  videoControls?: boolean
  videoPoster?: string
  hideUntilReady?: boolean
  headerPassthrough?: boolean
  resizable?: boolean
  resizeHandleVisible?: boolean
  forwardWheelTo?: () => Element | null
  forwardWheelBeforeScrollableTarget?: boolean
  forwardPointerTo?: () => Element | null
  shouldForwardPointerDown?: (event: PointerEvent) => boolean
  shouldStartHeaderDrag?: (event: PointerEvent) => boolean
  onResizeStart?: (args: { pointerId: number; clientX: number; clientY: number }) => void
  onResize?: (args: { pointerId: number; clientX: number; clientY: number; dx: number; dy: number }) => void
  onResizeEnd?: (args: { pointerId: number; clientX: number; clientY: number }) => void
  onOverlayPanStart?: (args: { pointerId: number; clientX: number; clientY: number; buttons: number; shiftKey: boolean }) => void
  onOverlayPan?: (args: { pointerId: number; clientX: number; clientY: number; dx: number; dy: number; buttons: number; shiftKey: boolean }) => void
  onOverlayPanEnd?: (args: { pointerId: number; clientX: number; clientY: number; buttons: number; shiftKey: boolean }) => void
  className?: string
  style?: React.CSSProperties
  onHeaderDragStart?: (args: { pointerId: number; clientX: number; clientY: number }) => void
  onHeaderDrag?: (args: { pointerId: number; clientX: number; clientY: number; dx: number; dy: number }) => void
  onHeaderDragEnd?: (args: { pointerId: number; clientX: number; clientY: number }) => void
  onPointerDownCapture?: React.PointerEventHandler<HTMLElement>
  onPointerUpCapture?: React.PointerEventHandler<HTMLElement>
  onWheelCapture?: React.WheelEventHandler<HTMLElement>
  onClick?: React.MouseEventHandler<HTMLElement>
  onClickCapture?: React.MouseEventHandler<HTMLElement>
  onDoubleClick?: React.MouseEventHandler<HTMLElement>
  onDoubleClickCapture?: React.MouseEventHandler<HTMLElement>
  onContextMenuCapture?: React.MouseEventHandler<HTMLElement>
  widgetToolbarActive?: boolean
  headerPinned?: boolean
  headerMinimized?: boolean
  onHeaderTogglePinned?: (event: React.MouseEvent) => void
  onHeaderPinnedPointerDown?: (event: React.PointerEvent) => void
  onHeaderToggleMinimized?: () => void
  frameMode?: 'panel' | 'surface'
  placementOwner?: 'self' | 'parent'
  resizeHandlePlacement?: 'root' | 'external'
  scrollOwner?: 'media' | 'panel'
  onInlineContentSize?: (size: { width: number; height: number }) => void
  panelChrome?: 'none' | 'storyboardWidget'
  outputVersionPlacement?: 'header' | 'bubble-toolbar'
  selected?: boolean
  canvasOverlayPinned?: boolean
  onMediaElement?: (element: HTMLMediaElement | null) => void
  onVideoElement?: (element: HTMLVideoElement | null) => void
  onMediaDrop?: (payload: MediaDragPayload) => void
  panel?: {
    activeTab: RichMediaPanelTab
    freezeConnectedOutput: boolean
    markdownPresentationMode?: boolean
    markdownWorkspaceViewerSurface?: boolean
    hasText: boolean
    hasImage: boolean
    hasVideo: boolean
    hasAudio?: boolean
    hasModel?: boolean
    hasPoi: boolean
    text: string
    connectedText: string
    outputVersions?: Array<{
      id: string
      createdAt: string
      output: string
    }>
    selectedOutputVersionId?: string
    isLoading?: boolean
    loadingLabel?: string
    xrScene?: XrSceneMediaDragProjection
  }
  storyboardWidgetInteractionMode?: boolean
  storyboardWidgetFrontmatterDocumentMode?: boolean
  storyboardWidgetSurfaceId?: string
  onPanelChange?: (next: {
    activeTab: RichMediaPanelTab
    freezeConnectedOutput: boolean
    text?: string
    selectedOutputVersionId?: string
  }) => void
}
