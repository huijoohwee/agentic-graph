from __future__ import annotations

import unittest
from typing import Any

from playwright.sync_api import Error as PlaywrightError

from lib.game_mode_xr_share_scene_contract import (
    AUTHORED_XR_NODES,
    CANONICAL_XR_TERRAIN_NODE,
    FORBIDDEN_XR_ROOT_NODES,
    GAME_NODES,
    GAME_NPC_NODES,
    assert_authored_scene_identity,
    assert_game_scene_delta,
    assert_scene_contract,
)
from verify_game_mode_xr_share_browser_smoke import poll_evaluate
from lib.game_mode_xr_share_evidence import audit_request_origins


class FakePage:
    def __init__(self, outcomes: list[Any]) -> None:
        self.outcomes = outcomes
        self.evaluate_count = 0
        self.load_states: list[str] = []

    def evaluate(self, _script: str) -> Any:
        self.evaluate_count += 1
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    def wait_for_load_state(self, state: str) -> None:
        self.load_states.append(state)

    def wait_for_timeout(self, _interval_ms: int) -> None:
        pass


class PollEvaluateTest(unittest.TestCase):
    def test_retries_navigation_context_loss_after_dom_content_loaded(self) -> None:
        page = FakePage(
            [
                PlaywrightError(
                    "Page.evaluate: Execution context was destroyed, most likely because of a navigation"
                ),
                {"ready": True},
            ]
        )

        result = poll_evaluate(page, "() => true", lambda value: value == {"ready": True})

        self.assertEqual(result, {"ready": True})
        self.assertEqual(page.evaluate_count, 2)
        self.assertEqual(page.load_states, ["domcontentloaded"])

    def test_propagates_unqualified_context_loss(self) -> None:
        error = PlaywrightError("Page.evaluate: Execution context was destroyed")
        page = FakePage([error])

        with self.assertRaises(PlaywrightError) as raised:
            poll_evaluate(page, "() => true", lambda _value: True)

        self.assertIs(raised.exception, error)
        self.assertEqual(page.load_states, [])


class RequestOriginAuditTest(unittest.TestCase):
    local_origin = ("http", "localhost", 4186)
    supplied_origin = ("https", "airvio.co", 443)
    product_document_url = "https://airvio.co/agentic-graph/share/operator-token"

    def audit(self, requests: list[str]) -> int:
        return audit_request_origins(
            requests,
            base_url="http://localhost:4186",
            local_origin=self.local_origin,
            supplied_origin=self.supplied_origin,
            product_document_url=self.product_document_url,
        )

    def test_accepts_one_exact_product_document_request(self) -> None:
        self.assertEqual(
            self.audit(
                [
                    "http://localhost:4186/agentic-graph/",
                    self.product_document_url,
                    "http://localhost:4186/src/main.tsx",
                ]
            ),
            1,
        )

    def test_rejects_another_request_on_the_supplied_origin(self) -> None:
        with self.assertRaisesRegex(AssertionError, "supplied-document"):
            self.audit(
                [
                    self.product_document_url,
                    "https://airvio.co/favicon.ico",
                ]
            )

    def test_rejects_a_different_supplied_document_behind_the_local_proxy(self) -> None:
        with self.assertRaisesRegex(AssertionError, "proxy-supplied-document"):
            self.audit(
                [
                    self.product_document_url,
                    "http://localhost:4186/__fetch_remote?url=https%3A%2F%2Fairvio.co%2Fother.md",
                ]
            )


