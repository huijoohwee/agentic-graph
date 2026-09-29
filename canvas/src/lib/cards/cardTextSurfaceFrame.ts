import {
  UI_VIEW_EDIT_SURFACE_AREA_CLASS_NAME,
  UI_VIEW_EDIT_SURFACE_BOUNDS_CLASS_NAME,
} from '@/lib/ui/surfaceClasses'

export const CARD_TEXT_SURFACE_COLUMN_CLASS_NAME =
  `${UI_VIEW_EDIT_SURFACE_AREA_CLASS_NAME} flex flex-col gap-1.5 overflow-hidden rounded border bg-[color:var(--kg-panel-bg)]/70 p-1.5`

export const CARD_TEXT_SURFACE_SCROLL_CLASS_NAME =
  'min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable]'

export const CARD_TEXT_SURFACE_VIEW_CLASS_NAME =
  `${UI_VIEW_EDIT_SURFACE_BOUNDS_CLASS_NAME} m-0 min-h-full select-none whitespace-pre-wrap break-words`

export const CARD_TEXT_SURFACE_EDIT_CLASS_NAME =
  UI_VIEW_EDIT_SURFACE_AREA_CLASS_NAME

export const CARD_TEXT_SURFACE_TEXT_CLASS_NAME =
  'text-xs font-medium leading-4 text-[color:var(--kg-text-secondary)] [scrollbar-gutter:stable]'
