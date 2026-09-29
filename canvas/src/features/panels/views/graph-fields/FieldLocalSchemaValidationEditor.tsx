import React from 'react'
import type { GraphSchema, PropertySpec } from '@/lib/graph/schema'
import type { GraphFieldsSelectedView } from '@/features/panels/views/GraphFieldsView'
import { UI_COPY } from '@/lib/config.copy'
import { GraphFieldsCompactCheckbox, GraphFieldsFieldSelect } from '@/features/panels/views/graph-fields/GraphFieldsPanelControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { MonacoTextEditor } from '@/features/monaco/MonacoTextEditor'
import { GRAPH_FIELDS_DENSE_FIELD_GRID_CLASS_NAME, GRAPH_FIELDS_DENSE_TRIPLE_FIELD_GRID_CLASS_NAME } from '@/features/panels/views/graph-fields/graphFieldResponsiveClasses'
import {
  UI_RESPONSIVE_GRAPH_FIELDS_FIELD_INPUT_CLASSNAME,
  UI_RESPONSIVE_GRAPH_FIELDS_VALIDATION_EDITOR_CLASSNAME,
  UI_RESPONSIVE_SCHEMA_PROPERTY_NAME_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

export type ValidationWarning =
  | { kind: 'requiredMissingSchema'; keys: string[] }
  | {
      kind: 'typeMismatch'
      items: {
        key: string
        schemaType: PropertySpec['type'] | undefined
        validationType: PropertySpec['type']
      }[]
    }

type FieldLocalSchemaValidationEditorProps = {
  schema: GraphSchema | null
  localSchemaScope: 'node' | 'edge'
  localSchemaOwnerKey: string
  uiPanelKeyValueTextSizeClass: string
  uiPanelMonospaceTextClass: string
  setSelectedGlobalView: React.Dispatch<React.SetStateAction<GraphFieldsSelectedView>>
  validationPropertyNames: string[]
  localValidationWarnings: ValidationWarning[]
  localValidationRequiredSet: Set<string>
  setLocalValidationRequiredSet: React.Dispatch<React.SetStateAction<Set<string>>>
  localValidationTypesMap: Record<string, PropertySpec['type']>
  setLocalValidationTypesMap: React.Dispatch<
    React.SetStateAction<Record<string, PropertySpec['type']>>
  >
  localValidationBulkType: PropertySpec['type']
  setLocalValidationBulkType: React.Dispatch<React.SetStateAction<PropertySpec['type']>>
  localValidationSeverity: 'error' | 'warn'
  setLocalValidationSeverity: React.Dispatch<React.SetStateAction<'error' | 'warn'>>
  localValidationOtherText: string
  setLocalValidationOtherText: React.Dispatch<React.SetStateAction<string>>
  getValidationControlId: (kind: 'required' | 'type', key: string) => string
  focusValidationControl: (kind: 'required' | 'type', key: string) => void
}

export default function FieldLocalSchemaValidationEditor({
  schema,
  localSchemaScope,
  localSchemaOwnerKey,
  uiPanelKeyValueTextSizeClass,
  uiPanelMonospaceTextClass,
  setSelectedGlobalView,
  validationPropertyNames,
  localValidationWarnings,
  localValidationRequiredSet,
  setLocalValidationRequiredSet,
  localValidationTypesMap,
  setLocalValidationTypesMap,
  localValidationBulkType,
  setLocalValidationBulkType,
  localValidationSeverity,
  setLocalValidationSeverity,
  localValidationOtherText,
  setLocalValidationOtherText,
  getValidationControlId,
  focusValidationControl,
}: FieldLocalSchemaValidationEditorProps) {
  const validationActionButtonClassName = `App-toolbar__btn text-xs border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.button.neutralMuted} ${UI_THEME_TOKENS.button.hoverBg}`
  const validationSelectClassName = UI_RESPONSIVE_GRAPH_FIELDS_FIELD_INPUT_CLASSNAME
  const validationPanelClassName = `${UI_RESPONSIVE_GRAPH_FIELDS_VALIDATION_EDITOR_CLASSNAME} rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg}`
  return (
    <section className="space-y-3">
      {localValidationWarnings.length > 0 ? (
        <section className={`${uiPanelKeyValueTextSizeClass} text-amber-700 space-y-1`}>
          {localValidationWarnings.map((warning, index) => {
            if (warning.kind === 'requiredMissingSchema') {
              const text = `Required properties with no schema entry: ${warning.keys.join(', ')}`
              return (
                <button
                  key={`warn-${index}`}
                  type="button"
                  className="underline decoration-dotted underline-offset-2"
                  onClick={() => {
                    setSelectedGlobalView(prev => {
                      if (!prev || prev.kind !== 'localSchema') return prev
                      return { ...prev, facet: 'properties' }
                    })
                  }}
                >
                  {text}
                </button>
              )
            }
            return (
              <section key={`warn-${index}`} className="space-y-0.5">
                {warning.items.map(item => {
                  const labelParts = []
                  labelParts.push(item.key)
                  labelParts.push(': ')
                  labelParts.push(
                    item.schemaType
                      ? `schema ${item.schemaType} vs validation ${item.validationType}`
                      : `validation ${item.validationType} (schema type unknown)`,
                  )
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className="block text-left underline decoration-dotted underline-offset-2"
                      onClick={() => focusValidationControl('type', item.key)}
                    >
                      {labelParts.join('')}
                    </button>
                  )
                })}
              </section>
            )
          })}
        </section>
      ) : null}

      <section className={`${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.tertiary}`}>
        Validation uses this owner&apos;s property schema for available fields and base
        types. Adjust properties first, then refine required fields, types, and
        additional options here.
      </section>

      <section className={`flex items-center gap-2 ${uiPanelKeyValueTextSizeClass}`}>
        <span className={UI_THEME_TOKENS.text.primary}>{UI_COPY.validationSeverityLabel}</span>
        <section className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => setLocalValidationSeverity('error')}
            className={[
              `App-toolbar__btn text-xs border ${UI_THEME_TOKENS.input.border}`,
              localValidationSeverity === 'error'
                ? UI_THEME_TOKENS.button.primarySolid
                : `${UI_THEME_TOKENS.button.neutralMuted} ${UI_THEME_TOKENS.button.hoverBg}`,
            ].join(' ')}
          >
            {UI_COPY.validationSeverityErrorLabel}
          </button>
          <button
            type="button"
            onClick={() => setLocalValidationSeverity('warn')}
            className={[
              `App-toolbar__btn text-xs border ${UI_THEME_TOKENS.input.border}`,
              localValidationSeverity === 'warn'
                ? UI_THEME_TOKENS.button.primarySolid
                : `${UI_THEME_TOKENS.button.neutralMuted} ${UI_THEME_TOKENS.button.hoverBg}`,
            ].join(' ')}
          >
            {UI_COPY.validationSeverityWarnLabel}
          </button>
        </section>
      </section>

      <section>
        <section className={`${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.primary} mb-1`}>
          {UI_COPY.validationRequiredFieldsTitle}
        </section>
        <section className={GRAPH_FIELDS_DENSE_TRIPLE_FIELD_GRID_CLASS_NAME}>
          {validationPropertyNames.length === 0 ? (
            <section className={`${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.tertiary}`}>
              No properties for this owner.
            </section>
          ) : (
            validationPropertyNames.map(p => (
              <label
                key={p}
                className={`${uiPanelKeyValueTextSizeClass} flex items-center gap-1`}
              >
                <GraphFieldsCompactCheckbox
                  id={getValidationControlId('required', p)}
                  checked={localValidationRequiredSet.has(p)}
                  onChange={e => {
                    const next = new Set(localValidationRequiredSet)
                    if (e.target.checked) next.add(p)
                    else next.delete(p)
                    setLocalValidationRequiredSet(next)
                  }}
                />
                <span className="truncate">{p}</span>
              </label>
            ))
          )}
        </section>
        {validationPropertyNames.length > 0 ? (
          <section className="mt-1 flex flex-wrap items-center gap-1">
            <button
              type="button"
              className={validationActionButtonClassName}
              onClick={() =>
                setLocalValidationRequiredSet(new Set<string>(validationPropertyNames))
              }
            >
              {UI_COPY.validationRequireAllButtonLabel}
            </button>
            <button
              type="button"
              className={validationActionButtonClassName}
              onClick={() => {
                const nums = validationPropertyNames.filter(
                  p => (localValidationTypesMap[p] ?? 'string') === 'number',
                )
                setLocalValidationRequiredSet(new Set<string>(nums))
              }}
            >
              {UI_COPY.validationRequireNumericButtonLabel}
            </button>
            <button
              type="button"
              className={validationActionButtonClassName}
              onClick={() => setLocalValidationRequiredSet(new Set())}
            >
              {UI_COPY.validationClearRequiredButtonLabel}
            </button>
          </section>
        ) : null}
      </section>

      <section>
        <section className={`${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.primary} mb-1`}>
          {UI_COPY.validationPropertyTypesTitle}
        </section>
        <section className={GRAPH_FIELDS_DENSE_FIELD_GRID_CLASS_NAME}>
          {validationPropertyNames.map(p => (
            <section
              key={p}
              className={`${uiPanelKeyValueTextSizeClass} flex items-center gap-1`}
            >
              <span className={`${UI_RESPONSIVE_SCHEMA_PROPERTY_NAME_CLASSNAME} ${UI_THEME_TOKENS.text.primary}`}>{p}</span>
              <GraphFieldsFieldSelect
                id={getValidationControlId('type', p)}
                value={localValidationTypesMap[p] ?? 'string'}
                onValueChange={selectedValueInput => {
                  const v = selectedValueInput as PropertySpec['type']
                  setLocalValidationTypesMap({
                    ...localValidationTypesMap,
                    [p]: v,
                  })
                }}
                className={`flex-1 ${validationSelectClassName}`}
                textSizeClassName="text-xs"
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="array">array</option>
                <option value="object">object</option>
              </GraphFieldsFieldSelect>
            </section>
          ))}
        </section>
        {validationPropertyNames.length > 0 ? (
          <section className="mt-1 flex flex-wrap items-center gap-1">
            <GraphFieldsFieldSelect
              value={localValidationBulkType}
              onValueChange={selectedValueInput => setLocalValidationBulkType(selectedValueInput as PropertySpec['type'])}
              className={validationSelectClassName}
              textSizeClassName="text-xs"
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
              <option value="array">array</option>
              <option value="object">object</option>
            </GraphFieldsFieldSelect>
            <button
              type="button"
              className={validationActionButtonClassName}
              onClick={() => {
                const next: Record<string, PropertySpec['type']> = {}
                validationPropertyNames.forEach(p => {
                  next[p] = localValidationBulkType
                })
                setLocalValidationTypesMap(next)
              }}
            >
              {UI_COPY.validationSetAllTypesButtonLabel}
            </button>
            <button
              type="button"
              className={validationActionButtonClassName}
              title="Infer types from the current property schema for this owner"
              onClick={() => {
                const inferred: Record<string, PropertySpec['type']> = {}
                validationPropertyNames.forEach(p => {
                  const specType =
                    localSchemaScope === 'node'
                      ? schema?.propertySchemas?.node?.[localSchemaOwnerKey]?.[p]?.type
                      : schema?.propertySchemas?.edge?.[localSchemaOwnerKey]?.[p]?.type
                  inferred[p] = (specType as PropertySpec['type'] | undefined) ?? 'string'
                })
                setLocalValidationTypesMap(inferred)
              }}
            >
              {UI_COPY.validationInferTypesButtonLabel}
            </button>
          </section>
        ) : null}
      </section>

      <section>
        <section className={`${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.primary} mb-1`}>
          {UI_COPY.validationAdditionalOptionsJsonTitle}
        </section>
        <section className={validationPanelClassName}>
          <MonacoTextEditor
            value={localValidationOtherText}
            onChange={setLocalValidationOtherText}
            language="json"
            uri={`inmemory://graph-fields/validation/other/${encodeURIComponent(localSchemaScope)}/${encodeURIComponent(localSchemaOwnerKey)}`}
            themeMode="light"
            wordWrap={false}
            className={`w-full h-full ${uiPanelMonospaceTextClass}`}
          />
        </section>
      </section>
    </section>
  )
}
