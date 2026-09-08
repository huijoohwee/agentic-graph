import { buildGraphHtmlViewerMarkup } from '@/lib/graph/graphHtmlViewer'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export async function testBuildGraphHtmlViewerNormalizesEdgeEndpointsAndNodePosFromSvg(): Promise<void> {
  const { restore } = initJsdomHarness()
  try {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
      '<g>' +
      '<g data-kg-layer="links"></g>' +
      '<circle data-node-id="layer::n1" cx="10" cy="20" r="2" />' +
      '<circle data-node-id="layer::n2" cx="40" cy="60" r="2" />' +
      '</g>' +
      '</svg>'

    const html = await buildGraphHtmlViewerMarkup({
      title: 't',
      svgMarkup: svg,
      graphData: {
        nodes: [{ id: 'layer::n1' }, { id: 'layer::n2' }],
        edges: [{ id: 'e1', source: 'n1', target: 'n2', label: 'rel' }],
      } as any,
      includeRichMediaOverlays: false,
    })

    if (!html) throw new Error('Expected html')
    if (!html.includes('"s":"layer::n1"')) throw new Error('Expected normalized edge source id')
    if (!html.includes('"t":"layer::n2"')) throw new Error('Expected normalized edge target id')
    if (!html.includes('"layer::n1":{"x":10,"y":20}')) throw new Error('Expected nodePosById from svg for n1')
    if (!html.includes('"layer::n2":{"x":40,"y":60}')) throw new Error('Expected nodePosById from svg for n2')
  } finally {
    restore()
  }
}

