import { ensureSvgHasEdgeGeometry } from '@/lib/graph/svgEdgeGeometry'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export function testEnsureSvgHasEdgeGeometryInjectsLines(): void {
  const { restore } = initJsdomHarness()
  try {
    const svgIn =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
      '<g>' +
      '<g data-kg-layer="links"></g>' +
      '<g data-kg-layer="nodes">' +
      '<circle data-node-id="layer::n1" cx="10" cy="20" r="2" />' +
      '<circle data-node-id="layer::n2" cx="40" cy="60" r="2" />' +
      '</g>' +
      '</g>' +
      '</svg>'

    const out = ensureSvgHasEdgeGeometry({
      svgMarkup: svgIn,
      graphData: {
        nodes: [{ id: 'layer::n1' }, { id: 'layer::n2' }],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      } as any,
    })

    const doc = new DOMParser().parseFromString(out, 'image/svg+xml')
    const links = doc.querySelector('[data-kg-layer="links"]')
    if (!links) throw new Error('Expected links layer')
    const line = links.querySelector('line[data-edge-id="e1"]') as SVGLineElement | null
    if (!line) throw new Error('Expected injected edge line')
    if (line.getAttribute('data-source-id') !== 'layer::n1') throw new Error('Expected normalized data-source-id')
    if (line.getAttribute('data-target-id') !== 'layer::n2') throw new Error('Expected normalized data-target-id')
    if (line.getAttribute('x1') !== '10') throw new Error('Expected x1=10')
    if (line.getAttribute('y1') !== '20') throw new Error('Expected y1=20')
    if (line.getAttribute('x2') !== '40') throw new Error('Expected x2=40')
    if (line.getAttribute('y2') !== '60') throw new Error('Expected y2=60')
  } finally {
    restore()
  }
}

