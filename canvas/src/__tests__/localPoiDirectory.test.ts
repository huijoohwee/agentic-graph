import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { GraphData } from '@/lib/graph/types'
import {
  limitLocalPoiVisibleFeatures,
  searchLocalPoiFeatures,
  validateLocalPoiGeoJson,
} from '@/features/geospatial/localPoiDirectoryModel'
import {
  buildLocalPoiDirectoryGraphData,
  getLocalPoiDirectoryDatasetSnapshot,
  publishLocalPoiDirectoryDataset,
  subscribeLocalPoiDirectoryDataset,
  type LocalPoiDirectoryDataset,
} from '@/features/geospatial/localPoiDirectoryRuntime'
import { buildGeospatialOverlayGraphData, mergeGraphDataUnique } from '@/features/geospatial/geospatialOverlayGraphData'
import { resolveSelectedGeoGraphNodeIds } from '../../../gympgrph/src/features/geospatial/selectedGraphFeatureIds'
import { buildLocalPoiGeoJsonDirectory } from '../../../scripts/geostack-local-geojson-build.mjs'

const makePlace = (id: string, name = 'Local Cafe') => ({
  type: 'Feature',
  id,
  properties: {
    name,
    category: 'shop',
    region: 'Central',
    source_ref: id.split(':')[1],
    updated: '2026-10-29',
    precision: 'exact',
    phone: '+65 8123 4567',
    private_note: 'must not be emitted',
  },
  geometry: { type: 'Point', coordinates: [103.85, 1.29] },
})

const makeRegion = () => ({
  type: 'Feature',
  id: 'pilot:region',
  properties: {
    name: 'Central Area',
    region: 'Central',
    source_ref: 'area-1',
    updated: '2026-10-29',
    precision: 'coarse',
    role: 'region',
  },
  geometry: { type: 'Polygon', coordinates: [[[103.8, 1.2], [103.9, 1.2], [103.9, 1.4], [103.8, 1.2]]] },
})

const makeInput = (features: unknown[] = [makePlace('pilot:place'), makeRegion()]) => {
  const text = JSON.stringify({ type: 'FeatureCollection', features })
  return { text, bytes: new TextEncoder().encode(text) }
}

const approval = {
  source: 'Synthetic pilot',
  license: 'CC BY 4.0',
  attribution: 'Synthetic pilot attribution',
  rightsAttested: true,
  publicFieldsReviewed: true,
  approvedExactPoints: true,
  approvedRegionPolygons: true,
}

