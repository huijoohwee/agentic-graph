import { listMediaOverlayNodes } from '@/lib/render/mediaOverlayPool'

export async function testMediaOverlayPoolPrioritizesFormatHintImagesWithinBudget() {
  const nodes: any[] = Array.from({ length: 60 }).map((_, i) => {
    return {
      id: `img:${i + 1}`,
      type: 'Image',
      label: `Image ${i + 1}`,
      properties: { media_url: `https://example.com/img-${i + 1}.png` },
    }
  })
  nodes.push({
    id: 'format-hint:1',
    type: 'Link',
    label: 'Format hinted image',
    properties: {
      url: 'https://assets.example/images/640?asset_fmt=png&source=article',
      label: 'Format hinted image',
    },
  })

  const out = listMediaOverlayNodes({ enabled: true, nodes: nodes as any, poolMax: 24 })
  const hasFormatHintedImage = out.some(n => n.kind === 'image' && n.url.includes('assets.example/images/640') && n.url.includes('asset_fmt=png'))
  if (!hasFormatHintedImage) throw new Error('expected format-hinted image to be prioritized into overlay pool budget')
}

export async function testMediaOverlayPoolAlwaysIncludesPreferredNodesWhenMedia() {
  const nodes: any[] = Array.from({ length: 80 }).map((_, i) => {
    return {
      id: `img:${i + 1}`,
      type: 'Image',
      label: `Image ${i + 1}`,
      properties: { media_url: `https://example.com/img-${i + 1}.png` },
    }
  })
  nodes.push({
    id: 'preferred:format-hint',
    type: 'Link',
    label: 'Preferred image',
    properties: {
      url: 'https://assets.example/images/640?asset_fmt=png&source=article',
      label: 'cover',
    },
  })

  const out = listMediaOverlayNodes({
    enabled: true,
    nodes: nodes as any,
    poolMax: 6,
    preferredNodeIds: ['preferred:format-hint'],
  })
  if (!out.some(n => n.id === 'preferred:format-hint')) {
    throw new Error('expected preferred media node to be included even when poolMax is small')
  }
}

export async function testMediaOverlayPoolDeduplicatesByKindAndUrl() {
  const nodes: any[] = [
    {
      id: 'p:1',
      type: 'Paragraph',
      label: 'Paragraph',
      properties: {
        text: '[YouTube](https://youtu.be/XzzPRQRDcDw?t=2997)',
      },
    },
    {
      id: 'link:1',
      type: 'Link',
      label: 'YouTube',
      properties: {
        url: 'https://youtu.be/XzzPRQRDcDw?t=2997',
        label: 'YouTube',
        media_kind: 'iframe',
        iframe_url: 'https://www.youtube-nocookie.com/embed/XzzPRQRDcDw?start=2997',
        media_url: 'https://www.youtube-nocookie.com/embed/XzzPRQRDcDw?start=2997',
        media: 'https://www.youtube-nocookie.com/embed/XzzPRQRDcDw?start=2997',
        media_interactive: true,
      },
    },
  ]

  const out = listMediaOverlayNodes({ enabled: true, nodes: nodes as any, poolMax: 24 })
  const iframeCount = out.filter(n => n.kind === 'iframe').length
  if (iframeCount !== 1) throw new Error(`expected 1 iframe panel after dedupe, got ${iframeCount}`)
}

