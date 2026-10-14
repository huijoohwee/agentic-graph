import React from 'react'
import type { VideoSequenceTimelineInsertedLane } from '@/components/timeline/VideoSequenceTimelineLanes'
import { TimelineTransportTimeAxisClip } from '@/components/timeline/TimelineTransportControls'
import { resolveVideoSequenceRulerInsetLeft, resolveVideoSequenceRulerInsetWidth } from '@/components/timeline/videoSequenceTimelineRulerGeometry'
import { useTimelineTransportStoreBinding } from '@/components/timeline/timelineTransport'
import { useGraphStore } from '@/hooks/useGraphStore'
import { controlXrSharedAssetControls } from '@/features/three/xrSharedAssetControlRuntime'
import { readXrMotionReferenceRuntime, setXrMotionReferenceStage, subscribeXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { hydrateCanonicalXrMotionReferenceRuntime } from '@/features/three/XrMotionReferenceRuntimeBridge'
import {
  XR_MOTION_REFERENCE_STAGE_PRESETS,
  resolveXrMotionReferenceStagePreviewBounds,
} from '@/features/three/xrSceneLibrary'
import { readXrPhysicsRuntime } from '@/features/three/xrPhysicsRuntime'
import { activateGeoXrSurfaceAtomically } from '@/features/geospatial/geoXrSurfaceActivation'
import { requestGeospatialFitToBounds } from '@/features/geospatial/gympgrphBridge'
import {
  publishCinemaShotFocus,
  publishCinemaShotSchedule,
  resolveCinemaKitReferenceLocation,
} from './cinemaShotFocus'
import {
  importCinemaReferenceFiles,
  parseCinemaTimelineSource,
  readCinemaAssetRevision,
  readCinemaReferenceAssets,
  subscribeCinemaAssetChanges,
  type CinemaReferenceAsset,
  type CinemaShot,
  type CinemaStoredAsset,
  type CinemaTimelineModel,
} from './cinemaShotTimelineModel'

type LoadedAsset = Readonly<{ asset: CinemaReferenceAsset; mimeType: CinemaStoredAsset['mimeType']; url: string }>

function waitForGeoMapLayout(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  const selectors = [
    '[aria-label="Canvas viewport"]',
    '[aria-label="Markdown Workspace"]',
    '[aria-label="Floating panel"]',
    '[aria-label="Geospatial panel"]',
    '[data-kg-workspace-visible-viewport-occluder]',
    '.kg-canvas-bottom-panel',
  ].join(', ')
  const readLayout = () => Array.from(document.querySelectorAll(selectors)).map(element => {
    const rect = element.getBoundingClientRect()
    return [rect.left, rect.top, rect.width, rect.height].map(Math.round).join(',')
  }).join('|')
  return new Promise((resolve, reject) => {
    let previous = ''
    let stableFrames = 0
    let remainingFrames = 90
    const check = () => {
      const current = readLayout()
      stableFrames = current === previous ? stableFrames + 1 : 0
      previous = current
      if (stableFrames >= 2) {
        resolve()
      } else if (--remainingFrames <= 0) {
        reject(new Error('Canvas panels did not settle before map framing.'))
      } else {
        window.requestAnimationFrame(check)
      }
    }
    window.requestAnimationFrame(check)
  })
}

function useCinemaAssets(sourceText: string) {
  const model = React.useMemo(() => parseCinemaTimelineSource(sourceText), [sourceText])
  const revision = React.useSyncExternalStore(subscribeCinemaAssetChanges, readCinemaAssetRevision, readCinemaAssetRevision)
  const [state, setState] = React.useState<{ assets: readonly LoadedAsset[]; loading: boolean; error: string }>({ assets: [], loading: true, error: '' })
  React.useEffect(() => {
    let active = true
    const urls: string[] = []
    if (!model) { setState({ assets: [], loading: false, error: '' }); return () => undefined }
    setState({ assets: [], loading: true, error: '' })
    void readCinemaReferenceAssets(model.assets).then(records => {
      const assets = records.map(record => {
        const url = URL.createObjectURL(record.record.blob)
        urls.push(url)
        return { asset: record.asset, mimeType: record.mimeType, url }
      })
      if (active) setState({ assets, loading: false, error: '' })
      else urls.forEach(url => URL.revokeObjectURL(url))
    }).catch(error => {
      if (active) setState({ assets: [], loading: false, error: error instanceof Error ? error.message : String(error) })
    })
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)) }
  }, [model, revision])
  return { model, ...state }
}

