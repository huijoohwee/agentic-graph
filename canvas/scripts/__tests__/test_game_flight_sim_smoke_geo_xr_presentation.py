from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_ROOT))

from lib.game_flight_sim_smoke_geo_xr_presentation import (  # noqa: E402
    _source_disposal_was_settled,
)


class FlightGeoXrCityDisposalAuditTest(unittest.TestCase):
    def test_accepts_absent_or_loaded_empty_owned_source(self) -> None:
        self.assertTrue(_source_disposal_was_settled({
            "features": None,
            "loaded": False,
            "present": False,
        }))
        self.assertTrue(_source_disposal_was_settled({
            "features": 0,
            "loaded": True,
            "present": True,
        }))

    def test_rejects_present_unsettled_or_nonempty_source(self) -> None:
        self.assertFalse(_source_disposal_was_settled({
            "features": 0,
            "loaded": False,
            "present": True,
        }))
        self.assertFalse(_source_disposal_was_settled({
            "features": 1,
            "loaded": True,
            "present": True,
        }))
        self.assertFalse(_source_disposal_was_settled(None))


if __name__ == "__main__":
    unittest.main()
