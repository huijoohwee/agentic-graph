import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { XrPhysicsRunReadyDemoRuntime } from '@/features/canvas/XrPhysicsRunReadyDemoRuntime'
import { XrNativeControllerDemoHud } from '@/features/three/XrNativeControllerDemoHud'
import {
  developAndRunXrNativeControllerDemo,
  exitXrNativeControllerDemo,
  pauseXrNativeControllerDemo,
  readXrNativeControllerDemo,
  resetSharedXrNativeControllerDemo,
} from '@/features/three/xrNativeControllerDemoRuntime'
import {
  readXrNativeControllerCamera,
  selectXrNativeControllerCameraMode,
} from '@/features/three/xrNativeControllerCameraRuntime'
import {
  readCameraFramingRuntime,
  resetCameraFramingRuntimeForDocument,
} from '@/features/strybldr/cameraFramingRuntime'
import {
  CARE_AGENT_RUN_READY_DEMO_ID,
  RISK_COPILOT_RUN_READY_DEMO_ID,
  WORKSPACE_RUN_READY_DEMO_ENV,
  XR_PHYSICS_RUN_READY_DEMO_ID,
  XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
  isXrPhysicsRunReadyDemoActive,
  resolveWorkspaceRunReadyDemoIdForDocument,
  resolveWorkspaceRunReadyDemoIdForDocumentPath,
} from '@/features/workspace-fs/workspaceRunReadyDemos'
import { resetGraphStoreForTests, useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'

const waitForUnmountTeardown = async (): Promise<void> => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

export async function testXrPhysicsRunReadyRuntimeUnmountTeardownRespectsLaunchOwnership() {
  const previousDemo = process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  const canonicalDocsPath = `/docs/workspace-seeds/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`
  const unrelatedPath = '/docs/workspace-seeds/workspace-readme.md'
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const { dom, restore: restoreDom } = initJsdomHarness(
    '<!doctype html><html><body><section id="root"></section></body></html>',
  )
  const container = dom.window.document.getElementById('root')
  if (!container) throw new Error('missing React root container')

  resetGraphStoreForTests()
  resetCameraFramingRuntimeForDocument('xr-physics-document-activation-test')
  selectXrNativeControllerCameraMode('free-orbit')
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
  }
  const runtimeElement = () => React.createElement(
    React.StrictMode,
    null,
    React.createElement(XrPhysicsRunReadyDemoRuntime),
  )
  let root: ReturnType<typeof createRoot> | null = null

  try {
    delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    useGraphStore.setState({
      markdownDocumentName: canonicalDocsPath,
      markdownDocumentText: '# Canonical XR physics demo',
      markdownDocumentApplyViewPreset: false,
    })
    exitXrNativeControllerDemo()
    resetSharedXrNativeControllerDemo()
    const beforeDocumentLaunch = readXrNativeControllerDemo()
    if (beforeDocumentLaunch.phase !== 'ready') {
      throw new Error(`expected document auto-start regression to begin from ready, got ${JSON.stringify(beforeDocumentLaunch)}`)
    }
    root = createRoot(container)
    await mountReactRoot(root, runtimeElement(), {
      window: dom.window as unknown as Window,
      frames: 1,
    })
    const documentOwned = readXrNativeControllerDemo()
    if (
      documentOwned.phase !== 'running'
      || documentOwned.revision !== beforeDocumentLaunch.revision + 2
    ) {
      throw new Error(`expected StrictMode replay to retain exactly one document-owned launch, got ${JSON.stringify(documentOwned)}`)
    }
    await waitForUnmountTeardown()
    if (readXrNativeControllerDemo().revision !== documentOwned.revision) {
      throw new Error('expected StrictMode effect replay to cancel deferred teardown without a launch/exit loop')
    }
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    root = null
    await waitForUnmountTeardown()
    const afterDocumentUnmount = readXrNativeControllerDemo()
    if (afterDocumentUnmount.phase !== 'off' || afterDocumentUnmount.revision !== documentOwned.revision + 1) {
      throw new Error(`expected true unmount to stop its document-owned runtime exactly once, got ${JSON.stringify(afterDocumentUnmount)}`)
    }

    process.env[WORKSPACE_RUN_READY_DEMO_ENV] = XR_PHYSICS_RUN_READY_DEMO_ID
    useGraphStore.setState({
      markdownDocumentName: unrelatedPath,
      markdownDocumentText: '# Unrelated document',
      markdownDocumentApplyViewPreset: false,
    })
    const beforeDedicatedLaunch = readXrNativeControllerDemo()
    root = createRoot(container)
    await mountReactRoot(root, runtimeElement(), {
      window: dom.window as unknown as Window,
      frames: 1,
    })
    const dedicated = readXrNativeControllerDemo()
    if (dedicated.phase !== 'running' || dedicated.revision !== beforeDedicatedLaunch.revision + 2) {
      throw new Error(`expected one dedicated run-ready launch, got ${JSON.stringify(dedicated)}`)
    }
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    root = null
    await waitForUnmountTeardown()
    const afterDedicatedUnmount = readXrNativeControllerDemo()
    if (afterDedicatedUnmount.phase !== 'running' || afterDedicatedUnmount.revision !== dedicated.revision) {
      throw new Error(`expected dedicated runtime ownership to survive page-runtime unmount, got ${JSON.stringify(afterDedicatedUnmount)}`)
    }

    delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    useGraphStore.setState({
      markdownDocumentName: canonicalDocsPath,
      markdownDocumentText: '# Canonical XR physics demo',
      markdownDocumentApplyViewPreset: false,
    })
    exitXrNativeControllerDemo()
    developAndRunXrNativeControllerDemo()
    const preExisting = readXrNativeControllerDemo()
    root = createRoot(container)
    await mountReactRoot(root, runtimeElement(), {
      window: dom.window as unknown as Window,
      frames: 1,
    })
    const afterPreExistingMount = readXrNativeControllerDemo()
    if (afterPreExistingMount.phase !== 'running' || afterPreExistingMount.revision !== preExisting.revision) {
      throw new Error(`expected canonical document mount not to claim or relaunch a pre-existing runtime, got ${JSON.stringify(afterPreExistingMount)}`)
    }
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    root = null
    await waitForUnmountTeardown()
    const afterPreExistingUnmount = readXrNativeControllerDemo()
    if (afterPreExistingUnmount.phase !== 'running' || afterPreExistingUnmount.revision !== preExisting.revision) {
      throw new Error(`expected pre-existing runtime ownership to survive page-runtime unmount, got ${JSON.stringify(afterPreExistingUnmount)}`)
    }

    pauseXrNativeControllerDemo()
    const pausedPreExisting = readXrNativeControllerDemo()
    root = createRoot(container)
    await mountReactRoot(root, runtimeElement(), {
      window: dom.window as unknown as Window,
      frames: 1,
    })
    const afterPausedMount = readXrNativeControllerDemo()
    if (afterPausedMount.phase !== 'paused' || afterPausedMount.revision !== pausedPreExisting.revision) {
      throw new Error(`expected canonical document mount not to claim or relaunch a paused pre-existing runtime, got ${JSON.stringify(afterPausedMount)}`)
    }
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    root = null
    await waitForUnmountTeardown()
    const afterPausedUnmount = readXrNativeControllerDemo()
    if (afterPausedUnmount.phase !== 'paused' || afterPausedUnmount.revision !== pausedPreExisting.revision) {
      throw new Error(`expected paused pre-existing runtime ownership to survive page-runtime unmount, got ${JSON.stringify(afterPausedUnmount)}`)
    }
  } finally {
    if (root) {
      try {
        await unmountReactRoot(root, { window: dom.window as unknown as Window })
        await waitForUnmountTeardown()
      } catch {
        // Preserve an earlier assertion failure.
      }
    }
    exitXrNativeControllerDemo()
    selectXrNativeControllerCameraMode('fixed-follow')
    resetGraphStoreForTests()
    useGraphStore.setState(restoreGraphState)
    restoreDom()
    restoreWindow()
    if (previousDemo === undefined) delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    else process.env[WORKSPACE_RUN_READY_DEMO_ENV] = previousDemo
  }
}

