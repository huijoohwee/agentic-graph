import React from 'react'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { cn } from '@/lib/utils'

/** Semantic supporting text shares the panel's resolved typography preferences. */
export function PanelCaption({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const { microLabelClass } = usePanelTypography()
  return <small {...props} className={cn(className, microLabelClass)} />
}

/** Code keeps its own text role instead of inheriting the surrounding field size. */
export function PanelCode({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const { monospaceTextClass } = usePanelTypography()
  return <code {...props} className={cn(className, monospaceTextClass)} />
}
