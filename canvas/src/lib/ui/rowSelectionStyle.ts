import type { CSSProperties } from 'react'

/** Shared selection treatment for native record and hierarchy rows. */
export function rowSelectionStyle(selected: boolean): CSSProperties {
  return {
    borderInlineStartColor: selected ? '#3b82f6' : 'transparent',
    background: selected ? 'color-mix(in srgb, #3b82f6 22%, var(--kg-panel-bg, white))' : undefined,
  }
}
