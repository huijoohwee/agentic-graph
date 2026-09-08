import { rewriteSvgMarkupForStandaloneHtmlExport } from '@/lib/graph/htmlViewer/rewriteSvgMarkupForStandaloneHtmlExport'
import { JSDOM } from 'jsdom'

export async function testStandaloneSvgRewriteRewritesAllUrlAttrs(): Promise<void> {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
  const g = globalThis as any

  const prev = {
    window: g.window,
    document: g.document,
    DOMParser: g.DOMParser,
    XMLSerializer: g.XMLSerializer,
  }
  g.window = dom.window
  g.document = dom.window.document
  g.DOMParser = dom.window.DOMParser
  g.XMLSerializer = dom.window.XMLSerializer

  const src = [
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">',
    '<image',
    '  href="/__fetch_remote?url=https%3A%2F%2Fexample.com%2Fa.png"',
    '  xlink:href="/__fetch_remote?url=https%3A%2F%2Fexample.com%2Fa.png"',
    '  width="10" height="10"',
    '/>',
    '<foreignObject x="0" y="0" width="100" height="30">',
    '  <section xmlns="http://www.w3.org/1999/xhtml"',
    '    style="background-image:url(/__fetch_remote?url=https%3A%2F%2Fexample.com%2Fbg.png)">',
    '    <a href="/__fetch_remote?url=https%3A%2F%2Fexample.com%2Flink">link</a>',
    '    <img src="/__fetch_remote?url=https%3A%2F%2Fexample.com%2Fimg.png"',
    '      srcset="/__fetch_remote?url=https%3A%2F%2Fexample.com%2Fimg.png 1x, /__fetch_remote?url=https%3A%2F%2Fexample.com%2Fimg2.png 2x" />',
    '    <video poster="/__fetch_remote?url=https%3A%2F%2Fexample.com%2Fposter.png"></video>',
    '  </section>',
    '</foreignObject>',
    '</svg>',
  ].join('')

  try {
    const out = await rewriteSvgMarkupForStandaloneHtmlExport({ svgMarkup: src })
    const parsed = new dom.window.DOMParser().parseFromString(out, 'image/svg+xml')
    const img = parsed.documentElement.querySelector('image')
    const href = img?.getAttribute('href') || ''
    const xlinkHref = img?.getAttribute('xlink:href') || ''
    if (href !== 'https://example.com/a.png') throw new Error('Expected rewritten href to be unwrapped')
    if (xlinkHref !== 'https://example.com/a.png') throw new Error('Expected rewritten xlink:href to be unwrapped')

    const section = parsed.documentElement.querySelector('foreignObject section')
    if (!section) throw new Error('Expected exported foreignObject section to remain present')
    const style = section.getAttribute('style') || ''
    if (!style.includes('url(https://example.com/bg.png)')) throw new Error('Expected rewritten css url() to be unwrapped')

    const a = parsed.documentElement.querySelector('foreignObject a')
    const href2 = a?.getAttribute('href') || ''
    if (href2 !== 'https://example.com/link') throw new Error('Expected rewritten foreignObject href to be unwrapped')

    const img2 = parsed.documentElement.querySelector('foreignObject img')
    const src2 = img2?.getAttribute('src') || ''
    if (src2 !== 'https://example.com/img.png') throw new Error('Expected rewritten foreignObject img src to be unwrapped')
    const srcset = img2?.getAttribute('srcset') || ''
    if (!srcset.includes('https://example.com/img.png 1x') || !srcset.includes('https://example.com/img2.png 2x')) {
      throw new Error('Expected rewritten srcset urls to be unwrapped')
    }

    const video = parsed.documentElement.querySelector('foreignObject video')
    const poster = video?.getAttribute('poster') || ''
    if (poster !== 'https://example.com/poster.png') throw new Error('Expected rewritten poster url to be unwrapped')
  } finally {
    g.window = prev.window
    g.document = prev.document
    g.DOMParser = prev.DOMParser
    g.XMLSerializer = prev.XMLSerializer
  }
}
