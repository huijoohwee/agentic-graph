import { readWebglSupport } from '@/lib/three/webglSupport'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { commitCanvasGeospatialSurfaceOwnership } from '@/features/geospatial/geospatialSurfaceOwnershipRuntime'
import { activateXrSceneSurface, registerXrSceneGameplayExitHandler } from '@/features/three/xrSceneSurfaceRuntime'
import {
  CITY_SIM_FIXED_STEP_MS,
  createDefaultCityGrid,
  freezeCityGrid,
  type CityGrid,
} from './citySimModel'
import { loadCityGridFromWorkspace, saveCityGridToWorkspace } from './citySimPersistence'
import {
  citySimSnapshot as snapshot,
  publishCitySimFailure as publishFailure,
  publishCitySimSnapshot as publish,
  publishCitySimSuccess as publishSuccess,
  readCitySimSnapshot,
  resetCitySimSnapshotForTests,
  subscribeCitySimSnapshot,
  type CitySimSaveStatus,
  type CitySimSnapshot,
  type CitySimSnapshotUpdate,
} from './citySimRuntimeState'
import { createCitySimSynchronousCommands } from './citySimSynchronousCommands'
import {
  captureCitySimPreviousCanvasSurface,
  restoreCitySimPreviousCanvasSurface,
  type CitySimPreviousCanvasSurface,
} from './citySimSurfaceOwnership'

export { readCitySimSnapshot, subscribeCitySimSnapshot }
export type { CitySimOperationResult, CitySimPhase, CitySimSaveStatus, CitySimSnapshot } from './citySimRuntimeState'

type CitySimWorkspaceOptions = Readonly<{ workspace?: WorkspaceFs }>
export type CitySimOpenOptions = CitySimWorkspaceOptions & Readonly<{
  openPanel?: boolean
  previousCanvasSurface?: CitySimPreviousCanvasSurface
  webglSupported?: boolean
}>

let timer: ReturnType<typeof setTimeout> | null = null
let timerGeneration = 0
let asyncGeneration = 0
let persistenceTail: Promise<CitySimSnapshot> = Promise.resolve(snapshot)
let previousCanvasSurface: CitySimPreviousCanvasSurface | null = null
let citySimSurfaceOpenTail: Promise<void> | null = null
let citySimSurfaceRestorationTail: Promise<string | null> = Promise.resolve(null)
let citySimSurfaceRestoring: CitySimPreviousCanvasSurface | null = null
let citySimSurfaceRestorationSuppressed: CitySimPreviousCanvasSurface | null = null
let sessionStartCity = createDefaultCityGrid()
let malformedDocument: Readonly<{ document: string; message: string }> | null = null

function fenceTimer(): void {
  timerGeneration += 1
  if (timer) clearTimeout(timer)
  timer = null
}

const synchronousCommands = createCitySimSynchronousCommands({
  fenceTimer,
  invalidateAsyncOperations: () => {
    asyncGeneration += 1
  },
  readMalformedDocument: () => malformedDocument,
  clearMalformedDocument: () => {
    malformedDocument = null
  },
  readSessionStartCity: () => sessionStartCity,
  replaceSessionStartCity: city => {
    sessionStartCity = city
  },
})

export const {
  stopCitySim,
  advanceCitySimByFixedStep,
  restartCitySim,
  resetCitySim,
  selectCityParcel,
  zoneCityParcel,
  zoneSelectedCityParcel,
  requestCityAdvice,
  applyCityAdvice,
} = synchronousCommands

function scheduleNextTick(generation: number): void {
  timer = setTimeout(() => {
    timer = null
    if (
      generation !== timerGeneration
      || !snapshot.active
      || snapshot.phase !== 'running'
    ) return
    const next = advanceCitySimByFixedStep()
    if (
      next.phase === 'running'
      && generation === timerGeneration
      && next.active
    ) {
      scheduleNextTick(generation)
    }
  }, CITY_SIM_FIXED_STEP_MS)
}

function tickZero(city: CityGrid): CityGrid {
  return city.tick === 0 ? city : freezeCityGrid({ ...city, tick: 0 })
}

function applyLoadedCity(
  city: CityGrid,
  saveStatus: Extract<CitySimSaveStatus, 'loaded' | 'not-loaded'>,
  operation: string,
): CitySimSnapshot {
  fenceTimer()
  malformedDocument = null
  sessionStartCity = tickZero(city)
  return publishSuccess(
    operation,
    saveStatus === 'loaded'
      ? `Loaded the canonical City Document at tick ${city.tick}.`
      : 'No City Document exists; selected the authored Civic Seed.',
    {
      city,
      phase: snapshot.active ? 'stopped' : 'idle',
      selectedParcelId: null,
      advisor: null,
      saveStatus,
    },
  )
}

