import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { readStableBoundedFile } from '../mcp/bounded-file-reader.js'
const require = createRequire(import.meta.url)

/** Explicit clone-local selection of an immutable native archive, never a newest-file scan. */
export async function readWorkspaceObservationSource(repoRoot, input) {
  if (!input || Array.isArray(input) || Object.keys(input).length) throw Error('invalid_workspace_input')
  let locator
  try { locator = execFileSync('git', ['config', '--local', '--get', 'agentic-os.workflowManifest'],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 2000, maxBuffer: 8192 }).trim() }
  catch (error) { if (error.status === 1) return null; throw error }
  if (!path.isAbsolute(locator) || /[\r\n\0]/u.test(locator)) throw Error('invalid_workspace_locator')
  const owner = path.resolve(path.dirname(require.resolve('agentic-os')), '..')
  const { workflowPaths, readWorkflowManifestPage } = await import(pathToFileURL(path.join(owner, 'bin/agentic-os-workflow.mjs')).href)
  const { content } = await readStableBoundedFile({ filePath: locator, containingDirectory: path.dirname(locator),
    minimumBytes: 1, maximumBytes: 32000, requirePrivate: true })
  const manifestText = new TextDecoder('utf-8', { fatal: true }).decode(content), manifest = JSON.parse(manifestText)
  const { storage, workspace } = workflowPaths(repoRoot, manifest.source?.repository)
  const relative = path.relative(storage, locator)
  if (!/^[a-f0-9]{64}\/manifest\.json$/u.test(relative)) throw Error('workspace_archive_required')
  // The owner verifies all archive/source/digest bindings. Browser paths never grant filesystem access.
  const page = readWorkflowManifestPage(repoRoot, manifestText, 0)
  return { schema: 'agentic-graph/workspace-observation-source/v1', authority: false, manifestText,
    manifestDigest: page.manifestDigest, manifestPath: path.relative(workspace, locator) }
}
