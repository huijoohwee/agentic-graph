import React from 'react'
import RichMediaPanel from '@/components/RichMediaPanel'
import { buildStaticRichMediaPanelOverlayState } from '@/lib/render/richMediaSsot'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_ANCHOR_PREVIEW_OVERLAY_BODY_CLASSNAME,
  UI_RESPONSIVE_ANCHOR_PREVIEW_OVERLAY_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { AnchorOverlay } from './overlay'

export function StaticRichMediaPanelTextAnchorOverlay(props: {
  show: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  text: string
  title: string
  onClose?: () => void
  widthPx?: number
  heightPx?: number
  containerProps?: React.HTMLAttributes<HTMLElement> & Record<`data-${string}`, string | undefined>
}) {
  const widthPx = typeof props.widthPx === 'number' && props.widthPx > 0 ? props.widthPx : 280
  const heightPx = typeof props.heightPx === 'number' && props.heightPx > 0 ? props.heightPx : 156
  const panel = React.useMemo(
    () => buildStaticRichMediaPanelOverlayState({ activeTab: 'text', text: props.text }),
    [props.text],
  )
  const panelStyle = React.useMemo<React.CSSProperties>(() => ({
    width: '100%',
    height: '100%',
    boxShadow: 'none',
    ['--kg-media-panel-padding' as never]: '0px',
    ['--kg-media-panel-radius' as never]: '8px',
  }), [])
  if (!props.show || !props.text.trim()) return null
  return (
    <AnchorOverlay
      anchorRef={props.anchorRef}
      open
      onClose={props.onClose}
      align="bottom-center"
      autoFocus={false}
      className={[
        `${UI_RESPONSIVE_ANCHOR_PREVIEW_OVERLAY_CLASSNAME} overflow-hidden rounded border shadow-[var(--kg-shadow-overlay)]`,
        UI_THEME_TOKENS.panel.bg,
        UI_THEME_TOKENS.panel.border,
      ].join(' ')}
    >
      <section
        {...props.containerProps}
        data-kg-canvas-pointer-ignore="true"
        data-kg-canvas-wheel-ignore="true"
        className={[UI_RESPONSIVE_ANCHOR_PREVIEW_OVERLAY_BODY_CLASSNAME, props.containerProps?.className || ''].filter(Boolean).join(' ')}
        style={{
          width: widthPx,
          maxWidth: '100%',
          height: heightPx,
          ...(props.containerProps?.style || null),
        }}
      >
        <RichMediaPanel
          title={props.title}
          url=""
          kind="iframe"
          panelChrome="storyboardWidget"
          interactive={false}
          panel={panel}
          style={panelStyle}
        />
      </section>
    </AnchorOverlay>
  )
}