function enqueuePersistence(
  operation: () => Promise<CitySimSnapshot>,
): Promise<CitySimSnapshot> {
  const result = persistenceTail.catch(() => snapshot).then(operation)
  persistenceTail = result.catch(() => snapshot)
  return result
}

function beginCitySimSurfaceRestoration(
  previous: CitySimPreviousCanvasSurface,
): Promise<string | null> {
  if (citySimSurfaceRestoring === previous) {
    return citySimSurfaceRestorationTail
  }
  citySimSurfaceRestoring = previous
  citySimSurfaceRestorationSuppressed = null
  citySimSurfaceRestorationTail = restoreCitySimPreviousCanvasSurface(previous)
  return citySimSurfaceRestorationTail
}

async function failSurfaceEntry(
  previous: CitySimPreviousCanvasSurface,
  code: string,
  message: string,
  update: CitySimSnapshotUpdate = {},
): Promise<CitySimSnapshot> {
  fenceTimer()
  previousCanvasSurface = null
  const restorationFailure = await beginCitySimSurfaceRestoration(previous)
  return publishFailure(
    'open',
    restorationFailure ? 'surface-restoration-failed' : code,
    restorationFailure
      ? `${message} Surface restoration failed: ${restorationFailure}`
      : message,
    {
      ...update,
      active: false,
      phase: 'error',
    },
  )
}

async function claimCityExclusiveXrSurface(): Promise<void> {
  await commitCanvasGeospatialSurfaceOwnership(false)
}

async function restoreSupersededCitySurface(
  previous: CitySimPreviousCanvasSurface,
): Promise<CitySimSnapshot> {
  // A newer City entry can already own the Canvas. Restoring Geo under that
  // entry would recreate the competing MapLibre owner, so only a genuinely
  // inactive City session rolls the captured owner back.
  if (
    snapshot.active
    || citySimSurfaceRestorationSuppressed === previous
  ) return snapshot
  previousCanvasSurface = null
  const restorationFailure = await beginCitySimSurfaceRestoration(previous)
  if (restorationFailure) {
    return publishFailure(
      'open',
      'surface-restoration-failed',
      `Superseded City surface restoration did not complete: ${restorationFailure}`,
      { active: false, phase: 'error' },
    )
  }
  return snapshot
}

