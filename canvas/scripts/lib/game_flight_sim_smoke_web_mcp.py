from __future__ import annotations
from typing import Any

from playwright.sync_api import Page

FLIGHT_WEB_MCP_DEADLINE_MS = 2_000
FLIGHT_TOOL_NAMES = {
    "knowgrph.inspect_local_flight_sim", "knowgrph.control_local_flight_sim",
}
def _diagnostic_case(
    operation: str,
    invocation: str,
    error_code: str,
    message: str,
    *,
    field: str | None = None,
    token: str | None = None,
    structured_operation: str | None = None,
) -> dict[str, Any]:
    return {
        "operation": operation,
        "input": {
            "invocation": invocation,
            **(
                {"operation": structured_operation}
                if structured_operation is not None
                else {}
            ),
        },
        "expected": {
            "errorCode": error_code,
            "message": message,
            **({"field": field} if field is not None else {}),
            **({"token": token} if token is not None else {}),
        },
    }


STRICT_INVOCATION_CASES = [
    _diagnostic_case("missing-command", "@canvas #flight operation=start",
                     "FLIGHT_SIM_INVOCATION_MISSING_COMMAND",
                     "Flight Sim invocation requires command token /flight.sim.",
                     token="/flight.sim"),
    _diagnostic_case("missing-binding", "/flight.sim #flight operation=start",
                     "FLIGHT_SIM_INVOCATION_MISSING_BINDING",
                     "Flight Sim invocation requires binding token @canvas.",
                     token="@canvas"),
    _diagnostic_case("missing-semantic", "/flight.sim @canvas operation=start",
                     "FLIGHT_SIM_INVOCATION_SEMANTIC_MISMATCH",
                     "Flight Sim invocation semantic must be #flight.",
                     token="#flight"),
    _diagnostic_case(
        "duplicate-command",
        "/flight.sim /flight.start @canvas #flight operation=start",
        "FLIGHT_SIM_INVOCATION_DUPLICATE_SIGIL",
        "Flight Sim invocation permits exactly one command sigil.",
        token="/flight.start",
    ),
    _diagnostic_case(
        "duplicate-binding",
        "/flight.sim @canvas @scene #flight operation=start",
        "FLIGHT_SIM_INVOCATION_DUPLICATE_SIGIL",
        "Flight Sim invocation permits exactly one binding sigil.",
        token="@scene",
    ),
    _diagnostic_case(
        "duplicate-semantic",
        "/flight.sim @canvas #flight #world operation=start",
        "FLIGHT_SIM_INVOCATION_DUPLICATE_SIGIL",
        "Flight Sim invocation permits exactly one semantic sigil.",
        token="#world",
    ),
    _diagnostic_case(
        "duplicate-key",
        "/flight.sim @canvas #flight operation=start operation=stop",
        "FLIGHT_SIM_INVOCATION_DUPLICATE_KEY",
        "Flight Sim invocation contains duplicate key operation.",
        field="operation", token="operation=stop",
    ),
    _diagnostic_case(
        "unknown-key", "/flight.sim @canvas #flight operation=start extra=1",
        "FLIGHT_SIM_INVOCATION_UNKNOWN_KEY",
        "Flight Sim invocation does not support key extra.",
        field="extra", token="extra=1",
    ),
    _diagnostic_case(
        "command-mismatch", "/flight.run @canvas #flight operation=start",
        "FLIGHT_SIM_INVOCATION_COMMAND_MISMATCH",
        "Flight Sim invocation command must be /flight.sim.",
        token="/flight.run",
    ),
    _diagnostic_case(
        "binding-mismatch", "/flight.sim @scene #flight operation=start",
        "FLIGHT_SIM_INVOCATION_BINDING_MISMATCH",
        "Flight Sim invocation binding must be @canvas.",
        token="@scene",
    ),
    _diagnostic_case(
        "semantic-mismatch", "/flight.sim @canvas #world operation=start",
        "FLIGHT_SIM_INVOCATION_SEMANTIC_MISMATCH",
        "Flight Sim invocation semantic must be #flight.",
        token="#world",
    ),
    _diagnostic_case(
        "malformed-pair", "/flight.sim @canvas #flight operation",
        "FLIGHT_SIM_INVOCATION_MALFORMED_PAIR",
        "Flight Sim invocation fields must use one non-empty key=value pair.",
        token="operation",
    ),
    _diagnostic_case(
        "mixed-native-structured",
        "/flight.sim @canvas #flight operation=start",
        "FLIGHT_SIM_CONTROL_MIXED_INPUT",
        "Flight Sim control forbids mixing native invocation and structured fields.",
        field="operation", structured_operation="start",
    ),
    _diagnostic_case(
        "forbidden-throttle-pair",
        "/flight.sim @canvas #flight operation=start throttle=0.5",
        "FLIGHT_SIM_CONTROL_INVALID_THROTTLE",
        "Flight Sim operation start forbids a throttle value.",
        field="throttle", token="throttle=0.5",
    ),
    _diagnostic_case(
        "unsupported-operation",
        "/flight.sim @canvas #flight operation=inspect",
        "FLIGHT_SIM_CONTROL_UNSUPPORTED_OPERATION",
        "Flight Sim operation inspect is unsupported.",
        field="operation", token="inspect",
    ),
]


