#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 4177
const DEFAULT_DOC_PATH = '/docs/hackamap/manifest.md'
const SOURCE_DOC_LIMIT_BYTES = 480 * 1024
const TEXT_CHUNK_BYTES = 460 * 1024
const BINARY_CHUNK_BYTES = 340 * 1024
const MAX_PROJECTED_FILES = 500
const DOMAIN_PROJECTION_SOURCE_PATH = '/docs/hackamap/manifest.graph.json'
const CODEBASE_PROJECTION_SOURCE_PATH = '/docs/hackamap/codebase.graph.json'
const HACKAMAP_GRAPH_SOURCE_PATH = 'site/hackamap-graph.json'
const MAX_DOMAIN_PROJECTION_BYTES = 500_000
const DOMAIN_PROJECTION_SCHEMA = 'hackamap-domain-graph-projection/v1'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const canvasRoot = path.join(repoRoot, 'canvas')
const viteBinPath = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js')

function parseArgs(argv) {
  const options = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    hackamapRoot: path.resolve(repoRoot, '..', 'hackamap'),
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || '').trim()
    if (!arg) continue
    if (arg === '--host') {
      options.host = String(argv[index + 1] || '').trim() || DEFAULT_HOST
      index += 1
      continue
    }
    if (arg === '--port') {
      const value = Number(argv[index + 1])
      if (!Number.isInteger(value) || value < 1024 || value > 65535) {
        throw new Error('Expected --port to be an integer from 1024 through 65535.')
      }
      options.port = value
      index += 1
      continue
    }
    if (arg === '--hackamap-root') {
      const value = String(argv[index + 1] || '').trim()
      if (!value) throw new Error('Expected --hackamap-root to provide a sibling repository path.')
      options.hackamapRoot = path.resolve(value)
      index += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node ./scripts/run-hackamap-multi-dim-table.mjs [--host 127.0.0.1] [--port 4177] [--hackamap-root ../hackamap]',
      '',
      'Launches the local Canvas with HackaMap source files projected into Source Files.',
      'A demo-centered D3 domain graph opens from manifest.md. A separate codebase',
      'graph, CSV inventory, and grouped source documents are available in Source Files.',
      '',
    ].join('\n'),
  )
}

const normalizeRelativePath = value => String(value || '').replace(/\\/g, '/').replace(/^\/+/, '')
const compareNames = (left, right) => left < right ? -1 : left > right ? 1 : 0

async function collectRepositoryFiles(rootPath) {
  const root = await realpath(rootPath)
  const rootStat = await stat(root)
  if (!rootStat.isDirectory()) throw new Error(`HackaMap root is not a directory: ${root}`)
  const files = []
  const visit = async (absoluteDirectory, relativeDirectory) => {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true })
    entries.sort((left, right) => compareNames(left.name, right.name))
    for (const entry of entries) {
      if (entry.name === '.git') continue
      const relativePath = normalizeRelativePath(path.posix.join(relativeDirectory, entry.name))
      const absolutePath = path.join(absoluteDirectory, entry.name)
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath)
      } else if (entry.isFile()) {
        files.push({ absolutePath, relativePath })
      }
    }
  }
  await visit(root, '')
  return files
}

function splitText(text, maxBytes) {
  const chunks = []
  let chunk = ''
  let bytes = 0
  for (const character of text) {
    const characterBytes = Buffer.byteLength(character)
    if (chunk && bytes + characterBytes > maxBytes) {
      chunks.push(chunk)
      chunk = ''
      bytes = 0
    }
    chunk += character
    bytes += characterBytes
  }
  if (chunk || chunks.length === 0) chunks.push(chunk)
  return chunks
}

function splitBuffer(buffer, maxBytes) {
  const chunks = []
  for (let offset = 0; offset < buffer.byteLength; offset += maxBytes) {
    chunks.push(buffer.subarray(offset, Math.min(offset + maxBytes, buffer.byteLength)))
  }
  return chunks.length ? chunks : [Buffer.alloc(0)]
}

