import React from 'react'
import LucideX from 'lucide-react/dist/esm/icons/x.js'
import { UI_ICON_DEFAULTS, UI_THEME_TOKENS } from 'grph-shared/ui/themeTokens'
import {
  UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
  UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME,
  UI_RESPONSIVE_SAFE_VIEWPORT_PANEL_CLASSNAME,
} from '../../lib/ui/responsiveElementClasses'
import { uiToolbarRowScrollJustifyBetweenClassName } from '../../features/toolbar/ui/toolbarStyles'

// Node's source-test loader wraps this ESM default; both forms use the same upstream icon.
const CloseIcon = (LucideX as { default?: React.ElementType }).default ?? LucideX

type FloatingPanelTag = 'div' | 'section' | 'aside' | 'nav' | 'article'

export type FloatingPanelProps = {
  as?: FloatingPanelTag
  ariaLabel: string
  ariaHidden?: boolean
  ariaExpanded?: boolean
  role?: React.AriaRole
  className?: string
  id?: string
  style?: React.CSSProperties
  children: React.ReactNode
} & Omit<
  React.HTMLAttributes<HTMLElement>,
  'children' | 'className' | 'id' | 'style' | 'role' | 'aria-label' | 'aria-hidden' | 'aria-expanded'
>

export const FloatingPanel = React.memo(
  React.forwardRef<HTMLElement, FloatingPanelProps>(function FloatingPanel(
    { as = 'section', ariaLabel, ariaHidden, ariaExpanded, role, className, id, style, children, ...rest },
    ref,
  ) {
    return React.createElement(
      as,
      {
        ...rest,
        ref,
        id,
        style,
        role,
        'aria-hidden': ariaHidden,
        'aria-expanded': ariaExpanded,
        'aria-label': ariaLabel,
        className: className || '',
      },
      children,
    )
  }),
)

export type FloatingPanelShellProps = {
  rootClassName?: string
  rootStyle?: React.CSSProperties
  panelStyle?: React.CSSProperties
  ariaLabel?: string
  minimized?: boolean
  pinned?: boolean
  rowHeight?: string
  fieldLine?: string
  onHeaderPointerDown?: React.PointerEventHandler<HTMLElement>
  header: React.ReactNode
  children: React.ReactNode
}

/** Shared native chrome; the caller retains positioning, view state and drag/pin control. */
export const FloatingPanelShell = React.forwardRef<HTMLElement, FloatingPanelShellProps>(function FloatingPanelShell({
  rootClassName, rootStyle, panelStyle, ariaLabel = 'Floating panel', minimized = false,
  pinned = true, rowHeight, fieldLine, onHeaderPointerDown, header, children,
}, ref) {
  return <section className={rootClassName} style={rootStyle}>
    <aside ref={ref}
      className={`pointer-events-auto ModalContainer flex ${UI_RESPONSIVE_SAFE_VIEWPORT_PANEL_CLASSNAME} flex-col overflow-hidden p-0 ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary}`}
      style={panelStyle} data-kg-floating-panel-root="true"
      data-kg-floating-panel-row-height={rowHeight} data-kg-floating-panel-field-line={fieldLine}>
      <section className={`flex ${minimized ? '' : 'h-full'} min-w-0 flex-col gap-1`} style={{ padding: 'var(--kg-toolbar-compact-padding)' }} aria-label={ariaLabel}>
        <header className={`${uiToolbarRowScrollJustifyBetweenClassName} ${UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME} w-full shrink-0 gap-1 select-none sm:gap-2 ${!pinned ? 'cursor-move' : ''}`}
          style={{ '--kg-responsive-panel-header-row-min-height': 'var(--kg-control-height)' } as React.CSSProperties} onPointerDown={onHeaderPointerDown}>
          {header}
        </header>
        {children}
      </section>
    </aside>
  </section>
})

export type FloatingPanelCloseButtonProps = {
  label: string
  onClose: () => void
  disabled?: boolean
  iconClassName?: string
  strokeWidth?: number
  colorClassName?: string
  hoverClassName?: string
  paddingClassName?: string
  minimal?: boolean
  suppressTitle?: boolean
}

/** Store-free close control shared by native and portable floating panels. */
export function FloatingPanelCloseButton({
  label, onClose, disabled = false, iconClassName = UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME, strokeWidth = UI_ICON_DEFAULTS.strokeWidth,
  colorClassName, hoverClassName, paddingClassName, minimal = false, suppressTitle = false,
}: FloatingPanelCloseButtonProps) {
  const pointerActivated = React.useRef(false)
  const activate = (element: HTMLButtonElement) => {
    if (disabled) return
    element.focus({ preventScroll: true })
    onClose()
  }
  return <button type="button" aria-label={label} title={suppressTitle ? undefined : label} disabled={disabled}
    className={`kg-icon-button group relative select-none rounded justify-center ${UI_THEME_TOKENS.button.iconControl} ${UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME} ${paddingClassName?.trim() || UI_THEME_TOKENS.button.padding} ${disabled ? `${UI_THEME_TOKENS.button.disabledText} cursor-not-allowed pointer-events-none` : `${colorClassName?.trim() || UI_THEME_TOKENS.icon.color} ${minimal ? '' : hoverClassName?.trim() || UI_THEME_TOKENS.button.hoverBg}`} App-toolbar__btn`}
    onPointerDown={event => { pointerActivated.current = false; if (event.button === 0) event.preventDefault(); event.stopPropagation() }}
    onPointerUp={event => { event.stopPropagation(); if (disabled || event.button !== 0) return; pointerActivated.current = true; activate(event.currentTarget) }}
    onMouseDown={event => { if (event.button === 0) event.preventDefault(); event.stopPropagation() }}
    onClick={event => { event.preventDefault(); event.stopPropagation(); if (pointerActivated.current) { pointerActivated.current = false; return } activate(event.currentTarget) }}>
    <CloseIcon className={iconClassName} strokeWidth={strokeWidth} aria-hidden={true} />
  </button>
}
