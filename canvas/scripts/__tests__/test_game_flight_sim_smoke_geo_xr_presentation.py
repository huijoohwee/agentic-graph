from __future__ import annotations

import io
from copy import deepcopy
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import Mock, patch

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_ROOT))

from lib.game_flight_sim_smoke_city_regional_poi import (  # noqa: E402
    require_city_regional_poi_teardown_contract,
)
from lib.game_flight_sim_smoke_bootstrap import BoundedEvaluationPage  # noqa: E402
from lib.game_flight_sim_smoke_camera import _timeline_camera_probe  # noqa: E402
from lib.game_flight_sim_smoke_geo_xr_ui import activate_geo_xr_from_toolbar  # noqa: E402
from lib.game_flight_sim_smoke_mobile_surface import (  # noqa: E402
    _close_mobile_touch_occluders, _wait_for_occluder_close,
)
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


class CameraProbePage:
    def __init__(self, *, camera_count=7, fail_setup=False, corrupt_restore=False):
        self.state = {
            "runtime": {"revision": 4, "dirty": False, "playheadSeconds": 1.25,
                "selectedMark": {"kind": "camera", "markId": "authored-0"},
                "plan": {"stageId": "authored-stage", "durationSeconds": 20,
                    "cast": [{"actorId": "story:first"}, {"actorId": "story:second"}],
                    "camera": [{"id": f"authored-{index}", "timeSeconds": index * 2,
                        "settings": {"note": f"authored note {index}"}} for index in range(camera_count)]}},
            "store": {"markdownDocumentName": "authored.md", "timelineTransportDocumentKey": "prior-key",
                "timelineTransportPosition": 0.25, "timelineTransportPlaying": False,
                "timelineTransportPlaybackRate": 2},
            "removed": [], "restored": 0, "created": 0,
        }
        self.fail_setup = fail_setup
        self.corrupt_restore = corrupt_restore

    def evaluate(self, expression, arg=None):
        result = JavaScriptEvaluationPage().evaluate("""async input => {
            const state = input.state;
            const copy = value => JSON.parse(JSON.stringify(value));
            const nativeStore = {...state.store, setTimelineTransportState(value) {
                for (const [key, item] of Object.entries(value)) {
                    state.store['timelineTransport' + key[0].toUpperCase() + key.slice(1)] = item;
                }
            }};
            const modules = {
                graphStore: {useGraphStore: {getState: () => ({...nativeStore, ...state.store})}},
                xrMotionReferenceTimeline: {xrMotionReferenceTimelineDocumentKey: name => 'xr:' + name},
                xrCameraPlaybackControlsRuntime: {requestXrMotionReferenceCameraPlaybackReapply() {}},
                xrMotionReferenceRuntime: {
                    readXrMotionReferenceRuntime: () => copy(state.runtime),
                    removeXrMotionReferenceCameraMark(id) {
                        state.removed.push(id);
                        state.runtime.plan.camera = state.runtime.plan.camera.filter(mark => mark.id !== id);
                        state.runtime.dirty = true;
                    },
                    setXrMotionReferenceCameraMark(mark) {
                        state.runtime.plan.camera.push({...mark, id: 'probe-' + state.created++});
                        if (input.failSetup) throw new Error('partial setup failure');
                    },
                    setXrMotionReferencePlayhead(time) { state.runtime.playheadSeconds = time; },
                    restoreXrMotionReferenceRuntimeSnapshot(previous) {
                        state.runtime = {...copy(previous), revision: previous.revision + 9};
                        state.restored++;
                        if (input.corruptRestore) state.runtime.plan.camera[0].settings.note = 'corrupted';
                    },
                },
            };
            globalThis.window = {__kgFlightSimBrowserProof: {importModule: async name => modules[name]}};
            try { return {value: await globalThis.eval('(' + input.expression + ')')(input.argument), state}; }
            catch (error) { return {error: error.message, state}; }
        }""", {"expression": expression, "argument": arg, "state": self.state,
            "failSetup": self.fail_setup, "corruptRestore": self.corrupt_restore})
        self.state = result["state"]
        if result.get("error"):
            raise RuntimeError(result["error"])
        return result.get("value")


