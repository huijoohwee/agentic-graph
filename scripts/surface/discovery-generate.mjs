import path from 'node:path'
import * as fileSystem from 'node:fs/promises'
import { PUBLIC_DISCOVERY_FILES } from './constants.mjs'
import { resolvePublishedInvocationCatalog } from './published-catalog.mjs'

export const DISCOVERY_SURFACE_FILES = PUBLIC_DISCOVERY_FILES

export const STRUCTURED_DATA_DIRECTORY = '.well-known/structured-data'

const PUBLIC_DISCOVERABLE = 'public-discoverable'
const PUBLIC_ARTIFACT = 'public-artifact'
const GATED = 'gated'
const MAX_STAGING_FILES = 6_000
const MAX_STAGING_BYTES = 250_000_000
const DOCUMENT_CLASSES = new Set(['published-document', 'guideline', 'specification'])
const HTTP_METHODS = new Set(['delete', 'get', 'head', 'options', 'patch', 'post', 'put'])

const byteCompare = (left, right) => Buffer.compare(
  Buffer.from(String(left), 'utf8'),
  Buffer.from(String(right), 'utf8'),
)

const sortByArtifactId = entries => [...entries].sort((left, right) => (
  byteCompare(left?.artifactId ?? '', right?.artifactId ?? '')
))

const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')

const xmlEscape = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;')

const characterCount = value => Array.from(String(value)).length

const isSingleLine = value => !/[\r\n]/u.test(String(value))

const isIsoDate = value => {
  if (typeof value !== 'string' || value.length === 0) return false
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/u.test(value)) return false
  return Number.isFinite(Date.parse(value))
}

const resolvePublicUrl = (value, origin) => {
  if (typeof value !== 'string' || value.trim() === '') return null
  try {
    const originUrl = new URL(origin)
    const resolved = new URL(value, originUrl)
    if (!['http:', 'https:'].includes(resolved.protocol)) return null
    if (resolved.origin !== originUrl.origin || resolved.username || resolved.password) return null
    return resolved.href
  } catch {
    return null
  }
}

const asRegistryEntries = registry => (
  Array.isArray(registry?.entries) ? registry.entries : []
)

const publicMetadata = (entry, origin) => {
  const invalidFields = []
  const artifactId = typeof entry?.artifactId === 'string' ? entry.artifactId.trim() : ''
  const title = typeof entry?.title === 'string' ? entry.title.trim() : ''
  const summary = typeof entry?.summary === 'string' ? entry.summary.trim() : ''
  const canonicalUrl = resolvePublicUrl(entry?.canonicalUrl, origin)
  const licenseId = typeof entry?.licenseId === 'string' ? entry.licenseId.trim() : ''

  if (!artifactId) invalidFields.push('artifactId')
  if (characterCount(title) < 1 || characterCount(title) > 80) invalidFields.push('title')
  if (
    characterCount(summary) < 1
    || characterCount(summary) > 200
    || !isSingleLine(entry?.summary ?? '')
  ) {
    invalidFields.push('summary')
  }
  if (!canonicalUrl) invalidFields.push('canonicalUrl')
  if (!licenseId || licenseId === 'NONE-private') invalidFields.push('licenseId')
  if (!isIsoDate(entry?.lastModified)) invalidFields.push('lastModified')

  return {
    invalidFields,
    record: {
      entryId: artifactId,
      canonicalUrl,
      summary,
      title,
      licenseId,
      lastModified: entry?.lastModified,
      artifactClass: entry?.artifactClass,
      path: entry?.path,
      representingPage: entry?.representingPage,
      readOnly: entry?.readOnly,
      ingressRoute: entry?.ingressRoute ?? entry?.executionRoute,
      method: entry?.service?.method ?? entry?.method ?? entry?.httpMethod ?? entry?.route?.method,
      service: entry?.service,
    },
  }
}

const publicRecord = record => ({
  entryId: record.entryId,
  canonicalUrl: record.canonicalUrl,
  summary: record.summary,
  title: record.title,
  licenseId: record.licenseId,
  lastModified: record.lastModified,
})

