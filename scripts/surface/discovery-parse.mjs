import path from 'node:path'

const byteCompare = (left, right) => Buffer.compare(
  Buffer.from(String(left), 'utf8'),
  Buffer.from(String(right), 'utf8'),
)

const errorResult = (file, line, code = 'PARSE_ERROR') => ({
  entries: [],
  error: { file, line: Math.max(1, line), code },
})

const normalizeName = name => String(name).replaceAll(path.sep, '/').replace(/^\.?\//u, '')

const asText = bytes => {
  if (Buffer.isBuffer(bytes) || bytes instanceof Uint8Array) return Buffer.from(bytes).toString('utf8')
  return String(bytes)
}

const firstInvalidControlLine = source => {
  let line = 1
  for (let index = 0; index < source.length; index += 1) {
    const codePoint = source.charCodeAt(index)
    if (source[index] === '\n') line += 1
    if (codePoint === 0 || source[index] === '\r') return line
  }
  return null
}

const isAbsoluteHttpUrl = value => {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch {
    return false
  }
}

const jsonErrorLine = (source, error) => {
  const position = Number(
    String(error?.message ?? '').match(/(?:position|at position)\s+(\d+)/iu)?.[1],
  )
  if (!Number.isInteger(position)) return 1
  return source.slice(0, position).split('\n').length
}

const lineHolding = (lines, value) => {
  const encoded = JSON.stringify(value)
  const index = lines.findIndex(line => line.includes(encoded))
  return index === -1 ? 1 : index + 1
}

const validateEntryRecords = (file, source, records, { summaryRequired = true } = {}) => {
  const lines = source.split('\n')
  if (!Array.isArray(records)) return errorResult(file, 1, 'ENTRY_LIST_MISSING')
  const entries = []
  for (const record of records) {
    const entryId = typeof record?.entryId === 'string' ? record.entryId.trim() : ''
    const canonicalUrl = typeof record?.canonicalUrl === 'string' ? record.canonicalUrl : ''
    const summary = typeof record?.summary === 'string' ? record.summary : ''
    const line = lineHolding(lines, record?.entryId ?? record?.canonicalUrl ?? '')
    if (!entryId) return errorResult(file, line, 'ENTRY_ID_MISSING')
    if (!isAbsoluteHttpUrl(canonicalUrl)) return errorResult(file, line, 'CANONICAL_URL_INVALID')
    if (summaryRequired && (!summary || /[\r\n]/u.test(summary))) {
      return errorResult(file, line, 'SUMMARY_INVALID')
    }
    entries.push({ entryId, canonicalUrl, summary: summaryRequired ? summary : '' })
  }
  return { entries }
}

const parseJson = (file, source) => {
  let document
  try {
    document = JSON.parse(source)
  } catch (error) {
    return errorResult(file, jsonErrorLine(source, error), 'JSON_SYNTAX')
  }

  if (file.endsWith('.jsonld')) {
    return validateEntryRecords(file, source, [{
      entryId: document?.identifier,
      canonicalUrl: document?.url,
      summary: document?.description,
    }])
  }
  const records = document?.['x-knowgrph-entries'] ?? document?.entries
  return validateEntryRecords(file, source, records)
}

const decodeXml = value => String(value)
  .replaceAll('&apos;', "'")
  .replaceAll('&quot;', '"')
  .replaceAll('&gt;', '>')
  .replaceAll('&lt;', '<')
  .replaceAll('&amp;', '&')

const parseSitemap = (file, source) => {
  const lines = source.split('\n')
  if (!lines[0]?.startsWith('<?xml ') || !lines.some(line => line.includes('<urlset '))) {
    return errorResult(file, 1, 'XML_HEADER')
  }

  const entries = []
  let current = null
  let closed = false
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim()
    const line = index + 1
    if (!trimmed || trimmed.startsWith('<?xml ') || trimmed.startsWith('<urlset ')) continue
    if (trimmed === '<url>') {
      if (current) return errorResult(file, line, 'XML_NESTING')
      current = { startLine: line, canonicalUrl: null, artifacts: [] }
      continue
    }
    if (trimmed === '</url>') {
      if (!current || !current.canonicalUrl) {
        return errorResult(file, current?.startLine ?? line, 'SITEMAP_ENTRY_INCOMPLETE')
      }
      for (const artifact of current.artifacts) {
        entries.push({
          entryId: artifact.entryId,
          canonicalUrl: current.canonicalUrl,
          summary: '',
          surfaceTier: artifact.surfaceTier,
        })
      }
      current = null
      continue
    }
    if (trimmed === '</urlset>') {
      if (current) return errorResult(file, current.startLine, 'XML_NESTING')
      closed = true
      continue
    }
    const location = trimmed.match(/^<loc>(.*)<\/loc>$/u)
    if (location) {
      if (!current || current.canonicalUrl !== null) return errorResult(file, line, 'SITEMAP_LOCATION')
      const canonicalUrl = decodeXml(location[1])
      if (!isAbsoluteHttpUrl(canonicalUrl)) return errorResult(file, line, 'CANONICAL_URL_INVALID')
      current.canonicalUrl = canonicalUrl
      continue
    }
    if (/^<lastmod>.*<\/lastmod>$/u.test(trimmed)) {
      if (!current) return errorResult(file, line, 'SITEMAP_LASTMOD')
      continue
    }
    const artifact = trimmed.match(/^<kg:artifact id="([^"]+)" tier="([^"]+)" \/>$/u)
    if (artifact) {
      if (!current) return errorResult(file, line, 'SITEMAP_ARTIFACT')
      const entryId = decodeXml(artifact[1]).trim()
      const surfaceTier = decodeXml(artifact[2])
      if (!entryId || surfaceTier !== 'public-discoverable') {
        return errorResult(file, line, 'SITEMAP_ARTIFACT')
      }
      current.artifacts.push({ entryId, surfaceTier })
      continue
    }
    return errorResult(file, line, 'XML_SYNTAX')
  }
  if (!closed || current) return errorResult(file, Math.max(1, lines.length), 'XML_UNCLOSED')
  return { entries }
}

