import React from 'react'
import { FloatingPanel } from '@/components/ui/FloatingPanel'

export default function MainPanelContainer({
  children,
  className,
  ariaLabel,
  minimized = false,
}: {
  children: React.ReactNode
  className?: string
  ariaLabel: string
  minimized?: boolean
}) {
  const base = `MainPanelContainer agentic-base-floating-panel agentic-panel-main ${minimized ? 'agentic-panel-main--collapsed' : 'agentic-panel-main--open'} flex-col`
  return (
    <FloatingPanel
      as="aside"
      ariaLabel={ariaLabel}
      data-kg-panel-minimized={minimized ? 'true' : undefined}
      className={`${base} ${className || 'h-full'}`}
    >
      {children}
    </FloatingPanel>
  )
}
