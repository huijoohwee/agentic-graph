import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import {
  enqueueWorkspaceSourceTextTransaction,
  settleWorkspaceSourceTextTransactions,
} from '@/features/workspace-fs/workspaceSourceTextTransaction'

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
  return enqueueWorkspaceSourceTextTransaction({
    path: workspacePath,
    text,
    write: async ({ path, text: nextText }) => {
      const fs = await getWorkspaceFs()
      await fs.writeFileText(path, nextText)
    },
  }).then(result => result.accepted).catch(() => false)
}

export async function settleWorkspaceSourceTextWrites(): Promise<void> {
  while (true) {
    const pendingPublications = [...pendingWorkspaceSourceTextPublications]
    if (pendingPublications.length > 0) await Promise.allSettled(pendingPublications)
    await settleWorkspaceSourceTextTransactions()
    const { flushPendingWorkspaceDocsMirrorTextUpserts } = await import(
      '@/features/workspace-fs/workspaceDocsMirrorTextUpsertQueue'
    )
    await flushPendingWorkspaceDocsMirrorTextUpserts()
    if (pendingWorkspaceSourceTextPublications.size === 0) return
  }
}
