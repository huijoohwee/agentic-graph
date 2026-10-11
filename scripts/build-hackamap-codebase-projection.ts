import { mkdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { runAgentGraphTool } from '../mcp/agent-graph-host.js'
import { AGENT_GRAPH_TOOL_NAMES } from '../mcp/agent-graph/runtime.mjs'
import { buildWorkspaceCodebaseIndexArgs, workspaceCodebaseIndexOutputRoot } from '../mcp/agent-graph/workspace-codebase-indexing.mjs'
import { buildAgentGraphCanvasProjection } from '../canvas/src/features/agent-graph/agentGraphCanvasProjectionBuilder.ts'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const MAX_MANIFEST_PROJECTION_BYTES = 500_000

async function main() {
  const [requestedRoot, projectionPath] = process.argv.slice(2)
  if (!requestedRoot || !path.isAbsolute(requestedRoot) || !projectionPath || !path.isAbsolute(projectionPath)) {
    throw new Error('Expected absolute HackaMap root and projection output paths')
  }
  const rootPath = await realpath(requestedRoot)
  const outputRoot = workspaceCodebaseIndexOutputRoot(rootPath)
  const result = await runAgentGraphTool(AGENT_GRAPH_TOOL_NAMES.ingest,
    buildWorkspaceCodebaseIndexArgs(rootPath), {
      rootDir: repoRoot,
      env: { ...process.env, AGENTIC_OS_AGENT_GRAPH_ALLOWED_ROOTS: rootPath,
        AGENTIC_OS_AGENT_GRAPH_OUTPUT_ROOT: outputRoot },
    })
  if (!result.ok || result.complete !== true) {
    throw new Error(result.error?.message || 'The local codebase index did not complete')
  }
  const graph = buildAgentGraphCanvasProjection({ ...result, handled: true, kind: 'agent-graph' })
  const text = JSON.stringify(graph)
  const bytes = Buffer.byteLength(text)
  if (bytes >= MAX_MANIFEST_PROJECTION_BYTES) {
    throw new Error(`Native codebase projection exceeds its ${MAX_MANIFEST_PROJECTION_BYTES}-byte manifest budget`)
  }
  await mkdir(path.dirname(projectionPath), { recursive: true })
  await writeFile(projectionPath, text, 'utf8')
  const identity = graph.metadata?.agentGraphProjection as Record<string, unknown>
  process.stdout.write(JSON.stringify({
    graphId: identity.graphId,
    snapshotDigest: identity.snapshotDigest,
    parserRegistryDigest: identity.parserRegistryDigest,
    counts: identity.counts,
    indexRun: {
      parsedSources: result.counts?.parsed ?? 0,
      reusedSources: result.counts?.reused ?? 0,
      visitedFiles: result.counts?.visitedFiles ?? 0,
      admittedBytes: result.counts?.admittedBytes ?? 0,
    },
    complete: identity.complete === true,
    projectedNodes: graph.nodes.length,
    projectedEdges: graph.edges.length,
    projectionTruncated: identity.projectionTruncated === true,
    projectionPath: '/docs/hackamap/codebase.graph.json',
    bytes,
  }))
}

main().catch(error => {
  process.stderr.write(`[hackamap:index] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
