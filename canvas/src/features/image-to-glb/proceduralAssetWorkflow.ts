import type { GraphNode } from '@/lib/graph/types'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { createProceduralAssetFromText } from './proceduralAssetTextRecipe'
import { parseProceduralAssetRecipe } from './proceduralAssetContract'
import { ProceduralAssetSession } from './proceduralAssetSession'
import { prepareProceduralAssetOutput } from './proceduralAssetOutput'
import type { ProceduralAssetRunInput } from './proceduralAssetWorkflowContract'
import type { ProceduralAssetOutputPublisher } from './proceduralAssetPanelPublication'

export type ProceduralAssetWorkflowContext = {
  documentId: string; parentPath: string; signal?: AbortSignal; isCurrent: () => boolean
  beforePublish?: () => void; onPublished?: () => void
}

/** Both the native run action and a future admitted tool adapter use this typed construction path. */
export async function runProceduralAssetWorkflow(args: {
  node: GraphNode; input: ProceduralAssetRunInput; fs: WorkspaceFs
  context: ProceduralAssetWorkflowContext; publish: ProceduralAssetOutputPublisher
}): Promise<void> {
  const assertCurrent = () => {
    if (args.context.signal?.aborted || !args.context.isCurrent()) throw new Error('Procedural asset creation cancelled or source document changed')
  }
  assertCurrent()
  const recipe = args.input.recipe == null ? createProceduralAssetFromText(args.input.intent, args.input.seed) : parseProceduralAssetRecipe(args.input.recipe)
  const documentId = `${args.context.documentId}#${args.node.id}`
  const session = new ProceduralAssetSession(documentId, recipe)
  try {
    const { patch } = await prepareProceduralAssetOutput({ session, fs: args.fs, parentPath: args.context.parentPath, signal: args.context.signal, isCurrent: args.context.isCurrent })
    assertCurrent()
    args.context.beforePublish?.()
    if (!args.publish({ anchorNode: args.node, patch: { ...patch, proceduralAssetSourcePath: args.context.documentId } })) throw new Error('Procedural asset output panel could not be published')
    args.context.onPublished?.()
  } finally { session.dispose() }
}

export type ProceduralAssetSourceSnapshot = {
  documentId: string; documentText: string; graph: unknown; revision: number; sourceRevision: number
}

/** A monotonic cancellation latch rejects leaving and returning to the same document. */
export function createProceduralAssetSourceFence(args: {
  read: () => ProceduralAssetSourceSnapshot
  subscribe: (listener: () => void) => () => void
  onInvalidate: () => void
}) {
  const initial = args.read()
  const controller = new AbortController()
  let invalid = false
  const isCurrent = () => {
    const current = args.read()
    if (!invalid && Object.keys(initial).some(key => !Object.is(initial[key as keyof typeof initial], current[key as keyof typeof current]))) {
      invalid = true; controller.abort(); args.onInvalidate()
    }
    return !invalid
  }
  const unsubscribe = args.subscribe(isCurrent)
  let released = false
  const release = () => { if (!released) { released = true; unsubscribe() } }
  return { isCurrent, signal: controller.signal, release }
}
