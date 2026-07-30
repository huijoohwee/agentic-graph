import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { CitySimRunReadyDemoRuntime } from '@/features/canvas/CitySimRunReadyDemoRuntime'
import {
  exitCitySimSurface,
  readCitySimSnapshot,
  resetCitySimRuntimeForTests,
} from '@/features/game-city-sim/citySimRuntime'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import {
  beginSourceFilesDocumentIntent,
  clearSourceFilesDocumentIntent,
  completeSourceFilesBootstrap,
  completeSourceFilesDocumentIntent,
  readSourceFilesBootstrapSnapshot,
  useSourceFilesBootstrapHasReachedReady,
} from '@/features/source-files/sourceFilesBootstrapReadiness'
import { materializeActiveWorkspaceEntryIntoSourceFiles } from '@/features/source-files/sourceFilesRuntimeShared'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import {
  CITY_SIM_DEMO_REPO_REL_PATH,
  CITY_SIM_DEMO_WORKSPACE_SEED_BASENAME,
  WORKSPACE_RUN_READY_DEMO_ENV,
  isCitySimRunReadyDemoActive,
} from '@/features/workspace-fs/workspaceRunReadyDemos'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  readGeospatialOverlayEnabledPreference,
  writeGeospatialOverlayEnabledPreference,
} from '@/lib/geospatial/geospatialModePreference'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import {
  mountReactRoot,
  unmountReactRoot,
  waitForTasks,
} from '@/tests/lib/reactRootHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import {
  isGeospatialModeEnabled,
  setGeospatialModeEnabled,
} from 'gympgrph'

const CITY_SEED_PATH = `/${CITY_SIM_DEMO_REPO_REL_PATH}`
const NEUTRAL_PATH = '/docs/workspace-seeds/workspace-readme.md'

