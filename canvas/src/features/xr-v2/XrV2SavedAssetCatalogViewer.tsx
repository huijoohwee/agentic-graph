import React from 'react'
import { FolderOpen, RefreshCw, Save } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { createXrV2IndexedDbArtifactStore } from './xrV2CaptureArtifactStore'
import {
  createXrV2SavedAssetViewerLease,
  drawXrV2DepthParallaxFrame,
  listXrV2SavedSpatialAssets,
  loadXrV2SavedSpatialAsset,
  resolveXrV2ParallaxPoint,
  type XrV2ParallaxPoint,
  type XrV2SavedAssetCatalogStore,
  type XrV2SavedAssetViewerLease,
  type XrV2SavedSpatialAssetResource,
} from './xrV2SavedAssetCatalog'
import type { XrV2PublishedSpatialAsset } from './xrV2SpatialAssetMetadata'

const DEFAULT_STORE_FACTORY = () => createXrV2IndexedDbArtifactStore()

function DepthParallaxCanvas({
  resource,
  lease,
  onObserved,
}: Readonly<{
  resource: XrV2SavedSpatialAssetResource
  lease: XrV2SavedAssetViewerLease
  onObserved: () => void
}>) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const queuedPointRef = React.useRef<XrV2ParallaxPoint>({ x: 0, y: 0 })
  const animationFrameRef = React.useRef<number | null>(null)
  const draw = React.useCallback((point: XrV2ParallaxPoint) => {
    const canvas = canvasRef.current
    const frame = resource.depthFrame
    if (!canvas || !frame) return
    const drawn = drawXrV2DepthParallaxFrame(canvas, frame, point)
    if (lease.markDepthParallaxDraw(canvas.isConnected, drawn)) onObserved()
  }, [lease, onObserved, resource.depthFrame])
  const scheduleDraw = React.useCallback((point: XrV2ParallaxPoint) => {
    queuedPointRef.current = point
    if (animationFrameRef.current !== null) return
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      draw(point)
      return
    }
    animationFrameRef.current = globalThis.requestAnimationFrame(() => {
      animationFrameRef.current = null
      draw(queuedPointRef.current)
    })
  }, [draw])
  React.useEffect(() => {
    draw({ x: 0, y: 0 })
    return () => {
      if (animationFrameRef.current !== null && typeof globalThis.cancelAnimationFrame === 'function') {
        globalThis.cancelAnimationFrame(animationFrameRef.current)
      }
      animationFrameRef.current = null
    }
  }, [draw])
  const pointFromClient = React.useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (canvas) scheduleDraw(resolveXrV2ParallaxPoint(canvas, clientX, clientY))
  }, [scheduleDraw])
  return (
    <canvas
      ref={canvasRef}
      className="aspect-video w-full touch-none rounded bg-black object-contain"
      aria-label="Saved XR depth-parallax viewer"
      data-kg-xr-v2-saved-depth-parallax="1"
      onPointerMove={event => pointFromClient(event.clientX, event.clientY)}
      onPointerLeave={() => scheduleDraw({ x: 0, y: 0 })}
      onTouchMove={event => {
        const touch = event.touches.item(0)
        if (touch) pointFromClient(touch.clientX, touch.clientY)
      }}
    />
  )
}

