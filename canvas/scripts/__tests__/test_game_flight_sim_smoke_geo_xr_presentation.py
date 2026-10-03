from __future__ import annotations

import io
from copy import deepcopy
import json
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_ROOT))

from lib.game_flight_sim_smoke_city_regional_poi import (  # noqa: E402
    require_city_regional_poi_teardown_contract,
)
from lib.game_flight_sim_smoke_bootstrap import BoundedEvaluationPage  # noqa: E402
from lib.game_flight_sim_smoke_ledger import BrowserVerificationLedger  # noqa: E402
from lib.game_flight_sim_smoke_geo_xr_requirements import (  # noqa: E402
    authored_environment_checks, regional_environment_checks, unmet_view_requirements, wait_for_view,
)


class JavaScriptEvaluationPage:
    """Execute the actual adapter JavaScript without a second browser gate."""

    def __init__(self) -> None:
        self.last_argument = None
        self.native_attribute = object()

    def evaluate(self, expression, arg=None):
        self.last_argument = arg
        completed = subprocess.run(
            ["node", "--input-type=module", "-e", """
              import fs from 'node:fs';
              const input = JSON.parse(fs.readFileSync(0, 'utf8'));
              try {
                const value = await globalThis.eval(input.expression)(input.arg);
                console.log(JSON.stringify({ value }));
              } catch (error) {
                console.error(error.message);
                process.exitCode = 1;
              }
            """],
            input=json.dumps({"expression": expression, "arg": arg}),
            capture_output=True, text=True, timeout=2, check=False,
        )
        if completed.returncode:
            raise RuntimeError(completed.stderr.strip())
        return json.loads(completed.stdout).get("value")


class FlightBoundedEvaluationTest(unittest.TestCase):
    def test_function_argument_and_result_are_preserved(self) -> None:
        native = JavaScriptEvaluationPage()
        page = BoundedEvaluationPage(native)
        argument = {"nested": [1, None, False], "name": "quoted ' value"}
        for expression in (
            "async value => ({ argument: value, answer: 42 })",
            "function(value) { return { argument: value, answer: 42 }; }",
            "async function(value) { return { argument: value, answer: 42 }; }",
        ):
            with self.subTest(expression=expression):
                self.assertEqual(page.evaluate(expression, argument), {
                    "argument": argument, "answer": 42,
                })
                self.assertIs(native.last_argument, argument)
        self.assertIs(page.native_attribute, native.native_attribute)

    def test_nonfunction_values_promises_and_statements_are_preserved(self) -> None:
        page = BoundedEvaluationPage(JavaScriptEvaluationPage())
        for expression, expected in (
            ("({ answer: 42 })", {"answer": 42}),
            ("Promise.resolve({ answer: 43 })", {"answer": 43}),
            ("false", False),
            ("undefined", None),
            ("globalThis.calls = (globalThis.calls || 0) + 1; globalThis.calls", 1),
        ):
            with self.subTest(expression=expression):
                self.assertEqual(page.evaluate(expression), expected)

    def test_native_rejection_and_runtime_syntax_error_are_not_replaced(self) -> None:
        page = BoundedEvaluationPage(JavaScriptEvaluationPage())
        for expression, message in (
            ("async () => { throw new Error('native rejection'); }", "native rejection"),
            ("() => { throw new SyntaxError('native syntax'); }", "native syntax"),
        ):
            with self.subTest(expression=expression):
                with self.assertRaisesRegex(RuntimeError, message):
                    page.evaluate(expression)

    def test_unfinished_function_and_nonfunction_promises_reject(self) -> None:
        page = BoundedEvaluationPage(JavaScriptEvaluationPage(), timeout_ms=25)
        for expression in (
            "async () => await new Promise(() => {})",
            "new Promise(() => {})",
        ):
            with self.subTest(expression=expression):
                started = time.monotonic()
                with self.assertRaisesRegex(
                    RuntimeError,
                    r"Page.evaluate exceeded 25ms at .*presentation.py:\d+",
                ):
                    page.evaluate(expression)
                self.assertLess(time.monotonic() - started, 1)

    def test_cannot_disable_or_extend_production_deadline(self) -> None:
        for timeout in (0, -1, 30_001, True, 1.5):
            with self.subTest(timeout=timeout):
                with self.assertRaises(ValueError):
                    BoundedEvaluationPage(JavaScriptEvaluationPage(), timeout_ms=timeout)


