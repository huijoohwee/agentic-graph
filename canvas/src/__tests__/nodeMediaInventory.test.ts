import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HTML_VIEWER_RUNTIME_FULL } from '@/lib/graph/htmlViewer/runtimeTemplate.compiled'
import { buildNodeMediaInventory } from '@/components/GraphCanvas/helpers'

export function testBuildNodeMediaInventoryCountsKindsAcrossCanonicalMediaSpecs() {
  const inventory = buildNodeMediaInventory([
    {
      id: 'image',
      type: 'Image',
      label: 'Image',
      properties: { image: 'https://example.com/a.png' },
    },
    {
      id: 'svg',
      type: 'Image',
      label: 'SVG',
      properties: { media_kind: 'svg', media_url: 'https://example.com/a.svg' },
    },
    {
      id: 'video',
      type: 'Video',
      label: 'Video',
      properties: { video: 'https://example.com/a.mp4' },
    },
    {
      id: 'audio',
      type: 'Audio',
      label: 'Audio',
      properties: { media_kind: 'audio', media_url: 'https://example.com/a.mp3' },
    },
    {
      id: 'iframe',
      type: 'IFrame',
      label: 'IFrame',
      properties: { iframe_url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' },
    },
  ] as Parameters<typeof buildNodeMediaInventory>[0])

  if (inventory.totalCount !== 5) throw new Error(`expected 5 media nodes, got ${inventory.totalCount}`)
  if (inventory.imageCount !== 1) throw new Error(`expected 1 image node, got ${inventory.imageCount}`)
  if (inventory.svgCount !== 1) throw new Error(`expected 1 svg node, got ${inventory.svgCount}`)
  if (inventory.imageLikeCount !== 2) throw new Error(`expected 2 image-like nodes, got ${inventory.imageLikeCount}`)
  if (inventory.videoCount !== 1) throw new Error(`expected 1 video node, got ${inventory.videoCount}`)
  if (inventory.audioCount !== 1) throw new Error(`expected 1 audio node, got ${inventory.audioCount}`)
  if (inventory.iframeCount !== 1) throw new Error(`expected 1 iframe node, got ${inventory.iframeCount}`)
  if (inventory.rows.length !== 5) throw new Error(`expected 5 listed rows, got ${inventory.rows.length}`)
}

export function testBuildNodeMediaInventoryCanLimitRowsWithoutChangingListedStatsMode() {
  const inventory = buildNodeMediaInventory([
    {
      id: 'image:1',
      type: 'Image',
      label: 'Image 1',
      properties: { image: 'https://example.com/1.png' },
    },
    {
      id: 'image:2',
      type: 'Image',
      label: 'Image 2',
      properties: { image: 'https://example.com/2.png' },
    },
  ] as Parameters<typeof buildNodeMediaInventory>[0], {
    maxRows: 1,
    limitStatsToRows: true,
  })

  if (inventory.totalCount !== 1) throw new Error(`expected listed-only total count 1, got ${inventory.totalCount}`)
  if (inventory.imageLikeCount !== 1) throw new Error(`expected listed-only image-like count 1, got ${inventory.imageLikeCount}`)
  if (inventory.rows.length !== 1) throw new Error(`expected 1 listed row, got ${inventory.rows.length}`)
}

export function testMediaNodesSectionUsesSharedInventoryHelper() {
  const filePath = resolve(process.cwd(), 'src', 'features', 'panels', 'views', 'MediaNodesSection.tsx')
  const text = readFileSync(filePath, 'utf8')
  if (!text.includes('buildNodeMediaInventory')) {
    throw new Error('expected MediaNodesSection to use shared media inventory helper')
  }
  if (!text.includes('inventory.audioCount')) {
    throw new Error('expected MediaNodesSection to surface shared audio media counts')
  }
  if (!text.includes("MEDIA_NODES_STATS_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5'") || text.includes('grid grid-cols-5 gap-2')) {
    throw new Error('expected MediaNodesSection stats grid to use a mobile-first responsive owner')
  }
  if (text.includes('hasNodeMedia(n)')) {
    throw new Error('expected MediaNodesSection to remove local media node scan loop')
  }
}

export function testUseRichMediaOverlays2dUsesSharedInventoryHelperForMetrics() {
  const filePath = resolve(process.cwd(), 'src', 'components', 'GraphCanvasRoot', 'hooks', 'useRichMediaOverlays2d.ts')
  const text = readFileSync(filePath, 'utf8')
  if (!text.includes('const inventory = buildNodeMediaInventory(nodes)')) {
    throw new Error('expected useRichMediaOverlays2d metrics to use shared media inventory helper')
  }
  if (!text.includes('audioCount: inventory.audioCount')) {
    throw new Error('expected useRichMediaOverlays2d metrics to report shared audio media counts')
  }
  if (text.includes('let iframeCount = 0')) {
    throw new Error('expected useRichMediaOverlays2d to remove duplicated local media counters')
  }
}

export function testAudioMediaUsesSharedCardPanelAndHtmlViewerOwners() {
  const cardPreview = readFileSync(resolve(process.cwd(), 'src', 'lib', 'cards', 'CardMediaPreview.tsx'), 'utf8')
  const htmlViewer = readFileSync(resolve(process.cwd(), 'src', 'lib', 'graph', 'htmlViewer', 'buildGraphHtmlViewerMarkup.ts'), 'utf8')
  const htmlViewerRuntime = readFileSync(resolve(process.cwd(), 'src', 'lib', 'graph', 'htmlViewer', 'runtimeScript.ts'), 'utf8')
  const readPanel = (name: string) => readFileSync(resolve(process.cwd(), 'src', 'components', `${name}.tsx`), 'utf8')
  const richMediaPanel = readPanel('RichMediaPanelDirectMediaSurface')
  const htmlOverlay = readFileSync(resolve(process.cwd(), 'src', 'lib', 'graph', 'htmlViewer', 'htmlViewerOverlaySeeds.ts'), 'utf8')
  const htmlShell = readFileSync(resolve(process.cwd(), 'src', 'lib', 'graph', 'htmlViewer', 'htmlViewerDocumentShell.ts'), 'utf8')
  const richMediaOverlayLayer = readFileSync(resolve(process.cwd(), 'src', 'components', 'GraphCanvasRoot', 'components', 'RichMediaOverlayLayer2d.tsx'), 'utf8')
  const webpageLayoutToGraph = readFileSync(resolve(process.cwd(), 'src', 'lib', 'websites', 'webpageLayoutToGraph.ts'), 'utf8')
  const mediaLightboxPromptParameters = readFileSync(resolve(process.cwd(), 'src', 'lib', 'ui', 'mediaLightboxPromptParameters.ts'), 'utf8')
  const proceduralMediaGenerator = readFileSync(resolve(process.cwd(), 'src', 'features', 'command-menu', 'proceduralMediaGenerator.ts'), 'utf8')
  const commandMenuCatalogPanel = [
    'MediaCatalogPanel.tsx',
    'MediaCatalogPanelView.tsx',
    'mediaCatalogCandidateItems.tsx',
    'mediaCatalogListItems.tsx',
    'mediaCatalogShared.tsx',
    'mediaCatalogTypes.ts',
    'mediaCatalogUploadedFields.tsx',
    'mediaCatalogUploadedItems.tsx',
  ].map(fileName => readFileSync(resolve(process.cwd(), 'src', 'features', 'command-menu', fileName), 'utf8')).join('\n')

  if (!cardPreview.includes('data-kg-card-media-kind="audio"') || !cardPreview.includes('<audio')) {
    throw new Error('expected shared CardMediaPreview to render audio through the card media owner')
  }
  if (
    !cardPreview.includes('loading="lazy"') ||
    !cardPreview.includes('decoding="async"') ||
    !cardPreview.includes('data-kg-card-media-loading="lazy"') ||
    !cardPreview.includes('data-kg-card-media-preload="metadata"') ||
    !cardPreview.includes('preload="metadata"')
  ) {
    throw new Error('expected shared CardMediaPreview to keep lazy image decoding and metadata-only video/audio loading')
  }
  if (!readPanel('RichMediaPanel').includes('<RichMediaPanelSurface')
    || !readPanel('RichMediaPanelSurface').includes('<RichMediaPanelContentSurface')
    || !readPanel('RichMediaPanelContentSurface').includes('<RichMediaPanelDirectMediaSurface')
    || !richMediaPanel.includes("if (model.kind === 'audio')")
    || !richMediaPanel.includes('<CardMediaPreview') || !richMediaPanel.includes('kind={model.kind}')) {
    throw new Error('expected RichMediaPanel to render audio through shared CardMediaPreview')
  }
  // Count actual image opening tags, not selector strings containing the same marker.
  const thumbnails = ((commandMenuCatalogPanel.match(/<img\b[\s\S]*?\/>/g) || []) as string[])
    .filter(tag => tag.includes('data-kg-command-menu-media-thumbnail="1"'))
  if (thumbnails.length < 5 || thumbnails.some(tag => !tag.includes('loading="lazy"')
    || !tag.includes('decoding="async"') || !tag.includes('{...LOW_PRIORITY_MEDIA_THUMBNAIL_IMAGE_PROPS}'))
    || !commandMenuCatalogPanel.includes("fetchpriority: 'low'")) {
    throw new Error('expected every FloatingPanel Media thumbnail to use lazy loading, async decoding, and low fetch priority')
  }
  if (!richMediaOverlayLayer.includes("n.kind === 'audio'")) {
    throw new Error('expected D3 rich media overlay layer to preserve shared audio media kind')
  }
  if (!webpageLayoutToGraph.includes("t === 'AUDIO'") || !webpageLayoutToGraph.includes("tag === 'VIDEO' ? 'video' : 'audio'")) {
    throw new Error('expected webpage layout graph import to preserve audio media tags through shared media properties')
  }
  if (
    !mediaLightboxPromptParameters.includes('MEDIA_KIND_PARAMETER_OPTIONS') ||
    !mediaLightboxPromptParameters.includes("{ id: 'kind', label: 'Kind', value: 'video'") ||
    !proceduralMediaGenerator.includes("PROCEDURAL_MEDIA_ENGINE_ID = 'browser-native-procedural'") ||
    !proceduralMediaGenerator.includes('canvas.captureStream(VIDEO_FRAME_RATE)') ||
    !proceduralMediaGenerator.includes('new MediaRecorder(stream') ||
    !proceduralMediaGenerator.includes('encodeWav') ||
    proceduralMediaGenerator.toLowerCase().includes('mediabunny') ||
    !commandMenuCatalogPanel.includes('generateProceduralMediaArtifact') ||
    !commandMenuCatalogPanel.includes('buildProceduralMediaMarkdown') ||
    !commandMenuCatalogPanel.includes('buildVideoSequenceTimelineImportMarkdown') ||
    !commandMenuCatalogPanel.includes("status: 'local'") ||
    !commandMenuCatalogPanel.includes('setMarkdownDocument(`${artifact.fileName}.video-sequence.timeline.md`, sequenceText)')
  ) {
    throw new Error('expected Generate Media to create browser-native procedural image/audio/video artifacts and route video through the shared video-sequence timeline owner')
  }
  if (!htmlViewer.includes("from './htmlViewerOverlaySeeds'") || !htmlViewer.includes("from './htmlViewerDocumentShell'")
    || !htmlOverlay.includes('audio[src]') || !htmlShell.includes('.kg-mediaBody audio')) {
    throw new Error('expected exported HTML viewer to discover and style audio media nodes')
  }
  if (
    !htmlViewerRuntime.includes("from './runtimeTemplate.compiled'")
    || !HTML_VIEWER_RUNTIME_FULL.includes('querySelectorAll("iframe,img,video,audio,source")')
    || !HTML_VIEWER_RUNTIME_FULL.includes('.style.pointerEvents=')
  ) {
    throw new Error('expected exported HTML viewer runtime to preserve audio interactivity')
  }
}
