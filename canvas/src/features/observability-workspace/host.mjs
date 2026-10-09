import path from 'node:path'
import os from 'node:os'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readWorkspaceObservationSource, readWorkspaceCodebaseIndex } from '../../../viteWorkspaceObservationBridge.mjs'
import { readWorkflowArchiveRequest } from '../../../viteWorkflowArchiveBridge.mjs'
import { runAgentGraphTool } from '../../../../mcp/agent-graph-host.js'
import { AGENT_GRAPH_TOOL_NAMES } from '../../../../mcp/agent-graph/runtime.mjs'
import { loadRepositoryProfile } from 'agentic-os/adapters/git'
import { CONTEXT_LIMITS, createCodebaseContext } from 'agentic-os/context/codebase'
import { parseRepositoryUrl } from '../../../../mcp/agent-graph/repository-acquisition.mjs'

export const WORKSPACE_SCHEMA = 'agentic-canvas-os/observability-workspace/v1'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
export function validateWorkspaceManifest(value) {
  if (!value || value.schema !== WORKSPACE_SCHEMA || value.readOnly !== true
    || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 160
    || !Array.isArray(value.repositories) || !value.repositories.length || value.repositories.length > 32
    || Object.keys(value).some(key => !['schema', 'title', 'readOnly', 'repositories'].includes(key))) throw Error('Invalid observability workspace manifest')
  const ids = new Set()
  for (const row of value.repositories) {
    if (!row || Object.keys(row).some(key => !['id', 'label', 'path', 'buildRevision'].includes(key)) || typeof row.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(row.id)
      || ids.has(row.id) || typeof row.label !== 'string' || !row.label.trim() || row.label.length > 160
      || typeof row.path !== 'string' || !row.path || row.path.length > 1024 || path.isAbsolute(row.path)
      || /[\\\0\r\n]/.test(row.path) || row.path.split('/').some(part => !part || part === '..' || part === '.')) throw Error('Invalid workspace repository')
    if (row.buildRevision !== undefined && !/^[a-f0-9]{40}$/.test(row.buildRevision)) throw Error('Invalid repository build revision')
    ids.add(row.id)
  }
  return value
}
export function loadWorkspaceManifest(file, workspaceRoot, { allowMissingRepositories = false } = {}) {
  if (!path.isAbsolute(file || '') || !path.isAbsolute(workspaceRoot || '')) throw Error('Explicit absolute workspace manifest and root are required')
  if (statSync(file).size > 32000) throw Error('Workspace manifest exceeds 32000 bytes')
  const bytes = readFileSync(file), value = validateWorkspaceManifest(JSON.parse(bytes.toString('utf8')))
  const root = realpathSync(workspaceRoot)
  const repositories = value.repositories.map(row => {
    const candidate = path.resolve(root, row.path), lexical = path.relative(root, candidate)
    if (!lexical || lexical.startsWith('..' + path.sep) || lexical === '..' || path.isAbsolute(lexical)) throw Error('Repository escapes the configured workspace')
    let resolved
    try { resolved = realpathSync(candidate) }
    catch (error) {
      if (!allowMissingRepositories || error.code !== 'ENOENT') throw error
      let parent = path.dirname(candidate), checked = false
      while (parent !== root && parent !== path.dirname(parent)) {
        try { resolved = realpathSync(parent); checked = true; break }
        catch (parentError) { if (parentError.code !== 'ENOENT') throw parentError; parent = path.dirname(parent) }
      }
      if (!checked) resolved = root
      const parentRelative = path.relative(root, resolved)
      if (parentRelative.startsWith('..' + path.sep) || parentRelative === '..' || path.isAbsolute(parentRelative)
        || !statSync(resolved).isDirectory()) throw Error('Repository escapes the configured workspace')
      return { ...row, resolved: null }
    }
    const relative = path.relative(root, resolved)
    if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)
      || !statSync(resolved).isDirectory()) throw Error('Repository escapes the configured workspace')
    return { ...row, resolved }
  })
  return { value, root, repositories, digest: hash(bytes) }
}
function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 5000,
    maxBuffer: 256000, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
