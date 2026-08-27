import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { toKgcOutputWorkspacePath } from './chatHistoryWorkspace.paths'
import { writeWorkspaceFileTextEnsuringFile } from './chatWorkspaceFsWrite'

const AG_FS_WRITE_PATH = '/__kg_fs_write'

const looksLikeMirrorableFsPath = (value: string): boolean => {
  const s = String(value || '').trim()
  if (!s) return false
  if (s.startsWith('/')) return true
  if (/^[a-zA-Z]:\\/.test(s) || /^[a-zA-Z]:\//.test(s)) return true
  return (
    s.startsWith('/Users/') ||
    s.startsWith('/home/') ||
    s.startsWith('/Volumes/') ||
    s.startsWith('/private/') ||
    s.startsWith('/tmp/') ||
    s.startsWith('/var/')
  )
}

const mirrorWorkspaceFileTextToHostFs = async (args: { absolutePath: string; text: string }): Promise<void> => {
  if (typeof window === 'undefined') return
  const abs = String(args.absolutePath || '').trim()
  if (!looksLikeMirrorableFsPath(abs)) return
  try {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      try {
        controller.abort()
      } catch {
        void 0
      }
    }, 5_000)
    try {
      const res = await fetch(AG_FS_WRITE_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: abs, text: args.text }),
        signal: controller.signal,
      })
      if (!res.ok) return
    } finally {
      window.clearTimeout(timeoutId)
    }
  } catch {
    void 0
  }
}

const blobToBase64 = async (blob: Blob): Promise<string | null> => {
  try {
    const arrayBuffer = await blob.arrayBuffer()
    let binary = ''
    const bytes = new Uint8Array(arrayBuffer)
    const chunkSize = 0x8000
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, offset + chunkSize)
      binary += String.fromCharCode(...chunk)
    }
    return btoa(binary)
  } catch {
    return null
  }
}

const mirrorWorkspaceFileBlobToHostFs = async (args: { absolutePath: string; blob: Blob }): Promise<boolean> => {
  if (typeof window === 'undefined') return false
  const abs = String(args.absolutePath || '').trim()
  if (!looksLikeMirrorableFsPath(abs)) return false
  const blob = args.blob
  const base64 = await blobToBase64(blob)
  if (!base64) return false
  try {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      try {
        controller.abort()
      } catch {
        void 0
      }
    }, 10_000)
    try {
      const res = await fetch(AG_FS_WRITE_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: abs,
          base64,
          encoding: 'base64',
          mimeType: String(blob.type || 'application/octet-stream'),
        }),
        signal: controller.signal,
      })
      return res.ok
    } finally {
      window.clearTimeout(timeoutId)
    }
  } catch {
    return false
  }
}

export const resolveWorkspaceSiblingArtifactPath = (args: {
  workspacePath: string | null | undefined
  fileName: string | null | undefined
}): string | null => {
  const basePath = normalizeWorkspacePath(String(args.workspacePath || '').trim())
  const fileName = String(args.fileName || '').trim()
  if (!basePath || !fileName) return null
  const parts = basePath.split('/').filter(Boolean)
  if (parts.length === 0) return null
  const parent = parts.slice(0, -1).join('/')
  return normalizeWorkspacePath(`/${parent ? `${parent}/` : ''}${fileName}`) || null
}

export const writeWorkspaceTextArtifactAtPath = async (args: {
  absolutePath: string | null | undefined
  text: string
  fs?: WorkspaceFs | null
}): Promise<string | null> => {
  const outputPath = normalizeWorkspacePath(String(args.absolutePath || '').trim())
  if (!outputPath) return null
  const text = String(args.text || '')
  await writeWorkspaceFileTextEnsuringFile({
    fs: args.fs || undefined,
    path: outputPath,
    text,
  })
  await mirrorWorkspaceFileTextToHostFs({ absolutePath: outputPath, text })
  return outputPath
}

export const writeWorkspaceBlobArtifactAtPath = async (args: {
  absolutePath: string | null | undefined
  blob: Blob
}): Promise<string | null> => {
  const outputPath = normalizeWorkspacePath(String(args.absolutePath || '').trim())
  if (!outputPath) return null
  const persisted = await mirrorWorkspaceFileBlobToHostFs({ absolutePath: outputPath, blob: args.blob })
  return persisted ? outputPath : null
}

const readWorkspacePathBasename = (workspacePath: string): string => {
  const parts = normalizeWorkspacePath(workspacePath).split('/').filter(Boolean)
  return String(parts[parts.length - 1] || '').trim()
}

const quoteManifestScalar = (value: unknown): string =>
  JSON.stringify(String(value == null ? '' : value))

