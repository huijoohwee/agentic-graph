import type { GraphNode } from '@/lib/graph/types'
import type { GeneratedBinaryAsset } from './byteplusRunGeneration'
import type { RichMediaWidgetKind } from './richMediaRun'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { registerUploadedMediaPanelStorage } from '@/lib/storage/uploadedMediaPanelItems'
import { uploadMediaFileToAgenticGraphStorage, type UploadedMediaStorageResult } from '@/lib/storage/uploadedMediaStorage'
import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'

const cleanString = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

const readWorkspacePathName = (workspacePath: string): string => {
  const parts = String(workspacePath || '').split('/').filter(Boolean)
  return cleanString(parts[parts.length - 1]) || 'generated-media-output.md'
}

const readWorkspacePathParent = (workspacePath: string): string => {
  const parts = String(workspacePath || '').split('/').filter(Boolean)
  const parent = parts.slice(0, -1).join('/')
  return parent ? `/${parent}` : '/'
}

export const uploadRichMediaBinaryToStorage = async (args: {
  outputPath: string
  blob: Blob
}): Promise<UploadedMediaStorageResult | null> => {
  try {
    if (typeof File !== 'function') return null
    const fileName = readWorkspacePathName(args.outputPath)
    const file = new File([args.blob], fileName, { type: args.blob.type || 'application/octet-stream' })
    const storage = await uploadMediaFileToAgenticGraphStorage({ file, uploadNow: true })
    if (storage) registerUploadedMediaPanelStorage(storage)
    return storage
  } catch {
    return null
  }
}

export const buildGeneratedMediaWorkspaceEntries = (args: {
  outputPath: string
  outputManifestPath: string
  manifestText: string
  updatedAtMs?: number
}): WorkspaceEntry[] => {
  const updatedAtMs = Number.isFinite(args.updatedAtMs) ? Number(args.updatedAtMs) : Date.now()
  return [
    {
      kind: 'file',
      path: args.outputPath,
      parentPath: readWorkspacePathParent(args.outputPath),
      name: readWorkspacePathName(args.outputPath),
      updatedAtMs,
    },
    {
      kind: 'file',
      path: args.outputManifestPath,
      parentPath: readWorkspacePathParent(args.outputManifestPath),
      name: readWorkspacePathName(args.outputManifestPath),
      text: args.manifestText,
      updatedAtMs,
    },
  ]
}

export const publishGeneratedTextToStorage = async (args: {
  outputPath: string
  text: string
}): Promise<void> => {
  try {
    const { publishGeneratedWorkspaceEntriesToAgenticGraphStorage } = await import('@/features/source-files/sourceFileShareUrl')
    const entry: WorkspaceEntry = {
      kind: 'file',
      path: args.outputPath,
      parentPath: readWorkspacePathParent(args.outputPath),
      name: readWorkspacePathName(args.outputPath),
      text: args.text,
      updatedAtMs: Date.now(),
    }
    await publishGeneratedWorkspaceEntriesToAgenticGraphStorage({ entries: [entry] })
  } catch {
    void 0
  }
}

const escapeMarkdownAltText = (value: unknown): string => String(value ?? '')
  .replace(/[\[\]\n\r]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

export const buildGeneratedMediaManifestMarkdown = (args: {
  node: GraphNode
  kind: RichMediaWidgetKind
  outputPath: string
  asset: GeneratedBinaryAsset
  storage?: UploadedMediaStorageResult | null
  manifestMetadata?: ReadonlyArray<readonly [string, unknown]>
}): string => {
  const title = cleanString(args.node.label) || cleanString(args.node.id) || `${args.kind} output`
  const savedName = args.outputPath.split('/').filter(Boolean).pop() || args.outputPath
  const relativeAssetPath = savedName ? `./${savedName}` : args.outputPath
  const mimeType = cleanString(args.asset.blob.type) || (args.kind === 'video' ? 'video/mp4' : args.kind === 'annotation' ? 'application/json' : 'image/png')
  const rawRows: Array<[string, unknown]> = [
    ['kind', args.kind],
    ['artifactPath', relativeAssetPath],
    ['mimeType', mimeType],
    ['model', cleanString(args.asset.model)],
    ['sourceUrl', cleanString(args.asset.sourceUrl)],
    ['storageUrl', cleanString(args.storage?.publicUrl)],
    ['storagePublicPath', cleanString(args.storage?.publicPath)],
    ['r2ObjectKey', cleanString(args.storage?.objectKey)],
    ['contentHash', cleanString(args.storage?.contentHash)],
    ['sizeBytes', args.storage?.provenance?.sizeBytes == null ? '' : String(args.storage.provenance.sizeBytes)],
    ...(Array.isArray(args.manifestMetadata) ? args.manifestMetadata : []),
  ]
  const rows = rawRows.filter(([, value]) => cleanString(value))
  const dataTable = rows.length
    ? serializeMarkdownPipeTable({
        columns: ['key', 'value'],
        rows: rows.map(([key, value]) => [key, String(value ?? '')]),
      }).join('\n')
    : ''
  const mediaBlock = args.kind === 'video'
    ? `<video controls src="${relativeAssetPath}"></video>`
    : args.kind === 'annotation'
      ? `[${escapeMarkdownAltText(title)} annotation JSON](${relativeAssetPath})`
      : `![${escapeMarkdownAltText(title)}](${relativeAssetPath})`
  return [
    `# ${title} ${args.kind === 'video' ? 'Video' : args.kind === 'annotation' ? 'Annotation' : 'Image'} Output`,
    dataTable,
    mediaBlock,
  ].filter(section => String(section || '').trim()).join('\n\n')
}