function ReferenceFilePicker({ model }: { model: CinemaTimelineModel }) {
  const [status, setStatus] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || [])
    event.currentTarget.value = ''
    if (!files.length) return
    setBusy(true)
    setStatus('Checking image bytes and source digests…')
    try {
      await importCinemaReferenceFiles(model.assets, files)
      setStatus(`Imported ${model.assets.length} reference assets to this browser’s local storage. Rights remain unverified.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }
  return <section className="grid gap-1" data-kg-cinema-reference-import="1">
    <label className="App-toolbar__btn inline-flex w-fit cursor-pointer items-center gap-2">
      <span>{busy ? 'Checking references…' : `Import ${model.assets.length} local reference assets`}</span>
      <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy}
        aria-label={`Import ${model.assets.length} cinema reference assets`} onChange={event => void onChange(event)} />
    </label>
    <p className="text-xs opacity-70">Files stay on this device. The importer checks each SHA-256 and image signature; public distribution remains blocked until rights are recorded.</p>
    {status ? <p role="status" className="text-xs" data-kg-cinema-import-status="1">{status}</p> : null}
  </section>
}

function AssetsGallery({ model, assets, loading, error }: {
  model: CinemaTimelineModel
  assets: readonly LoadedAsset[]
  loading: boolean
  error: string
}) {
  const loaded = new Map(assets.map(item => [item.asset.id, item]))
  return <>
    <ReferenceFilePicker model={model} />
    {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
    {loading ? <p role="status" className="text-xs opacity-70">Reading local references…</p> : null}
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Imported cinema reference assets" data-kg-cinema-reference-gallery="1">
      {model.assets.map(asset => {
        const item = loaded.get(asset.id)
        return <article key={asset.id} className="grid min-w-0 gap-1 rounded border p-1.5" data-kg-cinema-reference-asset={asset.id}>
          {item ? <img className="aspect-video w-full rounded object-cover" src={item.url} alt={`${asset.role}: ${asset.name}`} loading="lazy" decoding="async" />
            : <div className="flex aspect-video items-center justify-center rounded bg-slate-100 px-2 text-center text-xs opacity-70 dark:bg-slate-800">Import to preview</div>}
          <b className="truncate text-xs" title={asset.name}>{asset.name}</b>
          <small className="text-xs opacity-70">{item ? `${item.mimeType} · local` : asset.role}</small>
        </article>
      })}
    </section>
  </>
}

export function CinemaReferenceAssetsPanel({ sourceText }: { sourceText: string }) {
  const { model, assets, loading, error } = useCinemaAssets(sourceText)
  if (!model) return null
  return <details className="mt-2 border-t pt-2" open data-kg-cinema-media-assets="1">
    <summary className="cursor-pointer text-xs font-semibold uppercase">Cinema reference assets · {assets.length}/{model.assets.length} local</summary>
    <div className="mt-2 grid gap-2"><AssetsGallery model={model} assets={assets} loading={loading} error={error} /></div>
  </details>
}

function formatTime(seconds: number): string { return `${seconds.toFixed(1)}s` }

function formatShotBeat(shot: Pick<CinemaShot, 'subject' | 'line' | 'acting'>): string {
  const beat = shot.subject && shot.line ? `${shot.subject} — “${shot.line}”` : shot.subject || (shot.line ? `“${shot.line}”` : '')
  return shot.acting && shot.acting !== 'idle' ? `${beat}${beat ? ' · ' : ''}${shot.acting}` : beat
}

function contactSheetCropStyle(
  url: string,
  panelIndex: number | null,
  layout: CinemaTimelineModel['contactSheetLayout'],
): React.CSSProperties {
  if (panelIndex === null) return { backgroundImage: `url("${url}")`, backgroundPosition: 'center', backgroundSize: 'cover' }
  const column = (panelIndex - 1) % layout.columns
  const row = Math.floor((panelIndex - 1) / layout.columns)
  const imageWidthInCells = layout.columns / layout.cellInsetX
  const imageHeightInCells = layout.rows / layout.cellInsetY
  return {
    backgroundImage: `url("${url}")`,
    backgroundPosition: `${column / (imageWidthInCells - 1) * 100}% ${row / (imageHeightInCells - 1) * 100}%`,
    backgroundSize: `${imageWidthInCells * 100}% ${imageHeightInCells * 100}%`,
  }
}

export function CinemaShotTimeline({ sourceText, compact = false, xrTimeline = false, children }: {
  sourceText: string
  compact?: boolean
  xrTimeline?: boolean
  children?: (timelineInsertedLanes: readonly VideoSequenceTimelineInsertedLane[]) => React.ReactNode
}) {
  const { model, assets, loading, error } = useCinemaAssets(sourceText)
  const xr = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
  const documentName = useGraphStore(state => state.markdownDocumentName || '')
  const transport = useTimelineTransportStoreBinding()
  const [surfaceStatus, setSurfaceStatus] = React.useState('')
  const focusPlayheadSeconds = xrTimeline
    ? xr.playheadSeconds
    : (transport.transportDocumentKey === documentName ? transport.transportPosition * 60 : 0)
  const focusShotIndex = model
    ? Math.max(0, model.shots.findIndex(shot => focusPlayheadSeconds >= shot.startSeconds && focusPlayheadSeconds < shot.endSeconds))
    : -1
  const focusShotOrdinal = model && focusPlayheadSeconds >= model.durationSeconds ? model.shots.length - 1 : focusShotIndex
  const focusShot = model && focusShotOrdinal >= 0 ? model.shots[focusShotOrdinal] : undefined
  const focusKitId = model?.environmentKitId || ''
  const focusStageActive = xr.plan.stageId === focusKitId
  React.useEffect(() => {
    if (!xrTimeline || !focusShot || !focusStageActive) return
    publishCinemaShotFocus({ kitId: focusKitId, shotId: focusShot.id, locationIndex: focusShot.locationIndex })
  }, [focusKitId, focusShot, focusStageActive, xrTimeline])
  // The Geo overlay publisher is the single map camera owner; it reads this schedule per playhead.
  React.useEffect(() => {
    if (!xrTimeline || !model || !focusStageActive) {
      publishCinemaShotSchedule(null)
      return
    }
    publishCinemaShotSchedule({
      kitId: model.environmentKitId,
      durationSeconds: model.durationSeconds,
      shots: model.shots.map(shot => ({
        shotId: shot.id,
        startSeconds: shot.startSeconds,
        endSeconds: shot.endSeconds,
        locationIndex: shot.locationIndex,
        cast: shot.cast,
        acting: shot.acting,
      })),
      cameraPath: xr.plan.camera.map(mark => ({
        timeSeconds: mark.timeSeconds,
        moveId: mark.moveId,
        settings: mark.settings,
      })),
    })
  }, [focusStageActive, model, xr.plan.camera, xrTimeline])
  React.useEffect(() => () => { publishCinemaShotFocus(null); publishCinemaShotSchedule(null) }, [])
  if (!model) return <p role="status" className="p-3 text-xs">This source has no valid local cinema timeline.</p>
  const transportSeconds = transport.transportDocumentKey === documentName ? transport.transportPosition * 60 : 0
  const playheadSeconds = xrTimeline ? xr.playheadSeconds : transportSeconds
  const selected = model.shots.find(shot => playheadSeconds >= shot.startSeconds && playheadSeconds < shot.endSeconds)
    || (playheadSeconds >= model.durationSeconds ? model.shots[model.shots.length - 1] : model.shots[0])
  const selectedLocation = selected ? resolveCinemaKitReferenceLocation(model.environmentKitId, selected.locationIndex) : null
  const selectedLocationText = selectedLocation ? ` · Reference location ${selectedLocation.index} · ${selectedLocation.label}` : ''
  const selectedBeat = selected ? formatShotBeat(selected) : ''
  const loadedAssets = new Map(assets.map(item => [item.asset.id, item]))
  const selectShot = (startSeconds: number) => {
    if (xrTimeline) {
      // Re-selecting the shot under a parked playhead still hands the Geo camera back to the shot.
      const timeSeconds = readXrMotionReferenceRuntime().playheadSeconds === startSeconds ? startSeconds + 0.01 : startSeconds
      const result = controlXrSharedAssetControls({ operation: 'scrub-timeline', timeSeconds })
      if (!result.ok) setSurfaceStatus(result.message)
      return
    }
    useGraphStore.getState().setTimelineTransportState({
      documentKey: documentName,
      position: startSeconds / 60,
      playing: false,
    })
  }
  const openMedia = () => {
    setSurfaceStatus('')
    void (async () => {
      const stage = XR_MOTION_REFERENCE_STAGE_PRESETS.find(candidate => candidate.id === model.environmentKitId)
      if (!stage) {
          setSurfaceStatus(`The environment kit “${model.environmentKitId}” is not in the local catalog.`)
        return
      }
      if (readXrPhysicsRuntime().phase !== 'stopped') {
        setSurfaceStatus('Stop the XR physics simulation before changing the Cinema stage.')
        return
      }
      if (!hydrateCanonicalXrMotionReferenceRuntime()) {
        setSurfaceStatus('XR scene state is not ready for the Cinema stage.')
        return
      }
      setXrMotionReferenceStage(stage.id)
      if (readXrMotionReferenceRuntime().plan.stageId !== stage.id) {
        setSurfaceStatus(`${stage.label} could not be selected for this scene.`)
        return
      }
      const opened = await activateGeoXrSurfaceAtomically({}, {
        panelView: 'media',
        openPanel: true,
        timeline: true,
      })
      if (!opened) {
        setSurfaceStatus('Geo+XR Media could not open for this document layout. Keep the Timeline active or choose a supported block layout.')
        return
      }
      if (stage.geospatialContext?.purpose === 'regional-viewport-only') {
        await waitForGeoMapLayout()
        const previewBounds = resolveXrMotionReferenceStagePreviewBounds(stage.id)
        if (previewBounds) await requestGeospatialFitToBounds(previewBounds)
      }
      // A bounds fit owns the map briefly. Nudge the shared transport so the current shot
      // resumes ownership after that fit, including when the playhead was already parked.
      const currentPlayhead = readXrMotionReferenceRuntime().playheadSeconds
      const nudgedPlayhead = currentPlayhead >= model.durationSeconds
        ? Math.max(0, model.durationSeconds - 0.001)
        : Math.min(model.durationSeconds, currentPlayhead + 0.001)
      const framed = controlXrSharedAssetControls({ operation: 'scrub-timeline', timeSeconds: nudgedPlayhead })
      if (!framed.ok) setSurfaceStatus(framed.message)
    })().catch(error => setSurfaceStatus(error instanceof Error ? error.message : String(error)))
  }

  const timelineInsertedLanes: readonly VideoSequenceTimelineInsertedLane[] = [{
    id: 'cinema-shots',
    ariaLabel: 'Cinema shot clips on the shared timeline',
    insertAfterLaneId: 'scene',
    selectRowKey: 'cinema-shots',
    label: `Cinema shots · ${model.shots.length}`,
    content: ({ selectRow }) => (
      <TimelineTransportTimeAxisClip
        laneStyle="video"
        className="cinema-shot-time-axis-rail"
        aria-label="Cinema shot clips"
        data-kg-cinema-shot-lane="1"
        style={{ inset: 0 }}
      >
        {model.shots.map((shot, index) => {
          const active = selected?.id === shot.id
          const shotReference = shot.referenceAssetId ? loadedAssets.get(shot.referenceAssetId) : undefined
          const crop = shotReference ? contactSheetCropStyle(shotReference.url, shot.panelIndex, model.contactSheetLayout) : undefined
          const location = resolveCinemaKitReferenceLocation(model.environmentKitId, shot.locationIndex)
          const locationText = location ? ` · Reference location ${location.index} · ${location.label}` : ''
          const beat = formatShotBeat(shot)
          const beatText = beat ? ` · ${beat}` : ''
          const startPercent = shot.startSeconds / model.durationSeconds * 100
          const widthPercent = (shot.endSeconds - shot.startSeconds) / model.durationSeconds * 100
          const style: React.CSSProperties = {
            left: resolveVideoSequenceRulerInsetLeft(startPercent),
            width: resolveVideoSequenceRulerInsetWidth(widthPercent),
            minWidth: 0,
            backgroundColor: '#334155',
            ...(location && !crop ? {
              backgroundImage: `linear-gradient(90deg, ${location.color} 0 3px, transparent 3px), linear-gradient(${location.color}33, ${location.color}14)`,
            } : {}),
            ...(location ? { boxShadow: `inset 0 -2px 0 ${location.color}` } : {}),
            ...(crop ? {
              backgroundImage: `linear-gradient(rgb(15 23 42 / 0.28), rgb(15 23 42 / 0.28)), ${crop.backgroundImage}`,
              backgroundPosition: crop.backgroundPosition,
              backgroundSize: crop.backgroundSize,
            } : {}),
          }
          return (
            <button
              key={shot.id}
              type="button"
              className={`timeline-transport-time-axis-bar ${active ? 'timeline-transport-track-clip--selected' : ''}`}
              style={style}
              aria-label={`Select shot ${index + 1}, ${shot.label}, ${formatTime(shot.startSeconds)} to ${formatTime(shot.endSeconds)}${locationText}`}
              aria-pressed={active}
              title={`Shot ${String(index + 1).padStart(2, '0')} · ${shot.label} · ${formatTime(shot.startSeconds)}–${formatTime(shot.endSeconds)}${locationText}${beatText}${shot.foreshadow ? ` · Foreshadows: ${shot.foreshadow}` : ''}`}
              onClick={() => { selectRow(); selectShot(shot.startSeconds) }}
              data-kg-cinema-shot={shot.id}
              data-kg-cinema-panel-index={shot.panelIndex}
              data-kg-cinema-location-index={location?.index}
            ><span className="truncate">{String(index + 1).padStart(2, '0')} · {shot.label}</span></button>
          )
        })}
      </TimelineTransportTimeAxisClip>
    ),
  }]

  return <section className={`grid ${compact ? 'gap-1 p-2' : 'gap-2 p-3'} text-xs`} aria-label="Cinema timeline context" data-kg-cinema-shot-timeline="1" data-kg-cinema-duration-seconds={model.durationSeconds}>
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div><b>{model.title}</b><p className="opacity-70">{model.shots.length} source-linked shots · {model.durationSeconds.toFixed(1)} seconds · {assets.length}/{model.assets.length} local reference assets</p></div>
      <button type="button" className="App-toolbar__btn" onClick={openMedia} data-kg-cinema-open-media="1">Open Geo+XR · Media</button>
    </header>
    {surfaceStatus ? <p role="status" className="text-xs text-amber-700 dark:text-amber-300">{surfaceStatus}</p> : null}
    {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
    {loading ? <p role="status" className="text-xs opacity-70">Reading local references…</p> : null}
    {selected ? <p role="status" className="border-t pt-1 opacity-80" data-kg-cinema-selected-shot={selected.id}>Selected · {selected.label} · {formatTime(selected.startSeconds)}–{formatTime(selected.endSeconds)}{selectedLocationText}{selectedBeat ? <span className="block" data-kg-cinema-selected-beat="1">{selectedBeat}{selected.foreshadow ? <span className="opacity-70"> · Foreshadows: {selected.foreshadow}</span> : null}</span> : null}</p> : null}
    {model.shots.some(shot => shot.referenceAssetId && !loadedAssets.has(shot.referenceAssetId))
      ? <p role="status" className="opacity-70">Import reference assets in Media · Assets to add source thumbnails to the shared shot lane.</p> : null}
    {children?.(timelineInsertedLanes)}
  </section>
}
