import {
  FLIGHT_SIM_TIMEOUT_COLLIDER_ID,
  validateFlightSimDecisions,
  type FlightSimDecisionRecord,
  type FlightSimSpatialProfile,
} from './flightSimModel'

function event(item: FlightSimDecisionRecord): string {
  return String(item.payload.event)
}

function tick(item: FlightSimDecisionRecord): number {
  return Number(item.payload.tick)
}

export function validateFlightSimMissionDecisions(
  profile: FlightSimSpatialProfile,
  values: readonly unknown[],
): readonly FlightSimDecisionRecord[] {
  const decisions = validateFlightSimDecisions(values).filter(
    item => item.decisionType !== 'dialogue_outcome',
  )
  const decisionsByRun = new Map<number, FlightSimDecisionRecord[]>()
  for (const item of decisions) {
    const itemEvent = event(item)
    if (itemEvent === 'flight_state') {
      const waypointIndex = Number(item.payload.waypointIndex)
      if (waypointIndex > profile.waypoints.length) {
        throw new Error('Flight Sim Decision waypoint progress exceeds the active mission profile')
      }
    } else if (itemEvent === 'waypoint_reached') {
      const waypointIndex = Number(item.payload.waypointIndex)
      if (profile.waypoints[waypointIndex]?.id !== item.payload.waypointId) {
        throw new Error('Flight Sim Decision waypoint identity is outside the active mission profile')
      }
    } else if (itemEvent === 'mission_completed') {
      if (item.payload.landingPadId !== profile.landingPad.id) {
        throw new Error('Flight Sim completion landing-pad identity is outside the active mission profile')
      }
    } else if (itemEvent === 'mission_crashed') {
      const colliderId = String(item.payload.colliderId)
      if (colliderId !== FLIGHT_SIM_TIMEOUT_COLLIDER_ID
        && !profile.blockers.some(blocker => blocker.id === colliderId)) {
        throw new Error('Flight Sim Decision collider identity is outside the active mission profile')
      }
    }
    const runId = Number(item.payload.runId)
    const run = decisionsByRun.get(runId) || []
    run.push(item)
    decisionsByRun.set(runId, run)
  }

  for (const run of decisionsByRun.values()) {
    const waypoints = run
      .filter(item => event(item) === 'waypoint_reached')
      .sort((left, right) => Number(left.payload.waypointIndex) - Number(right.payload.waypointIndex))
    waypoints.forEach((item, index) => {
      const previous = waypoints[index - 1]
      if (Number(item.payload.waypointIndex) !== index
        || (previous && tick(item) <= tick(previous))) {
        throw new Error('Flight Sim Decision waypoint history must be complete and ordered')
      }
    })
    const completed = run.filter(item => event(item) === 'mission_completed')
    const crashed = run.filter(item => event(item) === 'mission_crashed')
    if (completed.length + crashed.length > 1) {
      throw new Error('Flight Sim Decisions must contain at most one terminal result per run')
    }
    const terminal = completed[0] || crashed[0]
    const states = run
      .filter(item => event(item) === 'flight_state')
      .sort((left, right) => tick(left) - tick(right))
    const latestState = states.at(-1)
    const lastWaypoint = waypoints.at(-1)
    if (lastWaypoint && (!latestState || tick(latestState) < tick(lastWaypoint))) {
      throw new Error('Flight Sim waypoint history requires a following flight state')
    }
    if (terminal) {
      if (!latestState
        || tick(latestState) !== tick(terminal)
        || latestState.payload.phase !== (completed.length ? 'completed' : 'crashed')) {
        throw new Error('Flight Sim terminal Decision requires a coherent terminal flight state')
      }
    } else if (latestState && ['completed', 'crashed'].includes(String(latestState.payload.phase))) {
      throw new Error('Flight Sim terminal flight state requires its terminal Decision')
    }
    if (completed.length && waypoints.length !== profile.waypoints.length) {
      throw new Error('Flight Sim completion requires the full waypoint history')
    }
    if (completed.length && lastWaypoint && tick(lastWaypoint) >= tick(completed[0])) {
      throw new Error('Flight Sim completion must follow the final waypoint at the marked landing pad')
    }
    if (latestState && Number(latestState.payload.waypointIndex) !== waypoints.length) {
      throw new Error('Flight Sim flight state does not match its waypoint history')
    }
    if (terminal && waypoints.some(item => tick(item) > tick(terminal))) {
      throw new Error('Flight Sim waypoint history cannot follow its terminal result')
    }
  }
  return decisions
}
