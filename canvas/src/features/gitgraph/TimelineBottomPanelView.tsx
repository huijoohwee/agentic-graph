import React from 'react'
import { useSourceGeospatialContext } from '@/features/evidence-analysis/geospatialSource'

const SourceGeospatialTimelinePanel = React.lazy(() => import('@/features/evidence-analysis/SourceGeospatialTimelinePanel').then(module => ({ default: module.SourceGeospatialTimelinePanel })))
import { GanttTimelineTransportPanel } from './GanttTimelineTransportPanel'
import { useMermaidGanttDocument } from './useMermaidGanttDocument'
import { useStoryboardWidgetDiagramSelectionBridge } from './useStoryboardWidgetDiagramSelectionBridge'
import { useGraphStore } from '@/hooks/useGraphStore'
import { XrCameraMotionSection } from '@/features/three/XrCameraMotionSection'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { resolveXrStageObjects } from '@/features/three/xrSceneLibrary'
import { XrSubjectTransformEditor } from '@/features/three/XrSubjectTransformEditor'
import { resolveXrDocumentStageAuthority } from '@/features/three/xrSceneDocumentReadiness'
import { useWarehouseInspectionMode } from '@/features/python-learning/useWarehouseInspectionMode'
import { activateXrSceneSurface } from '@/features/three/xrSceneSurfaceRuntime'
import {
  readCitySimSnapshot,
  startCitySim,
  stopCitySim,
  subscribeCitySimSnapshot,
} from '@/features/game-city-sim/citySimRuntime'
import {
  readGameModeSnapshot,
  startGameMode,
  stopGameMode,
  subscribeGameModeSnapshot,
} from '@/features/game-fps/gameModeRuntime'
import { readGameFpsSnapshot, subscribeGameFpsSnapshot } from '@/features/game-fps/gameFpsRuntime'

const SemanticObjectInspector = React.lazy(() => import('@/features/xr-v2/SemanticSpacePanel').then(module => ({ default: module.SemanticSpacePanel })))
const SequenceTimeline = React.lazy(() => import('@/features/sequence/SequenceTimeline').then(module => ({ default: module.SequenceTimeline })))
const WarehouseTimelinePanel = React.lazy(() => import('@/features/python-learning/WarehouseTimelinePanel').then(module => ({ default: module.WarehouseTimelinePanel })))

function MediaTimelineBottomPanelView({ compact }: { compact: boolean }) {
  const { code: mediaGanttCode, ganttModel, graphData } = useMermaidGanttDocument({ purpose: 'media' })
  const { handleDiagramSelectedRowKeyChange } = useStoryboardWidgetDiagramSelectionBridge({ graphData, diagramModel: ganttModel, kind: 'gantt' })
  return <GanttTimelineTransportPanel code={mediaGanttCode} compact={compact} mode="media" onSelectedRowKeyChange={handleDiagramSelectedRowKeyChange} />
}

