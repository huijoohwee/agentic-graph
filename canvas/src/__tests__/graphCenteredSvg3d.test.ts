import type { GraphData } from '@/lib/graph/types'
import { exportGraphAsCentered3dSvgMarkup } from '@/lib/graph/graphCenteredSvg3d'
import { defaultSchema } from '@/lib/graph/schema'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export function testGraphCenteredSvg3dCentersAndAnimates() {
  const g: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'a', type: 'Entity', label: 'A', properties: { pos3d: [80, 0, 40] } },
      { id: 'b', type: 'Entity', label: 'B', properties: { pos3d: [-80, 0, -40] } },
    ],
    edges: [{ id: 'e1', source: 'a', target: 'b', label: 'rel', properties: {} }],
  }

  const svg = exportGraphAsCentered3dSvgMarkup({
    graphData: g,
    schema: defaultSchema,
    widthPx: 900,
    heightPx: 600,
    paddingPx: 60,
    includeXmlDeclaration: false,
    animated: true,
    frames: 12,
    durationSec: 4,
  })
  if (!svg) throw new Error('expected svg markup')
  if (!svg.includes('<script')) throw new Error('expected script animation')
  if (!svg.includes('data-kg-3d-payload=')) throw new Error('expected embedded 3d payload')
  if (!svg.includes('data-node-id="a"') || !svg.includes('data-node-id="b"')) throw new Error('expected node elements present')
  if (svg.includes('0.35+t*0.65')) throw new Error('expected no depth-based opacity curve')

  const m = svg.match(/viewBox="([^"]+)"/)
  if (!m) throw new Error('expected viewBox')
  const parts = String(m[1] || '').trim().split(/[ ,]+/).map(Number)
  if (parts.length !== 4) throw new Error('expected 4 viewBox numbers')
  const [x, y, w, h] = parts
  const cx = x + w / 2
  const cy = y + h / 2
  if (!(Math.abs(cx) < 1e-6)) throw new Error(`expected centered viewBox cx=0, got ${cx}`)
  if (!(Math.abs(cy) < 1e-6)) throw new Error(`expected centered viewBox cy=0, got ${cy}`)
}

export function testGraphCenteredSvg3dResolvesThemeColorsWhenDocumentAvailable() {
  const env = initJsdomHarness()
  try {
    const doc = env.dom.window.document
    doc.documentElement.style.setProperty('--kg-canvas-bg', '#112233')
    doc.documentElement.style.setProperty('--kg-text-primary', '#ddeeff')
    doc.documentElement.style.setProperty('--kg-canvas-label-fill', '#ddeeff')
    doc.documentElement.style.setProperty('--kg-border', '#445566')
    doc.documentElement.style.setProperty('--kg-canvas-node-stroke', '#445566')

    const g: GraphData = {
      type: 'Graph',
      nodes: [{ id: 'a', type: 'Entity', label: 'A', properties: { pos3d: [10, 0, 0] } }],
      edges: [],
    }
    const svg = exportGraphAsCentered3dSvgMarkup({
      graphData: g,
      schema: defaultSchema,
      widthPx: 800,
      heightPx: 600,
      paddingPx: 40,
      includeXmlDeclaration: false,
      animated: false,
    })
    if (!svg) throw new Error('expected svg markup')
    if (!/fill="rgb\(\s*17,\s*34,\s*51\s*\)"/.test(svg) && !/fill="#112233"/i.test(svg)) {
      throw new Error('expected background fill to use theme canvas bg')
    }
    if (!/stroke="rgb\(\s*68,\s*85,\s*102\s*\)"/.test(svg) && !/stroke="#445566"/i.test(svg)) {
      throw new Error('expected node stroke to use theme border')
    }
    if (!/fill="rgb\(\s*221,\s*238,\s*255\s*\)"/.test(svg) && !/fill="#ddeeff"/i.test(svg)) {
      throw new Error('expected label fill to use theme text')
    }
  } finally {
    env.restore()
  }
}

export function testGraphCenteredSvg3dEdgeRgbaAlphaControlsStrokeOpacity() {
  const g: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'a', type: 'Entity', label: 'A', properties: { pos3d: [40, 0, 0] } },
      { id: 'b', type: 'Entity', label: 'B', properties: { pos3d: [-40, 0, 0] } },
    ],
    edges: [{ id: 'e1', source: 'a', target: 'b', label: 'rel', properties: { 'visual:stroke': 'rgba(255,0,0,0.2)' } }],
  }
  const svg = exportGraphAsCentered3dSvgMarkup({
    graphData: g,
    schema: defaultSchema,
    widthPx: 900,
    heightPx: 600,
    paddingPx: 60,
    includeXmlDeclaration: false,
    animated: false,
    // Snapshot callers disable depth fading when checking authored opacity.
    exportDepthOpacityMin: 1,
    exportDepthOpacityMax: 1,
  })
  if (!svg) throw new Error('expected svg markup')
  if (!svg.includes('stroke="rgb(255, 0, 0)"')) throw new Error('expected rgba to be normalized to rgb stroke')
  if (!svg.includes('stroke-opacity="0.2"')) throw new Error('expected rgba alpha to drive stroke-opacity')
}