def control_flight_via_web_mcp(
    page: Page,
    invocation: str,
    calls: list[dict[str, Any]],
) -> dict[str, Any]:
    timed = page.evaluate(
        """
        async invocation => {
          const tools = Array.from(navigator.modelContext?.tools || [])
          const control = tools.find(
            tool => tool.name === 'knowgrph.control_local_flight_sim',
          )
          if (!control) {
            return {
              result: { ok: false, missingTool: true },
              elapsedMs: 0,
            }
          }
          const startedAtMs = performance.now()
          const result = await control.execute({ invocation })
          return {
            result,
            elapsedMs: performance.now() - startedAtMs,
          }
        }
        """,
        invocation,
    )
    metric = {
        "tool": "knowgrph.control_local_flight_sim",
        "operation": invocation.rsplit("operation=", 1)[-1].split()[0],
        "elapsedMs": timed["elapsedMs"],
        "deadlineMs": FLIGHT_WEB_MCP_DEADLINE_MS,
        "withinDeadline": timed["elapsedMs"] <= FLIGHT_WEB_MCP_DEADLINE_MS,
        "ok": timed["result"].get("ok") is True,
        "errorCode": timed["result"].get("errorCode"),
    }
    calls.append(metric)
    if not metric["withinDeadline"]:
        raise AssertionError(
            f"Flight WebMCP control exceeded 2 seconds: {metric}"
        )
    return timed["result"]


