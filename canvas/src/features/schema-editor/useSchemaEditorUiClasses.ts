import { usePanelTypography } from '@/lib/ui/panelTypography'

export function useSchemaEditorUiClasses() {
  const typography = usePanelTypography()
  return {
    uiPanelKeyValueInputClass: typography.keyValueInputClass,
    uiPanelMonospaceTextClass: typography.monospaceTextClass,
    uiPanelKeyValueTextSizeClass: typography.panelTextClass,
    uiPanelMicroLabelTextSizeClass: typography.microLabelClass,
  }
}
