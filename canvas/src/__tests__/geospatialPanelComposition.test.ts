import fs from 'node:fs'
import path from 'node:path'

const readUtf8 = (absolutePath: string): string => fs.readFileSync(absolutePath, 'utf8')

const expectSourceMarker = (source: string, marker: string, message: string): void => {
  if (!source.includes(marker)) throw new Error(message)
}

export const testGeospatialPanelCompositionSplit = () => {
  const packageSourceRoot = path.resolve(process.cwd(), '..', 'gympgrph', 'src')
  const sourceByOwner = {
    host: readUtf8(path.join(packageSourceRoot, 'GeospatialPanelHost.tsx')),
    display: readUtf8(path.join(packageSourceRoot, 'GeospatialPanelDisplayControls.tsx')),
    dataset: readUtf8(path.join(packageSourceRoot, 'GeospatialPanelDatasetControls.tsx')),
    ui: readUtf8(path.join(packageSourceRoot, 'geospatialPanelUi.tsx')),
  }
  const combinedSource = Object.values(sourceByOwner).join('\n')

  for (const [owner, source] of Object.entries(sourceByOwner)) {
    const lineCount = source.split(/\r?\n/).length
    if (lineCount > 600) throw new Error(`Expected Geo panel ${owner} owner below 600 lines; found ${lineCount}`)
  }

  expectSourceMarker(
    sourceByOwner.ui,
    "from 'grph-shared/ui/keyTypeValueRows'",
    'Expected Geo panel primitives to reuse the shared KTV row class contract',
  )
  expectSourceMarker(
    sourceByOwner.ui,
    'KTV_KEY_TYPE_VALUE_GRID_CLASS_NAME',
    'Expected Geo panel rows to share the MainPanel key/type/value grid',
  )
  expectSourceMarker(
    sourceByOwner.host,
    'coercePanelTypography',
    'Expected Geo panel composition to derive typography from the shared contract',
  )
  for (const marker of ['GeoPanelKtvRow', 'GeospatialPanelDisplayControls', 'GeospatialPanelDatasetControls']) {
    expectSourceMarker(
      sourceByOwner.host,
      marker,
      `Expected GeospatialPanelHost to compose ${marker}`,
    )
  }
  for (const marker of ['keyNode="Key"', 'typeNode="Type"', 'valueNode="Value"']) {
    expectSourceMarker(sourceByOwner.host, marker, `Expected Geo panel header marker ${marker}`)
  }
  expectSourceMarker(
    sourceByOwner.ui,
    'GeoPanelTypeIconRenderContext',
    'Expected Geo panel Type cells to use the upstream icon context',
  )
  expectSourceMarker(
    sourceByOwner.ui,
    'renderTypeIcon({ typeLabel })',
    'Expected Geo panel Type cells to render through the upstream icon renderer',
  )
  expectSourceMarker(
    sourceByOwner.display,
    'GeoPanelSection title="Basemap"',
    'Expected the display owner to render basemap controls',
  )
  for (const marker of [
    'keyNode="Style URL"',
    'Fit to data',
    'Use current location',
    '2D (MapLibre, Classic)',
    '2D (MapLibre, Modern)',
    '3D (MapLibre, Classic)',
    '3D (MapLibre, Modern)',
    '2D (SVG, fallback)',
    'Apply Point Style',
    'Reset Point Style',
  ]) {
    expectSourceMarker(sourceByOwner.display, marker, `Expected display control marker ${marker}`)
  }
  expectSourceMarker(
    sourceByOwner.host,
    'enhancedLayerCatalog?: React.ReactNode',
    'Expected a typed enhanced-layer catalog composition seam',
  )
  expectSourceMarker(
    sourceByOwner.dataset,
    '{props.enhancedLayerCatalog}',
    'Expected Dataset controls to render the enhanced-layer catalog',
  )
  const catalogIndex = sourceByOwner.dataset.indexOf('{props.enhancedLayerCatalog}')
  const boundsIndex = sourceByOwner.dataset.indexOf('keyNode="Timeout"')
  if (catalogIndex < 0 || boundsIndex < 0 || catalogIndex > boundsIndex) {
    throw new Error('Expected enhanced-layer catalog controls before global dataset bounds')
  }
  if (combinedSource.includes('showDatasetsManager')) {
    throw new Error('Expected the dead showDatasetsManager compatibility prop to be removed')
  }
  if (combinedSource.includes("from 'lucide-react'")) {
    throw new Error('Expected Geo panel controls to reuse the upstream icon library renderer')
  }
  if (
    combinedSource.includes('GeoViewModeChoice')
    || combinedSource.includes('geospatialPanelCardClassName')
    || combinedSource.includes('grid grid-cols-1 gap-2 sm:grid-cols-6')
  ) {
    throw new Error('Expected Geo panel composition to avoid stale card/grid layout paths')
  }
}
