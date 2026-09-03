import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type GraphNode = { id: string; data: Record<string, unknown> }
type GraphEdge = { id: string; source: string; target: string; data: Record<string, unknown> }

const IGNORES = new Set(['node_modules', '.git', '.trae', 'dist', 'build', '.cache'])
const EXT_OK = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.py', '.css', '.svg', '.yaml', '.yml', '.md'])

function getRepoRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(currentDir, '../../..')
}

function readFileSafe(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

function listDirSafe(dirPath: string): Array<{ name: string; isDirectory: () => boolean }> {
  try {
    return readdirSync(dirPath, { withFileTypes: true }).map(entry => ({
      name: entry.name,
      isDirectory: () => entry.isDirectory(),
    }))
  } catch {
    return []
  }
}

function isOkFile(filePath: string): boolean {
  return EXT_OK.has(path.extname(filePath))
}

function classifyType(relPath: string): string {
  if (relPath.includes('/canvas/src/__tests__/')) return 'Test'
  if (relPath.includes('/canvas/src/components/')) return 'Component'
  if (relPath.includes('/canvas/src/features/')) return 'Feature'
  if (relPath.includes('/canvas/src/hooks/store/')) return 'Slice'
  if (relPath.includes('/canvas/src/workers/')) return 'Worker'
  if (relPath.includes('/canvas/src/cli/')) return 'Cli'
  if (relPath.includes('/agentic_graph_parser/')) return relPath.endsWith('.py') ? 'ParserPy' : 'Parser'
  if (relPath.includes('/data/config/')) return 'Config'
  if (relPath.endsWith('.json') || relPath.endsWith('.jsonld')) return 'Artifact'
  return 'File'
}

const importRegexes = [
  /import\s+[^'"]+\s+from\s+['"]([^'"]+)['"]/g,
  /import\s+['"]([^'"]+)['"]/g,
  /require\(\s*['"]([^'"]+)['"]\s*\)/g,
]

const importWithBindingsRe = /import\s+(.+?)\s+from\s+['"]([^'"]+)['"]/g

function parseImportBindings(bindings: string): { defaultName: string | null; named: string[]; starName: string | null } {
  const out = { defaultName: null as string | null, named: [] as string[], starName: null as string | null }
  const text = (bindings ?? '').trim()
  if (!text) return out
  if (text.startsWith('*')) {
    const match = text.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)
    out.starName = match ? match[1] ?? null : null
    return out
  }
  if (text.startsWith('{')) {
    const inside = text.replace(/^\{\s*/, '').replace(/\s*\}$/, '')
    const parts = inside.split(',').map(entry => entry.trim()).filter(Boolean)
    for (const part of parts) {
      const match = part.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/)
      if (match) out.named.push(match[2] ?? match[1] ?? '')
    }
    out.named = out.named.filter(Boolean)
    return out
  }
  if (text.includes('{')) {
    const def = text.split('{')[0]?.trim().replace(/,$/, '').trim()
    if (def) out.defaultName = def
    const inside = text.substring(text.indexOf('{') + 1, text.lastIndexOf('}'))
    const parts = inside.split(',').map(entry => entry.trim()).filter(Boolean)
    for (const part of parts) {
      const match = part.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/)
      if (match) out.named.push(match[2] ?? match[1] ?? '')
    }
    out.named = out.named.filter(Boolean)
    return out
  }
  const match = text.match(/^([A-Za-z_$][\w$]*)$/)
  if (match) out.defaultName = match[1] ?? null
  return out
}

const invokesHints: Array<{ kw: string; label: string }> = [
  { kw: 'bestMatch', label: 'invokes' },
  { kw: 'applyParserAsync', label: 'invokes' },
  { kw: 'pickTextFile', label: 'invokes' },
  { kw: 'parseGraphInWorker', label: 'usesWorker' },
  { kw: 'computeMinimapPreviewInWorker', label: 'usesWorker' },
  { kw: 'computeMinimapPreviewInWorkerWithHandle', label: 'usesWorker' },
  { kw: 'useGraphStore', label: 'readsStore' },
  { kw: 'setData(', label: 'updatesStore' },
  { kw: 'requestZoom(', label: 'updatesStore' },
]

function resolveImport(repoRoot: string, fromRel: string, spec: string): string | null {
  if (!spec) return null
  if (spec.startsWith('.')) {
    const candidate = path.normalize(path.join(path.dirname(fromRel), spec))
    const exts = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx', '/index.js', '/index.mjs']
    for (const ext of exts) {
      const abs = path.join(repoRoot, candidate + ext)
      if (existsSync(abs) && statSync(abs).isFile()) {
        return path.relative(repoRoot, abs)
      }
    }
    return path.relative(repoRoot, candidate)
  }
  return `module:${spec}`
}

