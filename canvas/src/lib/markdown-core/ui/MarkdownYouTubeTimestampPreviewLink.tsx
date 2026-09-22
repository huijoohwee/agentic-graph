import React from 'react'
import { createPortal } from 'react-dom'
import { buildYouTubeThumbnailPreviewDescriptor, buildYouTubeTimestampFramePreviewDescriptor, type RichMediaPreviewDescriptor } from 'grph-shared/rich-media/providers'
import { MediaVideoSnapshot } from '@/lib/markdown-core/ui/MarkdownMediaUi.impl'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_ANCHOR_PREVIEW_OVERLAY_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { Z_INDEX_ANCHOR_OVERLAY } from '@/lib/ui/zIndex'
import { buildAnchorAttrs } from './markdownPreviewLinks.impl'

const isCoarsePointerViewport = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia?.('(hover: none), (pointer: coarse)').matches) return true
  } catch {
    void 0
  }
  const maxTouchPoints = Number(window.navigator?.maxTouchPoints || 0)
  return Number.isFinite(maxTouchPoints) && maxTouchPoints > 0
}

export function YouTubeTimestampPreviewLink({
  href,
  anchor,
  preview,
  children,
}: {
  href: string
  anchor: ReturnType<typeof buildAnchorAttrs>
  preview: RichMediaPreviewDescriptor | null
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [previewPosition, setPreviewPosition] = React.useState<{ left: number; top: number } | null>(null)
  const tooltipId = React.useId()
  const linkRef = React.useRef<HTMLAnchorElement | null>(null)
  const touchTapArmedRef = React.useRef(false)
  const pointerTypeRef = React.useRef<string | null>(null)
  const sourceUrl = preview?.kind === 'timestamp-embed' ? String(preview.sourceUrl || '') : ''
  const timestampLabel = String(preview?.timestampLabel || '')
  const timestampFrameSrc = React.useMemo(
    () => buildYouTubeTimestampFramePreviewDescriptor(sourceUrl)?.thumbnailUrl || '',
    [sourceUrl],
  )
  const fallbackThumbnailSrc = React.useMemo(
    () => buildYouTubeThumbnailPreviewDescriptor(sourceUrl)?.thumbnailUrl || '',
    [sourceUrl],
  )
  const close = () => {
    touchTapArmedRef.current = false
    pointerTypeRef.current = null
    setOpen(false)
  }

  const updatePreviewPosition = React.useCallback(() => {
    const el = linkRef.current
    if (!el || typeof window === 'undefined') return
    const rect = el.getBoundingClientRect()
    const previewWidth = Math.min(224, Math.max(160, window.innerWidth - 32))
    const halfWidth = previewWidth / 2
    setPreviewPosition({
      left: Math.max(halfWidth + 8, Math.min(window.innerWidth - halfWidth - 8, rect.left + (rect.width / 2))),
      top: rect.bottom + 8,
    })
  }, [])

  const openPreview = () => {
    updatePreviewPosition()
    setOpen(true)
  }

  React.useEffect(() => {
    if (!open) return
    updatePreviewPosition()
    const handleViewportChange = () => updatePreviewPosition()
    window.addEventListener('scroll', handleViewportChange, true)
    window.addEventListener('resize', handleViewportChange)
    return () => {
      window.removeEventListener('scroll', handleViewportChange, true)
      window.removeEventListener('resize', handleViewportChange)
    }
  }, [open, updatePreviewPosition])

  if (!sourceUrl || !timestampLabel) {
    return (
      <a href={href} target={anchor.target} rel={anchor.rel} className={anchor.className}>
        {children}
      </a>
    )
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLAnchorElement>) => {
    pointerTypeRef.current = event.pointerType || null
  }

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const pointerType = pointerTypeRef.current
    const isKeyboardActivation = event.detail === 0
    const wantsTapPreview = !isKeyboardActivation && (pointerType === 'touch' || pointerType === 'pen' || isCoarsePointerViewport())
    if (!wantsTapPreview || touchTapArmedRef.current) return
    touchTapArmedRef.current = true
    event.preventDefault()
    event.stopPropagation()
    openPreview()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLAnchorElement>) => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    close()
  }

  return (
    <span className="relative inline-flex items-baseline overflow-visible align-baseline">
      <a
        ref={linkRef}
        href={href}
        target={anchor.target}
        rel={anchor.rel}
        className={anchor.className}
        aria-describedby={open ? tooltipId : undefined}
        data-kg-youtube-timestamp-link="1"
        data-kg-rich-media-preview-key={preview.semanticKey}
        data-kg-youtube-timestamp={timestampLabel}
        onMouseEnter={openPreview}
        onMouseLeave={close}
        onFocus={openPreview}
        onBlur={close}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {children}
      </a>
      {open && previewPosition && typeof document !== 'undefined' ? createPortal(
        <span
          id={tooltipId}
          role="tooltip"
          data-kg-youtube-timestamp-preview="1"
          data-kg-rich-media-preview-key={preview.semanticKey}
          data-src={sourceUrl}
          data-kg-canvas-pointer-ignore="true"
          data-kg-canvas-wheel-ignore="true"
          className={['pointer-events-none fixed', UI_RESPONSIVE_ANCHOR_PREVIEW_OVERLAY_CLASSNAME, 'overflow-hidden rounded border shadow-xl', UI_THEME_TOKENS.tooltip.bg, UI_THEME_TOKENS.tooltip.text, UI_THEME_TOKENS.panel.border].join(' ')}
          style={{
            left: previewPosition.left,
            top: previewPosition.top,
            transform: 'translateX(-50%)',
            zIndex: Z_INDEX_ANCHOR_OVERLAY,
          }}
        >
          <span className="block aspect-video w-full bg-black">
            <MediaVideoSnapshot
              url={sourceUrl}
              title={`YouTube preview at ${timestampLabel}`}
              presentationMode
              thumbnailSrc={timestampFrameSrc || fallbackThumbnailSrc}
              fallbackThumbnailSrc={fallbackThumbnailSrc}
              containerClassName="aspect-video w-full"
              className="border-0 rounded-none shadow-none"
              style={{ borderRadius: 0 }}
            />
          </span>
          <span className={`block px-2 py-1 text-[11px] leading-tight ${UI_THEME_TOKENS.tooltip.text}`}>
            {timestampLabel}
          </span>
        </span>,
        document.body,
      ) : null}
    </span>
  )
}
