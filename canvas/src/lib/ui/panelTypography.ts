import { createContext, useContext } from 'react'
import { normalizeSingleLineControlClassName } from './theme-tokens'
import { normalizeUiTextClasses } from 'grph-shared/ui/typography'
import { useGraphStore } from '@/hooks/useGraphStore'
import { cn } from '@/lib/utils'
import { useShallow } from 'zustand/react/shallow'
import { coercePanelTypography, PANEL_TYPOGRAPHY_DEFAULTS, type PanelTypography } from 'grph-shared/ui/panelTypography'

export type { PanelTypography } from 'grph-shared/ui/panelTypography'

// FloatingPanelShell supplies the body font. Its descendants use the pinned
// Design System roles even when other editors have custom typography saved.
export const FloatingPanelTypographyContext = createContext(false)
const sharedPanelTypography = coercePanelTypography(null)

export function usePanelTypography(): PanelTypography {
  const floating = useContext(FloatingPanelTypographyContext)
  return useGraphStore(
    useShallow(state => {
      if (floating) return sharedPanelTypography
      const fontClass = state.uiPanelTextFontClass || PANEL_TYPOGRAPHY_DEFAULTS.fontClass
      const textSizeClass = normalizeUiTextClasses(state.uiPanelKeyValueTextSizeClass || PANEL_TYPOGRAPHY_DEFAULTS.textSizeClass)
      const microLabelTextSizeClass =
        normalizeUiTextClasses(state.uiPanelMicroLabelTextSizeClass || state.uiIconBadgeChipTextSizeClass || PANEL_TYPOGRAPHY_DEFAULTS.microLabelTextSizeClass)
      const monospaceTextClass = normalizeUiTextClasses(state.uiPanelMonospaceTextClass || PANEL_TYPOGRAPHY_DEFAULTS.monospaceTextClass)
      const keyValueInputClass =
        normalizeSingleLineControlClassName(normalizeUiTextClasses(state.uiPanelKeyValueInputClass || PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass))
      return {
        fontClass,
        textSizeClass,
        microLabelTextSizeClass,
        monospaceTextClass,
        keyValueInputClass: cn(keyValueInputClass, fontClass, textSizeClass),
        keyLabelClass: cn(fontClass, textSizeClass),
        panelTextClass: cn(fontClass, textSizeClass),
        microLabelClass: cn(fontClass, microLabelTextSizeClass),
      }
    }),
  )
}
