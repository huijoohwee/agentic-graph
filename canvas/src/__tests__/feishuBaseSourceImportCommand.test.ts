import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import type { FeishuBaseSourceAdapterInput } from '@/features/source-files/feishuBaseSourceAdapter'
import {
  createFeishuBaseSourceImportCommand,
  FEISHU_BASE_SOURCE_IMPORT_COMMAND_EVENT,
  FEISHU_BASE_SOURCE_IMPORT_COMMAND_RESULT_EVENT,
  installFeishuBaseSourceImportCommand,
} from '@/features/source-files/feishuBaseSourceImportCommand'

const FEISHU_SNAPSHOT: FeishuBaseSourceAdapterInput = {
  selection: {
    baseToken: 'appfeishubase1234567890',
    tableId: 'tblroadmap1234567890',
    viewId: 'vewpriority1234567890',
    baseTitle: 'agentic-graph Ops',
    tableName: 'Roadmap',
    viewName: 'Priority',
    sourceUrl: 'https://example.com/base/appfeishubase1234567890?table=tblroadmap1234567890',
  },
  fields: [
    { id: 'fld1', name: 'Title', type: 'text', isPrimary: true },
    { id: 'fld2', name: 'Status', type: 'singleSelect' },
  ],
  records: [
    {
      id: 'recalpha1234567890',
      fields: {
        Title: 'Ship Phase 1',
        Status: 'Done',
      },
    },
  ],
}

export function testFeishuBaseSourceImportCommandInstallsStableWindowCommand() {
  const text = readFileSync(resolve(process.cwd(), 'src', 'features', 'source-files', 'feishuBaseSourceImportCommand.ts'), 'utf8')
  for (const snippet of [
    'export type FeishuBaseSourceImportCommand = {',
    "export const FEISHU_BASE_SOURCE_IMPORT_COMMAND_EVENT = 'agentic-graph-feishu-base-source-import-command'",
    "export const FEISHU_BASE_SOURCE_IMPORT_COMMAND_RESULT_EVENT = 'agentic-graph-feishu-base-source-import-command-result'",
    'export const publishFeishuBaseSourceImportCommandResult = (value: unknown): void => {',
    'export const summarizeFeishuBaseSourceImportCommandResult = (value: unknown): unknown => {',
    'importSnapshot: (args: FeishuBaseSourceImportRequest) => Promise<FeishuBaseSourceImportResult>',
    'importFeishuBaseSnapshotIntoSourceFile(args)',
    'installFeishuBaseSourceImportCommandEventBridge(command)',
    'window.addEventListener(FEISHU_BASE_SOURCE_IMPORT_COMMAND_EVENT',
    'window.agenticGraphFeishuBaseSourceImportCommand = command',
    "writeFeishuBaseSourceImportCommandDataset('ready')",
    'delete window.agenticGraphFeishuBaseSourceImportCommand',
  ]) {
    if (!text.includes(snippet)) {
      throw new Error(`expected Feishu Base source import command contract snippet: ${snippet}`)
    }
  }
}

export async function testFeishuBaseSourceImportCommandImportsSnapshotThroughWindowCommand() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  try {
    useGraphStore.getState().resetAll()
    useGraphStore.getState().clearSourceFiles()
    const cleanup = installFeishuBaseSourceImportCommand()
    try {
      const command = window.agenticGraphFeishuBaseSourceImportCommand
      if (!command) throw new Error('expected Feishu Base source import command on window')
      const result = await command.importSnapshot({
        fileId: null,
        snapshot: FEISHU_SNAPSHOT,
      })
      if (!result.ok) {
        const error = 'error' in result ? result.error : 'unexpected_failure'
        throw new Error(`expected ok result, got error: ${error}`)
      }
      const state = useGraphStore.getState()
      const file = state.sourceFiles.find(entry => entry.id === result.fileId)
      if (!file) throw new Error('expected imported source file in store')
      if (state.markdownDocumentName !== 'agentic-graph-Ops-Roadmap.md') {
        throw new Error(`expected active markdown document name to be imported file, got ${String(state.markdownDocumentName || '')}`)
      }
      if (!String(state.markdownDocumentText || '').includes('kgFeishuBaseBaseRef: "base:appfei...7890"')) {
        throw new Error(`expected imported markdown document text, got: ${String(state.markdownDocumentText || '')}`)
      }
    } finally {
      cleanup()
    }
  } finally {
    restoreDom()
    restoreWindow()
  }
}

export async function testFeishuBaseSourceImportCommandEventBridgePublishesResult() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  try {
    useGraphStore.getState().resetAll()
    useGraphStore.getState().clearSourceFiles()
    const cleanup = installFeishuBaseSourceImportCommand()
    try {
      const payload = await new Promise<Record<string, unknown>>((resolvePromise, reject) => {
        const timeout = setTimeout(() => reject(new Error('timed out waiting for Feishu Base import command result')), 3000)
        const handler = (event: Event) => {
          clearTimeout(timeout)
          window.removeEventListener(FEISHU_BASE_SOURCE_IMPORT_COMMAND_RESULT_EVENT, handler as EventListener)
          resolvePromise(((event as CustomEvent).detail || {}) as Record<string, unknown>)
        }
        window.addEventListener(FEISHU_BASE_SOURCE_IMPORT_COMMAND_RESULT_EVENT, handler as EventListener)
        window.dispatchEvent(new window.CustomEvent(FEISHU_BASE_SOURCE_IMPORT_COMMAND_EVENT, {
          detail: {
            id: 'feishu-source-import-1',
            action: 'importSnapshot',
            args: {
              fileId: null,
              snapshot: FEISHU_SNAPSHOT,
            },
          },
        }))
      })
      if (payload.ok !== true) throw new Error(`expected ok payload, got ${JSON.stringify(payload)}`)
      const result = payload.result as Record<string, unknown>
      if (result?.ok !== true) throw new Error(`expected summarized ok result, got ${JSON.stringify(result)}`)
      if (result?.name !== 'agentic-graph-Ops-Roadmap.md') throw new Error(`expected summarized name, got ${JSON.stringify(result)}`)
      if (result?.warningCount !== 0) throw new Error(`expected zero warnings, got ${JSON.stringify(result)}`)
      const datasetValue = String(document.documentElement.dataset.kgFeishuBaseSourceImportCommandLastResult || '')
      if (!datasetValue.includes('"ok":true')) throw new Error(`expected dataset result summary, got ${datasetValue}`)
    } finally {
      cleanup()
    }
  } finally {
    restoreDom()
    restoreWindow()
  }
}

export function testAppInstallsFeishuBaseSourceImportCommand() {
  const text = readFileSync(resolve(process.cwd(), 'src', 'App.tsx'), 'utf8')
  for (const snippet of [
    "import('@/features/source-files/feishuBaseSourceImportCommand')",
    'let cleanupFeishuBaseSourceImport = () => void 0',
    'cleanupFeishuBaseSourceImport = feishuBaseSourceImportModule.installFeishuBaseSourceImportCommand()',
    'cleanupFeishuBaseSourceImport()',
  ]) {
    if (!text.includes(snippet)) {
      throw new Error(`expected App to install Feishu Base source import command snippet: ${snippet}`)
    }
  }
}
