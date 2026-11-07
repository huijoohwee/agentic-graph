export type CinematicControlMode = 'agent' | 'human'

type Listener = () => void

const listeners = new Set<Listener>()
let mode: CinematicControlMode = 'agent'

export function readCinematicControlMode(): CinematicControlMode {
  return mode
}

export function subscribeCinematicControlMode(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setCinematicControlMode(value: unknown): CinematicControlMode {
  const next: CinematicControlMode = value === 'human' ? 'human' : 'agent'
  if (next === mode) return mode
  mode = next
  for (const listener of [...listeners]) listener()
  return mode
}

export function resetCinematicControlModeForTests(): void {
  setCinematicControlMode('agent')
}
