import type { WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import type { WorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { mirrorChatWorkspaceBinaryFileToHost, mirrorChatWorkspaceFileToHost } from '@/features/chat/chatWorkspaceMirror'
import { buildCorpusMediaMetadataMarkdown } from '@/features/queryable-corpus/corpusGraph'
import { deriveFilenameFromUrl, buildLocalFsFetchPath, buildCodebaseFilePath, normalizeGitHubBlobLikeUrl } from '@/lib/url'
import { resolveBinaryDownloadProxyUrl } from '@/lib/chatEndpoint'
import {
  buildXrPngGlbAssetMarkdown,
  buildXrPngGltfAssetMarkdown,
  buildXrSvgGlbAssetMarkdown,
  buildXrSvgGltfAssetMarkdown,
} from './xrModelAsset'

export const XR_IMAGE_MODEL_WORKSPACE_ROOT = '/image/agentic-graph/xr'

export type XrImageAssetFormat = 'png' | 'svg'

export type XrImageWorkspaceArtifact = {
  path: WorkspacePath
  name: string
  text: string
  role: 'source' | 'glb' | 'gltf'
}

export type XrImageWorkspaceImportResult = {
  createdPaths: WorkspacePath[]
  sources: Array<{ path: WorkspacePath; source: WorkspaceEntrySource }>
  artifacts: XrImageWorkspaceArtifact[]
  sourceText: string
}

type MirrorTextFn = (args: { workspacePath: string; text: string }) => Promise<boolean>
type MirrorBinaryFn = (args: { workspacePath: string; bytes: ArrayBuffer | Uint8Array }) => Promise<boolean>
let mirrorTextForTests: MirrorTextFn | null = null
let mirrorBinaryForTests: MirrorBinaryFn | null = null

export function setXrImageWorkspaceArtifactMirrorForTests(fn: MirrorTextFn | null, binaryFn?: MirrorBinaryFn | null): void {
  mirrorTextForTests = fn
  mirrorBinaryForTests = typeof binaryFn === 'undefined'
    ? (fn ? async () => true : null)
    : binaryFn
}

function normalizeExt(name: unknown): string {
  const lower = String(name || '').trim().toLowerCase().split(/[?#]/)[0] || ''
  const dot = lower.lastIndexOf('.')
  return dot >= 0 ? lower.slice(dot) : ''
}

function normalizeMime(value: unknown): string {
  return String(value || '').toLowerCase().split(';')[0].trim()
}

export function getXrImageAssetFormat(name: unknown, mime?: unknown): XrImageAssetFormat | null {
  const ext = normalizeExt(name)
  const type = normalizeMime(mime)
  if (ext === '.png' || type === 'image/png') return 'png'
  if (ext === '.svg' || ext === '.svgz' || type === 'image/svg+xml') return 'svg'
  return null
}

export function isXrImageAssetFile(file: File): boolean {
  return !!getXrImageAssetFormat(file?.name, file?.type)
}

export function isXrImageAssetUrl(url: unknown): boolean {
  const raw = String(url || '')
  return !!getXrImageAssetFormat(raw) || !!getXrImageAssetFormat(normalizeGitHubBlobLikeUrl(raw) || '')
}

function safeStem(name: unknown): string {
  const raw = String(name || '').trim().split(/[?#]/)[0] || 'image'
  const fileName = raw.split(/[\\/]/).filter(Boolean).pop() || raw
  return (fileName.replace(/\.(?:png|svgz?|jpe?g|webp|gif|avif)$/i, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || 'image')
    .slice(0, 80)
}

function deriveXrImageSourceNameFromUrl(url: string, fallback: string): string {
  const raw = String(url || '').trim()
  const localPath = raw.replace(/^file:\/\//i, '').split(/[?#]/)[0] || ''
  if (localPath.startsWith('/')) {
    const fileName = localPath.split(/[\\/]/).filter(Boolean).pop() || ''
    if (fileName) {
      try {
        return decodeURIComponent(fileName)
      } catch {
        return fileName
      }
    }
  }
  const derived = deriveFilenameFromUrl(raw, fallback)
  try {
    return decodeURIComponent(derived)
  } catch {
    return derived
  }
}

function isCorsReadableGitHubRawAssetUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'raw.githubusercontent.com'
  } catch {
    return false
  }
}

async function ensureFolderPath(fs: WorkspaceFs, folderPath: WorkspacePath): Promise<WorkspacePath> {
  const normalized = normalizeWorkspacePath(folderPath)
  const segments = normalized.split('/').filter(Boolean)
  const existingFolders = new Set(
    (await fs.listEntries().catch(() => []))
      .filter(entry => entry.kind === 'folder')
      .map(entry => normalizeWorkspacePath(entry.path)),
  )
  let parent = '/'
  for (const segment of segments) {
    const next = normalizeWorkspacePath(`${parent}/${segment}`)
    if (!existingFolders.has(next)) {
      try {
        const created = await fs.createFolder({ parentPath: parent, name: segment })
        existingFolders.add(normalizeWorkspacePath(created))
      } catch {
        void 0
      }
    }
    parent = next
  }
  return normalized
}

async function writeArtifactFile(args: {
  fs: WorkspaceFs
  parentPath: WorkspacePath
  name: string
  text: string
  role: XrImageWorkspaceArtifact['role']
  mirrorToHost?: boolean
}): Promise<XrImageWorkspaceArtifact> {
  const desiredPath = normalizeWorkspacePath(`${args.parentPath}/${args.name}`)
  const existingText = await args.fs.readFileText(desiredPath).catch(() => null)
  const path = existingText === args.text
    ? desiredPath
    : await args.fs.createFile({ parentPath: args.parentPath, name: args.name, text: args.text })
  const text = existingText === args.text ? existingText : args.text
  if (args.mirrorToHost !== false) {
    const mirror = mirrorTextForTests || mirrorChatWorkspaceFileToHost
    await mirror({ workspacePath: path, text: text || args.text }).catch(() => false)
  }
  return { path, name: args.name, text: text || args.text, role: args.role }
}

async function mirrorRawModelArtifacts(args: {
  glbPath: WorkspacePath
  glbBytes: ArrayBuffer | Uint8Array
  gltfPath: WorkspacePath
  gltfText: string
}): Promise<void> {
  const mirrorText = mirrorTextForTests || mirrorChatWorkspaceFileToHost
  const mirrorBinary = mirrorBinaryForTests || mirrorChatWorkspaceBinaryFileToHost
  await Promise.all([
    mirrorBinary({ workspacePath: args.glbPath, bytes: args.glbBytes }).catch(() => false),
    mirrorText({ workspacePath: args.gltfPath, text: args.gltfText }).catch(() => false),
  ])
}

function buildSourceMetadataMarkdown(args: {
  originalName: string
  mimeHint: string
  byteSize: number
  importMode: 'file' | 'url'
  sourceUrl?: string | null
  glbPath: string
  gltfPath: string
}): string {
  const source = buildCorpusMediaMetadataMarkdown({
    originalName: args.originalName,
    mimeHint: args.mimeHint,
    byteSize: args.byteSize,
    importMode: args.importMode,
    relativePath: args.originalName,
  }).trimEnd()
  const sourceUrl = String(args.sourceUrl || '').trim()
  return [
    source,
    '',
    'XR model artifacts:',
    `- GLB: ${args.glbPath}`,
    `- GLTF: ${args.gltfPath}`,
    sourceUrl ? `- Source URL: ${sourceUrl}` : '',
    '',
  ].filter(line => line !== '').join('\n')
}

async function createXrImageWorkspaceArtifacts(args: {
  fs: WorkspaceFs
  sourceName: string
  sourceMime: string
  sourceBytes?: Uint8Array | ArrayBuffer | null
  sourceText?: string | null
  sourceKind: 'local' | 'url'
  sourceUrl?: string | null
  parentPath?: WorkspacePath
}): Promise<XrImageWorkspaceImportResult> {
  const format = getXrImageAssetFormat(args.sourceName, args.sourceMime)
  if (!format) throw new Error('xr-image-unsupported-format')
  const parentPath = await ensureFolderPath(args.fs, args.parentPath || XR_IMAGE_MODEL_WORKSPACE_ROOT)
  const stem = safeStem(args.sourceName)
  const sourceName = String(args.sourceName || `${stem}.${format}`).trim()
  const glbName = `${stem}.glb`
  const gltfName = `${stem}.gltf`
  const sourceDocName = `${stem}.source.md`

  const glb = format === 'svg'
    ? buildXrSvgGlbAssetMarkdown({
        sourceName,
        svgText: String(args.sourceText || ''),
        sourceKind: args.sourceKind,
        sourceUrl: args.sourceUrl,
      })
    : buildXrPngGlbAssetMarkdown({
        sourceName,
        bytes: args.sourceBytes || new Uint8Array(),
        sourceKind: args.sourceKind,
        sourceUrl: args.sourceUrl,
      })
  const gltf = format === 'svg'
    ? buildXrSvgGltfAssetMarkdown({
        sourceName,
        svgText: String(args.sourceText || ''),
        sourceKind: args.sourceKind,
        sourceUrl: args.sourceUrl,
      })
    : buildXrPngGltfAssetMarkdown({
        sourceName,
        bytes: args.sourceBytes || new Uint8Array(),
        sourceKind: args.sourceKind,
        sourceUrl: args.sourceUrl,
      })
  const byteSize = format === 'svg'
    ? new TextEncoder().encode(String(args.sourceText || '')).byteLength
    : Math.max(0, Number((args.sourceBytes as ArrayBuffer | null | undefined)?.byteLength || 0))
  const glbArtifact = await writeArtifactFile({
    fs: args.fs,
    parentPath,
    name: glbName,
    text: glb.markdown,
    role: 'glb',
    mirrorToHost: false,
  })
  const gltfArtifact = await writeArtifactFile({
    fs: args.fs,
    parentPath,
    name: gltfName,
    text: gltf.markdown,
    role: 'gltf',
    mirrorToHost: false,
  })
  const sourceText = buildSourceMetadataMarkdown({
    originalName: sourceName,
    mimeHint: args.sourceMime || (format === 'svg' ? 'image/svg+xml' : 'image/png'),
    byteSize,
    importMode: args.sourceKind === 'url' ? 'url' : 'file',
    sourceUrl: args.sourceUrl,
    glbPath: glbArtifact.path,
    gltfPath: gltfArtifact.path,
  })

  const sourceArtifact = await writeArtifactFile({ fs: args.fs, parentPath, name: sourceDocName, text: sourceText, role: 'source' })
  await mirrorRawModelArtifacts({
    glbPath: glbArtifact.path,
    glbBytes: glb.glb,
    gltfPath: gltfArtifact.path,
    gltfText: gltf.gltfText,
  })
  const artifacts = [sourceArtifact, glbArtifact, gltfArtifact]
  return {
    createdPaths: artifacts.map(artifact => artifact.path),
    sources: artifacts.map(artifact => ({
      path: artifact.path,
      source: args.sourceKind === 'url'
        ? { kind: 'url', url: String(args.sourceUrl || '') }
        : { kind: 'local', originalName: sourceName },
    })),
    artifacts,
    sourceText,
  }
}

export async function importXrImageWorkspaceAssetsFromFile(args: {
  fs: WorkspaceFs
  file: File
  parentPath?: WorkspacePath
}): Promise<XrImageWorkspaceImportResult> {
  const file = args.file
  const format = getXrImageAssetFormat(file?.name, file?.type)
  if (format === 'svg') {
    return createXrImageWorkspaceArtifacts({
      fs: args.fs,
      sourceName: file.name,
      sourceMime: file.type || 'image/svg+xml',
      sourceText: await file.text(),
      sourceKind: 'local',
      parentPath: args.parentPath,
    })
  }
  if (format === 'png') {
    return createXrImageWorkspaceArtifacts({
      fs: args.fs,
      sourceName: file.name,
      sourceMime: file.type || 'image/png',
      sourceBytes: await file.arrayBuffer(),
      sourceKind: 'local',
      parentPath: args.parentPath,
    })
  }
  throw new Error('xr-image-unsupported-format')
}

async function defaultFetchXrImageUrl(url: string, format: XrImageAssetFormat): Promise<{ bytes?: ArrayBuffer; text?: string; mime: string }> {
  const normalizedUrl = normalizeGitHubBlobLikeUrl(url) || url
  const localFsFetchPath = buildLocalFsFetchPath(url)
  const fetchPath = localFsFetchPath || (/^https?:\/\//i.test(normalizedUrl)
    ? (isCorsReadableGitHubRawAssetUrl(normalizedUrl) ? normalizedUrl : resolveBinaryDownloadProxyUrl(normalizedUrl))
    : buildCodebaseFilePath(url))
  const accept = format === 'svg' ? 'image/svg+xml,text/plain,*/*' : 'image/png,application/octet-stream,*/*'
  const res = await fetch(fetchPath, { headers: { Accept: accept } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const mime = normalizeMime(res.headers.get('content-type')) || (format === 'svg' ? 'image/svg+xml' : 'image/png')
  if (format === 'svg') return { text: await res.text(), mime }
  return { bytes: await res.arrayBuffer(), mime }
}

export async function importXrImageWorkspaceAssetsFromUrl(args: {
  fs: WorkspaceFs
  url: string
  parentPath?: WorkspacePath
  fetchXrImageUrl?: typeof defaultFetchXrImageUrl
}): Promise<XrImageWorkspaceImportResult> {
  const url = String(args.url || '').trim()
  const normalizedUrl = normalizeGitHubBlobLikeUrl(url) || url
  const format = getXrImageAssetFormat(normalizedUrl) || getXrImageAssetFormat(url)
  if (!url || !format) throw new Error('xr-image-unsupported-url')
  const fetched = await (args.fetchXrImageUrl || defaultFetchXrImageUrl)(normalizedUrl, format)
  const sourceName = deriveXrImageSourceNameFromUrl(normalizedUrl, format === 'svg' ? 'image.svg' : 'image.png')
  return createXrImageWorkspaceArtifacts({
    fs: args.fs,
    sourceName,
    sourceMime: fetched.mime || (format === 'svg' ? 'image/svg+xml' : 'image/png'),
    sourceBytes: fetched.bytes,
    sourceText: fetched.text,
    sourceKind: 'url',
    sourceUrl: url,
    parentPath: args.parentPath,
  })
}
