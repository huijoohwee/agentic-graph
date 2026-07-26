import React from 'react'
import { MapPinned } from 'lucide-react'
import { emitFloatingPanelOpen } from '@/features/canvas/utils'

type EnvironmentSelectionResult = Readonly<{ ok: boolean }>

export function requestXrEnvironmentGeoHandoff(
  stageId: string,
  selectEnvironment: (requestedStageId: string) => EnvironmentSelectionResult,
): boolean {
  const result = selectEnvironment(stageId)
  if (!result.ok) return false
  emitFloatingPanelOpen({ tab: 'geo', open: true })
  return true
}

export function XrEnvironmentGeoButton({
  disabled,
  onSelect,
  stageId,
  stageLabel,
}: {
  disabled: boolean
  onSelect: (stageId: string) => EnvironmentSelectionResult
  stageId: string
  stageLabel: string
}) {
  const label = `Select ${stageLabel} and open Geo`
  return (
    <button
      type="button"
      className="App-toolbar__btn inline-flex shrink-0 items-center gap-1"
      disabled={disabled}
      title={label}
      aria-label={label}
      onClick={() => requestXrEnvironmentGeoHandoff(stageId, onSelect)}
      data-kg-media-xr-environment-geo={stageId}
    >
      <MapPinned className="size-3" aria-hidden="true" />
      <span>Geo</span>
    </button>
  )
}
