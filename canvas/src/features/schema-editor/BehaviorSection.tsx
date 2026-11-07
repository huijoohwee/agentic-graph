import React from 'react'
import Subsection from '@/features/schema-editor/ui/Subsection'
import type { GraphSchema, GraphBehavior } from '@/lib/graph/schema'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { readSnapGridScalarSize } from '@/lib/canvas/snapGridSize'
import { PanelCheckbox, PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_RESPONSIVE_PANEL_INLINE_FIELD_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

type BehaviorSectionProps = {
  schema: GraphSchema
  uiPanelKeyValueInputClass: string
  uiPanelKeyValueTextSizeClass: string
  uniqueNodeTypes: string[]
  setBehavior: (patch: Partial<GraphBehavior>) => void
}

export default function BehaviorSection({
  schema,
  uiPanelKeyValueInputClass,
  uiPanelKeyValueTextSizeClass,
  uniqueNodeTypes,
  setBehavior,
}: BehaviorSectionProps) {
  const sectionHeadingClassName = `${uiPanelKeyValueTextSizeClass} font-semibold ${UI_THEME_TOKENS.text.secondary}`
  const checkboxLabelClassName = `flex items-center gap-1 ${UI_THEME_TOKENS.text.secondary}`
  const inlineLabelClassName = UI_THEME_TOKENS.text.secondary
  const selectionControlClassName = `rounded ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.selectionControl}`

  return (
    <section className="space-y-3">
      <section className={sectionHeadingClassName}>Behavior</section>
      <Subsection title="Behavior">
        <section className="flex items-center gap-4 text-xs">
          <label className={checkboxLabelClassName}>
            <PanelCheckbox
              className={selectionControlClassName}
              checked={schema.behavior.allowNodeDrag}
              onChange={e => setBehavior({ allowNodeDrag: e.target.checked })}
            />
            Node Drag
          </label>
          <label className={checkboxLabelClassName}>
            <PanelCheckbox
              className={selectionControlClassName}
              checked={schema.behavior.allowEdgeCreation}
              onChange={e => setBehavior({ allowEdgeCreation: e.target.checked })}
            />
            Edge Creation
          </label>
          <label className={checkboxLabelClassName}>
            <PanelCheckbox
              className={selectionControlClassName}
              checked={schema.behavior.hover?.enabled !== false}
              onChange={e =>
                setBehavior({
                  hover: { ...(schema.behavior.hover || {}), enabled: e.target.checked },
                })
              }
            />
            Hover Tooltips
          </label>
          <label className={checkboxLabelClassName}>
            <PanelCheckbox
              className={selectionControlClassName}
              checked={schema.behavior.expansion?.enabled !== false}
              onChange={e =>
                setBehavior({
                  expansion: { ...(schema.behavior.expansion || {}), enabled: e.target.checked },
                })
              }
            />
            Neighbor Expansion
          </label>
        </section>
        <section className="mt-2 flex items-center gap-2 text-xs">
          <span className={inlineLabelClassName}>Drag Constraint</span>
          <PanelSelect
            value={schema.behavior.dragConstraint ?? 'free'}
            onValueChange={selectedValueInput => {
              const v: GraphBehavior['dragConstraint'] =
                selectedValueInput === 'axis-x' || selectedValueInput === 'axis-y' || selectedValueInput === 'none'
                  ? selectedValueInput
                  : 'free'
              setBehavior({ dragConstraint: v })
            }}
            className={UI_RESPONSIVE_PANEL_INLINE_FIELD_CLASSNAME}
          >
            <option value="free">Free</option>
            <option value="axis-x">Axis-X</option>
            <option value="axis-y">Axis-Y</option>
            <option value="none">None</option>
          </PanelSelect>
          <label className={`${checkboxLabelClassName} ml-4`}>
            <PanelCheckbox
              className={selectionControlClassName}
              checked={!!schema.behavior.snapGrid?.enabled}
              onChange={e =>
                setBehavior({
                  snapGrid: {
                    enabled: e.target.checked,
                    size: schema.behavior.snapGrid?.size ?? 10,
                  },
                })
              }
            />
            Snap Grid
          </label>
          <PanelTextInput
            type="number"
            min={1}
            max={100}
            step={1}
            value={readSnapGridScalarSize(schema.behavior.snapGrid?.size)}
            onChange={e =>
              setBehavior({
                snapGrid: {
                  enabled: schema.behavior.snapGrid?.enabled ?? false,
                  size: parseInt(e.target.value || '10', 10),
                },
              })
            }
            className={uiPanelKeyValueInputClass}
          />
          <label className={`${checkboxLabelClassName} ml-4`}>
            <PanelCheckbox
              className={selectionControlClassName}
              checked={!!schema.behavior.preventDuplicatesGlobal}
              onChange={e => setBehavior({ preventDuplicatesGlobal: e.target.checked })}
            />
            Prevent Duplicates
          </label>
          <label className={checkboxLabelClassName}>
            <PanelCheckbox
              className={selectionControlClassName}
              checked={!!schema.behavior.preventSelfLoopsGlobal}
              onChange={e => setBehavior({ preventSelfLoopsGlobal: e.target.checked })}
            />
            Prevent Self-Loops
          </label>
        </section>
        <section className="mt-2 flex flex-wrap items-center gap-4 text-xs">
          <section className="flex items-center gap-2">
            <span className={inlineLabelClassName}>Select Mode</span>
            <PanelSelect
              value={schema.behavior.selectMode ?? 'single'}
              onValueChange={selectedValueInput => {
                const raw = selectedValueInput
                const v: GraphBehavior['selectMode'] = raw === 'multi' || raw === 'lasso' ? raw : 'single'
                setBehavior({ selectMode: v })
              }}
              className={UI_RESPONSIVE_PANEL_INLINE_FIELD_CLASSNAME}
            >
              <option value="single">Single</option>
              <option value="multi">Multi</option>
              <option value="lasso">Lasso</option>
            </PanelSelect>
          </section>
          <section className="flex items-center gap-2">
            <span className={inlineLabelClassName}>Create Mode</span>
            <PanelSelect
              value={schema.behavior.createMode ?? 'shift-drag'}
              onValueChange={selectedValueInput => {
                const raw = selectedValueInput
                const v: GraphBehavior['createMode'] =
                  raw === 'click-source-target' || raw === 'panel-only' ? raw : 'shift-drag'
                setBehavior({ createMode: v })
              }}
              className={UI_RESPONSIVE_PANEL_INLINE_FIELD_CLASSNAME}
            >
              <option value="shift-drag">Shift-drag</option>
              <option value="click-source-target">Click source/target</option>
              <option value="panel-only">Panel only</option>
            </PanelSelect>
          </section>
        </section>
        <section className="mt-2 flex items-center gap-2 text-xs">
          <span className={inlineLabelClassName}>Default Node Type</span>
          <PanelSelect
            value={schema.behavior.defaultNodeType ?? ''}
            onValueChange={selectedValueInput => setBehavior({ defaultNodeType: selectedValueInput || undefined })}
            className={UI_RESPONSIVE_PANEL_INLINE_FIELD_CLASSNAME}
          >
            <option value="">(none)</option>
            {uniqueNodeTypes.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </PanelSelect>
        </section>
      </Subsection>
    </section>
  )
}