class FlightAuthoredCameraProbeTest(unittest.TestCase):
    def assert_restored(self, page, before):
        runtime = {key: value for key, value in page.state["runtime"].items() if key != "revision"}
        self.assertEqual(runtime, {key: value for key, value in before["runtime"].items() if key != "revision"})
        self.assertEqual(page.state["store"], before["store"])
        self.assertEqual(page.state["restored"], 1)

    def test_probe_replaces_only_temporary_camera_set_and_restores_authored_state(self):
        for camera_count in (0, 7):
            with self.subTest(camera_count=camera_count):
                page = CameraProbePage(camera_count=camera_count)
                before = deepcopy(page.state)
                with _timeline_camera_probe(page) as probe:
                    self.assertEqual(probe["cameraMarks"], 2)
                    self.assertEqual(page.state["removed"], [mark["id"] for mark in before["runtime"]["plan"]["camera"]])
                    self.assertEqual(page.state["store"]["timelineTransportPlaying"], True)
                    self.assertEqual(page.state["runtime"]["plan"]["stageId"], "authored-stage")
                self.assert_restored(page, before)
                self.assertEqual(probe["cleanedUp"]["runtime"]["plan"], before["runtime"]["plan"])

    def test_partial_setup_and_later_proof_failures_both_restore_the_prior_scene(self):
        for fail_setup in (True, False):
            with self.subTest(fail_setup=fail_setup):
                page = CameraProbePage(fail_setup=fail_setup)
                before = deepcopy(page.state)
                with self.assertRaisesRegex(RuntimeError, "partial setup failure|later proof failure"):
                    with _timeline_camera_probe(page):
                        raise RuntimeError("later proof failure")
                self.assert_restored(page, before)

    def test_cleanup_rejects_a_changed_authored_camera_setting(self):
        page = CameraProbePage(corrupt_restore=True)
        with self.assertRaisesRegex(AssertionError, "state was not restored"):
            with _timeline_camera_probe(page):
                pass


class MobileOwnerPage:
    def __init__(self, owners):
        self.owners = list(owners)
        self.closed = []
        self.graph = {"floatingPanelOpen": "floating-panel" in owners,
            "timelineEnabled": any(item in owners for item in ("timeline-panel", "bottom-surface")),
            "bottomSurfaceCollapsed": "bottom-surface" not in owners}

    def read(self):
        return {"ownerKind": self.owners[0] if self.owners else None, "graphState": self.graph.copy(),
            "controlPresent": True, "controlEnabled": True, "controlOwnsPoint": not self.owners,
            "runtime": {"active": True, "runId": 7}}

    def wait_for_timeout(self, delay):
        raise AssertionError("a successful native close should already be observable")

    def locator(self, selector):
        if 'data-kg-strybldr-bottom-timeline-panel' in selector:
            candidates = ["timeline-panel"]
        elif 'data-kg-floating-panel-root' in selector:
            candidates = ["floating-panel", "timeline-panel"]
        else:
            candidates = []
        return MobileOwnerLocator(self, candidates)


class MobileOwnerLocator:
    def __init__(self, page, candidates):
        self.page, self.candidates = page, candidates

    @property
    def first(self):
        return MobileOwnerLocator(self.page, self.candidates[:1])

    def filter(self, **options):
        return MobileOwnerLocator(self.page, [item for item in self.candidates if item == "floating-panel"])

    def locator(self, selector):
        if selector != 'button[title="Close"]':
            raise AssertionError(selector)
        return self

    def count(self):
        return len(self.candidates)

    def is_visible(self):
        return True

    def click(self, **options):
        actual = self.page.owners[0]
        expected = "timeline-panel" if actual == "bottom-surface" else actual
        if self.candidates != [expected]:
            raise AssertionError(f"closed another owner: {self.candidates}, top={actual}")
        self.page.closed.append(actual)
        if actual == "bottom-surface":
            self.page.graph["bottomSurfaceCollapsed"] = True
            self.page.owners[0] = "timeline-panel"
        else:
            self.page.graph["timelineEnabled" if actual == "timeline-panel" else "floatingPanelOpen"] = False
            self.page.owners.pop(0)


