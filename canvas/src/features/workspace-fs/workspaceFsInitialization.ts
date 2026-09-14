import { getWorkspaceFs } from './workspaceFs'
import type { WorkspaceFs } from './types'

const mutationInitializationByFs = new WeakMap<WorkspaceFs, Promise<void>>()

/** Mutation helpers reuse initialization; explicit seed refresh remains a separate operation. */
export async function resolveInitializedWorkspaceFs(injected?: WorkspaceFs): Promise<WorkspaceFs> {
  if (!injected) {
    const fs = await getWorkspaceFs() // The singleton resolves only after initial seeding.
    mutationInitializationByFs.set(fs, Promise.resolve())
    return fs
  }
  let pending = mutationInitializationByFs.get(injected)
  if (!pending) {
    pending = Promise.resolve().then(() => injected.ensureSeed()).then(() => undefined)
    mutationInitializationByFs.set(injected, pending)
    const admitted = pending
    void pending.catch(() => {
      if (mutationInitializationByFs.get(injected) === admitted) mutationInitializationByFs.delete(injected)
    })
  }
  await pending
  return injected
}

