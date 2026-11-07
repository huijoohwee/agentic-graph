import React from 'react'

import { UI_LABELS } from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { cn } from '@/lib/utils'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import {
  UI_RESPONSIVE_FLOW_MANAGER_FORM_FIELD_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_GRID_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_HEADER_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import {
  FlowManagerRegistryEmptyState,
  FlowManagerRegistryItemCard,
  FlowManagerRegistryRemoveButton,
  FlowManagerRegistrySectionHeader,
} from '@/features/storyboard-widget-manager/FlowManagerRegistryEditorPrimitives'

import type { WidgetRegistryPort } from '@/features/storyboard-widget-manager/widgetRegistryTypes'

export default function WidgetRegistryPortsEditor({
  ports,
  onChange,
}: {
  ports: WidgetRegistryPort[]
  onChange: (next: WidgetRegistryPort[]) => void
}) {
  const panelTypography = usePanelTypography()
  const fieldClassName = cn(UI_RESPONSIVE_FLOW_MANAGER_FORM_FIELD_CLASSNAME, UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.text)

  return (
    <section aria-label="Ports" className="space-y-2">
      <FlowManagerRegistrySectionHeader
        title="Ports"
        actionLabel={`${UI_LABELS.add} port`}
        className={UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_HEADER_CLASSNAME}
        onAction={() => onChange([...(ports || []), { direction: 'input', portKey: '', schemaPath: '' }])}
      />

      <section className="space-y-2">
        {(ports || []).map((p, idx) => (
          <FlowManagerRegistryItemCard
            key={`${idx}:${p.direction}:${p.portKey}`}
            className={cn(UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_CLASSNAME, UI_THEME_TOKENS.panel.border)}
            gridClassName={cn(UI_RESPONSIVE_FLOW_MANAGER_REGISTRY_ITEM_GRID_CLASSNAME, 'sm:grid-cols-4')}
            footer={
              <section className="mt-2 flex items-center justify-end">
                <FlowManagerRegistryRemoveButton ariaLabel="Remove port" onClick={() => onChange(ports.filter((_, i) => i !== idx))} />
              </section>
            }
          >
              <section>
                <label className={cn(panelTypography.microLabelClass, UI_THEME_TOKENS.text.secondary)}>Direction</label>
                <PanelSelect
                  value={p.direction}
                  onValueChange={selectedValueInput => onChange(ports.map((x, i) => (i === idx ? { ...x, direction: selectedValueInput === 'output' ? 'output' : 'input' } : x)))}
                  className={fieldClassName}
                >
                  <option value="input">input</option>
                  <option value="output">output</option>
                </PanelSelect>
              </section>
              <section>
                <label className={cn(panelTypography.microLabelClass, UI_THEME_TOKENS.text.secondary)}>Port key</label>
                <PanelTextInput
                  value={p.portKey}
                  onChange={e => onChange(ports.map((x, i) => (i === idx ? { ...x, portKey: e.target.value } : x)))}
                  className={cn(fieldClassName, panelTypography.monospaceTextClass)}
                />
              </section>
              <section className="sm:col-span-2">
                <label className={cn(panelTypography.microLabelClass, UI_THEME_TOKENS.text.secondary)}>Schema path (optional)</label>
                <PanelTextInput
                  value={p.schemaPath || ''}
                  onChange={e => onChange(ports.map((x, i) => (i === idx ? { ...x, schemaPath: e.target.value } : x)))}
                  className={cn(fieldClassName, panelTypography.monospaceTextClass)}
                />
              </section>
          </FlowManagerRegistryItemCard>
        ))}

        {(ports || []).length === 0 && (
          <FlowManagerRegistryEmptyState className={cn(panelTypography.microLabelClass, UI_THEME_TOKENS.text.tertiary)}>
            No ports.
          </FlowManagerRegistryEmptyState>
        )}
      </section>
    </section>
  )
}
