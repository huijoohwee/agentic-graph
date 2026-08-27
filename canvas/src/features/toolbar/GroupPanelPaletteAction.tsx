import { Layers3 } from 'lucide-react'

import { useSelectionGrouping } from '@/components/canvas/useSelectionGrouping'
import FloatingPropsPanelMenuButton from '@/features/toolbar/FloatingPropsPanelMenuButton'
import { useGraphStore } from '@/hooks/useGraphStore'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { uiToolbarColumnMenuListClassName } from '@/features/toolbar/ui/toolbarStyles'
import { KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME } from 'grph-shared/ui/keyTypeValueRows'
import { GROUP_PANEL_INVOCATION } from '@/features/group-panel/groupPanelContract.mjs'

export function GroupPanelPaletteAction(props: { active: boolean }) {
  const panelTypography = usePanelTypography()
  const uiPanelKeyValueTextSizeClass = useGraphStore(state => state.uiPanelKeyValueTextSizeClass || KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME)
  const uiPanelTextFontClass = useGraphStore(state => state.uiPanelTextFontClass || 'font-sans')
  const grouping = useSelectionGrouping({ active: props.active })
  return (
    <aside className="border-b border-[var(--kg-border)]" aria-label="Group Panel controls">
      <header className="px-3 py-2">
        <h4 className={`font-semibold ${UI_THEME_TOKENS.text.primary} ${panelTypography.panelTextClass}`}>Group Panels</h4>
        <p className={`${panelTypography.microLabelClass} ${UI_THEME_TOKENS.text.secondary}`}>
          Select two or more cards, panels, or Group Panels to create a nested frame.
        </p>
      </header>
      <nav className="px-2 pb-2" aria-label="Group Panel palette items">
        <menu className={uiToolbarColumnMenuListClassName}>
          <li>
            <FloatingPropsPanelMenuButton
              disabled={!grouping.canGroupNodes}
              className="rounded-md"
              uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
              uiPanelTextFontClass={uiPanelTextFontClass}
              ariaLabel="Group Panel"
              title={grouping.canGroupNodes ? 'Create Group Panel from selection' : 'Select at least two canvas items'}
              onClick={grouping.groupNodes}
            >
              <span className="flex items-center gap-2">
                <Layers3 className="h-4 w-4 shrink-0" aria-hidden={true} />
                <span>
                  <span className="block font-medium">Group Panel</span>
                  <span className={`block ${panelTypography.microLabelClass} ${UI_THEME_TOKENS.text.secondary}`}>
                    Group selected canvas items
                  </span>
                </span>
              </span>
            </FloatingPropsPanelMenuButton>
          </li>
        </menu>
        <p className={`px-1 pt-1 ${panelTypography.microLabelClass} ${UI_THEME_TOKENS.text.secondary}`}>
          <code>{GROUP_PANEL_INVOCATION.command}</code>{' · '}
          <code>{GROUP_PANEL_INVOCATION.semantic}</code>{' · '}
          <code>{GROUP_PANEL_INVOCATION.binding}</code>{' · '}
          <code>{GROUP_PANEL_INVOCATION.qualifier}</code>
        </p>
        <p className={`px-1 ${panelTypography.microLabelClass} ${UI_THEME_TOKENS.text.secondary}`}>
          WebMCP · agenticgraph.control_local_group_panel
        </p>
      </nav>
    </aside>
  )
}
