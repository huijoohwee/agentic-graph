from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_ROOT))
from lib.game_flight_sim_smoke_scene import (  # noqa: E402
    LOCAL_AUXILIARY_CANVAS_SELECTORS, read_and_pin_authored_physics_baseline,
)

SOURCE_PATH = SCRIPTS_ROOT.parents[1] / "docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md"
SOURCE_TEXT = SOURCE_PATH.read_text(encoding="utf-8")
SOURCE_SHA256 = hashlib.sha256(SOURCE_TEXT.encode()).hexdigest()

JAVASCRIPT_FIXTURE = r"""
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const { load } = require('js-yaml');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const options = input.options;
const sourceText = input.source;
const meta = load(sourceText.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]);
const original = meta.kgXrMotionReference;
const stageId = original.stageId;
const documentName = 'agentic-graph-ar-vr-xr-runtime-readiness-demo.md';
const persisted = JSON.stringify(original);
const motion = {
  plan: original, dirty: Boolean(options.dirty),
  sourceSignature: JSON.stringify({ persistedValue: persisted }),
};
const names = [
  'agentic_os_graph_xr_stage', 'agentic_os_xr_native_controller_demo',
  'agentic_os_xr_playground_treasure',
  ...(stageId === 'tropical-playground' ? [
    'agentic_os_xr_native_tropical_playground', 'agentic_os_xr_tropical_playground_terrain',
  ] : [`agentic_os_xr_stage_preset_${stageId}`, `agentic_os_xr_native_terrain_${stageId}`]),
];
if (options.duplicateNode) names.push(names[options.duplicateNode - 1]);
if (options.missingNode) names.splice(options.missingNode - 1, 1);
const nodes = names.map(name => ({ name, extras: { terrainId: stageId, stageId } }));
const canvas = (engine = '', owner = null) => ({
  dataset: { engine }, id: '', className: '', width: 300, height: 150,
  parentElement: { outerHTML: '<section>owned preview</section>' },
  getAttribute: () => null,
  closest: selector => selector === owner ? {} : null,
});
const renderer = canvas('three.js r180');
const auxiliary = (options.auxiliaryOwners || []).map(owner => canvas('', owner));
const sibling = options.siblingRenderer ? [canvas('three.js r180')] : [];
const root = { querySelectorAll: () => [renderer, ...(options.rootSibling ? sibling : [])] };
globalThis.document = { querySelectorAll: selector => {
  if (selector === '[data-kg-xr-scene-media-drop="1"]') return options.duplicateRoot ? [root, root] : [root];
  if (selector === 'canvas.maplibregl-canvas') return options.mapLibre ? [canvas()] : [];
  return [renderer, ...auxiliary, ...sibling];
} };
const state = {
  markdownDocumentName: documentName,
  markdownDocumentText: options.sourceDrift ? sourceText + '\nchanged' : sourceText,
  canvasRenderMode: meta.kgCanvasRenderMode,
  // The native xr-v2 startup owner activates xr after applying the authored 3d preset.
  canvas3dMode: options.modeDrift ? '3d' : 'xr',
  graphData: { metadata: {
    source: options.foreignSource ? 'markdown:foreign.md' : `markdown:${documentName}`,
    kgXrMotionReference: options.metadataDrift ? JSON.stringify({ ...original, stageId: 'singapore' }) : persisted,
    canvasWorkspacePreset: { canvasSurfaceMode: options.surfaceDrift ? 'xr' : meta.kgCanvasSurfaceMode },
  } },
  captureThreeGltfSnapshot: async () => ({ text: async () => {
    if (options.driftDuringCapture) state.markdownDocumentText += '\nchanged during capture';
    return JSON.stringify({ nodes });
  } }),
};
const controller = {
  schema: 'agentic-graph-xr-native-controller-demo/v1', phase: 'running',
  mode: 'ball', followCamera: !options.cameraDrift,
  terrainId: options.controllerDrift ? 'singapore' : stageId,
};
const modules = {
  graphStore: { useGraphStore: { getState: () => state } },
  xrPhysicsRuntime: { readXrPhysicsRuntime: () => ({
    phase: 'stopped', world: { schema: 'agentic-graph-xr-physics-world/v1' },
  }) },
  xrNativeControllerDemoRuntime: {
    readXrNativeControllerDemo: () => controller,
    readSharedXrNativeControllerDemoFrame: () => ({ phase: 'running', stepCount: 1, bodies: [{}] }),
  },
  xrNativeControllerCameraRuntime: { readXrNativeControllerCamera: () => ({ mode: 'fixed-follow' }) },
  xrNativeControllerCameraCatalog: {
    XR_NATIVE_CONTROLLER_CAMERA_MODES: ['fixed-follow', 'free-orbit'],
    XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE: 'fixed-follow',
  },
  xrMotionReferenceRuntime: { readXrMotionReferenceRuntime: () => motion },
  xrSceneLibrary: { resolveXrMotionReferenceStage: id => ({ id }) },
};
globalThis.window = { __kgFlightSimBrowserProof: { importModule: async key => {
  if (!modules[key]) throw Error('unexpected module ' + key);
  return modules[key];
} } };
const value = await globalThis.eval('(' + input.expression + ')')(input.arg);
console.log(JSON.stringify({ value, pinned: Boolean(window.__kgFlightSimCanvas) }));
"""


