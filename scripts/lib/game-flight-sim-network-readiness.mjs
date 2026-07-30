const NETWORK_GUARD_PATH =
  'canvas/src/features/game-flight-sim/flightSimExternalCallGuard.ts'

const NETWORK_CAPABILITIES = Object.freeze([
  Object.freeze({ pattern: /\bfetch\s*\(/, name: 'fetch' }),
  Object.freeze({ pattern: /\bWebSocket\s*\(/, name: 'WebSocket' }),
  Object.freeze({ pattern: /\bEventSource\s*\(/, name: 'EventSource' }),
  Object.freeze({ pattern: /\bXMLHttpRequest\b/, name: 'XMLHttpRequest' }),
  Object.freeze({ pattern: /\bsendBeacon\s*\(/, name: 'sendBeacon' }),
])

const REQUIRED_GUARD_MARKERS = Object.freeze([
  'export class FlightSimExternalCallBlockedError extends Error',
  'export function blockFlightSimGameplayNetworkAttempt(',
  'captureFlightSimMission(mission)',
  'throw new FlightSimExternalCallBlockedError(operation)',
])

export function assertFlightSimFeatureNetworkBoundary({
  relativePath,
  source,
}) {
  const detected = NETWORK_CAPABILITIES.filter(({ pattern }) => (
    pattern.test(source)
  ))
  if (relativePath !== NETWORK_GUARD_PATH) {
    if (detected.length === 0) return
    throw new Error(
      `${relativePath} introduces forbidden Flight Sim capability: ${
        detected[0].name
      }`,
    )
  }
  const missing = REQUIRED_GUARD_MARKERS.filter(marker => !source.includes(marker))
  if (missing.length > 0) {
    throw new Error(
      `Flight Sim network guard is missing required capability markers: ${
        missing.join(', ')
      }`,
    )
  }
  if (detected.length > 0 || /\bglobalThis\b|\bnew Proxy\b/.test(source)) {
    throw new Error(
      'Flight Sim network guard must not own or replace browser transports',
    )
  }
}
