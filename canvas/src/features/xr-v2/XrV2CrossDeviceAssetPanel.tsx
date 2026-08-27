import React from 'react'
import { CloudDownload, CloudUpload, RefreshCw } from 'lucide-react'

import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  createXrV2CrossDeviceAssetAdapter,
  XR_V2_CROSS_DEVICE_EXTERNAL_PROMOTION_BLOCKER,
  type XrV2CrossDeviceAssetAdapter,
  type XrV2CrossDeviceAssetManifest,
  type XrV2CrossDeviceLocalStore,
} from './xrV2CrossDeviceAssetAdapter'
import type { XrV2SavedSpatialAssetResource } from './xrV2SavedAssetCatalog'

export const XR_V2_PINNED_SOURCE_ID =
  'https://github.com/huijoohwee/knowgrph/blob/45734455399fd6f44bed2df1159ba32f53535d59/docs/documents/agenticgraph-ar-vr-xr-prd-tad-adr.md' as const

type Phase = 'idle' | 'publishing' | 'listing' | 'reading' | 'ready' | 'deferred' | 'error'

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : 'Existing storage action failed.'
}

export function XrV2CrossDeviceAssetPanel({
  resource,
  localStore,
  onImported,
  adapterFactory = createXrV2CrossDeviceAssetAdapter,
}: Readonly<{
  resource: XrV2SavedSpatialAssetResource | null
  localStore: XrV2CrossDeviceLocalStore | null
  onImported: (assetId: string) => void | Promise<void>
  adapterFactory?: () => XrV2CrossDeviceAssetAdapter
}>) {
  const [{ adapter, configurationError }] = React.useState(() => {
    try {
      return { adapter: adapterFactory(), configurationError: null as string | null }
    } catch (error) {
      return { adapter: null, configurationError: errorMessage(error) }
    }
  })
  const abortRef = React.useRef<AbortController | null>(null)
  const generationRef = React.useRef(0)
  const [phase, setPhase] = React.useState<Phase>(configurationError ? 'error' : 'idle')
  const [message, setMessage] = React.useState(
    configurationError || 'No storage request runs on mount. Choose one explicit action.',
  )
  const [manifests, setManifests] = React.useState<readonly XrV2CrossDeviceAssetManifest[]>([])
  const [selectedAssetId, setSelectedAssetId] = React.useState('')

  React.useEffect(() => () => {
    generationRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const begin = React.useCallback((next: Phase) => {
    const generation = ++generationRef.current
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    setPhase(next)
    return Object.freeze({ generation, abort })
  }, [])

  const publish = React.useCallback(async () => {
    if (!adapter || !resource) return
    const operation = begin('publishing')
    setMessage('Publishing verified parts first and the existing document manifest last…')
    try {
      const result = await adapter.publish({
        sourceId: XR_V2_PINNED_SOURCE_ID,
        asset: resource.asset,
        rawClip: resource.rawClip,
        frameBundle: resource.frameBundle,
        signal: operation.abort.signal,
      })
      if (generationRef.current !== operation.generation) return
      if (result.status === 'deferred') {
        setPhase('deferred')
        setMessage(`Publish deferred (${result.reason}); local IndexedDB remains authoritative.`)
        return
      }
      setManifests(current => Object.freeze([
        result.manifest,
        ...current.filter(item => item.asset.asset_id !== result.manifest.asset.asset_id),
      ]))
      setSelectedAssetId(result.manifest.asset.asset_id)
      setPhase('ready')
      setMessage(result.status === 'existing'
        ? 'Exact deterministic manifest already exists.'
        : 'Parts and manifest published through the existing Asset Contract Writer boundary.')
    } catch (error) {
      if (generationRef.current !== operation.generation || operation.abort.signal.aborted) return
      setPhase('error')
      setMessage(errorMessage(error))
    }
  }, [adapter, begin, resource])

  const list = React.useCallback(async () => {
    if (!adapter) return
    const operation = begin('listing')
    setMessage('Reading the existing workspace document inventory…')
    try {
      const result = await adapter.list({ sourceId: XR_V2_PINNED_SOURCE_ID, signal: operation.abort.signal })
      if (generationRef.current !== operation.generation) return
      if (result.status === 'deferred') {
        setManifests([])
        setPhase('deferred')
        setMessage(`Shared catalog deferred (${result.reason}).`)
        return
      }
      setManifests(result.manifests)
      setSelectedAssetId(current => result.manifests.some(item => item.asset.asset_id === current)
        ? current : result.manifests[0]?.asset.asset_id || '')
      setPhase('ready')
      setMessage(`${result.manifests.length} pinned-source shared asset manifest(s) verified.`)
    } catch (error) {
      if (generationRef.current !== operation.generation || operation.abort.signal.aborted) return
      setPhase('error')
      setMessage(errorMessage(error))
    }
  }, [adapter, begin])

  const read = React.useCallback(async () => {
    if (!adapter || !localStore || !selectedAssetId) return
    const manifest = manifests.find(item => item.asset.asset_id === selectedAssetId)
    if (!manifest) return
    const operation = begin('reading')
    setMessage('Downloading, hashing, and atomically rehydrating the selected asset…')
    try {
      const result = await adapter.read({
        sourceId: XR_V2_PINNED_SOURCE_ID,
        assetId: selectedAssetId,
        localStore,
        manifest,
        signal: operation.abort.signal,
      })
      if (generationRef.current !== operation.generation) return
      if (result.status === 'deferred') {
        setPhase('deferred')
        setMessage(`Reopen deferred (${result.reason}); no partial local catalog entry was committed.`)
        return
      }
      await onImported(result.asset.asset_id)
      if (generationRef.current !== operation.generation) return
      setPhase('ready')
      setMessage('Verified bytes were atomically imported and reopened from local IndexedDB.')
    } catch (error) {
      if (generationRef.current !== operation.generation || operation.abort.signal.aborted) return
      setPhase('error')
      setMessage(errorMessage(error))
    }
  }, [adapter, begin, localStore, manifests, onImported, selectedAssetId])

  const busy = phase === 'publishing' || phase === 'listing' || phase === 'reading'
  const blocker = adapter?.config.promotionBlocker || XR_V2_CROSS_DEVICE_EXTERNAL_PROMOTION_BLOCKER
  return (
    <section
      className={cn('grid gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border)}
      aria-label="Existing Asset Contract Writer XR preview"
      data-kg-xr-v2-cross-device-panel="1"
      data-kg-xr-v2-cross-device-network-on-mount="false"
      data-kg-xr-v2-cross-device-phase={phase}
      data-kg-xr-v2-cross-device-production-ready={String(blocker.productionReady)}
      data-kg-xr-v2-cross-device-blocker={blocker.code}
    >
      <header>
        <strong className="text-[9px]">Existing Asset Contract Writer · explicit preview</strong>
        <p className={cn('m-0 text-[8px]', UI_THEME_TOKENS.text.tertiary)}>
          Local-first capture remains authoritative. Publish, refresh, and reopen are separate user actions.
        </p>
      </header>
      <div className="flex flex-wrap gap-1">
        <button type="button" className="App-toolbar__btn" disabled={busy || !adapter || !resource} onClick={() => void publish()} data-kg-xr-v2-cross-device-publish="1">
          <CloudUpload className="h-3 w-3" aria-hidden="true" /> Publish opened
        </button>
        <button type="button" className="App-toolbar__btn" disabled={busy || !adapter} onClick={() => void list()} data-kg-xr-v2-cross-device-list="1">
          <RefreshCw className="h-3 w-3" aria-hidden="true" /> Refresh shared
        </button>
        <button type="button" className="App-toolbar__btn" disabled={busy || !adapter || !localStore || !selectedAssetId} onClick={() => void read()} data-kg-xr-v2-cross-device-read="1">
          <CloudDownload className="h-3 w-3" aria-hidden="true" /> Reopen here
        </button>
      </div>
      {manifests.length ? (
        <select className="min-w-0 rounded border bg-transparent p-1 text-[8px]" value={selectedAssetId} onChange={event => setSelectedAssetId(event.target.value)} aria-label="Shared XR asset manifest">
          {manifests.map(manifest => <option key={manifest.asset.asset_id} value={manifest.asset.asset_id}>{manifest.asset.asset_id}</option>)}
        </select>
      ) : null}
      <p className={cn('m-0 text-[8px]', phase === 'error' ? UI_THEME_TOKENS.status.error : UI_THEME_TOKENS.text.tertiary)} role="status">{message}</p>
      <p className="m-0 rounded bg-amber-100 px-2 py-1 text-[8px] text-amber-900 dark:bg-amber-950/60 dark:text-amber-100">
        External promotion blocker: {blocker.message}
      </p>
    </section>
  )
}
