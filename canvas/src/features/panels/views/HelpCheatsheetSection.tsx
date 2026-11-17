import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME } from 'grph-shared/ui/keyTypeValueRows'
import Tooltip from 'agentic-design-system/react/hover'
import { HELP_STEP_COPY } from '@/features/panels/config'
import {
  loadMainPanelHelpCheatsheetTexts,
  type MainPanelHelpCheatsheetText,
} from '@/features/panels/mainPanelHelpCheatsheet'
import { HELP_CHEATSHEET_ALIGNMENT_TOOLTIP, UI_ANCHORS, UI_COPY, UI_LABELS } from '@/lib/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  HelpKtvMutedText,
  HelpKtvRow,
  HelpKtvRows,
  HelpKtvValueStack,
} from './HelpKtvLayout'

interface BehaviorRow {
  textKey: string
  mode: string
}

interface HelpCheatsheetSectionProps {
  collapsed: boolean
  onToggle: (next: boolean) => void
}

const EMPTY_CHEATSHEET_TEXT: MainPanelHelpCheatsheetText = {
  key: '',
  gesture: '',
  value: '',
  details: [],
}

export function HelpCheatsheetSection({ collapsed, onToggle }: HelpCheatsheetSectionProps) {
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME,
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )

  const behaviorRows = React.useMemo<BehaviorRow[]>(
    () => [
      {
        textKey: 'select.single',
        mode: 'Select: single',
      },
      {
        textKey: 'zoom.fitSelection',
        mode: `${UI_COPY.toolbarPrefix} ${UI_LABELS.fitToScreen} / ${UI_LABELS.zoomToSelection}`,
      },
      {
        textKey: 'select.multi',
        mode: `${UI_COPY.toolbarPrefix} ${UI_LABELS.multiSelectMode}`,
      },
      {
        textKey: 'layout.radial',
        mode: `${UI_COPY.toolbarPrefix} ${UI_LABELS.radialLayoutMode}`,
      },
      {
        textKey: 'graph.layers',
        mode: `${UI_COPY.toolbarPrefix} ${UI_LABELS.graphLayersMode}`,
      },
      {
        textKey: 'create.shiftDrag',
        mode: 'Create: shift-drag',
      },
      {
        textKey: 'create.clickSourceTarget',
        mode: 'Create: click-source-target',
      },
      {
        textKey: 'create.panelOnly',
        mode: 'Create: panel-only',
      },
    ],
    [],
  )
  const [cheatsheetTextByKey, setCheatsheetTextByKey] = React.useState<Record<string, MainPanelHelpCheatsheetText>>({})

  React.useEffect(() => {
    let alive = true
    loadMainPanelHelpCheatsheetTexts().then(rows => {
      if (!alive) return
      setCheatsheetTextByKey(rows)
    })
    return () => {
      alive = false
    }
  }, [])

  const getCheatsheetText = React.useCallback(
    (key: string): MainPanelHelpCheatsheetText => cheatsheetTextByKey[key] || EMPTY_CHEATSHEET_TEXT,
    [cheatsheetTextByKey],
  )

  return (
    <CollapsibleSection
      title={(
        <Tooltip
          content={HELP_CHEATSHEET_ALIGNMENT_TOOLTIP}
          maxWidthPx={260}

        >
          <span className="inline-flex items-center gap-1">
            <span>{HELP_STEP_COPY.cheatsheet.title}</span>
          </span>
        </Tooltip>
      )}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      {HELP_STEP_COPY.cheatsheet.descriptionShort && (
        <section className={`${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${UI_THEME_TOKENS.text.secondary} mb-2`}>
          {HELP_STEP_COPY.cheatsheet.descriptionShort}
        </section>
      )}
      <HelpKtvRows>
        {behaviorRows.map(row => {
          const isGraphLayerRow =
            row.mode === `${UI_COPY.toolbarPrefix} ${UI_LABELS.graphLayersMode}`
          const text = getCheatsheetText(row.textKey)
          return (
            <HelpKtvRow
              key={row.mode}
              keyNode={row.mode}
              iconKey={isGraphLayerRow ? 'ktv.type.tiles' : 'ktv.type.action'}
              dataKgAnchor={isGraphLayerRow ? UI_ANCHORS.helpGraphLayers : undefined}
              valueNode={(
                <HelpKtvValueStack>
                  {text.value ? <HelpKtvMutedText>{text.value}</HelpKtvMutedText> : null}
                </HelpKtvValueStack>
              )}
            />
          )
        })}
      </HelpKtvRows>
    </CollapsibleSection>
  )
}