function wrapSourcePart({ originalPath, originalBytes, part, parts, encoding, content }) {
  const safePath = JSON.stringify(originalPath)
  return [
    '---',
    `title: ${JSON.stringify(`HackaMap source: ${originalPath}${parts > 1 ? ` (${part}/${parts})` : ''}`)}`,
    `hackamapSourcePath: ${safePath}`,
    `hackamapSourceBytes: ${originalBytes}`,
    `hackamapSourcePart: ${part}`,
    `hackamapSourceParts: ${parts}`,
    `hackamapSourceEncoding: ${encoding}`,
    '---',
    '',
    '```text',
    content,
    '```',
    '',
  ].join('\n')
}

function buildOverview({ sourceFiles, sourceParts, totalBytes, sourcePath }) {
  const directories = new Map()
  for (const file of sourceFiles) {
    const [firstSegment, ...remainingSegments] = file.relativePath.split('/')
    const directory = remainingSegments.length ? `${firstSegment}/` : '(root)'
    const aggregate = directories.get(directory) || { files: 0, parts: 0, bytes: 0 }
    aggregate.files += 1
    aggregate.parts += file.parts
    aggregate.bytes += file.bytes
    directories.set(directory, aggregate)
  }
  const rows = [...directories.entries()].sort(([left], [right]) => compareNames(left, right)).map(([directory, totals]) =>
    `| \`${directory}\` | ${totals.files} | ${totals.parts} | ${totals.bytes} |`,
  )
  return [
    '---',
    'title: "HackaMap repository overview"',
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "multiDimTable"',
    'kgDocumentSemanticMode: "document"',
    'kgFrontmatterModeEnabled: true',
    'kgMultiDimTableModeEnabled: true',
    `hackamapSourcePath: ${JSON.stringify(sourcePath)}`,
    `hackamapSourceFileCount: ${sourceFiles.length}`,
    `hackamapSourcePartCount: ${sourceParts}`,
    `hackamapSourceTotalBytes: ${totalBytes}`,
    'hackamapSourceInventory: true',
    '---',
    '',
    '# HackaMap repository',
    '',
    `The repository projection contains ${sourceFiles.length} files (${sourceParts} source documents, ${totalBytes} bytes). Open \`docs/hackamap/manifest.md\` for the demo-centered domain graph and \`docs/hackamap/manifest.csv\` for the complete file index. Full file previews are grouped under \`docs/hackamap/source-files/\`; the original SSOT is ${sourcePath}.`,
    '',
    '| Folder | Files | Parts | Bytes |',
    '|---|---:|---:|---:|',
    ...rows,
    '',
  ].join('\n')
}

function buildIndex({ sourceFiles, sourceParts, totalBytes, sourcePath, codebase }) {
  const counts = codebase.counts
  return [
    '---',
    'title: "HackaMap codebase graph"',
    'document_type: "agent-graph-manifest"',
    'kgCanvasGraphApply: false',
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "d3"',
    'kgDocumentSemanticMode: "document"',
    'kgFrontmatterModeEnabled: true',
    'kgMultiDimTableModeEnabled: true',
    'kgDocumentStructureBaselineLock: false',
    `source_projection: ${JSON.stringify(CODEBASE_PROJECTION_SOURCE_PATH)}`,
    `graph_id: ${JSON.stringify(codebase.graphId)}`,
    `snapshot_digest: ${JSON.stringify(codebase.snapshotDigest)}`,
    `parser_registry_digest: ${JSON.stringify(codebase.parserRegistryDigest)}`,
    `complete: ${codebase.complete}`,
    `source_count: ${counts.sources}`,
    `node_count: ${counts.nodes}`,
    `edge_count: ${counts.edges}`,
    `projection_node_count: ${codebase.projectedNodes}`,
    `projection_edge_count: ${codebase.projectedEdges}`,
    `projection_truncated: ${codebase.projectionTruncated}`,
    `hackamapSourcePath: ${JSON.stringify(sourcePath)}`,
    `hackamapSourceFileCount: ${sourceFiles.length}`,
    `hackamapSourcePartCount: ${sourceParts}`,
    `hackamapSourceTotalBytes: ${totalBytes}`,
    'hackamapSourceInventory: true',
    '---',
    '',
    '# HackaMap codebase graph',
    '',
    `Agent Graph indexed ${counts.sources} admitted sources into a ${counts.nodes}-node, ${counts.edges}-relationship snapshot. D3 opens its bounded ${codebase.projectedNodes}-node, ${codebase.projectedEdges}-relationship projection${codebase.projectionTruncated ? ' (partial view)' : ''}. The full repository inventory contains ${sourceFiles.length} files (${sourceParts} ordered source documents, ${totalBytes} bytes); paths, sizes, part counts, and preview links are in the sibling \`manifest.csv\`. Full source content remains under \`source-files/\`, split below ${SOURCE_DOC_LIMIT_BYTES} bytes where needed. The original SSOT is ${sourcePath}.`,
    '',
  ].join('\n')
}

