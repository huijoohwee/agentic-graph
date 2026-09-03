import {
  buildLarkAppRemoteMutationRequest,
  createLarkAppRemoteMutationAcceptedResult,
  createLarkAppRemoteMutationAppliedResult,
  createLarkAppRemoteMutationPreviewResult,
} from '@/features/canvas/larkAppRemoteMutationBridge'
import type {
  LarkAppRemoteMutationRequest,
  LarkAppRemoteMutationResult,
} from '@/features/canvas/larkAppRemoteMutationBridge'
import type { FeishuBaseSourceImportCommand } from '@/features/source-files/feishuBaseSourceImportCommand'

export type LarkAppRemoteMutationBridgeCommand = {
  execute: (request: LarkAppRemoteMutationRequest) => Promise<LarkAppRemoteMutationResult>
}

export const LARK_APP_REMOTE_MUTATION_BRIDGE_EVENT =
  'agentic-graph-lark-app-remote-mutation-bridge'
export const LARK_APP_REMOTE_MUTATION_BRIDGE_RESULT_EVENT =
  'agentic-graph-lark-app-remote-mutation-bridge-result'

const LARK_APP_REMOTE_MUTATION_BRIDGE_DATASET_KEY = 'kgLarkAppRemoteMutationBridge'
const LARK_APP_REMOTE_MUTATION_BRIDGE_RESULT_DATASET_KEY =
  'kgLarkAppRemoteMutationBridgeLastResult'

type RemoteMutationWindow = Window & {
  agenticGraphLarkAppRemoteMutationBridge?: LarkAppRemoteMutationBridgeCommand
  agenticGraphFeishuBaseSourceImportCommand?: FeishuBaseSourceImportCommand
}

const writeDatasetValue = (key: string, value: string): void => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset[key] = value
}

const writeResultDataset = (value: unknown): void => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset[LARK_APP_REMOTE_MUTATION_BRIDGE_RESULT_DATASET_KEY] = JSON.stringify(value)
}

const readOptionalString = (value: unknown): string => String(value || '').trim()

const readImportCommand = async (): Promise<FeishuBaseSourceImportCommand> => {
  const activeWindow = window as RemoteMutationWindow
  const installed = activeWindow.agenticGraphFeishuBaseSourceImportCommand
  if (installed?.importSnapshot) return installed
  const module = await import('@/features/source-files/feishuBaseSourceImportCommand')
  return module.createFeishuBaseSourceImportCommand()
}

const runRemoteMutationRequest = async (
  request: LarkAppRemoteMutationRequest,
): Promise<LarkAppRemoteMutationResult> => {
  const normalized = buildLarkAppRemoteMutationRequest(request)
  if (normalized.action === 'publish-approved-artifact') {
    if (normalized.dryRun) {
      return createLarkAppRemoteMutationPreviewResult(normalized)
    }
    return {
      ok: false,
      error: 'Live publish-approved-artifact bridge is not implemented. Use dry-run preview locally and wait for a dedicated remote endpoint before applying publish.',
      retryable: false,
    }
  }
  if (!normalized.importRequest) {
    return {
      ok: false,
      error: 'Import-source-document requires importRequest.',
      retryable: false,
    }
  }
  if (normalized.dryRun) {
    return createLarkAppRemoteMutationAcceptedResult(normalized)
  }
  const importCommand = await readImportCommand()
  const result = await importCommand.importSnapshot(normalized.importRequest)
  if (result.ok === false) {
    return {
      ok: false,
      error: result.error,
      retryable: false,
    }
  }
  return createLarkAppRemoteMutationAppliedResult(normalized, result)
}

const installEventBridge = (command: LarkAppRemoteMutationBridgeCommand): (() => void) => {
  if (typeof window === 'undefined') return () => void 0
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent).detail
    const request = detail && typeof detail === 'object' && !Array.isArray(detail)
      ? detail as { id?: unknown; action?: unknown; args?: unknown }
      : {}
    const id = readOptionalString(request.id) || `lark-remote-mutation-${Date.now()}`
    const action = readOptionalString(request.action)
    const run = async (): Promise<LarkAppRemoteMutationResult> => {
      if (action !== 'execute') {
        throw new Error(`Unsupported Lark App remote mutation bridge action: ${action || 'unknown'}`)
      }
      return await command.execute((request.args || {}) as LarkAppRemoteMutationRequest)
    }
    void run()
      .then(result => {
        const payload = { id, ok: true, result }
        writeResultDataset(payload)
        window.dispatchEvent(new window.CustomEvent(LARK_APP_REMOTE_MUTATION_BRIDGE_RESULT_EVENT, { detail: payload }))
      })
      .catch(error => {
        const payload = {
          id,
          ok: false,
          error: error instanceof Error ? error.message : String(error || 'Lark App remote mutation bridge failed'),
        }
        writeResultDataset(payload)
        window.dispatchEvent(new window.CustomEvent(LARK_APP_REMOTE_MUTATION_BRIDGE_RESULT_EVENT, { detail: payload }))
      })
  }
  window.addEventListener(LARK_APP_REMOTE_MUTATION_BRIDGE_EVENT, handler as EventListener)
  return () => window.removeEventListener(LARK_APP_REMOTE_MUTATION_BRIDGE_EVENT, handler as EventListener)
}

export const createLarkAppRemoteMutationBridgeCommand =
  (): LarkAppRemoteMutationBridgeCommand => ({
    execute: async (request: LarkAppRemoteMutationRequest) => {
      return await runRemoteMutationRequest(request)
    },
  })

declare global {
  interface Window {
    agenticGraphLarkAppRemoteMutationBridge?: LarkAppRemoteMutationBridgeCommand
  }
}

export const installLarkAppRemoteMutationBridgeCommand = (): (() => void) => {
  if (typeof window === 'undefined') return () => void 0
  const command = createLarkAppRemoteMutationBridgeCommand()
  const cleanupEventBridge = installEventBridge(command)
  const activeWindow = window as RemoteMutationWindow
  activeWindow.agenticGraphLarkAppRemoteMutationBridge = command
  writeDatasetValue(LARK_APP_REMOTE_MUTATION_BRIDGE_DATASET_KEY, 'ready')
  return () => {
    cleanupEventBridge()
    if (activeWindow.agenticGraphLarkAppRemoteMutationBridge === command) {
      delete activeWindow.agenticGraphLarkAppRemoteMutationBridge
    }
    writeDatasetValue(LARK_APP_REMOTE_MUTATION_BRIDGE_DATASET_KEY, 'removed')
  }
}