const parseRobots = (file, source) => {
  const lines = source.split('\n')
  const entries = []
  const allowedPaths = []
  const disallowedPaths = []
  let pendingEntry = null
  let sitemap = null
  let contentSignal = null

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim()
    const line = index + 1
    if (!trimmed || trimmed.startsWith('# Generated')) continue
    if (trimmed.startsWith('# Knowgrph-Entry: ')) {
      if (pendingEntry) return errorResult(file, line, 'ROBOTS_ENTRY_UNBOUND')
      try {
        pendingEntry = JSON.parse(trimmed.slice('# Knowgrph-Entry: '.length))
      } catch {
        return errorResult(file, line, 'ROBOTS_ENTRY_SYNTAX')
      }
      continue
    }
    if (trimmed.startsWith('Allow: ')) {
      if (!pendingEntry) return errorResult(file, line, 'ROBOTS_ENTRY_ID_MISSING')
      const pathname = trimmed.slice('Allow: '.length)
      const checked = validateEntryRecords(file, source, [pendingEntry], { summaryRequired: false })
      if (checked.error) return errorResult(file, line, checked.error.code)
      entries.push(checked.entries[0])
      allowedPaths.push(pathname)
      pendingEntry = null
      continue
    }
    if (trimmed.startsWith('Disallow: ')) {
      const pathname = trimmed.slice('Disallow: '.length)
      if (!pathname.startsWith('/')) return errorResult(file, line, 'ROBOTS_DISALLOW_INVALID')
      disallowedPaths.push(pathname)
      continue
    }
    if (trimmed.startsWith('Sitemap: ')) {
      sitemap = trimmed.slice('Sitemap: '.length)
      if (!isAbsoluteHttpUrl(sitemap)) return errorResult(file, line, 'ROBOTS_SITEMAP_INVALID')
      continue
    }
    if (trimmed.startsWith('Content-Signal: ')) {
      contentSignal = trimmed.slice('Content-Signal: '.length)
      continue
    }
    if (trimmed.startsWith('User-agent: ')) continue
    return errorResult(file, line, 'ROBOTS_SYNTAX')
  }
  if (pendingEntry) return errorResult(file, Math.max(1, lines.length), 'ROBOTS_ENTRY_UNBOUND')
  if (!sitemap) return errorResult(file, 1, 'ROBOTS_SITEMAP_MISSING')
  if (
    !contentSignal
    || !contentSignal.includes('search=')
    || !contentSignal.includes('ai-input=')
    || !contentSignal.includes('ai-train=')
  ) {
    return errorResult(file, 1, 'ROBOTS_CONTENT_SIGNAL_MISSING')
  }
  return {
    entries,
    crawlControls: {
      allowedPaths,
      disallowedPaths,
      sitemap,
      contentSignal,
    },
  }
}