class FlightPartialLedgerTest(unittest.TestCase):
    def test_checkpoint_exposes_in_flight_and_completed_real_phase(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "proof.partial.json"
            output = io.StringIO()
            ledger = BrowserVerificationLedger(checkpoint_path=path)

            def check():
                self.assertEqual(json.loads(path.read_text()), {
                    "activeVerification": "real operation",
                    "verificationLedger": [],
                })
                return {"real": "result"}

            with redirect_stdout(output):
                self.assertEqual(ledger.verify("real operation", check), {"real": "result"})
            self.assertEqual(json.loads(path.read_text()), {
                "activeVerification": None,
                "verificationLedger": [{"name": "real operation", "status": "passed"}],
            })
            self.assertIn("phase-start] real operation", output.getvalue())
            self.assertIn("phase-passed] real operation", output.getvalue())
            self.assertFalse(path.with_name(path.name + ".tmp").exists())

    def test_failure_and_dependencies_remain_failed_and_skipped(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "proof.partial.json"
            ledger = BrowserVerificationLedger(checkpoint_path=path)

            def fail():
                raise TimeoutError("actual evaluate deadline")

            with patch("builtins.print") as printed:
                self.assertIsNone(ledger.verify("source", fail))
                self.assertIsNone(ledger.verify(
                    "dependent", lambda: self.fail("must not execute"),
                    depends_on=("source",),
                ))
            self.assertTrue(all(call.kwargs.get("flush") for call in printed.call_args_list))
            partial = json.loads(path.read_text())
            self.assertIsNone(partial["activeVerification"])
            self.assertEqual(partial["verificationLedger"], ledger.evidence())
            self.assertEqual(ledger.evidence(), [
                {"name": "source", "status": "failed", "errorType": "TimeoutError",
                 "message": "actual evaluate deadline"},
                {"name": "dependent", "status": "skipped", "blockedBy": ["source"]},
            ])
            with self.assertRaisesRegex(AssertionError, "FAILED source"):
                ledger.assert_success(expected_names=("source", "dependent"))


class FlightGeoXrCityDisposalAuditTest(unittest.TestCase):
    def observe(self, value):
        class TeardownPage:
            def evaluate(self, expression):
                return value

            def wait_for_timeout(self, delay):
                pass

        with patch(
            "lib.game_flight_sim_smoke_city_regional_poi.time.monotonic",
            side_effect=(0, 0, 31),
        ):
            return require_city_regional_poi_teardown_contract(TeardownPage())

    def test_accepts_absent_source_layers_and_evidence(self) -> None:
        observed = {
            "expectedLayerCount": 5, "sourcePresent": False,
            "presentLayerIds": [], "presentEvidenceKeys": [],
        }
        self.assertEqual(self.observe(observed), observed)

    def test_rejects_present_unsettled_nonempty_or_missing_owned_data(self) -> None:
        absent = {
            "expectedLayerCount": 5, "sourcePresent": False,
            "presentLayerIds": [], "presentEvidenceKeys": [],
        }
        for mutation in (
            {"sourcePresent": True, "features": 0, "loaded": True},
            {"sourcePresent": True, "features": 0, "loaded": False},
            {"sourcePresent": True, "features": 1, "loaded": True},
            {"presentLayerIds": ["surviving-owned-layer"]},
            {"presentEvidenceKeys": ["surviving-owned-evidence"]},
            {"expectedLayerCount": 0},
        ):
            with self.subTest(mutation=mutation):
                with self.assertRaisesRegex(AssertionError, "survived teardown"):
                    self.observe({**absent, **mutation})
        with self.assertRaisesRegex(AssertionError, "survived teardown"):
            self.observe({})


class FlightAuthoredGeoSceneTest(unittest.TestCase):
    def view(self):
        return {
            **{key: True for key in ("flightActive", "hudVisible", "geospatialEnabled",
                "geospatialPreferenceEnabled", "rendererPointerTransparent", "rendererSurfaceVisible",
                "flightLayersReady", "flightLayersTopmost", "aircraftImagesReady", "environmentLayersReady",
                "selectedEnvironmentSubjectsExact", "environmentSourceExactlyMatchesOverlay",
                "routeInViewport", "aircraftInViewport")},
            **{key: 1 for key in ("mapLibreCanvasCount", "visibleMapLibreCanvasCount", "geoXrSurfaceCount",
                "threeCanvasOwnerCount", "threeCanvasActiveCount", "objectiveGuideFeatureCount")},
            "threeCanvasInactiveCount": 0, "viewMode": "3d", "projection": "mercator",
            "styleUrl": "https://fixture.test/style.json", "styleFingerprint": "fixture.test",
            "aircraftLayerType": "symbol", "aircraftGeometryType": "Point", "aircraftImagePixelWidth": 40,
            "environmentId": "tropical-playground", "environmentPresentationBounds": [[103, 1], [104, 2]],
            "environmentSourceFeatures": 3, "environmentPoiIds": [], "renderedEnvironmentPoiIds": [],
            "authoredEnvironmentStage": {"id": "tropical-playground", "resolvedId": "tropical-playground",
                "sizeMeters": [28, 26], "surfaceCount": 3, "poiIds": []},
            "authoredEnvironmentSubjects": [{"id": "xr-subject:house:1"}, {"id": "xr-subject:sailboat:1"}],
            "environmentSubjectIds": ["xr-subject:house:1", "xr-subject:sailboat:1"],
            "renderedEnvironmentSubjectIds": ["xr-subject:sailboat:1"],
            "environmentSurfaceMeters": [{"id": "tropical-playground:footprint", "baseHeightMeters": 0,
                "heightMeters": 0.08, "widthMeters": 28, "depthMeters": 26, "viewportBounded": True}],
            "renderedEnvironmentKinds": ["stage-footprint", "subject"], "flightSourceFeatures": 9,
            "renderedKinds": ["aircraft", "objective-guide", "route", "route-point"],
            "routeScreenSpan": {"x": 110, "y": 115}, "pitch": 45, "mapPointerHit": {"x": 200, "y": 300},
        }

    def requirements(self, view, **options):
        return unmet_view_requirements(view, expected_provider_host="fixture.test", expected_view="3d",
            expected_projection="mercator", expected_style_url="https://fixture.test/style.json",
            require_visual_layout=False, **options)

    def test_current_authored_nonregional_scene_passes_without_regional_assets(self):
        self.assertEqual(self.requirements(self.view()), [])
        self.assertIn("environment.regionalId", self.requirements(self.view(), require_regional_scene=True))

    def test_wrong_authored_identity_dimensions_sources_and_viewport_fail(self):
        for mutation, expected in (
            ({"environmentId": "singapore"}, "environmentId"),
            ({"authoredEnvironmentStage": {}}, "environmentId"),
            ({"environmentPresentationBounds": [[104, 2], [103, 1]]}, "environmentPresentationBounds"),
            ({"environmentSourceFeatures": 2}, "environmentSourceFeatures"),
            ({"environmentSubjectIds": ["unrelated"]}, "environment.authoredSubjectIds"),
            ({"renderedEnvironmentSubjectIds": ["vehicle-unrelated"]}, "renderedEnvironmentSubjectIds"),
            ({"renderedEnvironmentSubjectIds": []}, "renderedEnvironmentSubjectIds"),
            ({"environmentPoiIds": ["invented-poi"]}, "environment.authoredPoiIds"),
            ({"renderedEnvironmentPoiIds": ["invented-poi"]}, "environment.renderedAuthoredPoiSubset"),
            ({"selectedEnvironmentSubjectsExact": False}, "environment.selectedSubjectsDirectMeters"),
            ({"environmentSourceExactlyMatchesOverlay": False}, "environment.sourcePassThrough"),
        ):
            with self.subTest(mutation=mutation):
                self.assertIn(expected, self.requirements({**self.view(), **mutation}))
        for mutation in ({"widthMeters": 32}, {"heightMeters": 1}, {"viewportBounded": False}):
            view = self.view(); view["environmentSurfaceMeters"][0].update(mutation)
            self.assertIn("environment.stageFootprintAuthoredMeters", self.requirements(view))

    def test_explicit_regional_case_keeps_bounds_stage_and_real_poi_dimensions(self):
        view = self.view()
        view.update(environmentId="singapore", environmentPresentationBounds=[[103.605, 1.158], [104.09, 1.48]],
            environmentSourceFeatures=12, environmentPoiIds=["marina-bay-sands"], renderedEnvironmentPoiIds=[])
        view["environmentSurfaceMeters"] = [
            {"id": "singapore:footprint", "baseHeightMeters": 0, "heightMeters": 0.08,
             "widthMeters": 32, "depthMeters": 24, "viewportBounded": True},
            {"id": "marina-bay-sands:tower-2", "baseHeightMeters": 0, "heightMeters": 193,
             "widthMeters": 71.82, "depthMeters": 76.45},
        ]
        self.assertTrue(all(regional_environment_checks(view).values()))
        for mutation, expected in (
            ({"environmentId": "tropical-playground"}, "environment.regionalId"),
            ({"environmentPresentationBounds": [[103, 1], [104, 2]]}, "environment.regionalPresentationBounds"),
            ({"environmentSourceFeatures": 9}, "environment.regionalSourceFeatures"),
            ({"environmentPoiIds": []}, "environment.majorPoiIds"),
            ({"renderedEnvironmentPoiIds": ["unknown"]}, "environment.renderedMajorPoiSubset"),
        ):
            with self.subTest(mutation=mutation):
                self.assertFalse(regional_environment_checks({**view, **mutation})[expected])
        for index, expected in ((0, "environment.regionalStageFootprintAuthoredMeters"), (1, "environment.majorPoiGeographicMeters")):
            changed = deepcopy(view); changed["environmentSurfaceMeters"][index]["heightMeters"] += 1
            self.assertFalse(regional_environment_checks(changed)[expected])

    def test_native_reader_handles_empty_regional_profile_and_repeated_map_tiles(self):
        source = (SCRIPTS_ROOT / "lib/game_flight_sim_smoke_geo_xr.py").read_text()
        stage_reader = source.split("          const authoredStage =", 1)[1].split("          const blob =", 1)[0]
        ids_reader = source.split("            renderedEnvironmentSubjectIds:", 1)[1].split("            renderedKinds,", 1)[0]
        observed = JavaScriptEvaluationPage().evaluate("""() => {
            const motionRuntime = {plan: {stageId: 'authored-stage', subjects: []}};
            const sceneLibrary = {resolveXrMotionReferenceStage: () => ({
                id: 'authored-stage', sizeMeters: [7, 5], regionalPoiProfile: {surfaces: []},
                structures: [{kind: 'poi', poiId: 'excluded-local-poi'}, {kind: 'structure'}]})};
            const renderedEnvironment = ['story:boat', 'story:boat'].map(id => ({
                properties: {kgSurfaceKind: 'subject', kgSurfaceId: id}}));
        """ + "const authoredStage =" + stage_reader + "return {authoredEnvironmentStage, renderedEnvironmentSubjectIds:" + ids_reader + "};}")
        self.assertEqual(observed["authoredEnvironmentStage"]["surfaceCount"], 2)
        self.assertEqual(observed["authoredEnvironmentStage"]["poiIds"], [])
        self.assertEqual(observed["renderedEnvironmentSubjectIds"], ["story:boat"])

    def test_regional_wait_rejects_a_valid_generic_scene_without_changing_deadline(self):
        class Page:
            def wait_for_timeout(self, delay):
                self.delay = delay
        page = Page()
        options = dict(read_view=lambda _: self.view(), expected_provider_host="fixture.test", expected_view="3d",
            expected_projection="mercator", expected_style_url="https://fixture.test/style.json")
        self.assertEqual(wait_for_view(page, **options), self.view())
        with patch("lib.game_flight_sim_smoke_geo_xr_requirements.time.monotonic", side_effect=(0, 0, 31)):
            with self.assertRaisesRegex(AssertionError, "environment.regionalId"):
                wait_for_view(page, **options, require_regional_scene=True)
        self.assertEqual(page.delay, 100)


if __name__ == "__main__":
    unittest.main()
