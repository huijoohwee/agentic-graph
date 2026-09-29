import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useDesignWireframeSettings } from '@/features/toolbar/hooks/useDesignWireframeSettings'
import { clearWebpageIframeSrcdocCaches } from '@/lib/websites/webpageIframeSrcdoc'
import { clearCachedWebpageLayoutSnapshots } from '@/lib/websites/webpageLayoutCache'
import {
  ResponsiveNumberRow as NumberRow,
  ResponsiveToggleRow as ToggleRow,
} from '@/lib/ui/responsiveControlRows'
import { uiToolbarSettingsPanelBodyClassName } from '@/features/toolbar/ui/toolbarStyles'

export function DesignWireframeSettings() {
  const { settings, setSettings, resetSettings } = useDesignWireframeSettings()
  const uiPanelTextFontClass = useGraphStore(s => s.uiPanelTextFontClass || '')
  const uiPanelKeyValueTextSizeClass = useGraphStore(s => s.uiPanelKeyValueTextSizeClass || 'text-xs')
  const bumpDesignWireframeCacheEpoch = useGraphStore(s => s.bumpDesignWireframeCacheEpoch)

  return (
    <CollapsibleSection title="Design wireframe" defaultCollapsed={false} stickyHeader={false} headerClassName={`px-2 ${uiPanelTextFontClass}`}>
      <section className={uiToolbarSettingsPanelBodyClassName}>
        <section className={`text-xs ${UI_THEME_TOKENS.text.secondary} leading-snug`}>
          Controls for webpage source-url wireframes (layout fidelity, grouping cues, label readability).
        </section>
        <ToggleRow label="Show edges" value={settings.showEdges} onChange={v => setSettings({ showEdges: v })} />
        <ToggleRow label="Show labels" value={settings.showLabelChips} onChange={v => setSettings({ showLabelChips: v })} />
        <ToggleRow label="Show label meta" value={settings.showMetaChips} onChange={v => setSettings({ showMetaChips: v })} />
        <ToggleRow label="Avoid label collisions" value={settings.avoidLabelCollisions} onChange={v => setSettings({ avoidLabelCollisions: v })} />
        <ToggleRow label="Show text preview" value={settings.showTextPreview} onChange={v => setSettings({ showTextPreview: v })} />
        <ToggleRow label="Show media preview" value={settings.showMediaPreview} onChange={v => setSettings({ showMediaPreview: v })} />
        <ToggleRow label="Depth fade" value={settings.depthFade} onChange={v => setSettings({ depthFade: v })} />
        <NumberRow label="Max edges" value={settings.maxEdges} min={0} max={5000} onChange={v => setSettings({ maxEdges: v })} />
        <NumberRow label="Max label chars" value={settings.maxLabelChars} min={8} max={140} onChange={v => setSettings({ maxLabelChars: v })} />
        <section className="pt-1 flex justify-end gap-2">
          <button
            type="button"
            className={`App-toolbar__btn text-xs border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.text.primary} ${uiPanelTextFontClass} ${uiPanelKeyValueTextSizeClass}`}
            onClick={() => {
              try { clearCachedWebpageLayoutSnapshots() } catch { void 0 }
              try { clearWebpageIframeSrcdocCaches() } catch { void 0 }
              try { bumpDesignWireframeCacheEpoch() } catch { void 0 }
            }}
          >
            Clear cache
          </button>
          <button
            type="button"
            className={`App-toolbar__btn text-xs border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.text.primary} ${uiPanelTextFontClass} ${uiPanelKeyValueTextSizeClass}`}
            onClick={resetSettings}
          >
            Reset
          </button>
        </section>
      </section>
    </CollapsibleSection>
  )
}
