import React from 'react'
import CollapsibleSubsection from '@/features/panels/ui/CollapsibleSubsection'
import { KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME } from 'grph-shared/ui/keyTypeValueRows'
import { RightAlignedTooltipInput } from '@/features/panels/ui/RightAlignedTooltipInput'
import { SimpleKeyValueRow } from 'grph-shared/react/keyTypeValueRow'
import type { ExampleConfig, ExampleId } from '@/features/parsers/examplesCatalog'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_TOOLBAR_FIELD_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { useGympgrphExternalStore } from '@/lib/gympgrph/externalStore'
import { openMarkdownWorkspaceEditorPane } from '@/features/workspace-table/workspaceTableSsot'
import { PanelSelect } from '@/lib/ui/panelFormControls'

export function WorkspaceActionsPanel(props: { examples: ExampleConfig[]; onApplyExample: (exampleId: ExampleId) => void }) {
  const { examples, onApplyExample } = props
  const uiPanelKeyValueTextSizeClass = useGraphStore(s => s.uiPanelKeyValueTextSizeClass || KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME)
  const uiPanelTextFontClass = useGraphStore(s => s.uiPanelTextFontClass || 'font-sans')
  const uiPanelRowDensityCompactClass = useGraphStore(
    s => s.uiPanelRowDensityCompactClass || 'py-0.5',
  )

  const [selectedExampleId, setSelectedExampleId] = React.useState<string>('')

  const {
    geospatialDatasetTimeoutMs,
    setGeospatialDatasetTimeoutMs,
    geospatialDatasetMaxBytes,
    setGeospatialDatasetMaxBytes,
  } = useGympgrphExternalStore(s => ({
    geospatialDatasetTimeoutMs: s.geospatialDatasetTimeoutMs,
    setGeospatialDatasetTimeoutMs: s.setGeospatialDatasetTimeoutMs,
    geospatialDatasetMaxBytes: s.geospatialDatasetMaxBytes,
    setGeospatialDatasetMaxBytes: s.setGeospatialDatasetMaxBytes,
  }))

  const handleOpenMarkdownSourceFiles = React.useCallback(() => {
    openMarkdownWorkspaceEditorPane(useGraphStore.getState())
  }, [])

  return (
    <section className="px-2 py-1" aria-label="Workspace actions">
      <CollapsibleSubsection title="Sample Dataset" defaultCollapsed={true}>
        <section className="px-1">
          <PanelSelect
            className={`w-full ${UI_RESPONSIVE_TOOLBAR_FIELD_CLASSNAME} px-2 rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.input.text} ${uiPanelTextFontClass} ${uiPanelKeyValueTextSizeClass}`}
            value={selectedExampleId}
            onValueChange={selectedValueInput => {
              const id = selectedValueInput
              setSelectedExampleId(id)
              if (id) onApplyExample(id as ExampleId)
              setTimeout(() => setSelectedExampleId(''), 0)
            }}
            aria-label="Sample dataset"
          >
            <option value="">Select an example…</option>
            {examples.map(example => (
              <option key={example.id} value={example.id}>{example.label}</option>
            ))}
          </PanelSelect>
        </section>
      </CollapsibleSubsection>

      <CollapsibleSubsection title="Dataset fetch limits">
        <section className="space-y-1">
          <SimpleKeyValueRow
            label="Timeout (ms)"
            className="px-1"
            textSizeClassName={uiPanelKeyValueTextSizeClass}
            fontClassName={uiPanelTextFontClass}
            densityClassName={uiPanelRowDensityCompactClass}
          >
            <RightAlignedTooltipInput
              tooltip="Bounded fetch timeout. Range: 1,000–60,000 ms."
              type="number"
              min={1000}
              max={60000}
              step={500}
              value={geospatialDatasetTimeoutMs}
              onChange={e => setGeospatialDatasetTimeoutMs(Number(e.target.value))}
              onClick={e => e.stopPropagation()}
            />
          </SimpleKeyValueRow>
          <SimpleKeyValueRow
            label="Max bytes"
            className="px-1"
            textSizeClassName={uiPanelKeyValueTextSizeClass}
            fontClassName={uiPanelTextFontClass}
            densityClassName={uiPanelRowDensityCompactClass}
          >
            <RightAlignedTooltipInput
              tooltip="Bounded fetch size. Range: 64 KB–50 MB."
              type="number"
              min={64 * 1024}
              max={50 * 1024 * 1024}
              step={256 * 1024}
              value={geospatialDatasetMaxBytes}
              onChange={e => setGeospatialDatasetMaxBytes(Number(e.target.value))}
              onClick={e => e.stopPropagation()}
            />
          </SimpleKeyValueRow>
        </section>
      </CollapsibleSubsection>

      <CollapsibleSubsection title="Source Files">
        <section className="px-1" aria-label="Source Files">
          <p className={`${uiPanelTextFontClass} ${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.secondary}`}>
            Source Files are managed in the Editor workspace.
          </p>
          <button
            type="button"
            className={`mt-1 ${UI_THEME_TOKENS.badge.chip} px-2 py-1 ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
            onClick={() => handleOpenMarkdownSourceFiles()}
            aria-label="Open Source Files"
            title="Open Source Files"
          >
            Open Markdown
          </button>
        </section>
      </CollapsibleSubsection>
    </section>
  )
}
