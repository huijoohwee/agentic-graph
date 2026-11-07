import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { PanelKeyTypeCheckboxValueRow } from '@/features/panels/ui/PanelKeyTypeCheckboxValueRow'
import { PanelKeyTypeRangeValueRow } from '@/features/panels/ui/PanelKeyTypeRangeValueRow'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import Tooltip from '@/features/panels/ui/Tooltip'
import { PanelTextInput } from '@/lib/ui/panelFormControls'
import type { GraphSchema } from '@/lib/graph/schema'
import {
  NODE_MOTION_TOOLTIP,
  MINIMAP_OPACITY_TOOLTIP,
  SPHERE_RADIUS_TOOLTIP,
  MIN_SPACING_TOOLTIP,
  LAYOUT_SEED_TOOLTIP,
  VOXEL_SEED_SCALE_TOOLTIP,
  VOXEL_GRID_SCALE_TOOLTIP,
  VOXEL_LAYER_SPACING_TOOLTIP,
  VOXEL_LAYER_PLATE_OPACITY_TOOLTIP,
  VOXEL_LAYER_PLATE_RISE_DURATION_TOOLTIP,
  VOXEL_LAYER_PLATE_RISE_STAGGER_TOOLTIP,
  VOXEL_CLUSTER_PULSE_STRENGTH_TOOLTIP,
  VOXEL_EDGE_HOVER_OPACITY_TOOLTIP,
  VOXEL_GAP_RING_THRESHOLD_TOOLTIP,
  VOXEL_INTRO_DELAY_TOOLTIP,
  VOXEL_INTRO_DURATION_TOOLTIP,
  VOXEL_DEFAULT_YAW_TOOLTIP,
  VOXEL_DEFAULT_TILT_TOOLTIP,
  VOXEL_DEFAULT_DISTANCE_FACTOR_TOOLTIP,
  VOXEL_DEFAULT_TARGET_LIFT_TOOLTIP,
  VOXEL_GHOST_OPACITY_TOOLTIP,
  VOXEL_TOP_CAP_EMISSIVE_TOOLTIP,
  VOXEL_CLUSTER_LIGHT_TOOLTIP,
  VOXEL_HUB_PULSE_TOOLTIP,
  VOXEL_CONCEPT_FLOAT_TOOLTIP,
  VOXEL_IDLE_ROTATE_DELAY_TOOLTIP,
  VOXEL_IDLE_ROTATE_SPEED_TOOLTIP,
} from '@/features/panels/views/ThreeViewTuningTooltips'
import ThreeSizingAndWidthControls from '@/features/panels/views/shared/ThreeSizingAndWidthControls'
import { ThreeViewFieldSection } from '@/features/panels/views/threeViewResponsiveClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'
const keyLabelClassName = UI_THEME_TOKENS.text.primary
const valueLabelClassName = UI_THEME_TOKENS.text.secondary
const selectionControlClassName = `rounded ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.selectionControl}`

interface ThreeViewLayoutSectionProps {
  schema: GraphSchema
  setThreeConfig: (config: Partial<GraphSchema['three']>) => void
  collapsed: boolean
  onToggle?: (next: boolean) => void
  uiPanelKeyValueInputClass: string
}