const buildRobots = ({ entries, gatedPaths, sitemapUrl, contentSignal }) => {
  const lines = [
    '# Generated from knowgrph-surface-registry/v1. Do not edit.',
    'User-agent: *',
  ]

  for (const entry of entries) {
    const pathname = new URL(entry.canonicalUrl).pathname
    lines.push(`# Knowgrph-Entry: ${JSON.stringify(publicRecord(entry))}`)
    lines.push(`Allow: ${pathname}`)
  }
  for (const gatedPath of gatedPaths) lines.push(`Disallow: ${gatedPath}`)

  lines.push(
    '',
    `Content-Signal: ${contentSignal}`,
    `Sitemap: ${sitemapUrl}`,
    '',
  )
  return Buffer.from(lines.join('\n'), 'utf8')
}

const buildSitemap = ({ entries, representingPages, origin }) => {
  const urls = new Map()
  const append = (canonicalUrl, artifact, lastModified = artifact?.lastModified) => {
    if (!canonicalUrl) return
    const existing = urls.get(canonicalUrl) ?? { artifacts: [], lastModified: [] }
    if (artifact) existing.artifacts.push(artifact)
    if (isIsoDate(lastModified)) existing.lastModified.push(lastModified)
    urls.set(canonicalUrl, existing)
  }

  for (const entry of entries) {
    const sitemapUrl = entry.representingPage
      ? resolvePublicUrl(entry.representingPage, origin)
      : entry.canonicalUrl
    append(sitemapUrl, { entryId: entry.entryId, tier: PUBLIC_DISCOVERABLE, lastModified: entry.lastModified })
  }
  for (const page of representingPages) {
    append(page.canonicalUrl, null, page.lastModified)
  }

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:kg="https://airvio.co/ns/discovery">',
  ]
  for (const [canonicalUrl, value] of [...urls.entries()].sort(([left], [right]) => byteCompare(left, right))) {
    const artifacts = [...value.artifacts].sort((left, right) => byteCompare(left.entryId, right.entryId))
    lines.push('  <url>', `    <loc>${xmlEscape(canonicalUrl)}</loc>`)
    if (value.lastModified.length > 0) {
      lines.push(`    <lastmod>${xmlEscape([...value.lastModified].sort(byteCompare).at(-1))}</lastmod>`)
    }
    for (const artifact of artifacts) {
      lines.push(
        `    <kg:artifact id="${xmlEscape(artifact.entryId)}" tier="${artifact.tier}" />`,
      )
    }
    lines.push('  </url>')
  }
  lines.push('</urlset>', '')
  return Buffer.from(lines.join('\n'), 'utf8')
}

const buildLlms = entries => {
  const lines = [
    '# Airvio public discovery index',
    '',
    '> Generated from the Surface Registry. Entries below are public-discoverable metadata.',
    '',
  ]
  for (const entry of entries) {
    lines.push(
      `## ${entry.title}`,
      `- Artifact-ID: ${entry.entryId}`,
      `- Canonical-URL: ${entry.canonicalUrl}`,
      `- Summary: ${entry.summary}`,
      `- License: ${entry.licenseId}`,
      `- Last-Modified: ${entry.lastModified}`,
      '',
    )
  }
  return Buffer.from(lines.join('\n'), 'utf8')
}

const operationId = artifactId => `surface_${Buffer.from(artifactId, 'utf8').toString('hex')}`

