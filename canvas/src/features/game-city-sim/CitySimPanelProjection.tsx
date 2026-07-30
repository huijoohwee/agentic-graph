import React from 'react'
import {
  Aperture,
  Building2,
  Film,
  Gamepad2,
  Image,
  Plane,
  Play,
  Square,
} from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  openCitySimSurface,
  readCitySimSnapshot,
  startCitySim,
  stopCitySim,
  subscribeCitySimSnapshot,
} from './citySimRuntime'
import { describeCityInputSnapshot } from './citySimInputRuntime'

export type CitySimProjectionSurface =
  | 'media'
  | 'animation'
  | 'motionControl'
  | 'gameMode'
  | 'flightSim'
  | 'camera'

const SURFACE_COPY: Readonly<Record<CitySimProjectionSurface, {
  title: string
  ownership: string
}>> = Object.freeze({
  media: {
    title: 'City appearance',
    ownership: 'Zone colors are a read-only projection of parcel state.',
  },
  animation: {
    title: 'City tick playback',
    ownership: 'Animation follows the fixed simulation tick; it does not own state.',
  },
  motionControl: {
    title: 'City parcel input',
    ownership: 'Pointer, keyboard, and touch input share one copied FIFO queue.',
  },
  gameMode: {
    title: 'City gameplay overlay',
    ownership: 'City claims the shared Geo+XR surface while MapLibre owns visuals and gestures.',
  },
  flightSim: {
    title: 'City aerial inspection',
    ownership: 'Flight can inspect the grid without becoming its simulation owner.',
  },
  camera: {
    title: 'City framing',
    ownership: 'Native MapLibre owns City framing and responsive viewport changes.',
  },
})

function ProjectionIcon({
  surface,
}: {
  surface: CitySimProjectionSurface
}) {
  const className = 'h-3.5 w-3.5'
  if (surface === 'media') return <Image className={className} aria-hidden="true" />
  if (surface === 'animation') return <Film className={className} aria-hidden="true" />
  if (surface === 'motionControl') return <Gamepad2 className={className} aria-hidden="true" />
  if (surface === 'flightSim') return <Plane className={className} aria-hidden="true" />
  if (surface === 'camera') return <Aperture className={className} aria-hidden="true" />
  return <Building2 className={className} aria-hidden="true" />
}

function projectionStatus(
  surface: CitySimProjectionSurface,
  snapshot: ReturnType<typeof readCitySimSnapshot>,
): string {
  const city = snapshot.city
  if (surface === 'media') {
    const zonedCount = city.parcels.filter(parcel => parcel.zone !== 'unzoned').length
    return `${zonedCount}/${city.parcels.length} parcels use the local zone palette.`
  }
  if (surface === 'animation') {
    return `Tick ${city.tick} · ${snapshot.phase}.`
  }
  if (surface === 'motionControl') {
    return snapshot.lastInput
      ? describeCityInputSnapshot(snapshot.lastInput)
      : 'No normalized pointer, keyboard, or touch input has been consumed.'
  }
  if (surface === 'gameMode') {
    return snapshot.active
      ? 'The city overlay currently owns the interactive gameplay surface.'
      : 'The shared gameplay surface is ready for a city handoff.'
  }
  if (surface === 'flightSim') {
    return snapshot.active
      ? 'The active city grid is available as a read-only aerial context.'
      : 'Open the city before handing its grid to aerial inspection.'
  }
  return snapshot.active
    ? snapshot.selectedParcelId
      ? `${snapshot.selectedParcelId} is selected while native MapLibre retains framing.`
      : 'Native MapLibre framing is active for the City Geo+XR surface.'
    : 'Open City to use native MapLibre framing without replacing Camera presets.'
}

export function CitySimPanelProjection({
  surface,
}: {
  surface: CitySimProjectionSurface
}) {
  const snapshot = React.useSyncExternalStore(
    subscribeCitySimSnapshot,
    readCitySimSnapshot,
    readCitySimSnapshot,
  )
  const [pending, setPending] = React.useState(false)
  const [localError, setLocalError] = React.useState<string | null>(null)
  const copy = SURFACE_COPY[surface]

  const run = React.useCallback(async (action: () => unknown | Promise<unknown>) => {
    setPending(true)
    setLocalError(null)
    try {
      await action()
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }, [])

  const animationAction = surface === 'animation' && snapshot.active
  const cameraAction = surface === 'camera'
  const actionLabel = cameraAction
    ? 'Open City map'
    : animationAction
    ? snapshot.phase === 'running' ? 'Stop ticks' : 'Start ticks'
    : snapshot.active ? 'Open city panel' : 'Open city'
  const action = cameraAction
    ? () => openCitySimSurface({ openPanel: false })
    : animationAction
    ? snapshot.phase === 'running' ? stopCitySim : startCitySim
    : openCitySimSurface
  const ActionIcon = cameraAction
    ? Aperture
    : animationAction
    ? snapshot.phase === 'running' ? Square : Play
    : Building2
  const error = localError || snapshot.error

  return (
    <aside
      className={cn(
        'mx-1 mb-1 grid shrink-0 gap-1 rounded border p-2',
        UI_THEME_TOKENS.panel.border,
        UI_THEME_TOKENS.panel.bg,
      )}
      aria-label={`${copy.title} city simulation projection`}
      data-kg-city-sim-projection={surface}
      data-kg-city-sim-projection-active={snapshot.active ? '1' : '0'}
    >
      <header className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <b className="flex items-center gap-1 text-[10px]">
            <ProjectionIcon surface={surface} />
            {copy.title}
          </b>
          <span className={cn('block text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
            Local-only · $0 default path
          </span>
        </span>
        <button
          type="button"
          className="App-toolbar__btn shrink-0"
          disabled={pending || (!snapshot.webglSupported && !snapshot.active)}
          onClick={() => void run(action)}
          data-kg-city-sim-projection-action={surface}
        >
          <ActionIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {actionLabel}
        </button>
      </header>
      <p
        className={cn('text-[9px]', UI_THEME_TOKENS.text.secondary)}
        data-kg-city-sim-input-source={
          surface === 'motionControl' ? snapshot.lastInput?.source : undefined
        }
        data-kg-city-sim-input-sequence={
          surface === 'motionControl' ? snapshot.lastInput?.sequence : undefined
        }
      >
        {projectionStatus(surface, snapshot)}
      </p>
      <p className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
        {copy.ownership}
      </p>
      {error ? (
        <p
          className={cn('break-words text-[9px]', UI_THEME_TOKENS.status.error)}
          role="alert"
          data-kg-city-sim-projection-error="1"
        >
          {error}
        </p>
      ) : null}
    </aside>
  )
}

export default CitySimPanelProjection