def verify_flight_web_mcp(
    page: Page,
    initial: dict[str, Any],
) -> dict[str, Any]:
    evidence = page.evaluate(
        """
        async diagnosticInputs => {
          const tools = Array.from(navigator.modelContext?.tools || [])
          const mcpRuntime = await window.__kgFlightSimBrowserProof.importModule('flightSimMcpRuntime')
          const webMcpRuntime = await window.__kgFlightSimBrowserProof.importModule('flightSimWebMcpTools')
          const flightTools = tools
            .filter(tool => tool.name.includes('local_flight_sim'))
            .map(tool => tool.name)
            .sort()
          const inspect = tools.find(
            tool => tool.name === 'knowgrph.inspect_local_flight_sim',
          )
          const control = tools.find(
            tool => tool.name === 'knowgrph.control_local_flight_sim',
          )
          if (!inspect || !control) {
            return { flightTools, registered: false }
          }
          const deadlineMs = webMcpRuntime.FLIGHT_SIM_WEB_MCP_DEADLINE_MS
          const call = async (tool, input, operation) => {
            const before = JSON.stringify(mcpRuntime.inspectLocalFlightSim())
            const startedAtMs = performance.now()
            const result = input === undefined
              ? await tool.execute()
              : await tool.execute(input)
            const elapsedMs = performance.now() - startedAtMs
            const after = JSON.stringify(mcpRuntime.inspectLocalFlightSim())
            return {
              operation,
              elapsedMs,
              deadlineMs,
              withinDeadline: elapsedMs <= deadlineMs,
              ok: result?.ok !== false,
              errorCode: result?.errorCode || null,
              message: result?.message || '',
              field: result?.field || null,
              token: result?.token || null,
              stateUnchanged: before === after,
              result,
            }
          }
          const inspected = await call(inspect, undefined, 'inspect')
          const diagnostics = []
          for (const item of diagnosticInputs) {
            const observed = await call(
              control,
              item.input,
              item.operation,
            )
            diagnostics.push({
              ...observed,
              expected: item.expected,
              result: undefined,
            })
          }
          const timeoutContract = name => ({
            webName: `timeout.${name}`,
            title: `Timeout ${name}`,
            description: 'Browser-only timeout proof.',
            inputSchema: {},
          })
          const never = () => new Promise(() => {})
          const timeoutBuilders =
            webMcpRuntime.buildFlightSimWebMcpToolBuilders(
              timeoutContract,
              {
                inspect: never,
                control: never,
                createDeadline: () => ({
                  expired: Promise.resolve(),
                  cancel: () => {},
                }),
              },
            )
          const timeoutInputs = [
            {
              operation: 'inspect',
              tool: timeoutBuilders.inspect_local_flight_sim(),
              input: undefined,
            },
            {
              operation: 'control',
              tool: timeoutBuilders.control_local_flight_sim(),
              input: {
                invocation:
                  '/flight.sim @canvas #flight operation=start',
              },
            },
          ]
          const timeoutDiagnostics = []
          for (const item of timeoutInputs) {
            const observed = await call(
              item.tool,
              item.input,
              `timeout-${item.operation}`,
            )
            timeoutDiagnostics.push({
              ...observed,
              expectedMessage:
                `Flight Sim ${item.operation} did not complete within `
                + `${deadlineMs} milliseconds.`,
              expectedOperation: item.operation,
              resultDeadlineMs: observed.result?.deadlineMs,
              resultOperation: observed.result?.operation,
              result: undefined,
            })
          }
          const snapshot = inspected.result
          return {
            registered: true,
            flightTools,
            schema: snapshot.schema,
            active: snapshot.flightSim.active,
            phase: snapshot.flightSim.phase,
            rendererOwner: snapshot.runtime.rendererOwner,
            sceneOwner: snapshot.runtime.sceneOwner,
            simulationOwner: snapshot.runtime.simulationOwner,
            runtimeNetworkCalls: snapshot.runtime.runtimeNetworkCalls,
            runtimeModelCalls: snapshot.runtime.runtimeModelCalls,
            deadlineMs,
            calls: [
              { ...inspected, result: undefined },
              ...diagnostics,
              ...timeoutDiagnostics,
            ],
            diagnostics,
            timeoutDiagnostics,
          }
        }
        """,
        STRICT_INVOCATION_CASES,
    )
    expected = {
        "registered": True,
        "flightTools": sorted(FLIGHT_TOOL_NAMES),
        "schema": "knowgrph-flight-sim-mcp/v1",
        "active": True,
        "phase": initial["phase"],
        "rendererOwner": "existing-r3f-canvas",
        "sceneOwner": "authored-xr-terrain",
        "simulationOwner": "native-agentic-ecs",
        "runtimeNetworkCalls": 0,
        "runtimeModelCalls": 0,
        "deadlineMs": FLIGHT_WEB_MCP_DEADLINE_MS,
    }
    if any(evidence.get(key) != value for key, value in expected.items()):
        raise AssertionError(
            f"strict Flight WebMCP was not ready: {evidence}"
        )
    for call in evidence.get("calls") or []:
        if (
            call.get("withinDeadline") is not True
            or call.get("elapsedMs", FLIGHT_WEB_MCP_DEADLINE_MS + 1)
            > FLIGHT_WEB_MCP_DEADLINE_MS
        ):
            raise AssertionError(
                f"Flight WebMCP exceeded its deadline: {call}"
            )
    for diagnostic in evidence.get("diagnostics") or []:
        expected_diagnostic = diagnostic.get("expected") or {}
        actual_diagnostic = {
            "errorCode": diagnostic.get("errorCode"),
            "message": diagnostic.get("message"),
            **(
                {"field": diagnostic.get("field")}
                if diagnostic.get("field") is not None
                else {}
            ),
            **(
                {"token": diagnostic.get("token")}
                if diagnostic.get("token") is not None
                else {}
            ),
        }
        if (
            diagnostic.get("ok") is not False
            or diagnostic.get("stateUnchanged") is not True
            or actual_diagnostic != expected_diagnostic
        ):
            raise AssertionError(
                f"Flight invocation diagnostic was not strict: {diagnostic}"
            )
    for diagnostic in evidence.get("timeoutDiagnostics") or []:
        result = diagnostic
        if (
            result.get("ok") is not False
            or result.get("errorCode") != "FLIGHT_SIM_WEB_MCP_TIMEOUT"
            or result.get("message") != result.get("expectedMessage")
            or result.get("stateUnchanged") is not True
            or result.get("resultDeadlineMs") != FLIGHT_WEB_MCP_DEADLINE_MS
            or result.get("resultOperation") != result.get("expectedOperation")
        ):
            raise AssertionError(
                f"Flight WebMCP timeout did not fail closed: {diagnostic}"
            )
    return evidence
