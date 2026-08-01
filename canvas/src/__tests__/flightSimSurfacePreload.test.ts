import assert from 'node:assert/strict'
import test from 'node:test'
import type { ComponentType } from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  advanceFlightSimByFixedStep,
  exitFlightSimSurface,
  openFlightSimSurface,
  readFlightSimSnapshot,
  resetFlightSimRuntimeForTests,
  setFlightSimInput,
  startFlightSim,
} from '@/features/game-flight-sim/flightSimRuntime'
import {
  readFlightSimDecisionStore,
  resetFlightSimDecisionStoreForTests,
} from '@/features/game-flight-sim/flightSimDecisionStore'
import {
  setFlightSimMissionStageImporterForTests,
} from '@/lib/three/flightSimMissionStageLoader'
import {
  readXrMotionReferenceRuntime,
  setXrMotionReferenceStage,
} from '@/features/three/xrMotionReferenceRuntime'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import {
  beginWorkspaceSeedSyncTask,
  readWorkspaceSeedSyncRuntimeSnapshot,
  resetWorkspaceSeedSyncRuntimeForTests,
} from '@/lib/workspace/workspaceSeedSyncRuntime'
import {
  completeFlightSimStagePreparation,
  readCurrentFlightSimStagePreparationRequest,
} from '@/features/game-flight-sim/flightSimStagePreparationRuntime'

const EMPTY_WORKSPACE = {
  readFileText: async () => null,
} as unknown as WorkspaceFs
const MissionStage = (() => null) as ComponentType<{
  geospatialComposite?: boolean
}>
const missionStageModule = {
  createFlightSimMissionStage: () => MissionStage,
}

function configurePriorSurface(): void {
  resetFlightSimDecisionStoreForTests()
  resetFlightSimRuntimeForTests()
  useGraphStore.getState().resetAll()
  useGraphStore.setState({
    canvasRenderMode: '2d',
    canvas3dMode: '3d',
    documentStructureBaselineLock: false,
    documentSemanticMode: 'document',
    floatingPanelOpen: false,
    floatingPanelView: 'motionControl',
  } as never)
}

function readSurface() {
  const state = useGraphStore.getState()
  return {
    canvasRenderMode: state.canvasRenderMode,
    canvas3dMode: state.canvas3dMode,
    floatingPanelOpen: state.floatingPanelOpen,
    floatingPanelView: state.floatingPanelView,
  }
}

function resetHarness(): void {
  if (readFlightSimSnapshot().active) exitFlightSimSurface()
  resetFlightSimDecisionStoreForTests()
  resetFlightSimRuntimeForTests()
  useGraphStore.getState().resetAll()
  resetWorkspaceSeedSyncRuntimeForTests()
}

async function waitForSeedSyncRuntime(
  predicate: (snapshot: ReturnType<typeof readWorkspaceSeedSyncRuntimeSnapshot>) => boolean,
): Promise<ReturnType<typeof readWorkspaceSeedSyncRuntimeSnapshot>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = readWorkspaceSeedSyncRuntimeSnapshot()
    if (predicate(snapshot)) return snapshot
    await new Promise<void>(resolve => {
      setTimeout(resolve, 0)
    })
  }
  throw new Error('timed out waiting for workspace seed sync runtime state')
}

test('surface-open preload rejection preserves ownership and a retry succeeds', async () => {
  configurePriorSurface()
  const priorSurface = readSurface()
  let importAttempts = 0
  const restoreImporter = setFlightSimMissionStageImporterForTests(async () => {
    importAttempts += 1
    if (importAttempts === 1) throw new Error('injected stage import rejection')
    return missionStageModule
  })
  try {
    const failed = await openFlightSimSurface({
      openPanel: true,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    assert.equal(failed.active, false)
    assert.match(failed.runtimeError || '', /injected stage import rejection/)
    assert.deepEqual(readSurface(), priorSurface)

    const retried = await openFlightSimSurface({
      openPanel: true,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    assert.equal(retried.active, true)
    assert.equal(retried.runtimeError, null)
    assert.equal(importAttempts, 2)
  } finally {
    restoreImporter()
    resetHarness()
  }
})

test('preload rejection aborts a pending sibling Decision read before a successful retry', async () => {
  configurePriorSurface()
  let rejectFirstRead!: (error: Error) => void
  let markFirstReadStarted!: () => void
  const firstReadStarted = new Promise<void>(resolve => {
    markFirstReadStarted = resolve
  })
  const pendingFirstRead = new Promise<string | null>((_resolve, reject) => {
    rejectFirstRead = reject
  })
  let readCount = 0
  const workspace = {
    readFileText: async () => {
      readCount += 1
      if (readCount !== 1) return null
      markFirstReadStarted()
      return pendingFirstRead
    },
  } as unknown as WorkspaceFs
  let importAttempts = 0
  const restoreImporter = setFlightSimMissionStageImporterForTests(async () => {
    importAttempts += 1
    if (importAttempts === 1) throw new Error('injected sibling preload rejection')
    return missionStageModule
  })
  try {
    const failedOpen = openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace,
    })
    await firstReadStarted
    const failed = await failedOpen
    assert.equal(failed.active, false)
    assert.match(failed.runtimeError || '', /injected sibling preload rejection/)

    const retried = await openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace,
    })
    assert.equal(retried.active, true)
    assert.equal(readFlightSimDecisionStore().hydrationBlocked, false)

    rejectFirstRead(new Error('late stale Decision read rejection'))
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(readFlightSimSnapshot().active, true)
    assert.equal(readFlightSimDecisionStore().hydrationBlocked, false)
  } finally {
    rejectFirstRead(new Error('test cleanup'))
    restoreImporter()
    resetHarness()
  }
})