function createCityWorkspaceFixture() {
  const seedText = readFileSync(
    resolve(process.cwd(), '..', CITY_SIM_DEMO_REPO_REL_PATH),
    'utf8',
  )
  const initialEntries: WorkspaceEntry[] = [
    { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
    { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
    {
      path: '/docs/workspace-seeds',
      parentPath: '/docs',
      kind: 'folder',
      name: 'workspace-seeds',
      updatedAtMs: 1,
    },
    {
      path: CITY_SEED_PATH,
      parentPath: '/docs/workspace-seeds',
      kind: 'file',
      name: CITY_SIM_DEMO_WORKSPACE_SEED_BASENAME,
      text: seedText,
      updatedAtMs: 1,
    },
  ]
  return {
    workspace: createMemoryWorkspaceFs({ initialEntries }),
  }
}

function prepareNeutralCitySourceSelection(): void {
  useGraphStore.getState().resetAll()
  useGraphStore.setState({
    canvasRenderMode: '3d',
    canvas3dMode: 'xr',
    floatingPanelOpen: true,
    floatingPanelView: 'motionControl',
    markdownDocumentName: NEUTRAL_PATH,
    markdownDocumentText: '# Neutral workspace',
  } as never)
  useMarkdownExplorerStore.getState().setActivePath(CITY_SEED_PATH as never)
}

async function materializeCityFixture(): Promise<void> {
  const { workspace } = createCityWorkspaceFixture()
  const workspaceEntries = await workspace.listEntries()
  await materializeActiveWorkspaceEntryIntoSourceFiles({
    activePathOverride: CITY_SEED_PATH as never,
    fs: workspace,
    workspaceEntries,
    activeWorkspaceEntriesSnapshot: workspaceEntries,
    sourcesByPath: {},
    applyToGraph: true,
  })
}

function CitySimStickyRunReadyHost() {
  const hasReachedReady = useSourceFilesBootstrapHasReachedReady()
  return hasReachedReady
    ? React.createElement(CitySimRunReadyDemoRuntime)
    : null
}

async function waitForCitySimLaunch(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const city = readCitySimSnapshot()
    if (city.active || city.phase === 'error') return
    await new Promise<void>(resolveWait => {
      setTimeout(resolveWait, 20)
    })
  }
}

export async function testCitySimGraphOwningMaterializationCommitsIdentityBeforeCityBuilderPreset() {
  const { restore } = initJsdomHarness()
  const previousStore = useGraphStore.getState()
  const previousExplorerStore = useMarkdownExplorerStore.getState()
  const previousDemoSelector = process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  const previousGeospatialEnabled = readGeospatialOverlayEnabledPreference()
  let unsubscribe = () => {}
  try {
    delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    prepareNeutralCitySourceSelection()
    writeGeospatialOverlayEnabledPreference(false)
    setGeospatialModeEnabled(false)
    const observedTransitions: string[] = []
    const prematureCityBuilderCommits: string[] = []

    unsubscribe = useGraphStore.subscribe(state => {
      const cityIdentityActive = isCitySimRunReadyDemoActive(
        state.markdownDocumentName,
        state.markdownDocumentText,
      )
      const transition = `${String(state.floatingPanelView)}:${cityIdentityActive ? 'city' : 'neutral'}`
      observedTransitions.push(transition)
      if (
        state.floatingPanelView === 'cityBuilder'
        && (!cityIdentityActive || !isGeospatialModeEnabled())
      ) {
        prematureCityBuilderCommits.push(transition)
      }
    })

    await materializeCityFixture()

    const finalState = useGraphStore.getState()
    assert.equal(
      prematureCityBuilderCommits.length,
      0,
      `City Builder committed before City identity; transitions=${observedTransitions.join(',')}`,
    )
    assert.equal(
      isCitySimRunReadyDemoActive(finalState.markdownDocumentName, finalState.markdownDocumentText),
      true,
      'expected the authored City identity to be active after materialization',
    )
    assert.equal(isGeospatialModeEnabled(), true)
    assert.equal(readGeospatialOverlayEnabledPreference(), true)
    assert.equal(finalState.canvasRenderMode, '3d')
    assert.equal(finalState.canvas3dMode, 'xr')
    assert.equal(finalState.floatingPanelView, 'cityBuilder')
    assert.ok(
      observedTransitions.includes('cityBuilder:city'),
      `expected an identity-backed City Builder commit; transitions=${observedTransitions.join(',')}`,
    )
  } finally {
    unsubscribe()
    if (typeof previousDemoSelector === 'string') {
      process.env[WORKSPACE_RUN_READY_DEMO_ENV] = previousDemoSelector
    } else {
      delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    }
    writeGeospatialOverlayEnabledPreference(previousGeospatialEnabled)
    setGeospatialModeEnabled(previousGeospatialEnabled)
    useGraphStore.setState(previousStore, true)
    useMarkdownExplorerStore.setState(previousExplorerStore, true)
    restore()
  }
}

export async function testCitySimLaterSourceIntentRetainsMountedPreviousSurfaceOnExit() {
  const intentKey = 'test:city-sim-later-source-intent'
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const { dom, restore: restoreDom } = initJsdomHarness(
    '<!doctype html><html><body><section id="root"></section></body></html>',
  )
  const container = dom.window.document.getElementById('root')
  if (!container) throw new Error('missing City lifecycle test root')
  dom.window.HTMLCanvasElement.prototype.getContext = (() => ({
    isContextLost: () => false,
    getExtension: () => ({ loseContext: () => undefined }),
  })) as typeof dom.window.HTMLCanvasElement.prototype.getContext

  const previousStore = useGraphStore.getState()
  const previousExplorerStore = useMarkdownExplorerStore.getState()
  const previousDemoSelector = process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  let root: ReturnType<typeof createRoot> | null = null
  try {
    delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    prepareNeutralCitySourceSelection()
    resetCitySimRuntimeForTests({ webglSupported: true })
    completeSourceFilesBootstrap()
    assert.equal(
      readSourceFilesBootstrapSnapshot().hasReachedReady,
      true,
      'expected initial Source Files authority to admit the run-ready lifecycle host',
    )

    root = createRoot(container)
    await mountReactRoot(root, React.createElement(CitySimStickyRunReadyHost), {
      window: dom.window as unknown as Window,
      frames: 1,
      tasks: 1,
    })

    await act(async () => {
      beginSourceFilesDocumentIntent(intentKey)
    })
    const resolving = readSourceFilesBootstrapSnapshot()
    assert.equal(resolving.phase, 'resolving')
    assert.equal(
      resolving.hasReachedReady,
      true,
      'a later Source Files intent must retain the mounted City lifecycle owner',
    )

    await act(async () => {
      await materializeCityFixture()
      completeSourceFilesDocumentIntent(intentKey)
    })
    await act(async () => {
      await waitForCitySimLaunch()
    })

    const launched = readCitySimSnapshot()
    assert.equal(launched.active, true, launched.message)
    assert.equal(launched.phase, 'stopped')
    assert.equal(useGraphStore.getState().floatingPanelView, 'cityBuilder')

    await act(async () => {
      exitCitySimSurface()
      await waitForTasks(2)
    })
    const restored = useGraphStore.getState()
    assert.equal(readCitySimSnapshot().active, false, 'Exit must not relaunch the selected City document')
    assert.equal(restored.canvasRenderMode, '3d')
    assert.equal(restored.canvas3dMode, 'xr')
    assert.equal(restored.floatingPanelOpen, true)
    assert.equal(restored.floatingPanelView, 'motionControl')
    assert.equal(restored.markdownDocumentName, CITY_SIM_DEMO_REPO_REL_PATH)
    assert.equal(
      isCitySimRunReadyDemoActive(restored.markdownDocumentName, restored.markdownDocumentText),
      true,
      'Exit must restore the prior panel without replacing the selected City source',
    )
  } finally {
    exitCitySimSurface({ restorePreviousSurface: false })
    resetCitySimRuntimeForTests({ webglSupported: true })
    if (root) {
      await unmountReactRoot(root, {
        window: dom.window as unknown as Window,
        tasks: 1,
      }).catch(() => undefined)
    }
    clearSourceFilesDocumentIntent(intentKey)
    if (typeof previousDemoSelector === 'string') {
      process.env[WORKSPACE_RUN_READY_DEMO_ENV] = previousDemoSelector
    } else {
      delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    }
    useGraphStore.setState(previousStore, true)
    useMarkdownExplorerStore.setState(previousExplorerStore, true)
    restoreDom()
    restoreWindow()
  }
}

export async function testCitySimGraphOwningMaterializationFencesDelayedPathDrift() {
  const { restore } = initJsdomHarness()
  const previousStore = useGraphStore.getState()
  const previousExplorerStore = useMarkdownExplorerStore.getState()
  let releaseIdentityApply = () => {}
  let pendingMaterialization: Promise<void> | null = null
  let unsubscribe = () => {}
  try {
    prepareNeutralCitySourceSelection()
    const originalSetActiveMarkdownDocument = useGraphStore.getState().setActiveMarkdownDocument
    let markIdentityApplyStarted = () => {}
    const identityApplyStarted = new Promise<void>(resolveStarted => {
      markIdentityApplyStarted = resolveStarted
    })
    const identityApplyGate = new Promise<void>(resolveGate => {
      releaseIdentityApply = resolveGate
    })
    useGraphStore.setState({
      setActiveMarkdownDocument: async args => {
        const result = await originalSetActiveMarkdownDocument(args)
        markIdentityApplyStarted()
        await identityApplyGate
        return result
      },
    })
    let pathDrifted = false
    let staleCityBuilderCommits = 0
    unsubscribe = useGraphStore.subscribe((state, previousState) => {
      if (
        pathDrifted
        && state.floatingPanelView === 'cityBuilder'
        && previousState.floatingPanelView !== 'cityBuilder'
      ) {
        staleCityBuilderCommits += 1
      }
    })

    pendingMaterialization = materializeCityFixture()
    await identityApplyStarted
    useMarkdownExplorerStore.getState().setActivePath(NEUTRAL_PATH as never)
    pathDrifted = true
    useGraphStore.getState().setFloatingPanelView('motionControl')
    releaseIdentityApply()
    await pendingMaterialization

    assert.equal(staleCityBuilderCommits, 0)
    assert.equal(useGraphStore.getState().floatingPanelView, 'motionControl')
  } finally {
    releaseIdentityApply()
    await pendingMaterialization?.catch(() => undefined)
    unsubscribe()
    useGraphStore.setState(previousStore, true)
    useMarkdownExplorerStore.setState(previousExplorerStore, true)
    restore()
  }
}

export async function testCitySimGraphOwningMaterializationUsesFreshSourceFilesAfterIdentityAwait() {
  const { restore } = initJsdomHarness()
  const previousStore = useGraphStore.getState()
  const previousExplorerStore = useMarkdownExplorerStore.getState()
  let releaseIdentityApply = () => {}
  let pendingMaterialization: Promise<void> | null = null
  try {
    prepareNeutralCitySourceSelection()
    const originalSetActiveMarkdownDocument = useGraphStore.getState().setActiveMarkdownDocument
    let markIdentityApplyStarted = () => {}
    const identityApplyStarted = new Promise<void>(resolveStarted => {
      markIdentityApplyStarted = resolveStarted
    })
    const identityApplyGate = new Promise<void>(resolveGate => {
      releaseIdentityApply = resolveGate
    })
    useGraphStore.setState({
      setActiveMarkdownDocument: async args => {
        const result = await originalSetActiveMarkdownDocument(args)
        markIdentityApplyStarted()
        await identityApplyGate
        return result
      },
    })

    pendingMaterialization = materializeCityFixture()
    await identityApplyStarted
    useGraphStore.setState({
      sourceFiles: [
        ...useGraphStore.getState().sourceFiles,
        {
          id: 'newer-source-during-city-identity',
          name: 'newer.md',
          text: '# Newer source',
          enabled: false,
          status: 'idle',
          source: { kind: 'local', path: 'workspace:/notes/newer.md' },
        },
      ],
    })
    releaseIdentityApply()
    await pendingMaterialization

    assert.ok(
      useGraphStore.getState().sourceFiles.some(file => file.id === 'newer-source-during-city-identity'),
      'expected the post-identity import to preserve the latest Source Files snapshot',
    )
  } finally {
    releaseIdentityApply()
    await pendingMaterialization?.catch(() => undefined)
    useGraphStore.setState(previousStore, true)
    useMarkdownExplorerStore.setState(previousExplorerStore, true)
    restore()
  }
}