export function XrV2SavedAssetCatalogViewer({
  refreshKey,
  storeFactory = DEFAULT_STORE_FACTORY,
}: Readonly<{
  refreshKey: string | null
  storeFactory?: () => XrV2SavedAssetCatalogStore
}>) {
  const storeRef = React.useRef<XrV2SavedAssetCatalogStore | null>(null)
  const leaseRef = React.useRef<XrV2SavedAssetViewerLease | null>(null)
  const requestGenerationRef = React.useRef(0)
  const [assets, setAssets] = React.useState<readonly XrV2PublishedSpatialAsset[]>([])
  const [opened, setOpened] = React.useState<Readonly<{
    resource: XrV2SavedSpatialAssetResource
    lease: XrV2SavedAssetViewerLease
  }> | null>(null)
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'opening' | 'error'>('loading')
  const [error, setError] = React.useState<string | null>(null)
  const [observed, setObserved] = React.useState(false)

  const releaseViewer = React.useCallback((updateState: boolean) => {
    leaseRef.current?.release()
    leaseRef.current = null
    if (updateState) {
      setOpened(null)
      setObserved(false)
    }
  }, [])

  React.useEffect(() => {
    let active = true
    const generation = ++requestGenerationRef.current
    releaseViewer(true)
    setError(null)
    setStatus('loading')
    let store: XrV2SavedAssetCatalogStore
    try {
      store = storeFactory()
    } catch (cause) {
      setAssets([])
      setStatus('error')
      setError(cause instanceof Error ? cause.message : String(cause))
      return () => { active = false }
    }
    storeRef.current = store
    void listXrV2SavedSpatialAssets(store).then(next => {
      if (!active || requestGenerationRef.current !== generation) return
      setAssets(next)
      setStatus('ready')
    }).catch(cause => {
      if (!active || requestGenerationRef.current !== generation) return
      setAssets([])
      setStatus('error')
      setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => {
      active = false
      requestGenerationRef.current += 1
      releaseViewer(false)
      if (storeRef.current === store) storeRef.current = null
      store.close()
    }
  }, [refreshKey, releaseViewer, storeFactory])

  const openAsset = React.useCallback(async (assetId: string) => {
    const store = storeRef.current
    if (!store) return
    const generation = ++requestGenerationRef.current
    releaseViewer(true)
    setStatus('opening')
    setError(null)
    try {
      const resource = await loadXrV2SavedSpatialAsset(store, assetId)
      if (requestGenerationRef.current !== generation || storeRef.current !== store) return
      const lease = createXrV2SavedAssetViewerLease(resource)
      if (requestGenerationRef.current !== generation || storeRef.current !== store) {
        lease.release()
        return
      }
      leaseRef.current = lease
      setOpened(Object.freeze({ resource, lease }))
      setStatus('ready')
    } catch (cause) {
      if (requestGenerationRef.current !== generation) return
      setStatus('error')
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [releaseViewer])

  return (
    <section
      className={cn('grid gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border)}
      aria-label="Saved XR spatial assets"
      data-kg-xr-v2-saved-asset-catalog="1"
      data-kg-xr-v2-saved-asset-catalog-status={status}
    >
      <header className="flex items-center justify-between gap-2">
        <strong className="flex items-center gap-1 text-[9px]"><Save className="h-3 w-3" aria-hidden="true" /> Saved spatial assets</strong>
        <span className={cn('text-[8px]', UI_THEME_TOKENS.text.tertiary)}><RefreshCw className="mr-1 inline h-3 w-3" aria-hidden="true" />{assets.length} local</span>
      </header>
      {assets.length ? (
        <ul className="m-0 grid list-none gap-1 p-0" aria-label="Persisted XR spatial asset catalog">
          {assets.map(asset => (
            <li key={asset.asset_id} className={cn('flex items-center justify-between gap-2 rounded border p-1', UI_THEME_TOKENS.panel.border)} data-kg-xr-v2-saved-asset={asset.asset_id}>
              <span className="min-w-0 text-[8px]"><b className="block truncate">{asset.asset_id}</b>{asset.metadata.xr_capability_tier} · {asset.metadata.synthesis_mode}</span>
              <button type="button" className="App-toolbar__btn" disabled={status === 'opening'} onClick={() => void openAsset(asset.asset_id)} data-kg-xr-v2-saved-asset-open="1">
                <FolderOpen className="h-3 w-3" aria-hidden="true" /> Open
              </button>
            </li>
          ))}
        </ul>
      ) : status === 'ready' ? (
        <p className={cn('m-0 text-[8px]', UI_THEME_TOKENS.text.tertiary)}>No persisted captures yet.</p>
      ) : null}
      {opened ? (
        <section className="grid gap-1" aria-label="Saved XR spatial asset viewer" data-kg-xr-v2-saved-asset-viewer={opened.resource.asset.metadata.xr_capability_tier} data-kg-xr-v2-saved-asset-observed={observed ? 'true' : 'false'}>
          {opened.resource.asset.metadata.xr_capability_tier === 'pseudo-ar-depth-parallax' ? (
            <DepthParallaxCanvas resource={opened.resource} lease={opened.lease} onObserved={() => setObserved(true)} />
          ) : opened.resource.asset.metadata.xr_capability_tier === 'flat-fallback' && opened.lease.playbackUrl ? (
            <video
              className="aspect-video w-full rounded bg-black"
              controls
              playsInline
              src={opened.lease.playbackUrl}
              onCanPlay={() => { if (opened.lease.markFlatPlaybackCanPlay()) setObserved(true) }}
              aria-label="Saved XR flat fallback playback"
              data-kg-xr-v2-saved-flat-playback="1"
            />
          ) : (
            <p className="m-0 text-[8px]">This persisted capability tier has no local saved-viewer adapter.</p>
          )}
          <code className={cn('break-all text-[8px]', UI_THEME_TOKENS.text.tertiary)} data-kg-xr-v2-saved-asset-metadata="1">
            {JSON.stringify(opened.resource.asset.metadata)}
          </code>
          <p className={cn('m-0 break-all text-[8px]', UI_THEME_TOKENS.text.tertiary)}>
            Raw {opened.resource.rawClip.size} bytes · frames {opened.resource.frameBundle.frames.length}<br />
            {opened.resource.asset.raw_clip_ref}<br />{opened.resource.asset.metadata.depth_metadata_ref}
          </p>
        </section>
      ) : null}
      {error ? <p className="m-0 text-[8px] text-red-700 dark:text-red-300" role="alert">{error}</p> : null}
    </section>
  )
}
