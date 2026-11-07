import { normalizeSingleLineControlClassName } from './theme-tokens'
import { normalizeUiTextClasses } from 'grph-shared/ui/typography'
import { useGraphStore } from '@/hooks/useGraphStore'
import { cn } from '@/lib/utils'
import { useShallow } from 'zustand/react/shallow'
import { PANEL_TYPOGRAPHY_DEFAULTS, type PanelTypography } from 'grph-shared/ui/panelTypography'

export type { PanelTypography } from 'grph-shared/ui/panelTypography'

export function usePanelTypography(): PanelTypography {
  return useGraphStore(
    useShallow(state => {
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