export async function testMediaOverlayPoolDeduplicatesProxyWrappedMediaUrlsToSingleCanonicalWidgetVersion() {
  const raw = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/640px-Example.jpg'
  const nodes: any[] = [
    {
      id: 'byteplus-video-widget',
      type: 'VideoGeneration',
      label: 'ByteDance-Seedance-1.0-pro-fast BytePlus Video Widget',
      properties: {
        media_url: raw,
        imageUrl: raw,
      },
    },
    {
      id: 'rich-media-panel',
      type: 'RichMediaPanel',
      label: 'Rich Media Panel',
      properties: {
        media_url: `/__fetch_remote?url=${encodeURIComponent(raw)}`,
        imageUrl: `/__fetch_remote?url=${encodeURIComponent(raw)}`,
      },
    },
  ]
  const connectedValuesByNodeId = new Map<string, any>([
    ['rich-media-panel', {
      'properties.imageUrl': {
        value: raw,
        sources: [{ edgeId: 'edge-1', nodeId: 'byteplus-video-widget', portKey: 'videoUrl' }],
      },
    }],
  ])
  const out = listMediaOverlayNodes({
    enabled: true,
    nodes: nodes as any,
    poolMax: 24,
    connectedValuesByNodeId,
  })
  if (out.length !== 1) throw new Error(`expected one canonical media overlay after proxy unwrap dedupe, got ${out.length}`)
  if (out[0]?.id !== 'rich-media-panel') throw new Error(`expected canonical Rich Media Panel version to win dedupe, got ${out[0]?.id || '<none>'}`)
  if (String(out[0]?.title || '') !== 'Rich Media Panel') {
    throw new Error(`expected canonical Rich Media Panel title to stay on the shared panel SSOT, got ${String(out[0]?.title || '<none>')}`)
  }
}

export async function testMediaOverlayPoolAppliesConnectedTextToRichMediaPanelShellBeforeSpecSelection() {
  const nodes: any[] = [
    {
      id: 'panel-1',
      type: 'RichMediaPanel',
      label: 'Rich Media Panel',
      properties: {
        'flow:widgetTypeId': 'default',
        'flow:widgetFormId': 'richMediaPanel',
      },
    },
  ]
  const connectedValuesByNodeId = new Map<string, any>([
    ['panel-1', {
      'properties.output': {
        value: 'Generated text output from OpenAI Text Widget.',
        sources: [{ edgeId: 'edge-1', nodeId: 'w-openai-text', portKey: 'text_out' }],
      },
    }],
  ])
  const out = listMediaOverlayNodes({
    enabled: true,
    nodes: nodes as any,
    poolMax: 24,
    connectedValuesByNodeId,
  })
  if (out.length !== 1) throw new Error(`expected one rich media overlay panel, got ${out.length}`)
  if (String(out[0]?.kind || '') !== 'iframe') throw new Error(`expected connected text panel to render as iframe, got ${String(out[0]?.kind || '<none>')}`)
  if (!String(out[0]?.srcDoc || '').includes('Generated text output from OpenAI Text Widget.')) {
    throw new Error('expected connected text output to be materialized into panel srcDoc before overlay spec selection')
  }
}

export async function testMediaOverlayPoolPrefersCanonicalOutputSourceUrlForGeneratedVideoOpenTarget() {
  const nodes: any[] = [
    {
      id: 'rich-media-panel-video',
      type: 'RichMediaPanel',
      label: 'Rich Media Panel',
      properties: {
        videoUrl: '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fgenerated.mp4',
        outputSourceUrl: 'https://example.com/generated.mp4',
      },
    },
  ]
  const out = listMediaOverlayNodes({
    enabled: true,
    nodes: nodes as any,
    poolMax: 24,
  })
  if (out.length !== 1) throw new Error(`expected one video overlay, got ${out.length}`)
  if (String(out[0]?.url || '') !== '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fgenerated.mp4') {
    throw new Error(`expected overlay playback url to stay proxied, got ${String(out[0]?.url || '<none>')}`)
  }
  if (String(out[0]?.openUrl || '') !== 'https://example.com/generated.mp4') {
    throw new Error(`expected overlay openUrl to prefer canonical output source url, got ${String(out[0]?.openUrl || '<none>')}`)
  }
}