class SceneContractTest(unittest.TestCase):
    @staticmethod
    def active_contract() -> dict[str, Any]:
        npc_names = sorted(GAME_NPC_NODES)
        names = sorted(AUTHORED_XR_NODES | GAME_NODES | {CANONICAL_XR_TERRAIN_NODE})
        return {
            "ready": True,
            "names": names,
            "nodeCount": len(names),
            "namedNodeCounts": {name: 1 for name in names},
            "unnamedNodeCount": 0,
            "lightNodeCount": 2,
            "meshNodeCount": 8,
            "retained": "1",
            "presentation": "xr-authored",
            "documentLoaded": "1",
            "emptyWorld": "",
            "cameraFov": "50",
            "spatialProfile": "xr-authored",
            "nativeStageScale": 0.08,
            "gameStageScale": 0.08,
            "authoredSceneSignature": "canonical-xr-scene",
            "missionSubtree": {
                "directChildCount": 4,
                "directChildNames": npc_names,
                "descendantCount": 4,
                "descendantNames": npc_names,
                "unnamedDescendantCount": 0,
                "lightDescendantCount": 0,
                "meshDescendantCount": 4,
            },
        }

    @staticmethod
    def baseline_contract() -> dict[str, Any]:
        names = sorted(AUTHORED_XR_NODES | {CANONICAL_XR_TERRAIN_NODE})
        return {
            "ready": True,
            "names": names,
            "nodeCount": len(names),
            "namedNodeCounts": {name: 1 for name in names},
            "unnamedNodeCount": 0,
            "lightNodeCount": 2,
            "meshNodeCount": 4,
            "documentLoaded": "1",
            "emptyWorld": "",
            "authoredSceneSignature": "canonical-xr-scene",
        }

    def test_accepts_canonical_native_terrain_before_and_after_game_mode(self) -> None:
        assert_scene_contract(self.baseline_contract(), game_active=False)
        assert_scene_contract(self.active_contract(), game_active=True)

    def test_accepts_only_four_npc_meshes_in_game_mission_subtree(self) -> None:
        assert_scene_contract(self.active_contract(), game_active=True)

    def test_rejects_environment_light_or_unnamed_mission_variants(self) -> None:
        variants = {
            "environment": {"directChildCount": 5},
            "nested": {"descendantCount": 5},
            "unnamed": {"unnamedDescendantCount": 1},
            "light": {"lightDescendantCount": 1},
            "non-mesh": {"meshDescendantCount": 3},
        }
        for label, mutation in variants.items():
            with self.subTest(label=label):
                contract = self.active_contract()
                contract["missionSubtree"] = {**contract["missionSubtree"], **mutation}
                with self.assertRaisesRegex(AssertionError, "non-NPC variant"):
                    assert_scene_contract(contract, game_active=True)

    def test_active_scene_delta_adds_only_mission_and_four_npc_actors(self) -> None:
        assert_game_scene_delta(
            self.baseline_contract(),
            self.active_contract(),
            context="Game Mode activation",
        )

    def test_rejects_game_conditioned_sibling_scene_variants(self) -> None:
        variants = {
            "environment": {"name": "agentic_os_game_environment", "light": 0, "mesh": 1},
            "light": {"name": "agentic_os_game_light", "light": 1, "mesh": 0},
            "duplicate-actor": {
                "name": sorted(GAME_NPC_NODES)[0],
                "light": 0,
                "mesh": 1,
            },
        }
        for label, variant in variants.items():
            with self.subTest(label=label):
                active = self.active_contract()
                name = str(variant["name"])
                active["namedNodeCounts"] = {
                    **active["namedNodeCounts"],
                    name: active["namedNodeCounts"].get(name, 0) + 1,
                }
                active["nodeCount"] += 1
                active["lightNodeCount"] += int(variant["light"])
                active["meshNodeCount"] += int(variant["mesh"])
                with self.assertRaisesRegex(AssertionError, "scene delta"):
                    assert_game_scene_delta(
                        self.baseline_contract(),
                        active,
                        context=f"Game Mode {label}",
                    )

        active = self.active_contract()
        active["nodeCount"] += 1
        active["unnamedNodeCount"] += 1
        with self.assertRaisesRegex(AssertionError, "scene delta"):
            assert_game_scene_delta(
                self.baseline_contract(),
                active,
                context="Game Mode unnamed sibling",
            )

    def test_rejects_fallback_and_legacy_scene_roots(self) -> None:
        forbidden_variants = {
            *FORBIDDEN_XR_ROOT_NODES,
            "agentic_os_game_fps_arena_wall",
            "agentic_os_xr_empty_world_grid",
        }
        for forbidden_root in sorted(forbidden_variants):
            with self.subTest(forbidden_root=forbidden_root):
                contract = self.baseline_contract()
                contract["names"] = sorted([*contract["names"], forbidden_root])
                contract["namedNodeCounts"] = {
                    **contract["namedNodeCounts"],
                    forbidden_root: 1,
                }
                with self.assertRaisesRegex(AssertionError, "fallback or legacy root"):
                    assert_scene_contract(contract, game_active=False)

    def test_rejects_empty_world_dom_state_and_noncanonical_native_terrain(self) -> None:
        empty_world = self.baseline_contract()
        empty_world["emptyWorld"] = "1"
        with self.assertRaisesRegex(AssertionError, "empty-world DOM state"):
            assert_scene_contract(empty_world, game_active=False)

        for terrain_count in (0, 2):
            with self.subTest(terrain_count=terrain_count):
                contract = self.baseline_contract()
                contract["namedNodeCounts"] = {
                    **contract["namedNodeCounts"],
                    CANONICAL_XR_TERRAIN_NODE: terrain_count,
                }
                with self.assertRaisesRegex(AssertionError, "exactly one native controller terrain"):
                    assert_scene_contract(contract, game_active=False)

    def test_rejects_unloaded_document_and_legacy_arena_presentation(self) -> None:
        unloaded = self.baseline_contract()
        unloaded["documentLoaded"] = "0"
        with self.assertRaisesRegex(AssertionError, "loaded source document"):
            assert_scene_contract(unloaded, game_active=False)

        arena = self.baseline_contract()
        arena["presentation"] = "arena"
        with self.assertRaisesRegex(AssertionError, "legacy arena presentation"):
            assert_scene_contract(arena, game_active=False)

    def test_compares_authored_scene_identity_across_panel_projections(self) -> None:
        baseline = self.active_contract()
        current = self.active_contract()
        assert_authored_scene_identity(baseline, current, context="Media")

        current["authoredSceneSignature"] = "alternate-scene"
        with self.assertRaisesRegex(AssertionError, "Camera"):
            assert_authored_scene_identity(baseline, current, context="Camera")


if __name__ == "__main__":
    unittest.main()