export function captureRepositorySource(root) {
  const revision = git(root, ['rev-parse', 'HEAD']), tree = git(root, ['rev-parse', 'HEAD^{tree}'])
  const repository = loadRepositoryProfile({ repository: root }).repository
  return { repository, revision, tree, dirty: Boolean(git(root, ['status', '--porcelain', '--untracked-files=normal'])) }
}
export function selectedRepository(workspace, id) {
  const row = workspace.repositories.find(row => row.id === id)
  if (!row) throw Error('Repository is not selected in this workspace')
  if (!row.resolved) throw Error('Repository directory is unavailable in this host')
  if (realpathSync(path.resolve(workspace.root, row.path)) !== row.resolved) throw Error('Repository path changed')
  return row
}
export function bindRetainedIndexSource(result, source, expectedDigest) {
  if (!source || source.manifestDigest !== expectedDigest || result.manifestDigest !== expectedDigest) throw Error('Workflow selection changed while reading its index')
  const acquisition = result.result.acquisition
  if (!acquisition?.repositoryUrl || !/^[a-f0-9]{40}$/.test(acquisition.commitSha ?? '')) return { snapshotDigest: result.result.snapshotDigest }
  const repository = parseRepositoryUrl(acquisition.repositoryUrl)
  // A linked artifact does not inherit the workflow's source identity. Only explicit acquisition metadata binds its commit.
  return { repository: `${repository.hostname}/${repository.repositoryPath}`, revision: acquisition.commitSha, snapshotDigest: result.result.snapshotDigest }
}
export function normalizeGraphNeighborsRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['graphId', 'snapshotDigest', 'from', 'afterEdgeId', 'limit'].includes(key)))
    throw Error('Invalid graph-neighbors request')
  const { graphId, snapshotDigest, from, afterEdgeId } = value, limit = value.limit ?? 200
  if (typeof graphId !== 'string' || !/^kg:graph:[a-f0-9]{32}$/.test(graphId)
    || typeof snapshotDigest !== 'string' || !/^[a-f0-9]{64}$/.test(snapshotDigest)
    || typeof from !== 'string' || !from.trim() || from.length > 1024 || /[\x00-\x1f\x7f]/.test(from)
    || !Number.isInteger(limit) || limit < 1 || limit > 200)
    throw Error('Graph identity and a canonical node ID are required')
  if (afterEdgeId !== undefined && (typeof afterEdgeId !== 'string' || !afterEdgeId.trim()
    || afterEdgeId.length > 1024 || /[\x00-\x1f\x7f]/.test(afterEdgeId)))
    throw Error('Invalid graph-neighbors cursor')
  return { graphId, expectedSnapshotDigest: snapshotDigest, mode: 'neighbors', from,
    direction: 'both', maxDepth: 1, limit, maxDurationMs: 15000,
    ...(afterEdgeId ? { afterEdgeId } : {}) }
}
export function createObservabilityWorkspacePlugin({ manifestFile, workspaceRoot, graphRoot, allowMissingRepositories = false }) {
  const workspace = loadWorkspaceManifest(manifestFile, workspaceRoot, { allowMissingRepositories })
  const publicManifest = { ...workspace.value, repositories: workspace.value.repositories.map(({ id, label }) => ({ id, label })) }
  let busy = false, activeExpansions = 0
  let codebaseContext = null
  return {
    name: 'agentic-graph-observability-workspace',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'observability-workspace.json', source: JSON.stringify(publicManifest) }) },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost')
        if (url.pathname === '/' || url.pathname === '/index.html') { req.url = '/observability.html' + url.search; return next() }
        const manifest = url.pathname === '/observability-workspace.json' || url.pathname === '/api/observability-workspace/manifest'
        const operation = url.pathname.match(/^\/api\/observability-workspace\/(workspace-source|workspace-codebase|workflow-trace|graph-neighbors|source-context|index)$/)?.[1]
        if (!manifest && !operation) return next()
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('Content-Type', 'application/json')
        try {
          const remote = req.socket.remoteAddress
          if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) throw Error('Loopback access required')
          const host = req.headers.host || '', origin = req.headers.origin
          if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)
            || (origin && origin !== `http://${host}`)) throw Error('Same-origin access required')
          if (manifest) {
            if (req.method !== 'GET') throw Error('GET required')
            return res.end(JSON.stringify(publicManifest))
          }
          if (req.method !== 'POST' || !String(req.headers['content-type']).startsWith('application/json')) throw Error('JSON POST required')
          const chunks = []; let size = 0
          for await (const chunk of req) { size += chunk.length; if (size > 40000) throw Error('Request exceeds its bound'); chunks.push(chunk) }
          const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          const row = selectedRepository(workspace, input.repositoryId), { repositoryId, ...args } = input
          let result
          if (operation === 'workspace-source') result = await readWorkspaceObservationSource(row.resolved, args) ?? { code: 'workspace_source_unselected' }
          else if (operation === 'workspace-codebase') {
            result = await readWorkspaceCodebaseIndex(row.resolved, args)
            if (result.result) {
              const source = await readWorkspaceObservationSource(row.resolved, {})
              result.projectionSource = bindRetainedIndexSource(result, source, args.manifestDigest)
            }
          } else if (operation === 'workflow-trace') {
            const selected = await readWorkspaceObservationSource(row.resolved, {})
            if (!selected || selected.manifestText !== args.manifestText) throw Error('Workflow selection changed')
            result = await readWorkflowArchiveRequest(args, undefined, row.resolved)
            res.setHeader('Content-Type', 'text/event-stream')
          } else if (operation === 'graph-neighbors') {
            const query = normalizeGraphNeighborsRequest(args)
            if (activeExpansions >= 2) throw Error('Graph expansion is busy; retry after the current neighborhood loads')
            activeExpansions++
            const output = path.join(os.tmpdir(), 'agentic-graph-observability', hash(workspace.root).slice(0, 24))
            const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 18000)
            const cancel = () => { if (!res.writableEnded) controller.abort() }
            res.once('close', cancel)
            try {
              const expanded = await runAgentGraphTool(AGENT_GRAPH_TOOL_NAMES.query, query, {
                rootDir: graphRoot, env: { ...process.env, AGENTIC_OS_AGENT_GRAPH_ALLOWED_ROOTS: row.resolved,
                  AGENTIC_OS_AGENT_GRAPH_OUTPUT_ROOT: output }, abortSignal: controller.signal,
              })
              if (!expanded.ok || expanded.mode !== 'neighbors' || expanded.snapshotDigest !== query.expectedSnapshotDigest
                || expanded.graphId !== query.graphId || !expanded.traversal || !expanded.completeness)
                throw Error(expanded.error?.message || 'Graph expansion did not match the selected snapshot')
              result = { graphId: expanded.graphId, snapshotDigest: expanded.snapshotDigest, mode: expanded.mode,
                resolution: expanded.resolution, traversal: expanded.traversal, completeness: expanded.completeness }
            } finally { clearTimeout(timer); res.off('close', cancel); activeExpansions-- }
          } else if (operation === 'source-context') {
            const mode = args.operation
            const allowed = mode === 'map' ? ['operation', 'path', 'limit', 'after']
              : mode === 'search' ? ['operation', 'path', 'query', 'limit', 'after']
                : mode === 'read' ? ['operation', 'path', 'sha256', 'line', 'lines'] : []
            if (!allowed.length || Object.keys(args).some(key => !allowed.includes(key))) throw Error('Invalid source-context operation')
            const before = captureRepositorySource(row.resolved)
            if (!codebaseContext || codebaseContext.repositoryId !== row.id) {
              codebaseContext = { repositoryId: row.id, reader: createCodebaseContext({ root: row.resolved }) }
            }
            const sourceResult = codebaseContext.reader[mode](Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'operation')))
            const after = captureRepositorySource(row.resolved)
            if (before.revision !== after.revision || before.tree !== after.tree || before.dirty !== after.dirty)
              throw Error('Repository changed while reading source context; retry the operation')
            // The Agentic OS reader returns its host-local root in the receipt. Keep the public
            // dossier repository-relative and expose only the selected workspace identity.
            const safeSourceResult = { ...sourceResult }
            delete safeSourceResult.repositoryRoot
            result = { ...safeSourceResult, selectedRepository: { id: row.id, label: row.label },
              repositoryState: { repository: after.repository, revision: after.revision, tree: after.tree, dirty: after.dirty },
              limits: CONTEXT_LIMITS }
          } else {
            if (Object.keys(args).length) throw Error('Unexpected index arguments')
            if (busy) throw Error('An explicit local index is already running')
            busy = true
            try {
              const before = captureRepositorySource(row.resolved)
              const output = path.join(os.tmpdir(), 'agentic-graph-observability', hash(workspace.root).slice(0, 24))
              const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 65000)
              const cancel = () => { if (!res.writableEnded) controller.abort() }
              res.once('close', cancel)
              try {
                const indexed = await runAgentGraphTool('agentic-graph.agent_graph.ingest', {
                  rootPath: row.resolved, maxFiles: 20000, maxFileBytes: 2000000, maxTotalBytes: 100000000,
                  maxDurationMs: 60000, projectionLimit: 1000, projectionByteLimit: 450000, strict: true, useCache: true,
                  exclude: ['.*', '*credentials*', '*secrets*', '*.pem', '*.key', '*.p12', '*.pfx'],
                }, { rootDir: graphRoot, env: { ...process.env, AGENTIC_OS_AGENT_GRAPH_ALLOWED_ROOTS: row.resolved,
                  AGENTIC_OS_AGENT_GRAPH_OUTPUT_ROOT: output }, abortSignal: controller.signal })
                if (!indexed.ok || !indexed.complete) throw Error(indexed.error?.message || 'Index did not complete')
                const after = captureRepositorySource(row.resolved)
                if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Source changed while indexing; refresh the index')
                // A dirty checkout has no immutable Git tree binding; the snapshot still identifies its exact indexed bytes.
                const projectionSource = { repository: before.repository, ...(before.dirty ? {} : { revision: before.revision, tree: before.tree }), snapshotDigest: indexed.snapshotDigest }
                result = { result: indexed, projectionSource, sourceDirty: before.dirty }
              } finally { clearTimeout(timer); res.off('close', cancel) }
            } finally { busy = false }
          }
          const body = typeof result === 'string' ? result : JSON.stringify(result)
          if (Buffer.byteLength(body) >= 500000) throw Error('Observation exceeds its transport bound')
          res.end(body)
        } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error.message || 'Observation unavailable' })) }
      })
    },
  }
}
