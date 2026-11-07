import React from 'react'

export interface TwoColumnEditorGridProps {
  children: React.ReactNode
  className?: string
}

export const TWO_COLUMN_EDITOR_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-2'

export function TwoColumnEditorGrid({ children, className }: TwoColumnEditorGridProps) {
  const rootClassName = [TWO_COLUMN_EDITOR_GRID_CLASS_NAME, className || ''].filter(Boolean).join(' ')
  return (
    <section className={rootClassName}>
      {children}
    </section>
  )
}
