import { UI_TEXT_SCALE } from 'grph-shared/ui/typography'
import { tailwindTextSizeClassToPx } from 'grph-shared/ui/tailwindTextSize'

export const getMarkdownHeadingTextSizeClass = (args: { depth: number; presentation: boolean }): string => {
  const depth = Math.min(6, Math.max(1, Math.floor(args.depth)))
  const presentation = args.presentation === true
  if (presentation) {
    if (depth === 1) return 'text-5xl'
    if (depth === 2) return 'text-4xl'
    if (depth === 3) return 'text-3xl'
    if (depth === 4) return 'text-2xl'
    if (depth === 5) return 'text-xl'
    return 'text-lg'
  }
  if (depth === 1) return 'text-4xl'
  if (depth === 2) return 'text-3xl'
  if (depth === 3) return 'text-2xl'
  if (depth === 4) return 'text-xl'
  if (depth === 5) return 'text-lg'
  return 'text-base'
}

export const getMarkdownHeadingFontSizePx = (args: { depth: number; presentation: boolean }): number => {
  return tailwindTextSizeClassToPx(getMarkdownHeadingTextSizeClass(args)) ?? UI_TEXT_SCALE.base.size
}

export const getMarkdownBodyFontSizePx = (args: { presentation: boolean }): number => {
  return args.presentation ? UI_TEXT_SCALE.lg.size : UI_TEXT_SCALE.sm.size
}
