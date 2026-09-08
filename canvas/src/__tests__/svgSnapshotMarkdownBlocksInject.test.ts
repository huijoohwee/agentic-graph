import { buildStandaloneSvgMarkupFromElement, buildViewportSvgMarkupFromElement, injectLiveMarkdownDesignBlocksIntoSvgMarkup, injectLiveMarkdownDesignBlocksIntoSvgMarkupAnchored } from '@/lib/graph/svgSnapshot'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { injectMarkdownDesignBlocksIntoSvgEl } from '@/lib/graph/htmlViewer/markdownDesignSvgOverlay'

export async function testInjectLiveMarkdownDesignBlocksIntoSvgMarkupEmbedsForeignObject(): Promise<void> {
  const { restore } = initJsdomHarness()
  try {
    const root = document.createElement('section')
    root.id = 'kg-root'
    document.body.appendChild(root)

    const block = document.createElement('article')
    block.setAttribute('data-md-id', 'b1')
    block.setAttribute('data-kg-world-x', '10')
    block.setAttribute('data-kg-world-y', '20')
    block.setAttribute('data-kg-world-w', '300')
    block.setAttribute('data-kg-world-h', '120')
    block.style.background = 'rgb(255, 0, 0)'
    block.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
    block.innerHTML = '<section><a href="https://example.com">Hello</a></section>'
    root.appendChild(block)

    const svgIn = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g></g></svg>'
    const out = injectLiveMarkdownDesignBlocksIntoSvgMarkup(svgIn)
    if (!out || !out.includes('foreignObject')) throw new Error('Expected foreignObject injection')

    const doc = new DOMParser().parseFromString(out, 'image/svg+xml')
    if (doc.querySelector('parsererror')) throw new Error(`Expected valid SVG XML: ${doc.documentElement.textContent}`)
    const svg = doc.querySelector('svg')
    if (!svg) throw new Error('Expected svg root')
    const fo = svg.querySelector('foreignObject')
    if (!fo) throw new Error('Expected foreignObject')
    if (fo.getAttribute('x') !== '10') throw new Error('Expected x=10')
    if (fo.getAttribute('y') !== '20') throw new Error('Expected y=20')
    if (fo.getAttribute('width') !== '300') throw new Error('Expected width=300')
    if (fo.getAttribute('height') !== '120') throw new Error('Expected height=120')
    const cloned = fo.querySelector('[data-md-id="b1"]')
    if (!cloned) throw new Error('Expected cloned markdown block')
    if (cloned.namespaceURI !== 'http://www.w3.org/1999/xhtml') throw new Error('Expected XHTML content namespace')
    if (cloned.querySelector('a')?.getAttribute('href') !== 'https://example.com') throw new Error('Expected preserved markdown link')
    if (block.getAttributeNode('xmlns')?.namespaceURI !== null) throw new Error('Expected authored source declaration to remain unchanged')

    const liveSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    liveSvg.setAttribute('viewBox', '0 0 100 100')
    liveSvg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'g'))
    root.appendChild(liveSvg)
    for (const declarations of ['none', 'raw', 'mixed']) {
      if (declarations === 'mixed') {
        liveSvg.removeAttribute('xmlns')
        liveSvg.removeAttribute('xmlns:xlink')
        liveSvg.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', 'http://www.w3.org/2000/svg')
        liveSvg.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xlink', 'http://www.w3.org/1999/xlink')
      }
      if (declarations !== 'none') {
        for (const [name, value] of [['xmlns', 'http://www.w3.org/2000/svg'], ['xmlns:xlink', 'http://www.w3.org/1999/xlink']]) {
          const attribute = document.createAttribute(name)
          attribute.value = value
          liveSvg.setAttributeNode(attribute)
          const matching = Array.from(liveSvg.attributes).filter(item => item.name === name)
          if (declarations === 'mixed' && (matching.length !== 2 || !matching.some(item => item.namespaceURI === null) || !matching.some(item => item.namespaceURI === 'http://www.w3.org/2000/xmlns/'))) {
            throw new Error(`Expected native mixed namespace declarations for ${name}`)
          }
        }
      }
      const sourceAttributes = () => JSON.stringify(Array.from(liveSvg.attributes).map(item => [item.name, item.namespaceURI, item.value]))
      const attributesBefore = sourceAttributes()
      for (const build of [buildStandaloneSvgMarkupFromElement, buildViewportSvgMarkupFromElement]) {
        const snapshot = build(liveSvg, { inlineComputedStyles: false })
        if (!snapshot) throw new Error('Expected a native SVG snapshot')
        const reparsed = new DOMParser().parseFromString(snapshot, 'image/svg+xml')
        if (reparsed.querySelector('parsererror')) throw new Error(`Expected valid snapshot namespaces: ${reparsed.documentElement.textContent}`)
        if (reparsed.documentElement.namespaceURI !== 'http://www.w3.org/2000/svg') throw new Error('Expected SVG root namespace')
        if (reparsed.documentElement.lookupNamespaceURI('xlink') !== 'http://www.w3.org/1999/xlink') throw new Error('Expected XLink namespace')
        if (build === buildViewportSvgMarkupFromElement) {
          const article = reparsed.querySelector('foreignObject article')
          if (article?.namespaceURI !== 'http://www.w3.org/1999/xhtml') throw new Error('Expected viewport XHTML block')
          if (article?.querySelector('a')?.textContent !== 'Hello') throw new Error('Expected viewport markdown content')
        }
        if (sourceAttributes() !== attributesBefore) throw new Error('Expected snapshot export to preserve authored SVG declarations')
      }
    }

    for (const owner of ['html', 'xml']) {
      const overlaySvg = owner === 'html'
        ? document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        : new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml').documentElement as unknown as SVGSVGElement
      overlaySvg.appendChild(overlaySvg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g'))
      injectMarkdownDesignBlocksIntoSvgEl({
        svgEl: overlaySvg,
        blocks: [{ id: 'rendered-block', x: 10, y: 20, w: 300, h: 120, title: 'Authored title', summary: 'Authored body', preview: { kind: 'paragraph' } }] as never,
      })
      const reparsed = new DOMParser().parseFromString(new XMLSerializer().serializeToString(overlaySvg), 'image/svg+xml')
      if (reparsed.querySelector('parsererror')) throw new Error(`Expected valid ${owner}-owned overlay XML: ${reparsed.documentElement.textContent}`)
      const foreignObject = reparsed.querySelector('foreignObject')
      if (!foreignObject || foreignObject.namespaceURI !== 'http://www.w3.org/2000/svg') throw new Error('Expected rendered SVG foreignObject')
      for (const [name, value] of [['x', '10'], ['y', '20'], ['width', '300'], ['height', '120']]) {
        if (foreignObject.getAttribute(name) !== value) throw new Error(`Expected preserved overlay ${name}`)
      }
      const section = foreignObject.querySelector('section')
      if (!section || section.textContent !== 'Authored titleAuthored body') throw new Error('Expected authored overlay title and body')
      for (const element of [section, ...Array.from(section.querySelectorAll('*'))]) {
        if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml') throw new Error(`Expected ${owner}-owned overlay XHTML descendants`)
      }
      if (!section.getAttribute('style')?.includes('width:100%;height:100%')) throw new Error('Expected preserved overlay frame style')
    }
  } finally {
    restore()
  }
}

