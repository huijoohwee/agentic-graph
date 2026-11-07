import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { PanelKeyTypeRangeValueRow } from '@/features/panels/ui/PanelKeyTypeRangeValueRow'
import Tooltip from '@/features/panels/ui/Tooltip'
import type { GraphSchema } from '@/lib/graph/schema'
import { getThreeSelectionConfig } from '@/lib/graph/schema'
import {
  ARROW_LENGTH_TOOLTIP,
  LINK_OPACITY_TOOLTIP,
  LINK_CURVATURE_TOOLTIP,
  CURVE_ROTATION_TOOLTIP,
  DIRECTIONAL_PARTICLES_TOOLTIP,
  ARROW_POSITION_TOOLTIP,
  PARTICLE_SPEED_TOOLTIP,
  SELECTED_EDGE_WIDTH_TOOLTIP,
} from '@/features/panels/views/ThreeViewTuningTooltips'
import { ThreeViewFieldSection } from '@/features/panels/views/threeViewResponsiveClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

interface ThreeViewLinksSectionProps {
  schema: GraphSchema
  setThreeConfig: (config: Partial<GraphSchema['three']>) => void
  collapsed: boolean
  onToggle?: (next: boolean) => void
}

export default function ThreeViewLinksSection({
  schema,
  setThreeConfig,
  collapsed,
  onToggle,
}: ThreeViewLinksSectionProps) {
  const selectionConfig = getThreeSelectionConfig(schema)
  const keyLabelClassName = UI_THEME_TOKENS.text.secondary
  const valueTextClassName = UI_THEME_TOKENS.text.tertiary

  return (
    <CollapsibleSection
      title="Edges and particles"
      collapsed={collapsed}
      onToggle={onToggle}
      headerClassName="px-0"
      stickyOffsetClassName="top-6"
    >
      <ThreeViewFieldSection>
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Arrow Length</span>}
          min={2}
          max={24}
          step={1}
          value={Number(schema.three?.linkDirectionalArrowLength ?? 8)}
          onChange={next => setThreeConfig({ linkDirectionalArrowLength: next })}
          valueNode={(
            <Tooltip content={ARROW_LENGTH_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(schema.three?.linkDirectionalArrowLength ?? 8)}
              </span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Link Opacity</span>}
          min={0}
          max={1}
          step={0.05}
          value={Number(schema.three?.linkOpacity ?? 0.6)}
          onChange={next => setThreeConfig({ linkOpacity: next })}
          valueNode={(
            <Tooltip content={LINK_OPACITY_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(schema.three?.linkOpacity ?? 0.6)}
              </span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Default Curvature</span>}
          min={0}
          max={1.5}
          step={0.05}
          value={Number(schema.three?.linkCurvature ?? 0.0)}
          onChange={next => setThreeConfig({ linkCurvature: next })}
          valueNode={(
            <Tooltip content={LINK_CURVATURE_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(schema.three?.linkCurvature ?? 0.0)}
              </span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Curve Rotation</span>}
          min={-Math.PI}
          max={Math.PI}
          step={0.05}
          value={Number(schema.three?.linkCurveRotation ?? 0.0)}
          onChange={next => setThreeConfig({ linkCurveRotation: next })}
          valueNode={(
            <Tooltip content={CURVE_ROTATION_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(schema.three?.linkCurveRotation ?? 0.0)}
              </span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Directional Particles</span>}
          min={0}
          max={32}
          step={1}
          value={Number(schema.three?.linkDirectionalParticles ?? 0)}
          onChange={next => setThreeConfig({ linkDirectionalParticles: next })}
          valueNode={(
            <Tooltip content={DIRECTIONAL_PARTICLES_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(schema.three?.linkDirectionalParticles ?? 0)}
              </span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Arrow Position</span>}
          min={0.2}
          max={1}
          step={0.05}
          value={Number(schema.three?.linkDirectionalArrowRelPos ?? 0.85)}
          onChange={next => setThreeConfig({ linkDirectionalArrowRelPos: next })}
          valueNode={(
            <Tooltip content={ARROW_POSITION_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(schema.three?.linkDirectionalArrowRelPos ?? 0.85)}
              </span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Particle Speed</span>}
          min={0.1}
          max={2}
          step={0.05}
          value={Number(schema.three?.linkDirectionalParticleSpeed ?? 0.6)}
          onChange={next => setThreeConfig({ linkDirectionalParticleSpeed: next })}
          valueNode={(
            <Tooltip content={PARTICLE_SPEED_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(schema.three?.linkDirectionalParticleSpeed ?? 0.6)}
              </span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Selected Edge Width</span>}
          min={1}
          max={6}
          step={0.25}
          value={Number(selectionConfig.selectedEdgeWidth)}
          onChange={next => setThreeConfig({ selection: { selectedEdgeWidth: next } })}
          valueNode={(
            <Tooltip content={SELECTED_EDGE_WIDTH_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(selectionConfig.selectedEdgeWidth)}
              </span>
            </Tooltip>
          )}
        />
      </ThreeViewFieldSection>
    </CollapsibleSection>
  )
}