const DOMAIN_NODE_FIELDS = {
  Collection: ['ref_id', 'root_url', 'platform', 'record_type', 'item_count', 'confidence', 'extracted_at', 'notes', 'source_type'],
  Demo: ['ref_id', 'event_id', 'url', 'pain_point', 'solution', 'products', 'teams', 'tech_stack', 'award', 'confidence', 'source_type', 'year'],
  Event: ['ref_id', 'url', 'date_start', 'date_end', 'format', 'location', 'theme', 'prize_pool', 'eligibility', 'organizers', 'tech_focus', 'confidence', 'source_type', 'year'],
  Listing: ['ref_id', 'collection_id', 'url', 'organizer', 'location', 'status', 'timeline', 'date_start', 'date_end', 'prize_pool', 'participants', 'tags', 'event_id', 'confidence', 'extracted_at', 'source_type'],
  Organizer: ['ref_id', 'entity_type', 'url', 'events', 'source_type', 'confidence'],
  PainPoint: ['ref_demo_id'],
  Source: ['url', 'domain', 'source_type', 'ref_id', 'events', 'demos', 'confidence'],
  Team: ['ref_id', 'entity_type', 'url', 'demos', 'source_type', 'confidence'],
  Tech: ['category', 'foss', 'license', 'vendor', 'tco_notes', 'foss_alternatives', 'ref_id'],
}

const DOMAIN_CLUSTER_LABELS = {
  Collection: 'Collections', Demo: 'Demos · core', Domain: 'Domains', Event: 'Events', Listing: 'Listings',
  Location: 'Locations', Organizer: 'Organizers', PainPoint: 'Pain points', Platform: 'Platforms',
  Product: 'Products', Source: 'Sources', SourceType: 'Source types', Team: 'Teams', Tech: 'Technologies',
}

function projectDomainProperties(node) {
  const properties = {
    'visual:community': DOMAIN_CLUSTER_LABELS[node.type] || `${node.type}s`,
  }
  const allowedFields = DOMAIN_NODE_FIELDS[node.type] || []
  for (const field of allowedFields) {
    const value = node.meta?.[field]
    if (value !== undefined) properties[field] = value
  }
  return properties
}

