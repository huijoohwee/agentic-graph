import React from 'react'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { FieldKeyIcon } from '@/features/graph-fields/ui/graphFieldIcons'
import { GRAPH_FIELD_TYPES, type GraphFieldType } from '@/features/graph-fields/graphFields'
import { GraphFieldsComfortableFieldSelect, GraphFieldsInlineTextInput } from '@/features/panels/views/graph-fields/GraphFieldsPanelControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  UI_RESPONSIVE_GRAPH_FIELDS_INLINE_FIELD_CLASSNAME,
  UI_RESPONSIVE_GRAPH_FIELDS_INLINE_FIELD_SHELL_CLASSNAME,
  UI_RESPONSIVE_GRAPH_FIELDS_PANEL_STRIP_CLASSNAME,
  UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

export type NewFieldFormProps = {
  newFieldKey: string
  setNewFieldKey: (value: string) => void
  newFieldScope: 'node' | 'edge'
  setNewFieldScope: (value: 'node' | 'edge') => void
  newFieldType: GraphFieldType
  setNewFieldType: (value: GraphFieldType) => void
  createNewField: () => void
  setNewFieldOpen: (open: boolean) => void
  graphDataPresent: boolean
  uiPanelKeyValueTextSizeClass: string
  iconSizeClass: string
  uiIconStrokeWidth: number
}

export function NewFieldForm({
  newFieldKey,
  setNewFieldKey,
  newFieldScope,
  setNewFieldScope,
  newFieldType,
  setNewFieldType,
  createNewField,
  setNewFieldOpen,
  graphDataPresent,
  uiPanelKeyValueTextSizeClass,
  iconSizeClass,
  uiIconStrokeWidth,
}: NewFieldFormProps) {
  const sectionClassName = `${UI_RESPONSIVE_GRAPH_FIELDS_PANEL_STRIP_CLASSNAME} border-b ${UI_THEME_TOKENS.panel.divider} ${UI_THEME_TOKENS.panel.bg}`
  const labelClassName = `${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.secondary}`
  const inputShellClassName = `${UI_RESPONSIVE_GRAPH_FIELDS_INLINE_FIELD_SHELL_CLASSNAME} mt-1 flex items-center gap-2 rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg} focus-within:border-blue-500 dark:focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-500 dark:focus-within:ring-blue-400`
  const textInputClassName = `${UI_RESPONSIVE_GRAPH_FIELDS_INLINE_FIELD_CLASSNAME} placeholder:text-[color:var(--kg-text-tertiary)]`
  const selectClassName = `${UI_RESPONSIVE_GRAPH_FIELDS_INLINE_FIELD_CLASSNAME} text-left`
  const actionButtonClassName = `${UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME} App-toolbar__btn rounded border ${uiPanelKeyValueTextSizeClass}`

  return (
    <section className={sectionClassName}>
      <form
        onSubmit={e => {
          e.preventDefault()
          createNewField()
        }}
        className="space-y-2"
      >
        <section className="flex items-center gap-2">
          <section className="flex-1">
            <section className={labelClassName}>{UI_LABELS.name}</section>
            <section className={inputShellClassName}>
              <FieldKeyIcon
                className={`${iconSizeClass} ${UI_THEME_TOKENS.text.tertiary}`}
                strokeWidth={uiIconStrokeWidth}
              />
              <GraphFieldsInlineTextInput
                value={newFieldKey}
                onChange={e => setNewFieldKey(e.target.value)}
                placeholder={UI_COPY.fieldNamePlaceholder}
                className={textInputClassName}
              />
            </section>
          </section>
        </section>

        <section className="flex items-center gap-2">
          <section className="flex-1">
            <section className={labelClassName}>{UI_LABELS.scope}</section>
            <section className="mt-1">
              <GraphFieldsComfortableFieldSelect
                value={newFieldScope}
                onValueChange={selectedValueInput => setNewFieldScope(selectedValueInput === 'edge' ? 'edge' : 'node')}
                className={selectClassName}
                textSizeClassName={uiPanelKeyValueTextSizeClass}
              >
                <option value="node">Node</option>
                <option value="edge">Edge</option>
              </GraphFieldsComfortableFieldSelect>
            </section>
          </section>
          <section className="flex-1">
            <section className={labelClassName}>{UI_LABELS.type}</section>
            <section className="mt-1">
              <GraphFieldsComfortableFieldSelect
                value={newFieldType}
                onValueChange={selectedValueInput => setNewFieldType(selectedValueInput as GraphFieldType)}
                className={selectClassName}
                textSizeClassName={uiPanelKeyValueTextSizeClass}
              >
                {GRAPH_FIELD_TYPES.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </GraphFieldsComfortableFieldSelect>
            </section>
          </section>
        </section>

        <section className="flex items-center justify-end gap-2">
          <button
            type="button"
            className={`${actionButtonClassName} ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.button.neutralSubtle} ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.text.secondary}`}
            onClick={() => setNewFieldOpen(false)}
          >
            {UI_LABELS.cancel}
          </button>
          <button
            type="submit"
            className={`${actionButtonClassName} ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.button.neutralSubtle} ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.text.secondary} disabled:opacity-50`}
            disabled={!graphDataPresent}
          >
            {UI_LABELS.create}
          </button>
        </section>
      </form>
    </section>
  )
}
