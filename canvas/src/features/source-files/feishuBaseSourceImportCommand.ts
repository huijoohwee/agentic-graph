import {
  importFeishuBaseSnapshotIntoSourceFile,
} from '@/features/source-files/sourceFilesIngestIntegration'
import type {
  FeishuBaseSourceImportRequest,
  FeishuBaseSourceImportResult,
} from '@/features/source-files/feishuBaseSourceImportContract'
import {
  importKnowledgeSourceFromHandoff,
  type KnowledgeSourceImportRequest,
  type KnowledgeSourceImportResult,
} from '@/features/source-files/knowledge-source/knowledgeSourceImportCommand'

export type FeishuBaseSourceImportCommand = {
  importSnapshot: (args: FeishuBaseSourceImportRequest) => Promise<FeishuBaseSourceImportResult>
  importKnowledgeSource?: (args: KnowledgeSourceImportRequest) => Promise<KnowledgeSourceImportResult>
}

export const FEISHU_BASE_SOURCE_IMPORT_COMMAND_EVENT = 'knowgrph-feishu-base-source-import-command'
export const FEISHU_BASE_SOURCE_IMPORT_COMMAND_RESULT_EVENT = 'knowgrph-feishu-base-source-import-command-result'
const FEISHU_BASE_SOURCE_IMPORT_COMMAND_DATASET_KEY = 'kgFeishuBaseSourceImportCommand'
const FEISHU_BASE_SOURCE_IMPORT_COMMAND_RESULT_DATASET_KEY = 'kgFeishuBaseSourceImportCommandLastResult'

const readOptionalString = (value: unknown): string => String(value || '').trim()

const writeFeishuBaseSourceImportCommandDataset = (value: string): void => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset[FEISHU_BASE_SOURCE_IMPORT_COMMAND_DATASET_KEY] = value
}

const writeFeishuBaseSourceImportCommandResult = (value: unknown): void => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset[FEISHU_BASE_SOURCE_IMPORT_COMMAND_RESULT_DATASET_KEY] = JSON.stringify(value)
}

export const publishFeishuBaseSourceImportCommandResult = (value: unknown): void => {
  writeFeishuBaseSourceImportCommandResult(value)
}

export const summarizeFeishuBaseSourceImportCommandResult = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  return {
    ok: record.ok === true,
    fileId: typeof record.fileId === 'string' ? record.fileId : null,
    name: typeof record.name === 'string' ? record.name : null,
    error: typeof record.error === 'string' ? record.error : null,
    warningCount: Array.isArray(record.warnings) ? record.warnings.length : 0,
  }
}

const installFeishuBaseSourceImportCommandEventBridge = (
  command: FeishuBaseSourceImportCommand,
): (() => void) => {
  if (typeof window === 'undefined') return () => void 0
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent).detail
    const request = detail && typeof detail === 'object' && !Array.isArray(detail)
      ? detail as { id?: unknown; action?: unknown; args?: unknown }
      : {}
    const id = readOptionalString(request.id) || `feishu-base-source-import-${Date.now()}`
    const action = readOptionalString(request.action)
    const run = async (): Promise<unknown> => {
      if (action === 'importSnapshot') {
        return await command.importSnapshot((request.args || {}) as FeishuBaseSourceImportRequest)
      }
      if (action === 'importKnowledgeSource') {
        if (!command.importKnowledgeSource) throw new Error('Knowledge-source import command is unavailable.')
        return await command.importKnowledgeSource((request.args || {}) as KnowledgeSourceImportRequest)
      }
      throw new Error(`Unsupported Feishu Base source import command action: ${action || 'unknown'}`)
    }
    void run()
      .then(result => {
        const payload = { id, ok: true, result: summarizeFeishuBaseSourceImportCommandResult(result) }
        writeFeishuBaseSourceImportCommandResult(payload)
        window.dispatchEvent(new window.CustomEvent(FEISHU_BASE_SOURCE_IMPORT_COMMAND_RESULT_EVENT, { detail: payload }))
      })
      .catch(error => {
        const payload = { id, ok: false, error: error instanceof Error ? error.message : String(error || 'Feishu Base source import command failed') }
        writeFeishuBaseSourceImportCommandResult(payload)
        window.dispatchEvent(new window.CustomEvent(FEISHU_BASE_SOURCE_IMPORT_COMMAND_RESULT_EVENT, { detail: payload }))
      })
  }
  window.addEventListener(FEISHU_BASE_SOURCE_IMPORT_COMMAND_EVENT, handler as EventListener)
  return () => window.removeEventListener(FEISHU_BASE_SOURCE_IMPORT_COMMAND_EVENT, handler as EventListener)
}

export const createFeishuBaseSourceImportCommand = (): FeishuBaseSourceImportCommand => ({
  importSnapshot: async (args: FeishuBaseSourceImportRequest) => {
    return await importFeishuBaseSnapshotIntoSourceFile(args)
  },
  importKnowledgeSource: async (args: KnowledgeSourceImportRequest) => {
    return await importKnowledgeSourceFromHandoff(args)
  },
})

declare global {
  interface Window {
    knowgrphFeishuBaseSourceImportCommand?: FeishuBaseSourceImportCommand
  }
}

export const installFeishuBaseSourceImportCommand = (): (() => void) => {
  if (typeof window === 'undefined') return () => void 0
  const command = createFeishuBaseSourceImportCommand()
  const cleanupEventBridge = installFeishuBaseSourceImportCommandEventBridge(command)
  window.knowgrphFeishuBaseSourceImportCommand = command
  writeFeishuBaseSourceImportCommandDataset('ready')
  return () => {
    cleanupEventBridge()
    if (window.knowgrphFeishuBaseSourceImportCommand === command) {
      delete window.knowgrphFeishuBaseSourceImportCommand
    }
    writeFeishuBaseSourceImportCommandDataset('removed')
  }
}