function buildDomainProjection(sourceGraph, sourceDigest) {
  if (!sourceGraph || !Array.isArray(sourceGraph.nodes) || !Array.isArray(sourceGraph.links)) {
    throw new Error('HackaMap domain graph must include node and link arrays.')
  }
  const rawNodes = sourceGraph.nodes.map(node => {
    if (!node || typeof node.id !== 'string' || typeof node.label !== 'string' || typeof node.type !== 'string') {
      throw new Error('HackaMap domain graph contains an invalid node.')
    }
    return { id: node.id, type: node.type, label: node.label, properties: projectDomainProperties(node) }
  })
  const nodeTypes = [...new Set(rawNodes.map(node => node.type))].sort(compareNames)
  const nodeTypeIndex = new Map(nodeTypes.map((type, index) => [type, index]))
  const nodes = rawNodes.map(node => [node.id, nodeTypeIndex.get(node.type), node.label, node.properties])
  const nodeIndexById = new Map(rawNodes.map((node, index) => [node.id, index]))
  const rawEdges = sourceGraph.links.map(edge => {
    if (!edge || typeof edge.type !== 'string') throw new Error('HackaMap domain graph contains an invalid link.')
    const source = nodeIndexById.get(edge.source)
    const target = nodeIndexById.get(edge.target)
    if (source === undefined || target === undefined) throw new Error(`HackaMap domain link has a missing endpoint: ${edge.type}`)
    return [source, target, edge.type]
  })
  const edgeTypes = [...new Set(rawEdges.map(([, , type]) => type))].sort(compareNames)
  const edgeTypeIndex = new Map(edgeTypes.map((type, index) => [type, index]))
  const edges = rawEdges.map(([source, target, type]) => [source, target, edgeTypeIndex.get(type)])
  const projection = {
    schema: DOMAIN_PROJECTION_SCHEMA,
    source_path: HACKAMAP_GRAPH_SOURCE_PATH,
    source_sha256: sourceDigest,
    node_count: nodes.length,
    edge_count: edges.length,
    node_types: nodeTypes,
    link_types: edgeTypes,
    nodes,
    edges,
  }
  const text = JSON.stringify(projection)
  const bytes = Buffer.byteLength(text)
  if (bytes >= MAX_DOMAIN_PROJECTION_BYTES) {
    throw new Error(`HackaMap domain projection exceeds ${MAX_DOMAIN_PROJECTION_BYTES} bytes (${bytes}).`)
  }
  const nodeTypeCounts = {}
  const edgeTypeCounts = {}
  for (const [, typeIndex] of nodes) {
    const type = nodeTypes[typeIndex]
    nodeTypeCounts[type] = (nodeTypeCounts[type] || 0) + 1
  }
  for (const [, , typeIndex] of edges) {
    const type = edgeTypes[typeIndex]
    edgeTypeCounts[type] = (edgeTypeCounts[type] || 0) + 1
  }
  return { text, bytes, nodeTypeCounts, edgeTypeCounts, sourceDigest, nodes: nodes.length, edges: edges.length }
}

function buildDomainManifest({ domain, sourceFiles, sourceParts, totalBytes, sourcePath }) {
  const quote = value => JSON.stringify(value)
  return [
    '---',
    'title: "HackaMap demo domain graph"',
    'document_type: "hackamap-domain-manifest"',
    'kgCanvasGraphApply: false',
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "d3"',
    'kgDocumentSemanticMode: "document"',
    'kgFrontmatterModeEnabled: true',
    'kgMultiDimTableModeEnabled: true',
    'kgDocumentStructureBaselineLock: false',
    `hackamap_projection: ${quote(DOMAIN_PROJECTION_SOURCE_PATH)}`,
    `hackamap_projection_sha256: ${quote(domain.digest)}`,
    `hackamap_node_count: ${domain.nodes}`,
    `hackamap_edge_count: ${domain.edges}`,
    `hackamap_source_sha256: ${quote(domain.sourceDigest)}`,
    `hackamap_source_path: ${quote(domain.sourcePath)}`,
    `hackamapSourcePath: ${quote(sourcePath)}`,
    `hackamapSourceFileCount: ${sourceFiles.length}`,
    `hackamapSourcePartCount: ${sourceParts}`,
    `hackamapSourceTotalBytes: ${totalBytes}`,
    'hackamapSourceInventory: true',
    '---',
    '',
    '# HackaMap demo domain graph',
    '',
    `This D3 graph renders all ${domain.nodeTypes.Demo || 0} demo nodes as its core, with all ${domain.nodes} domain nodes and ${domain.edges} typed relationships from \`${domain.sourcePath}\`. Demo nodes retain event, problem, solution, product, team, technology, award, source-confidence, and year fields. Clusters are grouped by entity type; edge labels preserve the HackaMap relationship types.`,
    '',
    '| Node cluster | Nodes |',
    '|---|---:|',
    ...Object.entries(domain.nodeTypes).sort(([left], [right]) => compareNames(left, right)).map(([type, count]) => `| ${DOMAIN_CLUSTER_LABELS[type] || type} | ${count} |`),
    '',
    '| Relationship | Edges |',
    '|---|---:|',
    ...Object.entries(domain.edgeTypes).sort(([left], [right]) => compareNames(left, right)).map(([type, count]) => `| \`${type}\` | ${count} |`),
    '',
    `The complete repository inventory contains ${sourceFiles.length} files (${sourceParts} source documents, ${totalBytes} bytes); paths and preview links are in \`manifest.csv\`. Full source content remains under \`source-files/\`. Codebase indexing is available in \`codebase.md\`. The repository source manifest is ${sourcePath}.`,
    '',
  ].join('\n')
}

