import { normalizeWorkspacePath } from './path'
import type { WorkspacePath } from './types'
import { runWorkspaceSeedSyncTask } from '@/lib/workspace/workspaceSeedSyncRuntime'

export type WorkspaceSourceTextRevision = Readonly<{
  path: WorkspacePath
  revision: number
}>

export type WorkspaceSourceTextTransactionResult = Readonly<{
  accepted: boolean
  revision: WorkspaceSourceTextRevision
}>

export type WorkspaceSourceTextSnapshot<Value> = Readonly<{
  current: boolean
  revision: WorkspaceSourceTextRevision
  value: Value
}>

const revisionByPath = new Map<WorkspacePath, number>()
const pendingTransactionByPath = new Map<WorkspacePath, Promise<WorkspaceSourceTextTransactionResult>>()

function normalizeWorkspaceSourceTextPath(path: string): WorkspacePath {
  const raw = String(path || '').trim()
  const withoutWorkspacePrefix = raw.startsWith('workspace:') ? raw.slice('workspace:'.length) : raw
  return normalizeWorkspacePath(withoutWorkspacePrefix)
}

function readWorkspaceSourceTextRevision(path: WorkspacePath): number {
  return revisionByPath.get(path) || 0
}

export function captureWorkspaceSourceTextRevision(path: string): WorkspaceSourceTextRevision {
  const normalizedPath = normalizeWorkspaceSourceTextPath(path)
  return Object.freeze({
    path: normalizedPath,
    revision: readWorkspaceSourceTextRevision(normalizedPath),
  })
}

export function publishWorkspaceSourceTextRevision(path: string): WorkspaceSourceTextRevision {
  const normalizedPath = normalizeWorkspaceSourceTextPath(path)
  const revision = readWorkspaceSourceTextRevision(normalizedPath) + 1
  revisionByPath.set(normalizedPath, revision)
  return Object.freeze({ path: normalizedPath, revision })
}

export function isWorkspaceSourceTextRevisionCurrent(revision: WorkspaceSourceTextRevision): boolean {
  const normalizedPath = normalizeWorkspaceSourceTextPath(revision.path)
  return normalizedPath === revision.path && readWorkspaceSourceTextRevision(normalizedPath) === revision.revision
}

export async function readWorkspaceSourceTextSnapshot<Value>(args: {
  path: string
  read: () => Promise<Value>
  maxAttempts?: number
}): Promise<WorkspaceSourceTextSnapshot<Value>> {
  const maxAttempts = Math.max(1, Math.floor(args.maxAttempts || 2))
  let lastSnapshot: WorkspaceSourceTextSnapshot<Value> | null = null
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await settleWorkspaceSourceTextTransactions(args.path)
    const revision = captureWorkspaceSourceTextRevision(args.path)
    const value = await args.read()
    const current = (
      isWorkspaceSourceTextRevisionCurrent(revision)
      && !pendingTransactionByPath.has(revision.path)
    )
    lastSnapshot = { current, revision, value }
    if (current) return lastSnapshot
    await settleWorkspaceSourceTextTransactions(args.path)
  }
  return lastSnapshot!
}

export function enqueueWorkspaceSourceTextTransaction(args: {
  path: string
  text: string
  expectedRevision?: WorkspaceSourceTextRevision
  write: (args: { path: WorkspacePath; text: string }) => Promise<boolean | void>
}): Promise<WorkspaceSourceTextTransactionResult> {
  const path = normalizeWorkspaceSourceTextPath(args.path)
  const expectedRevision = args.expectedRevision
  if (
    expectedRevision
    && (
      normalizeWorkspaceSourceTextPath(expectedRevision.path) !== path
      || !isWorkspaceSourceTextRevisionCurrent(expectedRevision)
    )
  ) {
    return Promise.resolve({
      accepted: false,
      revision: captureWorkspaceSourceTextRevision(path),
    })
  }

  const revision = publishWorkspaceSourceTextRevision(path)
  const previous = pendingTransactionByPath.get(path) || Promise.resolve({ accepted: true, revision })
  const next = previous.catch(() => ({ accepted: false, revision })).then(async () => {
    const accepted = await runWorkspaceSeedSyncTask(undefined, async () => (
      (await args.write({ path, text: args.text })) !== false
    ))
    return { accepted, revision }
  })
  pendingTransactionByPath.set(path, next)
  const release = () => {
    if (pendingTransactionByPath.get(path) === next) pendingTransactionByPath.delete(path)
  }
  void next.then(release, release)
  return next
}

export async function settleWorkspaceSourceTextTransactions(path?: string): Promise<void> {
  const normalizedPath = typeof path === 'string' ? normalizeWorkspaceSourceTextPath(path) : null
  while (true) {
    if (normalizedPath) {
      const pending = pendingTransactionByPath.get(normalizedPath)
      if (!pending) return
      await Promise.allSettled([pending])
      continue
    }
    if (pendingTransactionByPath.size === 0) return
    await Promise.allSettled([...pendingTransactionByPath.values()])
  }
}
