import { readAgenticGraphStorageCanvasRoomConfig } from '@/lib/storage/agentic-graph-storage-canvas-room-client'
import { useAgenticGraphStorageCollaborationRuntime } from '@/features/collaboration/use-agentic-graph-storage-collaboration-runtime'
import { useP2PCollaborationRuntime } from '@/features/collaboration/useP2PCollaborationRuntime'

const useConfiguredCollaborationRuntime = readAgenticGraphStorageCanvasRoomConfig()
  ? useAgenticGraphStorageCollaborationRuntime
  : useP2PCollaborationRuntime

type SetActiveMarkdownDocument = (args: {
  name: string
  text: string
  autoEnableFrontmatter?: boolean
  applyViewPreset?: boolean
  normalizeMermaidMmd?: boolean
}) => Promise<boolean>

type SetActiveText = (text: string) => void

export async function applyRemoteDocumentToMarkdownWorkspace(args: {
  activeDocumentKey: string | null
  documentKey: string
  text: string
  setActiveMarkdownDocument: SetActiveMarkdownDocument
  setActiveText: SetActiveText
}): Promise<boolean> {
  const applied = await args.setActiveMarkdownDocument({
    name: args.documentKey,
    text: args.text,
    normalizeMermaidMmd: false,
    autoEnableFrontmatter: false,
    applyViewPreset: false,
  })
  if (applied !== false && String(args.activeDocumentKey || '').trim() === String(args.documentKey || '').trim()) {
    args.setActiveText(args.text)
  }
  return applied
}

export const useMarkdownWorkspaceCollaborationRuntimeBridge = (args: {
  active: boolean
  activeDocumentKey: string | null
  activeText: string
  setActiveMarkdownDocument: SetActiveMarkdownDocument
  setActiveText: SetActiveText
  revealLineInEditor: (line: number) => void
}) => {
  const runtimeArgs = {
    active: args.active,
    activeDocumentKey: args.activeDocumentKey,
    activeText: args.activeText,
    applyRemoteDocument: async ({ documentKey, text }) => {
      await applyRemoteDocumentToMarkdownWorkspace({
        activeDocumentKey: args.activeDocumentKey,
        documentKey,
        text,
        setActiveMarkdownDocument: args.setActiveMarkdownDocument,
        setActiveText: args.setActiveText,
      })
    },
    revealRemoteLine: line => {
      args.revealLineInEditor(line)
    },
  }
  return useConfiguredCollaborationRuntime(runtimeArgs)
}