function buildHackamapDomainProjection(sourceGraph, sourceDigest) {
  const projection = buildDomainProjection(sourceGraph, sourceDigest)
  return {
    ...projection,
    digest: createHash('sha256').update(projection.text).digest('hex'),
    sourcePath: HACKAMAP_GRAPH_SOURCE_PATH,
    nodeTypes: projection.nodeTypeCounts,
    edgeTypes: projection.edgeTypeCounts,
  }
}

function buildNativeCodebaseProjection({ sourceRoot, projectionPath }) {
  const scriptPath = path.join(repoRoot, 'scripts', 'build-hackamap-codebase-projection.ts')
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', scriptPath, sourceRoot, projectionPath], {
      cwd: repoRoot,
      env: { ...process.env, TSX_TSCONFIG_PATH: path.join(canvasRoot, 'tsconfig.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = '', stderr = ''
    const timeout = setTimeout(() => child.kill('SIGTERM'), 65_000)
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
    child.once('error', error => { clearTimeout(timeout); reject(error) })
    child.once('close', code => {
      clearTimeout(timeout)
      if (code !== 0) return reject(new Error(stderr.trim() || `Agent Graph indexing exited with code ${code}`))
      try { resolve(JSON.parse(stdout)) }
      catch { reject(new Error('Agent Graph indexing returned malformed projection metadata')) }
    })
  })
}

