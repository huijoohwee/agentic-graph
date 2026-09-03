import {
  resolveKgcCompanionOutputPath,
  resolveWorkspaceSiblingArtifactPath,
  writeWorkspaceBlobArtifactAtPath,
  writeWorkspaceTextArtifactAtPath,
} from '@/features/chat/chatHistoryWorkspace.output'
import { uploadGeneratedWorkspaceBlobToAgenticGraphStorage } from '@/features/source-files/sourceFilesBinaryStorage'
import { normalizeWorkspacePath, workspaceBasename, workspaceStem } from '@/features/workspace-fs/path'
import {
  buildFinancialModelWorkbookFromMarkdown,
  FINANCIAL_MODEL_WORKBOOK_MIME_TYPE,
} from './financialModelWorkbook'

export const FINANCIAL_MODEL_WORKBOOK_DOWNLOAD_PATH = '/__kg_fs_artifact' as const

export type FinancialModelWorkbookPersistedArtifact = {
  path: string | null
  manifestPath: string | null
  downloadUrl: string | null
  storageUrl: string | null
  fileName: string
  mimeType: typeof FINANCIAL_MODEL_WORKBOOK_MIME_TYPE
  sha256: string
  sizeBytes: number
  sheetName: string
  rowCount: number
  columnCount: number
  blob: Blob
}

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

const hashBytesSha256 = async (bytes: Uint8Array): Promise<string> => {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('SHA-256 is unavailable; workbook persistence cannot be verified.')
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${bytesToHex(new Uint8Array(digest))}`
}

const sanitizeFileStem = (value: unknown): string => String(value || '')
  .trim()
  .replace(/\.[^.]+$/, '')
  .replace(/[^a-z0-9._-]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 96) || 'financial-model'

const resolveWorkbookPath = (workspacePath: string): string | null => {
  const kgcPath = resolveKgcCompanionOutputPath({
    workspacePath,
    extension: 'xlsx',
    variant: 'financial-model',
  })
  if (kgcPath) return kgcPath
  const sourceName = workspaceBasename(normalizeWorkspacePath(workspacePath))
  return resolveWorkspaceSiblingArtifactPath({
    workspacePath,
    fileName: `${sanitizeFileStem(workspaceStem(sourceName))}-financial-model.xlsx`,
  })
}

const quoteManifestValue = (value: unknown): string => JSON.stringify(String(value == null ? '' : value))

const buildWorkbookManifest = (args: {
  artifact: Omit<FinancialModelWorkbookPersistedArtifact, 'blob' | 'manifestPath' | 'downloadUrl'>
  sourceWorkspacePath: string
}): string => [
  '---',
  'kind: agentic_graph_financial_model_workbook',
  'schema: agentic-graph-financial-model-workbook/v1',
  `source_workspace_path: ${quoteManifestValue(args.sourceWorkspacePath)}`,
  `workbook_path: ${args.artifact.path ? quoteManifestValue(args.artifact.path) : 'null'}`,
  `storage_url: ${args.artifact.storageUrl ? quoteManifestValue(args.artifact.storageUrl) : 'null'}`,
  `file_name: ${quoteManifestValue(args.artifact.fileName)}`,
  `mime_type: ${quoteManifestValue(args.artifact.mimeType)}`,
  `sha256: ${quoteManifestValue(args.artifact.sha256)}`,
  `size_bytes: ${args.artifact.sizeBytes}`,
  `sheet_name: ${quoteManifestValue(args.artifact.sheetName)}`,
  `row_count: ${args.artifact.rowCount}`,
  `column_count: ${args.artifact.columnCount}`,
  '---',
  '',
  '# Financial Model Workbook',
  '',
  'The Rich Media panel Markdown table remains authoritative. This XLSX file is its generated companion workbook.',
  '',
  `- Workbook: \`${args.artifact.fileName}\``,
  `- SHA-256: \`${args.artifact.sha256}\``,
  `- Dimensions: ${args.artifact.rowCount} rows x ${args.artifact.columnCount} columns`,
  '',
].join('\n')

export async function persistFinancialModelWorkbook(args: {
  markdown: string
  workspacePath?: string | null
  requireDurablePersistence?: boolean
}): Promise<FinancialModelWorkbookPersistedArtifact> {
  const workbook = buildFinancialModelWorkbookFromMarkdown({ markdown: args.markdown })
  const sourceWorkspacePath = String(args.workspacePath || '').trim()
  const outputPath = sourceWorkspacePath ? resolveWorkbookPath(sourceWorkspacePath) : null
  const sha256 = await hashBytesSha256(workbook.bytes)
  const localWritePromise = outputPath
    ? writeWorkspaceBlobArtifactAtPath({ absolutePath: outputPath, blob: workbook.blob })
    : Promise.resolve(null)
  const storagePromise = outputPath
    ? uploadGeneratedWorkspaceBlobToAgenticGraphStorage({ workspacePath: outputPath, blob: workbook.blob }).catch(() => null)
    : Promise.resolve(null)
  const [writtenPath, storage] = await Promise.all([localWritePromise, storagePromise])
  if (args.requireDurablePersistence && !writtenPath && !storage?.publicUrl) {
    throw new Error('The XLSX workbook could not be persisted to the workspace or configured storage.')
  }
  const path = writtenPath || storage ? outputPath : null
  const fileName = path ? workspaceBasename(path) : 'financial-model.xlsx'
  const storageUrl = storage?.publicUrl || null
  const manifestPath = path
    ? resolveWorkspaceSiblingArtifactPath({ workspacePath: path, fileName: `${fileName}.manifest.md` })
    : null
  const manifestArtifact = {
    path,
    storageUrl,
    fileName,
    mimeType: FINANCIAL_MODEL_WORKBOOK_MIME_TYPE,
    sha256,
    sizeBytes: workbook.bytes.byteLength,
    sheetName: workbook.sheetName,
    rowCount: workbook.table.rows.length,
    columnCount: workbook.table.columns.length,
  } as const
  const writtenManifestPath = manifestPath
    ? await writeWorkspaceTextArtifactAtPath({
        absolutePath: manifestPath,
        text: buildWorkbookManifest({ artifact: manifestArtifact, sourceWorkspacePath }),
      }).catch(error => {
        if (args.requireDurablePersistence) throw error
        return null
      })
    : null
  const downloadUrl = storageUrl || (writtenPath
    ? `${FINANCIAL_MODEL_WORKBOOK_DOWNLOAD_PATH}?path=${encodeURIComponent(writtenPath)}`
    : null)
  return {
    ...manifestArtifact,
    manifestPath: writtenManifestPath,
    downloadUrl,
    blob: workbook.blob,
  }
}
