import React from 'react'
import {
  Aperture,
  Camera,
  Clapperboard,
  Compass,
  Crop,
  Eye,
  Film,
  Focus,
  Gamepad2,
  Image,
  Keyboard,
  Layers3,
  MapPinned,
  Maximize2,
  MousePointer2,
  PanelLeft,
  Play,
  RotateCcw,
  Sparkles,
  Video,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import type { ImmersiveMediaSourceKind } from './immersiveMediaModel'
import { ImmersiveMediaMarkerProjections } from './ImmersiveMediaMarkerProjections'
import {
  captureImmersiveMediaScreenshot,
  closeImmersiveMedia,
  configureImmersiveMedia,
  focusImmersiveMediaMarker,
  openImmersiveMedia,
  playImmersiveMediaIntro,
  readImmersiveMediaSnapshot,
  resetImmersiveMediaView,
  setImmersiveMediaOverlay,
  setImmersiveMediaPolygonPattern,
  setImmersiveMediaSource,
  subscribeImmersiveMediaSnapshot,
  toggleImmersiveMediaLayer,
  transitionImmersiveMedia,
  zoomImmersiveMedia,
} from './immersiveMediaRuntime'

export type ImmersiveMediaProjectionSurface =
  | 'media'
  | 'animation'
  | 'motionControl'
  | 'gameMode'
  | 'flightSim'
  | 'camera'

const SURFACE_COPY: Readonly<Record<ImmersiveMediaProjectionSurface, {
  title: string
  subtitle: string
}>> = Object.freeze({
  media: { title: 'Immersive media', subtitle: 'Source, crop, layers, markers' },
  animation: { title: 'Immersive animation', subtitle: 'Intro and bounded transitions' },
  motionControl: { title: 'Immersive input', subtitle: 'Pointer, keyboard, double click' },
  gameMode: { title: 'Immersive game context', subtitle: 'Shared markers and partial overlay' },
  flightSim: { title: 'Immersive flight context', subtitle: 'Compass, map, and plan projections' },
  camera: { title: 'Immersive Camera', subtitle: 'Shared view, zoom, and lens strength' },
})

function SurfaceIcon({ surface }: { surface: ImmersiveMediaProjectionSurface }) {
  const className = 'h-3.5 w-3.5'
  if (surface === 'media') return <Image className={className} aria-hidden="true" />
  if (surface === 'animation') return <Film className={className} aria-hidden="true" />
  if (surface === 'motionControl') return <Gamepad2 className={className} aria-hidden="true" />
  if (surface === 'gameMode') return <Gamepad2 className={className} aria-hidden="true" />
  if (surface === 'flightSim') return <Compass className={className} aria-hidden="true" />
  return <Aperture className={className} aria-hidden="true" />
}

function ToggleButton({
  active,
  children,
  onClick,
  title,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
  title: string
}) {
  return (
    <button
      type="button"
      className={cn('App-toolbar__btn', active ? UI_THEME_TOKENS.status.info : '')}
      aria-pressed={active}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function MediaSourceControls() {
  const snapshot = readImmersiveMediaSnapshot()
  const [kind, setKind] = React.useState<ImmersiveMediaSourceKind>(snapshot.source.kind)
  const [url, setUrl] = React.useState(snapshot.source.url)
  React.useEffect(() => {
    setKind(snapshot.source.kind)
    setUrl(snapshot.source.url)
  }, [snapshot.source.kind, snapshot.source.url])
  return (
    <form
      className="grid grid-cols-[80px_1fr_auto] gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        setImmersiveMediaSource({ kind, url })
      }}
      aria-label="Immersive media source"
    >
      <select
        className="App-toolbar__select min-w-0 text-[10px]"
        value={kind}
        onChange={event => setKind(event.target.value as ImmersiveMediaSourceKind)}
        aria-label="Source kind"
      >
        <option value="procedural">Zero config</option>
        <option value="image">Image</option>
        <option value="video">Video</option>
      </select>
      <input
        className="App-toolbar__input min-w-0 text-[10px]"
        value={url}
        disabled={kind === 'procedural'}
        onChange={event => setUrl(event.target.value)}
        placeholder={kind === 'procedural' ? 'Local procedural source' : 'Approved media URL'}
        aria-label="Media URL"
      />
      <button type="submit" className="App-toolbar__btn">
        <Video className="h-3.5 w-3.5" aria-hidden="true" /> Apply
      </button>
    </form>
  )
}

function SurfaceControls({ surface }: { surface: ImmersiveMediaProjectionSurface }) {
  const snapshot = readImmersiveMediaSnapshot()
  if (surface === 'media') {
    const cropped = snapshot.crop.horizontalSpanDegrees < 360
    const places = snapshot.layers.find(layer => layer.id === 'places')
    const media = snapshot.layers.find(layer => layer.id === 'media')
    return (
      <>
        <MediaSourceControls />
        <section className="flex flex-wrap gap-1" aria-label="Media presentation controls">
          <ToggleButton active={cropped} title="Toggle cropped panorama" onClick={() => configureImmersiveMedia({ cropped: !cropped })}>
            <Crop className="h-3.5 w-3.5" aria-hidden="true" /> Crop
          </ToggleButton>
          <ToggleButton active={places?.visible !== false} title="Toggle place markers" onClick={() => toggleImmersiveMediaLayer('places')}>
            <MapPinned className="h-3.5 w-3.5" aria-hidden="true" /> Places
          </ToggleButton>
          <ToggleButton active={media?.visible !== false} title="Toggle media markers" onClick={() => toggleImmersiveMediaLayer('media')}>
            <Layers3 className="h-3.5 w-3.5" aria-hidden="true" /> Media
          </ToggleButton>
        </section>
      </>
    )
  }
  if (surface === 'animation') {
    return (
      <section className="flex flex-wrap gap-1" aria-label="Immersive animation controls">
        <button type="button" className="App-toolbar__btn" onClick={playImmersiveMediaIntro}>
          <Play className="h-3.5 w-3.5" aria-hidden="true" /> Intro
        </button>
        <button type="button" className="App-toolbar__btn" onClick={transitionImmersiveMedia}>
          <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" /> Transition
        </button>
        <span className={cn('self-center text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
          {snapshot.transitionDurationMs} ms · revision {snapshot.transitionRevision}
        </span>
      </section>
    )
  }
  if (surface === 'motionControl') {
    return (
      <section className="flex flex-wrap gap-1" aria-label="Immersive input controls">
        <ToggleButton
          active={snapshot.navigation.keyboardActions}
          title="Toggle keyboard actions"
          onClick={() => configureImmersiveMedia({ keyboardActions: !snapshot.navigation.keyboardActions })}
        >
          <Keyboard className="h-3.5 w-3.5" aria-hidden="true" /> Keys
        </ToggleButton>
        <ToggleButton
          active={snapshot.navigation.doubleClickZoom}
          title="Toggle double-click zoom"
          onClick={() => configureImmersiveMedia({ doubleClickZoom: !snapshot.navigation.doubleClickZoom })}
        >
          <MousePointer2 className="h-3.5 w-3.5" aria-hidden="true" /> Double click
        </ToggleButton>
        <span className={cn('self-center text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
          Drag to look · WASD/arrows · +/- · 0 · I
        </span>
      </section>
    )
  }
  if (surface === 'camera') {
    return (
      <section className="flex flex-wrap gap-1" aria-label="Immersive Camera controls">
        <button type="button" className="App-toolbar__btn" onClick={() => zoomImmersiveMedia('in')}><ZoomIn className="h-3.5 w-3.5" aria-hidden="true" /> Zoom</button>
        <button type="button" className="App-toolbar__btn" onClick={() => zoomImmersiveMedia('out')}><ZoomOut className="h-3.5 w-3.5" aria-hidden="true" /> Zoom</button>
        <button type="button" className="App-toolbar__btn" onClick={resetImmersiveMediaView}><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset</button>
        <ToggleButton
          active={snapshot.view.lensStrength > 0}
          title="Toggle lens effect"
          onClick={() => configureImmersiveMedia({ lensStrength: snapshot.view.lensStrength > 0 ? 0 : 0.72 })}
        >
          <Focus className="h-3.5 w-3.5" aria-hidden="true" /> Fisheye
        </ToggleButton>
        <span className={cn('self-center text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
          {Math.round(snapshot.view.fieldOfViewDegrees)}° · yaw {Math.round(snapshot.view.yawDegrees)}°
        </span>
      </section>
    )
  }
  return (
    <>
      <section className="flex flex-wrap gap-1" aria-label="Immersive context controls">
        <ToggleButton
          active={snapshot.overlay.enabled}
          title="Toggle partial overlay"
          onClick={() => setImmersiveMediaOverlay(!snapshot.overlay.enabled)}
        >
          <PanelLeft className="h-3.5 w-3.5" aria-hidden="true" /> Overlay
        </ToggleButton>
        <ToggleButton
          active={snapshot.polygonPattern}
          title="Toggle polygon marker pattern"
          onClick={() => setImmersiveMediaPolygonPattern(!snapshot.polygonPattern)}
        >
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" /> Polygon
        </ToggleButton>
        <ToggleButton
          active={snapshot.selectedMarkerId === 'marker-custom-element'}
          title="Focus the Info element in the shared Camera"
          onClick={() => focusImmersiveMediaMarker('marker-custom-element', 'map')}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {snapshot.navigation.customElementLabel}
        </ToggleButton>
      </section>
      <ImmersiveMediaMarkerProjections snapshot={snapshot} />
    </>
  )
}

export function ImmersiveMediaPanelProjection({
  surface,
}: {
  surface: ImmersiveMediaProjectionSurface
}) {
  const snapshot = React.useSyncExternalStore(
    subscribeImmersiveMediaSnapshot,
    readImmersiveMediaSnapshot,
    readImmersiveMediaSnapshot,
  )
  const [pending, setPending] = React.useState(false)
  const copy = SURFACE_COPY[surface]
  const transitioning = snapshot.phase === 'transitioning'
  const introPending = transitioning && snapshot.lastAction === 'intro'
  const transitionPending = transitioning && snapshot.lastAction === 'transition'
  const capture = async () => {
    setPending(true)
    try {
      await captureImmersiveMediaScreenshot(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <aside
      className={cn(
        'mx-1 mb-1 grid shrink-0 gap-1.5 rounded border p-2',
        UI_THEME_TOKENS.panel.border,
        UI_THEME_TOKENS.panel.bg,
      )}
      aria-label={`${copy.title} projection`}
      data-kg-immersive-media-projection={surface}
      data-kg-immersive-media-active={snapshot.active ? '1' : '0'}
      data-kg-immersive-media-phase={snapshot.phase}
      data-kg-immersive-media-last-action={snapshot.lastAction}
      data-kg-immersive-media-field-of-view={Math.round(snapshot.view.fieldOfViewDegrees)}
      data-kg-immersive-media-overlay={snapshot.overlay.enabled ? '1' : '0'}
      data-kg-immersive-media-polygon={snapshot.polygonPattern ? '1' : '0'}
      data-kg-immersive-media-selected-marker={snapshot.selectedMarkerId || ''}
      data-kg-immersive-media-mcp="agenticgraph.control_local_immersive_media"
    >
      <header className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <b className="flex items-center gap-1 text-[10px]"><SurfaceIcon surface={surface} />{copy.title}</b>
          <span className={cn('block truncate text-[9px]', UI_THEME_TOKENS.text.tertiary)}>{copy.subtitle} · local $0 default</span>
        </span>
        <span className="flex shrink-0 gap-1">
          <button
            type="button"
            className="App-toolbar__btn"
            onClick={snapshot.active ? closeImmersiveMedia : openImmersiveMedia}
            data-kg-immersive-media-open={snapshot.active ? '0' : '1'}
          >
            {snapshot.active ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />}
            {snapshot.active ? 'Close' : 'Open'}
          </button>
          <button type="button" className="App-toolbar__btn" disabled={!snapshot.active || pending} onClick={() => void capture()}>
            <Camera className="h-3.5 w-3.5" aria-hidden="true" /> Shot
          </button>
        </span>
      </header>
      <p className={cn('text-[9px]', UI_THEME_TOKENS.text.secondary)}>{snapshot.description}</p>
      <nav
        className="flex flex-wrap gap-1"
        aria-label="Custom immersive navigation"
        aria-busy={transitioning}
        data-kg-immersive-media-navbar="custom"
      >
        <button
          type="button"
          className={cn('App-toolbar__btn', introPending ? UI_THEME_TOKENS.status.info : '')}
          aria-label="Play immersive intro"
          title="Play immersive intro"
          disabled={transitioning}
          onClick={playImmersiveMediaIntro}
        >
          <Play className="h-3 w-3" aria-hidden="true" /> Intro
        </button>
        <button
          type="button"
          className="App-toolbar__btn"
          aria-label="Reset immersive Camera view"
          title="Reset immersive Camera view"
          disabled={transitioning}
          onClick={resetImmersiveMediaView}
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" /> Reset
        </button>
        <button
          type="button"
          className="App-toolbar__btn"
          aria-label="Zoom in immersive Camera"
          title="Zoom in immersive Camera"
          disabled={transitioning}
          onClick={() => zoomImmersiveMedia('in')}
        >
          <ZoomIn className="h-3 w-3" aria-hidden="true" /> Zoom +
        </button>
        <button
          type="button"
          className="App-toolbar__btn"
          aria-label="Zoom out immersive Camera"
          title="Zoom out immersive Camera"
          disabled={transitioning}
          onClick={() => zoomImmersiveMedia('out')}
        >
          <ZoomOut className="h-3 w-3" aria-hidden="true" /> Zoom −
        </button>
        <button
          type="button"
          className={cn('App-toolbar__btn', transitionPending ? UI_THEME_TOKENS.status.info : '')}
          aria-label="Play panorama transition"
          title="Play panorama transition"
          disabled={transitioning}
          onClick={transitionImmersiveMedia}
        >
          <Clapperboard className="h-3 w-3" aria-hidden="true" /> Transition
        </button>
      </nav>
      <SurfaceControls surface={surface} />
      <p
        className={cn(
          'min-h-4 rounded px-1 py-0.5 text-[9px]',
          snapshot.error ? UI_THEME_TOKENS.status.error : UI_THEME_TOKENS.text.secondary,
        )}
        role={snapshot.error ? 'alert' : 'status'}
        aria-live={snapshot.error ? 'assertive' : 'polite'}
        data-kg-immersive-media-status={snapshot.lastAction}
      >
        {snapshot.message}
      </p>
    </aside>
  )
}

export default ImmersiveMediaPanelProjection
