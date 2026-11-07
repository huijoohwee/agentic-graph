import React from 'react'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphSchema } from '@/lib/graph/schema'
import {
  ResponsiveControlRow,
  ResponsiveNumberRow as NumberRow,
  ResponsiveSelectRow,
} from '@/lib/ui/responsiveControlRows'
import {
  UI_RESPONSIVE_CONTROL_TOGGLE_GROUP_END_CLASSNAME,
  UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { uiToolbarSettingsPanelBodyClassName } from '@/features/toolbar/ui/toolbarStyles'

type RadarForceKey =
  | 'radarSpokeDistancePx'
  | 'radarFlowDistancePx'
  | 'radarFlowCurveBend'
  | 'radarFlowOrbitShift'
  | 'radarFlowArrowLengthPx'
  | 'radarFlowArrowHalfWidthPx'
  | 'radarNodeCharge'
  | 'radarHubCharge'
  | 'radarSpokeStrengthScale'
  | 'radarFlowStrengthScale'
  | 'radialOrbitSpeedDeg'
  | 'radialOrbitSize'
  | 'radialOrbitRingGapPx'
  | 'radialOrbitDepthSpeedScale'

type RadarForceAnyKey =
  | RadarForceKey
  | 'radialOrbitEnabled'
  | 'radialOrbitMode'

const readForceNum = (schema: GraphSchema, key: RadarForceKey, fallback: number): number => {
  const raw = (schema.layout?.forces as Record<string, unknown> | undefined)?.[key]
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : null
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

const readForceBool = (schema: GraphSchema, key: 'radialOrbitEnabled', fallback: boolean): boolean => {
  const raw = (schema.layout?.forces as Record<string, unknown> | undefined)?.[key]
  if (typeof raw === 'boolean') return raw
  return fallback
}

const readForceMode = (schema: GraphSchema, key: 'radialOrbitMode', fallback: 'flat' | 'solar' | 'atomic'): 'flat' | 'solar' | 'atomic' => {
  const raw = (schema.layout?.forces as Record<string, unknown> | undefined)?.[key]
  const v = typeof raw === 'string' ? raw : ''
  return v === 'solar' || v === 'atomic' ? v : fallback
}

export function RadarGalaxyRendererSettings() {
  const uiPanelTextFontClass = useGraphStore(s => s.uiPanelTextFontClass || '')
  const schema = useGraphStore(s => s.schema)
  const setSchema = useGraphStore(s => s.setSchema)

  const setForce = React.useCallback((key: RadarForceKey, value: number) => {
    const current = useGraphStore.getState().schema as GraphSchema
    const layout = current.layout || {}
    const forces = layout.forces || {}
    setSchema({
      ...current,
      layout: {
        ...layout,
        forces: {
          ...forces,
          [key]: value,
        },
      },
    })
  }, [setSchema])

  const setForceAny = React.useCallback((key: RadarForceAnyKey, value: number | boolean | string) => {
    const current = useGraphStore.getState().schema as GraphSchema
    const layout = current.layout || {}
    const forces = layout.forces || {}
    setSchema({
      ...current,
      layout: {
        ...layout,
        forces: {
          ...forces,
          [key]: value,
        },
      },
    })
  }, [setSchema])

  return (
    <CollapsibleSection title="Radar Galaxy" defaultCollapsed={false} stickyHeader={false} headerClassName={`px-2 ${uiPanelTextFontClass}`}>
      <section className={uiToolbarSettingsPanelBodyClassName}>
        <section className={`text-xs ${UI_THEME_TOKENS.text.secondary} leading-snug`}>
          Controls hub-spoke force distances, curved flow arrows, and repulsion for JSON-imported radar maps.
        </section>
        <ResponsiveControlRow label="Orbit animate" valueClassName={UI_RESPONSIVE_CONTROL_TOGGLE_GROUP_END_CLASSNAME}>
          <input
            type="checkbox"
            className={UI_RESPONSIVE_SELECTION_CONTROL_CLASSNAME}
            checked={readForceBool(schema, 'radialOrbitEnabled', false)}
            onChange={e => setForceAny('radialOrbitEnabled', e.target.checked)}
          />
        </ResponsiveControlRow>
        <ResponsiveSelectRow
          label="Orbit mode"
          value={readForceMode(schema, 'radialOrbitMode', 'flat')}
          onChange={next => setForceAny('radialOrbitMode', next === 'solar' || next === 'atomic' ? next : 'flat')}
        >
          <option value="flat">Flat</option>
          <option value="solar">Solar</option>
          <option value="atomic">Atomic</option>
        </ResponsiveSelectRow>
        <NumberRow
          label="Orbit speed"
          value={readForceNum(schema, 'radialOrbitSpeedDeg', 18)}
          min={0}
          max={120}
          step={0.5}
          onChange={v => setForce('radialOrbitSpeedDeg', v)}
        />
        <NumberRow
          label="Orbit size"
          value={readForceNum(schema, 'radialOrbitSize', 2.95)}
          min={1.2}
          max={8}
          step={0.01}
          onChange={v => setForce('radialOrbitSize', v)}
        />
        <NumberRow
          label="Ring gap"
          value={readForceNum(schema, 'radialOrbitRingGapPx', 58)}
          min={12}
          max={360}
          step={1}
          onChange={v => setForce('radialOrbitRingGapPx', v)}
        />
        <NumberRow
          label="Depth speed"
          value={readForceNum(schema, 'radialOrbitDepthSpeedScale', 0.12)}
          min={0}
          max={1.2}
          step={0.01}
          onChange={v => setForce('radialOrbitDepthSpeedScale', v)}
        />
        <NumberRow
          label="Spoke distance"
          value={readForceNum(schema, 'radarSpokeDistancePx', 150)}
          min={40}
          max={1400}
          step={1}
          onChange={v => setForce('radarSpokeDistancePx', v)}
        />
        <NumberRow
          label="Flow distance"
          value={readForceNum(schema, 'radarFlowDistancePx', 360)}
          min={60}
          max={2400}
          step={1}
          onChange={v => setForce('radarFlowDistancePx', v)}
        />
        <NumberRow
          label="Curve bend"
          value={readForceNum(schema, 'radarFlowCurveBend', 0.18)}
          min={-0.8}
          max={0.8}
          step={0.01}
          onChange={v => setForce('radarFlowCurveBend', v)}
        />
        <NumberRow
          label="Orbit shift"
          value={readForceNum(schema, 'radarFlowOrbitShift', 0.06)}
          min={0}
          max={0.45}
          step={0.01}
          onChange={v => setForce('radarFlowOrbitShift', v)}
        />
        <NumberRow
          label="Arrow length"
          value={readForceNum(schema, 'radarFlowArrowLengthPx', 12)}
          min={4}
          max={30}
          step={0.5}
          onChange={v => setForce('radarFlowArrowLengthPx', v)}
        />
        <NumberRow
          label="Arrow half-width"
          value={readForceNum(schema, 'radarFlowArrowHalfWidthPx', 5.2)}
          min={2}
          max={14}
          step={0.2}
          onChange={v => setForce('radarFlowArrowHalfWidthPx', v)}
        />
        <NumberRow
          label="Spoke strength"
          value={readForceNum(schema, 'radarSpokeStrengthScale', 1)}
          min={0.2}
          max={2.5}
          step={0.01}
          onChange={v => setForce('radarSpokeStrengthScale', v)}
        />
        <NumberRow
          label="Flow strength"
          value={readForceNum(schema, 'radarFlowStrengthScale', 1)}
          min={0.2}
          max={2.5}
          step={0.01}
          onChange={v => setForce('radarFlowStrengthScale', v)}
        />
        <NumberRow
          label="Node repulsion"
          value={readForceNum(schema, 'radarNodeCharge', -110)}
          min={-600}
          max={-5}
          step={1}
          onChange={v => setForce('radarNodeCharge', v)}
        />
        <NumberRow
          label="Hub repulsion"
          value={readForceNum(schema, 'radarHubCharge', -16)}
          min={-120}
          max={8}
          step={1}
          onChange={v => setForce('radarHubCharge', v)}
        />
      </section>
    </CollapsibleSection>
  )
}
