import {
  parseCitySimInvocation,
  type CitySimInvocationResult,
} from './citySimInvocation'
import {
  type CitySimOpenOptions,
} from './citySimRuntime'
import { dispatchCityOperation } from './citySimOperationRuntime'
import type { CitySimSnapshot } from './citySimRuntimeState'

export type CitySimInvocationExecutionResult =
  | Readonly<{ ok: true; snapshot: CitySimSnapshot }>
  | Extract<CitySimInvocationResult, { ok: false }>

export async function executeCitySimInvocation(
  raw: string,
  options: CitySimOpenOptions = {},
): Promise<CitySimInvocationExecutionResult> {
  const parsed = parseCitySimInvocation(raw)
  if (parsed.ok === false) return parsed
  const dispatched = await dispatchCityOperation(parsed.invocation, options)
  return Object.freeze({ ok: true, snapshot: dispatched })
}