const buildOpenApi = ({ entries, registry, origin, generationErrors }) => {
  const serviceUrl = resolvePublicUrl('/openapi.json', origin)
  const paths = {}
  const schemas = {}
  const occupiedOperations = new Set()

  for (const entry of entries) {
    if (!entry.service) continue
    const routePath = typeof entry.path === 'string' && entry.path.startsWith('/')
      ? entry.path
      : new URL(entry.canonicalUrl).pathname
    const method = String(entry.method ?? 'get').toLowerCase()
    if (!HTTP_METHODS.has(method)) {
      generationErrors.push({
        code: 'INVALID_ROUTE_METHOD',
        artifactId: entry.entryId,
        field: 'method',
        file: 'openapi.json',
      })
      continue
    }
    const operationKey = `${routePath}\u0000${method}`
    if (occupiedOperations.has(operationKey)) {
      generationErrors.push({
        code: 'DUPLICATE_ROUTE_OPERATION',
        artifactId: entry.entryId,
        field: 'path',
        file: 'openapi.json',
      })
      continue
    }
    occupiedOperations.add(operationKey)
    const componentPrefix = operationId(entry.entryId)
    const requestComponent = `${componentPrefix}Request`
    const responseComponent = `${componentPrefix}Response`
    const requestSchemaRef = `${serviceUrl}#/components/schemas/${requestComponent}`
    const responseSchemaRef = `${serviceUrl}#/components/schemas/${responseComponent}`
    schemas[requestComponent] = {
      type: 'object',
      description: `Request envelope for ${entry.entryId}.`,
      additionalProperties: true,
    }
    schemas[responseComponent] = {
      type: 'object',
      description: `Response envelope for ${entry.entryId}.`,
      additionalProperties: true,
    }
    paths[routePath] ??= {}
    paths[routePath][method] = {
      operationId: operationId(entry.entryId),
      summary: entry.summary,
      'x-artifact-id': entry.entryId,
      'x-surface-tier': PUBLIC_DISCOVERABLE,
      'x-request-schema': requestSchemaRef,
      'x-response-schema': responseSchemaRef,
      requestBody: {
        required: false,
        content: { 'application/json': { schema: { $ref: requestSchemaRef } } },
      },
      responses: {
        200: {
          description: 'Successful response',
          content: {
            'application/json': { schema: { $ref: responseSchemaRef } },
          },
        },
      },
    }
  }

  return jsonBytes({
    openapi: '3.1.0',
    info: {
      title: 'Airvio public discovery surface',
      version: String(registry?.version ?? '1.0.0'),
      description: 'Public-discoverable routes projected from the Surface Registry.',
    },
    servers: [{ url: new URL(origin).origin }],
    paths,
    components: { schemas },
    'x-knowgrph-entries': entries.map(publicRecord),
  })
}

const buildApiCatalog = ({ entries, invocationCatalog, origin }) => jsonBytes({
  schema: 'knowgrph-api-catalog/v1',
  serviceDescription: resolvePublicUrl('/openapi.json', origin),
  entries: entries.map(publicRecord),
  invocationCatalog,
})

const buildAgentCard = ({ entries, origin, authorizationMetadata }) => {
  const transports = entries
    .filter(entry => entry.service?.transport === 'mcp' && entry.readOnly === true)
    .map(entry => ({
      artifactId: entry.entryId,
      protocol: 'MCP',
      url: entry.canonicalUrl,
      surfaceTier: PUBLIC_DISCOVERABLE,
      authorization: 'none',
      trustBoundary: 'public-read-only',
    }))
  return jsonBytes({
    schema: 'knowgrph-agent-card/v1',
    agentIdentifier: new URL(origin).hostname,
    inboundProtocol: 'MCP',
    authorizationMetadata,
    transports,
    entries: entries.map(publicRecord),
  })
}

const buildMcpManifest = ({ entries, invocationCatalog, authorizationMetadata }) => {
  const publicReadEndpoint = entries.find(entry => (
    entry.service?.transport === 'mcp'
    && entry.readOnly === true
    && entry.ingressRoute === 'public-read-mcp'
  ))
  const tools = invocationCatalog.entries
    .filter(entry => (
      entry.prefixRole === 'mcp-tool-id'
      && entry.executionRouteTier === PUBLIC_DISCOVERABLE
      && entry.readOnly === true
    ))
    .map(entry => ({
      name: entry.token,
      title: entry.label,
      description: entry.intentSummary,
      readOnly: true,
      executionRoute: entry.ingressRoute,
    }))
  return jsonBytes({
    schema: 'knowgrph-mcp-manifest/v1',
    serverInfo: { name: 'knowgrph', version: '1.0.0' },
    transport: publicReadEndpoint
      ? { type: 'streamable-http', url: publicReadEndpoint.canonicalUrl, stateless: true }
      : null,
    authorizationMetadata,
    capabilities: { tools },
    catalogDigest: invocationCatalog.digest,
    entries: entries.map(publicRecord),
  })
}

const structuredDataPath = artifactId => (
  `${STRUCTURED_DATA_DIRECTORY}/${encodeURIComponent(artifactId)}.jsonld`
)

const buildStructuredData = entry => jsonBytes({
  '@context': 'https://schema.org',
  '@type': 'DigitalDocument',
  identifier: entry.entryId,
  name: entry.title,
  description: entry.summary,
  url: entry.canonicalUrl,
  license: entry.licenseId,
  dateModified: entry.lastModified,
})

