from __future__ import annotations

import unittest
from pathlib import Path
import sys
from types import SimpleNamespace

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_ROOT))

from lib.game_flight_sim_smoke_network import (
    assert_transport_ownership,
    request_is_geo_provider_read,
    request_is_proof_local_read,
)
from lib.game_flight_sim_smoke_practice_source import derive_flight_practice_source


class FlightPracticeSourceDerivationTests(unittest.TestCase):
    def test_removes_only_recorded_source_mapping_and_keeps_line_endings(self):
        source = (
            '---\n'
            'title: "Flight"\n'
            'source_geospatial:\n'
            '  schema: "source-geospatial-config/v1"\n'
            '  scenePath: "/evidence-analysis/fixtures/scene-wsss-v1.json"\n'
            'native_flight_demo:\n'
            '  auto_start: true\n'
            '---\n'
            '# Flight\n'
        )
        derived = derive_flight_practice_source(source)
        self.assertEqual(
            derived,
            '---\n'
            'title: "Flight"\n'
            'native_flight_demo:\n'
            '  auto_start: true\n'
            '---\n'
            '# Flight\n',
        )
        self.assertEqual(
            derive_flight_practice_source(source.replace("\n", "\r\n")),
            derived.replace("\n", "\r\n"),
        )

    def test_rejects_missing_duplicate_and_non_mapping_recorded_intent(self):
        sources = (
            "---\ntitle: Flight\n---\n",
            "---\nsource_geospatial:\n  scenePath: /a.json\n"
            "source_geospatial:\n  scenePath: /b.json\n---\n",
            "---\nsource_geospatial: null\n---\n",
        )
        for source in sources:
            with self.subTest(source=source), self.assertRaises(ValueError):
                derive_flight_practice_source(source)

    def test_rejects_invalid_frontmatter(self):
        with self.assertRaisesRegex(ValueError, "frontmatter"):
            derive_flight_practice_source("source_geospatial:\n  scenePath: /a.json\n")


