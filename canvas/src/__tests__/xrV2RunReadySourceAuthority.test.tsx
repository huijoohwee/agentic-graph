import {
  beginSourceFilesDocumentIntent,
  clearSourceFilesDocumentIntent,
  completeSourceFilesBootstrap,
} from '@/features/source-files/sourceFilesBootstrapReadiness'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { XrV2RunReadyDemoRuntime } from '@/features/canvas/XrV2RunReadyDemoRuntime'
import {
  readXrV2WorkspaceReadiness,
  stopXrV2WorkspaceReadinessRuntime,
} from '@/features/xr-v2/xrV2WorkspaceReadinessRuntime'
import {
  readXrV2PostProcessFallback,
  stopXrV2PostProcessFallbackRuntime,
} from '@/features/xr-v2/xrV2PostProcessFallbackLifecycle'
import { cancelXrV2SpatialCapture } from '@/features/xr-v2/xrV2SpatialCaptureRuntime'
import { stopXrV2ImmersiveSession } from '@/features/xr-v2/xrV2ImmersiveSessionRuntime'
import {
  WORKSPACE_RUN_READY_DEMO_ENV,
  XR_V2_DEMO_WORKSPACE_SEED_BASENAME,
} from '@/features/workspace-fs/workspaceRunReadyDemos'
import { resetGraphStoreForTests, useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { buildParsedSourceFile } from '@/tests/lib/xrRunReadySourceTestHelpers'
import { initWindowHarness } from '@/tests/lib/windowHarness'

const assertReadinessRuntimeActive = (message: string) => {
  if (readXrV2WorkspaceReadiness().status === 'idle') {
    throw new Error(`${message}, got ${JSON.stringify(readXrV2WorkspaceReadiness())}`)
  }
  if (!readXrV2PostProcessFallback().runtimeActive) {
    throw new Error(`${message}, got ${JSON.stringify(readXrV2PostProcessFallback())}`)
  }
}

const assertReadinessRuntimeStopped = (message: string) => {
  if (readXrV2WorkspaceReadiness().status !== 'idle') {
    throw new Error(`${message}, got ${JSON.stringify(readXrV2WorkspaceReadiness())}`)
  }
  if (readXrV2PostProcessFallback().runtimeActive) {
    throw new Error(`${message}, got ${JSON.stringify(readXrV2PostProcessFallback())}`)
  }
}

export async function testXrV2RunReadyRuntimeReleasesAuthorityWhileSourceAuthorityResolves() {
  const previousDemo = process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  const canonicalDocsPath = `/docs/workspace-seeds/${XR_V2_DEMO_WORKSPACE_SEED_BASENAME}`
  const canonicalDocumentText = '---\nrun_ready_demo:\n  id: xr-v2\n---\n# Canonical XR readiness demo'
  const documentIntentKey = 'test:xr-v2-resolving-document-source'
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const { dom, restore: restoreDom } = initJsdomHarness(
    '<!doctype html><html><body><section id="root"></section></body></html>',
  )
  const container = dom.window.document.getElementById('root')
  if (!container) throw new Error('missing React root container')

  delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  completeSourceFilesBootstrap()
  resetGraphStoreForTests()
  const before = useGraphStore.getState()
  const restoreGraphState = {
    canvasRenderMode: before.canvasRenderMode,
    canvasRenderModeLastFree: before.canvasRenderModeLastFree,
    canvasRenderModeIsAuto: before.canvasRenderModeIsAuto,
    canvas3dMode: before.canvas3dMode,
    floatingPanelOpen: before.floatingPanelOpen,
    floatingPanelView: before.floatingPanelView,
    bottomSurfaceCollapsed: before.bottomSurfaceCollapsed,
    markdownDocumentName: before.markdownDocumentName,
    markdownDocumentText: before.markdownDocumentText,
    markdownDocumentApplyViewPreset: before.markdownDocumentApplyViewPreset,
    sourceFiles: before.sourceFiles,
  }
  useGraphStore.setState({
    canvasRenderMode: '3d',
    canvas3dMode: 'xr',
    markdownDocumentName: canonicalDocsPath,
    markdownDocumentText: canonicalDocumentText,
    markdownDocumentApplyViewPreset: false,
    sourceFiles: [buildParsedSourceFile(canonicalDocsPath, canonicalDocumentText)],
  })
  stopXrV2WorkspaceReadinessRuntime()
  stopXrV2PostProcessFallbackRuntime()
  void stopXrV2ImmersiveSession()
  void cancelXrV2SpatialCapture()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    root = createRoot(container)
    await mountReactRoot(root, React.createElement(XrV2RunReadyDemoRuntime), {
      window: dom.window as unknown as Window,
      frames: 1,
    })

    assertReadinessRuntimeActive('expected canonical XR v2 document mount to start the readiness companion')

    await act(async () => {
      beginSourceFilesDocumentIntent(documentIntentKey)
    })
    assertReadinessRuntimeStopped('expected resolving source authority to stop the XR v2 readiness companion')

    await act(async () => {
      clearSourceFilesDocumentIntent(documentIntentKey)
    })
    assertReadinessRuntimeActive('expected settled source authority to restart the XR v2 readiness companion')
  } finally {
    try {
      clearSourceFilesDocumentIntent(documentIntentKey)
    } catch {
      void 0
    }
    if (root) {
      try {
        await unmountReactRoot(root, { window: dom.window as unknown as Window })
      } catch {
        // Preserve an earlier assertion failure.
      }
    }
    stopXrV2WorkspaceReadinessRuntime()
    stopXrV2PostProcessFallbackRuntime()
    void stopXrV2ImmersiveSession()
    void cancelXrV2SpatialCapture()
    completeSourceFilesBootstrap()
    resetGraphStoreForTests()
    useGraphStore.setState(restoreGraphState)
    restoreDom()
    restoreWindow()
    if (previousDemo === undefined) delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    else process.env[WORKSPACE_RUN_READY_DEMO_ENV] = previousDemo
  }
}

