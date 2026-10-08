from __future__ import annotations

import unittest

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


if __name__ == "__main__":
    unittest.main()
