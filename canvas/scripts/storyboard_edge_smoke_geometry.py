def read_storyboard_edge_screen_endpoints(page, edge_id: str):
    endpoints = page.evaluate(
        """
        (edgeId) => {
          const selector = `[data-kg-overlay-edge-id="${CSS.escape(edgeId)}"], [data-kg-storyboard-canvas-edge-id="${CSS.escape(edgeId)}"]`
          const path = document.querySelector(selector)
          if (!(path instanceof SVGPathElement)) return null
          const matrix = path.getScreenCTM()
          const length = path.getTotalLength()
          if (!matrix || !Number.isFinite(length)) return null
          const project = (point) => {
            const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(matrix)
            return { x: screenPoint.x, y: screenPoint.y }
          }
          return {
            source: project(path.getPointAtLength(0)),
            target: project(path.getPointAtLength(length)),
          }
        }
        """,
        arg=edge_id,
    )
    if not endpoints:
        raise AssertionError(f"expected Storyboard edge endpoints for {edge_id}")
    return endpoints


def expect_pending_storyboard_edge_visible(page) -> None:
    try:
        page.wait_for_selector('[data-kg-overlay-pending-edge="true"]', state="attached", timeout=5000)
    except Exception as error:
        debug = page.evaluate(
            """() => {
              const state = window.__AG_STORE__?.getState?.() || {}
              return {
              toolMode: state.storyboardWidgetToolMode,
              pendingEdgeSourceId: state.storyboardWidgetPendingEdgeSourceId,
              handles: Array.from(document.querySelectorAll('button[data-kg-port-handle="1"]')).map((handle) => ({
                disabled: handle.disabled,
                dir: handle.getAttribute('data-kg-port-dir'),
                nodeId: handle.getAttribute('data-kg-port-node-id'),
                rect: (() => { const rect = handle.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height } })(),
              })),
            }}"""
        )
        compact = {
            "toolMode": debug.get("toolMode"),
            "pendingEdgeSourceId": debug.get("pendingEdgeSourceId"),
            "handles": debug.get("handles"),
        }
        raise AssertionError(f"expected pending Storyboard edge preview, debug={compact}") from error

