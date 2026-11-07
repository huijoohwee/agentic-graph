import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { PanelKeyTypeCheckboxValueRow } from '@/features/panels/ui/PanelKeyTypeCheckboxValueRow'
import { PanelKeyTypeRangeValueRow } from '@/features/panels/ui/PanelKeyTypeRangeValueRow'
import Tooltip from '@/features/panels/ui/Tooltip'
import type { GraphSchema } from '@/lib/graph/schema'
import {
  GLOBE_ARC_COUNT_TOOLTIP,
  GLOBE_ATMOSPHERE_OPACITY_TOOLTIP,
  GLOBE_ELLIPSOID_AXIS_TOOLTIP,
  GLOBE_GRID_DENSITY_TOOLTIP,
  GLOBE_HUB_ORBIT_RADIUS_TOOLTIP,
  GLOBE_HUB_ORBIT_SPEED_TOOLTIP,
  GLOBE_HUB_ORBIT_STRENGTH_TOOLTIP,
  GLOBE_ORBIT_RING_COUNT_TOOLTIP,
  GLOBE_PARTICLE_COUNT_TOOLTIP,
} from '@/features/panels/views/ThreeViewTuningTooltips'
import { ThreeViewFieldSection } from '@/features/panels/views/threeViewResponsiveClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_SMALL_SELECTION_CONTROL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

interface ThreeViewGlobeEffectsSectionProps {
  schema: GraphSchema
  setThreeConfig: (config: Partial<GraphSchema['three']>) => void
  collapsed: boolean
  onToggle?: (next: boolean) => void
}

