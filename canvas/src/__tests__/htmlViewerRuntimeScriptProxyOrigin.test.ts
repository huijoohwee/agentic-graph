import { buildHtmlViewerRuntimeScript } from '@/lib/graph/htmlViewer/runtimeScript'

export function testHtmlViewerRuntimeScriptReplacesProxyOriginPlaceholder() {
  const out = buildHtmlViewerRuntimeScript({
    interactionCfgJson: '{}',
    mediaNodesJson: '[]',
    markdownBlocksJson: '[]',
    nodeLabelByIdJson: '{}',
    edgeMetaByIdJson: '{}',
    frontmatterVisibilityJson: '{"nodeIds":[],"edgeIds":[]}',
    nodePosByIdJson: '{}',
    groupMembersByIdJson: '{}',
    density: 'default',
    widthRatioDefault: 0.22,
    widthRatioCompact: 0.14,
    widthMinDefault: 220,
    widthMinCompact: 180,
    widthMaxDefault: 460,
    widthMaxCompact: 360,
    proxyOrigin: 'http://localhost:5173',
    allowRuntimeNetwork: true,
  })

  if (out.includes('__AG_PROXY_ORIGIN__')) {
    throw new Error('Expected __AG_PROXY_ORIGIN__ placeholder to be replaced')
  }
  if (out.includes('__AG_MD_BLOCKS__')) {
    throw new Error('Expected markdown blocks to be embedded, not a placeholder token')
  }
  if (!out.includes('http://localhost:5173')) {
    throw new Error('Expected proxy origin string to be embedded into runtime script')
  }
  if (!out.includes('var AG_ALLOW_RUNTIME_NETWORK = true;')) {
    throw new Error('Expected explicit runtime networking mode to be embedded')
  }
  if (!out.includes("root ? Array.prototype.slice.call(root.querySelectorAll('[data-node-id]'))")) {
    throw new Error('Expected frontmatter visibility to include non-SVG node elements')
  }

  if (!out.includes('installMarkdownBlockInteractions')) {
    throw new Error('Expected markdown design block interaction installer to be embedded')
  }

  if (!out.includes('iframe.srcdoc')) {
    throw new Error('Expected iframe srcdoc support in runtime script')
  }

  if (!out.includes('svg.__kgNodeOffsetById')) {
    throw new Error('Expected edge geometry to incorporate overlay follow offsets for parity')
  }

  if (!out.includes('scheduleEdgeGeometryUpdateForNode(nodeId)')) {
    throw new Error('Expected node offset translation to schedule edge geometry updates')
  }

  if (out.includes("document.createElement('section')") || /<section\b|<\/div>/i.test(out)) {
    throw new Error('Expected HTML viewer runtime-created DOM to avoid generic HTML division element containers')
  }
}

export function testHtmlViewerRuntimeScriptDisablesNetworkByDefault() {
  const out = buildHtmlViewerRuntimeScript({
    interactionCfgJson: '{}',
    mediaNodesJson: '[]',
    markdownBlocksJson: '[]',
    nodeLabelByIdJson: '{}',
    edgeMetaByIdJson: '{}',
    frontmatterVisibilityJson: '{"nodeIds":[],"edgeIds":[]}',
    nodePosByIdJson: '{}',
    groupMembersByIdJson: '{}',
    density: 'default',
    widthRatioDefault: 0.22,
    widthRatioCompact: 0.14,
    widthMinDefault: 220,
    widthMinCompact: 180,
    widthMaxDefault: 460,
    widthMaxCompact: 360,
  })

  if (out.includes('__AG_ALLOW_RUNTIME_NETWORK__')) {
    throw new Error('Expected runtime networking placeholder to be replaced')
  }
  if (!out.includes('var AG_ALLOW_RUNTIME_NETWORK = false;')) {
    throw new Error('Expected runtime networking to default off')
  }
  if (!out.includes('if (!AG_ALLOW_RUNTIME_NETWORK) return false;')) {
    throw new Error('Expected proxy use to be blocked when runtime networking is off')
  }
  if (!out.includes("if (!AG_ALLOW_RUNTIME_NETWORK) { try { onDone && onDone(null); }")) {
    throw new Error('Expected webpage metadata fetch to short-circuit when runtime networking is off')
  }
  if (!out.includes("if (!AG_ALLOW_RUNTIME_NETWORK && (u.startsWith('/__') || u.startsWith('/@') || /^https?:\\/\\//i.test(u))) return '';")) {
    throw new Error('Expected remote media srcs to be suppressed when runtime networking is off')
  }
  if (!out.includes('if (AG_ALLOW_RUNTIME_NETWORK && raw && cur !== raw) imgEl.src = raw;')) {
    throw new Error('Expected image fallback to avoid raw remote srcs when runtime networking is off')
  }
  if (!out.includes('if (AG_ALLOW_RUNTIME_NETWORK && raw && cur !== raw) vid.src = raw;')) {
    throw new Error('Expected video fallback to avoid raw remote srcs when runtime networking is off')
  }
}
