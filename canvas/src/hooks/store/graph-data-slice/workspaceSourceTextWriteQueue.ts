import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { runWorkspaceSeedSyncTask } from '@/lib/workspace/workspaceSeedSyncRuntime'

const pendingWorkspaceSourceTextWrites = new Map<string, Promise<boolean>>()
const pendingWorkspaceSourceTextPublications = new Set<Promise<unknown>>()

export function trackWorkspaceSourceTextPublication<T>(publish: () => Promise<T>): Promise<T> {
  const publication = Promise.resolve().then(publish)
  pendingWorkspaceSourceTextPublications.add(publication)
  const release = () => {
    pendingWorkspaceSourceTextPublications.delete(publication)
  }
  void publication.then(release, release)
  return publication
}

export function enqueueWorkspaceSourceTextWrite(workspacePath: string, text: string): Promise<boolean> {
  const previous = pendingWorkspaceSourceTextWrites.get(workspacePath) || Promise.resolve(true)
  const next = previous.catch(() => false).then(async () => {
    try {
      return await runWorkspaceSeedSyncTask(undefined, async () => {
        const fs = await getWorkspaceFs()
        await fs.writeFileText(workspacePath as any, text)
        return true
      })
    } catch {
      return false
    }
  })
  pendingWorkspaceSourceTextWrites.set(workspacePath, next)
  void next.finally(() => { if (pendingWorkspaceSourceTextWrites.get(workspacePath) === next) pendingWorkspaceSourceTextWrites.delete(workspacePath) })
  return next
}

export async function settleWorkspaceSourceTextWrites(): Promise<void> {
  while (true) {
    const pendingPublications = [...pendingWorkspaceSourceTextPublications]
    if (pendingPublications.length > 0) await Promise.allSettled(pendingPublications)
    const pendingWrites = [...pendingWorkspaceSourceTextWrites.values()]
    if (pendingWrites.length > 0) await Promise.all(pendingWrites)
    const { flushPendingWorkspaceDocsMirrorTextUpserts } = await import(
      '@/features/workspace-fs/workspaceDocsMirrorTextUpsertQueue'
    )
    await flushPendingWorkspaceDocsMirrorTextUpserts()
    if (pendingWorkspaceSourceTextPublications.size === 0 && pendingWorkspaceSourceTextWrites.size === 0) return
  }
}
