import React from 'react'
import type { GraphSchema } from '@/lib/graph/schema'
import { UI_ANCHORS, UI_LABELS } from '@/lib/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import AiKgLayersControls from '@/features/panels/views/AiKgLayersSectionControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { PANEL_TYPOGRAPHY_DEFAULTS } from 'grph-shared/ui/panelTypography'
interface AiKgLayersSectionProps {
  schema: GraphSchema
  setSchema: (schema: GraphSchema) => void
  setThreeConfig: (config: Partial<GraphSchema['three']>) => void
  setCharge: (charge: number) => void
  setCollisionByType: (type: string, radius: number) => void
  traversalDelayMs: number
  setTraversalDelayMs: (ms: number) => void
}

export default function AiKgLayersSection({
  schema,
  setSchema,
  setThreeConfig,
  setCharge,
  setCollisionByType,
  traversalDelayMs,
  setTraversalDelayMs,
}: AiKgLayersSectionProps) {
  const uiPanelKeyValueInputClass = useGraphStore(
    s =>
      s.uiPanelKeyValueInputClass ||
      PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass,
  )
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-xs',
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )

  return (
    <section
      className={`mt-2 rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} px-2 py-1`}
      data-kg-anchor={UI_ANCHORS.aiKgLayers}
    >
      <section
        className={[
          uiPanelKeyValueTextSizeClass,
          uiPanelTextFontClass,
          `mb-1 font-semibold uppercase tracking-normal ${UI_THEME_TOKENS.text.tertiary}`,
        ].join(' ')}
      >
        {UI_LABELS.aiKgLayers}
      </section>
      <AiKgLayersControls
        schema={schema}
        setSchema={setSchema}
        setThreeConfig={setThreeConfig}
        setCharge={setCharge}
        setCollisionByType={setCollisionByType}
        traversalDelayMs={traversalDelayMs}
        setTraversalDelayMs={setTraversalDelayMs}
        uiPanelKeyValueInputClass={uiPanelKeyValueInputClass}
      />
    </section>
  )
}
