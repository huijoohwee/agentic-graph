import type { CorpusSourceUnit } from '@/features/queryable-corpus/corpusGraph'

export type ImportedImageChoice = Readonly<{
  sourceUnit: CorpusSourceUnit
  mediaUrl: string
  storyboardPath: string | null
}>

let choice: ImportedImageChoice | null = null
let pendingStoryboard: Promise<string> | null = null
const listeners = new Set<() => void>()

export const readImportedImageChoice = (): ImportedImageChoice | null => choice
export const subscribeImportedImageChoice = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function selectImportedImageChoice(input: { sourceUnit: CorpusSourceUnit; mediaUrl: string }): void {
  choice = Object.freeze({ ...input, storyboardPath: null })
  for (const listener of listeners) listener()
}

/** The storyboard is created only after the user chooses that next step. */
export async function createStoryboardForImportedImage(): Promise<string> {
  const selected = choice
  if (!selected) throw new Error('Select an imported image first.')
  if (selected.storyboardPath) return selected.storyboardPath
  if (pendingStoryboard) return pendingStoryboard
  const operation = (async () => {
    const [{ getWorkspaceFs }, { WORKSPACE_ROOT_PATH }, { bulkSetWorkspaceEntrySources }, story,
      { activateStrybldrImportSurface }, { activateFirstImportedWorkspaceFile }] = await Promise.all([
      import('@/features/workspace-fs/workspaceFs'),
      import('@/features/workspace-fs/path'),
      import('@/features/workspace-fs/sourceIndex'),
      import('@/features/strybldr/strybldrStoryboard'),
      import('@/features/strybldr/strybldrImportSurface'),
      import('@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions'),
    ])
    const fs = await getWorkspaceFs()
    await fs.ensureSeed()
    const doc = story.buildStrybldrStoryboardDocument({
      sourceUnits: [selected.sourceUnit],
      mediaUrlBySourceUnitId: { [selected.sourceUnit.id]: selected.mediaUrl },
    })
    const name = story.buildStrybldrWorkspaceDocumentName(doc.sources[0]!)
    const path = await fs.createFile({ parentPath: WORKSPACE_ROOT_PATH, name,
      text: story.serializeStrybldrStoryboardMarkdown(doc) })
    bulkSetWorkspaceEntrySources([{ path, source: { kind: 'local', originalName: name } }])
    await activateFirstImportedWorkspaceFile({ fs, createdPaths: [path], applyToGraph: true })
    activateStrybldrImportSurface({ canvas2dRenderer: 'storyboard' })
    if (choice === selected) {
      choice = Object.freeze({ ...selected, storyboardPath: path })
      for (const listener of listeners) listener()
    }
    return path
  })()
  pendingStoryboard = operation
  try { return await operation } finally { if (pendingStoryboard === operation) pendingStoryboard = null }
}
