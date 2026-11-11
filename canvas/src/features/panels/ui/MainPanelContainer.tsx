import React from 'react'
import { FloatingPanel } from '@/components/ui/FloatingPanel'

type MainPanelLayoutStyle = Pick<React.CSSProperties,
  'position' | 'inset' | 'top' | 'right' | 'bottom' | 'left' | 'width' | 'height' |
  'minWidth' | 'minHeight' | 'maxWidth' | 'maxHeight' | 'zIndex'>

export default function MainPanelContainer({
  children,
  className,
  style,
  ariaLabel,
  minimized = false,
}: {
  children: React.ReactNode
  className?: string
  style?: MainPanelLayoutStyle
  ariaLabel: string
  minimized?: boolean
}) {
  const base = 'MainPanelContainer agentic-base-floating-panel flex-col'
  return (
    <FloatingPanel
      as="aside"
      ariaLabel={ariaLabel}
      data-kg-panel-minimized={minimized ? 'true' : undefined}
      className={`${base} ${className || 'h-full'}`}
      style={style}
    >
      {children}
    </FloatingPanel>
  )
}
