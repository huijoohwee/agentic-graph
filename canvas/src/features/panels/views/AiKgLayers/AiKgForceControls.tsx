import React from 'react'
import type { GraphSchema } from '@/lib/graph/schema'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import Tooltip from '@/features/panels/ui/Tooltip'
import { PanelCheckbox } from '@/lib/ui/panelFormControls'
import { PanelKeyTypeSliderNumberRow } from '@/features/panels/ui/PanelKeyTypeSliderNumberRow'
import {
  AI_AG_FORCE_BOX_FORCE_ROW_TOOLTIP,
  AI_AG_FORCE_BOX_FORCE_STRENGTH_ROW_TOOLTIP,
  AI_AG_FORCE_CHARGE_ROW_TOOLTIP,
  AI_AG_FORCE_COLLISION_ROW_TOOLTIP,
} from '@/lib/config'
import {
  COLLISION_RADIUS_DEFAULT,
  COLLISION_RADIUS_MIN,
  COLLISION_RADIUS_MAX,
  COLLISION_RADIUS_INTERVAL,
  clampCollisionRadius,
} from '@/features/panels/utils/orchestratorTraversal'
import {
  CHARGE_STRENGTH_DEFAULT,
  CHARGE_STRENGTH_INTERVAL,
  CHARGE_STRENGTH_MAX,
  CHARGE_STRENGTH_MIN,
  CHARGE_STRENGTH_TOOLTIP,
  BOX_FORCE_ENABLED_VALUE_TOOLTIP,
  BOX_FORCE_STRENGTH_TOOLTIP,
  COLLISION_RADIUS_TOOLTIP,
} from '../AiKgLayersSectionTooltips'
import { OrchestratorTraversalDelayRow } from '@/features/panels/ui/OrchestratorTraversalDelayRow'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'

type AiKgForceControlsProps = {
  schema: GraphSchema
  setSchema: (schema: GraphSchema) => void
  setCharge: (charge: number) => void
  setCollisionByType: (type: string, radius: number) => void
  traversalDelayMs: number
  setTraversalDelayMs: (ms: number) => void
  uiPanelKeyValueInputClass: string
}

