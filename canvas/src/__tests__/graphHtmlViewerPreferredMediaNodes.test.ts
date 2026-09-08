import { buildGraphHtmlViewerMarkup } from '@/lib/graph/graphHtmlViewer'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export async function testBuildGraphHtmlViewerPrefersVisibleMediaNodes(): Promise<void> {
  const { restore } = initJsdomHarness()
  try {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
      '<g>' +
      '<circle data-node-id="n1" cx="-100000" cy="0" r="2" />' +
      '<circle data-node-id="n2" cx="10" cy="10" r="2" />' +
      '</g>' +
      '</svg>'

    const html = await buildGraphHtmlViewerMarkup({
      title: 't',
      svgMarkup: svg,
      graphData: {
        nodes: [
          { id: 'n1', type: 'Paragraph', properties: { text: '![](https://example.com/a.png)' } },
          { id: 'n2', type: 'Paragraph', properties: { text: '![](https://example.com/b.png)' } },
        ],
        edges: [],
      } as any,
      includeRichMediaOverlays: true,
      mediaOverlayPoolMax: 1,
      viewportWidthPx: 100,
      viewportHeightPx: 100,
      viewportScaleToFit: true,
      initialView: { k: 1, x: 0, y: 0 },
    })

    if (!html) throw new Error('Expected html')
    if (!html.includes('"id":"n2"')) throw new Error('Expected visible media node to be preferred into pool')
    if (html.includes('"id":"n1"')) throw new Error('Expected offscreen media node excluded when poolMax=1')
  } finally {
    restore()
  }
}