const buildStoredBinaryManifestMarkdown = (args: {
  workspacePath: string
  storage: {
    workspaceId: string
    canonicalPath: string
    objectKey: string
    publicUrl: string
    contentType: string
    contentHash: string | null
    sizeBytes: number | null
    etag: string | null
    uploadedAtMs: number
  }
}): string => {
  const uploadedAtIso = Number.isFinite(args.storage.uploadedAtMs)
    ? new Date(args.storage.uploadedAtMs).toISOString()
    : ''
  return [
    '---',
    'kind: agenticgraph_binary_artifact',
    `workspace_path: ${quoteManifestScalar(args.workspacePath)}`,
    `storage_workspace_id: ${quoteManifestScalar(args.storage.workspaceId)}`,
    `canonical_path: ${quoteManifestScalar(args.storage.canonicalPath)}`,
    `r2_object_key: ${quoteManifestScalar(args.storage.objectKey)}`,
    `storage_url: ${quoteManifestScalar(args.storage.publicUrl)}`,
    `mime_type: ${quoteManifestScalar(args.storage.contentType)}`,
    `size_bytes: ${args.storage.sizeBytes == null ? 'null' : String(args.storage.sizeBytes)}`,
    `content_hash: ${args.storage.contentHash ? quoteManifestScalar(args.storage.contentHash) : 'null'}`,
    `etag: ${args.storage.etag ? quoteManifestScalar(args.storage.etag) : 'null'}`,
    `uploaded_at_ms: ${Number.isFinite(args.storage.uploadedAtMs) ? String(args.storage.uploadedAtMs) : 'null'}`,
    `uploaded_at: ${uploadedAtIso ? quoteManifestScalar(uploadedAtIso) : 'null'}`,
    '---',
    '',
    '# Binary Artifact',
    '',
    `- Workspace path: \`${args.workspacePath}\``,
    `- Storage workspace: \`${args.storage.workspaceId}\``,
    `- Canonical path: \`${args.storage.canonicalPath}\``,
    `- R2 object key: \`${args.storage.objectKey}\``,
    `- Storage URL: ${args.storage.publicUrl}`,
    `- MIME type: \`${args.storage.contentType}\``,
    `- Size bytes: \`${args.storage.sizeBytes == null ? '' : String(args.storage.sizeBytes)}\``,
    `- Content hash: \`${args.storage.contentHash || ''}\``,
    '',
  ].join('\n')
}

const writeStoredBinaryManifestIfAvailable = async (args: {
  workspacePath: string
  blob: Blob
}): Promise<string | null> => {
  try {
    const { uploadGeneratedWorkspaceBlobToAgenticGraphStorage } = await import('@/features/source-files/sourceFilesBinaryStorage')
    const storage = await uploadGeneratedWorkspaceBlobToAgenticGraphStorage({
      workspacePath: args.workspacePath,
      blob: args.blob,
    })
    if (!storage) return null
    const basename = readWorkspacePathBasename(args.workspacePath)
    const manifestPath = resolveWorkspaceSiblingArtifactPath({
      workspacePath: args.workspacePath,
      fileName: `${basename || 'binary-artifact'}.manifest.md`,
    })
    if (!manifestPath) return null
    const writtenPath = await writeWorkspaceTextArtifactAtPath({
      absolutePath: manifestPath,
      text: buildStoredBinaryManifestMarkdown({
        workspacePath: args.workspacePath,
        storage,
      }),
    })
    if (!writtenPath) return null
    const { publishGeneratedWorkspacePathsToAgenticGraphStorage } = await import('@/features/source-files/sourceFileShareUrl')
    await publishGeneratedWorkspacePathsToAgenticGraphStorage({
      paths: [writtenPath],
    })
    return writtenPath
  } catch {
    return null
  }
}

export const resolveKgcCompanionOutputPath = (args: {
  workspacePath: string | null | undefined
  extension: string
  variant?: string | null
}): string | null => {
  const basePath = String(args.workspacePath || '').trim()
  if (!basePath) return null
  return toKgcOutputWorkspacePath(basePath, args.extension, { variant: args.variant }) || null
}

export const writeKgcCompanionOutputText = async (args: {
  workspacePath: string | null | undefined
  extension: string
  text: string
  variant?: string | null
}): Promise<string | null> => {
  const outputPath = resolveKgcCompanionOutputPath(args)
  return await writeWorkspaceTextArtifactAtPath({
    absolutePath: outputPath,
    text: args.text,
  })
}

export const writeKgcCompanionOutputBlob = async (args: {
  workspacePath: string | null | undefined
  extension: string
  blob: Blob
  variant?: string | null
}): Promise<string | null> => {
  const outputPath = resolveKgcCompanionOutputPath(args)
  const writtenPath = await writeWorkspaceBlobArtifactAtPath({
    absolutePath: outputPath,
    blob: args.blob,
  })
  if (writtenPath) {
    await writeStoredBinaryManifestIfAvailable({
      workspacePath: writtenPath,
      blob: args.blob,
    })
  }
  return writtenPath
}