const resolveAuthorizationMetadata = (entries, origin, generationErrors) => {
  const endpoints = entries.filter(entry => entry.service?.transport === 'mcp')
  const candidates = endpoints.map(entry => ({
    artifactId: entry.entryId,
    url: resolvePublicUrl(entry.service?.authorizationMetadataUrl, origin),
  }))
  for (const candidate of candidates.filter(candidate => !candidate.url)) {
    generationErrors.push({
      code: 'AUTHORIZATION_METADATA_MISSING',
      artifactId: candidate.artifactId,
      field: 'service.authorizationMetadataUrl',
    })
  }
  const urls = [...new Set(candidates.map(candidate => candidate.url).filter(Boolean))]
  if (urls.length > 1) {
    generationErrors.push({
      code: 'AUTHORIZATION_METADATA_CONFLICT',
      artifactId: 'authorization-metadata',
      field: 'service.authorizationMetadataUrl',
    })
  }
  const authorizationMetadata = urls.length === 1 ? urls[0] : null
  if (
    authorizationMetadata
    && !entries.some(entry => entry.canonicalUrl === authorizationMetadata)
  ) {
    generationErrors.push({
      code: 'AUTHORIZATION_METADATA_UNGOVERNED',
      artifactId: 'authorization-metadata',
      field: 'service.authorizationMetadataUrl',
    })
  }
  return authorizationMetadata
}

export const generateDiscoverySurfaces = (registry, options = {}) => {
  const generationErrors = []
  const origin = resolvePublicUrl(registry?.publicOrigin, registry?.publicOrigin)
  if (!origin) {
    return {
      files: new Map(),
      generationErrors: [{
        code: 'INVALID_PUBLIC_ORIGIN',
        artifactId: null,
        field: 'publicOrigin',
      }],
    }
  }

  const registryEntries = sortByArtifactId(asRegistryEntries(registry))
  const invocationCatalog = resolvePublishedInvocationCatalog(registry, options.invocationCatalog)
  if (invocationCatalog.validationFailures.length > 0) {
    for (const failure of invocationCatalog.validationFailures) {
      generationErrors.push({
        code: 'INVALID_INVOCATION_ENTRY',
        artifactId: failure.token,
        field: failure.fields?.join(',') ?? 'entry',
      })
    }
  }
  if (invocationCatalog.digest !== registry?.catalogDigest) {
    generationErrors.push({
      code: 'INVOCATION_CATALOG_DIGEST_MISMATCH',
      artifactId: 'invocation-catalog',
      field: 'catalogDigest',
    })
  }
  const entries = []
  const canonicalOwners = new Map()
  for (const entry of registryEntries.filter(candidate => candidate?.surfaceTier === PUBLIC_DISCOVERABLE)) {
    const { invalidFields, record } = publicMetadata(entry, origin)
    for (const field of invalidFields) {
      generationErrors.push({
        code: 'INVALID_PUBLIC_METADATA',
        artifactId: entry?.artifactId ?? null,
        field,
      })
    }
    if (invalidFields.length > 0) continue
    const previousOwner = canonicalOwners.get(record.canonicalUrl)
    if (previousOwner) {
      generationErrors.push({
        code: 'DUPLICATE_CANONICAL_URL',
        artifactId: record.entryId,
        field: 'canonicalUrl',
        conflictingArtifactId: previousOwner,
      })
      continue
    }
    canonicalOwners.set(record.canonicalUrl, record.entryId)
    entries.push(record)
  }

  const publicArtifactPages = registryEntries
    .filter(entry => entry?.surfaceTier === PUBLIC_ARTIFACT && entry?.representingPage)
    .map(entry => ({
      canonicalUrl: resolvePublicUrl(entry.representingPage, origin),
      lastModified: isIsoDate(entry.lastModified) ? entry.lastModified : null,
    }))
    .filter(entry => entry.canonicalUrl)

  const gatedPaths = [...new Set(
    registryEntries
      .filter(entry => entry?.surfaceTier === GATED)
      .map(entry => entry?.path)
      .filter(candidate => (
        typeof candidate === 'string'
        && candidate.startsWith('/')
        && !/[\r\n]/u.test(candidate)
      )),
  )].sort(byteCompare)
  const authorizationMetadata = resolveAuthorizationMetadata(entries, origin, generationErrors)

  const files = new Map()
  files.set('robots.txt', buildRobots({
    entries,
    gatedPaths,
    sitemapUrl: resolvePublicUrl('/sitemap.xml', origin),
    contentSignal: registry?.policy?.contentSignals ?? 'ai-train=no, search=yes, ai-input=yes',
  }))
  files.set('sitemap.xml', buildSitemap({
    entries,
    representingPages: publicArtifactPages,
    origin,
  }))
  files.set('llms.txt', buildLlms(entries))
  files.set('openapi.json', buildOpenApi({ entries, registry, origin, generationErrors }))
  files.set('.well-known/api-catalog', buildApiCatalog({ entries, invocationCatalog, origin }))
  files.set('.well-known/agent-card.json', buildAgentCard({
    entries, origin, authorizationMetadata,
  }))
  files.set('.well-known/mcp.json', buildMcpManifest({
    entries,
    invocationCatalog,
    authorizationMetadata,
  }))

  for (const entry of entries.filter(candidate => DOCUMENT_CLASSES.has(candidate.artifactClass))) {
    files.set(structuredDataPath(entry.entryId), buildStructuredData(entry))
  }

  return {
    files: new Map([...files.entries()].sort(([left], [right]) => byteCompare(left, right))),
    generationErrors: generationErrors.sort((left, right) => (
      byteCompare(
        `${left.artifactId ?? ''}\u0000${left.field ?? ''}\u0000${left.code}`,
        `${right.artifactId ?? ''}\u0000${right.field ?? ''}\u0000${right.code}`,
      )
    )),
  }
}

