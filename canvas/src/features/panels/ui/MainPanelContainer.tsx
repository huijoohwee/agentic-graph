import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { FloatingPanel } from '@/components/ui/FloatingPanel'

export default function MainPanelContainer({
  children,
  className,
  style,
  ariaLabel,
  minimized = false,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  ariaLabel: string
  minimized?: boolean
}) {
  const base = `MainPanelContainer flex min-w-0 max-w-full flex-col p-0 ${UI_THEME_TOKENS.border.outline} ${UI_THEME_TOKENS.shadow.overlay} overflow-hidden`
  return (
    <FloatingPanel
      as="aside"
      ariaLabel={ariaLabel}
      data-kg-panel-minimized={minimized ? 'true' : undefined}
      className={`${base} ${className || 'h-full'}`}
      style={{
        backgroundColor: 'var(--kg-panel-bg)',
        ...style,
      }}
    >
      {children}
    </FloatingPanel>
  )
}