export async function testInjectLiveMarkdownDesignBlocksIntoSvgMarkupAnchoredUsesNodeCenter(): Promise<void> {
  const { restore } = initJsdomHarness()
  try {
    const root = document.createElement('section')
    root.id = 'kg-root'
    document.body.appendChild(root)

    const block = document.createElement('article')
    block.setAttribute('data-md-id', 'b1')
    block.setAttribute('data-kg-world-x', '10')
    block.setAttribute('data-kg-world-y', '20')
    block.setAttribute('data-kg-world-w', '300')
    block.setAttribute('data-kg-world-h', '120')
    root.appendChild(block)

    const svgIn = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g></g></svg>'
    const out = injectLiveMarkdownDesignBlocksIntoSvgMarkupAnchored({
      svgMarkup: svgIn,
      anchorNodeIdByBlockId: { b1: 'n1' },
      nodePosById: { n1: { x: 100, y: 200 } },
    })
    const doc = new DOMParser().parseFromString(out, 'image/svg+xml')
    if (doc.querySelector('parsererror')) throw new Error(`Expected valid anchored SVG XML: ${doc.documentElement.textContent}`)
    const fo = doc.querySelector('foreignObject')
    if (!fo) throw new Error('Expected foreignObject')
    if (fo.namespaceURI !== 'http://www.w3.org/2000/svg') throw new Error('Expected anchored SVG namespace')
    if (fo.querySelector('[data-md-id="b1"]')?.namespaceURI !== 'http://www.w3.org/1999/xhtml') throw new Error('Expected anchored XHTML namespace')
    if (fo.getAttribute('x') !== String(100 - 300 / 2)) throw new Error('Expected anchored x')
    if (fo.getAttribute('y') !== String(200 - 120 / 2)) throw new Error('Expected anchored y')
    if (fo.getAttribute('data-kg-anchor-node-id') !== 'n1') throw new Error('Expected data-kg-anchor-node-id')
  } finally {
    restore()
  }
}
