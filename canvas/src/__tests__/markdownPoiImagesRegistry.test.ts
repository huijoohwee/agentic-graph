import { applyParser, builtInParsers, registerParser, resetParsers, toParserId } from '@/features/parsers'
import { buildMarkdownJsonLd } from '@/features/parsers/default'
import { readExternalDemoText } from '@/tests/lib/externalFixtures'

const extractPoiImageUrl = (markdown: string, poiName: string): string | null => {
  const safePoi = poiName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`poi:\\s*${safePoi}\\s*\\n\\s*url:\\s*(\\S+)`, 'i')
  const m = String(markdown || '').match(re)
  return m && typeof m[1] === 'string' && m[1].trim() ? m[1].trim() : null
}

export async function testMarkdownPoiImagesRegistryEnrichesMatchingNodes() {
  resetParsers()
  builtInParsers.forEach(p => registerParser(p))

  const res = readExternalDemoText({ preferBasename: 'trip-demo-mmd.md', envVarPathKey: 'AG_TRIP_DEMO_MMD_PATH' })
  if (!res) return
  const markdown = res.text

  const expectedUrl = extractPoiImageUrl(markdown, 'Sydney Opera House')
  if (!expectedUrl) {
    throw new Error('Expected trip-demo-mmd.md frontmatter to include media.poi_images for Sydney Opera House')
  }

  const jsonld = buildMarkdownJsonLd('file://trip-demo-mmd.md', markdown)
  const parsed = applyParser(toParserId('jsonld'), {
    name: 'trip-demo-mmd.jsonld',
    text: JSON.stringify(jsonld),
  })
  if (!parsed) throw new Error('jsonld parse returned null')
  if (parsed.warnings && parsed.warnings.length > 0) {
    throw new Error(`jsonld parse warnings: ${parsed.warnings.join('; ')}`)
  }

  const nodes = parsed.graphData.nodes || []
  const matches = nodes.filter(n => String(n.label || '').toLowerCase().includes('sydney opera house'))
  if (matches.length === 0) {
    throw new Error('Expected at least one parsed node whose label includes "Sydney Opera House"')
  }

  const withImage = matches.find(n => {
    const props = (n.properties || {}) as Record<string, unknown>
    const url = typeof props.image === 'string' ? props.image.trim() : ''
    return url === expectedUrl
  })
  if (!withImage) {
    const sample = matches.slice(0, 3).map(n => {
      const props = (n.properties || {}) as Record<string, unknown>
      return { label: n.label, image: typeof props.image === 'string' ? props.image : null }
    })
    throw new Error(`Expected at least one matching node to include image=${expectedUrl}. Sample: ${JSON.stringify(sample)}`)
  }
}
