import type { WorkspaceImportUrlOpts } from '@/features/markdown-explorer/workspaceActionBridge'
import type { GraphData } from '@/lib/graph/types'
import { buildStrybldrVideoHandoffFromGraphData } from './strybldrStoryboard'

export type StrybldrRunAllSourceImportUrl = (
  url: string,
  opts?: WorkspaceImportUrlOpts,
) => void | unknown | Promise<void | unknown>

export type StrybldrRunAllSourceImportResult = {
  importStarted: boolean
  sourceUrl: string
}

export const STRYBLDR_RUN_ALL_SOURCE_IMPORT_OPTS: WorkspaceImportUrlOpts = {
  canvas2dRenderer: 'storyboard',
  documentSemanticMode: 'document',
}

const cleanText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim()

export function readStrybldrRunAllSourceUrl(graphData: GraphData | null | undefined): string {
  const handoff = buildStrybldrVideoHandoffFromGraphData(graphData)
  return cleanText(handoff.sourceVideoUrl)
}

export async function importStrybldrRunAllSource(args: {
  graphData: GraphData | null | undefined
  importUrl?: StrybldrRunAllSourceImportUrl
}): Promise<StrybldrRunAllSourceImportResult> {
  const sourceUrl = readStrybldrRunAllSourceUrl(args.graphData)
  if (!sourceUrl || !args.importUrl) return { importStarted: false, sourceUrl }
  void Promise.resolve(args.importUrl(sourceUrl, STRYBLDR_RUN_ALL_SOURCE_IMPORT_OPTS)).catch(error => {
    console.warn('[agenticgraph] Strybldr Run All source import failed', error)
  })
  return { importStarted: true, sourceUrl }
}
