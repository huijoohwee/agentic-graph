import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { uiWorkspaceSettingsRegistry } from '@/features/settings/registry-ui.workspace'
import {
  readWorkspaceCloudSyncEnabledSetting,
  readWorkspaceDocsMirrorRootPathSetting,
  readWorkspaceImportDefaultSourceUrlSetting,
  writeWorkspaceCloudSyncEnabledSetting,
} from '@/lib/workspace/workspaceStoreSyncSettings'
import { DocumentStorageSyncSettingsRows } from '@/features/panels/views/DocumentStorageSyncSettingsRows'

const DASH_D1_URL = 'https://dash.cloudflare.com/170e89fdb8679ff2fcc2900e25ed04f4/workers/d1'
const LOCAL_DOCS_ROOT_SAMPLE = ['', 'Users', 'huijoohwee', 'Documents', 'GitHub', 'huijoohwee', 'docs'].join('/')

export function testWorkspaceImportDefaultSourceUrlPrefersStorageBaseUrlForLocalPathAndDashboardUrl() {
  const { restore } = initJsdomHarness()
  const previousBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  const previousValue = readWorkspaceImportDefaultSourceUrlSetting()
  const store = useGraphStore.getState()
  const previousSyncMode = store.canvasWorkspaceSyncMode
  process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = 'https://airvio.co'
  const setting = uiWorkspaceSettingsRegistry.find(item => item.key === 'workspace.import.defaultSourceUrl')
  if (!setting || typeof setting.write !== 'function') {
    restore()
    throw new Error('expected workspace.import.defaultSourceUrl setting to be writable')
  }
  try {
    store.setCanvasWorkspaceSyncMode('manual')
    setting.write(LOCAL_DOCS_ROOT_SAMPLE)
    const afterLocalPath = readWorkspaceImportDefaultSourceUrlSetting()
    if (afterLocalPath !== 'https://airvio.co') {
      throw new Error(`expected local-path import default source URL to normalize to storage base URL, got ${afterLocalPath}`)
    }
    if (useGraphStore.getState().canvasWorkspaceSyncMode !== 'realtime') {
      throw new Error('expected workspace import default source URL write to switch canvasWorkspaceSyncMode to realtime')
    }
    setting.write(DASH_D1_URL)
    const afterDashboardUrl = readWorkspaceImportDefaultSourceUrlSetting()
    if (afterDashboardUrl !== 'https://airvio.co') {
      throw new Error(`expected Cloudflare D1 dashboard URL to normalize to storage base URL, got ${afterDashboardUrl}`)
    }
  } finally {
    setting.write(previousValue)
    useGraphStore.getState().setCanvasWorkspaceSyncMode(previousSyncMode)
    if (typeof previousBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
    restore()
  }
}

export function testWorkspaceCloudSyncPreferenceDoesNotDisableLocalMirrorSettings() {
  const { restore } = initJsdomHarness()
  const previousCloudSync = readWorkspaceCloudSyncEnabledSetting()
  try {
    writeWorkspaceCloudSyncEnabledSetting(false)
    if (readWorkspaceCloudSyncEnabledSetting()) throw new Error('expected offline-only preference to persist')
    if (typeof readWorkspaceDocsMirrorRootPathSetting() !== 'string') {
      throw new Error('expected local docs mirror setting to remain available in offline-only mode')
    }
    writeWorkspaceCloudSyncEnabledSetting(true)
    if (!readWorkspaceCloudSyncEnabledSetting()) throw new Error('expected online collaboration preference to persist')
  } finally {
    writeWorkspaceCloudSyncEnabledSetting(previousCloudSync)
    restore()
  }
}

export async function testDocumentStorageSyncSettingsRenderAndSwitchOffline() {
  const harness = initJsdomHarness('<!doctype html><html><body><ul id="root"></ul></body></html>')
  const container = harness.dom.window.document.getElementById('root')
  if (!container) throw new Error('missing document storage settings root')
  const previousCloudSync = readWorkspaceCloudSyncEnabledSetting()
  const root = createRoot(container)
  try {
    writeWorkspaceCloudSyncEnabledSetting(true)
    await act(async () => {
      root.render(React.createElement(DocumentStorageSyncSettingsRows))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    const text = String(container.textContent || '')
    for (const token of ['GitHub/knowgrph/docs', 'GitHub/huijoohwee/docs', 'IndexedDB: active', 'Sync now']) {
      if (!text.includes(token)) throw new Error(`expected rendered document storage settings to include ${JSON.stringify(token)}`)
    }
    const offlineButton = (Array.from(container.querySelectorAll('button')) as HTMLElement[])
      .find(button => String(button.textContent || '').includes('Offline only'))
    if (!offlineButton) throw new Error('expected rendered offline-only control')
    await act(async () => {
      offlineButton.dispatchEvent(new harness.dom.window.MouseEvent('click', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    if (readWorkspaceCloudSyncEnabledSetting()) throw new Error('expected offline-only control to update the cloud preference')
  } finally {
    writeWorkspaceCloudSyncEnabledSetting(previousCloudSync)
    await act(async () => {
      root.unmount()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    harness.restore()
  }
}

export function testWorkspaceDocsMirrorRootPathIsMainPanelConfigurable() {
  const { restore } = initJsdomHarness()
  const previousEnvRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const setting = uiWorkspaceSettingsRegistry.find(item => item.key === 'workspace.sync.docsMirror.rootPath')
  if (!setting || typeof setting.write !== 'function') {
    restore()
    throw new Error('expected workspace.sync.docsMirror.rootPath setting to be writable')
  }
  try {
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = '/tmp/fallback-docs'
    setting.write(`${LOCAL_DOCS_ROOT_SAMPLE}/`)
    const configuredRoot = readWorkspaceDocsMirrorRootPathSetting()
    if (configuredRoot !== LOCAL_DOCS_ROOT_SAMPLE) {
      throw new Error(`expected docs mirror root setting to normalize and persist the configured root, got ${configuredRoot}`)
    }
    setting.write('')
    const fallbackRoot = readWorkspaceDocsMirrorRootPathSetting()
    if (fallbackRoot !== '/tmp/fallback-docs') {
      throw new Error(`expected empty docs mirror root setting to fall back to env root, got ${fallbackRoot}`)
    }
  } finally {
    setting.write('')
    if (typeof previousEnvRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousEnvRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    restore()
  }
}
