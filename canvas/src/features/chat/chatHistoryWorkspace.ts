export type {
  ChatHistoryWorkspaceAppendArgs,
  ChatHistoryWorkspaceDraftArgs,
} from './chatHistoryWorkspace.types'

export {
  isAgenticOsStructuredMarkdown,
} from './chatHistoryWorkspace.agenticOs.parse'

export {
  buildAgenticOsWorkspaceDocument,
  normalizeAgenticOsAssistantBodyForStorage,
} from './chatHistoryWorkspace.agenticOs.build'

export {
  createNewChatHistoryWorkspaceFilePath,
  ensureChatHistoryWorkspaceFilePath,
  toAgenticOsStreamingWorkspacePath,
} from './chatHistoryWorkspace.paths'

export {
  appendChatHistoryWorkspaceFile,
  upsertChatHistoryWorkspaceDraft,
} from './chatHistoryWorkspace.persistence'
