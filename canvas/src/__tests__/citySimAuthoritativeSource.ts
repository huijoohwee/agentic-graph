import { readFileSync } from 'node:fs'
import {
  parseCitySimAuthoredSource,
  type CitySimAuthoredSource,
} from '@/features/game-city-sim/citySimAuthoredSource'
import {
  resetCitySimRuntimeForTests as resetRuntime,
} from '@/features/game-city-sim/citySimRuntime'

const CITY_SOURCE_URL = new URL(
  '../../../docs/workspace-seeds/agentic-graph-game-city-building-sim-demo.md',
  import.meta.url,
)

let cachedDocument: string | null = null
let cachedSource: CitySimAuthoredSource | null = null

export function readAuthoritativeCitySimDocument(): string {
  cachedDocument ??= readFileSync(CITY_SOURCE_URL, 'utf8')
  return cachedDocument
}

export function readAuthoritativeCitySimSource(): CitySimAuthoredSource {
  if (cachedSource) return cachedSource
  const result = parseCitySimAuthoredSource(readAuthoritativeCitySimDocument())
  if (result.ok === false) {
    throw new Error(`Authoritative City source is invalid: ${result.error.message}`)
  }
  cachedSource = result.source
  return cachedSource
}

export function resetCitySimRuntimeForTests(
  options: Readonly<{ webglSupported?: boolean }> = {},
) {
  return resetRuntime({
    ...options,
    authoredSource: readAuthoritativeCitySimSource(),
  })
}
