import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
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
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

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

export async function testCitySimGraphOwningMaterializationCommitsIdentityBeforeCityBuilderPreset() {
  const { restore } = initJsdomHarness()
  const previousStore = useGraphStore.getState()
  const previousExplorerStore = useMarkdownExplorerStore.getState()
  const previousDemoSelector = process.env[WORKSPACE_RUN_READY_DEMO_ENV]
  let unsubscribe = () => {}
  try {
    delete process.env[WORKSPACE_RUN_READY_DEMO_ENV]
    prepareNeutralCitySourceSelection()
    const observedTransitions: string[] = []
    const prematureCityBuilderCommits: string[] = []

    unsubscribe = useGraphStore.subscribe(state => {
      const cityIdentityActive = isCitySimRunReadyDemoActive(
        state.markdownDocumentName,
        state.markdownDocumentText,
      )
      const transition = `${String(state.floatingPanelView)}:${cityIdentityActive ? 'city' : 'neutral'}`
      observedTransitions.push(transition)
      if (state.floatingPanelView === 'cityBuilder' && !cityIdentityActive) {
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
    useGraphStore.setState(previousStore, true)
    useMarkdownExplorerStore.setState(previousExplorerStore, true)
    restore()
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