class SceneFixturePage:
    def __init__(self, **options):
        self.options = options
        self.pinned = False

    def evaluate(self, expression, arg=None):
        completed = subprocess.run(
            ["node", "--input-type=module", "-e", JAVASCRIPT_FIXTURE],
            input=json.dumps({"expression": expression, "arg": arg,
                              "source": SOURCE_TEXT, "options": self.options}),
            text=True, capture_output=True, timeout=3, check=False,
        )
        if completed.returncode:
            raise AssertionError(completed.stderr)
        result = json.loads(completed.stdout)
        self.pinned = result["pinned"]
        return result["value"]


class AuthoredPhysicsBaselineTest(unittest.TestCase):
    def test_current_authored_stage_and_modes_pin_exactly_one_owner(self):
        page = SceneFixturePage()
        value = read_and_pin_authored_physics_baseline(page, SOURCE_SHA256)
        self.assertTrue(value["ready"])
        self.assertTrue(page.pinned)
        self.assertTrue(value["sourceBound"])
        self.assertEqual(value["sourceSha256"], SOURCE_SHA256)
        self.assertEqual(value["declaredStageId"], "tropical-playground")
        self.assertEqual(value["surfaceMode"], "3d")
        self.assertEqual(value["canvas3dMode"], "xr")
        self.assertEqual(value["declaredModes"], {"render": "3d", "canvas3d": "3d", "surface": "3d"})
        self.assertEqual(value["requiredNodeNames"], value["expectedNodeNames"])
        self.assertEqual(len(value["expectedNodeNames"]), 5)
        self.assertEqual(value["physics"]["phase"], "stopped")

    def test_duplicate_missing_nodes_and_sibling_renderers_cannot_pin(self):
        for options in (
            *({"duplicateNode": index} for index in range(1, 6)),
            *({"missingNode": index} for index in range(1, 6)),
            {"siblingRenderer": True}, {"siblingRenderer": True, "rootSibling": True},
            {"duplicateRoot": True}, {"mapLibre": True},
        ):
            with self.subTest(options=options):
                page = SceneFixturePage(**options)
                self.assertFalse(read_and_pin_authored_physics_baseline(page, SOURCE_SHA256)["ready"])
                self.assertFalse(page.pinned)

    def test_unauthored_source_metadata_modes_or_controller_are_rejected(self):
        for key in (
            "foreignSource", "sourceDrift", "metadataDrift", "modeDrift",
            "surfaceDrift", "controllerDrift", "cameraDrift", "dirty", "driftDuringCapture",
        ):
            with self.subTest(key=key):
                page = SceneFixturePage(**{key: True})
                self.assertFalse(read_and_pin_authored_physics_baseline(page, SOURCE_SHA256)["ready"])
                self.assertFalse(page.pinned)

    def test_known_native_local_preview_owners_are_attributed(self):
        page = SceneFixturePage(auxiliaryOwners=list(LOCAL_AUXILIARY_CANVAS_SELECTORS))
        value = read_and_pin_authored_physics_baseline(page, SOURCE_SHA256)
        self.assertTrue(value["ready"])
        self.assertTrue(value["auxiliaryCanvasesLocalOnly"])
        self.assertEqual([owner["owner"] for owner in value["auxiliaryCanvasOwners"]],
                         list(LOCAL_AUXILIARY_CANVAS_SELECTORS))

    def test_unknown_canvas_remains_fail_closed_with_diagnostics(self):
        page = SceneFixturePage(auxiliaryOwners=[None])
        value = read_and_pin_authored_physics_baseline(page, SOURCE_SHA256)
        self.assertFalse(value["ready"])
        self.assertFalse(value["auxiliaryCanvasesLocalOnly"])
        self.assertIsNone(value["auxiliaryCanvasOwners"][0]["owner"])
        self.assertFalse(page.pinned)


if __name__ == "__main__":
    unittest.main()