function buildInventoryCsv(sourceFiles) {
  const field = value => `"${String(value ?? '').replace(/"/g, '""')}"`
  const rows = sourceFiles.map(file => [
    file.relativePath,
    file.kind,
    file.bytes,
    file.parts,
    file.previewPaths.map(sourcePath => sourcePath.replace(/^hackamap\//, '')).join('; '),
  ].map(field).join(','))
  return [
    ['Repository path', 'Type', 'Bytes', 'Parts', 'Source documents'].map(field).join(','),
    ...rows,
    '',
  ].join('\n')
}

export async function buildHackamapProjection({ hackamapRoot, overrideRoot, indexCodebase = buildNativeCodebaseProjection }) {
  const buildStarted = performance.now()
  const sourceRoot = await realpath(hackamapRoot)
  const sourcePath = path.join(sourceRoot, 'site', 'hackamap-ssot.md')
  const ssotText = await readFile(sourcePath, 'utf8').catch(error => {
    throw new Error(`Unable to read HackaMap SSOT at ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`)
  })
  if (!ssotText.trim()) throw new Error(`HackaMap SSOT is empty: ${sourcePath}`)

  const files = await collectRepositoryFiles(sourceRoot)
  const sourceProjectionStarted = performance.now()
  const domainSourcePath = path.join(sourceRoot, HACKAMAP_GRAPH_SOURCE_PATH)
  const projected = []
  const materializedDirectories = new Set()
  let projectedPartCount = 0
  let totalBytes = 0
  let domainSourceDigest = ''
  let sourceGraph = null
  for (const file of files) {
    const buffer = await readFile(file.absolutePath)
    totalBytes += buffer.byteLength
    if (file.relativePath === HACKAMAP_GRAPH_SOURCE_PATH) {
      domainSourceDigest = createHash('sha256').update(buffer).digest('hex')
      try {
        sourceGraph = JSON.parse(buffer.toString('utf8'))
      } catch {
        throw new Error(`HackaMap domain graph is not valid JSON: ${domainSourcePath}`)
      }
    }
    let text = null
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer)
    } catch {
      text = null
    }
    const encoding = text === null ? 'base64' : 'utf-8'
    const chunks = text === null
      ? splitBuffer(buffer, BINARY_CHUNK_BYTES).map(chunk => chunk.toString('base64'))
      : splitText(text, TEXT_CHUNK_BYTES)
    if (projectedPartCount + chunks.length + 2 > MAX_PROJECTED_FILES) {
      throw new Error(`HackaMap projection exceeds ${MAX_PROJECTED_FILES} Source Files entries.`)
    }
    const previewPaths = []
    for (let index = 0; index < chunks.length; index += 1) {
      const part = index + 1
      const filename = `${file.relativePath}.source${chunks.length > 1 ? `.part-${String(part).padStart(3, '0')}` : ''}.md`
      const projectionPath = path.posix.join('hackamap', 'source-files', filename)
      const destination = path.join(overrideRoot, ...projectionPath.split('/'))
      const document = wrapSourcePart({
        originalPath: file.relativePath,
        originalBytes: buffer.byteLength,
        part,
        parts: chunks.length,
        encoding,
        content: chunks[index],
      })
      if (Buffer.byteLength(document) > SOURCE_DOC_LIMIT_BYTES) {
        throw new Error(`Projected source part exceeds ${SOURCE_DOC_LIMIT_BYTES} bytes: ${file.relativePath}`)
      }
      const destinationDirectory = path.dirname(destination)
      if (!materializedDirectories.has(destinationDirectory)) {
        await mkdir(destinationDirectory, { recursive: true })
        materializedDirectories.add(destinationDirectory)
      }
      await writeFile(destination, document, 'utf8')
      previewPaths.push(projectionPath)
      projectedPartCount += 1
    }
    projected.push({
      relativePath: file.relativePath,
      bytes: buffer.byteLength,
      kind: encoding,
      parts: chunks.length,
      previewPaths,
    })
  }
  const sourceProjectionMs = performance.now() - sourceProjectionStarted

  const domainProjectionStarted = performance.now()
  if (!sourceGraph || !domainSourceDigest) throw new Error(`HackaMap domain graph is missing: ${domainSourcePath}`)
  const domain = buildHackamapDomainProjection(sourceGraph, domainSourceDigest)
  const domainProjectionPath = path.join(overrideRoot, 'hackamap', 'manifest.graph.json')
  const codebaseProjectionPath = path.join(overrideRoot, 'hackamap', 'codebase.graph.json')
  await writeFile(domainProjectionPath, domain.text, 'utf8')
  const domainProjectionMs = performance.now() - domainProjectionStarted
  const codebaseIndexStarted = performance.now()
  const codebase = await indexCodebase({ sourceRoot, projectionPath: codebaseProjectionPath })
  const codebaseIndexMs = performance.now() - codebaseIndexStarted
  const manifest = buildDomainManifest({ domain, sourceFiles: projected, sourceParts: projectedPartCount, totalBytes, sourcePath })
  const codebaseManifest = buildIndex({ sourceFiles: projected, sourceParts: projectedPartCount, totalBytes, sourcePath, codebase })
  const overview = buildOverview({ sourceFiles: projected, sourceParts: projectedPartCount, totalBytes, sourcePath })
  const ssotWrapperPath = path.join(overrideRoot, 'agentic-graph-hackamap.md')
  await writeFile(ssotWrapperPath, overview, 'utf8')
  const indexPath = path.join(overrideRoot, 'hackamap', 'manifest.md')
  const codebaseIndexPath = path.join(overrideRoot, 'hackamap', 'codebase.md')
  const inventoryPath = path.join(overrideRoot, 'hackamap', 'manifest.csv')
  await mkdir(path.dirname(indexPath), { recursive: true })
  await writeFile(indexPath, manifest, 'utf8')
  await writeFile(codebaseIndexPath, codebaseManifest, 'utf8')
  await writeFile(inventoryPath, buildInventoryCsv(projected), 'utf8')
  const metrics = {
    sourceProjectionMs: Math.round(sourceProjectionMs),
    domainProjectionMs: Math.round(domainProjectionMs),
    codebaseIndexMs: Math.round(codebaseIndexMs),
    totalMs: Math.round(performance.now() - buildStarted),
    sourceBytes: totalBytes,
  }
  return { sourcePath, sourceFiles: projected.length, sourceParts: projectedPartCount, totalBytes,
    indexPath, codebaseIndexPath, inventoryPath, domainProjectionPath, domain, codebaseProjectionPath, codebase, ssotWrapperPath, metrics }
}

