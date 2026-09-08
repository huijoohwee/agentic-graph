import { extractNodePosByIdFromSvgMarkup } from '@/lib/graph/svgNodePos'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export async function testExtractNodePosByIdFromSvgMarkupReadsNodesAndEdges(): Promise<void> {
  const { restore } = initJsdomHarness()
  try {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <g>
        <g data-kg-layer="nodes">
          <circle data-node-id="a" cx="10" cy="20" r="5" />
          <rect data-node-id="b" x="40" y="50" width="10" height="20" />
          <path data-node-id="c" data-kg-node-shape="hex" transform="translate(7,8)" d="M0,0" />
          <g data-node-id="g1" transform="translate(5,6)"><circle data-role="node-circle" cx="11" cy="12" r="4" /></g>
          <circle data-node-id="a" data-port-key="p" cx="999" cy="999" r="2" />
        </g>
        <g data-kg-layer="links">
          <line data-edge-id="e1" data-source-id="d" data-target-id="e" x1="1" y1="2" x2="3" y2="4" />
        </g>
      </g>
    </svg>
  `.trim()

    const pos = extractNodePosByIdFromSvgMarkup(svg)
    if (!pos || typeof pos !== 'object') throw new Error('Expected pos map')
    if (!pos.a || pos.a.x !== 10 || pos.a.y !== 20) throw new Error('Expected circle pos for a')
    if (!pos.b || pos.b.x !== 45 || pos.b.y !== 60) throw new Error('Expected rect center pos for b')
    if (!pos.c || pos.c.x !== 7 || pos.c.y !== 8) throw new Error('Expected translate pos for c')
    if (!pos.g1 || pos.g1.x !== 16 || pos.g1.y !== 18) throw new Error('Expected g pos for g1')
    if (!pos.d || pos.d.x !== 1 || pos.d.y !== 2) throw new Error('Expected source endpoint pos for d')
    if (!pos.e || pos.e.x !== 3 || pos.e.y !== 4) throw new Error('Expected target endpoint pos for e')
  } finally {
    restore()
  }
}
