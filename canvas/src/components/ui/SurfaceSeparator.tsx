import React from 'react'

/** One visible neutral line inside a named, selectable 8 px surface. */
export function SurfaceSeparator({ label, orientation = 'horizontal', className = '' }: {
  label: string
  orientation?: 'horizontal' | 'vertical'
  className?: string
}) {
  return <hr role="separator" aria-label={label} aria-orientation={orientation}
    className={`kg-surface-separator ${className}`} />
}