class FlightMobileOwnerTest(unittest.TestCase):
    def test_each_shared_root_closes_the_hit_tested_owner_in_either_stacking_order(self):
        for owners in (("timeline-panel", "floating-panel"), ("floating-panel", "timeline-panel"),
                ("bottom-surface", "floating-panel")):
            with self.subTest(owners=owners):
                page = MobileOwnerPage(owners)
                with patch("lib.game_flight_sim_smoke_mobile_surface._read_pitch_touch_surface", side_effect=lambda _: page.read()):
                    result = _close_mobile_touch_occluders(page)
                expected = ["bottom-surface", "timeline-panel", "floating-panel"] if owners[0] == "bottom-surface" else list(owners)
                self.assertEqual(page.closed, expected)
                self.assertTrue(result["final"]["controlOwnsPoint"])
                self.assertEqual(result["final"]["runtime"]["runId"], 7)

    def test_timeline_close_requires_its_own_state_even_when_tool_panel_is_closed(self):
        page = MobileOwnerPage(())
        page.graph["timelineEnabled"] = True
        page.wait_for_timeout = lambda delay: None
        with patch("lib.game_flight_sim_smoke_mobile_surface._read_pitch_touch_surface", side_effect=lambda _: page.read()):
            with patch("lib.game_flight_sim_smoke_mobile_surface.time.monotonic", side_effect=(0, 0, 6)):
                with self.assertRaisesRegex(AssertionError, "occluder did not close"):
                    _wait_for_occluder_close(page, "timeline-panel", 7)

    def test_native_hit_owner_distinguishes_timeline_content_from_tool_panel(self):
        source = (SCRIPTS_ROOT / "lib/game_flight_sim_smoke_mobile_surface.py").read_text()
        classifier = source.split("          const timelinePanelOwner =", 1)[1].split("          const owner =", 1)[0]
        kind = source.split("            ownerKind:", 1)[1].split("            runtime:", 1)[0].strip().rstrip(',')
        expression = """input => {
            const state = input.state;
            const workspaceOwner = null;
            const floatingPanelOwner = {matches: () => input.timeline, querySelector: () => !input.timeline};
        """ + "const timelinePanelOwner =" + classifier + "return (" + kind + ");}"
        for timeline, collapsed, expected in ((False, False, "floating-panel"), (True, False, "bottom-surface"), (True, True, "timeline-panel")):
            self.assertEqual(JavaScriptEvaluationPage().evaluate(expression,
                {"timeline": timeline, "state": {"bottomSurfaceCollapsed": collapsed, "bottomSurfaceTab": "timeline"}}), expected)


class FlightNativeToolbarTriggerTest(unittest.TestCase):
    def test_proof_resolves_the_real_canvas_view_accessible_trigger(self):
        rendered = subprocess.run(
            ["node", "--import", "tsx", "--input-type=module", "-e", """
                import React from 'react';
                import {renderToStaticMarkup} from 'react-dom/server';
                import {JSDOM} from 'jsdom';
                const {useGraphStore} = await import('./src/hooks/useGraphStore.ts');
                const {Canvas2dRendererSelect} = await import('./src/components/toolbar/Canvas2dRendererSelect.tsx');
                Object.assign(useGraphStore.getInitialState(), {canvasRenderMode: '3d', canvas3dMode: 'xr'});
                const html = renderToStaticMarkup(React.createElement(Canvas2dRendererSelect, {
                    iconSizeClass: 'size-4', iconStrokeWidth: 1, ensureBaselineUnlocked: () => true,
                    geospatialEnabled: true, onOpenGeospatialMode() {}, onActivateGeoXrMode() {}, onExitGeospatialMode() {},
                }));
                const document = new JSDOM(html).window.document;
                console.log(JSON.stringify([...document.querySelectorAll('button')].map(button => ({
                    label: button.getAttribute('aria-label'), popup: button.getAttribute('aria-haspopup'),
                    trigger: button.getAttribute('data-kg-toolbar-dropdown-trigger'),
                }))));
            """], cwd=SCRIPTS_ROOT.parent,
            env={**os.environ, "TSX_TSCONFIG_PATH": str(SCRIPTS_ROOT.parent / "tsconfig.json")},
            capture_output=True, text=True, timeout=10, check=True,
        )
        buttons = json.loads(rendered.stdout)
        page, toolbar = Mock(), Mock()
        page.get_by_role.return_value = toolbar
        toolbar.locator.side_effect = AssertionError("the native trigger has no synthetic data hook")

        def native_button(role, *, name, exact):
            self.assertEqual((role, exact), ("button", True))
            matches = [button for button in buttons if button["label"] == name and button["popup"] == "menu"]
            self.assertEqual(len(matches), 1)
            return matches[0]

        toolbar.get_by_role.side_effect = native_button
        class NativeTriggerReached(Exception):
            pass

        def trusted_click(_page, locator, key):
            if key == "modeTriggerClicked":
                self.assertIn(locator, buttons)
                raise NativeTriggerReached()

        with patch("lib.game_flight_sim_smoke_geo_xr_ui.expect"), patch(
            "lib.game_flight_sim_smoke_geo_xr_ui._click_with_trusted_proof", side_effect=trusted_click,
        ), self.assertRaises(NativeTriggerReached):
            activate_geo_xr_from_toolbar(page)
        page.get_by_role.assert_called_once_with("navigation", name="Main Toolbar", exact=True)


if __name__ == "__main__":
    unittest.main()
