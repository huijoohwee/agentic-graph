import React from 'react'
import type { EdgeMarkerShape, GraphSchema } from '@/lib/graph/schema'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { PANEL_TYPOGRAPHY_DEFAULTS } from 'grph-shared/ui/panelTypography'
import { UI_RESPONSIVE_COLOR_SWATCH_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import {
  KeyTypeValueStaticRow,
  RightAlignedValueCell,
} from 'grph-shared/react/keyTypeValueRow'

type FieldStylesSectionProps = {
  schema: GraphSchema
  scope: 'node' | 'edge'
  ownerKey: string
  uiPanelKeyValueTextSizeClass: string
}

function isHexColor(text: string) {
  const v = String(text || '').trim()
  if (!v.startsWith('#')) return false
  if (v.length === 4) return true
  if (v.length === 7) return true
  return false
}

export default function FieldStylesSection({
  schema,
  scope,
  ownerKey,
  uiPanelKeyValueTextSizeClass,
}: FieldStylesSectionProps) {
  const {
    updateNodeStyle,
    updateEdgeStyle,
    updateNodeSize,
    updateNodeStroke,
    setLabelStyles,
    setLabelOffset,
  } = useGraphStore()
  const uiPanelKeyValueInputClass = useGraphStore(
    s =>
      s.uiPanelKeyValueInputClass ||
      PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass,
  )
  const uiPanelMonospaceTextClass = useGraphStore(
    s => s.uiPanelMonospaceTextClass || 'font-mono text-xs',
  )

  const hasOwner = Boolean(String(ownerKey || '').trim())

  const nodeFillRaw = scope === 'node' ? String(schema.nodeStyles[ownerKey]?.color ?? '') : ''
  const nodeFillNormalized = nodeFillRaw.trim() || '#28A745'
  const nodeStrokeRaw = scope === 'node' ? String(schema.nodeStroke?.[ownerKey]?.color ?? '') : ''
  const nodeStrokeNormalized = nodeStrokeRaw.trim() || '#ffffff'

  const edgeColorRaw = scope === 'edge' ? String(schema.edgeStyles[ownerKey]?.color ?? '') : ''
  const edgeColorNormalized = edgeColorRaw.trim() || '#999999'
  const edgeStyle = scope === 'edge' ? schema.edgeStyles[ownerKey] || {} : {}
  const edgeMarkerStart = edgeStyle.markerStart || 'none'
  const edgeMarkerEnd = edgeStyle.markerEnd || (edgeStyle.arrow ? 'arrow' : 'none')
  const edgeMarkerSize = edgeStyle.markerSize || 'medium'

  const labelColorRaw = String(schema.labelStyles?.color ?? '')
  const labelColorNormalized = labelColorRaw.trim() || '#111111'
  const panelClassName = `rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} p-3 space-y-3`
  const keyLabelClassName = `${UI_THEME_TOKENS.text.secondary} break-words`
  const ownerValueClassName = `${uiPanelMonospaceTextClass} ${UI_THEME_TOKENS.text.secondary} break-all`
  const colorPickerClassName = `${UI_RESPONSIVE_COLOR_SWATCH_CLASSNAME} border ${UI_THEME_TOKENS.input.border} rounded cursor-pointer bg-transparent ${UI_THEME_TOKENS.focus.primaryBorderRing} disabled:opacity-50`
  const colorInputClassName = `${uiPanelKeyValueInputClass} min-w-0 flex-1 ${uiPanelMonospaceTextClass} disabled:opacity-50`
  const sectionHeadingClassName = `${uiPanelKeyValueTextSizeClass} font-semibold ${UI_THEME_TOKENS.text.primary}`
  const staticRowProps = useCanvasKeyTypeValueStaticRowProps('default')
  const KeyTypeValueRow = (
    props: Omit<
      React.ComponentProps<typeof KeyTypeValueStaticRow>,
      'textSizeClassName' | 'fontClassName' | 'densityClassName' | 'activeClassName'
    >,
  ) => <KeyTypeValueStaticRow {...staticRowProps} {...props} />

  return (
    <section className={panelClassName}>
      {scope === 'node' ? (
        <section className="space-y-2">
          <KeyTypeValueRow
            layout="keyValue"
            align="start"
            keyNode={<span className={keyLabelClassName}>Node type</span>}
            valueNode={<span className={ownerValueClassName}>{ownerKey || '—'}</span>}
          />
          <KeyTypeValueRow
            layout="keyValue"
            align="start"
            keyNode={<span className={keyLabelClassName}>Fill</span>}
            valueNode={(
              <RightAlignedValueCell className="gap-2">
                <input
                  type="color"
                  className={colorPickerClassName}
                  disabled={!hasOwner}
                  value={isHexColor(nodeFillNormalized) ? nodeFillNormalized : '#000000'}
                  onChange={e => updateNodeStyle(ownerKey, { color: e.target.value })}
                />
                <PanelTextInput
                  className={colorInputClassName}
                  disabled={!hasOwner}
                  value={nodeFillRaw}
                  onChange={e => updateNodeStyle(ownerKey, { color: e.target.value })}
                  placeholder="#28A745"
                />
              </RightAlignedValueCell>
            )}
          />
          <KeyTypeValueRow
            layout="keyValue"
            align="start"
            keyNode={<span className={keyLabelClassName}>Radius</span>}
            valueNode={(
              <RightAlignedValueCell>
                <PanelTextInput
                  type="number"
                  min={2}
                  max={60}
                  step={1}
                  disabled={!hasOwner}
                  value={schema.nodeSizes?.[ownerKey]?.radius ?? 10}
                  onChange={e => updateNodeSize(ownerKey, { radius: parseInt(e.target.value || '10', 10) })}
                  className={`${uiPanelKeyValueInputClass} disabled:opacity-50`}
                />
              </RightAlignedValueCell>
            )}
          />
          <KeyTypeValueRow
            layout="keyValue"
            align="start"
            keyNode={<span className={keyLabelClassName}>Stroke</span>}
            valueNode={(
              <RightAlignedValueCell className="gap-2">
                <input
                  type="color"
                  className={colorPickerClassName}
                  disabled={!hasOwner}
                  value={isHexColor(nodeStrokeNormalized) ? nodeStrokeNormalized : '#000000'}
                  onChange={e => updateNodeStroke(ownerKey, { color: e.target.value })}
                />
                <PanelTextInput
                  className={colorInputClassName}
                  disabled={!hasOwner}
                  value={nodeStrokeRaw}
                  onChange={e => updateNodeStroke(ownerKey, { color: e.target.value })}
                  placeholder="#ffffff"
                />
              </RightAlignedValueCell>
            )}
          />
          <KeyTypeValueRow
            layout="keyValue"
            align="start"
            keyNode={<span className={keyLabelClassName}>Stroke width</span>}
            valueNode={(
              <RightAlignedValueCell>
                <PanelTextInput
                  type="number"
                  min={0}
                  max={8}
                  step={0.5}
                  disabled={!hasOwner}
                  value={schema.nodeStroke?.[ownerKey]?.width ?? 1.5}
                  onChange={e => updateNodeStroke(ownerKey, { width: parseFloat(e.target.value || '1.5') })}
                  className={`${uiPanelKeyValueInputClass} disabled:opacity-50`}
                />
              </RightAlignedValueCell>
            )}
          />
        </section>
      ) : (
        <section className="space-y-2">
          <KeyTypeValueRow
            layout="keyValue"
            align="start"
            keyNode={<span className={keyLabelClassName}>Edge label</span>}
            valueNode={<span className={ownerValueClassName}>{ownerKey || '—'}</span>}
          />
          <KeyTypeValueRow
            layout="keyValue"
            align="start"
            keyNode={<span className={keyLabelClassName}>Color</span>}
            valueNode={(
              <RightAlignedValueCell className="gap-2">
                <input
                  type="color"
                  className={colorPickerClassName}
                  disabled={!hasOwner}
                  value={isHexColor(edgeColorNormalized) ? edgeColorNormalized : '#000000'}
                  onChange={e => updateEdgeStyle(ownerKey, { color: e.target.value })}
                />
                <PanelTextInput
                  className={colorInputClassName}
                  disabled={!hasOwner}
                  value={edgeColorRaw}
                  onChange={e => updateEdgeStyle(ownerKey, { color: e.target.value })}
                  placeholder="#999999"
                />
              </RightAlignedValueCell>
            )}
          />
          <KeyTypeValueRow
            layout="keyValue"
            align="start"
            keyNode={<span className={keyLabelClassName}>Width</span>}
            valueNode={(
              <RightAlignedValueCell>
                <PanelTextInput
                  type="number"
                  min={0.5}
                  max={8}
                  step={0.5}
                  disabled={!hasOwner}
                  value={schema.edgeStyles[ownerKey]?.width ?? 2}
                  onChange={e => updateEdgeStyle(ownerKey, { width: parseFloat(e.target.value || '2') })}
                  className={`${uiPanelKeyValueInputClass} disabled:opacity-50`}
                />
              </RightAlignedValueCell>
            )}
          />
          <KeyTypeValueRow
            layout="keyValue"
            align="start"
            keyNode={<span className={keyLabelClassName}>Start marker</span>}
            valueNode={(
              <RightAlignedValueCell>
                <PanelSelect
                  aria-label="Edge start marker"
                  disabled={!hasOwner}
                  value={edgeMarkerStart}
                  onChange={e => updateEdgeStyle(ownerKey, { markerStart: e.target.value as EdgeMarkerShape })}
                  className={`${uiPanelKeyValueInputClass} disabled:opacity-50`}
                >
                  <option value="none">None</option>
                  <option value="arrow">Arrow</option>
                  <option value="arrow-open">Open arrow</option>
                  <option value="circle">Circle</option>
                  <option value="diamond">Diamond</option>
                  <option value="bar">Bar</option>
                </PanelSelect>
              </RightAlignedValueCell>
            )}
          />
          <KeyTypeValueRow
            layout="keyValue"
            align="start"
            keyNode={<span className={keyLabelClassName}>End marker</span>}
            valueNode={(
              <RightAlignedValueCell>
                <PanelSelect
                  aria-label="Edge end marker"
                  disabled={!hasOwner}
                  value={edgeMarkerEnd}
                  onChange={e => {
                    const markerEnd = e.target.value as EdgeMarkerShape
                    updateEdgeStyle(ownerKey, { markerEnd, arrow: markerEnd === 'arrow' })
                  }}
                  className={`${uiPanelKeyValueInputClass} disabled:opacity-50`}
                >
                  <option value="none">None</option>
                  <option value="arrow">Arrow</option>
                  <option value="arrow-open">Open arrow</option>
                  <option value="circle">Circle</option>
                  <option value="diamond">Diamond</option>
                  <option value="bar">Bar</option>
                </PanelSelect>
              </RightAlignedValueCell>
            )}
          />
          <KeyTypeValueRow
            layout="keyValue"
            align="start"
            keyNode={<span className={keyLabelClassName}>Marker size</span>}
            valueNode={(
              <RightAlignedValueCell>
                <PanelSelect
                  aria-label="Edge marker size"
                  disabled={!hasOwner}
                  value={edgeMarkerSize}
                  onChange={e => updateEdgeStyle(ownerKey, {
                    markerSize: e.target.value as GraphSchema['edgeStyles'][string]['markerSize'],
                  })}
                  className={`${uiPanelKeyValueInputClass} disabled:opacity-50`}
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </PanelSelect>
              </RightAlignedValueCell>
            )}
          />
        </section>
      )}

      <section className="space-y-2">
        <section className={sectionHeadingClassName}>Labels</section>
        <KeyTypeValueRow
          layout="keyValue"
          align="start"
          keyNode={<span className={keyLabelClassName}>Font size</span>}
          valueNode={(
            <RightAlignedValueCell>
              <PanelTextInput
                type="number"
                min={8}
                max={32}
                step={1}
                value={schema.labelStyles?.fontSize ?? 12}
                onChange={e => setLabelStyles({ fontSize: parseInt(e.target.value || '12', 10) })}
                className={uiPanelKeyValueInputClass}
              />
            </RightAlignedValueCell>
          )}
        />
        <KeyTypeValueRow
          layout="keyValue"
          align="start"
          keyNode={<span className={keyLabelClassName}>Color</span>}
          valueNode={(
            <RightAlignedValueCell className="gap-2">
              <input
                type="color"
                className={colorPickerClassName.replace(' disabled:opacity-50', '')}
                value={isHexColor(labelColorNormalized) ? labelColorNormalized : '#000000'}
                onChange={e => setLabelStyles({ color: e.target.value })}
              />
              <PanelTextInput
                className={colorInputClassName.replace(' disabled:opacity-50', '')}
                value={labelColorRaw}
                onChange={e => setLabelStyles({ color: e.target.value })}
                placeholder="#111111"
              />
            </RightAlignedValueCell>
          )}
        />
        <KeyTypeValueRow
          layout="keyValue"
          align="start"
          keyNode={<span className={keyLabelClassName}>Offset dx</span>}
          valueNode={(
            <RightAlignedValueCell>
              <PanelTextInput
                type="number"
                step={1}
                value={schema.labelStyles?.offset?.dx ?? 12}
                onChange={e => setLabelOffset({ dx: parseInt(e.target.value || '12', 10) })}
                className={uiPanelKeyValueInputClass}
              />
            </RightAlignedValueCell>
          )}
        />
        <KeyTypeValueRow
          layout="keyValue"
          align="start"
          keyNode={<span className={keyLabelClassName}>Offset dy</span>}
          valueNode={(
            <RightAlignedValueCell>
              <PanelTextInput
                type="number"
                step={1}
                value={schema.labelStyles?.offset?.dy ?? 4}
                onChange={e => setLabelOffset({ dy: parseInt(e.target.value || '4', 10) })}
                className={uiPanelKeyValueInputClass}
              />
            </RightAlignedValueCell>
          )}
        />
      </section>
    </section>
  )
}
