import type { ParsedCitySimInvocation } from './citySimInvocation'
import type {
  CityAdviceScope,
  CityZoningType,
} from './citySimModel'
import {
  exitCitySimSurface,
  openCitySimSurface,
  requestCityAdvice,
  resetCitySim,
  restartCitySim,
  saveCitySim,
  startCitySim,
  stopCitySim,
  zoneCityParcel,
  type CitySimOpenOptions,
} from './citySimRuntime'
import type { CitySimSnapshot } from './citySimRuntimeState'

export async function dispatchCityOperation(
  invocation: ParsedCitySimInvocation,
  options: CitySimOpenOptions = {},
): Promise<CitySimSnapshot> {
  if (invocation.operation === 'open') return openCitySimSurface(options)
  if (invocation.operation === 'start') return startCitySim(options)
  if (invocation.operation === 'stop') return stopCitySim()
  if (invocation.operation === 'restart') return restartCitySim()
  if (invocation.operation === 'zone') {
    return zoneCityParcel(invocation.parcelId || '', invocation.zoningType as CityZoningType)
  }
  if (invocation.operation === 'advise') {
    return requestCityAdvice(invocation.scope as CityAdviceScope, invocation.parcelId)
  }
  if (invocation.operation === 'save') return saveCitySim(options)
  if (invocation.operation === 'reset') return resetCitySim()
  return exitCitySimSurface()
}
