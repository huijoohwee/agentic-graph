import { normalizeUiTextClasses } from './typography.js'
import { UI_THEME_TOKENS, normalizeSingleLineControlClassName } from './themeTokens.js'

export type PanelTypography = {
  fontClass: string
  textSizeClass: string
  microLabelTextSizeClass: string
  monospaceTextClass: string
  keyValueInputClass: string
  keyLabelClass: string
  panelTextClass: string
  microLabelClass: string
}

export type PanelTypographyDensityPreset = 'comfortable' | 'compact'

export const PANEL_KEY_VALUE_INPUT_CLASS_BY_TEXT_SIZE = {
  textSm: `w-full ${UI_THEME_TOKENS.control.singleLine} text-sm border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.input.text} rounded text-right ${UI_THEME_TOKENS.focus.primaryBorderRing}`,
  textXs: `w-full ${UI_THEME_TOKENS.control.singleLine} text-xs border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.input.text} rounded text-right ${UI_THEME_TOKENS.focus.primaryBorderRing}`,
} as const

export const PANEL_TYPOGRAPHY_DEFAULTS = {
  fontClass: 'font-sans',
  textSizeClass: 'text-sm',
  microLabelTextSizeClass: 'text-xs',
  monospaceTextClass: 'font-mono text-xs',
  keyValueInputClass: PANEL_KEY_VALUE_INPUT_CLASS_BY_TEXT_SIZE.textSm,
} as const

export const PANEL_TYPOGRAPHY_DENSITY_PRESETS: Record<PanelTypographyDensityPreset, Pick<
  PanelTypography,
  'fontClass' | 'textSizeClass' | 'microLabelTextSizeClass' | 'monospaceTextClass' | 'keyValueInputClass'
>> = {
  comfortable: {
    fontClass: PANEL_TYPOGRAPHY_DEFAULTS.fontClass,
    textSizeClass: PANEL_TYPOGRAPHY_DEFAULTS.textSizeClass,
    microLabelTextSizeClass: 'text-xs',
    monospaceTextClass: PANEL_TYPOGRAPHY_DEFAULTS.monospaceTextClass,
    keyValueInputClass: PANEL_KEY_VALUE_INPUT_CLASS_BY_TEXT_SIZE.textSm,
  },
  compact: {
    fontClass: PANEL_TYPOGRAPHY_DEFAULTS.fontClass,
    textSizeClass: 'text-xs',
    microLabelTextSizeClass: PANEL_TYPOGRAPHY_DEFAULTS.microLabelTextSizeClass,
    monospaceTextClass: PANEL_TYPOGRAPHY_DEFAULTS.monospaceTextClass,
    keyValueInputClass: PANEL_KEY_VALUE_INPUT_CLASS_BY_TEXT_SIZE.textXs,
  },
} as const

export function coercePanelTypography(input: Partial<PanelTypography> | null | undefined): PanelTypography {
  const fontClass =
    typeof input?.fontClass === 'string' && input.fontClass.trim() ? input.fontClass.trim() : PANEL_TYPOGRAPHY_DEFAULTS.fontClass
  const textSizeClass =
    typeof input?.textSizeClass === 'string' && input.textSizeClass.trim()
      ? normalizeUiTextClasses(input.textSizeClass.trim())
      : PANEL_TYPOGRAPHY_DEFAULTS.textSizeClass
  const microLabelTextSizeClass =
    typeof input?.microLabelTextSizeClass === 'string' && input.microLabelTextSizeClass.trim()
      ? normalizeUiTextClasses(input.microLabelTextSizeClass.trim())
      : PANEL_TYPOGRAPHY_DEFAULTS.microLabelTextSizeClass
  const monospaceTextClass =
    typeof input?.monospaceTextClass === 'string' && input.monospaceTextClass.trim()
      ? normalizeUiTextClasses(input.monospaceTextClass.trim())
      : PANEL_TYPOGRAPHY_DEFAULTS.monospaceTextClass
  const keyValueInputClass =
    typeof input?.keyValueInputClass === 'string' && input.keyValueInputClass.trim()
      ? normalizeSingleLineControlClassName(normalizeUiTextClasses(input.keyValueInputClass.trim()))
      : PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass
  const keyLabelClass = typeof input?.keyLabelClass === 'string' && input.keyLabelClass.trim()
    ? normalizeUiTextClasses(input.keyLabelClass.trim())
    : `${fontClass} ${textSizeClass}`
  const panelTextClass = typeof input?.panelTextClass === 'string' && input.panelTextClass.trim()
    ? normalizeUiTextClasses(input.panelTextClass.trim())
    : `${fontClass} ${textSizeClass}`
  const microLabelClass = typeof input?.microLabelClass === 'string' && input.microLabelClass.trim()
    ? normalizeUiTextClasses(input.microLabelClass.trim())
    : `${fontClass} ${microLabelTextSizeClass}`
  return {
    fontClass,
    textSizeClass,
    microLabelTextSizeClass,
    monospaceTextClass,
    keyValueInputClass,
    keyLabelClass,
    panelTextClass,
    microLabelClass,
  }
}
