import { readWebglSupport } from '@/lib/three/webglSupport'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { activateXrSceneSurface, registerXrSceneGameplayExitHandler } from '@/features/three/xrSceneSurfaceRuntime'
import { adviseCityZoning } from './citySimAdvisor'
import { advanceCityTick } from './citySimEconomy'
import {
  CITY_SIM_FIXED_STEP_MS,
  createDefaultCityGrid,
  findCityParcel,
  freezeCityGrid,
  zoneCityGridParcel,
  type CityAdviceScope,
  type CityAdvisorProposal,
  type CityGrid,
  type CityZoningType,
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
let sessionStartCity = createDefaultCityGrid()
let malformedDocument: Readonly<{ document: string; message: string }> | null = null

function fenceTimer(): void {
  timerGeneration += 1
  if (timer) clearTimeout(timer)
  timer = null
}

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

function failSurfaceEntry(
  previous: CitySimPreviousCanvasSurface,
  code: string,
  message: string,
  update: CitySimSnapshotUpdate = {},
): CitySimSnapshot {
  fenceTimer()
  previousCanvasSurface = null
  restoreCitySimPreviousCanvasSurface(previous)
  return publishFailure('open', code, message, {
    ...update,
    active: false,
    phase: 'error',
  })
}

export async function openCitySimSurface(
  options: CitySimOpenOptions = {},
): Promise<CitySimSnapshot> {
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

  const generation = asyncGeneration + 1
  asyncGeneration = generation
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
    return failSurfaceEntry(
      previous,
      'surface-entry-failed',
      `City surface entry failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
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

export function stopCitySim(): CitySimSnapshot {
  fenceTimer()
  if (malformedDocument) {
    return publishFailure(
      'stop',
      'malformed-document',
      `City Simulation remains blocked by malformed document bytes: ${malformedDocument.message}`,
      { phase: 'error', saveStatus: 'malformed' },
    )
  }
  return publishSuccess(
    'stop',
    `City Simulation stopped at tick ${snapshot.city.tick}; queued ticks were fenced.`,
    { phase: snapshot.active ? 'stopped' : 'idle' },
  )
}

export function advanceCitySimByFixedStep(): CitySimSnapshot {
  if (!snapshot.active || snapshot.phase !== 'running') return snapshot
  const result = advanceCityTick(snapshot.city)
  if (result.ok === false) {
    fenceTimer()
    return publishFailure(
      'tick',
      result.error.code,
      result.error.message,
      { phase: 'error', costLog: result.costLog },
    )
  }
  return publishSuccess(
    'tick',
    `Committed deterministic city tick ${result.city.tick}.`,
    { city: result.city, advisor: null, costLog: result.costLog, saveStatus: 'dirty' },
  )
}

export function restartCitySim(): CitySimSnapshot {
  fenceTimer()
  if (malformedDocument) {
    return publishFailure(
      'restart',
      'malformed-document',
      `Restart is blocked because the City Document is malformed: ${malformedDocument.message}`,
      { phase: 'error', saveStatus: 'malformed' },
    )
  }
  if (!snapshot.active) {
    return publishFailure(
      'restart',
      'inactive',
      'Restart requires an active City Simulation session.',
    )
  }
  const cityChanged = snapshot.city !== sessionStartCity
  return publishSuccess(
    'restart',
    'City Simulation restored its session start snapshot at tick 0.',
    {
      city: sessionStartCity,
      phase: 'stopped',
      selectedParcelId: null,
      advisor: null,
      costLog: null,
      ...(cityChanged ? { saveStatus: 'dirty' as const } : {}),
    },
  )
}

export function resetCitySim(): CitySimSnapshot {
  asyncGeneration += 1
  fenceTimer()
  malformedDocument = null
  sessionStartCity = createDefaultCityGrid()
  return publishSuccess(
    'reset',
    'Selected the authored Civic Seed in memory; the City Document was not changed.',
    {
      city: sessionStartCity,
      phase: snapshot.active ? 'stopped' : 'idle',
      selectedParcelId: null,
      advisor: null,
      costLog: null,
      saveStatus: 'not-loaded',
    },
  )
}

export function selectCityParcel(parcelId: string): CitySimSnapshot {
  const parcel = findCityParcel(snapshot.city, parcelId)
  if (!parcel) {
    return publishFailure(
      'select',
      'unknown-parcel',
      `Parcel ${parcelId || '(empty)'} does not exist; selection was unchanged.`,
    )
  }
  return publishSuccess(
    'select',
    `Selected ${parcel.id}: ${parcel.zone}, ${parcel.landValueCents} cents, population ${parcel.population}, pollution ${parcel.pollution}.`,
    { selectedParcelId: parcel.id },
  )
}

export function zoneCityParcel(
  parcelId: string,
  zoningType: CityZoningType,
): CitySimSnapshot {
  const previousCity = snapshot.city
  const result = zoneCityGridParcel(previousCity, parcelId, zoningType)
  if (result.ok === false) {
    return publishFailure('zone', result.error.code, result.error.message)
  }
  return publishSuccess(
    'zone',
    `Zoned ${result.parcel.id} as ${result.parcel.zone}; economy changes commit on the next tick.`,
    {
      city: result.city,
      selectedParcelId: result.parcel.id,
      advisor: null,
      ...(result.city === previousCity ? {} : { saveStatus: 'dirty' as const }),
    },
  )
}

export function zoneSelectedCityParcel(
  zoningType: CityZoningType,
): CitySimSnapshot {
  if (!snapshot.selectedParcelId) {
    return publishFailure(
      'zone',
      'missing-selection',
      'Select a known parcel before assigning a zone.',
    )
  }
  return zoneCityParcel(snapshot.selectedParcelId, zoningType)
}

export function requestCityAdvice(
  scope: CityAdviceScope,
  parcelId: string | null = snapshot.selectedParcelId,
): CitySimSnapshot {
  try {
    const advisor = adviseCityZoning(snapshot.city, {
      scope,
      selectedParcelId: parcelId,
    })
    return publishSuccess(
      'advise',
      advisor.clarifyRequired
        ? `Advisor completed ${advisor.rounds} rounds and retained a tie for operator clarification.`
        : `Advisor completed ${advisor.rounds} round(s) with a ranked local recommendation.`,
      { advisor, costLog: advisor.costLog },
    )
  } catch (error) {
    return publishFailure(
      'advise',
      'invalid-advisor-request',
      error instanceof Error ? error.message : String(error),
    )
  }
}

export function applyCityAdvice(
  proposalOrId: CityAdvisorProposal | string,
): CitySimSnapshot {
  const proposalId = typeof proposalOrId === 'string' ? proposalOrId : proposalOrId.id
  const proposal = snapshot.advisor?.proposals.find(candidate => candidate.id === proposalId)
  if (!proposal) {
    return publishFailure(
      'zone',
      'unknown-proposal',
      `Advisor proposal ${proposalId || '(empty)'} is not part of the current snapshot.`,
    )
  }
  return zoneCityParcel(proposal.parcelId, proposal.recommendedZone)
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
    restoreCitySimPreviousCanvasSurface(previous)
  }
  return next
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
  malformedDocument = null
  sessionStartCity = createDefaultCityGrid()
  const reset = resetCitySimSnapshotForTests(
    sessionStartCity,
    options.webglSupported ?? readWebglSupport(),
  )
  persistenceTail = Promise.resolve(reset)
  return reset
}
