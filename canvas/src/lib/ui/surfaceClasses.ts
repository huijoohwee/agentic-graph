import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export const UI_SURFACE_CARD =
  `rounded-lg ${UI_THEME_TOKENS.border.outline} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.shadow.flat}`

export const UI_SURFACE_SUBTLE = 'bg-[var(--kg-panel-bg-hover)]'

export const UI_VIEW_EDIT_SURFACE_BOUNDS_CLASS_NAME = 'min-h-0 min-w-0 max-w-full'

export const UI_VIEW_EDIT_SURFACE_AREA_CLASS_NAME =
  `h-full w-full ${UI_VIEW_EDIT_SURFACE_BOUNDS_CLASS_NAME}`

export const UI_VIEW_EDIT_SURFACE_FLEX_AREA_CLASS_NAME =
  `flex-1 ${UI_VIEW_EDIT_SURFACE_BOUNDS_CLASS_NAME}`

export const UI_VIEW_EDIT_SURFACE_VIEWER_CLASS_NAME =
  `flex h-full flex-col overflow-hidden ${UI_VIEW_EDIT_SURFACE_FLEX_AREA_CLASS_NAME}`

export const UI_VIEW_EDIT_SURFACE_SHELL_CLASS_NAME =
  `relative ${UI_VIEW_EDIT_SURFACE_AREA_CLASS_NAME}`

export const UI_VIEW_EDIT_SURFACE_DATA_ATTRIBUTES = {
  'data-kg-view-edit-surface-area': '1',
} as const
