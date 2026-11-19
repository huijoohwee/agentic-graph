import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME } from 'grph-shared/ui/keyTypeValueRows'
import { HELP_STEP_COPY } from '@/features/panels/config'
import { buildMainPanelTabKtvRows, loadMainPanelTabKtvRows, type MainPanelTabKtvRow } from '@/features/panels/mainPanelTabDescriptions'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  HelpKtvMutedText,
  HelpKtvRow,
  HelpKtvRows,
  HelpKtvValueStack,
} from './HelpKtvLayout'

interface HelpPanelTourSectionProps {
  collapsed: boolean
  onToggle: (next: boolean) => void
}

export function HelpPanelTourSection({ collapsed, onToggle }: HelpPanelTourSectionProps) {
  const [mainPanelTabRows, setMainPanelTabRows] = React.useState<MainPanelTabKtvRow[]>(() => buildMainPanelTabKtvRows([]))
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME,
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )

  React.useEffect(() => {
    let alive = true
    loadMainPanelTabKtvRows().then(rows => {
      if (!alive) return
      setMainPanelTabRows(rows)
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <CollapsibleSection
      headingAs="h3"
      title={HELP_STEP_COPY.panelTour.title}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      {HELP_STEP_COPY.panelTour.descriptionShort && (
        <section className={`${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${UI_THEME_TOKENS.text.secondary} mb-2`}>
          {HELP_STEP_COPY.panelTour.descriptionShort}
        </section>
      )}
      <HelpKtvRows>
        {mainPanelTabRows.map(row => (
          <HelpKtvRow
            key={row.key}
            keyNode={row.label}
            iconKey={row.typeIconKey}
            valueNode={(
              <HelpKtvValueStack>
                <HelpKtvMutedText>{row.value}</HelpKtvMutedText>
              </HelpKtvValueStack>
            )}
          />
        ))}
      </HelpKtvRows>
    </CollapsibleSection>
  )
}