class FlightNetworkPolicyTests(unittest.TestCase):
    def test_local_read_classifier_allows_built_assets_and_blocks_dev_sources(self) -> None:
        origin = "127.0.0.1:4187"

        def request(method: str, path: str) -> SimpleNamespace:
            return SimpleNamespace(method=method, url=f"http://{origin}{path}")

        for path in ("/src/main.tsx", "/node_modules/.vite/deps/react.js", "/@vite/client"):
            with self.subTest(path=path):
                self.assertFalse(request_is_proof_local_read(request("HEAD" if path.startswith("/node_modules") else "GET", path), origin))
        for path in ("/assets/index-candidate.js", "/evidence-analysis/fixtures/scene-wsss-v1.json?revision=abc123"):
            with self.subTest(path=path):
                self.assertTrue(request_is_proof_local_read(request("GET", path), origin))
        self.assertFalse(request_is_proof_local_read(request("POST", "/evidence-analysis/fixtures/scene-wsss-v1.json"), origin))
        self.assertTrue(request_is_proof_local_read(request("POST", "/__agentic_os_fs_list"), origin))
        for path in (
            "/api/storage", "/api/storage/doc-default/flight", "/api/graph", "/api-v2/storage.json",
            "/__agentic_os_fs_write", "/agentic-os/control-plane/mcp", "/.well-known/api-catalog",
            "/workspace/mutate", "/workspace/mutate.json", "/proxy/https-airvio.co.json", "/API/storage.js",
            "/%61pi/storage.js", "/src/../api/storage.js",
        ):
            with self.subTest(path=path):
                self.assertFalse(request_is_proof_local_read(request("GET", path), origin))
        self.assertTrue(request_is_proof_local_read(request("GET", "/vite.svg"), origin))
        self.assertFalse(request_is_proof_local_read(SimpleNamespace(method="GET", url="https://airvio.co/api/storage/source-files"), origin))

    def test_geo_provider_classifier_allows_only_exact_read_hosts(self) -> None:
        def request(method: str, url: str) -> SimpleNamespace:
            return SimpleNamespace(method=method, url=url)

        local_origin = "localhost:4187"
        proxied_style = "http://localhost:4187/__grabmaps_proxy?url=https%3A%2F%2Fmaps.grab.com%2Fapi%2Fstyle.json%3Ftheme%3Dlight"
        proxied_tile = "http://localhost:4187/__grabmaps_proxy?url=https%3A%2F%2Fmaps.grab.com%2Fapi%2Fmaps%2Ftiles%2Fv2%2Fvector%2F12%2F3251%2F2040.pbf"
        double_encoded_traversal = "https://maps.grab.com/api/maps/tiles/v2/%252e%252e/%252e%252e/api/v1/mcp"
        proxied_double_encoded_traversal = "http://localhost:4187/__grabmaps_proxy?url=https%3A%2F%2Fmaps.grab.com%2Fapi%2Fmaps%2Ftiles%2Fv2%2F%25252e%25252e%2F%25252e%25252e%2Fapi%2Fv1%2Fmcp"
        for url in (
            "https://maps.grab.com/api/style.json?theme=light", "https://maps.grab.com/api/maps/tiles/v2/vector/12/3251/2040.pbf",
            "https://demotiles.maplibre.org/style.json", "https://demotiles.maplibre.org/tiles/2/1/1.pbf",
            "https://tiles.openfreemap.org/styles/liberty", "https://tiles.openfreemap.org/planet",
            "https://tiles.openfreemap.org/planet/20250702/2/1/1.pbf", "https://tiles.openfreemap.org/sprites/ofm_f384/ofm.json",
            "https://tiles.openfreemap.org/sprites/ofm_f384/ofm.png",
        ):
            with self.subTest(url=url): self.assertTrue(request_is_geo_provider_read(request("GET", url)))
        for url in (proxied_style, proxied_tile):
            with self.subTest(url=url): self.assertTrue(request_is_geo_provider_read(request("GET", url), local_origin))
        for method, url in (
            ("POST", "https://demotiles.maplibre.org/style.json"), ("GET", "http://demotiles.maplibre.org/style.json"),
            ("GET", "https://demotiles.maplibre.org.example/style.json"), ("GET", "https://maps.grab.com:not-a-port/api/style.json"),
            ("GET", "https://demotiles.maplibre.org/admin"), ("GET", "https://maps.grab.com/api/v1/mcp"),
            ("GET", "https://maps.grab.com/api/v1/maps/poi/v1/search"),
            ("GET", "https://maps.grab.com/api/maps/tiles/v2/%2e%2e/%2e%2e/v1/mcp"), ("GET", double_encoded_traversal),
            ("GET", "https://tiles.openfreemap.org/account"), ("GET", "https://airvio.co/api/storage"),
        ):
            with self.subTest(method=method, url=url): self.assertFalse(request_is_geo_provider_read(request(method, url)))
        for method, url, origin in (
            ("GET", proxied_style, None), ("POST", proxied_style, local_origin), ("GET", proxied_style, "localhost:4188"),
            ("GET", proxied_style + "&url=https%3A%2F%2Fmaps.grab.com%2Fapi%2Fstyle.json", local_origin),
            ("GET", proxied_style + "&extra=1", local_origin),
            ("GET", proxied_style.replace("https%3A", "http%3A"), local_origin),
            ("GET", proxied_style.replace("maps.grab.com", "maps.grab.com.example"), local_origin),
            ("GET", proxied_style.replace("%2Fapi%2Fstyle.json", "%2Fapi%2Fv1%2Fmcp"), local_origin),
            ("GET", proxied_double_encoded_traversal, local_origin),
        ):
            with self.subTest(method=method, url=url, origin=origin):
                self.assertFalse(request_is_geo_provider_read(request(method, url), origin))
        assert_transport_ownership(
            geo_provider_requests=["https://demotiles.maplibre.org/style.json"],
            unexpected_non_local_requests=[], blocked_requests=[], websocket_events=[], websocket_route_hits=[],
        )


if __name__ == "__main__":
    unittest.main()
