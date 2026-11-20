import type { WorkspaceEntry } from './types'
import { websiteSourceBundlePath } from '@/lib/websites/websitePathUtils'

export const isLegacyVideoImportFolder = (path: string) => /^\/docs_\/\d{8}T\d{6}Z(?:-\d+)?$/.test(path)
const primaryName = /\.video-agent(?:\.source)?\.md$/
const generatedName = /^(?:dataset-operations|frame-boxes|generated-assets|moments|parse|source|stream-manifest|timeline|transcript|visual-dataset|zone-counts)\.json$|^(?:graph|transcript)\.md$|^render\.html$/

function sameManifest(old: string, current: string) {
  if (old === current) return true
  try {
    const source = JSON.parse(old), replacement = JSON.parse(current)
    if ('requiredFiles' in source || !Array.isArray(replacement.requiredFiles)) return false
    delete replacement.requiredFiles
    return JSON.stringify(source) === JSON.stringify(replacement)
  } catch { return false }
}

function relocateGeneratedText(entry: WorkspaceEntry, oldRoot: string, root: string) {
  const text = entry.text || ''
  if (/^transcript\.|^source\.json$/.test(entry.name)) return text
  return text.replaceAll(oldRoot, root).replace('\n    workspaceRoot: "/docs_"\n', '\n    workspaceRoot: "/websites"\n')
}

/** The canonical copy must already contain every old file. Keep partial, divergent and edited history. */
export function consolidateDuplicateVideoImports(next: Map<string, WorkspaceEntry>, moved: Map<string, string>) {
  const byParent = new Map<string, WorkspaceEntry[]>()
  for (const entry of next.values()) {
    const parent = entry.parentPath || ''
    if (!isLegacyVideoImportFolder(parent)) continue
    const rows = byParent.get(parent) || []
    rows.push(entry)
    byParent.set(parent, rows)
  }
  for (const [oldRoot, rows] of byParent) {
    const source = next.get(oldRoot + '/source.json')
    const primary = rows.filter(row => primaryName.test(row.name))
    if (primary.length !== 1 || !/^kgVideoAgentImport: true$/m.test(primary[0]!.text || '') || !source?.text) continue
    let root: string
    try {
      const manifest = JSON.parse(source.text)
      if (!String(manifest.schemaVersion).endsWith(':source-manifest')) continue
      if (manifest.requiredFiles && (!Array.isArray(manifest.requiredFiles) || !manifest.requiredFiles.every(
        (name: unknown) => typeof name === 'string' && !name.includes('/') && next.get(oldRoot + '/' + name)?.kind === 'file'))) continue
      if (!next.has(oldRoot + '/parse.json') || !next.has(oldRoot + '/timeline.json')) continue
      root = websiteSourceBundlePath(manifest.sourceUrl)
    } catch { continue }
    if (next.get(root)?.kind !== 'folder' || !sameManifest(source.text, next.get(root + '/source.json')?.text || '')) continue
    if (!rows.every(row => {
      const target = next.get(root + '/' + row.name)
      const base = row.name.replace(/\.part-\d+\.(txt|md)$/, '')
      return row.kind === 'file' && target?.kind === 'file' && (primaryName.test(row.name) || generatedName.test(base))
        && (row.name === 'source.json' ? sameManifest(row.text || '', target.text || '') : relocateGeneratedText(row, oldRoot, root) === target.text)
    })) continue
    const oldFolder = next.get(oldRoot)
    for (const old of oldFolder ? [oldFolder, ...rows] : rows) {
      const path = root + old.path.slice(oldRoot.length)
      const target = next.get(path)!
      next.set(path, { ...target, previousPaths: [...new Set([...(target.previousPaths || []), ...(old.previousPaths || []), old.path])] })
      next.delete(old.path)
      moved.set(old.path, path)
    }
  }
}

/** The host may still supply a dated mirror. Only suppress a proven, still-equivalent alias. */
export function isDuplicateVideoMirror(target: WorkspaceEntry, mirror: WorkspaceEntry) {
  const oldRoot = mirror.kind === 'folder' ? mirror.path : mirror.parentPath || ''
  const root = target.kind === 'folder' ? target.path : target.parentPath || ''
  return isLegacyVideoImportFolder(oldRoot) && root.startsWith('/websites/') && mirror.kind === target.kind
    && (mirror.kind === 'folder' || relocateGeneratedText(mirror, oldRoot, root) === target.text)
}
