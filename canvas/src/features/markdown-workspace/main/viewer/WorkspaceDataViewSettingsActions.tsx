import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_FOCUS_RING } from '@/lib/ui/focusRing'
/** Native named action remains visible to keyboard and page selection tooling. */
export function DataViewAction(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={['min-h-11 sm:min-h-8 rounded border px-2 py-1 text-xs disabled:opacity-50', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg, UI_FOCUS_RING, props.className].filter(Boolean).join(' ')} />
}