test('Exit aborts a pending Decision read before a queued fresh open', async () => {
  configurePriorSurface()
  let rejectFirstRead!: (error: Error) => void
  let markFirstReadStarted!: () => void
  const firstReadStarted = new Promise<void>(resolve => {
    markFirstReadStarted = resolve
  })
  const pendingFirstRead = new Promise<string | null>((_resolve, reject) => {
    rejectFirstRead = reject
  })
  let readCount = 0
  const workspace = {
    readFileText: async () => {
      readCount += 1
      if (readCount !== 1) return null
      markFirstReadStarted()
      return pendingFirstRead
    },
  } as unknown as WorkspaceFs
  const restoreImporter = setFlightSimMissionStageImporterForTests(async () => missionStageModule)
  try {
    const staleOpen = openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace,
    })
    await firstReadStarted
    exitFlightSimSurface()
    const freshOpen = openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace,
    })
    rejectFirstRead(new Error('late Decision read failure after Exit'))

    const [stale, fresh] = await Promise.all([staleOpen, freshOpen])
    assert.equal(stale.active, false)
    assert.equal(fresh.active, true)
    assert.equal(readFlightSimDecisionStore().hydrationBlocked, false)
  } finally {
    rejectFirstRead(new Error('test cleanup'))
    restoreImporter()
    resetHarness()
  }
})

test('runtime reset prevents a late stale Decision read from poisoning a concurrent fresh open', async () => {
  configurePriorSurface()
  let rejectFirstRead!: (error: Error) => void
  let markFirstReadStarted!: () => void
  const firstReadStarted = new Promise<void>(resolve => {
    markFirstReadStarted = resolve
  })
  const pendingFirstRead = new Promise<string | null>((_resolve, reject) => {
    rejectFirstRead = reject
  })
  let readCount = 0
  const workspace = {
    readFileText: async () => {
      readCount += 1
      if (readCount !== 1) return null
      markFirstReadStarted()
      return pendingFirstRead
    },
  } as unknown as WorkspaceFs
  const restoreInitialImporter = setFlightSimMissionStageImporterForTests(async () => missionStageModule)
  let restoreFreshImporter = () => undefined
  try {
    const staleOpen = openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace,
    })
    await firstReadStarted
    resetFlightSimRuntimeForTests()
    restoreFreshImporter = setFlightSimMissionStageImporterForTests(async () => missionStageModule)
    const fresh = await openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace,
    })
    assert.equal(fresh.active, true)

    rejectFirstRead(new Error('late Decision read failure after reset'))
    await staleOpen
    assert.equal(readFlightSimSnapshot().active, true)
    assert.equal(readFlightSimDecisionStore().hydrationBlocked, false)
  } finally {
    rejectFirstRead(new Error('test cleanup'))
    restoreFreshImporter()
    restoreInitialImporter()
    resetHarness()
  }
})

