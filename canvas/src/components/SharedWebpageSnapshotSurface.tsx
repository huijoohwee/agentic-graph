import { UI_FONT_SANS } from 'grph-shared/ui/typography'
import React from 'react'
import type { WebpageLayoutSnapshot } from '@/lib/websites/webpageLayoutExport'
import { pickWebpageSnapshotRects } from 'grph-shared/rich-media/webpageSnapshot'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_WEBPAGE_SNAPSHOT_FAVICON_MEDIA_CLASSNAME,
  UI_RESPONSIVE_WEBPAGE_SNAPSHOT_HOST_ICON_MEDIA_CLASSNAME,
  UI_RESPONSIVE_WEBPAGE_SNAPSHOT_MEDIA_BACKDROP_CLASSNAME,
  UI_RESPONSIVE_WEBPAGE_SNAPSHOT_EMPTY_MEDIA_CLASSNAME,
  UI_RESPONSIVE_WEBPAGE_SNAPSHOT_OVERLAY_BADGE_CLASSNAME,
  UI_RESPONSIVE_WEBPAGE_SNAPSHOT_PREVIEW_MEDIA_CLASSNAME,
  UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME,
  UI_RESPONSIVE_FILL_MEDIA_SURFACE_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

type SharedWebpageSnapshotSurfaceProps = {
  url: string
  title: string
  titleLabel: string
  hostLabel: string
  snap: WebpageLayoutSnapshot | null
  blocked: boolean
  metaImageSrc?: string
  faviconSrc?: string
  hostIconSrc?: string
  className?: string
  style?: React.CSSProperties
  thumbnailInteractive?: boolean
}

const truncateText = (value: string, maxChars: number): string => {
  const t = String(value || '')
  if (maxChars <= 0) return ''
  if (t.length <= maxChars) return t
  if (maxChars <= 1) return '…'
  return `${t.slice(0, Math.max(0, maxChars - 1))}…`
}

const estimateMaxChars = (widthPx: number, fontSizePx: number): number => {
  const w = Math.max(0, Number.isFinite(widthPx) ? widthPx : 0)
  const fs = Math.max(8, Number.isFinite(fontSizePx) ? fontSizePx : 12)
  return Math.max(0, Math.floor(w / (fs * 0.62)))
}

export function SharedWebpageSnapshotSurface(props: SharedWebpageSnapshotSurfaceProps) {
  const viewportW = typeof props.snap?.meta?.viewport?.w === 'number' ? props.snap.meta.viewport.w : 1100
  const viewportH = typeof props.snap?.meta?.viewport?.h === 'number' ? props.snap.meta.viewport.h : 720
  const rects = props.snap ? pickWebpageSnapshotRects(props.snap) : []
  const hasPreview = !!props.snap || !!props.metaImageSrc
  const fallbackIcon = props.faviconSrc || props.hostIconSrc
  const overlayBadgeClassName = `${UI_RESPONSIVE_WEBPAGE_SNAPSHOT_OVERLAY_BADGE_CLASSNAME} rounded border ${UI_THEME_TOKENS.panel.border} bg-[color:var(--kg-panel-bg)]/90 px-2 py-1`
  const labels = <>
    <section title={props.titleLabel} className={`text-xs font-semibold ${UI_THEME_TOKENS.text.primary} truncate`}>{props.titleLabel}</section>
    <section title={props.hostLabel} className={`text-xs ${UI_THEME_TOKENS.text.tertiary} truncate`}>{props.hostLabel}</section>
    {props.blocked && <section className={`text-xs ${UI_THEME_TOKENS.text.secondary}`}>Blocked</section>}
  </>

  return (
    <section className={['w-full h-full', props.className].filter(Boolean).join(' ')} style={props.style} data-kg-webpage-snapshot="1" data-src={props.url}>
      <section
        className="w-full h-full relative"
        data-kg-media-thumbnail={props.thumbnailInteractive ? '1' : undefined}
        role={props.thumbnailInteractive ? 'button' : undefined}
        tabIndex={props.thumbnailInteractive ? 0 : undefined}
        aria-label={props.thumbnailInteractive ? props.titleLabel || props.title || props.hostLabel || props.url : undefined}
        onKeyDown={props.thumbnailInteractive ? event => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          event.currentTarget.click()
        } : undefined}
      >
        {!hasPreview ? <section className={`${UI_RESPONSIVE_WEBPAGE_SNAPSHOT_MEDIA_BACKDROP_CLASSNAME} flex min-w-0 items-center gap-1 px-2`}>
          {fallbackIcon && <section className="relative size-8 shrink-0">
            <img src={fallbackIcon} alt="" loading="lazy" decoding="async"
              className={props.faviconSrc ? UI_RESPONSIVE_WEBPAGE_SNAPSHOT_FAVICON_MEDIA_CLASSNAME : UI_RESPONSIVE_WEBPAGE_SNAPSHOT_HOST_ICON_MEDIA_CLASSNAME} />
          </section>}
          <section className="min-w-0">{labels}</section>
        </section> : <>
        {props.metaImageSrc ? (
          <img
            src={props.metaImageSrc}
            alt={props.titleLabel}
            loading="lazy"
            decoding="async"
            className={UI_RESPONSIVE_WEBPAGE_SNAPSHOT_PREVIEW_MEDIA_CLASSNAME}
          />
        ) : null}
        {props.snap ? (
          <svg
            viewBox={`0 0 ${Math.max(1, viewportW)} ${Math.max(1, viewportH)}`}
            preserveAspectRatio="xMidYMid meet"
            className={UI_RESPONSIVE_FILL_MEDIA_SURFACE_CLASSNAME}
            aria-label={props.title || props.url}
            role="img"
          >
            <rect x={0} y={0} width={viewportW} height={viewportH} fill="#ffffff" />
            {rects.map((r, idx) => (
              <g key={idx}>
                <rect
                  x={r.rect.x}
                  y={r.rect.y}
                  width={r.rect.w}
                  height={r.rect.h}
                  fill="rgba(0,0,0,0.03)"
                  stroke="rgba(0,0,0,0.12)"
                  strokeWidth={1}
                />
                {r.text && r.rect.w >= 140 && r.rect.h >= 26 ? (
                  <text
                    x={r.rect.x + 8}
                    y={r.rect.y + 18}
                    fontSize={14}
                    fill="rgba(0,0,0,0.55)"
                    fontFamily={UI_FONT_SANS}
                  >
                    {truncateText(r.text, estimateMaxChars(r.rect.w - 16, 14))}
                  </text>
                ) : null}
              </g>
            ))}
          </svg>
        ) : (
          <section className={UI_RESPONSIVE_WEBPAGE_SNAPSHOT_EMPTY_MEDIA_CLASSNAME} />
        )}
        <section aria-hidden={true} className={UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME}>
          <section className={overlayBadgeClassName}>{labels}</section>
        </section>
        </>}
      </section>
    </section>
  )
}
