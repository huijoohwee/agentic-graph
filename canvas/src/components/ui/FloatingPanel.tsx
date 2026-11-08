import React from 'react'
import { readFloatingPanelThemeStyle } from '../../lib/ui/floatingPanelTheme'
import LucideX from 'lucide-react/dist/esm/icons/x.js'
import IconButton from '@/components/IconButton'
import {
  FloatingPanelShell as BaseFloatingPanelShell,
  type FloatingPanelShellProps as BaseFloatingPanelShellProps,
} from '@agentic-base/views-react/panels'
import { UI_ICON_DEFAULTS } from 'grph-shared/ui/themeTokens'
import { UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME } from '../../lib/ui/responsiveElementClasses'

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

export type FloatingPanelShellProps = BaseFloatingPanelShellProps

/** Graph supplies placement and theme tokens; Base renders the Design System’s pinned FloatingPanel shell. */
export const FloatingPanelShell = React.forwardRef<HTMLElement, FloatingPanelShellProps>(function FloatingPanelShell(props, ref) {
  const rootStyle = readFloatingPanelThemeStyle(props.rootStyle, props.minimized)
  return <BaseFloatingPanelShell {...props} ref={ref} rootStyle={rootStyle} />
})

export type FloatingPanelCloseButtonProps = {
  label: string
  onClose: () => void
  disabled?: boolean
  iconClassName?: string
  strokeWidth?: number
}

/** Semantic close adapter over the shared toolbar icon-button interaction and styling. */
export function FloatingPanelCloseButton({
  label, onClose, disabled = false, iconClassName = UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME, strokeWidth = UI_ICON_DEFAULTS.strokeWidth,
}: FloatingPanelCloseButtonProps) {
  return (
    <IconButton
      title={label}
      ariaLabel={label}
      onClick={onClose}
      disabled={disabled}
      className="App-toolbar__btn"
      showTooltip
    >
      <CloseIcon className={iconClassName} strokeWidth={strokeWidth} aria-hidden={true} />
    </IconButton>
  )
}
