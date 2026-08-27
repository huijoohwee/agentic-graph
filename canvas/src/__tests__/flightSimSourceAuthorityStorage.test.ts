import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(process.cwd(), '..')

test('Flight surface fencing drains and restores both workspace seed-sync owners', () => {
  const runtime = readFileSync(
    resolve(repoRoot, 'canvas/src/features/game-flight-sim/flightSimRuntime.ts'),
    'utf8',
  )
  const surfaceOpenLifecycle = readFileSync(
    resolve(
      repoRoot,
      'canvas/src/features/game-flight-sim/flightSimSurfaceOpenLifecycle.ts',
    ),
    'utf8',
  )
  const sourceFilesBootstrap = readFileSync(
    resolve(
      repoRoot,
      'canvas/src/features/source-files/SourceFilesPersistenceBootstrap.tsx',
    ),
    'utf8',
  )
  const workspaceExplorer = readFileSync(
    resolve(
      repoRoot,
      'canvas/src/lib/markdown-workspace-runtime/useMarkdownWorkspaceExplorerState.tsx',
    ),
    'utf8',
  )
  const deferredScheduler = readFileSync(resolve(repoRoot, 'canvas/src/lib/workspace/workspaceSeedSyncDeferredScheduler.ts'), 'utf8')
  const storageLifecycle = readFileSync(resolve(repoRoot, 'canvas/src/features/source-files/sourceFilesAgenticGraphStorageLifecycle.ts'), 'utf8')
  const storageLoader = readFileSync(resolve(repoRoot, 'canvas/src/features/source-files/sourceFilesAgenticGraphStorageRuntime.ts'), 'utf8')
  const storageClient = readFileSync(
    resolve(repoRoot, 'canvas/src/lib/storage/agenticgraphStorageClientRuntime.ts'),
    'utf8',
  )
  const inboundStorageApply = readFileSync(resolve(repoRoot, 'canvas/src/features/source-files/sourceFilesInboundStorageApply.ts'), 'utf8')
  assert.match(
    sourceFilesBootstrap,
    /workspaceRematerializeSeedSyncScheduler\.schedule\(request\)/,
  )
  assert.match(
    deferredScheduler,
    /const schedule = \(request:[\s\S]*if \(inFlight\) return/,
  )
  assert.match(
    deferredScheduler,
    /const runScheduledRequest[\s\S]*const request = task\.takePending\(\)[\s\S]*if \(!request\) \{[\s\S]*return/,
  )
  assert.match(
    deferredScheduler,
    /await drainWorkspaceSeedSyncDeferredRequests\([\s\S]*task\.complete\(\)/,
  )
  assert.doesNotMatch(sourceFilesBootstrap, /workspaceMaterializeTimerRef|workspaceMaterializeInFlightRef/)
  assert.match(
    sourceFilesBootstrap,
    /runWorkspaceSeedSyncTask\(signal,[\s\S]*materializeActivePathWithSourceAuthority/,
  )
  assert.match(
    sourceFilesBootstrap,
    /runWorkspaceSeedSyncTask\(controller\.signal,[\s\S]*runBootstrapSourceFileHydration\(\)[\s\S]*materializeBootstrapWorkspaceSourceFiles/,
  )
  assert.match(
    sourceFilesBootstrap,
    /if \(!request\) \{\s*stopAgenticGraphStorageWorkspaceRuntime\(\)\s*return/,
  )
  assert.match(
    sourceFilesBootstrap,
    /createAgenticGraphStorageCurrentOwnershipHandler\([\s\S]*signal: args\.signal,[\s\S]*taskContext: args\.taskContext[\s\S]*await result\.completion/,
  )
  assert.match(
    sourceFilesBootstrap,
    /agenticgraphStorageQueueOperations\.enqueue\(\{ ownership, request \}, async ownedRequest => \{[\s\S]*ownership: capturedOwnership[\s\S]*ensureAgenticGraphStorageRuntimeDependencies\(capturedOwnership\)[\s\S]*runWorkspaceSeedSyncTask\(capturedOwnership\.signal,[\s\S]*deps\.syncSourceFilesToAgenticGraphStorage/,
  )
  assert.match(
    sourceFilesBootstrap,
    /createAgenticGraphStorageLatestOperationRunner<AgenticGraphStorageOwnedQueueRequest>[\s\S]*const ownership = agenticgraphStorageWorkspaceLifecycle\.readOwnership\(\)[\s\S]*agenticgraphStorageQueueOperations\.enqueue\(\{ ownership, request \},[\s\S]*isCurrent\(capturedOwnership\)/,
  )
  assert.match(
    sourceFilesBootstrap,
    /clearAgenticGraphStorageQueueState[\s\S]*agenticgraphStorageQueueOperations\.clearPending\(\)/,
  )
  assert.match(
    storageLifecycle,
    /const next = pending[\s\S]*if \(next\) start\(next\)/,
  )
  assert.match(
    storageLifecycle,
    /if \(active\) \{\s*pending = entry\s*return\s*\}/,
  )
  assert.equal(
    sourceFilesBootstrap.match(/onPulledChangesApplied: createAgenticGraphStoragePulledChangesHandler\(ownership\)/g)?.length,
    2,
  )
  assert.match(storageLifecycle, /lifecycle\.isCurrent\(ownership\) \|\| args\.signal\?\.aborted/)
  assert.match(storageLifecycle, /controller\?\.abort\(reason\)/)
  assert.match(storageLifecycle, /pending = null[\s\S]*pendingSignal = null/)
  assert.match(storageLifecycle, /loadAgenticGraphStorageRuntimeDependencies/)
  assert.match(storageLoader, /runWorkspaceSeedSyncTask\(signal,[\s\S]*Promise\.all\(\[/)
  assert.match(storageClient, /runWorkspaceSeedSyncTask\(args\.signal,[\s\S]*pushAgenticGraphStorageOutbox[\s\S]*pullAgenticGraphStorageChanges/)
  assert.match(inboundStorageApply, /runWorkspaceSeedSyncTask\(signal, operation\)/)
  assert.match(inboundStorageApply, /runWorkspaceSeedSyncTaskWithContext\(taskContext, operation\)/)
  assert.match(inboundStorageApply, /fetch\(requestUrl, \{ signal: args\.signal \}\)/)
  const resumedRefresh = workspaceExplorer.indexOf(
    'return subscribeWorkspaceSeedSyncResumed',
  )
  const resumedActiveCheck = workspaceExplorer.indexOf(
    'if (!runtimeRef.current.active) return',
    resumedRefresh,
  )
  const resumedDeferredClear = workspaceExplorer.indexOf(
    'workspaceRefreshDeferredRef.current = false',
    resumedActiveCheck,
  )
  assert.ok(resumedRefresh >= 0 && resumedActiveCheck > resumedRefresh)
  assert.ok(resumedDeferredClear > resumedActiveCheck)
  assert.match(
    workspaceExplorer,
    /const refreshOnce[\s\S]*const finishSeedSyncTask = beginWorkspaceSeedSyncTask\(\)[\s\S]*workspaceRefreshDeferredRef\.current = true/,
  )
  assert.match(
    workspaceExplorer,
    /if \(!args\.active \|\| !workspaceRefreshDeferredRef\.current\) return[\s\S]*refresh\(\{ silent: true \}\)/,
  )
  const surfaceOpen = runtime.indexOf(
    'async function performFlightSimSurfaceOpen',
  )
  const acquireSyncSuspension = runtime.indexOf(
    'await acquireWorkspaceSeedSyncSuspension(options.signal)',
    surfaceOpen,
  )
  const activateSurface = runtime.indexOf(
    'surfaceActivated = await activateFlightSimSurfacePresentation',
    surfaceOpen,
  )
  const suspendRuntime = runtime.indexOf(
    'suspendAuthoredRuntime()',
    activateSurface,
  )
  assert.ok(surfaceOpen >= 0 && acquireSyncSuspension > surfaceOpen)
  assert.ok(acquireSyncSuspension < activateSurface)
  assert.ok(activateSurface < suspendRuntime)
  assert.doesNotMatch(runtime, /installFlightSimGameplayNetworkFence/)
  const exitSurface = runtime.indexOf('export function exitFlightSimSurface')
  const restorePreviousSurface = runtime.indexOf(
    '...restoreSurfaceOwnership(',
    exitSurface,
  )
  const releaseSyncSuspension = runtime.indexOf(
    'restoreWorkspaceSeedSyncOwnership()',
    restorePreviousSurface,
  )
  assert.ok(exitSurface >= 0 && restorePreviousSurface > exitSurface)
  assert.ok(restorePreviousSurface < releaseSyncSuspension)
  assert.match(
    runtime,
    /invalidateFlightSimSurfaceOpens\(\)[\s\S]*cancelFlightSimHydration\(\)/,
  )
  assert.match(
    runtime,
    /locallyAcquiredSeedSyncRelease =[\s\S]*await acquireWorkspaceSeedSyncSuspension\(options\.signal\)[\s\S]*throwIfFlightSimSurfaceOpenStale\(expectedGeneration\)[\s\S]*releaseFlightSimWorkspaceSeedSyncSuspension =[\s\S]*locallyAcquiredSeedSyncRelease/,
  )
  assert.match(
    runtime,
    /defaultRuntime\.read\(\)\.active \|\| flightSimSurfaceOpenTail/,
  )
  assert.match(
    surfaceOpenLifecycle,
    /openController\.controller\.abort\(new FlightSimSurfaceOpenSettledError\(\)\)/,
  )
})