def verify_flight_exit(
    page: Page,
    calls: list[dict[str, Any]],
    prior_surface: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    evidence = page.evaluate(
        """
        async () => {
          const tools = Array.from(navigator.modelContext?.tools || [])
          const control = tools.find(
            tool => tool.name === 'knowgrph.control_local_flight_sim',
          )
          const inspect = tools.find(
            tool => tool.name === 'knowgrph.inspect_local_flight_sim',
          )
          if (!control || !inspect) return { registered: false }
          const runtime = await window.__kgFlightSimBrowserProof.importModule('flightSimRuntime')
          const mcpRuntime = await window.__kgFlightSimBrowserProof.importModule('flightSimMcpRuntime')
          const physics = await window.__kgFlightSimBrowserProof.importModule('xrPhysicsRuntime')
          const camera = await window.__kgFlightSimBrowserProof.importModule('xrNativeControllerCameraRuntime')
          const controller = await window.__kgFlightSimBrowserProof.importModule('xrNativeControllerDemoRuntime')
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          const gympgrph = await window.__kgFlightSimBrowserProof.importModule('gympgrphStore')
          const withoutRevision = value => {
            const copy = JSON.parse(JSON.stringify(value))
            delete copy.revision
            return copy
          }
          const readRestoredSurface = () => {
            const state = store.useGraphStore.getState()
            const canvases = Array.from(document.querySelectorAll('canvas'))
            const rendererCanvases = canvases.filter(
              canvas => String(canvas.dataset.engine || '').startsWith('three.js'),
            )
            const auxiliaryCanvases = canvases.filter(
              canvas => !rendererCanvases.includes(canvas),
            )
            const roots = Array.from(document.querySelectorAll(
              '[data-kg-xr-scene-media-drop="1"]',
            ))
            const baseline = window.__kgFlightSimCanvas
            return {
              surface: {
                canvasRenderMode: state.canvasRenderMode,
                canvas3dMode: state.canvas3dMode,
                canvasRenderModeLastFree: state.canvasRenderModeLastFree,
                canvasRenderModeIsAuto: state.canvasRenderModeIsAuto,
                floatingPanelOpen: state.floatingPanelOpen,
                floatingPanelView: state.floatingPanelView,
                geospatialModeEnabled:
                  gympgrph.isGeospatialModeEnabled(),
                mapLibreActive:
                  gympgrph.readActiveMapLibreMap?.() != null,
                timelinePlaying:
                  state.timelineTransportPlaying === true,
              },
              physics: withoutRevision(physics.readXrPhysicsRuntime()),
              physicsFrame: physics.readXrPhysicsRuntimeFrame(),
              camera: {
                mode: camera.readXrNativeControllerCamera().mode,
              },
              controller: withoutRevision(
                controller.readXrNativeControllerDemo(),
              ),
              controllerFrame:
                controller.readSharedXrNativeControllerDemoFrame(),
              canvasCount: canvases.length,
              rendererCanvasCount: rendererCanvases.length,
              auxiliaryCanvasCount: auxiliaryCanvases.length,
              auxiliaryCanvasesLocalOnly: auxiliaryCanvases.every(
                canvas => Boolean(canvas.closest(
                  '[data-kg-motion-control-preview="local-only"], .monaco-editor',
                )),
              ),
              rootCount: roots.length,
              baselineCanvasIdentityRetained:
                baseline instanceof HTMLCanvasElement
                && baseline.isConnected
                && rendererCanvases.length === 1
                && rendererCanvases[0] === baseline,
            }
          }
          const beforeExit = readRestoredSurface()
          const exitStartedAtMs = performance.now()
          const exitResult = await control.execute({
            invocation: '/flight.sim @canvas #flight operation=exit',
          })
          const exitElapsedMs = performance.now() - exitStartedAtMs
          const restoredSurface = readRestoredSurface()
          const beforeInactive = JSON.stringify(
            mcpRuntime.inspectLocalFlightSim(),
          )
          const inspectStartedAtMs = performance.now()
          const inactiveResult = await inspect.execute()
          const inspectElapsedMs = performance.now() - inspectStartedAtMs
          const afterInactive = JSON.stringify(
            mcpRuntime.inspectLocalFlightSim(),
          )
          return {
            registered: true,
            beforeExit,
            exitResult,
            exitElapsedMs,
            inactiveInspection: {
              result: inactiveResult,
              elapsedMs: inspectElapsedMs,
              stateUnchanged: beforeInactive === afterInactive,
            },
            postExit: {
              flight: runtime.readFlightSimSnapshot(),
              restoration: restoredSurface,
            },
          }
        }
        """
    )
    if evidence.get("registered") is not True:
        raise AssertionError("Flight WebMCP tools disappeared before Exit")
    exit_result = evidence["exitResult"]
    inactive_inspection = evidence["inactiveInspection"]
    post_exit = evidence["postExit"]
    before_exit = evidence["beforeExit"]
    expected_physics = {
        **before_exit["physics"],
        "phase": prior_surface["physics"]["phase"],
    }
    expected_controller = {
        **before_exit["controller"],
        **{
            key: prior_surface["controller"][key]
            for key in ("phase", "mode", "terrainId")
        },
    }
    expected_controller_frame = {
        **before_exit["controllerFrame"],
        **{
            key: prior_surface["controllerFrame"][key]
            for key in ("phase", "mode", "terrainId")
        },
    }
    expected_restoration = {
        "surface": {
            key: prior_surface[key]
            for key in (
                "canvasRenderMode",
                "canvas3dMode",
                "canvasRenderModeLastFree",
                "canvasRenderModeIsAuto",
                "floatingPanelOpen",
                "floatingPanelView",
                "geospatialModeEnabled",
                "mapLibreActive",
                "timelinePlaying",
            )
        },
        "physics": expected_physics,
        "physicsFrame": before_exit["physicsFrame"],
        "camera": before_exit["camera"],
        "controller": expected_controller,
        "controllerFrame": expected_controller_frame,
        "canvasCount": prior_surface["canvasCount"],
        "rendererCanvasCount": prior_surface["rendererCanvasCount"],
        "auxiliaryCanvasCount": prior_surface["auxiliaryCanvasCount"],
        "auxiliaryCanvasesLocalOnly": True,
        "rootCount": prior_surface["rootCount"],
        "baselineCanvasIdentityRetained": True,
    }
    post_exit["beforeExit"] = before_exit
    post_exit["expectedRestoration"] = expected_restoration
    exit_metric = {
        "tool": "knowgrph.control_local_flight_sim",
        "operation": "exit",
        "elapsedMs": evidence["exitElapsedMs"],
        "deadlineMs": FLIGHT_WEB_MCP_DEADLINE_MS,
        "withinDeadline": evidence["exitElapsedMs"] <= FLIGHT_WEB_MCP_DEADLINE_MS,
        "ok": exit_result.get("ok") is True,
        "errorCode": exit_result.get("errorCode"),
    }
    inactive_metric = {
        "tool": "knowgrph.inspect_local_flight_sim",
        "operation": "inspect-inactive",
        "elapsedMs": inactive_inspection["elapsedMs"],
        "deadlineMs": FLIGHT_WEB_MCP_DEADLINE_MS,
        "withinDeadline": (
            inactive_inspection["elapsedMs"] <= FLIGHT_WEB_MCP_DEADLINE_MS
        ),
        "ok": inactive_inspection["result"].get("ok") is True,
        "errorCode": inactive_inspection["result"].get("errorCode"),
    }
    calls.extend((exit_metric, inactive_metric))
    if (
        exit_result.get("ok") is not True
        or exit_metric["withinDeadline"] is not True
        or inactive_metric["withinDeadline"] is not True
        or inactive_metric["errorCode"] != "FLIGHT_SIM_STATE_UNAVAILABLE"
        or inactive_inspection["result"].get("ok") is not False
        or inactive_inspection["result"].get("message")
        != "Flight Sim state is unavailable while the surface is inactive."
        or inactive_inspection["result"].get("operation") != "inspect"
        or inactive_inspection.get("stateUnchanged") is not True
        or post_exit["flight"]["active"] is not False
        or post_exit["flight"]["phase"] != "stopped"
        or post_exit["flight"]["runId"] != 0
        or post_exit["flight"]["tick"] != 0
        or post_exit["flight"]["pendingDecisions"]
        or post_exit["restoration"] != expected_restoration
    ):
        raise AssertionError(
            "Flight Exit did not discard state and deeply restore Physics: "
            f"exit={exit_result}, inactive={inactive_inspection}, "
            f"expected={expected_restoration}, post={post_exit}"
        )
    return exit_result, inactive_inspection, post_exit