export async function testMediaOverlayPoolPreservesEmptyRichMediaShellBesideFunctionalPanel() {
  const nodes: any[] = [
    {
      id: 'panel-functional',
      type: 'RichMediaPanel',
      label: 'Rich Media Panel',
      properties: {
        output: '## Functional panel',
      },
    },
    {
      id: 'panel-empty',
      type: 'RichMediaPanel',
      label: 'Rich Media Panel',
      properties: {},
    },
  ]
  const out = listMediaOverlayNodes({
    enabled: true,
    nodes: nodes as any,
    poolMax: 24,
  })
  const ids = new Set(out.map(node => String(node.id || '').trim()))
  if (out.length !== 2 || !ids.has('panel-functional') || !ids.has('panel-empty')) {
    throw new Error(`expected distinct Rich Media Panel identities to retain their own overlay owners, got ${JSON.stringify(Array.from(ids))}`)
  }
}

export async function testMediaOverlayPoolPreservesDistinctEmptyRichMediaShells() {
  const nodes: any[] = [
    {
      id: 'panel-empty-1',
      type: 'RichMediaPanel',
      label: 'Rich Media Panel',
      properties: {},
    },
    {
      id: 'panel-empty-2',
      type: 'RichMediaPanel',
      label: 'Rich Media Panel',
      properties: {},
    },
  ]
  const out = listMediaOverlayNodes({
    enabled: true,
    nodes: nodes as any,
    poolMax: 24,
  })
  const ids = new Set(out.map(node => String(node.id || '').trim()))
  if (out.length !== 2 || !ids.has('panel-empty-1') || !ids.has('panel-empty-2')) {
    throw new Error(`expected every empty Rich Media Panel identity to retain its overlay owner, got ${JSON.stringify(Array.from(ids))}`)
  }
}

export async function testMediaOverlayPoolKeepsExplicitEmptyImagePanelAsImageOverlay() {
  const nodes: any[] = [
    {
      id: 'panel-image-empty',
      type: 'RichMediaPanel',
      label: 'Shot S01 · Panel (Image)',
      properties: {
        richMediaActiveTab: 'image',
      },
    },
    {
      id: 'panel-text-functional',
      type: 'RichMediaPanel',
      label: 'Shot S01 · Panel (Text)',
      properties: {
        output: '## Functional text panel',
      },
    },
  ]
  const out = listMediaOverlayNodes({
    enabled: true,
    nodes: nodes as any,
    poolMax: 24,
  })
  const imagePanel = out.find(node => node.id === 'panel-image-empty')
  if (!imagePanel) throw new Error('expected explicit image tab panel to remain in overlay pool even before media URL exists')
  if (imagePanel.kind !== 'image') {
    throw new Error(`expected explicit empty image tab panel to materialize as image overlay, got ${String(imagePanel.kind || '<none>')}`)
  }
  if (String(imagePanel.url || '') !== '') {
    throw new Error(`expected explicit empty image tab panel to keep blank playback url until output arrives, got ${String(imagePanel.url || '<none>')}`)
  }
}

export async function testMediaOverlayPoolKeepsExplicitEmptyVideoPanelAsVideoOverlay() {
  const nodes: any[] = [
    {
      id: 'panel-video-empty',
      type: 'RichMediaPanel',
      label: 'Shot S01 · Panel (Video)',
      properties: {
        richMediaActiveTab: 'video',
      },
    },
    {
      id: 'panel-text-functional',
      type: 'RichMediaPanel',
      label: 'Shot S01 · Panel (Text)',
      properties: {
        output: '## Functional text panel',
      },
    },
  ]
  const out = listMediaOverlayNodes({
    enabled: true,
    nodes: nodes as any,
    poolMax: 24,
  })
  const videoPanel = out.find(node => node.id === 'panel-video-empty')
  if (!videoPanel) throw new Error('expected explicit video tab panel to remain in overlay pool even before media URL exists')
  if (videoPanel.kind !== 'video') {
    throw new Error(`expected explicit empty video tab panel to materialize as video overlay, got ${String(videoPanel.kind || '<none>')}`)
  }
  if (String(videoPanel.url || '') !== '') {
    throw new Error(`expected explicit empty video tab panel to keep blank playback url until output arrives, got ${String(videoPanel.url || '<none>')}`)
  }
}

