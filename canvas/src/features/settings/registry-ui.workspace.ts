import type { SettingMeta } from './types'
import { readCanvasContainerSizing, writeCanvasContainerSizing } from '@/lib/canvas/canvasContainerSizing'
import {
  PRINT_LAYOUT_TOKENS,
  WORKSPACE_LAYOUT_TOKENS,
  readPrintLayoutToken,
  readWorkspaceLayoutToken,
  writePrintLayoutToken,
  writeWorkspaceLayoutToken,
} from '@/lib/workspace/workspaceLayoutSettings'
import {
  normalizeWorkspaceImportDefaultSourceUrlForSourceFiles,
  readWorkspaceDocsMirrorRootPathSetting,
  readWorkspaceAutoRefreshEnabledSetting,
  readWorkspaceImportDefaultSourceUrlSetting,
  readWorkspaceImportShareExportRootPathSetting,
  readWorkspaceImportVideoDownloadOutputDirSetting,
  readWorkspaceSeedSyncEnabledSetting,
  readWorkspaceSeedSyncIdleMaxMsSetting,
  readWorkspaceSeedSyncPollMsSetting,
  readWorkspaceSourceFilesDocsOnlySetting,
  readWorkspaceSourceFilesSyncDebounceMsSetting,
  writeWorkspaceAutoRefreshEnabledSetting,
  writeWorkspaceDocsMirrorRootPathSetting,
  writeWorkspaceImportDefaultSourceUrlSetting,
  writeWorkspaceImportShareExportRootPathSetting,
  writeWorkspaceImportVideoDownloadOutputDirSetting,
  writeWorkspaceSeedSyncEnabledSetting,
  writeWorkspaceSeedSyncIdleMaxMsSetting,
  writeWorkspaceSeedSyncPollMsSetting,
  writeWorkspaceSourceFilesDocsOnlySetting,
  writeWorkspaceSourceFilesSyncDebounceMsSetting,
} from '@/lib/workspace/workspaceStoreSyncSettings'
import { useGraphStore } from '@/hooks/useGraphStore'

const workspaceSettings: SettingMeta[] = WORKSPACE_LAYOUT_TOKENS.map(token => ({
  key: token.key,
  type: 'number',
  source: 'localStorage',
  read: () => readWorkspaceLayoutToken(token.key),
  write: value => {
    writeWorkspaceLayoutToken(token.key, Number(value))
  },
  docKey: token.key,
  default: () => token.defaultValue,
}))

const printSettings: SettingMeta[] = PRINT_LAYOUT_TOKENS.map(token => ({
  key: token.key,
  type: 'number',
  source: 'localStorage',
  read: () => readPrintLayoutToken(token.key),
  write: value => {
    writePrintLayoutToken(token.key, Number(value))
  },
  docKey: token.key,
  default: () => token.defaultValue,
}))

export const uiWorkspaceSettingsRegistry: SettingMeta[] = [
  {
    key: 'canvas.container.sizing', type: 'string', source: 'localStorage',
    read: readCanvasContainerSizing, write: writeCanvasContainerSizing,
    default: () => 'full', options: ['full', 'inset'],
  },
  ...workspaceSettings,
  ...printSettings,
  {
    key: 'workspace.sync.docsMirror.rootPath',
    type: 'string',
    source: 'localStorage',
    read: () => readWorkspaceDocsMirrorRootPathSetting(),
    write: value => {
      writeWorkspaceDocsMirrorRootPathSetting(String(value ?? ''))
    },
    default: () => readWorkspaceDocsMirrorRootPathSetting(),
  },
  {
    key: 'workspace.sync.seed.enabled',
    type: 'boolean',
    source: 'localStorage',
    read: () => readWorkspaceSeedSyncEnabledSetting(),
    write: value => {
      writeWorkspaceSeedSyncEnabledSetting(!!value)
    },
    default: () => true,
  },
  {
    key: 'workspace.sync.seed.pollMs',
    type: 'number',
    source: 'localStorage',
    read: () => readWorkspaceSeedSyncPollMsSetting(),
    write: value => {
      writeWorkspaceSeedSyncPollMsSetting(Number(value))
    },
    default: () => 3000,
  },
  {
    key: 'workspace.sync.seed.idleMaxMs',
    type: 'number',
    source: 'localStorage',
    read: () => readWorkspaceSeedSyncIdleMaxMsSetting(),
    write: value => {
      writeWorkspaceSeedSyncIdleMaxMsSetting(Number(value))
    },
    default: () => 30000,
  },
  {
    key: 'workspace.sync.autoRefresh.enabled',
    type: 'boolean',
    source: 'localStorage',
    read: () => readWorkspaceAutoRefreshEnabledSetting(),
    write: value => {
      writeWorkspaceAutoRefreshEnabledSetting(!!value)
    },
    default: () => true,
  },
  {
    key: 'workspace.sync.sourceFiles.docsOnly',
    type: 'boolean',
    source: 'localStorage',
    read: () => readWorkspaceSourceFilesDocsOnlySetting(),
    write: value => {
      writeWorkspaceSourceFilesDocsOnlySetting(!!value)
    },
    default: () => true,
  },
  {
    key: 'workspace.sync.sourceFiles.debounceMs',
    type: 'number',
    source: 'localStorage',
    read: () => readWorkspaceSourceFilesSyncDebounceMsSetting(),
    write: value => {
      writeWorkspaceSourceFilesSyncDebounceMsSetting(Number(value))
    },
    default: () => 1200,
  },
  {
    key: 'workspace.import.defaultSourceUrl',
    type: 'string',
    source: 'localStorage',
    read: () => readWorkspaceImportDefaultSourceUrlSetting(),
    write: value => {
      const normalized = normalizeWorkspaceImportDefaultSourceUrlForSourceFiles(String(value ?? ''))
      writeWorkspaceImportDefaultSourceUrlSetting(normalized)
      if (normalized) {
        useGraphStore.getState().setCanvasWorkspaceSyncMode('realtime')
      }
    },
    default: () => '',
  },
  {
    key: 'workspace.import.shareExportRootPath',
    type: 'string',
    source: 'localStorage',
    read: () => readWorkspaceImportShareExportRootPathSetting(),
    write: value => {
      writeWorkspaceImportShareExportRootPathSetting(String(value ?? ''))
    },
    default: () => '/docs_',
  },
  {
    key: 'workspace.import.videoDownload.outputDir',
    type: 'string',
    source: 'localStorage',
    read: () => readWorkspaceImportVideoDownloadOutputDirSetting(),
    write: value => {
      writeWorkspaceImportVideoDownloadOutputDirSetting(String(value ?? ''))
    },
    default: () => readWorkspaceImportVideoDownloadOutputDirSetting(),
  },
]
