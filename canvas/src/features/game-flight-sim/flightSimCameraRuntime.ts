export const FLIGHT_SIM_CAMERA_VIEWS = ['chase', 'cockpit', 'survey'] as const

export type FlightSimCameraView = (typeof FLIGHT_SIM_CAMERA_VIEWS)[number]

export type FlightSimCameraViewOption = Readonly<{
  id: FlightSimCameraView
  label: string
  description: string
}>

export const FLIGHT_SIM_CAMERA_VIEW_OPTIONS: readonly FlightSimCameraViewOption[] = Object.freeze([
  Object.freeze({
    id: 'chase',
    label: 'Chase',
    description: 'Balanced trailing view for normal circuit flight.',
  }),
  Object.freeze({
    id: 'cockpit',
    label: 'Cockpit',
    description: 'Forward view from just above the aircraft nose.',
  }),
  Object.freeze({
    id: 'survey',
    label: 'Survey',
    description: 'High trailing view for route and landing awareness.',
  }),
])

export const FLIGHT_SIM_CAMERA_VIEW_DEFAULT: FlightSimCameraView = 'chase'

export type FlightSimCameraSnapshot = Readonly<{
  view: FlightSimCameraView
  revision: number
}>

type Listener = () => void

const listeners = new Set<Listener>()
let snapshot: FlightSimCameraSnapshot = Object.freeze({
  view: FLIGHT_SIM_CAMERA_VIEW_DEFAULT,
  revision: 0,
})

export function isFlightSimCameraView(value: unknown): value is FlightSimCameraView {
  return FLIGHT_SIM_CAMERA_VIEWS.includes(value as FlightSimCameraView)
}

export function readFlightSimCameraSnapshot(): FlightSimCameraSnapshot {
  return snapshot
}

export function subscribeFlightSimCamera(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function selectFlightSimCameraView(view: FlightSimCameraView): FlightSimCameraSnapshot {
  if (!isFlightSimCameraView(view) || snapshot.view === view) return snapshot
  snapshot = Object.freeze({ view, revision: snapshot.revision + 1 })
  for (const listener of [...listeners]) listener()
  return snapshot
}

export function cycleFlightSimCameraView(): FlightSimCameraSnapshot {
  const currentIndex = FLIGHT_SIM_CAMERA_VIEWS.indexOf(snapshot.view)
  const nextIndex = (currentIndex + 1) % FLIGHT_SIM_CAMERA_VIEWS.length
  return selectFlightSimCameraView(FLIGHT_SIM_CAMERA_VIEWS[nextIndex]!)
}

export function resetFlightSimCameraForTests(): FlightSimCameraSnapshot {
  snapshot = Object.freeze({ view: FLIGHT_SIM_CAMERA_VIEW_DEFAULT, revision: 0 })
  for (const listener of [...listeners]) listener()
  return snapshot
}