export default function AiKgForceControls({
  schema,
  setSchema,
  setCharge,
  setCollisionByType,
  traversalDelayMs,
  setTraversalDelayMs,
  uiPanelKeyValueInputClass,
}: AiKgForceControlsProps) {
  const compactStaticRowProps = useCanvasKeyTypeValueStaticRowProps('compact')
  const currentCharge = schema.layout?.forces?.charge ?? -CHARGE_STRENGTH_DEFAULT
  const separation = Math.abs(currentCharge)

  const nodeTypes = schema.catalog?.nodeTypes || []
  const sampleCollisionType = nodeTypes[0]
  const collisionByType = schema.layout?.forces?.collisionByType || {}
  const currentCollision =
    typeof sampleCollisionType === 'string' && typeof collisionByType[sampleCollisionType] === 'number'
      ? (collisionByType[sampleCollisionType] as number)
      : COLLISION_RADIUS_DEFAULT
  const setBoxForceEnabled = (nextEnabled: boolean) => {
    const forces = schema.layout?.forces || {}
    setSchema({
      ...schema,
      layout: { ...schema.layout, forces: { ...forces, boxForce: nextEnabled } },
    })
  }
  const setBoxForceStrength = (nextValue: number) => {
    const forces = schema.layout?.forces || {}
    setSchema({
      ...schema,
      layout: { ...schema.layout, forces: { ...forces, boxForceStrength: nextValue } },
    })
  }

  return (
    <>
      <PanelKeyTypeSliderNumberRow
        density="compact"
        uiPanelKeyValueInputClass={uiPanelKeyValueInputClass}
        min={CHARGE_STRENGTH_MIN}
        max={CHARGE_STRENGTH_MAX}
        step={CHARGE_STRENGTH_INTERVAL}
        value={Number(separation)}
        displayValue={Number(
          Math.round(separation / CHARGE_STRENGTH_INTERVAL) * CHARGE_STRENGTH_INTERVAL,
        )}
        fallbackValue={CHARGE_STRENGTH_DEFAULT}
        normalizeValue={raw =>
          Math.round(
            Math.max(CHARGE_STRENGTH_MIN, Math.min(CHARGE_STRENGTH_MAX, raw)) / CHARGE_STRENGTH_INTERVAL,
          ) * CHARGE_STRENGTH_INTERVAL
        }
        onChange={next => {
          const nextCharge = -Math.abs(next)
          setCharge(nextCharge)
        }}
        controlTooltip={CHARGE_STRENGTH_TOOLTIP}
        keyNode={(
          <Tooltip
            content={AI_AG_FORCE_CHARGE_ROW_TOOLTIP}
            maxWidthPx={260}
            contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
            className={`break-words ${UI_THEME_TOKENS.text.primary}`}
          >
            layout.forces.charge
          </Tooltip>
        )}
      />
      <OrchestratorTraversalDelayRow
        density="compact"
        traversalDelayMs={traversalDelayMs}
        onChangeTraversalDelayMs={setTraversalDelayMs}
        uiPanelKeyValueInputClass={uiPanelKeyValueInputClass}
      />
      <PanelKeyTypeSliderNumberRow
        density="compact"
        uiPanelKeyValueInputClass={uiPanelKeyValueInputClass}
        min={COLLISION_RADIUS_MIN}
        max={COLLISION_RADIUS_MAX}
        step={COLLISION_RADIUS_INTERVAL}
        value={clampCollisionRadius(currentCollision)}
        fallbackValue={COLLISION_RADIUS_DEFAULT}
        normalizeValue={raw => clampCollisionRadius(raw)}
        onChange={next => {
          const types = schema.catalog?.nodeTypes || []
          types.forEach(t => {
            if (t) setCollisionByType(t, next)
          })
        }}
        controlTooltip={COLLISION_RADIUS_TOOLTIP}
        keyNode={(
          <Tooltip
            content={AI_AG_FORCE_COLLISION_ROW_TOOLTIP}
            maxWidthPx={260}
            contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
          >
            <span className={`${UI_THEME_TOKENS.text.primary} break-words`}>
              layout.forces.collisionByType
            </span>
          </Tooltip>
        )}
      />
      <KeyTypeValueStaticRow
        {...compactStaticRowProps}
        layout="keyIconValue"
        keyNode={(
          <Tooltip
            content={AI_AG_FORCE_BOX_FORCE_ROW_TOOLTIP}
            maxWidthPx={260}
            contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
            className={`break-words ${UI_THEME_TOKENS.text.primary}`}
          >
            layout.forces.boxForce
          </Tooltip>
        )}
        typeNode={null}
        valueNode={(
          <Tooltip
            content={BOX_FORCE_ENABLED_VALUE_TOOLTIP}
            maxWidthPx={260}
            contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
          >
            <section className="flex items-center justify-end">
              <PanelCheckbox
                checked={schema.layout?.forces?.boxForce !== false}
                onChange={e => setBoxForceEnabled(e.target.checked)}
              />
            </section>
          </Tooltip>
        )}
      />
      <PanelKeyTypeSliderNumberRow
        density="compact"
        uiPanelKeyValueInputClass={uiPanelKeyValueInputClass}
        min={0.01}
        max={0.2}
        step={0.01}
        value={schema.layout?.forces?.boxForceStrength ?? 0.05}
        fallbackValue={0.05}
        normalizeValue={raw => Math.round(Math.max(0.01, Math.min(0.2, raw)) * 100) / 100}
        onChange={setBoxForceStrength}
        controlTooltip={BOX_FORCE_STRENGTH_TOOLTIP}
        keyNode={(
          <Tooltip
            content={AI_AG_FORCE_BOX_FORCE_STRENGTH_ROW_TOOLTIP}
            maxWidthPx={260}
            contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
            className={`break-words ${UI_THEME_TOKENS.text.primary}`}
          >
            layout.forces.boxForceStrength
          </Tooltip>
        )}
      />
    </>
  )
}