export function testGraphCenteredSvg3dShaderLineModeRespectsSchemaEdgeOpacity() {
  const g: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'a', type: 'Entity', label: 'A', properties: { pos3d: [40, 0, 0] } },
      { id: 'b', type: 'Entity', label: 'B', properties: { pos3d: [-40, 0, 0] } },
    ],
    edges: [{ id: 'e1', source: 'a', target: 'b', label: 'rel', properties: {} }],
  }
  const svg = exportGraphAsCentered3dSvgMarkup({
    graphData: g,
    schema: { ...defaultSchema, three: { ...defaultSchema.three, linkOpacity: 0.25 } },
    widthPx: 900,
    heightPx: 600,
    paddingPx: 60,
    includeXmlDeclaration: false,
    animated: false,
    threeEdgeRenderer: 'shaderLine',
  })
  if (!svg) throw new Error('expected svg markup')
  if (!svg.includes('stroke-opacity="0.25"')) throw new Error('expected shaderLine export to preserve schema edge opacity')
}

export function testGraphCenteredSvg3dNodeVisualOpacityAffectsSvgOpacity() {
  const g: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'a', type: 'Entity', label: 'A', properties: { pos3d: [0, 0, 0], 'visual:opacity': 0.2 } },
    ],
    edges: [],
  }
  const svg = exportGraphAsCentered3dSvgMarkup({
    graphData: g,
    schema: defaultSchema,
    widthPx: 900,
    heightPx: 600,
    paddingPx: 60,
    includeXmlDeclaration: false,
    animated: false,
    // Snapshot callers disable depth fading when checking authored opacity.
    exportDepthOpacityMin: 1,
    exportDepthOpacityMax: 1,
  })
  if (!svg) throw new Error('expected svg markup')
  if (!svg.includes('data-node-id="a"')) throw new Error('expected node present')
  if (!svg.includes('opacity="0.2"')) throw new Error('expected visual:opacity to drive exported node opacity')
}

export function testGraphCenteredSvg3dAnimationPreservesAuthoredOpacity() {
  for (const [minimum, maximum, renderer, expectedNode, expectedEdge, edgeOpacity = 0.2] of [
    [1, 1, 'mesh', 0.2, 0.2], [0, 0, 'mesh', 0, 0],
    [0.8, 0.2, 'mesh', 0.16, 0.16], [0, 0, 'shaderLine', 0, 0.2], [1, 1, 'mesh', 0.2, 0, 0],
  ] as const) {
    const env = initJsdomHarness()
    try {
      const svg = exportGraphAsCentered3dSvgMarkup({
        graphData: { type: 'Graph', nodes: [
          { id: 'a', type: 'Entity', label: 'A', properties: { pos3d: [0, 0, 0], 'visual:opacity': 0.2 } },
          { id: 'b', type: 'Entity', label: 'B', properties: { pos3d: [40, 0, 0] } },
        ], edges: [{ id: 'e1', source: 'a', target: 'b', label: 'rel', properties: { opacity: edgeOpacity } }] },
        schema: defaultSchema, widthPx: 900, heightPx: 600, animated: true,
        exportShaderLineWidthPx: 2.75, exportDepthOpacityMin: minimum, exportDepthOpacityMax: maximum, threeEdgeRenderer: renderer,
      })
      if (!svg) throw new Error('Expected animated SVG')
      const doc = env.dom.window.document
      doc.body.innerHTML = svg
      const root = doc.querySelector('svg')!
      const node = root.querySelector('[data-node-id="a"] [data-role="node-circle"]')!
      const edge = root.querySelector('[data-edge-id="e1"]')!
      const script = root.querySelector('script')?.textContent
      if (!node || !edge || !script) throw new Error('Expected exported node, edge, and animation script')
      const assertOpacity = () => {
        if (renderer === 'shaderLine' && Number(edge.getAttribute('stroke-width')) !== 2.75) throw new Error('Expected fixed shader line width')
        if (Math.abs(Number(node.getAttribute('fill-opacity')) - expectedNode) > 0.001
          || Math.abs(Number(edge.getAttribute('stroke-opacity')) - expectedEdge) > 0.001) {
          throw new Error(`Animation opacity mismatch for ${minimum}/${maximum}/${renderer}: node=${node.getAttribute('fill-opacity')} edge=${edge.getAttribute('stroke-opacity')}`)
        }
      }
      assertOpacity()
      let frame: (() => void) | undefined
      new Function('document', 'requestAnimationFrame', 'performance', script)(
        { currentScript: { ownerSVGElement: root } }, (callback: () => void) => { frame = callback; return 1 }, { now: () => 0 },
      )
      if (!frame) throw new Error('Expected the generated animation to schedule a frame')
      frame(); assertOpacity(); frame(); assertOpacity()
    } finally { env.restore() }
  }
}
