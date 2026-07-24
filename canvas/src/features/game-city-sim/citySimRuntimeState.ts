import { readWebglSupport } from '@/lib/three/webglSupport'
import {
  createDefaultCityGrid,
  type CityAdvisorResult,
  type CityCostLog,
  type CityGrid,
} from './citySimModel'
import type { CityInputSnapshot } from './citySimInputModel'

export type CitySimPhase = 'idle' | 'running' | 'stopped' | 'error'
export type CitySimSaveStatus =
  | 'not-loaded'
  | 'loading'
  | 'loaded'
  | 'saving'
  | 'saved'
  | 'dirty'
  | 'malformed'
  | 'error'

export type CitySimOperationResult = Readonly<{
  ok: boolean
  operation: string
  code: string
  message: string
}>

export type CitySimSnapshot = Readonly<{
  active: boolean
  webglSupported: boolean
  phase: CitySimPhase
  city: CityGrid
  selectedParcelId: string | null
  lastInput: CityInputSnapshot | null
  advisor: CityAdvisorResult | null
  message: string
  error: string | null
  costLog: CityCostLog | null
  saveStatus: CitySimSaveStatus
  modelCallCount: 0
  estimatedCostUsd: 0
  lastResult: CitySimOperationResult | null
  revision: number
}>

export type CitySimSnapshotUpdate = Partial<Omit<
  CitySimSnapshot,
  'revision' | 'modelCallCount' | 'estimatedCostUsd'
>>

type Listener = () => void

const listeners = new Set<Listener>()
let stagedCityInput: CityInputSnapshot | null = null

export let citySimSnapshot: CitySimSnapshot = Object.freeze({
  active: false,
  webglSupported: readWebglSupport(),
  phase: 'idle',
  city: createDefaultCityGrid(),
  selectedParcelId: null,
  lastInput: null,
  advisor: null,
  message: 'City Simulation is inactive.',
  error: null,
  costLog: null,
  saveStatus: 'not-loaded',
  modelCallCount: 0,
  estimatedCostUsd: 0,
  lastResult: null,
  revision: 0,
})

function notifyListeners(): void {
  for (const listener of [...listeners]) listener()
}

function operationResult(
  ok: boolean,
  operation: string,
  code: string,
  message: string,
): CitySimOperationResult {
  return Object.freeze({ ok, operation, code, message })
}

export function publishCitySimSnapshot(
  update: CitySimSnapshotUpdate,
): CitySimSnapshot {
  const input = stagedCityInput
  stagedCityInput = null
  citySimSnapshot = Object.freeze({
    ...citySimSnapshot,
    ...update,
    ...(input ? { lastInput: input } : {}),
    modelCallCount: 0,
    estimatedCostUsd: 0,
    revision: citySimSnapshot.revision + 1,
  })
  notifyListeners()
  return citySimSnapshot
}

export function stageCitySimInputForNextPublish(
  input: CityInputSnapshot,
): () => void {
  if (stagedCityInput) {
    throw new Error('A City input is already staged for the next runtime publication.')
  }
  stagedCityInput = input
  return () => {
    if (stagedCityInput === input) stagedCityInput = null
  }
}

export function publishCitySimFailure(
  operation: string,
  code: string,
  message: string,
  update: CitySimSnapshotUpdate = {},
): CitySimSnapshot {
  return publishCitySimSnapshot({
    ...update,
    message,
    error: message,
    lastResult: operationResult(false, operation, code, message),
  })
}

export function publishCitySimSuccess(
  operation: string,
  message: string,
  update: CitySimSnapshotUpdate = {},
): CitySimSnapshot {
  return publishCitySimSnapshot({
    ...update,
    message,
    error: null,
    lastResult: operationResult(true, operation, 'ok', message),
  })
}

export function readCitySimSnapshot(): CitySimSnapshot {
  return citySimSnapshot
}

export function subscribeCitySimSnapshot(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resetCitySimSnapshotForTests(
  city: CityGrid,
  webglSupported: boolean,
): CitySimSnapshot {
  stagedCityInput = null
  citySimSnapshot = Object.freeze({
    active: false,
    webglSupported,
    phase: 'idle',
    city,
    selectedParcelId: null,
    lastInput: null,
    advisor: null,
    message: 'City Simulation is inactive.',
    error: null,
    costLog: null,
    saveStatus: 'not-loaded',
    modelCallCount: 0,
    estimatedCostUsd: 0,
    lastResult: null,
    revision: citySimSnapshot.revision + 1,
  })
  notifyListeners()
  return citySimSnapshot
}