const parseLlms = (file, source) => {
  const lines = source.split('\n')
  if (lines[0] !== '# Airvio public discovery index') {
    return errorResult(file, 1, 'LLMS_HEADER')
  }

  const entries = []
  let current = null
  const flush = () => {
    if (!current) return null
    if (!current.title || !current.entryId || !current.canonicalUrl || !current.summary) {
      return errorResult(file, current.line, 'LLMS_ENTRY_INCOMPLETE')
    }
    if (!isAbsoluteHttpUrl(current.canonicalUrl) || /[\r\n]/u.test(current.summary)) {
      return errorResult(file, current.line, 'LLMS_ENTRY_INVALID')
    }
    entries.push({
      entryId: current.entryId.trim(),
      canonicalUrl: current.canonicalUrl,
      summary: current.summary,
    })
    current = null
    return null
  }

  for (let index = 1; index < lines.length; index += 1) {
    const raw = lines[index]
    const line = index + 1
    if (raw.startsWith('## ')) {
      const problem = flush()
      if (problem) return problem
      current = { line, title: raw.slice(3).trim() }
      continue
    }
    if (!current || raw === '' || raw.startsWith('> ')) continue
    const field = raw.match(/^- (Artifact-ID|Canonical-URL|Summary|License|Last-Modified): (.*)$/u)
    if (!field) return errorResult(file, line, 'LLMS_SYNTAX')
    const key = {
      'Artifact-ID': 'entryId',
      'Canonical-URL': 'canonicalUrl',
      Summary: 'summary',
      License: 'licenseId',
      'Last-Modified': 'lastModified',
    }[field[1]]
    if (Object.hasOwn(current, key)) return errorResult(file, line, 'LLMS_DUPLICATE_FIELD')
    current[key] = field[2]
  }
  const problem = flush()
  if (problem) return problem
  return { entries }
}

export const parseDiscoveryFile = (name, bytes) => {
  const file = normalizeName(name)
  const source = asText(bytes)
  const invalidControlLine = firstInvalidControlLine(source)
  if (invalidControlLine) return errorResult(file, invalidControlLine, 'INVALID_CONTROL_CHARACTER')

  if (file.endsWith('robots.txt')) return parseRobots(file, source)
  if (file.endsWith('sitemap.xml')) return parseSitemap(file, source)
  if (file.endsWith('llms.txt')) return parseLlms(file, source)
  if (
    file.endsWith('openapi.json')
    || file.endsWith('.well-known/api-catalog')
    || file.endsWith('.well-known/agent-card.json')
    || file.endsWith('.well-known/mcp.json')
    || file.includes('/structured-data/')
    || file.startsWith('structured-data/')
  ) {
    return parseJson(file, source)
  }
  return errorResult(file, 1, 'UNSUPPORTED_DISCOVERY_FORMAT')
}

export const parseDiscoverySurfaces = files => {
  const iterable = files instanceof Map ? files.entries() : Object.entries(files ?? {})
  const results = new Map()
  const errors = []
  for (const [name, bytes] of [...iterable].sort(([left], [right]) => byteCompare(left, right))) {
    const result = parseDiscoveryFile(name, bytes)
    results.set(name, result)
    if (result.error) errors.push(result.error)
  }
  return { results, errors }
}

export const parseDiscoveryFiles = files => parseDiscoverySurfaces(files).results