test('an abort before preload resolution cannot activate the XR surface', async () => {
  configurePriorSurface()
  const priorSurface = readSurface()
  const controller = new AbortController()
  let signalImportStarted!: () => void
  let releaseImport!: () => void
  const importStarted = new Promise<void>(resolve => {
    signalImportStarted = resolve
  })
  const importAllowed = new Promise<void>(resolve => {
    releaseImport = resolve
  })
  const restoreImporter = setFlightSimMissionStageImporterForTests(async () => {
    signalImportStarted()
    await importAllowed
    return missionStageModule
  })
  try {
    const opening = openFlightSimSurface({
      openPanel: true,
      signal: controller.signal,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    await importStarted
    controller.abort(new Error('injected abort before stage preload'))
    assert.equal(readFlightSimSnapshot().active, false)
    assert.deepEqual(readSurface(), priorSurface)
    releaseImport()

    const aborted = await opening
    assert.equal(aborted.active, false)
    assert.deepEqual(readSurface(), priorSurface)
  } finally {
    releaseImport()
    restoreImporter()
    resetHarness()
  }
})

test('serialized surface opens share one mission-stage import', async () => {
  configurePriorSurface()
  let importAttempts = 0
  let signalImportStarted!: () => void
  let releaseImport!: () => void
  const importStarted = new Promise<void>(resolve => {
    signalImportStarted = resolve
  })
  const importAllowed = new Promise<void>(resolve => {
    releaseImport = resolve
  })
  const restoreImporter = setFlightSimMissionStageImporterForTests(async () => {
    importAttempts += 1
    signalImportStarted()
    await importAllowed
    return missionStageModule
  })
  try {
    const first = openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    await importStarted
    const second = openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    assert.equal(importAttempts, 1)
    releaseImport()

    const [firstOpened, secondOpened] = await Promise.all([first, second])
    assert.equal(firstOpened.active, true)
    assert.equal(secondOpened.active, true)
    assert.equal(importAttempts, 1)
  } finally {
    releaseImport()
    restoreImporter()
    resetHarness()
  }
})

test('active ready and flying surface reopens preserve exact mission state', async () => {
  configurePriorSurface()
  const restoreImporter = setFlightSimMissionStageImporterForTests(
    async () => missionStageModule,
  )
  try {
    await openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    const ready = startFlightSim()
    const reopenedReady = await openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    assert.equal(reopenedReady.phase, ready.phase)
    assert.equal(reopenedReady.runId, ready.runId)
    assert.equal(reopenedReady.tick, ready.tick)

    setFlightSimInput({ pitch: 0.25 })
    const flying = await advanceFlightSimByFixedStep()
    const reopenedFlying = await openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    assert.equal(reopenedFlying.phase, flying.phase)
    assert.equal(reopenedFlying.runId, flying.runId)
    assert.equal(reopenedFlying.tick, flying.tick)
    assert.deepEqual(reopenedFlying.aircraft, flying.aircraft)
  } finally {
    restoreImporter()
    resetHarness()
  }
})

test('active terrain profile changes require a fresh renderer preparation', async () => {
  configurePriorSurface()
  const restoreImporter = setFlightSimMissionStageImporterForTests(
    async () => missionStageModule,
  )
  const previousStageId = readXrMotionReferenceRuntime().plan.stageId
  const previousGlobals = {
    document: globalThis.document,
    window: globalThis.window,
  }
  try {
    await openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    setXrMotionReferenceStage(
      previousStageId === 'singapore' ? 'tropical-playground' : 'singapore',
    )
    Object.assign(globalThis, {
      document: {},
      window: { requestAnimationFrame: () => 1 },
    })

    const reopening = openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    let preparationRequestId: number | null = null
    for (let attempt = 0; attempt < 100; attempt += 1) {
      preparationRequestId = readCurrentFlightSimStagePreparationRequest()
      if (preparationRequestId !== null) break
      await new Promise<void>(resolve => {
        setTimeout(resolve, 0)
      })
    }
    assert.notEqual(preparationRequestId, null)
    assert.equal(
      completeFlightSimStagePreparation(preparationRequestId!),
      true,
    )
    const reopened = await reopening
    assert.equal(reopened.active, true)
    assert.equal(reopened.phase, 'stopped')
  } finally {
    Object.assign(globalThis, previousGlobals)
    setXrMotionReferenceStage(previousStageId)
    restoreImporter()
    resetHarness()
  }
})

test('surface opening drains seed sync and suppresses new polls until Exit', async () => {
  configurePriorSurface()
  resetWorkspaceSeedSyncRuntimeForTests()
  const finishSeedSync = beginWorkspaceSeedSyncTask()
  assert.ok(finishSeedSync)
  const restoreImporter = setFlightSimMissionStageImporterForTests(async () => (
    missionStageModule
  ))
  try {
    const opening = openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    await waitForSeedSyncRuntime(snapshot => snapshot.suspensionCount === 1)
    assert.equal(readFlightSimSnapshot().active, false)
    assert.equal(beginWorkspaceSeedSyncTask(), null)

    finishSeedSync()
    const opened = await opening
    assert.equal(opened.active, true)
    assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
      activeTaskCount: 0,
      suspensionCount: 1,
    })
    assert.equal(beginWorkspaceSeedSyncTask(), null)

    exitFlightSimSurface()
    const finishResumedSeedSync = beginWorkspaceSeedSyncTask()
    assert.ok(finishResumedSeedSync)
    finishResumedSeedSync()
  } finally {
    finishSeedSync()
    restoreImporter()
    resetHarness()
  }
})