async function withNoNetwork<T>(run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (() => { throw new Error('local POI workflow must not make network requests') }) as typeof fetch
  try {
    return await run()
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testLocalPoiGeoJsonApprovalAllowlistAndPrecisionContracts() {
  await withNoNetwork(async () => {
    const input = makeInput()
    const accepted = await validateLocalPoiGeoJson(input.text, input.bytes, approval)
    if ('error' in accepted) throw new Error(`Expected accepted local data, got ${accepted.error}`)
    const manifest = accepted.manifest
    if (manifest.pointCount !== 1 || manifest.regionCount !== 1 || manifest.withheldCount !== 0
      || manifest.inputBytes !== input.bytes.byteLength || manifest.outputBytes > 500_000
      || !/^[a-f0-9]{64}$/u.test(manifest.inputSha256) || !/^[a-f0-9]{64}$/u.test(manifest.outputSha256)) {
      throw new Error('Expected bounded byte counts, SHA-256 digests, and accepted/withheld counts')
    }
    if (manifest.sourceAsOf !== '2026-10-29' || manifest.categories.join(',') !== 'shop'
      || manifest.categoryCounts.shop !== 1) {
      throw new Error('Expected sorted category counts and latest source date in the manifest')
    }
    const place = accepted.featureCollection.features.find(feature => feature.properties.localPoiRole === 'place')
    if (!place || Object.keys(place.properties).some(key => ['phone', 'private_note'].includes(key))) {
      throw new Error('Expected the public allowlist to strip arbitrary and contact fields')
    }
    const withheld = await validateLocalPoiGeoJson(input.text, input.bytes, { ...approval, approvedExactPoints: false })
    if ('error' in withheld || withheld.manifest.pointCount !== 0 || withheld.manifest.withheldCount !== 1) {
      throw new Error('Expected an unapproved exact point to be withheld and counted')
    }
    const regionOnly = makeInput([makeRegion()])
    const regionApproval = await validateLocalPoiGeoJson(regionOnly.text, regionOnly.bytes, {
      ...approval,
      approvedExactPoints: false,
    })
    if ('error' in regionApproval || regionApproval.manifest.regionCount !== 1
      || regionApproval.manifest.operatorAttestations.exactPoints) {
      throw new Error('Expected coarse-region approval to remain independent from exact-point approval')
    }
    const declined = await validateLocalPoiGeoJson(input.text, input.bytes, { ...approval, publicFieldsReviewed: false })
    if (!('error' in declined)) throw new Error('Expected a declined public-field review to block import')
    const changedText = await validateLocalPoiGeoJson('{"type":"FeatureCollection","features":[]}', input.bytes, approval)
    if (!('error' in changedText) || !changedText.error.includes('does not match')) {
      throw new Error('Expected the parsed source text to match the exact hashed bytes')
    }
    const boundaryText = input.text + ' '.repeat(500_000 - input.bytes.byteLength)
    const boundary = await validateLocalPoiGeoJson(boundaryText, new TextEncoder().encode(boundaryText), approval)
    if ('error' in boundary || boundary.manifest.inputBytes !== 500_000) throw new Error('Expected exactly 500,000 input bytes to pass')
    const oversized = await validateLocalPoiGeoJson('x', new Uint8Array(500_001), approval)
    if (!('error' in oversized) || !oversized.error.includes('500 kB')) throw new Error('Expected input over 500,000 bytes to fail')
    const manyInput = makeInput(Array.from({ length: 55 }, (_, i) => makePlace(`pilot:place-${i + 1}`, `Cafe ${i + 1}`)))
    const many = await validateLocalPoiGeoJson(manyInput.text, manyInput.bytes, approval)
    if ('error' in many || searchLocalPoiFeatures(many.featureCollection, '', 'all').length !== 55
      || limitLocalPoiVisibleFeatures(searchLocalPoiFeatures(many.featureCollection, '', 'all')).length !== 50) {
      throw new Error('Expected search results to cap visible rows at 50 without truncating the dataset')
    }
  })
}

export function testLocalPoiDirectoryProjectsApprovedFeaturesIntoMapGraph() {
  const input = makeInput()
  const sourceBytes = input.bytes
  const text = input.text
  return validateLocalPoiGeoJson(text, sourceBytes, approval).then(result => {
    if ('error' in result) throw new Error(result.error)
    const dataset = { featureCollection: result.featureCollection, manifest: result.manifest }
    const prior = getLocalPoiDirectoryDatasetSnapshot()
    let notifications = 0
    const unsubscribe = subscribeLocalPoiDirectoryDataset(() => { notifications += 1 })
    try {
      publishLocalPoiDirectoryDataset(dataset)
      if (notifications !== 1) throw new Error('Expected dataset subscribers to observe the validated import')
      const projected = buildLocalPoiDirectoryGraphData(dataset)
      if (!projected) throw new Error('Expected accepted local features to project into the shared graph')
      const base: GraphData = {
        type: 'Graph',
        context: 'markdown',
        metadata: { kgGeospatialAreaFeatures: { type: 'FeatureCollection', features: [] } },
        nodes: [{ id: 'note:one', type: 'Note', label: 'Existing note', properties: {} }],
        edges: [],
      }
      const merged = mergeGraphDataUnique(base, projected)
      const repeated = mergeGraphDataUnique(merged, projected)
      const places = (repeated.nodes || []).filter(node => (node.properties as Record<string, unknown>)?.kgSourceFeatureId === 'pilot:place')
      const region = (repeated.nodes || []).find(node => (node.properties as Record<string, unknown>)?.localPoiRole === 'region')
      const areaCollection = repeated.metadata?.kgGeospatialAreaFeatures as { features?: Array<{ id?: unknown }> } | undefined
      if (places.length !== 1 || region?.properties?.geo !== undefined
        || areaCollection?.features?.length !== 1 || areaCollection.features[0]?.id !== 'pilot:region'
        || !repeated.nodes?.some(node => node.id === 'note:one')) {
        throw new Error('Expected deduplicated place projection, coarse area context, and preserved existing graph nodes')
      }
    } finally {
      publishLocalPoiDirectoryDataset(prior)
      unsubscribe()
    }
  })
}

export function testLocalPoiDirectorySelectionResolvesCurrentDatasetFeatures() {
  const placeNode = {
    id: 'geo:pilot-place',
    properties: { kgSourceFeatureId: 'pilot:place' },
  }
  const panelNode = {
    id: 'rich-media:poi',
    properties: { richMediaPoiProperties: { kgSourceFeatureId: 'pilot:place' } },
  }
  const selected = resolveSelectedGeoGraphNodeIds({ nodes: [placeNode, panelNode] }, new Set(['rich-media:poi']))
  if (!selected.has('geo:pilot-place') || !selected.has('rich-media:poi')) {
    throw new Error('Expected selected Rich Media provenance to highlight its source map feature')
  }
  const canvasRoot = process.cwd()
  const toolbar = readFileSync(resolve(canvasRoot, 'src/lib/toolbar/ToolbarToolMenuGeoView.tsx'), 'utf8')
  const directory = readFileSync(resolve(canvasRoot, 'src/features/maps/LocalPoiDirectory.tsx'), 'utf8')
  const host = readFileSync(resolve(canvasRoot, '../gympgrph/src/GeospatialHost.tsx'), 'utf8')
  const affordances = readFileSync(resolve(canvasRoot, '../gympgrph/src/features/geospatial/graphFeatureAffordances.ts'), 'utf8')
  const basemap = readFileSync(resolve(canvasRoot, '../gympgrph/src/features/geospatial/useMapLibreBasemap.ts'), 'utf8')
  if (!toolbar.includes('findMapFeatureNode(localPoiGraphData')
    || !toolbar.includes('selectedMapFeatureId={selectedMapFeatureId}')
    || !directory.includes('onGraphMapFeatureSelected')
    || !directory.includes('onSelectMapFeature(String(featureId)')) {
    throw new Error('Expected directory-list selection and map selection to share the current stable source ID')
  }
  if (!host.includes("properties.localPoiRole === 'place'")
    || !host.includes('emitGraphMapFeatureSelected({ sourceFeatureId, graphFeatureId })')
    || !host.includes('bindGraphFeatureAffordances({')
    || !affordances.includes("doc.createElement('button')")) {
    throw new Error('Expected map pointer and keyboard selection to use the shared graph selection owner')
  }
  if (!basemap.includes('nearbyFeatures.some(isGraphOverlayFeature)')
    || !basemap.includes('!isCoarseRegionFeature(f)')) {
    throw new Error('Expected local graph features and coarse regions not to be intercepted as provider POIs')
  }
}

export async function testLocalPoiGeoJsonBuilderIsLocalBoundedAndNoOverwrite() {
  await withNoNetwork(async () => {
    const root = await mkdtemp(join(tmpdir(), 'local-poi-directory-'))
    try {
      const inputPath = join(root, 'input.geojson')
      const input = makeInput([makePlace('pilot:builder')])
      await writeFile(inputPath, input.bytes)
      const outputPath = join(root, 'new-output')
      const built = await buildLocalPoiGeoJsonDirectory({
        inputPath,
        outputPath,
        source: approval.source,
        license: approval.license,
        attribution: approval.attribution,
        attestRights: true,
        attestPublicFields: true,
        approveExactPoints: true,
      })
      const geoJsonBytes = await readFile(join(outputPath, 'geostack-allowlisted.geojson'))
      const manifest = JSON.parse(await readFile(join(outputPath, 'manifest.json'), 'utf8')) as { outputSha256: string; outputBytes: number }
      const expectedHash = createHash('sha256').update(geoJsonBytes).digest('hex')
      if (built.manifest.outputSha256 !== expectedHash || manifest.outputSha256 !== expectedHash
        || manifest.outputBytes !== geoJsonBytes.byteLength || geoJsonBytes.byteLength > 500_000) {
        throw new Error('Expected builder outputs to bind exact normalized bytes, size, and digest')
      }
      const collisionPath = join(root, 'existing-output')
      await mkdir(collisionPath)
      await writeFile(join(collisionPath, 'sentinel.txt'), 'preserve this byte')
      let refused = false
      try {
        await buildLocalPoiGeoJsonDirectory({
          inputPath,
          outputPath: collisionPath,
          source: approval.source,
          license: approval.license,
          attribution: approval.attribution,
          attestRights: true,
          attestPublicFields: true,
          approveExactPoints: true,
        })
      } catch {
        refused = true
      }
      const sentinel = await readFile(join(collisionPath, 'sentinel.txt'), 'utf8')
      if (!refused || sentinel !== 'preserve this byte') throw new Error('Expected no-overwrite failure to preserve existing output')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}
