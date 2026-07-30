export const UI_SURFACE_CARD =
  'rounded-lg border border-[color:var(--kg-border)] bg-[var(--kg-panel-bg)] shadow-sm'

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
