from __future__ import annotations

from typing import Any

from playwright.sync_api import Page


def complete_authored_flight_mission(
    page: Page,
    *,
    expected_run_id: int,
) -> dict[str, Any]:
    return page.evaluate(
        """
        async ({ expectedRunId }) => {
          const runtime = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          const model = await window.__kgFlightSimBrowserProof.importModule('flightSimModel')
          const profile = runtime.readFlightSimSpatialProfile()
          const clamp = value => Math.max(-1, Math.min(1, value))
          const normalizeAngle = value => (
            ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2)
              % (Math.PI * 2) - Math.PI
          )
          let snapshot = runtime.readFlightSimSnapshot()
          if (
            snapshot.runId !== expectedRunId
            || snapshot.waypointIndex !== 0
            || !['ready', 'flying'].includes(snapshot.phase)
          ) {
            throw new Error(
              `touch-started mission was not fresh: ${JSON.stringify(snapshot)}`,
            )
          }

          const beforeFence = snapshot
          runtime.stopFlightSim()
          runtime.startFlightSim()
          snapshot = runtime.readFlightSimSnapshot()
          if (
            snapshot.runId !== beforeFence.runId
            || snapshot.tick !== beforeFence.tick
            || JSON.stringify(snapshot.aircraft)
              !== JSON.stringify(beforeFence.aircraft)
          ) {
            throw new Error('stop/start ticker fence changed mission state')
          }
          runtime.setFlightSimThrottle(0.72)

          const transitions = []
          let executedSteps = 0
          while (
            snapshot.phase === 'ready'
            || snapshot.phase === 'flying'
          ) {
            if (snapshot.tick >= model.FLIGHT_SIM_MAX_MISSION_TICKS) break
            const target = snapshot.waypointIndex < profile.waypoints.length
              ? profile.waypoints[snapshot.waypointIndex]
              : profile.landingPad
            const dx = target.position[0] - snapshot.aircraft.position[0]
            const dy = target.position[1] - snapshot.aircraft.position[1]
            const dz = target.position[2] - snapshot.aircraft.position[2]
            const desiredYaw = Math.atan2(-dx, -dz)
            const desiredPitch = Math.atan2(dy, Math.hypot(dx, dz))
            runtime.setFlightSimInput({
              yaw: clamp(
                normalizeAngle(desiredYaw - snapshot.aircraft.yaw) * 2.5,
              ),
              pitch: clamp(
                (desiredPitch - snapshot.aircraft.pitch) * 3,
              ),
              roll: 0,
              throttleDelta: 0,
            })
            const prior = snapshot
            snapshot = await runtime.advanceFlightSimByFixedStep()
            executedSteps += 1
            if (snapshot.tick !== prior.tick + 1) {
              throw new Error(
                `Flight ticker interleaved: ${prior.tick} -> ${snapshot.tick}`,
              )
            }
            if (
              snapshot.waypointIndex < prior.waypointIndex
              || snapshot.waypointIndex > prior.waypointIndex + 1
            ) {
              throw new Error(
                'non-ordered waypoint transition: '
                + `${prior.waypointIndex} -> ${snapshot.waypointIndex}`,
              )
            }
            if (snapshot.waypointIndex === prior.waypointIndex + 1) {
              transitions.push({
                waypointIndex: snapshot.waypointIndex,
                waypointId:
                  profile.waypoints[snapshot.waypointIndex - 1].id,
                tick: snapshot.tick,
              })
            }
          }
          runtime.setFlightSimInput({
            pitch: 0,
            roll: 0,
            yaw: 0,
            throttleDelta: 0,
          })
          const currentRunDecisions = snapshot.pendingDecisions.filter(
            item => item.payload?.runId === snapshot.runId,
          )
          const waypointDecisions = currentRunDecisions.filter(
            item => item.payload?.event === 'waypoint_reached',
          )
          const terminalDecisions = currentRunDecisions.filter(
            item => item.payload?.event === 'mission_completed',
          )
          const expectedIds = profile.waypoints.map(item => item.id)
          if (
            snapshot.phase !== 'completed'
            || snapshot.waypointIndex !== 3
            || snapshot.currentWaypointId !== profile.landingPad.id
            || transitions.map(item => item.waypointId).join('|')
              !== expectedIds.join('|')
            || waypointDecisions.map(item => item.payload.waypointId).join('|')
              !== expectedIds.join('|')
            || terminalDecisions.length !== 1
            || terminalDecisions[0].payload.landingPadId
              !== profile.landingPad.id
            || terminalDecisions[0].payload.status !== 'completed'
          ) {
            throw new Error(
              `authored route did not complete: ${
                JSON.stringify({ snapshot, transitions })
              }`,
            )
          }
          return {
            exercised: true,
            controller: 'accelerated-public-production-runtime',
            runId: snapshot.runId,
            executedSteps,
            terminalTick: snapshot.tick,
            phase: snapshot.phase,
            waypointIndex: snapshot.waypointIndex,
            waypointCount: snapshot.waypointCount,
            transitions,
            landingPadId: profile.landingPad.id,
            terminalDecisionId: terminalDecisions[0].decisionId,
            pendingUntilExplicitSave: true,
          }
        }
        """,
        {"expectedRunId": expected_run_id},
    )
