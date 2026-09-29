import type { WorkspaceFs, WorkspacePath } from './types'
import { WORKSPACE_ROOT_PATH, joinWorkspacePath, normalizeWorkspacePath } from './path'
import { resolveInitializedWorkspaceFs } from './workspaceFsInitialization'

function sanitizeWorkspaceFileName(raw: unknown, fallback: string): string {
  const base = String(raw ?? '')
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .pop()
  const cleaned = String(base || '').trim()
  return cleaned ? cleaned : fallback
}

export function ensureMarkdownFileName(raw: unknown): string {
  const fallback = 'document.md'
  const name = sanitizeWorkspaceFileName(raw, fallback)
  const lower = name.toLowerCase()
  if (lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.mdx') || lower.endsWith('.mmd')) return name
  return `${name}.md`
}

export async function upsertWorkspaceTextDocument(args: {
  fs: WorkspaceFs
  name: string
  text: string
  parentPath?: WorkspacePath
}): Promise<WorkspacePath> {
  const parentPath = normalizeWorkspacePath(args.parentPath ?? WORKSPACE_ROOT_PATH)
  const fileName = sanitizeWorkspaceFileName(args.name, 'document.md')
  const desiredPath = normalizeWorkspacePath(joinWorkspacePath(parentPath, fileName))

  const fs = await resolveInitializedWorkspaceFs(args.fs)
  const existing = await fs.readFileText(desiredPath)
  if (existing != null) {
    await fs.writeFileText(desiredPath, args.text)
    return desiredPath
  }
  const created = await fs.createFile({ parentPath, name: fileName, text: args.text })
  return normalizeWorkspacePath(created)
}
