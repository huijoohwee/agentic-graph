import React from 'react'
import { readFloatingPanelThemeStyle } from '../../lib/ui/floatingPanelTheme'
import {
  FloatingPanelShell as BaseFloatingPanelShell,
  type FloatingPanelShellProps as BaseFloatingPanelShellProps,
} from '@agentic-base/views-react/panels'

export { FloatingPanelCloseButton } from '@agentic-base/views-react/panels'
export type { FloatingPanelCloseButtonProps } from '@agentic-base/views-react/panels'

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