export async function testXrPhysicsRunReadyRuntimeActivatesFromCanonicalSourceDocumentInOrdinaryDev() {
  const previousDemo = process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  const canonicalDocsPath = `/docs/workspace-seeds/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`
  const unrelatedPath = '/docs/workspace-seeds/workspace-readme.md'

  delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  for (const canonicalPath of [canonicalDocsPath]) {
    const resolved = resolveWorkspaceRunReadyDemoIdForDocumentPath(canonicalPath)
    if (resolved !== XR_PHYSICS_RUN_READY_DEMO_ID) {
      throw new Error(`expected canonical Source Files path ${canonicalPath} to resolve the XR physics demo, got ${String(resolved || '')}`)
    }
    if (!isXrPhysicsRunReadyDemoActive(canonicalPath)) {
      throw new Error(`expected ordinary dev to activate XR physics for ${canonicalPath}`)
    }
  }
  for (const unrelatedDocumentPath of [
    unrelatedPath,
    `/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`,
    `/workspace-seeds/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`,
    `/imports/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}`,
    `/docs/workspace-seeds/${XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME}.backup`,
  ]) {
    if (
      resolveWorkspaceRunReadyDemoIdForDocumentPath(unrelatedDocumentPath)
      || isXrPhysicsRunReadyDemoActive(unrelatedDocumentPath)
    ) {
      throw new Error(`expected unrelated or conflicting document path ${unrelatedDocumentPath} not to activate XR physics`)
    }
  }
  const importedSourceText = [
    '---',
    'run_ready_demo:',
    `  id: "${XR_PHYSICS_RUN_READY_DEMO_ID}"`,
    '---',
    '',
    '# Imported XR source',
  ].join('\n')
  const importedPath = '/imports/operator-supplied-source.md'
  if (
    resolveWorkspaceRunReadyDemoIdForDocument(importedPath, importedSourceText) !== XR_PHYSICS_RUN_READY_DEMO_ID
    || !isXrPhysicsRunReadyDemoActive(importedPath, importedSourceText)
  ) {
    throw new Error('expected source-authored run_ready_demo.id to activate independently of its import path')
  }
  const conflictingSourceText = importedSourceText.replace(XR_PHYSICS_RUN_READY_DEMO_ID, 'game-fps')
  if (isXrPhysicsRunReadyDemoActive(canonicalDocsPath, conflictingSourceText)) {
    throw new Error('expected conflicting path and source-authored run-ready identities to fail closed')
  }

  process.env[WORKSPACE_RUN_READY_DEMO_ENV] = CARE_AGENT_RUN_READY_DEMO_ID
  if (isXrPhysicsRunReadyDemoActive(canonicalDocsPath)) {
    throw new Error('expected the explicit care-agent selector to take precedence over the selected XR document')
  }
  process.env[WORKSPACE_RUN_READY_DEMO_ENV] = RISK_COPILOT_RUN_READY_DEMO_ID
  if (isXrPhysicsRunReadyDemoActive(canonicalDocsPath)) {
    throw new Error('expected the explicit risk-copilot selector to take precedence over the selected XR document')
  }
  process.env[WORKSPACE_RUN_READY_DEMO_ENV] = XR_PHYSICS_RUN_READY_DEMO_ID
  if (!isXrPhysicsRunReadyDemoActive(unrelatedPath)) {
    throw new Error('expected the explicit XR selector to retain standalone demo activation independent of the selected document')
  }
  delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]

  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const { dom, restore: restoreDom } = initJsdomHarness(
    '<!doctype html><html><body><section id="root"></section></body></html>',
  )
  const container = dom.window.document.getElementById('root')
  if (!container) throw new Error('missing React root container')

  resetGraphStoreForTests()
  const before = useGraphStore.getState()
  const restoreGraphState = {
    canvasRenderMode: before.canvasRenderMode,
    canvasRenderModeLastFree: before.canvasRenderModeLastFree,
    canvasRenderModeIsAuto: before.canvasRenderModeIsAuto,
    canvas3dMode: before.canvas3dMode,
    floatingPanelOpen: before.floatingPanelOpen,
    bottomSurfaceCollapsed: before.bottomSurfaceCollapsed,
    markdownDocumentName: before.markdownDocumentName,
    markdownDocumentText: before.markdownDocumentText,
    markdownDocumentApplyViewPreset: before.markdownDocumentApplyViewPreset,
  }
  useGraphStore.setState({
    canvasRenderMode: '2d',
    canvasRenderModeLastFree: '2d',
    canvasRenderModeIsAuto: false,
    canvas3dMode: '3d',
    floatingPanelOpen: true,
    bottomSurfaceCollapsed: false,
    markdownDocumentName: unrelatedPath,
    markdownDocumentText: '# Unrelated document',
    markdownDocumentApplyViewPreset: false,
  })
  exitXrNativeControllerDemo()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    root = createRoot(container)
    await mountReactRoot(root, React.createElement(XrPhysicsRunReadyDemoRuntime), {
      window: dom.window as unknown as Window,
      frames: 1,
    })
    if (readXrNativeControllerDemo().phase !== 'off') {
      throw new Error('expected an unrelated applied Source Files document not to start the XR physics runtime')
    }
    const beforeActivation = useGraphStore.getState()
    if (beforeActivation.canvasRenderMode !== '2d' || beforeActivation.floatingPanelOpen !== true) {
      throw new Error('expected ordinary dev editor state to remain unchanged for an unrelated document')
    }

    await act(async () => {
      useGraphStore.getState().setMarkdownDocument(importedPath, importedSourceText, {
        autoEnableFrontmatter: false,
        applyViewPreset: false,
      })
    })
    const running = readXrNativeControllerDemo()
    const activatedGraph = useGraphStore.getState()
    if (running.phase !== 'running' || running.mode !== 'ball') {
      throw new Error(`expected the imported source-authored document to start the native Ball runtime under npm run dev, got ${JSON.stringify(running)}`)
    }
    const runReadyCamera = readCameraFramingRuntime()
    if (
      readXrNativeControllerCamera().mode !== 'fixed-follow'
      || runReadyCamera.claimed
    ) {
      throw new Error(`expected source-authored XR activation to restore fixed-follow native camera control without claiming Camera Framing, got ${JSON.stringify({
        camera: readXrNativeControllerCamera(),
        framing: runReadyCamera,
      })}`)
    }
    if (
      activatedGraph.canvasRenderMode !== '3d'
      || activatedGraph.canvas3dMode !== 'xr'
      || activatedGraph.floatingPanelOpen
      || !activatedGraph.bottomSurfaceCollapsed
    ) {
      throw new Error('expected source-authored document activation to make the existing XR canvas runtime-ready')
    }

    await act(async () => {
      useGraphStore.getState().setMarkdownDocument(unrelatedPath, '# Unrelated document', {
        autoEnableFrontmatter: false,
        applyViewPreset: false,
      })
    })
    if (readXrNativeControllerDemo().phase !== 'off') {
      throw new Error('expected leaving the source-authored XR document to release the native playground runtime')
    }

    process.env[WORKSPACE_RUN_READY_DEMO_ENV] = CARE_AGENT_RUN_READY_DEMO_ID
    await act(async () => {
      useGraphStore.getState().setMarkdownDocument(canonicalDocsPath, '# Canonical XR physics demo', {
        autoEnableFrontmatter: false,
        applyViewPreset: false,
      })
    })
    if (readXrNativeControllerDemo().phase !== 'off') {
      throw new Error('expected an explicit non-XR demo selector to block document-driven XR activation')
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
    resetGraphStoreForTests()
    selectXrNativeControllerCameraMode('fixed-follow')
    useGraphStore.setState(restoreGraphState)
    restoreDom()
    restoreWindow()
    if (previousDemo === undefined) delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    else process.env[WORKSPACE_RUN_READY_DEMO_ENV] = previousDemo
  }
}

