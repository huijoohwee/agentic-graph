let generation = 0
let pending = false

export function beginFlightSimHydration(): number {
  generation += 1
  pending = true
  return generation
}

export function finishFlightSimHydration(token: number): boolean {
  if (token !== generation) return false
  pending = false
  return true
}

export function cancelFlightSimHydration(): void {
  generation += 1
  pending = false
}

export function readFlightSimHydrationPending(): boolean {
  return pending
}
