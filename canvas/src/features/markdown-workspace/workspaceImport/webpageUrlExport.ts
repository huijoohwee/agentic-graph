import type { WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { ensureMarkdownFileName } from '@/features/workspace-fs/upsertWorkspaceTextDocument'
import { ensureWorkspaceDocsMirrorFolder, upsertWorkspaceDocsMirrorText } from '@/features/workspace-fs/workspaceSeedProvider'
import { resolveWebsiteImportNodeRelativeDocumentPath, safeWebsitePathSegment } from '@/lib/websites/websitePathUtils'
import { saveWorkspaceWebsiteLocalCopy } from '@/features/workspace-fs/workspaceRevealInFileManager'
import { readWorkspaceImportMarkdownSourceUrl, workspaceImportSourceUrlsMatch } from './sourceUrlIdentity'

const hasWebpageSourceFrontmatter = (text: string): boolean =>
  !!readWorkspaceImportMarkdownSourceUrl(text)

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(String(value || '').trim())

const readParentPath = (path: string): WorkspacePath => {
  const normalized = normalizeWorkspacePath(path)
  const idx = normalized.lastIndexOf('/')
  return idx > 0 ? normalizeWorkspacePath(normalized.slice(0, idx)) : '/'
}

const isMarkdownPath = (path: string): boolean => /\.(?:md|markdown|mdx|mmd)$/i.test(String(path || ''))

const hasNumericCollisionSuffix = (path: string): boolean => /-\d+\.(?:md|markdown|mdx|mmd)$/i.test(String(path || '').split('/').pop() || '')

const stripNumericCollisionSuffixFromMarkdownFileName = (name: string): string =>
  String(name || '').replace(/-\d+(\.(?:md|markdown|mdx|mmd))$/i, '$1')

const findExistingWebpageArtifactBySourceUrl = async (args: {
  fs: WorkspaceFs
  rootFolderPath: string
  url: string
}): Promise<string> => {
  const root = normalizeWorkspacePath(args.rootFolderPath)
  const entries = await args.fs.listEntries()
  const candidates: string[] = []
  for (const entry of entries) {
    if (entry.kind !== 'file') continue
    const path = normalizeWorkspacePath(entry.path)
    if (!isMarkdownPath(path) || readParentPath(path) !== root) continue
    const text = await args.fs.readFileText(path)
    const existingSourceUrl = text === null ? '' : readWorkspaceImportMarkdownSourceUrl(text)
    if (existingSourceUrl && workspaceImportSourceUrlsMatch(args.url, existingSourceUrl)) candidates.push(path)
  }
  candidates.sort((a, b) => Number(hasNumericCollisionSuffix(a)) - Number(hasNumericCollisionSuffix(b)) || a.localeCompare(b))
  return candidates[0] || ''
}

const removeDuplicateWebpageArtifactsBySourceUrl = async (args: {
  fs: WorkspaceFs
  rootFolderPath: string
  url: string
  keepPath: string
}): Promise<string[]> => {
  const root = normalizeWorkspacePath(args.rootFolderPath)
  const keepPath = normalizeWorkspacePath(args.keepPath)
  const entries = await args.fs.listEntries()
  const removed: string[] = []
  for (const entry of entries) {
    if (entry.kind !== 'file') continue
    const path = normalizeWorkspacePath(entry.path)
    if (!path || path === keepPath || readParentPath(path) !== root || !isMarkdownPath(path)) continue
    const text = await args.fs.readFileText(path)
    const existingSourceUrl = text === null ? '' : readWorkspaceImportMarkdownSourceUrl(text)
    if (!existingSourceUrl || !workspaceImportSourceUrlsMatch(args.url, existingSourceUrl)) continue
    await args.fs.deleteEntry(path)
    removed.push(path)
  }
  return removed
}

export const isImportedWebpageUrlArtifactEligible = (args: {
  url: string
  importedName: string
  importedText: string
}): boolean => {
  if (!isHttpUrl(args.url)) return false
  if (!/\.(?:md|markdown|mdx|mmd)$/i.test(ensureMarkdownFileName(args.importedName))) return false
  return hasWebpageSourceFrontmatter(args.importedText)
}

export const persistImportedWebpageUrlArtifact = async (args: {
  fs: WorkspaceFs
  url: string
  importedName: string
  importedText: string
  rootFolderPath?: string
  mirrorToHost?: boolean
}): Promise<null | { exportMarkdownPath: string; removedPaths?: string[] }> => {
  if (!isImportedWebpageUrlArtifactEligible(args)) return null
  const explicitRoot = String(args.rootFolderPath || '').trim()
  const urlPath = `/websites/${safeWebsitePathSegment(new URL(args.url).host)}/${resolveWebsiteImportNodeRelativeDocumentPath({ nodeUrl: args.url })}`
  const rootFolderPath = normalizeWorkspacePath(explicitRoot || readParentPath(urlPath))
  if (!rootFolderPath || rootFolderPath === '/') return null

  const importedText = String(args.importedText || '').trimEnd() + '\n'
  const fileName = explicitRoot ? ensureMarkdownFileName(args.importedName) : urlPath.slice(urlPath.lastIndexOf('/') + 1)
  const primaryFileName = explicitRoot ? stripNumericCollisionSuffixFromMarkdownFileName(fileName) || fileName : fileName
  const sourceMatchedPath = await findExistingWebpageArtifactBySourceUrl({ fs: args.fs, rootFolderPath, url: args.url })
  const canonicalPrimaryPath = normalizeWorkspacePath(`${rootFolderPath}/${primaryFileName}`)
  const primaryPath = sourceMatchedPath && !hasNumericCollisionSuffix(sourceMatchedPath) ? sourceMatchedPath : canonicalPrimaryPath
  const existing = await args.fs.readFileText(primaryPath)
  let exportMarkdownPath = primaryPath

  if (existing !== null) {
    const existingSourceUrl = readWorkspaceImportMarkdownSourceUrl(existing)
    if (!existingSourceUrl || !workspaceImportSourceUrlsMatch(args.url, existingSourceUrl)) {
      if (!explicitRoot) throw new Error(`Website destination belongs to another document: ${primaryPath}`)
      await ensureWorkspaceFolderTreeIfMissing({ fs: args.fs, folderPath: rootFolderPath })
      exportMarkdownPath = await args.fs.createFile({
        parentPath: rootFolderPath,
        name: fileName,
        text: importedText,
      })
    }
  }

  if (exportMarkdownPath === primaryPath) {
    await ensureWorkspaceFolderTreeIfMissing({ fs: args.fs, folderPath: readParentPath(exportMarkdownPath) })
    if (existing === null) {
      exportMarkdownPath = await args.fs.createFile({ parentPath: rootFolderPath, name: primaryFileName, text: importedText, requireExactPath: !explicitRoot })
    } else {
      await args.fs.writeFileText(exportMarkdownPath, importedText, { expectedText: existing })
    }
  }

  const removedPaths = explicitRoot ? await removeDuplicateWebpageArtifactsBySourceUrl({
    fs: args.fs,
    rootFolderPath,
    url: args.url,
    keepPath: exportMarkdownPath,
  }) : []
  if (args.mirrorToHost !== false) {
    if (exportMarkdownPath.startsWith('/websites/')) await saveWorkspaceWebsiteLocalCopy(exportMarkdownPath, importedText)
    else {
      await ensureWorkspaceDocsMirrorFolder({ workspacePath: readParentPath(exportMarkdownPath) })
      await upsertWorkspaceDocsMirrorText({ workspacePath: exportMarkdownPath, text: importedText })
    }
  }
  return { exportMarkdownPath: normalizeWorkspacePath(exportMarkdownPath), ...(removedPaths.length > 0 ? { removedPaths } : {}) }
}