export async function testXrV2RunReadyRuntimeReleasesAuthorityOnSourceLifecycleReplacement() {
  const previousDemo = process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  const canonicalDocsPath = `/docs/workspace-seeds/${XR_V2_DEMO_WORKSPACE_SEED_BASENAME}`
  const canonicalDocumentText = '---\nrun_ready_demo:\n  id: xr-v2\n---\n# Canonical XR readiness demo'
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const { dom, restore: restoreDom } = initJsdomHarness(
    '<!doctype html><html><body><section id="root"></section></body></html>',
  )
  const container = dom.window.document.getElementById('root')
  if (!container) throw new Error('missing React root container')

  delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  completeSourceFilesBootstrap()
  resetGraphStoreForTests()
  const before = useGraphStore.getState()
  const restoreGraphState = {
    canvasRenderMode: before.canvasRenderMode,
    canvasRenderModeLastFree: before.canvasRenderModeLastFree,
    canvasRenderModeIsAuto: before.canvasRenderModeIsAuto,
    canvas3dMode: before.canvas3dMode,
    floatingPanelOpen: before.floatingPanelOpen,
    floatingPanelView: before.floatingPanelView,
    bottomSurfaceCollapsed: before.bottomSurfaceCollapsed,
    markdownDocumentName: before.markdownDocumentName,
    markdownDocumentText: before.markdownDocumentText,
    markdownDocumentApplyViewPreset: before.markdownDocumentApplyViewPreset,
    sourceFiles: before.sourceFiles,
  }
  useGraphStore.setState({
    canvasRenderMode: '3d',
    canvas3dMode: 'xr',
    markdownDocumentName: canonicalDocsPath,
    markdownDocumentText: canonicalDocumentText,
    markdownDocumentApplyViewPreset: false,
    sourceFiles: [buildParsedSourceFile(canonicalDocsPath, canonicalDocumentText, { id: 'source:xr-v2-initial' })],
  })
  stopXrV2WorkspaceReadinessRuntime()
  stopXrV2PostProcessFallbackRuntime()
  void stopXrV2ImmersiveSession()
  void cancelXrV2SpatialCapture()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    root = createRoot(container)
    await mountReactRoot(root, React.createElement(XrV2RunReadyDemoRuntime), {
      window: dom.window as unknown as Window,
      frames: 1,
    })

    assertReadinessRuntimeActive('expected canonical XR v2 document mount to start the readiness companion')

    await act(async () => {
      useGraphStore.setState({
        sourceFiles: [buildParsedSourceFile(canonicalDocsPath, canonicalDocumentText, {
          id: 'source:xr-v2-initial',
          enabled: false,
          status: 'loading',
        })],
      })
    })
    assertReadinessRuntimeStopped('expected active source lifecycle replacement to stop the XR v2 readiness companion')

    await act(async () => {
      useGraphStore.setState({
        sourceFiles: [buildParsedSourceFile(canonicalDocsPath, canonicalDocumentText, {
          id: 'source:xr-v2-next',
          parsedGraphRevision: 2,
        })],
      })
    })
    assertReadinessRuntimeActive('expected the replacement parsed source lifecycle to restart the XR v2 readiness companion')
  } finally {
    if (root) {
      try {
        await unmountReactRoot(root, { window: dom.window as unknown as Window })
      } catch {
        // Preserve an earlier assertion failure.
      }
    }
    stopXrV2WorkspaceReadinessRuntime()
    stopXrV2PostProcessFallbackRuntime()
    void stopXrV2ImmersiveSession()
    void cancelXrV2SpatialCapture()
    completeSourceFilesBootstrap()
    resetGraphStoreForTests()
    useGraphStore.setState(restoreGraphState)
    restoreDom()
    restoreWindow()
    if (previousDemo === undefined) delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    else process.env[WORKSPACE_RUN_READY_DEMO_ENV] = previousDemo
  }
}
