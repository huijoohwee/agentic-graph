import React from 'react'
import LucideX from 'lucide-react/dist/esm/icons/x.js'
import {
  FloatingPanelCloseButton as BaseFloatingPanelCloseButton,
  FloatingPanelShell as BaseFloatingPanelShell,
  type FloatingPanelShellProps as BaseFloatingPanelShellProps,
} from '@agentic-base/views-react/panels'
import { UI_ICON_DEFAULTS, UI_THEME_TOKENS } from 'grph-shared/ui/themeTokens'
import {
  UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME,
} from '../../lib/ui/responsiveElementClasses'

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

/** Graph supplies placement and theme tokens; Base owns the panel chrome and layout. */
export const FloatingPanelShell = React.forwardRef<HTMLElement, FloatingPanelShellProps>(function FloatingPanelShell(props, ref) {
  const rootStyle = {
    '--base-accent': 'var(--kg-accent)',
    '--base-text-primary': 'var(--kg-text-primary)',
    '--base-text-secondary': 'var(--kg-text-secondary)',
    '--base-border': 'var(--kg-border)',
    '--base-panel': 'var(--kg-panel-bg)',
    '--base-shadow-overlay': 'var(--kg-shadow-overlay)',
    '--base-toolbar-compact-padding': 'var(--kg-toolbar-compact-padding)',
    '--base-control-height': 'var(--kg-control-height)',
    ...props.rootStyle,
  } as React.CSSProperties
  return <BaseFloatingPanelShell {...props} ref={ref} rootStyle={rootStyle} />
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
  void suppressTitle
  const className = `kg-icon-button group relative select-none rounded justify-center ${UI_THEME_TOKENS.button.iconControl} ${UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME} ${paddingClassName?.trim() || UI_THEME_TOKENS.button.padding} ${disabled ? `${UI_THEME_TOKENS.button.disabledText} cursor-not-allowed pointer-events-none` : `${colorClassName?.trim() || UI_THEME_TOKENS.icon.color} ${minimal ? '' : hoverClassName?.trim() || UI_THEME_TOKENS.button.hoverBg}`} App-toolbar__btn`
  return <BaseFloatingPanelCloseButton label={label} onClose={onClose} disabled={disabled} className={className}
    icon={<CloseIcon className={iconClassName} strokeWidth={strokeWidth} aria-hidden={true} />} />
}
