import React from 'react'
import {
  XrEnvironmentGeoButton,
} from '@/features/command-menu/XrEnvironmentGeoButton'
import {
  diagnoseWorkspaceRunReadyDemoActivation,
  FLIGHT_SIM_RUN_READY_DEMO_ID,
} from '@/features/workspace-fs/workspaceRunReadyDemos'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useGympgrphStore } from '@/lib/gympgrph/api'

type FlightSimEnvironmentGeoButtonProps = Omit<
  React.ComponentProps<typeof XrEnvironmentGeoButton>,
  'onAfterRoute'
>

export function isSourceAuthoredFlightSimGeoOverlayDocument(
  documentName: string,
  documentText: string,
): boolean {
  const diagnostic = diagnoseWorkspaceRunReadyDemoActivation(
    documentName,
    documentText,
  )
  return diagnostic.ok
    && diagnostic.id === FLIGHT_SIM_RUN_READY_DEMO_ID
    && diagnostic.sourceId === FLIGHT_SIM_RUN_READY_DEMO_ID
}

function failureMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const message = String(error || '').trim()
  return message || 'Flight Sim remained inactive.'
}

export function selectFlightSimGeoEnvironment(
  stageId: string,
  sourceAuthoredFlight: boolean,
  selectEnvironment: FlightSimEnvironmentGeoButtonProps['onSelect'],
  selectLocalGeo: () => void,
): ReturnType<FlightSimEnvironmentGeoButtonProps['onSelect']> {
  const result = selectEnvironment(stageId)
  if (result.ok && sourceAuthoredFlight) selectLocalGeo()
  return result
}

export function FlightSimEnvironmentGeoButton(
  props: FlightSimEnvironmentGeoButtonProps,
) {
  const markdownDocumentName = useGraphStore(state => state.markdownDocumentName)
  const markdownDocumentText = useGraphStore(state => state.markdownDocumentText)
  const pushUiToast = useGraphStore(state => state.pushUiToast)
  const sourceAuthoredFlight = React.useMemo(
    () => isSourceAuthoredFlightSimGeoOverlayDocument(
      markdownDocumentName,
      markdownDocumentText,
    ),
    [markdownDocumentName, markdownDocumentText],
  )
  const openFlightOverlay = React.useCallback(async () => {
    if (!sourceAuthoredFlight) return
    try {
      const [{ settleWorkspaceSourceTextWrites }, { openFlightSimSurface }] = await Promise.all([
        import('@/hooks/store/graph-data-slice/workspaceSourceTextWriteQueue'),
        import('./flightSimRuntime'),
      ])
      await settleWorkspaceSourceTextWrites()
      const snapshot = await openFlightSimSurface({ openPanel: false })
      if (!snapshot.active || snapshot.runtimeError) {
        throw new Error(snapshot.runtimeError || 'Flight Sim remained inactive.')
      }
    } catch (error) {
      pushUiToast({
        id: 'flight-sim:geo-overlay:error',
        kind: 'error',
        message: `Flight overlay could not open in Geo: ${failureMessage(error)}`,
      })
    }
  }, [pushUiToast, sourceAuthoredFlight])
  const selectEnvironmentForGeo = React.useCallback(
    (stageId: string) => selectFlightSimGeoEnvironment(
      stageId,
      sourceAuthoredFlight,
      props.onSelect,
      () => useGympgrphStore.getState().setGeospatialViewMode('2d-svg'),
    ),
    [props.onSelect, sourceAuthoredFlight],
  )

  return (
    <XrEnvironmentGeoButton
      {...props}
      onSelect={selectEnvironmentForGeo}
      onAfterRoute={openFlightOverlay}
    />
  )
}
