import type { WorkspaceFs } from '@/features/workspace-fs/types'
import type { CitySimAuthoredSource } from './citySimAuthoredSource'
import {
  loadCityGridFromWorkspace,
  saveCityGridToWorkspace,
} from './citySimPersistence'
import { validateCityGrid } from './citySimModel'
import type {
  CitySimSnapshot,
  CitySimSnapshotUpdate,
} from './citySimRuntimeState'

export type CitySimWorkspaceOptions = Readonly<{ workspace?: WorkspaceFs }>

export type CitySimMalformedDocument = Readonly<{
  document: string
  message: string
}>

type CitySimPersistenceCommandDependencies = Readonly<{
  applyLoadedCity: (
    city: CitySimSnapshot['city'],
    saveStatus: 'loaded' | 'not-loaded',
    operation: string,
  ) => CitySimSnapshot
  beginAsyncOperation: () => number
  fenceTimer: () => void
  isAsyncOperationCurrent: (generation: number) => boolean
  publish: (update: CitySimSnapshotUpdate) => CitySimSnapshot
  publishFailure: (
    operation: string,
    code: string,
    message: string,
    update?: CitySimSnapshotUpdate,
  ) => CitySimSnapshot
  publishSuccess: (
    operation: string,
    message: string,
    update?: CitySimSnapshotUpdate,
  ) => CitySimSnapshot
  readAuthoredSource: () => CitySimAuthoredSource | null
  readMalformedDocument: () => CitySimMalformedDocument | null
  readSnapshot: () => CitySimSnapshot
  setMalformedDocument: (document: CitySimMalformedDocument | null) => void
}>

export type CitySimPersistenceCommands = Readonly<{
  loadCitySim: (
    options?: CitySimWorkspaceOptions,
  ) => Promise<CitySimSnapshot>
  resetQueue: (snapshot: CitySimSnapshot) => void
  saveCitySim: (
    options?: CitySimWorkspaceOptions,
  ) => Promise<CitySimSnapshot>
}>

export function createCitySimPersistenceCommands(
  dependencies: CitySimPersistenceCommandDependencies,
): CitySimPersistenceCommands {
  let persistenceTail = Promise.resolve(dependencies.readSnapshot())

  const enqueue = (
    operation: () => Promise<CitySimSnapshot>,
  ): Promise<CitySimSnapshot> => {
    const result = persistenceTail
      .catch(() => dependencies.readSnapshot())
      .then(operation)
    persistenceTail = result.catch(() => dependencies.readSnapshot())
    return result
  }

  const saveCitySim = (
    options: CitySimWorkspaceOptions = {},
  ): Promise<CitySimSnapshot> => {
    if (dependencies.readMalformedDocument()) {
      return Promise.resolve(dependencies.publishFailure(
        'save',
        'malformed-document',
        'Save is blocked until Reset explicitly restores the applied authored source in memory.',
        { phase: 'error', saveStatus: 'malformed' },
      ))
    }
    const cityToSave = dependencies.readSnapshot().city
    const cityIssues = validateCityGrid(cityToSave)
    if (cityIssues.length > 0) {
      return Promise.resolve(dependencies.publishFailure(
        'save',
        'source-unavailable',
        `Save requires a saved or source-authored City grid: ${cityIssues[0]}`,
        { phase: 'error', saveStatus: 'error' },
      ))
    }
    dependencies.publish({
      saveStatus: 'saving',
      message: `Saving committed city tick ${cityToSave.tick}…`,
      error: null,
    })
    return enqueue(async () => {
      try {
        await saveCityGridToWorkspace(cityToSave, options)
        if (dependencies.readSnapshot().city !== cityToSave) {
          return dependencies.publishFailure(
            'save',
            'stale-save',
            `Saved tick ${cityToSave.tick}, but the current city changed during persistence; save again to commit the current snapshot.`,
            { saveStatus: 'dirty' },
          )
        }
        return dependencies.publishSuccess(
          'save',
          `Saved and read back the canonical City Document for tick ${cityToSave.tick}.`,
          { saveStatus: 'saved' },
        )
      } catch (error) {
        return dependencies.publishFailure(
          'save',
          'save-failed',
          error instanceof Error ? error.message : String(error),
          { saveStatus: 'error' },
        )
      }
    })
  }

  const loadCitySim = (
    options: CitySimWorkspaceOptions = {},
  ): Promise<CitySimSnapshot> => {
    const generation = dependencies.beginAsyncOperation()
    dependencies.fenceTimer()
    dependencies.publish({
      saveStatus: 'loading',
      message: 'Reading the canonical City Document…',
      error: null,
    })
    return enqueue(async () => {
      if (!dependencies.isAsyncOperationCurrent(generation)) {
        return dependencies.readSnapshot()
      }
      try {
        const loaded = await loadCityGridFromWorkspace(options)
        if (!dependencies.isAsyncOperationCurrent(generation)) {
          return dependencies.readSnapshot()
        }
        if (loaded.status === 'malformed') {
          dependencies.setMalformedDocument(Object.freeze({
            document: loaded.document,
            message: loaded.error.message,
          }))
          return dependencies.publishFailure(
            'load',
            'malformed-document',
            `City Document is malformed and was preserved: ${loaded.error.message}`,
            { phase: 'error', saveStatus: 'malformed' },
          )
        }
        const authoredSource = dependencies.readAuthoredSource()
        if (loaded.status === 'missing' && !authoredSource) {
          return dependencies.publishFailure(
            'load',
            'authored-source-missing',
            'Load found no saved City Document and no applied source-authored City grid.',
            { phase: 'error', saveStatus: 'not-loaded' },
          )
        }
        return dependencies.applyLoadedCity(
          loaded.status === 'loaded' ? loaded.city : authoredSource!.city,
          loaded.status === 'loaded' ? 'loaded' : 'not-loaded',
          'load',
        )
      } catch (error) {
        if (!dependencies.isAsyncOperationCurrent(generation)) {
          return dependencies.readSnapshot()
        }
        return dependencies.publishFailure(
          'load',
          'document-read-failed',
          error instanceof Error ? error.message : String(error),
          { phase: 'error', saveStatus: 'error' },
        )
      }
    })
  }

  return Object.freeze({
    loadCitySim,
    resetQueue: nextSnapshot => {
      persistenceTail = Promise.resolve(nextSnapshot)
    },
    saveCitySim,
  })
}