function LiveGeoXrSimulationTimeline({ compact }: { compact: boolean }) {
  const city = React.useSyncExternalStore(subscribeCitySimSnapshot, readCitySimSnapshot, readCitySimSnapshot)
  const gameMode = React.useSyncExternalStore(subscribeGameModeSnapshot, readGameModeSnapshot, readGameModeSnapshot)
  const game = React.useSyncExternalStore(subscribeGameFpsSnapshot, readGameFpsSnapshot, readGameFpsSnapshot)
  const [pending, setPending] = React.useState<'city' | 'game' | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const cityVisible = city.active || city.phase === 'running'
  const gameVisible = cityVisible || gameMode.active || gameMode.simulationStatus === 'running' || game.phase === 'playing'
  const live = cityVisible || gameVisible

  const run = React.useCallback(async (track: 'city' | 'game', action: () => unknown | Promise<unknown>) => {
    setPending(track)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setPending(null)
    }
  }, [])

  const openMedia = () => activateXrSceneSurface({ panelView: 'media', openPanel: true, timeline: true })
  if (!live) {
    return (
      <section className="grid gap-2 p-3 text-xs" data-kg-xr-timeline-empty-state="1">
        <p role="status">No authored XR scene is active. Use the shared Media library to stage an environment or add a subject, then edit it here.</p>
        <div>
          <button
            type="button"
            className="App-toolbar__btn"
            onClick={openMedia}
            data-kg-xr-timeline-open-media="1"
          >Open Media · 3D for XR</button>
        </div>
      </section>
    )
  }

  const gameRunning = gameMode.simulationStatus === 'running' || game.phase === 'playing'
  const cityTreasury = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })
    .format(city.city.treasuryCents / 100)

  return (
    <section className={`grid ${compact ? 'gap-1 p-2' : 'gap-2 p-3'} text-xs`} aria-label="Live Geo+XR simulation timeline" data-kg-xr-live-timeline="1">
      <header className="grid gap-1">
        <b>Live simulation timeline</b>
        <p className="opacity-70">Current City and Game Mode ticks on the shared Geo+XR map. Controls operate the existing simulations.</p>
      </header>
      {cityVisible ? (
        <article className="grid gap-1 rounded border p-2" data-kg-xr-timeline-track="city">
          <header className="flex items-center justify-between gap-2">
            <b>City Simulation</b>
            <span>Tick {city.city.tick} · {city.phase}</span>
          </header>
          <div className="flex flex-wrap gap-x-3 gap-y-1 opacity-80">
            <span>Population {city.city.population.toLocaleString()}</span>
            <span>Treasury {cityTreasury}</span>
            <span>{city.city.parcels.filter(parcel => parcel.zone !== 'unzoned').length}/{city.city.parcels.length} POIs zoned</span>
          </div>
          <div>
            <button
              type="button"
              className="App-toolbar__btn"
              disabled={pending !== null}
              onClick={() => void run('city', city.phase === 'running' ? stopCitySim : () => startCitySim({ openPanel: false }))}
              data-kg-xr-timeline-city-action={city.phase === 'running' ? 'stop' : 'start'}
            >{city.phase === 'running' ? 'Stop City ticks' : 'Start City ticks'}</button>
          </div>
        </article>
      ) : null}
      {gameVisible ? (
        <article className="grid gap-1 rounded border p-2" data-kg-xr-timeline-track="game-mode">
          <header className="flex items-center justify-between gap-2">
            <b>Game Mode</b>
            <span>Tick {game.tick} · {gameMode.active ? gameMode.simulationStatus : 'inactive'}</span>
          </header>
          <div className="flex flex-wrap gap-x-3 gap-y-1 opacity-80">
            <span>Player {game.player.health} HP</span>
            <span>{game.npcs.length} actors</span>
            <span>{game.enemiesAlive} active</span>
          </div>
          <div>
            <button
              type="button"
              className="App-toolbar__btn"
              disabled={pending !== null}
              onClick={() => void run('game', gameRunning ? stopGameMode : () => startGameMode({ openPanel: false }))}
              data-kg-xr-timeline-game-action={gameRunning ? 'stop' : 'start'}
            >{gameRunning ? 'Stop Game Mode' : 'Start Game Mode'}</button>
          </div>
        </article>
      ) : null}
      {error ? <p role="alert" className="text-red-700">{error}</p> : null}
      <div>
        <button
          type="button"
          className="App-toolbar__btn"
          onClick={openMedia}
          data-kg-xr-timeline-open-media="1"
        >Open Media · 3D for XR</button>
      </div>
    </section>
  )
}

/** One object inspector shared by Media and Timeline, including the same stale-draft fences. */
export function XrObjectInspector({ emptyMessage = '' }: { emptyMessage?: string }) {
  const semanticSelection = useGraphStore(state => state.canvasRenderMode === '3d' ? state.graphData?.nodes.find(node => node.id === state.selectedNodeId && node.type === 'semantic-space-entity') : null)
  const runtime = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
  const hasTarget = runtime.plan.subjects.some(subject => subject.id === runtime.selectedShotTargetId)
    || resolveXrStageObjects(runtime.plan.stageId).some(object => object.id === runtime.selectedShotTargetId)
  if (semanticSelection) return <React.Suspense fallback={<span>Opening object inspector…</span>}><SemanticObjectInspector key={semanticSelection.id} inspectorOnly entityId={String(semanticSelection.properties?.entityId || '')} spaceId={String(semanticSelection.properties?.spaceId || '')} /></React.Suspense>
  return hasTarget ? <XrSubjectTransformEditor /> : emptyMessage ? <p role="status" className="p-2 text-xs opacity-70">{emptyMessage}</p> : null
}

export function TimelineBottomPanelView({ compact = false }: { compact?: boolean }) {
  const sourceContext = useSourceGeospatialContext()
  const sequenceContext = useGraphStore(state => state.canvasRenderMode === '2d' && ['sequence', 'sequenceMermaid'].includes(state.canvas2dRenderer))
  const { available: warehouseTimelineAvailable } = useWarehouseInspectionMode()
  const xrTimelineContext = useGraphStore(state => state.canvasRenderMode === '3d' && state.canvas3dMode === 'xr')
  const stageAuthority = useGraphStore(state => resolveXrDocumentStageAuthority(state))
  if (sourceContext) return <React.Suspense fallback={<p>Opening source Timeline…</p>}><SourceGeospatialTimelinePanel compact={compact} /></React.Suspense>
  if (warehouseTimelineAvailable) return <React.Suspense fallback={<p>Opening warehouse timeline…</p>}><WarehouseTimelinePanel compact={compact} /></React.Suspense>
  if (xrTimelineContext && !stageAuthority) return <LiveGeoXrSimulationTimeline compact={compact} />
  if (xrTimelineContext) return <><XrSubjectTransformEditor /><XrCameraMotionSection /></>
  if (sequenceContext) return <React.Suspense fallback={<p>Opening sequence timeline…</p>}><SequenceTimeline /></React.Suspense>
  return <MediaTimelineBottomPanelView compact={compact} />
}
