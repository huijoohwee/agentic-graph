import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { normalizeComposedSourcePath } from '@/features/source-files/composedSourceSelection'
import {
  buildActiveGeoStackPlacesPreview,
  limitLocalPoiVisibleFeatures,
  LOCAL_POI_MAX_BYTES,
  searchLocalPoiFeatures,
  validateLocalPoiGeoJson,
} from '@/features/geospatial/localPoiDirectoryModel'
import {
  getLocalPoiDirectoryDatasetSnapshot,
  publishLocalPoiDirectoryDataset,
  subscribeLocalPoiDirectoryDataset,
  type LocalPoiDirectoryDataset,
} from '@/features/geospatial/localPoiDirectoryRuntime'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

function downloadLocalFile(name: string, contents: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function LocalPoiDirectory({ onSelectMapFeature, selectedMapFeatureId, selectionSource }: {
  onSelectMapFeature?: (featureId: string) => boolean | Promise<boolean>
  selectedMapFeatureId?: string | null
  selectionSource?: string | null
}) {
  const { markdownDocumentName, markdownDocumentText, sourceFiles } = useGraphStore(useShallow(state => ({
    markdownDocumentName: String(state.markdownDocumentName || ''),
    markdownDocumentText: String(state.markdownDocumentText || ''),
    sourceFiles: state.sourceFiles,
  })))
  const activeSourcePath = normalizeComposedSourcePath(markdownDocumentName)
  const canonicalSourcePath = 'docs/workspace-seeds/agentic-graph-maps-places.md'
  const canonicalSources = (Array.isArray(sourceFiles) ? sourceFiles : []).filter(file =>
    normalizeComposedSourcePath(file?.source?.path || file?.name) === canonicalSourcePath,
  )
  const [workspacePreviewText, setWorkspacePreviewText] = useState('')
  useEffect(() => {
    if (activeSourcePath || canonicalSources.length > 0) {
      setWorkspacePreviewText('')
      return
    }
    let canceled = false
    void import('@/features/workspace-fs/workspaceFs').then(async ({ getWorkspaceFs }) => {
      const fs = await getWorkspaceFs()
      const text = await fs.readFileText(`/${canonicalSourcePath}`)
      if (!canceled) setWorkspacePreviewText(typeof text === 'string' ? text : '')
    }).catch(() => {
      if (!canceled) setWorkspacePreviewText('')
    })
    return () => { canceled = true }
  }, [activeSourcePath, canonicalSources.length])
  const activeMarkdownText = activeSourcePath
    ? markdownDocumentText
    : canonicalSources.length === 1
      ? String(canonicalSources[0]?.text || '')
      : canonicalSources.length === 0 ? workspacePreviewText : ''
  const previewSourcePath = activeSourcePath || (activeMarkdownText ? canonicalSourcePath : '')
  const [source, setSource] = useState('')
  const [license, setLicense] = useState('')
  const [attribution, setAttribution] = useState('')
  const [rightsAttested, setRightsAttested] = useState(false)
  const [publicFieldsReviewed, setPublicFieldsReviewed] = useState(false)
  const [approvedExactPoints, setApprovedExactPoints] = useState(false)
  const [approvedRegionPolygons, setApprovedRegionPolygons] = useState(false)
  const dataset = useSyncExternalStore(
    subscribeLocalPoiDirectoryDataset,
    getLocalPoiDirectoryDatasetSnapshot,
    () => null,
  ) as LocalPoiDirectoryDataset | null
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [selectedId, setSelectedId] = useState<string | number | null>(null)
  const [mapSelectionMessage, setMapSelectionMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const loadGeneration = useRef(0)
  const mapSelectionGeneration = useRef(0)
  const sourcePreview = useMemo(
    () => buildActiveGeoStackPlacesPreview(previewSourcePath, activeMarkdownText),
    [activeMarkdownText, previewSourcePath],
  )
  const featureCollection = dataset?.featureCollection ?? sourcePreview
  const isSyntheticSourcePreview = !dataset && sourcePreview !== null

  useEffect(() => () => {
    loadGeneration.current += 1
    mapSelectionGeneration.current += 1
  }, [])

  const matches = useMemo(() => featureCollection
    ? searchLocalPoiFeatures(featureCollection, query, category)
    : [], [category, featureCollection, query])
  const selectedFeature = featureCollection?.features.find(feature => feature.id === selectedId) ?? null
  const categories = useMemo(() => dataset?.manifest.categories ?? [...new Set(
    (sourcePreview?.features || []).filter(feature => feature.properties.localPoiRole === 'place')
      .map(feature => feature.properties.category),
  )].sort(), [dataset, sourcePreview])
  const visibleMatches = limitLocalPoiVisibleFeatures(matches)

  useEffect(() => {
    if (selectedId !== null
      && !matches.some(feature => feature.id === selectedId)
      && selectedMapFeatureId !== String(selectedId)) {
      mapSelectionGeneration.current += 1
      setSelectedId(null)
      setMapSelectionMessage('')
    }
  }, [matches, selectedId, selectedMapFeatureId])

  useEffect(() => {
    const selectedFeature = selectedMapFeatureId === null || selectedMapFeatureId === undefined
      ? null
      : featureCollection?.features.find(feature => String(feature.id ?? '') === selectedMapFeatureId) ?? null
    const nextId = selectedFeature?.id ?? null
    setSelectedId(current => current === nextId ? current : nextId)
    setMapSelectionMessage(nextId === null
      ? ''
      : selectionSource === 'toolbar' ? 'Selected on the shared map.' : 'Selected from Canvas.')
  }, [featureCollection, selectedMapFeatureId, selectionSource])

  const selectFeature = useCallback((featureId: string | number | null) => {
    setSelectedId(featureId)
    const generation = ++mapSelectionGeneration.current
    if (featureId === null) {
      setMapSelectionMessage('')
      return
    }
    if (!onSelectMapFeature) {
      setMapSelectionMessage('This record is not available as a selectable map point.')
      return
    }
    setMapSelectionMessage('Selecting on the shared map…')
    void Promise.resolve().then(() => onSelectMapFeature(String(featureId))).then(selectedOnMap => {
      if (generation !== mapSelectionGeneration.current) return
      setMapSelectionMessage(selectedOnMap
        ? 'Selected on the shared map.'
        : 'This record is not available as a selectable map point.')
    }).catch(() => {
      if (generation === mapSelectionGeneration.current) {
        setMapSelectionMessage('This record could not be selected on the active map.')
      }
    })
  }, [onSelectMapFeature])

  useEffect(() => {
    if (!dataset) return
    let canceled = false
    let dispose = () => undefined
    void import('gympgrph').then(module => {
      if (canceled) return
      const map = module.readActiveMapLibreMap?.()
      if (!map || typeof module.bindGraphFeatureAffordances !== 'function') return
      dispose = module.bindGraphFeatureAffordances({
        features: dataset.featureCollection.features.filter(feature => feature.properties.localPoiRole === 'place'),
        map,
        selectedFeatureIds: new Set(selectedId === null ? [] : [String(selectedId)]),
        onActivate: feature => selectFeature(feature.id ?? feature.properties?.id ?? null),
      })
    }).catch(() => undefined)
    return () => {
      canceled = true
      dispose()
    }
  }, [dataset, selectFeature, selectedId])

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    const generation = ++loadGeneration.current
    setError(null)
    setLoading(false)
    if (!file) return
    if (file.size <= 0 || file.size > LOCAL_POI_MAX_BYTES) {
      setError('Choose a GeoJSON file of 500 kB or less.')
      return
    }
    setLoading(true)
    try {
      const sourceBytes = new Uint8Array(await file.arrayBuffer())
      const text = new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes)
      if (generation !== loadGeneration.current) return
      const result = await validateLocalPoiGeoJson(text, sourceBytes, {
        source,
        license,
        attribution,
        rightsAttested,
        publicFieldsReviewed,
        approvedExactPoints,
        approvedRegionPolygons,
      })
      if (generation !== loadGeneration.current) return
      if ('error' in result) {
        setError(result.error)
        return
      }
      publishLocalPoiDirectoryDataset({ featureCollection: result.featureCollection, manifest: result.manifest })
      setSelectedId(null)
      setMapSelectionMessage('')
      setCategory('all')
      setQuery('')
    } catch {
      if (generation === loadGeneration.current) setError('The local file must be readable UTF-8 GeoJSON.')
    } finally {
      if (generation === loadGeneration.current) setLoading(false)
    }
  }

  return (
    <section
      className={`p-2 space-y-3 text-xs ${UI_THEME_TOKENS.text.primary}`}
      aria-labelledby="local-poi-directory-title"
    >
      <header>
        <h3 id="local-poi-directory-title" className="font-semibold mb-1">Local POI Directory</h3>
        <p className="opacity-70">
          {isSyntheticSourcePreview
            ? 'Showing the synthetic places embedded in the selected demo document. This read-only preview creates no operator attestations or release manifest.'
            : 'Load an operator-reviewed GeoJSON file locally. Accepted points appear on the shared Geo map and can be selected from this directory.'}
        </p>
      </header>

      <details open={!isSyntheticSourcePreview || Boolean(dataset)} className="rounded border border-white/15 p-2">
        <summary className="cursor-pointer font-medium">Load operator-reviewed local GeoJSON</summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-2">
            <label className="grid gap-1" htmlFor="local-poi-source">
              <span>Data source</span>
              <input id="local-poi-source" value={source} onChange={event => setSource(event.target.value)} disabled={loading} className="rounded border border-white/20 bg-black/20 px-2 py-1" />
            </label>
            <label className="grid gap-1" htmlFor="local-poi-license">
              <span>License</span>
              <input id="local-poi-license" value={license} onChange={event => setLicense(event.target.value)} disabled={loading} className="rounded border border-white/20 bg-black/20 px-2 py-1" />
            </label>
            <label className="grid gap-1" htmlFor="local-poi-attribution">
              <span>Required attribution</span>
              <input id="local-poi-attribution" value={attribution} onChange={event => setAttribution(event.target.value)} disabled={loading} className="rounded border border-white/20 bg-black/20 px-2 py-1" />
            </label>
          </div>

          <fieldset className="grid gap-2 rounded border border-white/15 p-2">
            <legend className="px-1">Operator review</legend>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={rightsAttested} onChange={event => setRightsAttested(event.target.checked)} disabled={loading} />
              <span>I have rights to use the file and will show its required attribution.</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={publicFieldsReviewed} onChange={event => setPublicFieldsReviewed(event.target.checked)} disabled={loading} />
              <span>Allowed names and fields contain no personal names or contact details.</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={approvedRegionPolygons} onChange={event => setApprovedRegionPolygons(event.target.checked)} disabled={loading} />
              <span>Polygons marked role=region and precision=coarse are approved area boundaries for this local preview.</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={approvedExactPoints} onChange={event => setApprovedExactPoints(event.target.checked)} disabled={loading} />
              <span>Point records marked precision=exact may be shown at exact coordinates in this local preview.</span>
            </label>
          </fieldset>
          <p className="opacity-70">Parsing, review, and export stay on this device. These attestations are recorded in the manifest; they do not verify legal rights or authorize public release.</p>

          <label className="grid gap-1" htmlFor="local-poi-file">
            <span>GeoJSON FeatureCollection (maximum 500 kB)</span>
            <input
              id="local-poi-file"
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              onChange={handleFileChange}
              disabled={loading}
              className="w-full"
            />
          </label>
          <p className="opacity-70">
            Place records need id (source:id), name, category (shop, store, f&amp;b, plantation, or property), region, updated date, and precision=exact. Region polygons need role=region and precision=coarse. Source and license_ref use the review fields when omitted. Coarse point records are withheld until a generalization rule is defined.
          </p>
          <p className="opacity-70">Metadata and approvals are captured when the file is loaded. Change them before selecting the file.</p>
        </div>
      </details>

      {loading ? <p role="status">Reading and validating locally…</p> : null}
      {error ? <p role="alert" className="text-red-300">{error}</p> : null}

      {featureCollection ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="grid gap-1" htmlFor="local-poi-search">
              <span>Search places and regions</span>
              <input
                id="local-poi-search"
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                autoComplete="off"
                className="rounded border border-white/20 bg-black/20 px-2 py-1"
              />
            </label>
            <label className="grid gap-1" htmlFor="local-poi-category">
              <span>Category</span>
              <select id="local-poi-category" value={category} onChange={event => setCategory(event.target.value)} className="rounded border border-white/20 bg-black/20 px-2 py-1">
                <option value="all">All categories</option>
                {categories.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>

          <p aria-live="polite">{matches.length} matching features. Region polygons stay on the map as coarse context.</p>
          <div className="max-h-40 overflow-auto rounded border border-white/15" aria-label="Search results">
            {visibleMatches.length > 0 ? visibleMatches.map(feature => feature.properties.localPoiRole === 'region' ? (
              <div key={String(feature.id)} className="border-b border-white/10 px-2 py-2">
                <span className="block font-medium">{feature.properties.name}</span>
                <span className="opacity-70">Coarse region context · not a selectable place</span>
              </div>
            ) : (
              <button
                key={String(feature.id)}
                type="button"
                aria-pressed={selectedId === feature.id}
                onClick={() => selectFeature(feature.id ?? null)}
                className={`block w-full border-b border-white/10 px-2 py-2 text-left hover:bg-white/10 ${selectedId === feature.id ? 'bg-white/10' : ''}`}
              >
                <span className="block font-medium">{feature.properties.name}</span>
                <span className="opacity-70">{feature.properties.category} · place</span>
              </button>
            )) : <p className="p-2 opacity-70">No local matches.</p>}
            {matches.length > visibleMatches.length ? <p className="p-2 opacity-70">Showing the first 50 results. Narrow the search to find a place.</p> : null}
          </div>

          {selectedFeature ? (
            <p aria-live="polite">
              <strong>{selectedFeature.properties.name}</strong> · {selectedFeature.properties.category}
              {mapSelectionMessage ? ` · ${mapSelectionMessage}` : ''}
            </p>
          ) : null}

          {dataset ? (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 rounded border border-white/15 p-2">
                <dt>Source</dt><dd>{dataset.manifest.source}</dd>
                <dt>License</dt><dd>{dataset.manifest.license}</dd>
                <dt>Attribution</dt><dd>{dataset.manifest.attribution}</dd>
                <dt>Points / regions</dt><dd>{dataset.manifest.pointCount} / {dataset.manifest.regionCount}</dd>
                <dt>Category counts</dt><dd>{Object.entries(dataset.manifest.categoryCounts).map(([name, count]) => `${name}: ${count}`).join(', ') || 'None'}</dd>
                <dt>Withheld</dt><dd>{dataset.manifest.withheldCount} features</dd>
                <dt>Manifest</dt><dd>{dataset.manifest.schema}; {dataset.manifest.inputBytes} → {dataset.manifest.outputBytes} bytes</dd>
                <dt>SHA-256</dt><dd>input {dataset.manifest.inputSha256.slice(0, 12)}… / output {dataset.manifest.outputSha256.slice(0, 12)}…</dd>
              </dl>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => downloadLocalFile('geostack-allowlisted.geojson', JSON.stringify(dataset.featureCollection), 'application/geo+json')}
                  className="rounded border border-white/20 px-2 py-2 hover:bg-white/10"
                >
                  Download allowlisted GeoJSON
                </button>
                <button
                  type="button"
                  onClick={() => downloadLocalFile('geostack-manifest.json', `${JSON.stringify(dataset.manifest, null, 2)}\n`, 'application/json')}
                  className="rounded border border-white/20 px-2 py-2 hover:bg-white/10"
                >
                  Download provenance manifest
                </button>
                <button
                  type="button"
                  onClick={() => publishLocalPoiDirectoryDataset(null)}
                  className="rounded border border-white/20 px-2 py-2 hover:bg-white/10"
                >
                  Clear local dataset
                </button>
              </div>
              <p className="opacity-70">The allowlisted file stays in this browser session until cleared, replaced, or refreshed. Downloads do not publish or deploy data.</p>
            </>
          ) : isSyntheticSourcePreview ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 rounded border border-white/15 p-2">
              <dt>Source</dt><dd>geostack-synthetic-demo</dd>
              <dt>License</dt><dd>generated-demo-data</dd>
              <dt>Attribution</dt><dd>{featureCollection.attribution}</dd>
              <dt>Places / coarse regions</dt><dd>{featureCollection.features.filter(feature => feature.properties.localPoiRole === 'place').length} / {featureCollection.features.filter(feature => feature.properties.localPoiRole === 'region').length}</dd>
              <dt>Review status</dt><dd>Embedded synthetic demo; no operator attestation</dd>
            </dl>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