export async function testMediaOverlayPoolPreservesUntouchedRichMediaVariantsAcrossConnectedChannelOverrides() {
  const nodes: any[] = [
    {
      id: 'panel-mixed',
      type: 'RichMediaPanel',
      label: 'Shot S01 · Panel',
      properties: {
        richMediaActiveTab: 'image',
        output: '## Local script',
        imageUrl: 'https://example.com/local-image.png',
      },
    },
  ]
  const connectedValuesByNodeId = new Map<string, any>([
    ['panel-mixed', {
      'properties.videoUrl': {
        value: 'https://example.com/generated-video.mp4',
        sources: [{ edgeId: 'edge-video', nodeId: 'video-widget', portKey: 'videoUrl' }],
      },
    }],
  ])

  const imageView = listMediaOverlayNodes({
    enabled: true,
    nodes: nodes as any,
    poolMax: 24,
    connectedValuesByNodeId,
  })
  if (imageView.length !== 1) throw new Error(`expected one mixed rich media overlay, got ${imageView.length}`)
  if (String(imageView[0]?.kind || '') !== 'image') {
    throw new Error(`expected image tab to keep the authored image variant, got ${String(imageView[0]?.kind || '<none>')}`)
  }
  if (String(imageView[0]?.url || '') !== 'https://example.com/local-image.png') {
    throw new Error(`expected image tab to keep the authored image url, got ${String(imageView[0]?.url || '<none>')}`)
  }
  if (imageView[0]?.panel?.hasText !== true || imageView[0]?.panel?.hasImage !== true || imageView[0]?.panel?.hasVideo !== true) {
    throw new Error(`expected mixed panel state to preserve text/image/video availability, got ${JSON.stringify(imageView[0]?.panel || null)}`)
  }

  nodes[0].properties.richMediaActiveTab = 'video'
  const videoView = listMediaOverlayNodes({
    enabled: true,
    nodes: nodes as any,
    poolMax: 24,
    connectedValuesByNodeId,
  })
  if (videoView.length !== 1) throw new Error(`expected one mixed rich media overlay after switching to video, got ${videoView.length}`)
  if (String(videoView[0]?.kind || '') !== 'video') {
    throw new Error(`expected video tab to select the connected video variant, got ${String(videoView[0]?.kind || '<none>')}`)
  }
  if (String(videoView[0]?.url || '') !== 'https://example.com/generated-video.mp4') {
    throw new Error(`expected video tab to use connected video url, got ${String(videoView[0]?.url || '<none>')}`)
  }
  if (videoView[0]?.panel?.hasText !== true || videoView[0]?.panel?.hasImage !== true || videoView[0]?.panel?.hasVideo !== true) {
    throw new Error(`expected mixed panel state to stay multi-variant after switching to video, got ${JSON.stringify(videoView[0]?.panel || null)}`)
  }
}

export function testMediaOverlayPoolCarriesCoveredAliases() {
  const url = 'https://assets.example.test/figure.png'
  const nodes = [
    { id: 'image', type: 'Image', label: 'Figure', properties: { media_url: url } },
    { id: 'link', type: 'Link', label: 'Source', properties: { url: `/__fetch_remote?url=${encodeURIComponent(url)}` } },
    { id: 'other', type: 'Image', label: 'Other', properties: { media_url: `${url}?edition=other` } },
  ]
  for (const preferred of ['image', 'link']) {
    const out = listMediaOverlayNodes({ enabled: true, nodes, poolMax: 1, preferredNodeIds: [preferred] })
    if (out.length !== 1 || out[0]?.id !== preferred) throw new Error('preferred media must own the bounded shared panel')
    const covered = new Set(out[0]?.coveredNodeIds)
    if (covered.size !== 2 || !covered.has('image') || !covered.has('link') || covered.has('other')) {
      throw new Error('one media panel must cover its graph aliases without hiding distinct media outside the pool')
    }
  }
  if (listMediaOverlayNodes({ enabled: false, nodes, poolMax: 1 }).length) throw new Error('disabled media must not suppress graph nodes')
}
