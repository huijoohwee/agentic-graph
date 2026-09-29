import React from 'react'
import { EXPORT_UI_LABELS } from '@/lib/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  uiPrimaryIconActiveClassName,
  uiToolbarAreaActionRowClassName,
  uiToolbarAreaInsetStackClassName,
  uiToolbarAreaLabelClassName,
} from '@/features/toolbar/ui/toolbarStyles'
import { RICH_MEDIA_DISPLAY_COPY } from '@/lib/render/richMediaSsot'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

interface ToolbarSettingsAreaProps {
  onExportSettingsJsonLd: () => void
  isExportMenuOpen: boolean
  setIsExportMenuOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export function ToolbarSettingsArea({
  onExportSettingsJsonLd,
  isExportMenuOpen,
  setIsExportMenuOpen,
}: ToolbarSettingsAreaProps) {
  const renderMediaAsNodes = useGraphStore(s => s.renderMediaAsNodes)
  const setRenderMediaAsNodes = useGraphStore(s => s.setRenderMediaAsNodes)

  if (!isExportMenuOpen) {
    return null
  }

  return (
    <section className={uiToolbarAreaInsetStackClassName}>
      <section className={uiToolbarAreaActionRowClassName}>
        <label className={`${uiToolbarAreaLabelClassName} ${UI_THEME_TOKENS.text.primary}`}>
          <input
            type="checkbox"
            checked={renderMediaAsNodes}
            onChange={e => setRenderMediaAsNodes(e.target.checked)}
            className={`${UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME} rounded ${UI_THEME_TOKENS.input.border} ${uiPrimaryIconActiveClassName} ${UI_THEME_TOKENS.input.selectionControl}`}
          />
          {RICH_MEDIA_DISPLAY_COPY.toggleTitle}
        </label>
        <span className={`text-xs ${UI_THEME_TOKENS.text.tertiary}`}>
          {RICH_MEDIA_DISPLAY_COPY.tooltip}
        </span>
        <button
          type="button"
          className={`App-toolbar__btn text-xs ${UI_THEME_TOKENS.button.neutralSubtle} ${UI_THEME_TOKENS.button.hoverBg}`}
          onClick={() => {
            onExportSettingsJsonLd()
            setIsExportMenuOpen(false)
          }}
        >
          {EXPORT_UI_LABELS.exportSettingsJsonLd}
        </button>
      </section>
    </section>
  )
}
