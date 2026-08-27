import React from 'react'
import type { GraphSchema } from '@/lib/graph/schema'
import { getThreeConfig } from '@/lib/graph/schema'
import Tooltip from '@/features/panels/ui/Tooltip'
import { PanelKeyTypeSliderNumberRow } from '@/features/panels/ui/PanelKeyTypeSliderNumberRow'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  AI_AG_LAYER1_OPACITY_ROW_TOOLTIP,
  AI_AG_LAYER2_OPACITY_ROW_TOOLTIP,
  AI_AG_LAYER3_OPACITY_ROW_TOOLTIP,
} from '@/lib/config'
import {
  LAYER1_OPACITY_TOOLTIP,
  LAYER2_OPACITY_TOOLTIP,
  LAYER3_OPACITY_TOOLTIP,
} from '../AiKgLayersSectionTooltips'
type AiKgOpacityControlsProps = {
  schema: GraphSchema
  setThreeConfig: (config: Partial<GraphSchema['three']>) => void
  uiPanelKeyValueInputClass: string
}

export default function AiKgOpacityControls({
  schema,
  setThreeConfig,
  uiPanelKeyValueInputClass,
}: AiKgOpacityControlsProps) {
  const three = getThreeConfig(schema)
  const layerOpacityByLayer = (three.layerOpacityByLayer || {}) as Record<string, number>

  const getLayerOpacityValue = (layer: '1' | '2' | '3', fallback: number) => {
    const v = layerOpacityByLayer[layer]
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback
  }

  const layer1 = getLayerOpacityValue('1', 1.0)
  const layer2 = getLayerOpacityValue('2', 0.9)
  const layer3 = getLayerOpacityValue('3', 0.8)
  const normalizeLayerOpacity = (raw: number, fallbackValue: number) => {
    const clamped = Number.isFinite(raw) ? Math.max(0.2, Math.min(1, raw)) : fallbackValue
    return Math.round(clamped * 20) / 20
  }
  const setLayerOpacity = (layer: '1' | '2' | '3', nextValue: number) => {
    setThreeConfig({
      layerOpacityByLayer: {
        ...(layerOpacityByLayer as Record<string, number>),
        '1': layer === '1' ? nextValue : layer1,
        '2': layer === '2' ? nextValue : layer2,
        '3': layer === '3' ? nextValue : layer3,
      },
    })
  }

  return (
    <>
      <PanelKeyTypeSliderNumberRow
        density="compact"
        uiPanelKeyValueInputClass={uiPanelKeyValueInputClass}
        min={0.2}
        max={1}
        step={0.05}
        value={Number(layer1)}
        displayValue={Number(layer1.toFixed(2))}
        fallbackValue={1}
        normalizeValue={raw => normalizeLayerOpacity(raw, 1)}
        onChange={next => setLayerOpacity('1', next)}
        controlTooltip={LAYER1_OPACITY_TOOLTIP}
        keyNode={(
          <Tooltip
            content={AI_AG_LAYER1_OPACITY_ROW_TOOLTIP}
            maxWidthPx={260}
            contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
            className={`break-words ${UI_THEME_TOKENS.text.primary}`}
          >
            three.layerOpacityByLayer['1']
          </Tooltip>
        )}
      />
      <PanelKeyTypeSliderNumberRow
        density="compact"
        uiPanelKeyValueInputClass={uiPanelKeyValueInputClass}
        min={0.2}
        max={1}
        step={0.05}
        value={Number(layer2)}
        displayValue={Number(layer2.toFixed(2))}
        fallbackValue={0.9}
        normalizeValue={raw => normalizeLayerOpacity(raw, 0.9)}
        onChange={next => setLayerOpacity('2', next)}
        controlTooltip={LAYER2_OPACITY_TOOLTIP}
        keyNode={(
          <Tooltip
            content={AI_AG_LAYER2_OPACITY_ROW_TOOLTIP}
            maxWidthPx={260}
            contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
            className={`break-words ${UI_THEME_TOKENS.text.primary}`}
          >
            three.layerOpacityByLayer['2']
          </Tooltip>
        )}
      />
      <PanelKeyTypeSliderNumberRow
        density="compact"
        uiPanelKeyValueInputClass={uiPanelKeyValueInputClass}
        min={0.2}
        max={1}
        step={0.05}
        value={Number(layer3)}
        displayValue={Number(layer3.toFixed(2))}
        fallbackValue={0.8}
        normalizeValue={raw => normalizeLayerOpacity(raw, 0.8)}
        onChange={next => setLayerOpacity('3', next)}
        controlTooltip={LAYER3_OPACITY_TOOLTIP}
        keyNode={(
          <Tooltip
            content={AI_AG_LAYER3_OPACITY_ROW_TOOLTIP}
            maxWidthPx={260}
            contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
            className={`break-words ${UI_THEME_TOKENS.text.primary}`}
          >
            three.layerOpacityByLayer['3']
          </Tooltip>
        )}
      />
    </>
  )
}
