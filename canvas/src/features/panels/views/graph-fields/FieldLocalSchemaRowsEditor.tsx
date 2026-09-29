import React from 'react'
import type { GraphSchema, PropertySpec } from '@/lib/graph/schema'
import type { JSONValue } from '@/lib/graph/types'
import { UI_LABELS } from '@/lib/config.copy'
import {
  KeyTypeValueStaticRow,
  RightAlignedValueCell,
} from 'grph-shared/react/keyTypeValueRow'
import { GraphFieldsFieldTextInput } from '@/features/panels/views/graph-fields/GraphFieldsPanelControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_GRAPH_FIELDS_FIELD_INPUT_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

type FieldLocalSchemaRow = { id: string; key: string; value: string }

type FieldLocalSchemaRowsEditorProps = {
  localSchemaFacet: 'properties' | 'localRules'
  schema: GraphSchema | null
  hasLocalSchemaOwner: boolean
  localSchemaScope: 'node' | 'edge'
  localSchemaOwnerKey: string
  uiPanelKeyValueTextSizeClass: string
  uiPanelTextFontClass: string
  uiPanelMonospaceTextClass: string
  uiPanelRowDensityCompactClass: string
  localSchemaRows: FieldLocalSchemaRow[]
  setLocalSchemaRows: React.Dispatch<React.SetStateAction<FieldLocalSchemaRow[]>>
  suggestedPropertyKeys: string[]
  suggestedPropertyTypeByKey: Record<string, PropertySpec['type']>
  suggestedPropertySampleByKey: Record<string, JSONValue | null>
  enumCandidatesByKey: Record<string, string[]>
}