test('aborting while seed sync drains cannot activate or retain suspension', async () => {
  configurePriorSurface()
  resetWorkspaceSeedSyncRuntimeForTests()
  const finishSeedSync = beginWorkspaceSeedSyncTask()
  assert.ok(finishSeedSync)
  const controller = new AbortController()
  const restoreImporter = setFlightSimMissionStageImporterForTests(async () => (
    missionStageModule
  ))
  try {
    const opening = openFlightSimSurface({
      openPanel: false,
      signal: controller.signal,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    await waitForSeedSyncRuntime(snapshot => snapshot.suspensionCount === 1)
    controller.abort(new Error('injected abort during seed-sync drain'))
    const aborted = await opening

    assert.equal(aborted.active, false)
    assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
      activeTaskCount: 1,
      suspensionCount: 0,
    })
  } finally {
    finishSeedSync()
    restoreImporter()
    resetHarness()
  }
})

test('Exit invalidates draining and queued opens while a fresh open still succeeds', async () => {
  configurePriorSurface()
  resetWorkspaceSeedSyncRuntimeForTests()
  const finishSeedSync = beginWorkspaceSeedSyncTask()
  assert.ok(finishSeedSync)
  const restoreImporter = setFlightSimMissionStageImporterForTests(async () => (
    missionStageModule
  ))
  try {
    const drainingOpen = openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    await waitForSeedSyncRuntime(snapshot => snapshot.suspensionCount === 1)
    const queuedOpen = openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })

    const exited = exitFlightSimSurface()
    assert.equal(exited.active, false)
    finishSeedSync()
    const [drainingResult, queuedResult] = await Promise.all([
      drainingOpen,
      queuedOpen,
    ])
    assert.equal(drainingResult.active, false)
    assert.equal(queuedResult.active, false)
    assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
      activeTaskCount: 0,
      suspensionCount: 0,
    })

    const fresh = await openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    assert.equal(fresh.active, true)
    assert.equal(fresh.runtimeError, null)
  } finally {
    finishSeedSync()
    restoreImporter()
    resetHarness()
  }
})

test('reset during drain cannot let a stale open clean up a fresh surface', async () => {
  configurePriorSurface()
  resetWorkspaceSeedSyncRuntimeForTests()
  const finishSeedSync = beginWorkspaceSeedSyncTask()
  assert.ok(finishSeedSync)
  const restoreInitialImporter =
    setFlightSimMissionStageImporterForTests(async () => missionStageModule)
  let restoreFreshImporter = () => undefined
  try {
    const staleOpen = openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    await waitForSeedSyncRuntime(snapshot => snapshot.suspensionCount === 1)

    resetFlightSimRuntimeForTests()
    restoreFreshImporter =
      setFlightSimMissionStageImporterForTests(async () => missionStageModule)
    const freshOpen = openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    await waitForSeedSyncRuntime(snapshot => snapshot.suspensionCount === 1)
    finishSeedSync()

    await staleOpen
    const fresh = await freshOpen
    assert.equal(fresh.active, true)
    assert.equal(readFlightSimSnapshot().active, true)
    assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
      activeTaskCount: 0,
      suspensionCount: 1,
    })
  } finally {
    finishSeedSync()
    restoreFreshImporter()
    restoreInitialImporter()
    resetHarness()
  }
})

test('rejected XR activation releases seed-sync suspension after fence cleanup', async () => {
  configurePriorSurface()
  resetWorkspaceSeedSyncRuntimeForTests()
  const state = useGraphStore.getState()
  useGraphStore.setState({
    schema: {
      ...(state.schema || {}),
      layout: { ...(state.schema?.layout || {}), mode: 'radial' },
    },
  } as never)
  const restoreImporter = setFlightSimMissionStageImporterForTests(async () => (
    missionStageModule
  ))
  try {
    const rejected = await openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace: EMPTY_WORKSPACE,
    })
    assert.equal(rejected.active, false)
    assert.match(rejected.runtimeError || '', /shared XR Canvas is unavailable/)
    assert.deepEqual(readWorkspaceSeedSyncRuntimeSnapshot(), {
      activeTaskCount: 0,
      suspensionCount: 0,
    })
  } finally {
    restoreImporter()
    resetHarness()
  }
})
