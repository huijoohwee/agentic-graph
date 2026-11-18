import type { RendererSectionDisclosure } from '@/features/panels/hooks/useRendererPanelState'
import React from 'react'
import type { GraphSchema } from '@/lib/graph/schema'
import { useGraphStore } from '@/hooks/useGraphStore'
import ThreeViewLinksSection from '@/features/panels/views/ThreeViewLinksSection'
import ThreeViewLayoutSection from '@/lib/panels/views/ThreeViewLayoutSection.impl'
import ThreeViewBackgroundFogSection from '@/features/panels/views/ThreeViewBackgroundFogSection'
import ThreeViewStarfieldSection from '@/features/panels/views/ThreeViewStarfieldSection'
import ThreeViewCameraSection from '@/features/panels/views/ThreeViewCameraSection'
import ThreeViewSelectionSection from '@/features/panels/views/ThreeViewSelectionSection'
import ThreeViewGlobeEffectsSection from '@/features/panels/views/ThreeViewGlobeEffectsSection'
import { PANEL_TYPOGRAPHY_DEFAULTS } from 'grph-shared/ui/panelTypography'

interface ThreeViewTuningSectionProps {
  schema: GraphSchema
  setThreeConfig: (config: Partial<GraphSchema['three']>) => void
  disclosure: RendererSectionDisclosure
}

export default function ThreeViewTuningSection({ schema, setThreeConfig, disclosure }: ThreeViewTuningSectionProps) {
  const uiPanelKeyValueInputClass = useGraphStore(
    s =>
      s.uiPanelKeyValueInputClass ||
      PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass,
  )

  return (
    <section>
      <ThreeViewLinksSection
        schema={schema}
        setThreeConfig={setThreeConfig}
        {...disclosure('links')}
      />
      <ThreeViewGlobeEffectsSection
        schema={schema}
        setThreeConfig={setThreeConfig}
        {...disclosure('globeEffects')}
      />
      <ThreeViewLayoutSection
        schema={schema}
        setThreeConfig={setThreeConfig}
        {...disclosure('layout')}
        uiPanelKeyValueInputClass={uiPanelKeyValueInputClass}
      />
      <ThreeViewBackgroundFogSection
        schema={schema}
        setThreeConfig={setThreeConfig}
        {...disclosure('backgroundFog')}
        uiPanelKeyValueInputClass={uiPanelKeyValueInputClass}
      />
      <ThreeViewStarfieldSection
        schema={schema}
        setThreeConfig={setThreeConfig}
        {...disclosure('starfield')}
        uiPanelKeyValueInputClass={uiPanelKeyValueInputClass}
      />
      <ThreeViewCameraSection
        schema={schema}
        setThreeConfig={setThreeConfig}
        {...disclosure('camera')}
      />
      <ThreeViewSelectionSection
        schema={schema}
        setThreeConfig={setThreeConfig}
        {...disclosure('selection')}
      />
    </section>
  )
}
