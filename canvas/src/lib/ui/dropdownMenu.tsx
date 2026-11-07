import React from 'react'
import { DropdownMenuSurface as SharedMenuSurface } from '@agentic-base/views-react/controls'

export { menuOptionClassName as dropdownMenuOptionClassName } from '@agentic-base/views-react/controls'

/** Preserve the host overlay geometry contract while Base owns the menu. */
export function DropdownMenuSurface({ className = '', ...props }: React.ComponentProps<typeof SharedMenuSurface>) {
  return <SharedMenuSurface {...props} className={`kg-toolbar-dropdown-menu ${className}`} />
}
