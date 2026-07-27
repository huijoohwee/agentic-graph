from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import socket
import sys
from threading import Lock, Thread
import unittest
from pathlib import Path
from types import SimpleNamespace


SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_ROOT))

from lib.game_flight_sim_smoke_ledger import (
    BrowserVerificationLedger,
    REQUIRED_BROWSER_VERIFICATION_NAMES,
)
from lib.game_flight_sim_smoke_network import (
    assert_transport_ownership,
    request_is_geo_provider_read,
    request_is_proof_local_read,
    summarize_websocket_attempts,
)
from lib.game_flight_sim_smoke_lifecycle import (
    read_runtime_and_dispatch_blur,
)
from lib.game_flight_sim_smoke_throttle import (
    FLIGHT_THROTTLE_PROOF_MESSAGE,
    assert_staged_throttle_response,
    is_committed_throttle_target,
)
from playwright.sync_api import WebSocketRoute, sync_playwright
from verify_game_flight_sim_browser_smoke import (
    local_chromium_executable,
    request_record,
)


class _QuietRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        del format, args


class _ServiceWorkerOriginHandler(_QuietRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/":
            body = b"""<!doctype html>
<script>
window.__kgServiceWorkerState = { ready: false, error: null }
navigator.serviceWorker.register("/sw.js")
  .then(() => navigator.serviceWorker.ready)
  .then(registration => {
    window.__kgServiceWorkerState.ready = Boolean(registration.active)
  })
  .catch(error => {
    window.__kgServiceWorkerState.error = String(error)
  })
</script>
"""
            self._respond(body, "text/html; charset=utf-8")
            return
        if self.path == "/sw.js":
            body = b"""
self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting())
})
self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim())
})
self.addEventListener("message", event => {
  if (event.data?.type !== "unexpected-fetch-probe") return
  const reply = event.ports[0]
  event.waitUntil(
    fetch(event.data.url)
      .then(() => reply.postMessage({ networkReached: true }))
      .catch(error => reply.postMessage({
        networkReached: false,
        error: String(error),
      })),
  )
})
"""
            self._respond(
                body,
                "application/javascript; charset=utf-8",
            )
            return
        self.send_error(404)

    def _respond(self, body: bytes, content_type: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


class _CountingTargetServer(ThreadingHTTPServer):
    def __init__(self) -> None:
        super().__init__(
            ("127.0.0.1", 0),
            _CountingTargetHandler,
        )
        self._count_lock = Lock()
        self.accepted_connections = 0
        self.request_count = 0

    def get_request(self) -> tuple[socket.socket, object]:
        request, address = super().get_request()
        with self._count_lock:
            self.accepted_connections += 1
        return request, address

    def record_request(self) -> None:
        with self._count_lock:
            self.request_count += 1


class _CountingTargetHandler(_QuietRequestHandler):
    def do_GET(self) -> None:
        self.server.record_request()
        body = b"unexpected target reached"
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def _start_http_server(server: ThreadingHTTPServer) -> Thread:
    thread = Thread(
        target=server.serve_forever,
        kwargs={"poll_interval": 0.01},
        daemon=True,
    )
    thread.start()
    return thread


class BrowserVerificationLedgerTest(unittest.TestCase):
    def test_blur_probe_captures_runtime_and_dispatches_in_one_browser_task(
        self,
    ) -> None:
        class EvaluatingPage:
            source = ""

            def evaluate(self, source: str) -> dict[str, int]:
                self.source = source
                return {"tick": 7}

        page = EvaluatingPage()
        self.assertEqual(
            read_runtime_and_dispatch_blur(page),
            {"tick": 7},
        )
        self.assertLess(
            page.source.index("runtime.readFlightSimSnapshot()"),
            page.source.index("window.dispatchEvent(new Event('blur'))"),
        )
        self.assertEqual(page.source.count("page.evaluate"), 0)

    def test_throttle_proof_waits_for_a_later_committed_world_tick(
        self,
    ) -> None:
        staged = {
            "active": True,
            "phase": "flying",
            "runId": 4,
            "tick": 8,
            "aircraft": {"throttle": 0.62},
        }
        response = {
            "ok": True,
            "operation": "throttle",
            "message": FLIGHT_THROTTLE_PROOF_MESSAGE,
            "flight": {"flightSim": staged},
        }
        self.assertIs(
            assert_staged_throttle_response(response, 0.62),
            staged,
        )
        self.assertFalse(is_committed_throttle_target(staged, staged))
        self.assertFalse(
            is_committed_throttle_target(
                {
                    **staged,
                    "tick": 9,
                    "aircraft": {"throttle": 0.62},
                },
                staged,
            )
        )
        self.assertTrue(
            is_committed_throttle_target(
                {
                    **staged,
                    "tick": 9,
                    "aircraft": {"throttle": 0.75},
                },
                staged,
            )
        )
        with self.assertRaisesRegex(
            AssertionError,
            "committed pre-tick snapshot",
        ):
            assert_staged_throttle_response(
                {
                    **response,
                    "flight": {
                        "flightSim": {
                            **staged,
                            "aircraft": {"throttle": 0.75},
                        }
                    },
                },
                0.62,
            )

    def test_optional_beacon_reader_uses_active_runtime_canvas_metadata(
        self,
    ) -> None:
        scene_source = (
            SCRIPTS_ROOT / "lib" / "game_flight_sim_smoke_scene.py"
        ).read_text(encoding="utf-8")
        baseline_source, active_reader_source = scene_source.split(
            "def read_flight_scene", maxsplit=1
        )
        lookup = (
            "rendererCanvas?.dataset.kgFlightSimOptionalBeacon || 'null'"
        )
        self.assertNotIn(lookup, baseline_source)
        self.assertEqual(active_reader_source.count(lookup), 1)
        self.assertNotIn("const optionalBeaconNode = descendants.find", scene_source)

    def test_exact_required_inventory_rejects_an_all_passed_subset(self) -> None:
        complete = BrowserVerificationLedger()
        for name in REQUIRED_BROWSER_VERIFICATION_NAMES:
            complete.verify(name, lambda: None)
        complete.assert_success(
            expected_names=REQUIRED_BROWSER_VERIFICATION_NAMES
        )

        incomplete = BrowserVerificationLedger()
        for name in REQUIRED_BROWSER_VERIFICATION_NAMES[:-1]:
            incomplete.verify(name, lambda: None)
        with self.assertRaises(AssertionError) as raised:
            incomplete.assert_success(
                expected_names=REQUIRED_BROWSER_VERIFICATION_NAMES
            )
        message = str(raised.exception)
        self.assertIn("INVENTORY mismatch", message)
        self.assertIn("browser error surface", message)

    def test_local_read_classifier_allows_built_assets_and_blocks_dev_sources(
        self,
    ) -> None:
        origin = "127.0.0.1:4187"

        def request(method: str, path: str) -> SimpleNamespace:
            return SimpleNamespace(
                method=method,
                url=f"http://{origin}{path}",
            )

        self.assertFalse(
            request_is_proof_local_read(
                request("GET", "/src/main.tsx"),
                origin,
            )
        )
        self.assertFalse(
            request_is_proof_local_read(
                request("HEAD", "/node_modules/.vite/deps/react.js"),
                origin,
            )
        )
        self.assertFalse(
            request_is_proof_local_read(
                request("GET", "/@vite/client"),
                origin,
            )
        )
        self.assertTrue(
            request_is_proof_local_read(
                request("GET", "/assets/index-candidate.js"),
                origin,
            )
        )
        self.assertTrue(
            request_is_proof_local_read(
                request("POST", "/__kg_fs_list"),
                origin,
            )
        )
        for path in (
            "/api/storage",
            "/api/storage/doc-default/flight",
            "/api/graph",
            "/api-v2/storage.json",
            "/__kg_fs_write",
            "/knowgrph/control-plane/mcp",
            "/.well-known/api-catalog",
            "/workspace/mutate",
            "/workspace/mutate.json",
            "/proxy/https-airvio.co.json",
            "/API/storage.js",
            "/%61pi/storage.js",
            "/src/../api/storage.js",
        ):
            with self.subTest(path=path):
                self.assertFalse(
                    request_is_proof_local_read(
                        request("GET", path),
                        origin,
                    )
                )
        self.assertTrue(
            request_is_proof_local_read(
                request("GET", "/vite.svg"),
                origin,
            )
        )
        self.assertFalse(
            request_is_proof_local_read(
                SimpleNamespace(
                    method="GET",
                    url="https://airvio.co/api/storage/source-files",
                ),
                origin,
            )
        )

    def test_geo_provider_classifier_allows_only_exact_read_hosts(self) -> None:
        def request(method: str, url: str) -> SimpleNamespace:
            return SimpleNamespace(method=method, url=url)

        local_origin = "localhost:4187"
        proxied_style = (
            "http://localhost:4187/__grabmaps_proxy?"
            "url=https%3A%2F%2Fmaps.grab.com%2Fapi%2Fstyle.json"
            "%3Ftheme%3Dlight"
        )
        proxied_tile = (
            "http://localhost:4187/__grabmaps_proxy?"
            "url=https%3A%2F%2Fmaps.grab.com%2Fapi%2Fmaps%2Ftiles"
            "%2Fv2%2Fvector%2F12%2F3251%2F2040.pbf"
        )
        double_encoded_traversal = (
            "https://maps.grab.com/api/maps/tiles/v2/"
            "%252e%252e/%252e%252e/api/v1/mcp"
        )
        proxied_double_encoded_traversal = (
            "http://localhost:4187/__grabmaps_proxy?"
            "url=https%3A%2F%2Fmaps.grab.com%2Fapi%2Fmaps%2Ftiles"
            "%2Fv2%2F%25252e%25252e%2F%25252e%25252e"
            "%2Fapi%2Fv1%2Fmcp"
        )
        for url in (
            "https://maps.grab.com/api/style.json?theme=light",
            "https://maps.grab.com/api/maps/tiles/v2/vector/12/3251/2040.pbf",
            "https://demotiles.maplibre.org/style.json",
            "https://demotiles.maplibre.org/tiles/2/1/1.pbf",
            "https://tiles.openfreemap.org/styles/liberty",
            "https://tiles.openfreemap.org/planet/20250702/2/1/1.pbf",
        ):
            with self.subTest(url=url):
                self.assertTrue(
                    request_is_geo_provider_read(request("GET", url))
                )
        for url in (proxied_style, proxied_tile):
            with self.subTest(url=url):
                self.assertTrue(
                    request_is_geo_provider_read(
                        request("GET", url),
                        local_origin,
                    )
                )
        for method, url in (
            ("POST", "https://demotiles.maplibre.org/style.json"),
            ("GET", "http://demotiles.maplibre.org/style.json"),
            ("GET", "https://demotiles.maplibre.org.example/style.json"),
            ("GET", "https://maps.grab.com:not-a-port/api/style.json"),
            ("GET", "https://demotiles.maplibre.org/admin"),
            ("GET", "https://maps.grab.com/api/v1/mcp"),
            ("GET", "https://maps.grab.com/api/v1/maps/poi/v1/search"),
            (
                "GET",
                "https://maps.grab.com/api/maps/tiles/v2/%2e%2e/%2e%2e/v1/mcp",
            ),
            ("GET", double_encoded_traversal),
            ("GET", "https://tiles.openfreemap.org/account"),
            ("GET", "https://airvio.co/api/storage"),
        ):
            with self.subTest(method=method, url=url):
                self.assertFalse(
                    request_is_geo_provider_read(request(method, url))
                )
        for method, url, origin in (
            ("GET", proxied_style, None),
            ("POST", proxied_style, local_origin),
            ("GET", proxied_style, "localhost:4188"),
            (
                "GET",
                proxied_style + "&url=https%3A%2F%2Fmaps.grab.com%2Fapi%2Fstyle.json",
                local_origin,
            ),
            ("GET", proxied_style + "&extra=1", local_origin),
            (
                "GET",
                proxied_style.replace("https%3A", "http%3A"),
                local_origin,
            ),
            (
                "GET",
                proxied_style.replace(
                    "maps.grab.com",
                    "maps.grab.com.example",
                ),
                local_origin,
            ),
            (
                "GET",
                proxied_style.replace(
                    "%2Fapi%2Fstyle.json",
                    "%2Fapi%2Fv1%2Fmcp",
                ),
                local_origin,
            ),
            (
                "GET",
                proxied_double_encoded_traversal,
                local_origin,
            ),
        ):
            with self.subTest(method=method, url=url, origin=origin):
                self.assertFalse(
                    request_is_geo_provider_read(
                        request(method, url),
                        origin,
                    )
                )

        assert_transport_ownership(
            geo_provider_requests=[
                "https://demotiles.maplibre.org/style.json"
            ],
            unexpected_non_local_requests=[],
            blocked_requests=[],
            websocket_events=[],
            websocket_route_hits=[],
        )

    def test_wildcard_websocket_route_blocks_unexpected_local_transport(
        self,
    ) -> None:
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        listener.setblocking(False)
        port = int(listener.getsockname()[1])
        expected_probe_url = (
            f"ws://127.0.0.1:{port}/flight-sim-browser-websocket-proof"
        )
        unexpected_url = f"ws://127.0.0.1:{port}/crafted-unexpected"
        route_hits: list[str] = []
        server_connections = 0

        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(
                    headless=True,
                    executable_path=local_chromium_executable(),
                )
                context = browser.new_context()

                def block_websocket(
                    websocket_route: WebSocketRoute,
                ) -> None:
                    route_hits.append(str(websocket_route.url))

                context.route_web_socket("**/*", block_websocket)
                page = context.new_page()
                page.evaluate(
                    """
                    url => {
                      window.__kgCraftedUnexpectedSocket = new WebSocket(url)
                    }
                    """,
                    unexpected_url,
                )
                page.wait_for_timeout(100)
                browser.close()

            while True:
                try:
                    connection, _ = listener.accept()
                except BlockingIOError:
                    break
                server_connections += 1
                connection.close()
        finally:
            listener.close()

        self.assertEqual(route_hits, [unexpected_url])
        self.assertEqual(server_connections, 0)
        summary = summarize_websocket_attempts(
            expected_probe_url,
            [],
            route_hits,
        )
        self.assertEqual(summary["probeRouteHits"], [])
        self.assertEqual(summary["unexpectedRouteHits"], [unexpected_url])
        with self.assertRaisesRegex(AssertionError, "crafted-unexpected"):
            assert_transport_ownership(
                geo_provider_requests=[
                    "https://demotiles.maplibre.org/style.json"
                ],
                unexpected_non_local_requests=[],
                blocked_requests=[],
                websocket_events=[],
                websocket_route_hits=route_hits,
            )

    def test_context_route_blocks_service_worker_owned_unexpected_fetch(
        self,
    ) -> None:
        origin_server = ThreadingHTTPServer(
            ("127.0.0.1", 0),
            _ServiceWorkerOriginHandler,
        )
        target_server = _CountingTargetServer()
        origin_thread = _start_http_server(origin_server)
        target_thread = _start_http_server(target_server)
        origin_port = int(origin_server.server_address[1])
        target_port = int(target_server.server_address[1])
        origin = f"127.0.0.1:{origin_port}"
        target_url = (
            f"http://127.0.0.1:{target_port}/service-worker-unexpected"
        )
        observed_requests: list[dict[str, str]] = []
        blocked_requests: list[dict[str, str]] = []
        probe_result: dict[str, object] | None = None

        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(
                    headless=True,
                    executable_path=local_chromium_executable(),
                )
                try:
                    context = browser.new_context()

                    def route_request(route: object, request: object) -> None:
                        if request_is_proof_local_read(request, origin):
                            route.continue_()
                            return
                        blocked_requests.append(request_record(request))
                        route.abort("blockedbyclient")

                    context.route("**/*", route_request)
                    context.on(
                        "request",
                        lambda request: observed_requests.append(
                            request_record(request)
                        ),
                    )
                    page = context.new_page()
                    response = page.goto(
                        f"http://{origin}/",
                        wait_until="domcontentloaded",
                    )
                    self.assertIsNotNone(response)
                    self.assertTrue(response.ok)
                    page.wait_for_function(
                        """
                        () => (
                          window.__kgServiceWorkerState.ready
                          || window.__kgServiceWorkerState.error
                        )
                        """
                    )
                    worker_state = page.evaluate(
                        "() => window.__kgServiceWorkerState"
                    )
                    self.assertIsNone(worker_state["error"])
                    probe_result = page.evaluate(
                        """
                        async targetUrl => {
                          const registration =
                            await navigator.serviceWorker.ready
                          if (!registration.active) {
                            throw new Error(
                              "service worker did not become active",
                            )
                          }
                          const channel = new MessageChannel()
                          const result = new Promise((resolve, reject) => {
                            const timeout = setTimeout(
                              () => reject(
                                new Error("service-worker probe timed out"),
                              ),
                              5_000,
                            )
                            channel.port1.onmessage = event => {
                              clearTimeout(timeout)
                              resolve(event.data)
                            }
                          })
                          registration.active.postMessage(
                            {
                              type: "unexpected-fetch-probe",
                              url: targetUrl,
                            },
                            [channel.port2],
                          )
                          return await result
                        }
                        """,
                        target_url,
                    )
                    page.wait_for_timeout(100)
                finally:
                    browser.close()
        finally:
            origin_server.shutdown()
            target_server.shutdown()
            origin_server.server_close()
            target_server.server_close()
            origin_thread.join(timeout=1)
            target_thread.join(timeout=1)

        target_requests = [
            request
            for request in observed_requests
            if request["url"] == target_url
        ]
        self.assertIsNotNone(probe_result)
        self.assertIs(probe_result["networkReached"], False)
        self.assertIn("Failed to fetch", str(probe_result["error"]))
        self.assertEqual(len(target_requests), 1)
        self.assertEqual(target_requests[0]["owner"], "service-worker")
        self.assertEqual(blocked_requests, target_requests)
        self.assertEqual(target_server.accepted_connections, 0)
        self.assertEqual(target_server.request_count, 0)
        with self.assertRaisesRegex(
            AssertionError,
            "service-worker-unexpected",
        ):
            assert_transport_ownership(
                geo_provider_requests=[
                    "https://demotiles.maplibre.org/style.json"
                ],
                unexpected_non_local_requests=[
                    request["url"] for request in target_requests
                ],
                blocked_requests=blocked_requests,
                websocket_events=[],
                websocket_route_hits=[],
            )

    def test_reports_all_independent_failures_and_names_skipped_dependents(
        self,
    ) -> None:
        ledger = BrowserVerificationLedger()
        dependent_called = False

        def fail_source() -> None:
            raise AssertionError("injected Source Files failure")

        def fail_network() -> None:
            raise AssertionError("injected request-fence failure")

        def dependent() -> None:
            nonlocal dependent_called
            dependent_called = True

        ledger.verify("Source Files apply", fail_source)
        ledger.verify("Geo provider transport ownership", fail_network)
        ledger.verify(
            "transparent Flight runtime Canvas",
            dependent,
            depends_on=("Source Files apply",),
        )

        with self.assertRaises(AssertionError) as raised:
            ledger.assert_success()
        message = str(raised.exception)
        self.assertIn("FAILED Source Files apply", message)
        self.assertIn("FAILED Geo provider transport ownership", message)
        self.assertIn("SKIPPED transparent Flight runtime Canvas", message)
        self.assertFalse(dependent_called)
        self.assertEqual(
            [record["status"] for record in ledger.evidence()],
            ["failed", "failed", "skipped"],
        )


if __name__ == "__main__":
    unittest.main()