export default function ThreeViewLayoutSection({
  schema,
  setThreeConfig,
  collapsed,
  onToggle,
  uiPanelKeyValueInputClass,
}: ThreeViewLayoutSectionProps) {
  const layerOpacityByLayer = schema.three?.layerOpacityByLayer || {}
  const layer1 = typeof layerOpacityByLayer['1'] === 'number' ? layerOpacityByLayer['1'] : 1.0
  const layer2 = typeof layerOpacityByLayer['2'] === 'number' ? layerOpacityByLayer['2'] : 0.9
  const layer3 = typeof layerOpacityByLayer['3'] === 'number' ? layerOpacityByLayer['3'] : 0.8
  const staticRowProps = useCanvasKeyTypeValueStaticRowProps('default')
  const KeyTypeValueRow = (
    props: Omit<
      React.ComponentProps<typeof KeyTypeValueStaticRow>,
      'textSizeClassName' | 'fontClassName' | 'densityClassName' | 'activeClassName'
    >,
  ) => <KeyTypeValueStaticRow {...staticRowProps} {...props} />

  const renderRangeValueLabel = (value: number, tooltip?: string) => {
    const labelNode = (
      <span className={valueLabelClassName}>
        {String(value)}
      </span>
    )
    if (!tooltip) return labelNode
    return (
      <Tooltip
        content={tooltip}
        maxWidthPx={260}
      >
        {labelNode}
      </Tooltip>
    )
  }

  const rangeRows = [
    {
      label: 'Node Motion',
      min: 0,
      max: 2,
      step: 0.1,
      value: Number(schema.three?.nodeMotionIntensity ?? 1.0),
      onChange: (next: number) => setThreeConfig({ nodeMotionIntensity: next }),
      tooltip: NODE_MOTION_TOOLTIP,
    },
    {
      label: 'Minimap Opacity',
      min: 0.2,
      max: 1,
      step: 0.05,
      value: Number(schema.three?.minimapOpacity ?? 0.7),
      onChange: (next: number) => setThreeConfig({ minimapOpacity: next }),
      tooltip: MINIMAP_OPACITY_TOOLTIP,
    },
    {
      label: 'Sphere Radius',
      min: 60,
      max: 260,
      step: 5,
      value: Number(schema.three?.sphereRadius ?? 120),
      onChange: (next: number) => setThreeConfig({ sphereRadius: next }),
      tooltip: SPHERE_RADIUS_TOOLTIP,
    },
    {
      label: 'Min Spacing',
      min: 0,
      max: 80,
      step: 2,
      value: Number(schema.three?.minSpacing ?? 0),
      onChange: (next: number) => setThreeConfig({ minSpacing: next }),
      tooltip: MIN_SPACING_TOOLTIP,
    },
    {
      label: 'Voxel Seed Scale',
      min: 0.3,
      max: 3,
      step: 0.05,
      value: Number(schema.three?.voxelSeedScaleFactor ?? 1),
      onChange: (next: number) => setThreeConfig({ voxelSeedScaleFactor: next }),
      tooltip: VOXEL_SEED_SCALE_TOOLTIP,
    },
    {
      label: 'Voxel Grid Scale',
      min: 0.3,
      max: 3,
      step: 0.05,
      value: Number(schema.three?.voxelGridScaleFactor ?? 1),
      onChange: (next: number) => setThreeConfig({ voxelGridScaleFactor: next }),
      tooltip: VOXEL_GRID_SCALE_TOOLTIP,
    },
    {
      label: 'Voxel Layer Spacing',
      min: 20,
      max: 400,
      step: 4,
      value: Number(schema.three?.voxelLayerSpacing ?? 84),
      onChange: (next: number) => setThreeConfig({ voxelLayerSpacing: next }),
      tooltip: VOXEL_LAYER_SPACING_TOOLTIP,
    },
    {
      label: 'Voxel Plate Opacity',
      min: 0,
      max: 0.45,
      step: 0.01,
      value: Number(schema.three?.voxelLayerPlateOpacity ?? 0.06),
      onChange: (next: number) => setThreeConfig({ voxelLayerPlateOpacity: next }),
      tooltip: VOXEL_LAYER_PLATE_OPACITY_TOOLTIP,
    },
    {
      label: 'Voxel Pulse Strength',
      min: 0,
      max: 1.2,
      step: 0.02,
      value: Number(schema.three?.voxelClusterPulseStrength ?? 0.22),
      onChange: (next: number) => setThreeConfig({ voxelClusterPulseStrength: next }),
      tooltip: VOXEL_CLUSTER_PULSE_STRENGTH_TOOLTIP,
    },
    {
      label: 'Voxel Edge Hover',
      min: 0,
      max: 1,
      step: 0.05,
      value: Number(schema.three?.voxelEdgeHoverOpacity ?? 0.65),
      onChange: (next: number) => setThreeConfig({ voxelEdgeHoverOpacity: next }),
      tooltip: VOXEL_EDGE_HOVER_OPACITY_TOOLTIP,
    },
    {
      label: 'Voxel Gap Ring Threshold',
      min: 0,
      max: 1,
      step: 0.01,
      value: Number(schema.three?.voxelGapRingThreshold ?? 0.85),
      onChange: (next: number) => setThreeConfig({ voxelGapRingThreshold: next }),
      tooltip: VOXEL_GAP_RING_THRESHOLD_TOOLTIP,
    },
    {
      label: 'Voxel Intro Delay (ms)',
      min: 0,
      max: 6000,
      step: 50,
      value: Number(schema.three?.voxelIntroDelayMs ?? 320),
      onChange: (next: number) => setThreeConfig({ voxelIntroDelayMs: next }),
      tooltip: VOXEL_INTRO_DELAY_TOOLTIP,
    },
    {
      label: 'Voxel Intro Duration (ms)',
      min: 80,
      max: 6000,
      step: 50,
      value: Number(schema.three?.voxelIntroDurationMs ?? 1100),
      onChange: (next: number) => setThreeConfig({ voxelIntroDurationMs: next }),
      tooltip: VOXEL_INTRO_DURATION_TOOLTIP,
    },
    {
      label: 'Voxel Camera Yaw',
      min: -180,
      max: 180,
      step: 1,
      value: Number(schema.three?.voxelDefaultYawDeg ?? -36),
      onChange: (next: number) => setThreeConfig({ voxelDefaultYawDeg: next }),
      tooltip: VOXEL_DEFAULT_YAW_TOOLTIP,
    },
    {
      label: 'Voxel Camera Tilt',
      min: 5,
      max: 80,
      step: 1,
      value: Number(schema.three?.voxelDefaultTiltDeg ?? 32),
      onChange: (next: number) => setThreeConfig({ voxelDefaultTiltDeg: next }),
      tooltip: VOXEL_DEFAULT_TILT_TOOLTIP,
    },
    {
      label: 'Voxel Camera Distance',
      min: 0.8,
      max: 6,
      step: 0.05,
      value: Number(schema.three?.voxelDefaultDistanceFactor ?? 2.2),
      onChange: (next: number) => setThreeConfig({ voxelDefaultDistanceFactor: next }),
      tooltip: VOXEL_DEFAULT_DISTANCE_FACTOR_TOOLTIP,
    },
    {
      label: 'Voxel Target Lift',
      min: -80,
      max: 80,
      step: 1,
      value: Number(schema.three?.voxelDefaultTargetLift ?? 8),
      onChange: (next: number) => setThreeConfig({ voxelDefaultTargetLift: next }),
      tooltip: VOXEL_DEFAULT_TARGET_LIFT_TOOLTIP,
    },
    {
      label: 'Voxel Ghost Opacity',
      min: 0.05,
      max: 0.9,
      step: 0.05,
      value: Number(schema.three?.voxelGhostOpacity ?? 0.32),
      onChange: (next: number) => setThreeConfig({ voxelGhostOpacity: next }),
      tooltip: VOXEL_GHOST_OPACITY_TOOLTIP,
    },
    {
      label: 'Voxel Top Cap Glow',
      min: 0.2,
      max: 2.2,
      step: 0.1,
      value: Number(schema.three?.voxelTopCapEmissiveIntensity ?? 0.9),
      onChange: (next: number) => setThreeConfig({ voxelTopCapEmissiveIntensity: next }),
      tooltip: VOXEL_TOP_CAP_EMISSIVE_TOOLTIP,
    },
    {
      label: 'Voxel Cluster Light',
      min: 0,
      max: 2,
      step: 0.1,
      value: Number(schema.three?.voxelClusterLightIntensity ?? 0.7),
      onChange: (next: number) => setThreeConfig({ voxelClusterLightIntensity: next }),
      tooltip: VOXEL_CLUSTER_LIGHT_TOOLTIP,
    },
    {
      label: 'Voxel Hub Pulse',
      min: 0,
      max: 0.5,
      step: 0.01,
      value: Number(schema.three?.voxelHubPulseStrength ?? 0.07),
      onChange: (next: number) => setThreeConfig({ voxelHubPulseStrength: next }),
      tooltip: VOXEL_HUB_PULSE_TOOLTIP,
    },
    {
      label: 'Voxel Concept Float',
      min: 0,
      max: 4,
      step: 0.1,
      value: Number(schema.three?.voxelConceptFloatStrength ?? 1),
      onChange: (next: number) => setThreeConfig({ voxelConceptFloatStrength: next }),
      tooltip: VOXEL_CONCEPT_FLOAT_TOOLTIP,
    },
    {
      label: 'Voxel Idle Rotate Delay',
      min: 0,
      max: 6000,
      step: 100,
      value: Number(schema.three?.voxelIdleAutoRotateDelayMs ?? 900),
      onChange: (next: number) => setThreeConfig({ voxelIdleAutoRotateDelayMs: next }),
      tooltip: VOXEL_IDLE_ROTATE_DELAY_TOOLTIP,
    },
    {
      label: 'Voxel Idle Rotate Speed',
      min: 0,
      max: 1.5,
      step: 0.05,
      value: Number(schema.three?.voxelIdleAutoRotateSpeed ?? 0.12),
      onChange: (next: number) => setThreeConfig({ voxelIdleAutoRotateSpeed: next }),
      tooltip: VOXEL_IDLE_ROTATE_SPEED_TOOLTIP,
    },
  ] as const

  const layerOpacityRows = [
    {
      label: 'Layer 1 Opacity',
      value: Number(layer1),
      onChange: (next: number) => setThreeConfig({ layerOpacityByLayer: { ...layerOpacityByLayer, '1': next } }),
    },
    {
      label: 'Layer 2 Opacity',
      value: Number(layer2),
      onChange: (next: number) => setThreeConfig({ layerOpacityByLayer: { ...layerOpacityByLayer, '2': next } }),
    },
    {
      label: 'Layer 3 Opacity',
      value: Number(layer3),
      onChange: (next: number) => setThreeConfig({ layerOpacityByLayer: { ...layerOpacityByLayer, '3': next } }),
    },
  ] as const

  const renderNumberInputRow = (
    label: string,
    value: number,
    onChange: (next: number) => void,
    tooltip: string,
  ) => (
    <KeyTypeValueRow
      key={label}
      layout="keyValue"
      keyNode={<span className={keyLabelClassName}>{label}</span>}
      valueNode={(
        <Tooltip
          content={tooltip}
          maxWidthPx={260}
        >
          <PanelTextInput
            type="number"
            className={uiPanelKeyValueInputClass}
            value={value}
            onChange={event => onChange(Number(event.target.value))}
          />
        </Tooltip>
      )}
    />
  )

  return (
    <CollapsibleSection
      title="Layout and geometry"
      collapsed={collapsed}
      onToggle={onToggle}
      headerClassName="px-0"
      stickyOffsetClassName="top-6"
    >
      <ThreeViewFieldSection>
        {rangeRows.map(row => (
          <PanelKeyTypeRangeValueRow
            key={row.label}
            keyNode={<span className={keyLabelClassName}>{row.label}</span>}
            min={row.min}
            max={row.max}
            step={row.step}
            value={row.value}
            onChange={row.onChange}
            valueNode={renderRangeValueLabel(row.value, row.tooltip)}
          />
        ))}
        {renderNumberInputRow(
          'Layout Seed',
          Number(schema.three?.seed ?? 1),
          next => {
            const parsed = Number(next)
            setThreeConfig({ seed: Number.isFinite(parsed) ? parsed : 1 })
          },
          LAYOUT_SEED_TOOLTIP,
        )}
        <PanelKeyTypeCheckboxValueRow
          keyNode={<span className={keyLabelClassName}>Voxel Animation</span>}
          checked={schema.three?.voxelAnimationEnabled !== false}
          onChange={next => setThreeConfig({ voxelAnimationEnabled: next })}
          checkboxClassName={selectionControlClassName}
          labelNode={<span className={`text-xs ${valueLabelClassName}`}>enabled</span>}
        />
        {renderNumberInputRow(
          'Voxel Plate Rise (ms)',
          Number(schema.three?.voxelLayerPlateRiseDurationMs ?? 900),
          next => setThreeConfig({ voxelLayerPlateRiseDurationMs: next }),
          VOXEL_LAYER_PLATE_RISE_DURATION_TOOLTIP,
        )}
        {renderNumberInputRow(
          'Voxel Plate Stagger (ms)',
          Number(schema.three?.voxelLayerPlateRiseStaggerMs ?? 160),
          next => setThreeConfig({ voxelLayerPlateRiseStaggerMs: next }),
          VOXEL_LAYER_PLATE_RISE_STAGGER_TOOLTIP,
        )}
        <ThreeSizingAndWidthControls
          schema={schema}
          setThreeConfig={setThreeConfig}
          uiPanelKeyValueInputClass={uiPanelKeyValueInputClass}
          variant="simple"
        />
        {layerOpacityRows.map(row => (
          <PanelKeyTypeRangeValueRow
            key={row.label}
            keyNode={<span className={keyLabelClassName}>{row.label}</span>}
            min={0}
            max={1}
            step={0.05}
            value={row.value}
            onChange={row.onChange}
            valueNode={renderRangeValueLabel(row.value)}
          />
        ))}
      </ThreeViewFieldSection>
    </CollapsibleSection>
  )
}
