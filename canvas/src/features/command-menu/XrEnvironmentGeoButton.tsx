import React from 'react'
import { MapPinned } from 'lucide-react'
import { emitFloatingPanelOpen } from '@/features/canvas/utils'

type EnvironmentSelectionResult = Readonly<{ ok: boolean }>

export function requestXrEnvironmentGeoHandoff(
  stageId: string,
  selectEnvironment: (requestedStageId: string) => EnvironmentSelectionResult,
  prepareBeforeRoute?: () => void | Promise<void>,
): Promise<boolean> {
  return Promise.resolve().then(async () => {
    const result = selectEnvironment(stageId)
    if (!result.ok) return false
    await prepareBeforeRoute?.()
    emitFloatingPanelOpen({ tab: 'geo', open: true })
    return true
  }).catch(() => false)
}

export function XrEnvironmentGeoButton({
  disabled,
  onSelect,
  prepareBeforeRoute,
  stageId,
  stageLabel,
}: {
  disabled: boolean
  onSelect: (stageId: string) => EnvironmentSelectionResult
  prepareBeforeRoute?: () => void | Promise<void>
  stageId: string
  stageLabel: string
}) {
  const inFlightRef = React.useRef(false)
  const [pending, setPending] = React.useState(false)
  const label = `Select ${stageLabel} and open Geo`
  return (
    <button
      type="button"
      className="App-toolbar__btn inline-flex shrink-0 items-center gap-1"
      aria-busy={pending}
      disabled={disabled || pending}
      title={label}
      aria-label={label}
      onClick={() => {
        if (inFlightRef.current) return
        inFlightRef.current = true
        setPending(true)
        void requestXrEnvironmentGeoHandoff(
          stageId,
          onSelect,
          prepareBeforeRoute,
        ).finally(() => {
          inFlightRef.current = false
          setPending(false)
        })
      }}
      data-kg-media-xr-environment-geo={stageId}
    >
      <MapPinned className="size-3" aria-hidden="true" />
      <span>Geo</span>
    </button>
  )
}