export const generate = generateDiscoverySurfaces

export const isDiscoverySurfacePath = relativePath => (
  DISCOVERY_SURFACE_FILES.includes(relativePath)
  || relativePath.startsWith(`${STRUCTURED_DATA_DIRECTORY}/`)
)

const assertDisposableStagingPath = outDir => {
  const resolved = path.resolve(outDir)
  if (
    path.basename(resolved) !== 'surface-staging'
    || path.basename(path.dirname(resolved)) !== '.tmp'
  ) {
    throw new Error('discovery output must target a disposable .tmp/surface-staging directory')
  }
  return resolved
}

export const writeDiscoverySurfaces = async (
  registry,
  outDir,
  {
    fs = fileSystem,
    invocationCatalog,
    maxFiles = MAX_STAGING_FILES,
    maxTotalBytes = MAX_STAGING_BYTES,
  } = {},
) => {
  const generated = generateDiscoverySurfaces(registry, { invocationCatalog })
  if (generated.generationErrors.length > 0) return { ...generated, written: false, writtenPaths: [] }
  if (generated.files.size > maxFiles) throw new Error(`staging file limit exceeded: ${maxFiles}`)

  const totalBytes = [...generated.files.values()]
    .reduce((total, bytes) => total + bytes.byteLength, 0)
  if (totalBytes > maxTotalBytes) throw new Error(`staging byte limit exceeded: ${maxTotalBytes}`)

  const target = assertDisposableStagingPath(outDir)
  const parent = path.dirname(target)
  await fs.mkdir(parent, { recursive: true })
  const parentStat = await fs.lstat(parent)
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    throw new Error('discovery staging parent must be a real directory, not a symbolic link')
  }
  const temporary = await fs.mkdtemp(path.join(parent, '.surface-staging-write-'))
  const backup = `${target}.previous-${path.basename(temporary)}`
  let movedExisting = false

  try {
    for (const [relativePath, bytes] of generated.files) {
      if (!isDiscoverySurfacePath(relativePath)) {
        throw new Error(`refusing unrecognised discovery output path: ${relativePath}`)
      }
      const destination = path.resolve(temporary, relativePath)
      if (!destination.startsWith(`${temporary}${path.sep}`)) {
        throw new Error(`refusing staging path outside temporary directory: ${relativePath}`)
      }
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.writeFile(destination, bytes, { flag: 'wx' })
    }
    try {
      const targetStat = await fs.lstat(target)
      if (targetStat.isSymbolicLink()) throw new Error('staging target must not be a symbolic link')
      await fs.rename(target, backup)
      movedExisting = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await fs.rename(temporary, target)
    if (movedExisting) await fs.rm(backup, { recursive: true, force: true })
    return {
      ...generated,
      written: true,
      writtenPaths: [...generated.files.keys()],
      totalBytes,
    }
  } catch (error) {
    if (movedExisting) {
      try {
        await fs.rename(backup, target)
      } catch {
        // The original staging tree remains in the named backup for manual recovery.
      }
    }
    throw error
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}
