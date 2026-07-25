import type { CityZoningType } from './citySimModel'

export type CityInputSource = 'pointer' | 'keyboard' | 'touch'

export type CityInputSnapshot = Readonly<{
  source: CityInputSource
  selectParcelId: string | null
  requestedZone: CityZoningType | null
  sequence: number
}>

export type CityInputRequest = Readonly<Omit<CityInputSnapshot, 'sequence'>>
