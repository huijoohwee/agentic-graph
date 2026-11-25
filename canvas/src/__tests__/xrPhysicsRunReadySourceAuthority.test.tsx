import {
  beginSourceFilesDocumentIntent,
  clearSourceFilesDocumentIntent,
  completeSourceFilesBootstrap,
} from '@/features/source-files/sourceFilesBootstrapReadiness'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { XrPhysicsRunReadyDemoRuntime } from '@/features/canvas/XrPhysicsRunReadyDemoRuntime'
import {
  exitXrNativeControllerDemo,
  readXrNativeControllerDemo,
  resetSharedXrNativeControllerDemo,
} from '@/features/three/xrNativeControllerDemoRuntime'
import {
  WORKSPACE_RUN_READY_DEMO_ENV,
  XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
} from '@/features/workspace-fs/workspaceRunReadyDemos'
import { resetGraphStoreForTests, useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { buildParsedSourceFile } from '@/tests/lib/xrRunReadySourceTestHelpers'
import { initWindowHarness } from '@/tests/lib/windowHarness'

export async function testXrPhysicsRunReadyRuntimeReleasesDocumentOwnershipWhileSourceAuthorityResolves() {
  const previousDemo = process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  const canonicalDocsPath = `/docs/workspace-seeds/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`
  const canonicalDocumentText = '---\nrun_ready_demo:\n  id: xr-v2\n---\n# Canonical XR physics demo'
  const documentIntentKey = 'test:resolving-document-source'
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
    markdownDocumentName: canonicalDocsPath,
    markdownDocumentText: canonicalDocumentText,
    markdownDocumentApplyViewPreset: false,
    sourceFiles: [buildParsedSourceFile(canonicalDocsPath, canonicalDocumentText)],
  })
  exitXrNativeControllerDemo()
  resetSharedXrNativeControllerDemo()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    root = createRoot(container)
    await mountReactRoot(root, React.createElement(XrPhysicsRunReadyDemoRuntime), {
      window: dom.window as unknown as Window,
      frames: 1,
    })

    const running = readXrNativeControllerDemo()
    if (running.phase !== 'running') {
      throw new Error(`expected canonical document mount to own the XR runtime, got ${JSON.stringify(running)}`)
    }

    await act(async () => {
      beginSourceFilesDocumentIntent(documentIntentKey)
    })
    const released = readXrNativeControllerDemo()
    if (released.phase !== 'off' || released.revision !== running.revision + 1) {
      throw new Error(`expected resolving source authority to release the document-owned XR runtime, got ${JSON.stringify(released)}`)
    }

    await act(async () => {
      clearSourceFilesDocumentIntent(documentIntentKey)
    })
    const reclaimed = readXrNativeControllerDemo()
    if (reclaimed.phase !== 'running' || reclaimed.revision !== released.revision + 2) {
      throw new Error(`expected settled source authority to reclaim the canonical XR runtime once, got ${JSON.stringify(reclaimed)}`)
    }
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
    exitXrNativeControllerDemo()
    completeSourceFilesBootstrap()
    resetGraphStoreForTests()
    useGraphStore.setState(restoreGraphState)
    restoreDom()
    restoreWindow()
    if (previousDemo === undefined) delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    else process.env[WORKSPACE_RUN_READY_DEMO_ENV] = previousDemo
  }
}

export async function testXrPhysicsRunReadyRuntimeReleasesDocumentOwnershipOnSourceLifecycleReplacement() {
  const previousDemo = process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  const canonicalDocsPath = `/docs/workspace-seeds/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`
  const canonicalDocumentText = '---\nrun_ready_demo:\n  id: xr-v2\n---\n# Canonical XR physics demo'
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
    markdownDocumentName: canonicalDocsPath,
    markdownDocumentText: canonicalDocumentText,
    markdownDocumentApplyViewPreset: false,
    sourceFiles: [buildParsedSourceFile(canonicalDocsPath, canonicalDocumentText, { id: 'source:xr-initial' })],
  })
  exitXrNativeControllerDemo()
  resetSharedXrNativeControllerDemo()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    root = createRoot(container)
    await mountReactRoot(root, React.createElement(XrPhysicsRunReadyDemoRuntime), {
      window: dom.window as unknown as Window,
      frames: 1,
    })

    const running = readXrNativeControllerDemo()
    if (running.phase !== 'running') {
      throw new Error(`expected canonical document mount to own the XR runtime, got ${JSON.stringify(running)}`)
    }

    await act(async () => {
      useGraphStore.setState({
        sourceFiles: [buildParsedSourceFile(canonicalDocsPath, canonicalDocumentText, {
          id: 'source:xr-initial',
          enabled: false,
          status: 'loading',
        })],
      })
    })
    const released = readXrNativeControllerDemo()
    if (released.phase !== 'off' || released.revision !== running.revision + 1) {
      throw new Error(`expected active source lifecycle replacement to release the document-owned XR runtime, got ${JSON.stringify(released)}`)
    }

    await act(async () => {
      useGraphStore.setState({
        sourceFiles: [buildParsedSourceFile(canonicalDocsPath, canonicalDocumentText, {
          id: 'source:xr-next',
          parsedGraphRevision: 2,
        })],
      })
    })
    const reclaimed = readXrNativeControllerDemo()
    if (reclaimed.phase !== 'running' || reclaimed.revision !== released.revision + 2) {
      throw new Error(`expected the replacement parsed source lifecycle to reclaim the canonical XR runtime once, got ${JSON.stringify(reclaimed)}`)
    }
  } finally {
    if (root) {
      try {
        await unmountReactRoot(root, { window: dom.window as unknown as Window })
      } catch {
        // Preserve an earlier assertion failure.
      }
    }
    exitXrNativeControllerDemo()
    completeSourceFilesBootstrap()
    resetGraphStoreForTests()
    useGraphStore.setState(restoreGraphState)
    restoreDom()
    restoreWindow()
    if (previousDemo === undefined) delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    else process.env[WORKSPACE_RUN_READY_DEMO_ENV] = previousDemo
  }
}