export async function testXrPhysicsRunReadyRuntimeReclaimsOffFallbackWithoutDoubleLaunch() {
  const previousDemo = process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  process.env[WORKSPACE_RUN_READY_DEMO_ENV] = XR_PHYSICS_RUN_READY_DEMO_ID
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const { dom, restore: restoreDom } = initJsdomHarness(
    '<!doctype html><html><body><section id="root"></section></body></html>',
  )
  const container = dom.window.document.getElementById('root')
  if (!container) throw new Error('missing React root container')

  resetGraphStoreForTests()
  resetCameraFramingRuntimeForDocument('xr-physics-run-ready-lifecycle-test')
  selectXrNativeControllerCameraMode('free-orbit')
  const before = useGraphStore.getState()
  const restoreGraphState = {
    canvasRenderMode: before.canvasRenderMode,
    canvasRenderModeLastFree: before.canvasRenderModeLastFree,
    canvasRenderModeIsAuto: before.canvasRenderModeIsAuto,
    canvas3dMode: before.canvas3dMode,
    floatingPanelOpen: before.floatingPanelOpen,
    floatingPanelView: before.floatingPanelView,
    bottomSurfaceCollapsed: before.bottomSurfaceCollapsed,
    documentStructureBaselineLock: before.documentStructureBaselineLock,
  }
  let root: ReturnType<typeof createRoot> | null = null
  const runtimeElement = () => React.createElement(
    React.StrictMode,
    null,
    React.createElement(XrPhysicsRunReadyDemoRuntime),
    React.createElement(XrNativeControllerDemoHud),
  )

  try {
    const pristine = readXrNativeControllerDemo()
    if (pristine.phase !== 'off') {
      throw new Error(`expected pristine shared runtime, got ${JSON.stringify(pristine)}`)
    }
    useGraphStore.setState({
      canvasRenderMode: '2d',
      canvasRenderModeLastFree: '2d',
      canvasRenderModeIsAuto: false,
      canvas3dMode: '3d',
      floatingPanelOpen: true,
      bottomSurfaceCollapsed: false,
      documentStructureBaselineLock: false,
    })
    root = createRoot(container)
    await mountReactRoot(root, runtimeElement(), {
      window: dom.window as unknown as Window,
      frames: 1,
    })

    const running = readXrNativeControllerDemo()
    if (running.phase !== 'running' || running.mode !== 'ball' || running.revision !== pristine.revision + 2) {
      throw new Error(`expected exactly one Ball select-and-run launch, got ${JSON.stringify(running)}`)
    }
    const runReadyCamera = readCameraFramingRuntime()
    if (
      readXrNativeControllerCamera().mode !== 'fixed-follow'
      || runReadyCamera.claimed
    ) {
      throw new Error(`expected dedicated run-ready mode to restore native fixed-follow control without claiming Camera Framing, got ${JSON.stringify({
        camera: readXrNativeControllerCamera(),
        framing: runReadyCamera,
      })}`)
    }
    const graph = useGraphStore.getState()
    if (graph.canvasRenderMode !== '3d' || graph.canvas3dMode !== 'xr' || graph.floatingPanelOpen || !graph.bottomSurfaceCollapsed) {
      throw new Error('expected run-ready runtime to activate the canonical XR surface')
    }

    useGraphStore.setState({ floatingPanelOpen: true, floatingPanelView: 'camera', bottomSurfaceCollapsed: false })
    await act(async () => { exitXrNativeControllerDemo() })
    const reclaimed = readXrNativeControllerDemo()
    const configuredPanels = useGraphStore.getState()
    const hud = container.querySelector('[data-kg-xr-playground-hud="1"]')
    if (reclaimed.phase !== 'running' || hud?.getAttribute('data-kg-xr-playground-phase') !== 'running') {
      throw new Error(`expected run-ready mode to reclaim an off fallback before the HUD can overlay the authored XR scene, got ${JSON.stringify(reclaimed)}`)
    }
    if (!configuredPanels.floatingPanelOpen || configuredPanels.floatingPanelView !== 'camera' || configuredPanels.bottomSurfaceCollapsed) {
      throw new Error('expected runtime revisions to preserve the user-configured Camera and Timeline surfaces')
    }
    const reclaimedRevision = reclaimed.revision
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    root = null
    root = createRoot(container)
    await mountReactRoot(root, runtimeElement(), {
      window: dom.window as unknown as Window,
      frames: 1,
    })
    const remounted = readXrNativeControllerDemo()
    if (remounted.phase !== 'running' || remounted.revision !== reclaimedRevision) {
      throw new Error(`expected the reclaimed native stage to survive StrictMode remount without a second launch, got ${JSON.stringify(remounted)}`)
    }
    const remountedPanels = useGraphStore.getState()
    if (!remountedPanels.floatingPanelOpen || remountedPanels.floatingPanelView !== 'camera' || remountedPanels.bottomSurfaceCollapsed) {
      throw new Error('expected a run-ready component remount on an active XR surface to preserve Camera and Timeline choices')
    }
  } finally {
    if (root) {
      try {
        await unmountReactRoot(root, { window: dom.window as unknown as Window })
      } catch {
        // Preserve an earlier assertion failure.
      }
    }
    resetGraphStoreForTests()
    useGraphStore.setState(restoreGraphState)
    restoreDom()
    restoreWindow()
    if (previousDemo === undefined) delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    else process.env[WORKSPACE_RUN_READY_DEMO_ENV] = previousDemo
  }
}
