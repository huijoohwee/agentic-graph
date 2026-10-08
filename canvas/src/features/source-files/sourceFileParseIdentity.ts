import type { SourceFile } from '@/hooks/store/types'
import { normalizeWorkspacePath, workspaceDocumentKey } from '@/features/workspace-fs/path'
import { hashStringToHexSharedContentCached } from '@/lib/hash/textHashCache'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'

// Bump when source-file parse semantics change so persisted parsedGraphData reparses on startup.
export const SOURCE_FILE_PARSE_SEMANTICS_VERSION = 4 as const

export function buildSourceFileParseIdentityHash(args: {
  cacheNamespace: string
  name: string
  text: string
}): string {
  const namespace = String(args.cacheNamespace || '').trim()
  const name = String(args.name || '').trim()
  const text = String(args.text || '')
  const textHash = hashStringToHexSharedContentCached(text, `source-file-parse-text:v${SOURCE_FILE_PARSE_SEMANTICS_VERSION}`)
  return buildScopedGraphSemanticKey('source-file-parse-identity', {
    graphSemanticKey: [
      `v:${SOURCE_FILE_PARSE_SEMANTICS_VERSION}`,
      namespace,
      name,
      `len:${text.length}`,
      textHash,
    ].join('|'),
  })
}

/** Workspace parser names are canonical paths; SourceFile.name remains a display label. */
export function resolveSourceFileParseInput(file: Pick<SourceFile, 'id' | 'name' | 'text' | 'source'>) {
  const sourcePath = String(file.source?.path || '')
  const path = sourcePath.startsWith('workspace:') ? normalizeWorkspacePath(sourcePath.slice('workspace:'.length)) : null
  return path && workspaceDocumentKey(path)
    ? { cacheNamespace: `workspace-import:${path}`, name: workspaceDocumentKey(path), text: file.text }
    : { cacheNamespace: `source-file:${file.id}`, name: file.name, text: file.text }
}