export default function FieldLocalSchemaRowsEditor({
  localSchemaFacet,
  schema,
  hasLocalSchemaOwner,
  localSchemaScope,
  localSchemaOwnerKey,
  uiPanelKeyValueTextSizeClass,
  uiPanelTextFontClass,
  uiPanelMonospaceTextClass,
  uiPanelRowDensityCompactClass,
  localSchemaRows,
  setLocalSchemaRows,
  suggestedPropertyKeys,
  suggestedPropertyTypeByKey,
  suggestedPropertySampleByKey,
  enumCandidatesByKey,
}: FieldLocalSchemaRowsEditorProps) {
  const panelClassName = `rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`
  const sectionDividerClassName = UI_THEME_TOKENS.panel.divider
  const headerLabelClassName = `font-semibold ${UI_THEME_TOKENS.text.secondary}`
  const keyLabelClassName = UI_THEME_TOKENS.text.secondary
  const inputClassName = `${UI_RESPONSIVE_GRAPH_FIELDS_FIELD_INPUT_CLASSNAME} w-full`
  const actionButtonClassName = `App-toolbar__btn border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.button.neutralSubtle} ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.text.secondary}`
  const suggestionTextClassName = `${uiPanelKeyValueTextSizeClass} flex flex-wrap items-center gap-1 ${UI_THEME_TOKENS.text.tertiary}`

  return (
    <section className={panelClassName} aria-label="Schema Rows Editor">
      <header className={`px-2 border-b ${sectionDividerClassName}`}>
        <KeyTypeValueStaticRow
          keyNode={
            <span className={headerLabelClassName}>
              {localSchemaFacet === 'localRules' ? 'Rule' : 'Key'}
            </span>
          }
          valueNode={
            <span className={headerLabelClassName}>
              {localSchemaFacet === 'localRules' ? 'Rule JSON' : 'Value JSON'}
            </span>
          }
          layout="keyValue"
          textSizeClassName={uiPanelKeyValueTextSizeClass}
          fontClassName={uiPanelTextFontClass}
          densityClassName={uiPanelRowDensityCompactClass}
        />
      </header>
      <section className="max-h-72 overflow-auto">
        {localSchemaRows.map((row, index) => {
          const trimmedKey = String(row.key || '').trim()
          const sampleValue =
            localSchemaFacet === 'properties' && trimmedKey
              ? suggestedPropertySampleByKey[trimmedKey] ?? null
              : null
          const specForKey =
            localSchemaFacet === 'properties' && schema && hasLocalSchemaOwner && trimmedKey
              ? localSchemaScope === 'node'
                ? schema.propertySchemas?.node?.[localSchemaOwnerKey]?.[trimmedKey]
                : schema.propertySchemas?.edge?.[localSchemaOwnerKey]?.[trimmedKey]
              : undefined
          const enumFromSchema =
            !!specForKey && Array.isArray(specForKey.enum) && specForKey.enum.length > 0
              ? (specForKey.enum as string[])
              : null
          const enumFromData =
            localSchemaFacet === 'properties' && trimmedKey
              ? enumCandidatesByKey[trimmedKey] ?? null
              : null
          const hasEnumSuggestions =
            !!enumFromSchema ||
            (!!enumFromData && Array.isArray(enumFromData) && enumFromData.length > 0)
          const hasDefaultSuggestion = !!specForKey && typeof specForKey.default !== 'undefined'
          const hasSampleSuggestion = sampleValue != null
          const hasAnySuggestions =
            localSchemaFacet === 'properties' &&
            (hasEnumSuggestions || hasDefaultSuggestion || hasSampleSuggestion)

          const enumValuesToShow: string[] = (() => {
            if (enumFromSchema && enumFromSchema.length > 0) {
              return enumFromSchema.slice(0, 3)
            }
            if (enumFromData && enumFromData.length > 0) {
              return enumFromData.slice(0, 3)
            }
            return []
          })()

          const applySuggestedSpec = (
            source: 'schema' | 'enum' | 'default' | 'sample',
            enumValue?: string,
          ) => {
            if (localSchemaFacet !== 'properties') return
            const next = localSchemaRows.slice()
            let nextValue = row.value
            let spec: Record<string, JSONValue> | null = null
            if (source === 'schema' && specForKey) {
              spec = specForKey as unknown as Record<string, JSONValue>
            } else if (source === 'enum') {
              const t = specForKey?.type ?? 'string'
              const value = enumValue ?? ''
              const enumValues =
                enumFromSchema && enumFromSchema.length > 0
                  ? enumFromSchema
                  : enumFromData && enumFromData.length > 0
                    ? enumFromData
                    : [String(value)]
              spec = {
                type: t,
                enum: enumValues.map(v => String(v)),
              }
            } else if (source === 'default' && specForKey) {
              const t = specForKey.type ?? 'string'
              spec = {
                type: t,
              }
              if (typeof specForKey.default !== 'undefined') {
                spec.default = specForKey.default as JSONValue
              }
            } else if (source === 'sample' && sampleValue != null) {
              let inferredType: PropertySpec['type'] = 'string'
              if (typeof sampleValue === 'number') inferredType = 'number'
              else if (typeof sampleValue === 'boolean') inferredType = 'boolean'
              else if (Array.isArray(sampleValue)) inferredType = 'array'
              else if (typeof sampleValue === 'object') inferredType = 'object'
              spec = {
                type: inferredType,
                default: sampleValue,
              }
            }
            if (spec) {
              try {
                nextValue = JSON.stringify(spec)
              } catch {
                nextValue = row.value
              }
            }
            next[index] = { ...row, value: nextValue }
            setLocalSchemaRows(next)
          }

          return (
            <KeyTypeValueStaticRow
              key={row.id}
              layout="keyValue"
              align="center"
              className="px-2"
              keyNode={
                <section className="flex items-center gap-1 min-w-0">
                  {localSchemaFacet === 'localRules' ? (
                    <span className={keyLabelClassName}>Rule {index + 1}</span>
                  ) : (
                    <GraphFieldsFieldTextInput
                      value={row.key}
                      onChange={e => {
                        const raw = e.target.value
                        const next = localSchemaRows.slice()
                        if (
                          localSchemaFacet === 'properties' &&
                          !String(row.value || '').trim()
                        ) {
                          const k = String(raw || '').trim()
                          if (k) {
                            const schemaSpec =
                              schema && hasLocalSchemaOwner
                                ? localSchemaScope === 'node'
                                  ? schema.propertySchemas?.node?.[localSchemaOwnerKey]?.[
                                      k
                                    ]
                                  : schema.propertySchemas?.edge?.[localSchemaOwnerKey]?.[
                                      k
                                    ]
                                : undefined
                            let spec: Record<string, JSONValue> | null = null
                            if (schemaSpec) {
                              spec = schemaSpec as unknown as Record<string, JSONValue>
                            } else {
                              const t = suggestedPropertyTypeByKey[k]
                              const sample = suggestedPropertySampleByKey[k]
                              const enumFromKey = enumCandidatesByKey[k]
                              if (t) {
                                let inferredType: PropertySpec['type'] = t
                                if (
                                  inferredType !== 'string' &&
                                  inferredType !== 'number' &&
                                  inferredType !== 'boolean' &&
                                  inferredType !== 'array' &&
                                  inferredType !== 'object'
                                ) {
                                  inferredType = 'string'
                                }
                                spec = {
                                  type: inferredType,
                                } as unknown as Record<string, JSONValue>
                                if (enumFromKey && enumFromKey.length > 0) {
                                  ;(spec as Record<string, JSONValue>).enum =
                                    enumFromKey.map(v => String(v))
                                } else if (typeof sample !== 'undefined') {
                                  ;(spec as Record<string, JSONValue>).default =
                                    sample as JSONValue
                                }
                              }
                            }
                            if (spec) {
                              try {
                                next[index] = {
                                  ...row,
                                  key: raw,
                                  value: JSON.stringify(spec),
                                }
                                setLocalSchemaRows(next)
                                return
                              } catch {
                                next[index] = { ...row, key: raw }
                                setLocalSchemaRows(next)
                                return
                              }
                            }
                          }
                        }
                        next[index] = { ...row, key: raw }
                        setLocalSchemaRows(next)
                      }}
                      className={inputClassName}
                      textSizeClassName="text-xs"
                      placeholder="key"
                      list={
                        localSchemaFacet === 'properties'
                          ? 'local-schema-property-keys'
                          : undefined
                      }
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const next = localSchemaRows.filter(r => r.id !== row.id)
                      setLocalSchemaRows(next)
                    }}
                    className={`${actionButtonClassName} text-xs`}
                  >
                    {UI_LABELS.delete}
                  </button>
                </section>
              }
              valueNode={
                <RightAlignedValueCell className="gap-1">
                  <GraphFieldsFieldTextInput
                    value={row.value}
                    onChange={e => {
                      const nextValue = e.target.value
                      const next = localSchemaRows.slice()
                      next[index] = { ...row, value: nextValue }
                      setLocalSchemaRows(next)
                    }}
                    className={`${inputClassName} ${uiPanelMonospaceTextClass}`}
                    textSizeClassName="text-xs"
                    placeholder={
                      localSchemaFacet === 'localRules'
                        ? '{"target":"node"}'
                        : '{"type":"string"}'
                    }
                  />
                  {hasAnySuggestions ? (
                    <section className={suggestionTextClassName}>
                      <span>Suggestions:</span>
                      {hasDefaultSuggestion ? (
                        <button
                          type="button"
                          className={`${actionButtonClassName} text-xs`}
                          onClick={() => applySuggestedSpec('default')}
                        >
                          Use default
                        </button>
                      ) : null}
                      {enumValuesToShow.map(v => (
                        <button
                          key={v}
                          type="button"
                          className={`${actionButtonClassName} text-xs`}
                          onClick={() => applySuggestedSpec('enum', String(v))}
                        >
                          {v}
                        </button>
                      ))}
                      {hasSampleSuggestion ? (
                        <button
                          type="button"
                          className={`${actionButtonClassName} text-xs`}
                          onClick={() => applySuggestedSpec('sample')}
                        >
                          Use sample
                        </button>
                      ) : null}
                    </section>
                  ) : null}
                </RightAlignedValueCell>
              }
              textSizeClassName={uiPanelKeyValueTextSizeClass}
              fontClassName={uiPanelTextFontClass}
              densityClassName={uiPanelRowDensityCompactClass}
              activeClassName={UI_THEME_TOKENS.table.rowHoverHighlight}
            />
          )
        })}
        {localSchemaFacet === 'properties' && suggestedPropertyKeys.length > 0 ? (
          <datalist id="local-schema-property-keys">
            {suggestedPropertyKeys.map(k => (
              <option key={k} value={k} />
            ))}
          </datalist>
        ) : null}
      </section>
      <section className={`border-t ${sectionDividerClassName} px-2 py-1.5 flex justify-between items-center`}>
        <button
          type="button"
          onClick={() => {
            const nextId = `${Date.now()}-${localSchemaRows.length}`
            if (localSchemaFacet === 'localRules') {
              setLocalSchemaRows([
                ...localSchemaRows,
                {
                  id: nextId,
                  key: String(localSchemaRows.length + 1),
                  value: '',
                },
              ])
            } else {
              setLocalSchemaRows([
                ...localSchemaRows,
                {
                  id: nextId,
                  key: '',
                  value: '',
                },
              ])
            }
          }}
          className={`${actionButtonClassName} text-xs`}
        >
          {localSchemaFacet === 'localRules' ? 'Add rule' : 'Add key'}
        </button>
      </section>
    </section>
  )
}
