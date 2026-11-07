import React from 'react'
import { SimpleKeyValueRow as SharedSimpleKeyValueRow } from 'grph-shared/react/keyTypeValueRow'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'

export interface SimpleKeyValueRowProps {
  label: React.ReactNode
  children: React.ReactNode
  align?: 'center' | 'start'
  density?: 'default' | 'compact'
  className?: string
}

export function SimpleKeyValueRow({
  label,
  children,
  align,
  density = 'default',
  className,
}: SimpleKeyValueRowProps) {
  const row = useCanvasKeyTypeValueStaticRowProps(density)
  return <SharedSimpleKeyValueRow {...row} label={label} align={align} className={className}>
    {children}
  </SharedSimpleKeyValueRow>
}
