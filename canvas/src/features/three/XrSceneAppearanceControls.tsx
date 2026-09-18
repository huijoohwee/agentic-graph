import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { PanelSelect, PanelTextInput } from '@/lib/ui/panelFormControls'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import { configureXrSceneAppearance } from './xrSceneAppearanceAuthoring'
import { XR_SCENE_APPEARANCE_PRESETS, xrSceneAppearancePresetId, type XrSceneAppearance } from './xrSceneAppearance'

const COLORS = [['skyColor', 'Sky'], ['fogColor', 'Horizon'], ['groundColor', 'Ground'], ['waterColor', 'Water'], ['lightColor', 'Sunlight']] as const
const NUMBERS = [['lightIntensity', 'Sun strength', 0.2, 4, 0.1], ['sunAzimuthDegrees', 'Sun direction', -180, 180, 5], ['fogDistanceMeters', 'Haze distance (m)', 40, 180, 5]] as const

/** Both panel surfaces project the same scene plan; no local appearance store or timer. */
export function XrSceneAppearanceControls({ compact = false, disabled = false }: { compact?: boolean; disabled?: boolean }) {
  const runtime = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
  const appearance = runtime.plan.appearance
  const commit = (patch: Partial<XrSceneAppearance>) => {
    if (!configureXrSceneAppearance(patch)) useGraphStore.getState().pushUiToast({ id: 'xr:appearance:error', kind: 'error', message: 'Appearance could not be saved to the active scene document.' })
  }
  const presets = <PanelSelect aria-label="Scene appearance" value={xrSceneAppearancePresetId(appearance)} disabled={disabled} className={compact ? 'w-24 min-w-0 text-[10px]' : 'min-h-11 w-full'} onChange={event => {
    const preset = XR_SCENE_APPEARANCE_PRESETS.find(item => item.id === event.target.value)
    if (preset) commit(preset)
  }}>
    <option value="custom" disabled>Custom look</option>
    {XR_SCENE_APPEARANCE_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
  </PanelSelect>
  if (compact) return presets
  return <details className="rounded border border-slate-300/50 p-2 dark:border-slate-700" data-kg-xr-scene-appearance="1">
    <summary className="min-h-11 cursor-pointer text-xs font-semibold">Scene appearance</summary>
    <fieldset disabled={disabled} className="grid min-w-0 gap-3 border-0 p-0">
      <label className="grid gap-1 text-xs">Look{presets}</label>
      <section className="grid grid-cols-2 gap-2" aria-label="Scene palette">
        {COLORS.map(([key, label]) => <label key={key} className="grid gap-1 text-xs">{label}<PanelTextInput type="color" className="min-h-11 w-full" aria-label={`Scene ${label.toLowerCase()} color`} value={appearance[key]} onChange={event => commit({ [key]: event.target.value })} /></label>)}
      </section>
      {NUMBERS.map(([key, label, min, max, step]) => <label key={key} className="grid grid-cols-[1fr_5rem] items-center gap-2 text-xs">{label}<PanelTextInput key={appearance[key]} type="number" min={min} max={max} step={step} defaultValue={appearance[key]} aria-label={label} className="min-h-11" onBlur={event => {
        const value = event.currentTarget.valueAsNumber
        if (Number.isFinite(value)) commit({ [key]: value })
        event.currentTarget.value = String(readXrMotionReferenceRuntime().plan.appearance[key])
      }} /></label>)}
      <label className="grid gap-1 text-xs">Scenery detail<PanelSelect aria-label="Scenery detail" className="min-h-11" value={appearance.detail} onChange={event => commit({ detail: event.target.value as XrSceneAppearance['detail'] })}><option value="standard">Standard</option><option value="low">Low · fewer decorative meshes</option></PanelSelect></label>
      <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={appearance.shadows} onChange={event => commit({ shadows: event.target.checked })} />Cast shadows</label>
      <p className="text-[11px] text-slate-500">Saved in this scene’s source document. Use Workspace sync in Settings to share it with your signed-in devices.</p>
    </fieldset>
  </details>
}
