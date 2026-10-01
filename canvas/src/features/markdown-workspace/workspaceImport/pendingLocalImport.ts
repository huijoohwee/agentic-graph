import { importContentDigest, loadWorkspaceSourceIndex, setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import type { WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { readPdfWorkspaceOutputDirRel } from '@/lib/pdf/pdfWorkspacePreferences'
import { fetchPdfWorkspaceDoc, importPdfToWorkspace } from '@/lib/pdf/pdfWorkspaceClient'
import { buildModelAssetMarkdownFromFile } from './glbAsset'
import { clearPendingGlbAsset, setPendingGlbAsset } from '@/lib/assets/glbAssetRuntime'
import { clearPendingSpatialCaptureAsset, setPendingSpatialCaptureAsset } from '@/lib/assets/spatialCaptureAssetRuntime'

type PendingLocalImportItem =
  | { kind: 'text'; file: File; originalName: string }
  | { kind: 'pdf'; file: File; originalName: string }
  | { kind: 'glb'; file: File; originalName: string }
  | { kind: 'gltf'; file: File; originalName: string }
  | { kind: 'ply'; file: File; originalName: string }
  | { kind: 'spz'; file: File; originalName: string }

const pendingLocalImportsByPath = new Map<string, PendingLocalImportItem>()

const PENDING_LOCAL_IMPORT_MARKER = 'kg:pending-local-import'

function buildPdfWorkspaceFrontmatter(args: { docId: string; outputDirRel: string }): string {
  return `---\nkgPdfWorkspaceDocId: "${String(args.docId || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"\nkgPdfWorkspaceOutputDirRel: "${String(args.outputDirRel || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"\n---\n\n`
}

function stripEmbeddedBase64ImageSrc(raw: string): { text: string; changed: boolean } {
  const s = String(raw || '')
  const needle = 'data:image/'
  const base64Needle = ';base64,'
  let index = 0
  let changed = false
  let out = ''
  while (index < s.length) {
    const start = s.indexOf(needle, index)
    if (start < 0) {
      out += s.slice(index)
      break
    }
    const base64Pos = s.indexOf(base64Needle, start)
    if (base64Pos < 0) {
      out += s.slice(index)
      break
    }
    out += s.slice(index, start)
    const afterBase64 = base64Pos + base64Needle.length
    const maxScan = Math.min(s.length, afterBase64 + 2_000_000)
    let end = afterBase64
    for (; end < maxScan; end += 1) {
      const ch = s.charCodeAt(end)
      if (ch === 41 || ch === 34 || ch === 39 || ch === 32 || ch === 10 || ch === 13 || ch === 9) break
    }
    changed = true
    out += 'data:image/omitted;base64,'
    index = end
  }
  return { text: out, changed }
}

export function buildPendingLocalImportStub(args: {
  kind: PendingLocalImportItem['kind']
  originalName: string
  source?: 'file' | 'folder'
  pendingPath?: string
  bytes?: number
}): string {
  const name = String(args.originalName || '').trim() || 'file'
  if (args.kind === 'glb' || args.kind === 'gltf') {
    const isGltf = args.kind === 'gltf'
    const pendingPath = String(args.pendingPath || '').trim()
    const bytes = Math.max(0, Number(args.bytes || 0))
    const formatLabel = isGltf ? 'GLTF' : 'GLB'
    return [
      '---',
      'kgAssetType: "model"',
      `kgAssetFormat: "${isGltf ? 'gltf' : 'glb'}"`,
      `kgAssetName: "${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
      'kgAssetSource: "local"',
      `kgAssetMimeType: "${isGltf ? 'model/gltf+json' : 'model/gltf-binary'}"`,
      'kgAssetPendingLocalImport: true',
      pendingPath ? `kgAssetPendingLocalPath: "${pendingPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : '',
      bytes > 0 ? `kgAssetBytes: ${bytes}` : '',
      'kgCanvasSurfaceMode: "xr"',
      'kgCanvasRenderMode: "3d"',
      'kgCanvas3dMode: "xr"',
      '---',
      '',
      `<!--${PENDING_LOCAL_IMPORT_MARKER}-->`,
      `# ${name}`,
      '',
      `> Pending local import (${formatLabel} model).`,
      `> Re-import the file if you reload before opening this ${formatLabel} model.`,
      '',
    ].filter(line => line !== '').join('\n')
  }
  const kindLabel = args.kind === 'pdf' ? 'PDF' : 'file'
  const sourceLabel = args.source === 'folder' ? 'folder import' : 'local import'
  const reloadHint = args.source === 'folder' ? 'Re-import the folder if you reload before opening this' : 'Re-import the file if you reload before opening this'
  return [
    `<!--${PENDING_LOCAL_IMPORT_MARKER}-->`,
    `> Pending ${sourceLabel} (${kindLabel}).`,
    `> ${reloadHint} ${kindLabel}.`,
    `> Original: ${name}`,
    '',
  ].join('\n')
}

export function setPendingLocalImport(path: WorkspacePath, item: PendingLocalImportItem): void {
  const key = normalizeWorkspacePath(path)
  pendingLocalImportsByPath.set(key, item)
  if (item.kind === 'glb' || item.kind === 'gltf') {
    setPendingGlbAsset(key, item.file, item.originalName, item.kind)
  } else if (item.kind === 'ply' || item.kind === 'spz') {
    setPendingSpatialCaptureAsset(key, item.file, item.originalName, item.kind)
  }
}

export function clearPendingLocalImport(path: WorkspacePath): void {
  const key = normalizeWorkspacePath(path)
  pendingLocalImportsByPath.delete(key)
  clearPendingGlbAsset(key)
  clearPendingSpatialCaptureAsset(key)
}

export function peekPendingWorkspaceLocalImport(path: WorkspacePath): PendingLocalImportItem | null {
  const key = normalizeWorkspacePath(path)
  return pendingLocalImportsByPath.get(key) || null
}

export function isPendingLocalImportStubText(text: string): boolean {
  return String(text || '').includes(PENDING_LOCAL_IMPORT_MARKER)
}

export async function hydrateWorkspaceFileFromPendingLocalImport(args: {
  fs: WorkspaceFs
  path: WorkspacePath
}): Promise<{ kind: PendingLocalImportItem['kind']; text: string } | null> {
  const key = normalizeWorkspacePath(args.path)
  const pending = pendingLocalImportsByPath.get(key)
  if (!pending) return null
  try {
    if (pending.kind === 'pdf') {
      const outputDirRel = readPdfWorkspaceOutputDirRel()
      const imported = await importPdfToWorkspace({ file: pending.file, outputDirRel })
      if (!imported) throw new Error('PDF import failed')
      if (imported.ok !== true) throw new Error(imported.error || 'PDF import failed')
      const fetched = await fetchPdfWorkspaceDoc({ docId: imported.docId, outputDirRel })
      if (!fetched) throw new Error('PDF import failed')
      if (fetched.ok !== true) throw new Error(fetched.error || 'PDF import failed')
      const markdownRaw = String(fetched.markdown || '')
      const stripped = stripEmbeddedBase64ImageSrc(markdownRaw)
      const notice = stripped.changed ? `> Embedded base64 image data omitted for editor readability.\n\n` : ''
      const text = `${buildPdfWorkspaceFrontmatter({ docId: imported.docId, outputDirRel })}${notice}${stripped.text}`
      await args.fs.writeFileText(key, text)
      await updateHydratedImportReceipt(key, text)
      pendingLocalImportsByPath.delete(key)
      return { kind: 'pdf', text }
    }

    if (pending.kind === 'glb' || pending.kind === 'gltf') {
      const text = await buildModelAssetMarkdownFromFile(pending.file, pending.kind)
      await args.fs.writeFileText(key, text)
      await updateHydratedImportReceipt(key, text)
      pendingLocalImportsByPath.delete(key)
      clearPendingGlbAsset(key)
      return { kind: pending.kind, text }
    }

    if (pending.kind === 'ply' || pending.kind === 'spz') return null

    const text = await pending.file.text()
    await args.fs.writeFileText(key, text)
    await updateHydratedImportReceipt(key, text)
    pendingLocalImportsByPath.delete(key)
    return { kind: 'text', text }
  } catch {
    return null
  }
}

async function updateHydratedImportReceipt(path: string, text: string) {
  const source = loadWorkspaceSourceIndex()[path]
  if (!source?.importState) return
  setWorkspaceEntrySource(path, { ...source, importState: { ...source.importState, outputDigest: await importContentDigest(text), checkedAt: Date.now() } }, { persist: 'sync' })
}
