export type CssStyle = Record<string, string | number | undefined>

export const PANEL_FRAME_ROOT_STYLE: CssStyle = {
  boxSizing: 'border-box',
  overflow: 'hidden',
  contain: 'layout paint',
  isolation: 'isolate',
  borderRadius: 'var(--kg-media-panel-radius, 10px)',
  border: 'var(--kg-media-panel-border-w, 1px) solid var(--kg-border)',
  background: 'var(--kg-media-panel-bg, var(--kg-panel-bg, rgba(255,255,255,0.92)))',
  boxShadow: 'var(--kg-shadow-overlay)',
  willChange: 'left, top, width, height',
  display: 'flex',
  flexDirection: 'column',
}

export const PANEL_FRAME_HEADER_STYLE: CssStyle = {
  height: 'var(--kg-media-panel-header-h, 28px)',
  minHeight: 'var(--kg-media-panel-header-h, 28px)',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 'var(--kg-media-panel-header-gap, 6px)',
  paddingLeft: 'var(--kg-media-panel-padding, 6px)',
  paddingRight: 'var(--kg-media-panel-padding, 6px)',
  paddingTop: '2px',
  paddingBottom: '2px',
  background: 'var(--kg-media-panel-header-bg, var(--kg-media-panel-bg, var(--kg-panel-bg, rgba(255,255,255,0.96))))',
  color: 'var(--kg-text-primary, var(--kg-text))',
  fontSize: 'var(--kg-media-panel-title-size, 12px)',
  fontWeight: 600,
  lineHeight: 1.25,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
  pointerEvents: 'auto',
}

export const PANEL_FRAME_HEADER_TITLE_STYLE: CssStyle = {
  margin: 0,
  minWidth: 0,
  fontSize: 'var(--kg-media-panel-title-size, 12px)',
  fontWeight: 600,
  lineHeight: 1.25,
  color: 'var(--kg-text-primary, var(--kg-text))',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
}

export const PANEL_FRAME_HEADER_ACTION_STYLE: CssStyle = {
  width: 'calc(var(--kg-media-panel-header-h, 28px) - 6px)',
  height: 'calc(var(--kg-media-panel-header-h, 28px) - 6px)',
  minWidth: 'calc(var(--kg-media-panel-header-h, 28px) - 6px)',
  minHeight: 'calc(var(--kg-media-panel-header-h, 28px) - 6px)',
  borderRadius: '6px',
  color: 'var(--kg-text-secondary)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  pointerEvents: 'auto',
}

export const PANEL_FRAME_BODY_STYLE: CssStyle = {
  flex: 1,
  padding: 'var(--kg-media-panel-padding, 6px)',
  boxSizing: 'border-box',
  minHeight: 0,
  position: 'relative',
}

export const PANEL_FRAME_FLOATING_ROOT_STYLE: CssStyle = {
  ...PANEL_FRAME_ROOT_STYLE,
  padding: 0,
  color: 'var(--kg-text-primary, var(--kg-text))',
}

export const PANEL_FRAME_FLOATING_BODY_STYLE: CssStyle = {
  ...PANEL_FRAME_BODY_STYLE,
  width: '100%',
}

export const PANEL_FRAME_EMBEDDED_SURFACE_STYLE: CssStyle = {
  width: '100%',
  height: '100%',
  boxShadow: 'none',
}
