import { adviseCityZoning } from './citySimAdvisor'
import { advanceCityTick } from './citySimEconomy'
import type { CitySimAuthoredSource } from './citySimAuthoredSource'
import {
  findCityParcel,
  zoneCityGridParcel,
  type CityAdviceScope,
  type CityAdvisorProposal,
  type CityGrid,
  type CityZoningType,
} from './citySimModel'
import {
  citySimSnapshot as snapshot,
  publishCitySimFailure as publishFailure,
  publishCitySimSuccess as publishSuccess,
  type CitySimSnapshot,
} from './citySimRuntimeState'

type MalformedCityDocument = Readonly<{ message: string }>

type CitySimSynchronousCommandDependencies = Readonly<{
  fenceTimer: () => void
  invalidateAsyncOperations: () => void
  readMalformedDocument: () => MalformedCityDocument | null
  clearMalformedDocument: () => void
  readSessionStartCity: () => CityGrid | null
  readAuthoredSource: () => CitySimAuthoredSource | null
  replaceSessionStartCity: (city: CityGrid) => void
}>

export function createCitySimSynchronousCommands(
  dependencies: CitySimSynchronousCommandDependencies,
) {
  function stopCitySim(): CitySimSnapshot {
    dependencies.fenceTimer()
    const malformedDocument = dependencies.readMalformedDocument()
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

  function advanceCitySimByFixedStep(): CitySimSnapshot {
    if (!snapshot.active || snapshot.phase !== 'running') return snapshot
    const result = advanceCityTick(snapshot.city)
    if (result.ok === false) {
      dependencies.fenceTimer()
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
      {
        city: result.city,
        advisor: null,
        costLog: result.costLog,
        saveStatus: 'dirty',
      },
    )
  }

  function restartCitySim(): CitySimSnapshot {
    dependencies.fenceTimer()
    const malformedDocument = dependencies.readMalformedDocument()
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
    const sessionStartCity = dependencies.readSessionStartCity()
    if (!sessionStartCity) {
      return publishFailure(
        'restart',
        'source-unavailable',
        'Restart requires a saved or source-authored City session.',
        { phase: 'error' },
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

  function resetCitySim(): CitySimSnapshot {
    dependencies.invalidateAsyncOperations()
    dependencies.fenceTimer()
    dependencies.clearMalformedDocument()
    const source = dependencies.readAuthoredSource()
    if (!source) {
      return publishFailure(
        'reset',
        'authored-source-missing',
        'Reset requires the applied source-authored City document.',
        { phase: 'error' },
      )
    }
    const city = source.city
    dependencies.replaceSessionStartCity(city)
    return publishSuccess(
      'reset',
      'Restored the applied source-authored City grid in memory; the City Document was not changed.',
      {
        city,
        geographicProfile: source.geographicProfile,
        phase: snapshot.active ? 'stopped' : 'idle',
        selectedParcelId: null,
        advisor: null,
        costLog: null,
        saveStatus: 'not-loaded',
      },
    )
  }

  function selectCityParcel(parcelId: string): CitySimSnapshot {
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

  function zoneCityParcel(
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

  function zoneSelectedCityParcel(
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

  function requestCityAdvice(
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

  function applyCityAdvice(
    proposalOrId: CityAdvisorProposal | string,
  ): CitySimSnapshot {
    const proposalId = typeof proposalOrId === 'string'
      ? proposalOrId
      : proposalOrId.id
    const proposal = snapshot.advisor?.proposals.find(
      candidate => candidate.id === proposalId,
    )
    if (!proposal) {
      return publishFailure(
        'zone',
        'unknown-proposal',
        `Advisor proposal ${proposalId || '(empty)'} is not part of the current snapshot.`,
      )
    }
    return zoneCityParcel(proposal.parcelId, proposal.recommendedZone)
  }

  return {
    stopCitySim,
    advanceCitySimByFixedStep,
    restartCitySim,
    resetCitySim,
    selectCityParcel,
    zoneCityParcel,
    zoneSelectedCityParcel,
    requestCityAdvice,
    applyCityAdvice,
  }
}
