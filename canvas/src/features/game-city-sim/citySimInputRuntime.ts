import {
  isCityZoningType,
  parseCityParcelId,
} from './citySimModel'
import type {
  CityInputRequest,
  CityInputSnapshot,
  CityInputSource,
} from './citySimInputModel'
import {
  readCitySimSnapshot,
  selectCityParcel,
  zoneCityParcel,
} from './citySimRuntime'
import {
  publishCitySimSnapshot,
  stageCitySimInputForNextPublish,
} from './citySimRuntimeState'

export type {
  CityInputRequest,
  CityInputSnapshot,
  CityInputSource,
} from './citySimInputModel'

const CITY_INPUT_SOURCES = new Set<CityInputSource>([
  'pointer',
  'keyboard',
  'touch',
])

const cityInputQueue: CityInputSnapshot[] = []
let cityInputSequence = 0
let consumingCityInput = false

function copyCityInputSynchronously(input: CityInputRequest): CityInputSnapshot {
  if (!CITY_INPUT_SOURCES.has(input.source)) {
    throw new Error(`Unsupported City input source ${String(input.source)}.`)
  }
  const requestedZone = input.requestedZone
  if (requestedZone !== null && !isCityZoningType(requestedZone)) {
    throw new Error(`Unsupported City input zoning type ${String(requestedZone)}.`)
  }
  const requestedParcelId = input.selectParcelId === null
    ? null
    : String(input.selectParcelId || '')
  const selectParcelId = requestedParcelId
    ?? (requestedZone ? readCitySimSnapshot().selectedParcelId : null)
  if (selectParcelId !== null && !parseCityParcelId(selectParcelId)) {
    throw new Error(`City input parcel ${selectParcelId || '(empty)'} must use rNNcNN.`)
  }
  if (selectParcelId === null && requestedZone === null) {
    throw new Error('City input must select a parcel or request a zone.')
  }
  if (selectParcelId === null) {
    throw new Error('City zoning input requires a selected parcel snapshot.')
  }
  const sequence = cityInputSequence + 1
  if (!Number.isSafeInteger(sequence)) {
    throw new Error('City input sequence exhausted the safe-integer range.')
  }
  cityInputSequence = sequence
  return Object.freeze({
    source: input.source,
    selectParcelId,
    requestedZone,
    sequence,
  })
}

function consumeCityInput(snapshot: CityInputSnapshot): void {
  const cancelStagedInput = stageCitySimInputForNextPublish(snapshot)
  try {
    if (snapshot.requestedZone !== null) {
      zoneCityParcel(snapshot.selectParcelId || '', snapshot.requestedZone)
    } else {
      selectCityParcel(snapshot.selectParcelId || '')
    }
  } finally {
    cancelStagedInput()
  }
}

function drainCityInputQueue(): void {
  if (consumingCityInput) return
  consumingCityInput = true
  try {
    while (cityInputQueue.length > 0) {
      const snapshot = cityInputQueue.shift()
      if (snapshot) consumeCityInput(snapshot)
    }
  } finally {
    consumingCityInput = false
  }
}

export function enqueueCityInput(input: CityInputRequest): CityInputSnapshot {
  const snapshot = copyCityInputSynchronously(input)
  cityInputQueue.push(snapshot)
  drainCityInputQueue()
  return snapshot
}

export function cityInputSourceFromPointerType(
  pointerType: string | null | undefined,
): Extract<CityInputSource, 'pointer' | 'touch'> {
  return pointerType === 'touch' ? 'touch' : 'pointer'
}

export function cityInputSourceFromActivation(input: Readonly<{
  detail: number
  pointerType?: string | null
}>): CityInputSource {
  if (input.detail === 0) return 'keyboard'
  return cityInputSourceFromPointerType(input.pointerType)
}

export function describeCityInputSnapshot(input: CityInputSnapshot): string {
  const zoning = input.requestedZone
    ? `; requested ${input.requestedZone}`
    : ''
  return `Input #${input.sequence} · ${input.source} · ${input.selectParcelId}${zoning}`
}

export function resetCityInputQueueForTests(): void {
  cityInputQueue.splice(0)
  cityInputSequence = 0
  consumingCityInput = false
  if (readCitySimSnapshot().lastInput) {
    publishCitySimSnapshot({ lastInput: null })
  }
}
