from __future__ import annotations

from pathlib import Path
import unittest

from lib.game_flight_sim_smoke_network import (
    assert_workspace_seed_list_authority,
)


class FlightWorkspaceSeedAuthorityTests(unittest.TestCase):
    def test_bundled_production_seed_requires_no_local_list_request(
        self,
    ) -> None:
        assert_workspace_seed_list_authority(
            requests=[],
            expected_seed_root=Path("/workspace/docs/workspace-seeds"),
        )

    def test_exact_local_seed_root_is_allowed(self) -> None:
        assert_workspace_seed_list_authority(
            requests=[
                {
                    "method": "POST",
                    "path": "/workspace/docs/workspace-seeds",
                }
            ],
            expected_seed_root=Path("/workspace/docs/workspace-seeds"),
        )

    def test_unrelated_or_non_post_root_is_rejected(self) -> None:
        for request in (
            {"method": "POST", "path": "/workspace/docs"},
            {
                "method": "GET",
                "path": "/workspace/docs/workspace-seeds",
            },
            {"method": "POST", "path": ""},
        ):
            with self.subTest(request=request):
                with self.assertRaisesRegex(
                    AssertionError,
                    "unrelated docs mirror",
                ):
                    assert_workspace_seed_list_authority(
                        requests=[request],
                        expected_seed_root=Path(
                            "/workspace/docs/workspace-seeds"
                        ),
                    )


if __name__ == "__main__":
    unittest.main()
