import { Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'

import { UI_LABELS } from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { getIconSizeClass } from '@/lib/ui'
import { cn } from '@/lib/utils'
import {
  UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_ACTION_MENU_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_FORM_FIELD_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_ACTION_GROUP_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_FOOTER_ROW_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_INLINE_CONTROL_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_SECTION_GRID_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_SECTION_HEADER_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_STATUS_ALERT_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_TOOLBAR_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

import type { StoryboardWidgetMappingRow } from '@/features/storyboard-widget-manager/mappingRows'
import FlowMappingRowsTable from '@/features/storyboard-widget-manager/FlowMappingRowsTable'
import { PanelCheckbox, PanelField, PanelTextInput } from '@/lib/ui/panelFormControls'

export type StoryboardWidgetMappingEditorDraft = {
  id: string
  isEnabled: boolean
  nodeTypeId: string
  widgetTypeId: string
  formId: string
}

export function StoryboardWidgetMappingSettingsPanel(props: {
  mode: 'create' | 'edit' | 'none'
  draft: StoryboardWidgetMappingEditorDraft
  rows: StoryboardWidgetMappingRow[]
  error: string | null
  uiIconScale: 'compact' | 'default' | undefined
  uiIconStrokeWidth: number
  onClose: () => void
  onChangeDraft: (patch: Partial<StoryboardWidgetMappingEditorDraft>) => void
  onAddRow: () => void
  onReset: () => void
  onSave: () => void
  onDelete: () => void
  onChangeRow: (id: string, patch: Partial<StoryboardWidgetMappingRow>) => void
  onDeleteRow: (id: string) => void
  onReorderRow: (fromId: string, toId: string) => void
}) {
  const {
    mode,
    draft,
    rows,
    error,
    uiIconScale,
    uiIconStrokeWidth,
    onClose,
    onChangeDraft,
    onAddRow,
    onReset,
    onSave,
    onDelete,
    onChangeRow,
    onDeleteRow,
    onReorderRow,
  } = props

  const panelTypography = usePanelTypography()
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const fieldClassName = cn(UI_RESPONSIVE_FLOW_MANAGER_FORM_FIELD_CLASSNAME, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.text)

  return (
    <section className="h-full min-h-0 flex flex-col overflow-hidden" aria-label="Edit mapping">
      <section className={UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME} aria-label="Mapping editor">
        {mode === 'none' ? (
          <section className={cn(panelTypography.microLabelClass, UI_THEME_TOKENS.text.secondary)}>
            Select a mapping to edit.
          </section>
        ) : (
          <section className="space-y-3" aria-label="Mapping editor form">
            {error ? (
              <section
                className={cn(UI_RESPONSIVE_FLOW_MANAGER_STATUS_ALERT_CLASSNAME, 'border-red-300/50 bg-red-500/10', panelTypography.microLabelClass)}
                aria-label="Error"
                role="status"
              >
                <section className={cn(UI_THEME_TOKENS.text.primary)}>{error}</section>
              </section>
            ) : null}

            <section aria-label="Identity" className="space-y-2">
              <section className={UI_RESPONSIVE_FLOW_MANAGER_SECTION_HEADER_CLASSNAME} aria-label="Identity header">
                <section className={cn('text-xs font-semibold uppercase tracking-normal', UI_THEME_TOKENS.text.secondary)}>Identity</section>
                <label className={cn(UI_RESPONSIVE_FLOW_MANAGER_INLINE_CONTROL_CLASSNAME, panelTypography.microLabelClass, UI_THEME_TOKENS.text.secondary)}>
                  <PanelCheckbox checked={!!draft.isEnabled} onChange={e => onChangeDraft({ isEnabled: e.target.checked })} />
                  Enabled
                </label>
              </section>

              <section className={cn(UI_RESPONSIVE_FLOW_MANAGER_SECTION_GRID_CLASSNAME, 'sm:grid-cols-3')} aria-label="Identity inputs">
                <section className="sm:col-span-1">
                  <PanelField
                    label="Node Type"
                    className="grid gap-1"
                    labelClassName={cn(panelTypography.microLabelClass, UI_THEME_TOKENS.text.secondary)}
                  >
                    <PanelTextInput
                      id="storyboard-widget-manager-nodeType"
                      value={draft.nodeTypeId}
                      onChange={e => onChangeDraft({ nodeTypeId: e.target.value })}
                      className={fieldClassName}
                    />
                  </PanelField>
                </section>
                <section className="sm:col-span-1">
                  <PanelField
                    label="Widget Type"
                    className="grid gap-1"
                    labelClassName={cn(panelTypography.microLabelClass, UI_THEME_TOKENS.text.secondary)}
                  >
                    <PanelTextInput
                      id="storyboard-widget-manager-editorType"
                      value={draft.widgetTypeId}
                      onChange={e => onChangeDraft({ widgetTypeId: e.target.value })}
                      className={fieldClassName}
                    />
                  </PanelField>
                </section>
                <section className="sm:col-span-1">
                  <PanelField
                    label="Form ID"
                    className="grid gap-1"
                    labelClassName={cn(panelTypography.microLabelClass, UI_THEME_TOKENS.text.secondary)}
                  >
                    <PanelTextInput
                      id="storyboard-widget-manager-formId"
                      value={draft.formId}
                      onChange={e => onChangeDraft({ formId: e.target.value })}
                      className={fieldClassName}
                    />
                  </PanelField>
                </section>
              </section>
            </section>

            <header className={UI_RESPONSIVE_FLOW_MANAGER_SECTION_HEADER_CLASSNAME} aria-label="Rows header">
              <section className={cn('text-xs font-semibold uppercase tracking-normal', UI_THEME_TOKENS.text.secondary)}>Rows</section>
              <button
                type="button"
                className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
                onClick={onAddRow}
                aria-label="Add row"
                title="Add row"
              >
                <Plus className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
              </button>
            </header>
            <section aria-label="Rows table">
              <FlowMappingRowsTable rows={rows} onChange={onChangeRow} onDelete={onDeleteRow} onReorder={onReorderRow} />
            </section>
          </section>
        )}
      </section>

      {mode !== 'none' ? (
        <section
          className={cn(
            UI_RESPONSIVE_FLOW_MANAGER_FOOTER_ROW_CLASSNAME,
            UI_RESPONSIVE_FLOW_MANAGER_TOOLBAR_ROW_CLASSNAME,
            UI_THEME_TOKENS.panel.border,
            UI_THEME_TOKENS.panel.bg,
          )}
          aria-label="Editor footer"
        >
          <section className={UI_RESPONSIVE_FLOW_MANAGER_ACTION_GROUP_CLASSNAME} aria-label="Left actions">
            <button
              type="button"
              className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
              onClick={onClose}
              aria-label={UI_LABELS.close}
              title={UI_LABELS.close}
            >
              <X className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
            </button>
            {mode === 'edit' ? (
              <button
                type="button"
                className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg, 'text-red-200')}
                onClick={onDelete}
                aria-label={UI_LABELS.delete}
                title={UI_LABELS.delete}
              >
                <Trash2 className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
              </button>
            ) : null}
          </section>

          <menu className={UI_RESPONSIVE_FLOW_MANAGER_ACTION_MENU_CLASSNAME} aria-label="Primary actions">
            <li>
              <button
                type="button"
                className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
                onClick={onReset}
                aria-label={UI_LABELS.reset}
                title={UI_LABELS.reset}
              >
                <RotateCcw className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
              </button>
            </li>
            <li>
              <button
                type="button"
                className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.activeBg, UI_THEME_TOKENS.button.activeText)}
                onClick={onSave}
                aria-label={UI_LABELS.save}
                title={UI_LABELS.save}
              >
                <Save className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
              </button>
            </li>
          </menu>
        </section>
      ) : null}
    </section>
  )
}