export default function ThreeViewGlobeEffectsSection({
  schema,
  setThreeConfig,
  collapsed,
  onToggle,
}: ThreeViewGlobeEffectsSectionProps) {
  const globeEffectsEnabled = schema.three?.globeEffectsEnabled !== false
  const keyLabelClassName = UI_THEME_TOKENS.text.secondary
  const valueTextClassName = UI_THEME_TOKENS.text.tertiary
  const selectionControlClassName = `${UI_RESPONSIVE_SMALL_SELECTION_CONTROL_CLASSNAME} rounded ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.selectionControl}`
  return (
    <CollapsibleSection
      title="Globe effects"
      collapsed={collapsed}
      onToggle={onToggle}
      headerClassName="px-0"
      stickyOffsetClassName="top-6"
    >
      <ThreeViewFieldSection>
        <PanelKeyTypeCheckboxValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Enable Effects</span>}
          checked={globeEffectsEnabled}
          onChange={next => setThreeConfig({ globeEffectsEnabled: next })}
          checkboxClassName={selectionControlClassName}
        />
        <PanelKeyTypeCheckboxValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Label Depth Fade</span>}
          checked={schema.three?.globeLabelDepthFade !== false}
          onChange={next => setThreeConfig({ globeLabelDepthFade: next })}
          checkboxClassName={selectionControlClassName}
        />
        <PanelKeyTypeCheckboxValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Label Back-face Culling</span>}
          checked={schema.three?.globeLabelBackfaceCulling !== false}
          onChange={next => setThreeConfig({ globeLabelBackfaceCulling: next })}
          checkboxClassName={selectionControlClassName}
        />
        <PanelKeyTypeCheckboxValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Hub Orbit</span>}
          checked={schema.three?.globeHubOrbitEnabled !== false}
          onChange={next => setThreeConfig({ globeHubOrbitEnabled: next })}
          checkboxClassName={selectionControlClassName}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Hub Orbit Strength</span>}
          min={0}
          max={1.8}
          step={0.02}
          value={Number(schema.three?.globeHubOrbitStrength ?? 0.22)}
          onChange={next => setThreeConfig({ globeHubOrbitStrength: next })}
          valueNode={(
            <Tooltip content={GLOBE_HUB_ORBIT_STRENGTH_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>{String(schema.three?.globeHubOrbitStrength ?? 0.22)}</span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Hub Orbit Speed</span>}
          min={0}
          max={2.2}
          step={0.02}
          value={Number(schema.three?.globeHubOrbitSpeed ?? 0.24)}
          onChange={next => setThreeConfig({ globeHubOrbitSpeed: next })}
          valueNode={(
            <Tooltip content={GLOBE_HUB_ORBIT_SPEED_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>{String(schema.three?.globeHubOrbitSpeed ?? 0.24)}</span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Hub Orbit Radius</span>}
          min={0.05}
          max={0.8}
          step={0.01}
          value={Number(schema.three?.globeHubOrbitRadiusFactor ?? 0.2)}
          onChange={next => setThreeConfig({ globeHubOrbitRadiusFactor: next })}
          valueNode={(
            <Tooltip content={GLOBE_HUB_ORBIT_RADIUS_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>{String(schema.three?.globeHubOrbitRadiusFactor ?? 0.2)}</span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Ellipsoid Axis X</span>}
          min={0.5}
          max={1.8}
          step={0.02}
          value={Number(schema.three?.globeSphereEllipsoidX ?? 1.08)}
          onChange={next => setThreeConfig({ globeSphereEllipsoidX: next })}
          valueNode={(
            <Tooltip content={GLOBE_ELLIPSOID_AXIS_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>{String(schema.three?.globeSphereEllipsoidX ?? 1.08)}</span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Ellipsoid Axis Y</span>}
          min={0.5}
          max={1.8}
          step={0.02}
          value={Number(schema.three?.globeSphereEllipsoidY ?? 0.88)}
          onChange={next => setThreeConfig({ globeSphereEllipsoidY: next })}
          valueNode={(
            <Tooltip content={GLOBE_ELLIPSOID_AXIS_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>{String(schema.three?.globeSphereEllipsoidY ?? 0.88)}</span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Ellipsoid Axis Z</span>}
          min={0.5}
          max={1.8}
          step={0.02}
          value={Number(schema.three?.globeSphereEllipsoidZ ?? 1)}
          onChange={next => setThreeConfig({ globeSphereEllipsoidZ: next })}
          valueNode={(
            <Tooltip content={GLOBE_ELLIPSOID_AXIS_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>{String(schema.three?.globeSphereEllipsoidZ ?? 1)}</span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Particle Count</span>}
          min={0}
          max={4000}
          step={40}
          value={Number(schema.three?.globeParticleCount ?? 720)}
          onChange={next => setThreeConfig({ globeParticleCount: next })}
          valueNode={(
            <Tooltip content={GLOBE_PARTICLE_COUNT_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>{String(schema.three?.globeParticleCount ?? 720)}</span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Atmosphere Opacity</span>}
          min={0}
          max={0.8}
          step={0.02}
          value={Number(schema.three?.globeAtmosphereOpacity ?? 0.22)}
          onChange={next => setThreeConfig({ globeAtmosphereOpacity: next })}
          valueNode={(
            <Tooltip content={GLOBE_ATMOSPHERE_OPACITY_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>{String(schema.three?.globeAtmosphereOpacity ?? 0.22)}</span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Grid Density</span>}
          min={4}
          max={36}
          step={1}
          value={Number(schema.three?.globeGridDensity ?? 12)}
          onChange={next => setThreeConfig({ globeGridDensity: next })}
          valueNode={(
            <Tooltip content={GLOBE_GRID_DENSITY_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>{String(schema.three?.globeGridDensity ?? 12)}</span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Orbit Rings</span>}
          min={0}
          max={10}
          step={1}
          value={Number(schema.three?.globeOrbitRingCount ?? 4)}
          onChange={next => setThreeConfig({ globeOrbitRingCount: next })}
          valueNode={(
            <Tooltip content={GLOBE_ORBIT_RING_COUNT_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>{String(schema.three?.globeOrbitRingCount ?? 4)}</span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Tool Nodes</span>}
          min={0}
          max={80}
          step={1}
          value={Number(schema.three?.globeToolNodeCount ?? 24)}
          onChange={next => setThreeConfig({ globeToolNodeCount: next })}
          valueNode={<span className={valueTextClassName}>{String(schema.three?.globeToolNodeCount ?? 24)}</span>}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Great-circle Arcs</span>}
          min={0}
          max={36}
          step={1}
          value={Number(schema.three?.globeArcCount ?? 12)}
          onChange={next => setThreeConfig({ globeArcCount: next })}
          valueNode={(
            <Tooltip content={GLOBE_ARC_COUNT_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>{String(schema.three?.globeArcCount ?? 12)}</span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Arc Travelers</span>}
          min={0}
          max={4}
          step={1}
          value={Number(schema.three?.globeArcTravelerCount ?? 1)}
          onChange={next => setThreeConfig({ globeArcTravelerCount: next })}
          valueNode={<span className={valueTextClassName}>{String(schema.three?.globeArcTravelerCount ?? 1)}</span>}
        />
      </ThreeViewFieldSection>
    </CollapsibleSection>
  )
}