function walkFiles(repoRoot: string): string[] {
  const stack: string[] = [repoRoot]
  const files: string[] = []
  while (stack.length) {
    const dir = stack.pop()
    if (!dir) continue
    const entries = listDirSafe(dir)
    for (const entry of entries) {
      if (IGNORES.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
        continue
      }
      if (!isOkFile(full)) continue
      files.push(path.relative(repoRoot, full))
    }
  }
  return files
}

function buildGraph(repoRoot: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const nodeById = new Map<string, GraphNode>()
  const edgeSet = new Set<string>()

  const panelSystemId = 'ui:PanelSystem'
  const panelSystemNode: GraphNode = { id: panelSystemId, data: { type: 'PanelSystem', name: 'PanelSystem' } }
  nodes.push(panelSystemNode)
  nodeById.set(panelSystemId, panelSystemNode)

  const storeNode: GraphNode = { id: 'store:graph', data: { type: 'Store', name: 'GraphStore' } }
  nodes.push(storeNode)
  nodeById.set(storeNode.id, storeNode)

  const files = walkFiles(repoRoot)
  for (const rel of files) {
    const type = classifyType(rel)
    const name = path.basename(rel)
    const node: GraphNode = { id: rel, data: { type, name, path: rel } }
    nodes.push(node)
    nodeById.set(node.id, node)

    const isPanelView =
      rel.includes('canvas/src/features/panels/views/') ||
      /canvas\/src\/components\/(SchemaEditorPanel|SettingsPanel|HistoryPanel|HelpPanel)\.tsx$/.test(rel)
    const isPanelCore = rel === 'canvas/src/features/panels/Panel.tsx'
    if (isPanelView || isPanelCore) {
      const eid = `${node.id}|providesPanel|${panelSystemId}`
      if (!edgeSet.has(eid)) {
        edges.push({ id: eid, source: node.id, target: panelSystemId, data: { type: 'providesPanel' } })
        edgeSet.add(eid)
      }
    }
  }

  for (const rel of files) {
    const srcId = rel
    const body = readFileSafe(path.join(repoRoot, rel))
    if (!body) continue

    const localToTarget: Record<string, string> = {}
    importWithBindingsRe.lastIndex = 0
    let importMatch: RegExpExecArray | null
    while ((importMatch = importWithBindingsRe.exec(body))) {
      const bindings = parseImportBindings(importMatch[1] ?? '')
      const spec = importMatch[2] ?? ''
      const tgtRel = resolveImport(repoRoot, rel, spec)
      const tgtId = tgtRel ? tgtRel : spec ? `module:${spec}` : null
      if (tgtId) {
        if (bindings.defaultName) localToTarget[bindings.defaultName] = tgtId
        if (bindings.starName) localToTarget[bindings.starName] = tgtId
        for (const nm of bindings.named) localToTarget[nm] = tgtId
      }
    }

    for (const re of importRegexes) {
      re.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = re.exec(body))) {
        const spec = match[1] ?? ''
        const tgtRel = resolveImport(repoRoot, rel, spec)
        const isModule = typeof tgtRel === 'string' && tgtRel.startsWith('module:')
        const tgtId = tgtRel ?? ''
        const label = 'imports'

        if (tgtId && !isModule) {
          if (!nodeById.has(tgtId)) {
            const ext = path.extname(tgtId)
            const fileType = ext === '.css' ? 'Style' : ext === '.svg' ? 'Image' : ext === '.json' || ext === '.jsonld' ? 'Artifact' : 'File'
            const node: GraphNode = { id: tgtId, data: { type: fileType, name: path.basename(tgtId), path: tgtId } }
            nodes.push(node)
            nodeById.set(tgtId, node)
          }
          const eid = `${srcId}|${label}|${tgtId}`
          if (!edgeSet.has(eid)) {
            edges.push({ id: eid, source: srcId, target: tgtId, data: { type: label } })
            edgeSet.add(eid)
          }
        } else {
          const moduleId = isModule ? tgtId : `module:${spec}`
          const eid = `${srcId}|${label}|${moduleId}`
          if (!nodeById.has(moduleId)) {
            const modNode: GraphNode = { id: moduleId, data: { type: 'Module', name: spec } }
            nodes.push(modNode)
            nodeById.set(moduleId, modNode)
          }
          if (!edgeSet.has(eid)) {
            edges.push({ id: eid, source: srcId, target: moduleId, data: { type: label } })
            edgeSet.add(eid)
          }
        }
      }
    }

    for (const hint of invokesHints) {
      if (!body.includes(hint.kw)) continue
      let tgtId: string | null = null
      if (hint.kw.includes('Worker')) {
        tgtId = files.find(file => file.includes('/workers/')) ?? null
      } else if (hint.kw === 'useGraphStore') {
        tgtId = 'store:graph'
      } else if (hint.kw === 'bestMatch' || hint.kw === 'applyParserAsync' || hint.kw === 'pickTextFile') {
        tgtId = files.find(file => file.includes('/features/parsers/')) ?? null
      }
      const label = hint.label
      if (tgtId) {
        const eid = `${srcId}|${label}|${tgtId}`
        if (!edgeSet.has(eid)) {
          edges.push({ id: eid, source: srcId, target: tgtId, data: { type: label } })
          edgeSet.add(eid)
        }
      } else if (label === 'updatesStore' || label === 'readsStore') {
        const eid = `${srcId}|${label}|store:graph`
        if (!edgeSet.has(eid)) {
          edges.push({ id: eid, source: srcId, target: 'store:graph', data: { type: label } })
          edgeSet.add(eid)
        }
      }
    }

    const jsxRe = /<([A-Z][A-Za-z0-9_]*)\b/g
    jsxRe.lastIndex = 0
    let jsxMatch: RegExpExecArray | null
    const seen = new Set<string>()
    while ((jsxMatch = jsxRe.exec(body))) {
      const comp = jsxMatch[1] ?? ''
      const tgtId = comp ? localToTarget[comp] : undefined
      if (tgtId && !seen.has(comp)) {
        const eid = `${srcId}|renders|${tgtId}`
        if (!edgeSet.has(eid)) {
          edges.push({ id: eid, source: srcId, target: tgtId, data: { type: 'renders' } })
          edgeSet.add(eid)
        }
        seen.add(comp)
      }
    }
  }

  const pipelinePy = path.join(repoRoot, 'agentic_graph_parser', 'pipeline_cmd.py')
  if (existsSync(pipelinePy)) {
    const pipelineRel = path.relative(repoRoot, pipelinePy)
    const srcId = pipelineRel
    if (!nodeById.has(srcId)) {
      const node: GraphNode = { id: srcId, data: { type: 'ScriptPy', name: 'pipeline_cmd.py', path: pipelineRel } }
      nodes.push(node)
      nodeById.set(srcId, node)
    }

    const testDataDir = path.join(repoRoot, 'test-data')
    const outDir = path.join(repoRoot, 'data', 'outputs')
    const testFiles = listDirSafe(testDataDir)
      .map(entry => path.relative(repoRoot, path.join(testDataDir, entry.name)))
      .filter(rel => rel.endsWith('.json') || rel.endsWith('.csv') || rel.endsWith('.jsonld'))
    for (const tRel of testFiles) {
      if (!nodeById.has(tRel)) {
        const node: GraphNode = { id: tRel, data: { type: 'Artifact', name: path.basename(tRel), path: tRel } }
        nodes.push(node)
        nodeById.set(tRel, node)
      }
      const eid = `${srcId}|consumesInput|${tRel}`
      if (!edgeSet.has(eid)) {
        edges.push({ id: eid, source: srcId, target: tRel, data: { type: 'consumesInput' } })
        edgeSet.add(eid)
      }
    }

    const outEntries = listDirSafe(outDir).map(entry => path.relative(repoRoot, path.join(outDir, entry.name)))
    for (const oRel of outEntries) {
      if (!nodeById.has(oRel)) {
        const node: GraphNode = { id: oRel, data: { type: 'Artifact', name: path.basename(oRel), path: oRel } }
        nodes.push(node)
        nodeById.set(oRel, node)
      }
      const eid = `${srcId}|producesOutput|${oRel}`
      if (!edgeSet.has(eid)) {
        edges.push({ id: eid, source: srcId, target: oRel, data: { type: 'producesOutput' } })
        edgeSet.add(eid)
      }
    }
  }

  return {
    nodes: nodes.map(node => ({ id: node.id, data: node.data })),
    edges: edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, data: edge.data })),
  }
}

function main(): void {
  const repoRoot = getRepoRoot()
  const outPath = path.join(repoRoot, 'test-data', 'agentic-graph-workflow.json')
  const graph = buildGraph(repoRoot)
  writeFileSync(outPath, JSON.stringify(graph, null, 2), 'utf8')
  process.stdout.write(`Wrote ${outPath}: nodes=${graph.nodes.length}, edges=${graph.edges.length}\n`)
}

main()
