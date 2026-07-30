import {
  exitCitySimSurface,
  waitForCitySimSurfaceRestoration,
} from './citySimRuntime'
import type { CitySimSnapshot } from './citySimRuntimeState'

export async function exitCitySimSurfaceAndWait(
  options: Readonly<{ restorePreviousSurface?: boolean }> = {},
): Promise<CitySimSnapshot> {
  exitCitySimSurface(options)
  return waitForCitySimSurfaceRestoration()
}
