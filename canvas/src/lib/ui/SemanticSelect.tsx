import React from 'react'
import { SemanticSelect as SharedSemanticSelect, type SemanticSelectProps } from '@agentic-base/views-react/controls'
import { normalizeSingleLineControlClassName } from '@/lib/ui/theme-tokens'
export type { SemanticSelectProps } from '@agentic-base/views-react/controls'

/** Graph's existing prop/data contract delegates to the shared Base owner. */
export const SemanticSelect = React.forwardRef<HTMLButtonElement, SemanticSelectProps>(function SemanticSelect(props, ref) {
  return <SharedSemanticSelect {...props} ref={ref} data-kg-select="true" className={normalizeSingleLineControlClassName(props.className)} />
})
