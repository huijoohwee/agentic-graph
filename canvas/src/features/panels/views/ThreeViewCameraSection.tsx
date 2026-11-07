import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { PanelKeyTypeRangeValueRow } from '@/features/panels/ui/PanelKeyTypeRangeValueRow'
import Tooltip from '@/features/panels/ui/Tooltip'
import type { GraphSchema } from '@/lib/graph/schema'
import {
  CAMERA_DAMPING_TOOLTIP,
  ROTATE_SPEED_TOOLTIP,
  ZOOM_SPEED_TOOLTIP,
  PAN_SPEED_TOOLTIP,
} from '@/features/panels/views/ThreeViewTuningTooltips'
import { ThreeViewFieldSection } from '@/features/panels/views/threeViewResponsiveClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

interface ThreeViewCameraSectionProps {
  schema: GraphSchema
  setThreeConfig: (config: Partial<GraphSchema['three']>) => void
  collapsed: boolean
  onToggle?: (next: boolean) => void
}

export default function ThreeViewCameraSection({
  schema,
  setThreeConfig,
  collapsed,
  onToggle,
}: ThreeViewCameraSectionProps) {
  const keyLabelClassName = UI_THEME_TOKENS.text.secondary
  const valueTextClassName = UI_THEME_TOKENS.text.tertiary
  return (
    <CollapsibleSection
      title="Camera and navigation"
      collapsed={collapsed}
      onToggle={onToggle}
      headerClassName="px-0"
      stickyOffsetClassName="top-6"
    >
      <ThreeViewFieldSection>
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Camera Damping</span>}
          min={0}
          max={0.3}
          step={0.01}
          value={Number(schema.three?.cameraDampingFactor ?? 0.08)}
          onChange={next => setThreeConfig({ cameraDampingFactor: next })}
          valueNode={(
            <Tooltip content={CAMERA_DAMPING_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(schema.three?.cameraDampingFactor ?? 0.08)}
              </span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Rotate Speed</span>}
          min={0.1}
          max={2}
          step={0.05}
          value={Number(schema.three?.cameraRotateSpeed ?? 0.6)}
          onChange={next => setThreeConfig({ cameraRotateSpeed: next })}
          valueNode={(
            <Tooltip content={ROTATE_SPEED_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(schema.three?.cameraRotateSpeed ?? 0.6)}
              </span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Zoom Speed</span>}
          min={0.2}
          max={2}
          step={0.05}
          value={Number(schema.three?.cameraZoomSpeed ?? 0.8)}
          onChange={next => setThreeConfig({ cameraZoomSpeed: next })}
          valueNode={(
            <Tooltip content={ZOOM_SPEED_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(schema.three?.cameraZoomSpeed ?? 0.8)}
              </span>
            </Tooltip>
          )}
        />
        <PanelKeyTypeRangeValueRow
          density="compact"
          keyNode={<span className={keyLabelClassName}>Pan Speed</span>}
          min={0.1}
          max={2}
          step={0.05}
          value={Number(schema.three?.cameraPanSpeed ?? 0.5)}
          onChange={next => setThreeConfig({ cameraPanSpeed: next })}
          valueNode={(
            <Tooltip content={PAN_SPEED_TOOLTIP} maxWidthPx={260}>
              <span className={valueTextClassName}>
                {String(schema.three?.cameraPanSpeed ?? 0.5)}
              </span>
            </Tooltip>
          )}
        />
      </ThreeViewFieldSection>
    </CollapsibleSection>
  )
}