async function performOpenCitySimSurface(
  options: CitySimOpenOptions = {},
): Promise<CitySimSnapshot> {
  const priorRestoration = citySimSurfaceRestorationTail
  const restorationFailure = await priorRestoration
  if (priorRestoration !== citySimSurfaceRestorationTail) return snapshot
  if (restorationFailure) {
    return publishFailure(
      'open',
      'surface-restoration-failed',
      `City Simulation cannot enter until the prior surface restores: ${restorationFailure}`,
      { active: false, phase: 'error' },
    )
  }
  citySimSurfaceRestoring = null
  const generation = asyncGeneration + 1
  asyncGeneration = generation
  const previous = previousCanvasSurface
    ?? options.previousCanvasSurface
    ?? captureCitySimPreviousCanvasSurface()
  const webglSupported = options.webglSupported ?? readWebglSupport()
  if (!webglSupported) {
    return failSurfaceEntry(
      previous,
      'webgl-unavailable',
      'City Simulation requires the existing shared WebGL Canvas.',
      { webglSupported },
    )
  }
  if (snapshot.active) {
    try {
      await claimCityExclusiveXrSurface()
      if (generation !== asyncGeneration || !snapshot.active) {
        return restoreSupersededCitySurface(previous)
      }
    } catch (error) {
      if (generation !== asyncGeneration) {
        return restoreSupersededCitySurface(previous)
      }
      return failSurfaceEntry(
        previous,
        'geo-surface-unavailable',
        `City Builder could not claim the exclusive XR Canvas: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
    const activated = activateXrSceneSurface({
      gameplaySurface: 'cityBuilder',
      ...(options.openPanel === false
        ? {}
        : { panelView: 'cityBuilder' as const, openPanel: true }),
    })
    return activated
      ? publishSuccess('open', 'City Builder is open on the active city session.')
      : publishFailure(
          'open',
          'surface-unavailable',
          'City Builder could not claim the shared XR Canvas.',
        )
  }

  publish({
    webglSupported,
    saveStatus: 'loading',
    error: null,
    message: 'Reading the browser-local City Document before entry…',
  })
  let loaded: Awaited<ReturnType<typeof loadCityGridFromWorkspace>>
  try {
    loaded = await loadCityGridFromWorkspace(options)
  } catch (error) {
    if (generation !== asyncGeneration) return snapshot
    return failSurfaceEntry(
      previous,
      'document-read-failed',
      error instanceof Error ? error.message : String(error),
      { saveStatus: 'error' },
    )
  }
  if (generation !== asyncGeneration) return snapshot
  if (loaded.status === 'malformed') {
    malformedDocument = Object.freeze({
      document: loaded.document,
      message: loaded.error.message,
    })
    return failSurfaceEntry(
      previous,
      'malformed-document',
      `City Document is malformed and was preserved: ${loaded.error.message}`,
      { saveStatus: 'malformed' },
    )
  }

  const city = loaded.status === 'loaded' ? loaded.city : createDefaultCityGrid()
  try {
    await claimCityExclusiveXrSurface()
    if (generation !== asyncGeneration) {
      return restoreSupersededCitySurface(previous)
    }
    const activated = activateXrSceneSurface({
      gameplaySurface: 'cityBuilder',
      ...(options.openPanel === false
        ? {}
        : { panelView: 'cityBuilder' as const, openPanel: true }),
      beforePanelCommit: () => {
        if (generation !== asyncGeneration) {
          throw new Error('City surface entry was superseded.')
        }
      },
    })
    if (!activated) {
      return failSurfaceEntry(
        previous,
        'surface-unavailable',
        'City Simulation could not claim the shared XR Canvas.',
        { saveStatus: loaded.status === 'loaded' ? 'loaded' : 'not-loaded' },
      )
    }
    previousCanvasSurface = previous
    malformedDocument = null
    sessionStartCity = tickZero(city)
    return publishSuccess(
      'open',
      loaded.status === 'loaded'
        ? `City Simulation opened from the canonical City Document at tick ${city.tick}.`
        : 'City Simulation opened with the authored Civic Seed.',
      {
        active: true,
        webglSupported,
        phase: 'stopped',
        city,
        selectedParcelId: null,
        advisor: null,
        saveStatus: loaded.status === 'loaded' ? 'loaded' : 'not-loaded',
      },
    )
  } catch (error) {
    if (generation !== asyncGeneration) {
      return restoreSupersededCitySurface(previous)
    }
    return failSurfaceEntry(
      previous,
      'surface-entry-failed',
      `City surface entry failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

export function openCitySimSurface(
  options: CitySimOpenOptions = {},
): Promise<CitySimSnapshot> {
  const opening = performOpenCitySimSurface(options)
  const tail = opening.then(() => undefined, () => undefined)
  citySimSurfaceOpenTail = tail
  void tail.then(() => {
    if (citySimSurfaceOpenTail === tail) citySimSurfaceOpenTail = null
  })
  return opening
}

export async function startCitySim(
  options: CitySimOpenOptions = {},
): Promise<CitySimSnapshot> {
  if (malformedDocument) {
    return publishFailure(
      'start',
      'malformed-document',
      `Start is blocked because the City Document is malformed: ${malformedDocument.message}`,
      { phase: 'error', saveStatus: 'malformed' },
    )
  }
  if (!snapshot.active) {
    const opened = await openCitySimSurface(options)
    if (!opened.active || opened.phase === 'error') {
      return publishFailure(
        'start',
        opened.lastResult?.code || 'open-failed',
        `City Simulation could not start: ${opened.message}`,
      )
    }
  }
  if (snapshot.phase === 'error') {
    return publishFailure(
      'start',
      snapshot.lastResult?.code || 'runtime-error',
      `City Simulation could not start: ${snapshot.message}`,
    )
  }
  if (snapshot.phase === 'running') {
    return publishSuccess(
      'start',
      `City Simulation is already running at tick ${snapshot.city.tick}.`,
    )
  }
  fenceTimer()
  const running = publishSuccess(
    'start',
    `City Simulation is running one deterministic tick every ${CITY_SIM_FIXED_STEP_MS} ms.`,
    { phase: 'running' },
  )
  scheduleNextTick(timerGeneration)
  return running
}

export function saveCitySim(
  options: CitySimWorkspaceOptions = {},
): Promise<CitySimSnapshot> {
  if (malformedDocument) {
    return Promise.resolve(publishFailure(
      'save',
      'malformed-document',
      'Save is blocked until Reset explicitly selects the authored seed in memory.',
      { phase: 'error', saveStatus: 'malformed' },
    ))
  }
  const cityToSave = snapshot.city
  publish({ saveStatus: 'saving', message: `Saving committed city tick ${cityToSave.tick}…`, error: null })
  return enqueuePersistence(async () => {
    try {
      await saveCityGridToWorkspace(cityToSave, options)
      if (snapshot.city !== cityToSave) {
        return publishFailure(
          'save',
          'stale-save',
          `Saved tick ${cityToSave.tick}, but the current city changed during persistence; save again to commit the current snapshot.`,
          { saveStatus: 'dirty' },
        )
      }
      return publishSuccess(
        'save',
        `Saved and read back the canonical City Document for tick ${cityToSave.tick}.`,
        { saveStatus: 'saved' },
      )
    } catch (error) {
      return publishFailure(
        'save',
        'save-failed',
        error instanceof Error ? error.message : String(error),
        { saveStatus: 'error' },
      )
    }
  })
}

export function loadCitySim(
  options: CitySimWorkspaceOptions = {},
): Promise<CitySimSnapshot> {
  const generation = asyncGeneration + 1
  asyncGeneration = generation
  fenceTimer()
  publish({ saveStatus: 'loading', message: 'Reading the canonical City Document…', error: null })
  return enqueuePersistence(async () => {
    if (generation !== asyncGeneration) return snapshot
    try {
      const loaded = await loadCityGridFromWorkspace(options)
      if (generation !== asyncGeneration) return snapshot
      if (loaded.status === 'malformed') {
        malformedDocument = Object.freeze({
          document: loaded.document,
          message: loaded.error.message,
        })
        return publishFailure(
          'load',
          'malformed-document',
          `City Document is malformed and was preserved: ${loaded.error.message}`,
          { phase: 'error', saveStatus: 'malformed' },
        )
      }
      return applyLoadedCity(
        loaded.status === 'loaded' ? loaded.city : createDefaultCityGrid(),
        loaded.status === 'loaded' ? 'loaded' : 'not-loaded',
        'load',
      )
    } catch (error) {
      if (generation !== asyncGeneration) return snapshot
      return publishFailure(
        'load',
        'document-read-failed',
        error instanceof Error ? error.message : String(error),
        { phase: 'error', saveStatus: 'error' },
      )
    }
  })
}

export function exitCitySimSurface(
  options: Readonly<{ restorePreviousSurface?: boolean }> = {},
): CitySimSnapshot {
  asyncGeneration += 1
  fenceTimer()
  const previous = previousCanvasSurface
  previousCanvasSurface = null
  const next = publishSuccess(
    'exit',
    'City Simulation exited; its committed in-memory city remains inspectable.',
    {
      active: false,
      phase: 'idle',
      selectedParcelId: null,
      advisor: null,
    },
  )
  if (options.restorePreviousSurface !== false && previous) {
    beginCitySimSurfaceRestoration(previous)
  } else if (options.restorePreviousSurface === false) {
    citySimSurfaceRestorationSuppressed = previous
    citySimSurfaceRestoring = null
    citySimSurfaceRestorationTail = Promise.resolve(null)
  }
  return next
}

export async function waitForCitySimSurfaceRestoration(): Promise<CitySimSnapshot> {
  while (true) {
    const opening = citySimSurfaceOpenTail
    if (opening) await opening
    const restoration = citySimSurfaceRestorationTail
    const restorationFailure = await restoration
    if (
      opening !== citySimSurfaceOpenTail
      || restoration !== citySimSurfaceRestorationTail
    ) continue
    if (!restorationFailure) return snapshot
    return publishFailure(
      'exit',
      'surface-restoration-failed',
      `City Simulation surface restoration did not complete: ${restorationFailure}`,
      { active: false, phase: 'error' },
    )
  }
}

registerXrSceneGameplayExitHandler('cityBuilder', () => {
  if (snapshot.active) exitCitySimSurface({ restorePreviousSurface: false })
}, {
  preserveWhenPanelOnly: [
    'media',
    'animation',
    'motionControl',
    'gameMode',
    'flightSim',
    'camera',
  ],
})

export function resetCitySimRuntimeForTests(
  options: Readonly<{ webglSupported?: boolean }> = {},
): CitySimSnapshot {
  asyncGeneration += 1
  fenceTimer()
  previousCanvasSurface = null
  citySimSurfaceOpenTail = null
  citySimSurfaceRestorationTail = Promise.resolve(null)
  citySimSurfaceRestoring = null
  citySimSurfaceRestorationSuppressed = null
  malformedDocument = null
  sessionStartCity = createDefaultCityGrid()
  const reset = resetCitySimSnapshotForTests(
    sessionStartCity,
    options.webglSupported ?? readWebglSupport(),
  )
  persistenceTail = Promise.resolve(reset)
  return reset
}
