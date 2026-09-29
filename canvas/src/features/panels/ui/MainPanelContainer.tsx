import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { FloatingPanel } from '@/components/ui/FloatingPanel'

export default function MainPanelContainer({
  children,
  className,
  style,
  ariaLabel,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  ariaLabel: string
}) {
  const base = `MainPanelContainer flex min-w-0 max-w-full flex-col p-0 rounded-xl ${UI_THEME_TOKENS.border.outline} shadow-lg shadow-gray-200/60 dark:shadow-black/60 overflow-hidden`
  return (
    <FloatingPanel
      as="aside"
      ariaLabel={ariaLabel}
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