async function prepareSourceBackedSeed(options) {
  const localPreviewRoot = path.join(repoRoot, '.workspace')
  await mkdir(localPreviewRoot, { recursive: true })
  const overrideRoot = await mkdtemp(path.join(localPreviewRoot, 'hackamap-table-'))
  try {
    const projection = await buildHackamapProjection({ hackamapRoot: options.hackamapRoot, overrideRoot })
    return { overrideRoot, ...projection }
  } catch (error) {
    await rm(overrideRoot, { recursive: true, force: true })
    throw error
  }
}

function buildLoopbackUrl(options) {
  return `http://${options.host}:${options.port}/?kgDoc=${encodeURIComponent(DEFAULT_DOC_PATH)}`
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const prepared = await prepareSourceBackedSeed(options)
  const loopbackUrl = buildLoopbackUrl(options)

  process.stdout.write(`[hackamap:table] Source: ${prepared.sourcePath}\n`)
  process.stdout.write(`[hackamap:table] Source Files: ${prepared.sourceFiles} files, ${prepared.sourceParts} parts, ${prepared.totalBytes} bytes\n`)
  process.stdout.write(`[hackamap:table] Manifest: ${prepared.indexPath}\n`)
  process.stdout.write(`[hackamap:table] Domain graph: ${prepared.domain.nodes} nodes, ${prepared.domain.edges} edges, ${prepared.domain.bytes} bytes\n`)
  process.stdout.write(`[hackamap:table] Codebase manifest: ${prepared.codebaseIndexPath}\n`)
  process.stdout.write(`[hackamap:table] CSV inventory: ${prepared.inventoryPath}\n`)
  process.stdout.write(`[hackamap:table] Codebase index: ${prepared.codebase.counts.sources} sources, ${prepared.codebase.projectedNodes} projected nodes, ${prepared.codebase.projectedEdges} projected relationships\n`)
  process.stdout.write(`[hackamap:table] Index reuse: ${prepared.codebase.indexRun?.reusedSources ?? 0} reused, ${prepared.codebase.indexRun?.parsedSources ?? 0} parsed; ${prepared.codebase.indexRun?.visitedFiles ?? 0} files / ${prepared.codebase.indexRun?.admittedBytes ?? 0} admitted bytes\n`)
  process.stdout.write(`[hackamap:table] Build timing: Source Files ${prepared.metrics.sourceProjectionMs} ms, domain graph ${prepared.metrics.domainProjectionMs} ms, codebase index ${prepared.metrics.codebaseIndexMs} ms, total ${prepared.metrics.totalMs} ms\n`)
  process.stdout.write(`[hackamap:table] Seed override: ${prepared.overrideRoot}\n`)
  process.stdout.write(`[hackamap:table] Open: ${loopbackUrl}\n`)

  const child = spawn(
    process.execPath,
    [viteBinPath, '--configLoader', 'runner', '--host', options.host, '--port', String(options.port), '--strictPort'],
    {
      cwd: canvasRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        BROWSER: 'none',
        VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL: '0',
        VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT: prepared.overrideRoot,
        VITE_AGENTIC_OS_WORKSPACE_SEEDS_READ_ABS_ROOT: '',
      },
    },
  )

  const forwardSignal = signal => {
    if (!child.killed) child.kill(signal)
  }
  process.on('SIGINT', () => forwardSignal('SIGINT'))
  process.on('SIGTERM', () => forwardSignal('SIGTERM'))
  child.once('error', error => {
    process.stderr.write(`[hackamap:table] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
    void rm(prepared.overrideRoot, { recursive: true, force: true })
  })
  child.once('exit', code => {
    process.exitCode = code ?? 0
    void rm(prepared.overrideRoot, { recursive: true, force: true })
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch(error => {
    process.stderr.write(`[hackamap:table] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
