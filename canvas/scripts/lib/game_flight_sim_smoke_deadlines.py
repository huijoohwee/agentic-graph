from __future__ import annotations

import time
from typing import Any
from urllib.parse import urlparse

from playwright.sync_api import Page


GAMEPLAY_NETWORK_PROBE_PATH = (
    "/api/storage/flight-sim-browser-deadline-proof"
)
GAMEPLAY_NETWORK_PROBE_OPERATION = (
    f"fetch:GET:{GAMEPLAY_NETWORK_PROBE_PATH}"
)
GAMEPLAY_WEBSOCKET_PROBE_PATH = (
    "/flight-sim-browser-websocket-proof"
)


def _read_deadlines(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        async () => {
          const deadlines = await window.__kgFlightSimBrowserProof.importModule('flightSimDeadlineRuntime')
          return deadlines.readFlightSimDeadlineSnapshot()
        }
        """
    )


def _wait_for_initial_deadlines(page: Page) -> dict[str, Any]:
    deadline = time.monotonic() + 2
    observed: dict[str, Any] = {}
    while time.monotonic() < deadline:
        observed = _read_deadlines(page)
        if observed.get("webglAdmission") and observed.get("readyFrame"):
            return observed
        page.wait_for_timeout(16)
    raise AssertionError(
        f"Flight initial deadline observations were unavailable: {observed}"
    )


def verify_flight_deadline_contracts(
    page: Page,
    *,
    websocket_probe_url: str,
    websocket_probe_events: list[str],
    websocket_probe_route_hits: list[str],
) -> dict[str, Any]:
    initial = _wait_for_initial_deadlines(page)
    webgl = initial["webglAdmission"]
    ready = initial["readyFrame"]
    if (
        webgl.get("source") != "browser-webgl-probe"
        or webgl.get("synchronous") is not True
        or webgl.get("available") is not True
        or webgl.get("withinLimit") is not True
        or float(webgl.get("elapsedMs", float("inf")))
        > float(webgl.get("limitMs", 100))
        or float(webgl.get("limitMs", 0)) != 100
    ):
        raise AssertionError(
            f"Flight WebGL admission was not synchronous within 100 ms: {webgl}"
        )
    if (
        ready.get("source") != "native-maplibre-flight-ready-frame"
        or ready.get("synchronous") is not False
        or ready.get("withinLimit") is not True
        or ready.get("tick") != 0
        or float(ready.get("elapsedMs", float("inf")))
        > float(ready.get("limitMs", 100))
        or float(ready.get("limitMs", 0)) != 100
    ):
        raise AssertionError(
            "Flight ready frame was not presented by native MapLibre "
            f"within 100 ms: {ready}"
        )

    observed_probe_transport: list[str] = []

    def observe_probe_transport(request: Any) -> None:
        if urlparse(str(request.url)).path == GAMEPLAY_NETWORK_PROBE_PATH:
            observed_probe_transport.append(str(request.url))

    page.on("request", observe_probe_transport)
    try:
        interaction = page.evaluate(
            """
        async ({ attemptPath, websocketProbeUrl }) => {
          const runtime = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          const deadlines = await window.__kgFlightSimBrowserProof.importModule('flightSimDeadlineRuntime')
          const hud = document.querySelector('[data-kg-flight-sim-hud="1"]')
          if (!(hud instanceof HTMLElement)) {
            throw new Error('Flight HUD is unavailable for deadline proof')
          }
          const missionState = snapshot => {
            const { revision, runtimeError, ...state } = snapshot
            return state
          }
          const beforeNetwork = runtime.readFlightSimSnapshot()
          let blockedError = null
          try {
            await window.fetch(attemptPath)
          } catch (error) {
            blockedError = {
              name: String(error?.name || ''),
              code: String(error?.code || ''),
              operation: String(error?.operation || ''),
              synchronous: error?.synchronous === true,
              message: String(error?.message || error || ''),
            }
          }
          const afterNetwork = runtime.readFlightSimSnapshot()
          const network = deadlines
            .readFlightSimDeadlineSnapshot()
            .gameplayNetworkBlock
          if (
            blockedError?.code !== 'FLIGHT_SIM_GAMEPLAY_NETWORK_BLOCKED'
            || blockedError?.operation !== `fetch:GET:${attemptPath}`
            || blockedError?.synchronous !== true
            || JSON.stringify(missionState(beforeNetwork))
              !== JSON.stringify(missionState(afterNetwork))
            || afterNetwork.runtimeError
              !== `Flight Sim blocked gameplay network operation: fetch:GET:${attemptPath}`
          ) {
            throw new Error('Flight network rejection changed mission state')
          }

          const restartedAfterFetch = runtime.restartFlightSim()
          const beforeWebSocket = runtime.readFlightSimSnapshot()
          if (beforeWebSocket.active !== true) {
            throw new Error(
              'Flight was not active for the WebSocket rejection proof',
            )
          }
          let blockedWebSocketError = null
          let unexpectedWebSocket = null
          try {
            unexpectedWebSocket = new window.WebSocket(websocketProbeUrl)
          } catch (error) {
            blockedWebSocketError = {
              name: String(error?.name || ''),
              code: String(error?.code || ''),
              operation: String(error?.operation || ''),
              synchronous: error?.synchronous === true,
              message: String(error?.message || error || ''),
            }
          }
          if (unexpectedWebSocket) {
            unexpectedWebSocket.close()
          }
          const afterWebSocket = runtime.readFlightSimSnapshot()
          const websocketNetwork = deadlines
            .readFlightSimDeadlineSnapshot()
            .gameplayNetworkBlock
          if (
            blockedWebSocketError?.code
              !== 'FLIGHT_SIM_GAMEPLAY_NETWORK_BLOCKED'
            || blockedWebSocketError?.operation
              !== `websocket:${websocketProbeUrl}`
            || blockedWebSocketError?.synchronous !== true
            || JSON.stringify(missionState(beforeWebSocket))
              !== JSON.stringify(missionState(afterWebSocket))
            || afterWebSocket.runtimeError
              !== `Flight Sim blocked gameplay network operation: websocket:${websocketProbeUrl}`
          ) {
            throw new Error(
              'Flight WebSocket rejection changed mission state',
            )
          }

          runtime.restartFlightSim()
          const waitForHud = (accepted, limitMs) => new Promise(
            (resolve, reject) => {
              const startedAtMs = performance.now()
              let finished = false
              const observer = new MutationObserver(() => {
                if (finished || !accepted()) return
                finished = true
                observer.disconnect()
                clearTimeout(timeout)
                resolve(performance.now() - startedAtMs)
              })
              const timeout = setTimeout(() => {
                if (finished) return
                finished = true
                observer.disconnect()
                reject(new Error(`HUD did not update within ${limitMs} ms`))
              }, limitMs)
              observer.observe(hud, {
                attributes: true,
                attributeFilter: [
                  'data-kg-flight-sim-revision',
                  'data-kg-flight-sim-phase',
                ],
              })
              queueMicrotask(() => {
                if (finished || !accepted()) return
                finished = true
                observer.disconnect()
                clearTimeout(timeout)
                resolve(performance.now() - startedAtMs)
              })
            },
          )
          let expectedRevision = -1
          const rendered = waitForHud(() => (
            Number(hud.dataset.kgFlightSimRevision) === expectedRevision
            && hud.dataset.kgFlightSimPhase === 'stopped'
          ), deadlines.FLIGHT_SIM_HUD_UPDATE_LIMIT_MS)
          const commanded = runtime.stopFlightSim()
          expectedRevision = commanded.revision
          const browserElapsedMs = await rendered
          const hudUpdate = deadlines
            .readFlightSimDeadlineSnapshot()
            .hudUpdate
          const restored = runtime.restartFlightSim()
          return {
            webgl: deadlines.readFlightSimDeadlineSnapshot().webglAdmission,
            ready: deadlines.readFlightSimDeadlineSnapshot().readyFrame,
            network,
            blockedError,
            websocketNetwork,
            blockedWebSocketError,
            networkMissionStateRetained:
              JSON.stringify(missionState(beforeNetwork))
              === JSON.stringify(missionState(afterNetwork)),
            websocketMissionStateRetained:
              JSON.stringify(missionState(beforeWebSocket))
              === JSON.stringify(missionState(afterWebSocket)),
            websocketFlightActive: beforeWebSocket.active === true,
            restartedAfterFetch: {
              active: restartedAfterFetch.active,
              phase: restartedAfterFetch.phase,
              tick: restartedAfterFetch.tick,
              waypointIndex: restartedAfterFetch.waypointIndex,
              runtimeError: restartedAfterFetch.runtimeError,
            },
            hud: {
              ...hudUpdate,
              browserElapsedMs,
              expectedRevision,
              renderedPhase: 'stopped',
            },
            restored: {
              phase: restored.phase,
              tick: restored.tick,
              waypointIndex: restored.waypointIndex,
              runtimeError: restored.runtimeError,
            },
          }
        }
        """,
            {
                "attemptPath": GAMEPLAY_NETWORK_PROBE_PATH,
                "websocketProbeUrl": websocket_probe_url,
            },
        )
    finally:
        page.remove_listener("request", observe_probe_transport)
    websocket_events = [
        url
        for url in websocket_probe_events
        if url == websocket_probe_url
    ]
    websocket_route_hits = [
        url
        for url in websocket_probe_route_hits
        if url == websocket_probe_url
    ]
    interaction["transportObserved"] = bool(observed_probe_transport)
    interaction["transportRequests"] = observed_probe_transport
    interaction["websocketFenceEscapeObserved"] = bool(
        websocket_events or websocket_route_hits
    )
    # The exact Playwright route never calls connect_to_server(), so even a
    # regressed constructor cannot establish transport during this proof.
    interaction["websocketTransportObserved"] = False
    interaction["websocketEvents"] = websocket_events
    interaction["websocketRouteHits"] = websocket_route_hits
    network = interaction["network"]
    websocket_network = interaction["websocketNetwork"]
    hud = interaction["hud"]
    restored = interaction["restored"]
    if (
        network.get("source") != "flight-runtime-network-guard"
        or network.get("synchronous") is not True
        or network.get("operation") != GAMEPLAY_NETWORK_PROBE_OPERATION
        or network.get("withinLimit") is not True
        or float(network.get("elapsedMs", float("inf")))
        > float(network.get("limitMs", 1_000))
        or float(network.get("limitMs", 0)) != 1_000
        or interaction.get("transportObserved") is not False
        or interaction.get("blockedError", {}).get("code")
        != "FLIGHT_SIM_GAMEPLAY_NETWORK_BLOCKED"
        or interaction.get("blockedError", {}).get("operation")
        != GAMEPLAY_NETWORK_PROBE_OPERATION
        or interaction.get("networkMissionStateRetained") is not True
    ):
        raise AssertionError(
            f"Flight gameplay network attempt was not blocked within 1 s: {interaction}"
        )
    if (
        websocket_network.get("source") != "flight-runtime-network-guard"
        or websocket_network.get("synchronous") is not True
        or websocket_network.get("operation")
        != f"websocket:{websocket_probe_url}"
        or websocket_network.get("withinLimit") is not True
        or float(websocket_network.get("elapsedMs", float("inf")))
        > float(websocket_network.get("limitMs", 1_000))
        or float(websocket_network.get("limitMs", 0)) != 1_000
        or interaction.get("websocketTransportObserved") is not False
        or interaction.get("websocketFenceEscapeObserved") is not False
        or interaction.get("blockedWebSocketError", {}).get("code")
        != "FLIGHT_SIM_GAMEPLAY_NETWORK_BLOCKED"
        or interaction.get("blockedWebSocketError", {}).get("operation")
        != f"websocket:{websocket_probe_url}"
        or interaction.get("websocketMissionStateRetained") is not True
        or interaction.get("websocketFlightActive") is not True
    ):
        raise AssertionError(
            "Flight WebSocket attempt was not synchronously blocked before "
            f"transport within 1 s: {interaction}"
        )
    if (
        hud.get("source") != "runtime-publish-to-hud-layout"
        or hud.get("synchronous") is not False
        or hud.get("withinLimit") is not True
        or float(hud.get("elapsedMs", float("inf")))
        > float(hud.get("limitMs", 100))
        or float(hud.get("browserElapsedMs", float("inf"))) > 100
        or float(hud.get("limitMs", 0)) != 100
        or hud.get("revision") != hud.get("expectedRevision")
    ):
        raise AssertionError(
            f"Flight HUD did not reflect its runtime update within 100 ms: {hud}"
        )
    if (
        restored.get("phase") != "ready"
        or restored.get("tick") != 0
        or restored.get("waypointIndex") != 0
        or restored.get("runtimeError") is not None
    ):
        raise AssertionError(
            f"Flight deadline proof did not restore a fresh mission: {restored}"
        )
    return {
        "webglAdmission": webgl,
        "readyFrame": ready,
        "gameplayNetworkBlock": network,
        "gameplayNetworkBlockedError": interaction["blockedError"],
        "gameplayNetworkTransportObserved": interaction["transportObserved"],
        "gameplayWebSocketBlock": websocket_network,
        "gameplayWebSocketBlockedError":
            interaction["blockedWebSocketError"],
        "gameplayWebSocketMissionStateRetained":
            interaction["websocketMissionStateRetained"],
        "gameplayWebSocketFlightActive":
            interaction["websocketFlightActive"],
        "gameplayWebSocketTransportObserved":
            interaction["websocketTransportObserved"],
        "gameplayWebSocketFenceEscapeObserved":
            interaction["websocketFenceEscapeObserved"],
        "gameplayWebSocketEvents": interaction["websocketEvents"],
        "gameplayWebSocketRouteHits": interaction["websocketRouteHits"],
        "hudUpdate": hud,
        "restoredFreshMission": True,
    }
