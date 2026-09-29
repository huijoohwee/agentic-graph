import React from 'react'
import type { GraphData, JSONValue } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import type { MonacoTextEditorProps } from '@/features/monaco/MonacoTextEditor'
import {
  GRAPH_FIELD_TYPES,
  getCachedResolvedFieldSettingsById,
  inferFieldTypeFromGraphData,
  type GraphField,
  type GraphFieldSettingsById,
  type GraphFieldSettings,
  type GraphFieldType,
  type GraphFieldSettingsResolved,
} from '@/features/graph-fields/graphFields'
import { type GraphDataTableColumnKey } from '@/features/graph-data-table/graphDataTable'
import {
  CurrencySection,
  DecimalPlacesSection,
  DefaultValueSection,
  SelectOptionsSection,
  UrlProtocolSection,
} from '@/features/panels/views/graph-fields/FieldSettingsSections'
import Tooltip from '@/features/panels/ui/Tooltip'
import {
  GRAPH_FIELDS_DESCRIPTION_TOOLTIP_TEXT,
  UI_COPY,
  UI_LABELS,
} from '@/lib/config.copy'
import { computeFilteredLists } from '@/features/schema-editor/utils'
import { useGraphStore } from '@/hooks/useGraphStore'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import FieldSchemaSection from '@/features/panels/views/graph-fields/FieldSchemaSection'
import FieldStylesSection from '@/features/panels/views/graph-fields/FieldStylesSection'
import FieldLayoutSection from '@/features/panels/views/graph-fields/FieldLayoutSection'
import FieldEndpointsAndCardinalitySection from '@/features/panels/views/graph-fields/FieldEndpointsAndCardinalitySection'
import FieldLocalSchemaSection from '@/features/panels/views/graph-fields/FieldLocalSchemaSection'
import AdvancedSection from '@/features/schema-editor/AdvancedSection'
import SchemaUiEditor from '@/features/schema/ui/SchemaUiEditor'
import type { GraphFieldsSelectedView } from '@/features/panels/views/GraphFieldsView'
import { FieldGraphLayersSection, GraphLayerMetadataPresetsSection } from '@/features/panels/views/graph-fields/FieldGraphLayersSection'
import {
  GraphFieldsCompactCheckbox,
  GraphFieldsComfortableFieldSelect,
  GraphFieldsComfortableTextInput,
} from '@/features/panels/views/graph-fields/GraphFieldsPanelControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { MainPanelSettingsPanelShell } from '@/features/panels/ui/MainPanelSettingsPanelShell'
import { MAIN_PANEL_SETTINGS_DROPDOWN_SELECT_CLASSNAME } from '@/features/panels/ui/mainPanelSettingsSelectClass'
import { uiToolbarButtonNeutralClassName } from '@/features/toolbar/ui/toolbarStyles'
import { GRAPH_FIELDS_FIELD_GRID_CLASS_NAME } from '@/features/panels/views/graph-fields/graphFieldResponsiveClasses'
import {
  UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME,
  UI_RESPONSIVE_GRAPH_FIELDS_DESCRIPTION_EDITOR_CLASSNAME,
  UI_RESPONSIVE_GRAPH_FIELDS_COMFORTABLE_FIELD_INPUT_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

const MonacoTextEditorLazy = React.lazy(async (): Promise<{ default: React.ComponentType<MonacoTextEditorProps> }> =>
  import('@/features/monaco/MonacoTextEditor').then(mod => ({ default: mod.MonacoTextEditor })),
)

type FieldSettingsPanelProps = {
  graphData: GraphData | null
  selectedField: GraphField | null
  selectedGlobalView: GraphFieldsSelectedView
  setSelectedGlobalView: React.Dispatch<React.SetStateAction<GraphFieldsSelectedView>>
  settingsById: GraphFieldSettingsById
  patchGraphFieldSetting: (fieldId: GraphField['id'], patch: Partial<GraphFieldSettings>) => void
  removeGraphFieldSetting: (fieldId: GraphField['id']) => void
  onResync: () => void
  onStatusChange: (msg: string) => void
}

export default function FieldSettingsPanel({
  graphData,
  selectedField,
  selectedGlobalView,
  setSelectedGlobalView,
  settingsById,
  patchGraphFieldSetting,
  removeGraphFieldSetting,
  onResync,
  onStatusChange,
}: FieldSettingsPanelProps) {
  const selectedFieldResolvedSettingsById = React.useMemo(() => {
    if (!selectedField) return null
    return getCachedResolvedFieldSettingsById({
      fields: [selectedField],
      settingsById,
    })
  }, [selectedField, settingsById])

  const selectedSettings = React.useMemo<GraphFieldSettingsResolved | null>(() => {
    if (!selectedField) return null
    return selectedFieldResolvedSettingsById?.get(selectedField.id) || null
  }, [selectedField, selectedFieldResolvedSettingsById])
  const suggestedFieldType = React.useMemo(
    () => inferFieldTypeFromGraphData(graphData, selectedField),
    [graphData, selectedField],
  )
  const panelTypography = usePanelTypography()
  const { textSizeClass: uiPanelKeyValueTextSizeClass, fontClass: uiPanelTextFontClass,
    monospaceTextClass: uiPanelMonospaceTextClass } = panelTypography
  const uiPanelRowDensityCompactClass = useGraphStore(
    s => s.uiPanelRowDensityCompactClass || 'py-0.5',
  )
  const secondaryActionButtonClassName = `App-toolbar__btn ${uiPanelKeyValueTextSizeClass} border ${UI_THEME_TOKENS.input.border} ${uiToolbarButtonNeutralClassName}`
  const fieldLabelClassName = `${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.primary}`
  const fieldHintClassName = `${panelTypography.microLabelClass} ${UI_THEME_TOKENS.text.tertiary}`
  const compactCheckboxClassName = UI_RESPONSIVE_COMPACT_SELECTION_CONTROL_CLASSNAME
  const comfortableInputClassName = `${UI_RESPONSIVE_GRAPH_FIELDS_COMFORTABLE_FIELD_INPUT_CLASSNAME} w-full`
  const comfortableSelectClassName = [
    MAIN_PANEL_SETTINGS_DROPDOWN_SELECT_CLASSNAME,
    UI_RESPONSIVE_GRAPH_FIELDS_COMFORTABLE_FIELD_INPUT_CLASSNAME,
    'w-full text-left',
  ].join(' ')
  const schema = useGraphStore(s => s.schema)
  const setSchema = useGraphStore(s => s.setSchema)

  const { uniqueNodeTypes, uniqueEdgeLabels } = React.useMemo(() => {
    if (!schema) {
      return { uniqueNodeTypes: [] as string[], uniqueEdgeLabels: [] as string[] }
    }
    return computeFilteredLists(graphData, schema)
  }, [graphData, schema])
  const localSchemaNodeTypes = React.useMemo(() => {
    if (!schema) return uniqueNodeTypes
    const nodeSchemaKeys = Object.keys(schema.propertySchemas?.node ?? {})
    const both = uniqueNodeTypes.filter(t => nodeSchemaKeys.includes(t))
    return both.length > 0 ? both : uniqueNodeTypes
  }, [schema, uniqueNodeTypes])
  const localSchemaEdgeLabels = React.useMemo(() => {
    if (!schema) return uniqueEdgeLabels
    const edgeSchemaKeys = Object.keys(schema.propertySchemas?.edge ?? {})
    const both = uniqueEdgeLabels.filter(l => edgeSchemaKeys.includes(l))
    return both.length > 0 ? both : uniqueEdgeLabels
  }, [schema, uniqueEdgeLabels])

  const filteredNodeTypesForSelectedField = React.useMemo<string[] | undefined>(() => {
    if (!schema) return undefined
    if (!selectedField) return undefined
    if (selectedField.scope !== 'node') return undefined
    const nodeSchemas = schema.propertySchemas?.node ?? {}
    const result: string[] = []
    for (const [typeKey, props] of Object.entries(nodeSchemas)) {
      if (props && Object.prototype.hasOwnProperty.call(props, selectedField.key)) {
        result.push(typeKey)
      }
    }
    return result.length > 0 ? result : undefined
  }, [schema, selectedField])

  const filteredEdgeLabelsForSelectedField = React.useMemo<string[] | undefined>(() => {
    if (!schema) return undefined
    if (!selectedField) return undefined
    if (selectedField.scope !== 'edge') return undefined
    const edgeSchemas = schema.propertySchemas?.edge ?? {}
    const result: string[] = []
    for (const [label, props] of Object.entries(edgeSchemas)) {
      if (props && Object.prototype.hasOwnProperty.call(props, selectedField.key)) {
        result.push(label)
      }
    }
    return result.length > 0 ? result : undefined
  }, [schema, selectedField])

  const preferredSchemaOwnerKey = React.useMemo<string | undefined>(() => {
    if (!selectedField) return undefined
    if (selectedField.scope === 'node') {
      return filteredNodeTypesForSelectedField?.[0]
    }
    if (selectedField.scope === 'edge') {
      return filteredEdgeLabelsForSelectedField?.[0]
    }
    return undefined
  }, [selectedField, filteredNodeTypesForSelectedField, filteredEdgeLabelsForSelectedField])

  const ownerCandidatesForSelectedField = React.useMemo<string[]>(() => {
    if (!selectedField) return []
    return selectedField.scope === 'node' ? localSchemaNodeTypes : localSchemaEdgeLabels
  }, [localSchemaEdgeLabels, localSchemaNodeTypes, selectedField])

  const schemaOwnerKey = React.useMemo(() => {
    if (!selectedField || !schema) return ''
    if (preferredSchemaOwnerKey && ownerCandidatesForSelectedField.includes(preferredSchemaOwnerKey)) {
      return preferredSchemaOwnerKey
    }
    return ownerCandidatesForSelectedField[0] ?? ''
  }, [selectedField, schema, preferredSchemaOwnerKey, ownerCandidatesForSelectedField])

  const updateSelectedSettings = React.useCallback(
    (patch: Partial<GraphFieldSettingsResolved>) => {
      if (!selectedField || !selectedSettings) return
      patchGraphFieldSetting(selectedField.id, { ...selectedSettings, ...patch })
      if (typeof patch.isHidden === 'boolean') {
        const state = useGraphStore.getState()
        const key = `prop:${selectedField.scope}:${selectedField.key}` as GraphDataTableColumnKey
        const current = state.graphDataTableVisibleColumns
        state.setGraphDataTableVisibleColumns({
          ...current,
          [key]: patch.isHidden ? false : true,
        })
      }
    },
    [patchGraphFieldSetting, selectedField, selectedSettings],
  )

  const resetSelectedSettings = React.useCallback(() => {
    if (!selectedField) return
    removeGraphFieldSetting(selectedField.id)
  }, [removeGraphFieldSetting, selectedField])

  const setSelectedDefaultValue = React.useCallback(
    (defaultValue: JSONValue | null) => {
      updateSelectedSettings({ defaultValue })
    },
    [updateSelectedSettings],
  )

  const selectedFieldSampleCount = selectedField ? selectedField.samples : null

  const [stylesCollapsed, setStylesCollapsed] = React.useState(false)
  const [schemaExtrasCollapsed, setSchemaExtrasCollapsed] = React.useState(true)

  const secondaryLabel = React.useMemo(() => {
    if (selectedGlobalView?.kind === 'globalSchema') {
      return UI_LABELS.globalSchema
    }
    if (selectedGlobalView?.kind === 'localSchema') {
      const categoryLabel =
        selectedGlobalView.category === 'global'
          ? UI_LABELS.globalFields
          : selectedGlobalView.category === 'base'
            ? UI_LABELS.baseFields
            : selectedGlobalView.category === 'custom'
              ? UI_LABELS.customFields
              : UI_LABELS.derivedFields
      const facetLabel =
        selectedGlobalView.facet === 'template'
          ? UI_COPY.graphFieldsLocalSchemaFacetTemplateJsonLabel
          : selectedGlobalView.facet === 'properties'
            ? UI_COPY.graphFieldsLocalSchemaFacetPropertiesLabel
            : selectedGlobalView.facet === 'validation'
              ? UI_COPY.graphFieldsLocalSchemaFacetValidationLabel
              : UI_COPY.graphFieldsLocalSchemaFacetLocalRulesLabel
      const scopeLabel =
        selectedGlobalView.scope === 'node'
          ? UI_COPY.graphFieldsScopeNodeLabel
          : UI_COPY.graphFieldsScopeEdgeLabel
      const owner = selectedGlobalView.ownerKey || '—'
      const facetSegment =
        selectedGlobalView.facet === 'template'
          ? 'template'
          : selectedGlobalView.facet === 'properties'
            ? 'properties'
            : selectedGlobalView.facet === 'validation'
              ? 'validation'
              : 'localRules'
      const scopeSegment = selectedGlobalView.scope === 'node' ? 'node' : 'edge'
      const path = `local:schema:${facetSegment}:${scopeSegment}:${owner}`
      return `${categoryLabel} · ${facetLabel} · ${scopeLabel} · ${owner} (${path})`
    }
    if (selectedField) {
      return `${
        selectedField.scope === 'node'
          ? UI_COPY.graphFieldsScopeNodeLabel
          : UI_COPY.graphFieldsScopeEdgeLabel
      } · ${selectedField.key}`
    }
    return '—'
  }, [selectedField, selectedGlobalView])

  React.useEffect(() => {
    if (!selectedField || !selectedSettings) return
    if (!suggestedFieldType) return
    const raw = settingsById[selectedField.id]
    if (raw?.fieldType) return
    patchGraphFieldSetting(selectedField.id, { ...selectedSettings, fieldType: suggestedFieldType })
  }, [patchGraphFieldSetting, selectedField, selectedSettings, settingsById, suggestedFieldType])

  return (
    <MainPanelSettingsPanelShell
      ariaLabel={UI_LABELS.fieldSettings}
      uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
      titleNode={
        <Tooltip
          content={UI_COPY.graphFieldsAgenticFieldSettingsDescription}
          maxWidthPx={420}

          className="min-w-0"
        >
          <section className={`${uiPanelKeyValueTextSizeClass} truncate`}>{UI_LABELS.fieldSettings}</section>
        </Tooltip>
      }
      secondaryNode={secondaryLabel}
    >
        {selectedGlobalView?.kind === 'globalSchema' ? (
          <section className="p-3 space-y-3">
            {schema ? (
              <section className={`rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-3`}>
                <section className={`flex items-center justify-between ${uiPanelKeyValueTextSizeClass}`}>
                  <span className={UI_THEME_TOKENS.text.primary}>Voxel animation</span>
                  <GraphFieldsCompactCheckbox
                    className={compactCheckboxClassName}
                    checked={schema.three?.voxelAnimationEnabled !== false}
                    onChange={e => {
                      const current = schema as GraphSchema
                      const three = current.three || {}
                      setSchema({
                        ...current,
                        three: {
                          ...three,
                          voxelAnimationEnabled: e.target.checked,
                        },
                      })
                    }}
                  />
                </section>
              </section>
            ) : null}
            <SchemaUiEditor schema={schema} setSchema={setSchema} mode="globalOnly" />
            {uniqueNodeTypes.length > 0 ? (
              <section className={`rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-3`}>
                <AdvancedSection uniqueNodeTypes={uniqueNodeTypes} />
              </section>
            ) : null}
            {schema ? (
              <GraphLayerMetadataPresetsSection
                schema={schema as GraphSchema}
                uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
              />
            ) : null}
          </section>
        ) : selectedGlobalView?.kind === 'localSchema' ? (
          <FieldLocalSchemaSection
            graphData={graphData}
            schema={schema}
            setSchema={setSchema}
            selectedGlobalView={selectedGlobalView}
            setSelectedGlobalView={setSelectedGlobalView}
            uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
            uiPanelTextFontClass={uiPanelTextFontClass}
            uiPanelMonospaceTextClass={uiPanelMonospaceTextClass}
            uiPanelRowDensityCompactClass={uiPanelRowDensityCompactClass}
            localSchemaNodeTypes={localSchemaNodeTypes}
            localSchemaEdgeLabels={localSchemaEdgeLabels}
          />
        ) : !selectedField || !selectedSettings ? (
          <section className={`p-3 ${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.tertiary}`}>
            {UI_COPY.graphFieldsSelectFieldToEdit}
          </section>
        ) : (
          <>
            <form
              onSubmit={e => {
                e.preventDefault()
              }}
              className="p-3 space-y-3"
            >
                <section className={`rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-3 space-y-3`}>
                <section className={GRAPH_FIELDS_FIELD_GRID_CLASS_NAME}>
                  <section className="min-w-0">
                    <label className={`block ${fieldLabelClassName}`} htmlFor="graph-fields-display-name">
                      {UI_LABELS.name}
                    </label>
                    <section className="mt-1">
                      <GraphFieldsComfortableTextInput
                        id="graph-fields-display-name"
                        value={selectedSettings.displayName}
                        onChange={e => updateSelectedSettings({ displayName: e.target.value })}
                        className={comfortableInputClassName}
                        textSizeClassName={uiPanelKeyValueTextSizeClass}
                      />
                    </section>
                  </section>
                  <section className="min-w-0">
                    <label className={`block ${fieldLabelClassName}`} htmlFor="graph-fields-type">
                      {UI_LABELS.type}
                    </label>
                    <section className="mt-1">
                      <GraphFieldsComfortableFieldSelect
                        id="graph-fields-type"
                        value={selectedSettings.fieldType}
                        onChange={e => updateSelectedSettings({ fieldType: e.target.value as GraphFieldType })}
                        className={comfortableSelectClassName}
                        textSizeClassName={uiPanelKeyValueTextSizeClass}
                      >
                        {GRAPH_FIELD_TYPES.map(t => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </GraphFieldsComfortableFieldSelect>
                      {suggestedFieldType ? (
                        <section className={`${fieldHintClassName} mt-1`}>
                          Suggested: {suggestedFieldType}
                        </section>
                      ) : null}
                    </section>
                  </section>
                </section>
                <section>
                  <label className={`block ${fieldLabelClassName}`} htmlFor="graph-fields-description">
                    <Tooltip
                      content={GRAPH_FIELDS_DESCRIPTION_TOOLTIP_TEXT}
                      maxWidthPx={260}

                    >
                      <span className="inline-flex items-center gap-1">
                        <span>{UI_COPY.graphFieldsDescriptionLabel}</span>
                      </span>
                    </Tooltip>
                  </label>
                  <section className="mt-1">
                    <section className={`${UI_RESPONSIVE_GRAPH_FIELDS_DESCRIPTION_EDITOR_CLASSNAME} rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg}`}>
                      <React.Suspense fallback={null}>
                        <MonacoTextEditorLazy
                          value={selectedSettings.description}
                          onChange={(val) => updateSelectedSettings({ description: val })}
                          language="text"
                          uri="inmemory://graph-fields/description"
                          themeMode="light"
                          wordWrap
                          className="w-full h-full"
                        />
                      </React.Suspense>
                    </section>
                  </section>
                </section>
              </section>

              {selectedSettings.fieldType === 'Multi-select' || selectedSettings.fieldType === 'Single-select' ? (
                <SelectOptionsSection
                  selectedSettings={selectedSettings}
                  updateSettings={updateSelectedSettings}
                  sampleCount={selectedFieldSampleCount ?? undefined}
                />
              ) : null}

              {schema ? (
                <FieldSchemaSection
                  schema={schema}
                  selectedField={selectedField}
                  selectedSettings={selectedSettings}
                  ownersWithField={
                    selectedField.scope === 'node'
                      ? filteredNodeTypesForSelectedField
                      : filteredEdgeLabelsForSelectedField
                  }
                  ownerKey={schemaOwnerKey}
                  uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
                />
              ) : null}

              {schema ? (
                <CollapsibleSection
                  title={UI_COPY.graphFieldsStylesSectionTitle}
                  collapsed={stylesCollapsed}
                  onToggle={setStylesCollapsed}
                  stickyHeader={false}
                  className="mt-0 border-t-0 pt-0"
                >
                  <FieldStylesSection
                    schema={schema}
                    scope={selectedField.scope}
                    ownerKey={schemaOwnerKey}
                    uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
                  />
                </CollapsibleSection>
              ) : null}

              {schema ? (
                <CollapsibleSection
                  title={UI_COPY.graphFieldsSchemaExtrasSectionTitle}
                  collapsed={schemaExtrasCollapsed}
                  onToggle={setSchemaExtrasCollapsed}
                  stickyHeader={false}
                  className="mt-0 border-t-0 pt-0"
                >
                  <section className={`rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-3 space-y-3`}>
                    <FieldGraphLayersSection
                      schema={schema as GraphSchema}
                      scope={selectedField.scope}
                      ownerKey={schemaOwnerKey}
                      fieldKey={selectedField.key}
                      uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
                    />

                    <FieldLayoutSection
                      schema={schema}
                      scope={selectedField.scope}
                      ownerKey={schemaOwnerKey}
                      uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
                    />

                    <FieldEndpointsAndCardinalitySection
                      schema={schema}
                      scope={selectedField.scope}
                      ownerKey={schemaOwnerKey}
                      uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
                    />
                  </section>
                </CollapsibleSection>
              ) : null}

              <DefaultValueSection
                selectedSettings={selectedSettings}
                setDefaultValue={setSelectedDefaultValue}
                updateSettings={updateSelectedSettings}
                onStatusChange={onStatusChange}
              />

              <DecimalPlacesSection selectedSettings={selectedSettings} updateSettings={updateSelectedSettings} />

              <CurrencySection selectedSettings={selectedSettings} updateSettings={updateSelectedSettings} />

              <UrlProtocolSection selectedSettings={selectedSettings} updateSettings={updateSelectedSettings} />

              <section className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={resetSelectedSettings}
                  className={secondaryActionButtonClassName}
                >
                  {UI_LABELS.reset}
                </button>
                <button
                  type="button"
                  onClick={onResync}
                  className={secondaryActionButtonClassName}
                  disabled={!graphData}
                >
                  {UI_COPY.graphFieldsResyncButtonLabel}
                </button>
              </section>
            </form>
          </>
        )}
    </MainPanelSettingsPanelShell>
  )
}
