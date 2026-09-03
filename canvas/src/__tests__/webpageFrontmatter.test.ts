import { isFrontmatterOnlyDoc, parseWebpageFrontmatterMeta, upsertWebpageFrontmatterMeta } from '@/lib/markdown/frontmatter'

export const testWebpageFrontmatterRoundtrip = () => {
  const input = '# Title\n\nHello\n'
  const withMeta = upsertWebpageFrontmatterMeta(input, { url: 'https://localhost/path', view: 'html' })
  const parsed = parseWebpageFrontmatterMeta(withMeta)
  if (!parsed) throw new Error('expected meta')
  if (parsed.url !== 'https://localhost/path') throw new Error('url mismatch')
  if (parsed.view !== 'html') throw new Error('view mismatch')
  if (!withMeta.includes(input.trim())) throw new Error('expected body preserved')
}

export const testWebpageFrontmatterUpsertUpdatesExisting = () => {
  const existing = [
    '---',
    'kgWebpageUrl: "https://localhost/a"',
    'kgWebpageView: "markdown"',
    '---',
    '',
    '# Doc',
    '',
  ].join('\n')
  const next = upsertWebpageFrontmatterMeta(existing, { url: 'https://localhost/b', view: 'html' })
  const parsed = parseWebpageFrontmatterMeta(next)
  if (!parsed) throw new Error('expected meta')
  if (parsed.url !== 'https://localhost/b') throw new Error('url mismatch')
  if (parsed.view !== 'html') throw new Error('view mismatch')
  if (!next.includes('# Doc')) throw new Error('expected body preserved')
}

export const testWebpageFrontmatterUpsertPreservesOtherKeys = () => {
  const existing = [
    '---',
    'kgWebpageUrl: "https://localhost/a"',
    'kgWebpageView: "markdown"',
    'kgWebsiteImportId: "import-1"',
    'kgWebsiteNodeId: "node-1"',
    'kgWebsiteOutputDirRel: ".agentic-graph-workspace/website-imports"',
    '---',
    '',
    '# Doc',
    '',
  ].join('\n')
  const next = upsertWebpageFrontmatterMeta(existing, { url: 'https://localhost/a', view: 'html' })
  if (!next.includes('kgWebsiteImportId: "import-1"')) throw new Error('expected kgWebsiteImportId preserved')
  if (!next.includes('kgWebsiteNodeId: "node-1"')) throw new Error('expected kgWebsiteNodeId preserved')
  if (!next.includes('kgWebsiteOutputDirRel: ".agentic-graph-workspace/website-imports"')) throw new Error('expected kgWebsiteOutputDirRel preserved')
}

export const testWebpageFrontmatterSupportsJsonView = () => {
  const input = '# Title\n\nHello\n'
  const withMeta = upsertWebpageFrontmatterMeta(input, { url: 'https://localhost/path', view: 'json' })
  const parsed = parseWebpageFrontmatterMeta(withMeta)
  if (!parsed) throw new Error('expected meta')
  if (parsed.url !== 'https://localhost/path') throw new Error('url mismatch')
  if (parsed.view !== 'json') throw new Error('view mismatch')
}

export const testWebpageFrontmatterSupportsMarkdownView = () => {
  const input = '# Title\n\nHello\n'
  const withMeta = upsertWebpageFrontmatterMeta(input, { url: 'https://localhost/path', view: 'markdown' })
  const parsed = parseWebpageFrontmatterMeta(withMeta)
  if (!parsed) throw new Error('expected meta')
  if (parsed.url !== 'https://localhost/path') throw new Error('url mismatch')
  if (parsed.view !== 'markdown') throw new Error('view mismatch')
}

export const testFrontmatterOnlyDocDetection = () => {
  const stub = ['---', 'kgWebpageUrl: "https://localhost/"', 'kgWebpageView: "markdown"', '---', '', ''].join('\n')
  if (!isFrontmatterOnlyDoc(stub)) throw new Error('expected stub to be frontmatter-only')
  const withBody = `${stub}# Notes\n\nHello\n`
  if (isFrontmatterOnlyDoc(withBody)) throw new Error('expected body doc to not be frontmatter-only')
}

export const testWebpageFrontmatterUnsupportedViewUsesHtmlDefault = () => {
  const unsupportedViews = ['source', 'preview', 'dom', 'raw']
  for (const view of unsupportedViews) {
    const input = [
      '---',
      'kgWebpageUrl: "https://localhost/path"',
      `kgWebpageView: "${view}"`,
      '---',
      '',
      '# Title',
      '',
    ].join('\n')
    const parsed = parseWebpageFrontmatterMeta(input)
    if (!parsed) throw new Error(`expected meta for unsupported view ${view}`)
    if (parsed.view !== 'html') throw new Error(`expected unsupported view ${view} to use html default`)
  }
}

export const testWebpageFrontmatterSupportsScriptPolicy = () => {
  const input = ['---', 'kgWebpageUrl: "https://localhost/"', 'kgWebpageView: "html"', 'kgWebpageScriptPolicy: "allow"', '---', '', ''].join('\n')
  const parsed = parseWebpageFrontmatterMeta(input)
  if (!parsed) throw new Error('expected meta')
  if (parsed.scriptPolicy !== 'allow') throw new Error('scriptPolicy mismatch')
}

export const testWebpageFrontmatterSupportsFidelityAndImages = () => {
  const input = [
    '---',
    'kgWebpageUrl: "https://localhost/"',
    'kgWebpageView: "html"',
    'kgWebpageFidelityLevel: "4"',
    'kgWebpageIncludeImages: "false"',
    '---',
    '',
    '',
  ].join('\n')
  const parsed = parseWebpageFrontmatterMeta(input)
  if (!parsed) throw new Error('expected meta')
  if (parsed.fidelityLevel !== 4) throw new Error('fidelityLevel mismatch')
  if (parsed.includeImages !== false) throw new Error('includeImages mismatch')
}
