import React from 'react'
import { ResponsiveSelectRow } from '@/lib/ui/responsiveControlRows'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { LayoutMode2d } from '@/lib/graph/layoutMode'

export const LAYOUT_MODE_OPTIONS: readonly { value: LayoutMode2d; label: string }[] = [
  { value: 'radial', label: 'Radial (default)' },
  { value: 'block', label: 'Block' },
]

export const normalizeLayoutModeChoice = (value: string): LayoutMode2d =>
  value.trim().toLowerCase() === 'block' ? 'block' : 'radial'

export function LayoutModeSelect({ value, onChange, disabled, description }: {
  value: LayoutMode2d
  onChange: (next: LayoutMode2d) => void
  disabled?: boolean
  description: string
}) {
  return <>
    <section className={`text-xs ${UI_THEME_TOKENS.text.secondary} leading-snug`}>{description}</section>
    <ResponsiveSelectRow label="Mode" value={value} disabled={disabled}
      onChange={next => onChange(normalizeLayoutModeChoice(next))}>
      {LAYOUT_MODE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </ResponsiveSelectRow>
  </>
}
