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
from lib.game_flight_sim_smoke_geo_xr_layout import read_geo_xr_layout_occlusion  # noqa: E402
from lib.game_flight_sim_smoke_web_mcp import verify_flight_web_mcp, verify_flight_exit  # noqa: E402

SOURCE_PATH = SCRIPTS_ROOT.parents[1] / "docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md"
SOURCE_TEXT = SOURCE_PATH.read_text(encoding="utf-8")
SOURCE_SHA256 = hashlib.sha256(SOURCE_TEXT.encode()).hexdigest()

JAVASCRIPT_FIXTURE = r"""
import fs from 'node:fs';
import { tryParseMarkdownFrontmatterFlowGraph } from './src/features/parsers/markdownFrontmatterFlowGraph.ts';
import { resolveXrMotionReferencePersistedValue } from './src/features/three/xrMotionReferencePersistedValue.ts';
import { readXrMotionReferencePlan, serializeXrMotionReferencePlan, xrMotionReferenceSceneKey } from './src/features/three/xrMotionReferenceModel.ts';
import { hydrateXrMotionReferenceRuntime } from './src/features/three/xrMotionReferenceRuntime.ts';
import { resolveXrMotionReferenceStage } from './src/features/three/xrSceneLibrary.ts';
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const options = input.options;
const sourceText = input.source;
const documentName = 'agentic-graph-ar-vr-xr-runtime-readiness-demo.md';
const graphData = tryParseMarkdownFrontmatterFlowGraph(documentName, sourceText)?.graphData;
if (!graphData) throw Error('actual authored seed must parse through native graph owner');
const meta = graphData.metadata.frontmatterMeta;
const persisted = resolveXrMotionReferencePersistedValue(graphData.metadata);
const original = readXrMotionReferencePlan(persisted, graphData.nodes);
const stageId = serializeXrMotionReferencePlan(original).stageId;
graphData.metadata.source = `markdown:${documentName}`;
const nativeMotion = hydrateXrMotionReferenceRuntime({
  sceneKey: xrMotionReferenceSceneKey(documentName, graphData), nodes: graphData.nodes, persistedValue: persisted,
});
const motion = { ...nativeMotion, dirty: Boolean(options.dirty) };
if (options.topLevelPersisted) graphData.metadata.kgXrMotionReference = persisted;
if (options.metadataDrift) graphData.metadata.frontmatterMeta.kgXrMotionReference = { ...persisted, stageId: 'singapore' };
if (options.shadowMetadata) graphData.metadata.kgXrMotionReference = { ...persisted, stageId: 'singapore' };
if (options.malformedEnvelope) graphData.metadata.kgXrMotionReference = { plan: persisted };
if (options.missingPersisted) delete graphData.metadata.frontmatterMeta.kgXrMotionReference;
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
  graphData: { ...graphData, metadata: { ...graphData.metadata,
    source: options.foreignSource ? 'markdown:foreign.md' : `markdown:${documentName}`,
    canvasWorkspacePreset: { canvasSurfaceMode: options.surfaceDrift ? 'xr' : meta.kgCanvasSurfaceMode },
  } },
  captureThreeGltfSnapshot: async () => ({ text: async () => {
    if (options.driftDuringCapture) state.markdownDocumentText += '\nchanged during capture';
    if (options.metadataDuringCapture) state.graphData.metadata.frontmatterMeta.kgXrMotionReference = { ...persisted, stageId: 'singapore' };
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
  xrSceneLibrary: { resolveXrMotionReferenceStage },
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
            ["node", "--import", "tsx", "--input-type=module", "-e", JAVASCRIPT_FIXTURE],
            input=json.dumps({"expression": expression, "arg": arg,
                              "source": SOURCE_TEXT, "options": self.options}),
            text=True, capture_output=True, timeout=8, check=False,
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
        self.assertEqual(value["persistedLocation"], "metadata.frontmatterMeta")
        self.assertEqual(value["persistedSchema"], "agentic-graph-xr-motion-reference/v1")
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
            "shadowMetadata", "missingPersisted", "malformedEnvelope", "metadataDuringCapture",
        ):
            with self.subTest(key=key):
                page = SceneFixturePage(**{key: True})
                value = read_and_pin_authored_physics_baseline(page, SOURCE_SHA256)
                self.assertIs(value["ready"], False)
                if key in ("metadataDrift", "shadowMetadata", "missingPersisted", "malformedEnvelope"):
                    self.assertIs(value["sourceBound"], False)
                self.assertFalse(page.pinned)

    def test_native_top_level_persisted_value_compatibility_preserves_precedence(self):
        page = SceneFixturePage(topLevelPersisted=True)
        value = read_and_pin_authored_physics_baseline(page, SOURCE_SHA256)
        self.assertIs(value["ready"], True)
        self.assertIs(value["sourceBound"], True)
        self.assertEqual(value["persistedLocation"], "metadata")

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


class MapPointerFixturePage:
    def __init__(self, mode="gap"):
        self.mode = mode
        self.hits = []

    def evaluate(self, expression):
        completed = subprocess.run(
            ["node", "--input-type=module", "-e", r"""
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const dom = new JSDOM('<body></body>');
const {document} = dom.window;
const add = (tag, attrs, x, y, width, height, parent = document.body) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.style.pointerEvents = 'auto'; parent.append(node);
  node.getBoundingClientRect = () => ({left:x, top:y, right:x+width,
    bottom:y+height, width, height});
  return node;
};
const canvas = add('canvas', {class:'maplibregl-canvas'}, 0, 0, 1100, 962);
const source = add('section', {'data-kg-workspace-visible-viewport-occluder':'left',
  'aria-label':'Source Files content'}, 0, 0, 550, 962);
const panel = add('aside', {'data-kg-floating-panel-root':'true'}, 746.40625, 8, 345.59375, 946);
add('nav', {'aria-label':'Floating panel'}, 0, 0, 0, 0, panel);
const timeline = add('aside', {'data-kg-strybldr-bottom-timeline-panel':'1'}, 562, 617.3047, 526, 336.6953);
const hud = add('section', {'data-kg-flight-sim-hud':'1'}, 0, 0, 1100, 962);
hud.style.pointerEvents = 'none';
const navigation = add('aside', {class:'pointer-events-auto'}, 574.40625, 144, 160, 382, hud);
const resize = add('hr', {}, 546, 0, 8, 962);
const foreign = add('div', {}, 0, 0, 1100, 962);
const blockers = [source, panel, timeline, navigation, resize];
if (input.mode === 'covered') {
  navigation.getBoundingClientRect = hud.getBoundingClientRect;
}
const hits = [];
document.elementFromPoint = (x, y) => {
  if (hits.length >= 64) throw Error('pointer probe exceeded 64 hit tests');
  const hit = input.mode === 'foreign' ? foreign : blockers.find(node => {
    const r = node.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }) || canvas;
  hits.push({x, y, map:hit === canvas}); return hit;
};
globalThis.document = document; globalThis.window = dom.window;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
Object.assign(window, {innerWidth:1100, innerHeight:962});
const map = {project: p => ({x:p[0], y:p[1]})};
const modules = {
  graphStore:{useGraphStore:{getState:()=>({floatingPanelView:'geo'})}},
  gympgrphStore:{readActiveMapLibreMap:()=>map, useGympgrphStore:{getState:()=>({geospatialViewMode:'2d'})},
    readFlightGeoOverlay:()=>({aircraft:{coordinate:[648,481]}, route:[{coordinate:[648,481]},{coordinate:[660,490]}]})},
};
window.__kgFlightSimBrowserProof = {importModule: async key => modules[key]};
const value = await globalThis.eval('(' + input.expression + ')')();
console.log(JSON.stringify({value, hits}));
            """], input=json.dumps({"expression": expression, "mode": self.mode}),
            cwd=SCRIPTS_ROOT.parent, text=True, capture_output=True, timeout=3, check=False,
        )
        if completed.returncode:
            raise AssertionError(completed.stderr)
        result = json.loads(completed.stdout)
        self.hits = result["hits"]
        return result["value"]


class MapPointerApertureTest(unittest.TestCase):
    def test_recorded_panels_and_hud_leave_a_native_map_hit(self):
        page = MapPointerFixturePage()
        value = read_geo_xr_layout_occlusion(page)
        self.assertIsNotNone(value["mapPointerHit"])
        self.assertTrue(page.hits[-1]["map"])
        self.assertLessEqual(len(page.hits), 64)
        self.assertEqual([item["kind"] for item in value["occluders"]], ["source-files", "floating-panel"])
        self.assertTrue(value["aircraftUnoccluded"] and value["routeUnoccluded"])

    def test_full_occlusion_and_foreign_hit_targets_fail_closed(self):
        for mode in ("covered", "foreign"):
            with self.subTest(mode=mode):
                page = MapPointerFixturePage(mode)
                self.assertIsNone(read_geo_xr_layout_occlusion(page)["mapPointerHit"])
                self.assertFalse(any(hit["map"] for hit in page.hits))
                self.assertLessEqual(len(page.hits), 64)


class WebMcpRegistryFixturePage:
    def __init__(self, mode="native"):
        self.mode = mode

    def evaluate(self, expression, arg):
        return self.run_js(expression, arg, r"""
import fs from 'node:fs';
import { createWebMcpToolRegistry, WebMcpToolInputValidationError } from './src/features/agent-ready/webMcpToolRegistry.ts';
import { buildAgenticGraphAgentReadyToolContracts } from './src/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs';
import * as webMcp from './src/features/agent-ready/flightSimWebMcpTools.ts';
import * as nativeMcp from './src/features/game-flight-sim/flightSimMcpRuntime.ts';
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const contracts = buildAgenticGraphAgentReadyToolContracts({ includeBrowserOnlyTools: true });
let revision = 0, elapsedOffset = 0;
const now = performance.now.bind(performance);
Object.defineProperty(performance, 'now', { value: () => now() + elapsedOffset });
const inspect = () => ({ ...nativeMcp.inspectLocalFlightSim(), fixtureRevision: revision });
const builders = webMcp.buildFlightSimWebMcpToolBuilders(
  name => contracts.find(contract => contract.name === name),
  { inspect: () => { const snapshot = inspect(); return {
    ...snapshot, flightSim: { ...snapshot.flightSim, active: true, phase: 'ready' },
  }; } },
);
const registry = createWebMcpToolRegistry(Object.values(builders).map(build => build()));
const tools = registry.tools.map(tool => ({ ...tool, execute: async value => {
  const mixed = value?.invocation && value?.operation;
  if (input.mode === 'other-diagnostic' && value?.invocation === '@canvas #flight operation=start') {
    throw new WebMcpToolInputValidationError(tool.name, 'unexpected schema rejection', []);
  }
  if (mixed && input.mode === 'accepted') return { ok: true };
  try { return await tool.execute(value); } catch (error) {
    if (!mixed) throw error;
    if (input.mode === 'wrong-error') throw new Error('unexpected rejection');
    if (input.mode === 'wrong-tool') throw new WebMcpToolInputValidationError('foreign.tool', error.message, []);
    if (input.mode === 'state-change') revision += 1;
    if (input.mode === 'slow-rejection') elapsedOffset += 2001;
    throw error;
  }
} }));
Object.defineProperty(globalThis, 'navigator', { value: { modelContext: { tools } }, configurable: true });
globalThis.window = { __kgFlightSimBrowserProof: { importModule: async key => {
  if (key === 'flightSimMcpRuntime') return { ...nativeMcp, inspectLocalFlightSim: inspect };
  if (key === 'flightSimWebMcpTools') return webMcp;
  throw Error('unexpected module ' + key);
} } };
console.log(JSON.stringify(await globalThis.eval('(' + input.expression + ')')(input.arg)));
        """)

    def run_js(self, expression, arg, script):
        completed = subprocess.run(
            ["node", "--import", "tsx", "--import", "./scripts/source-authority-test-bootstrap.mjs",
             "--input-type=module", "-e", script],
            input=json.dumps({"expression": expression, "arg": arg, "mode": self.mode}),
            cwd=SCRIPTS_ROOT.parent, text=True, capture_output=True, timeout=10, check=False,
        )
        if completed.returncode:
            raise RuntimeError(completed.stderr)
        return json.loads(completed.stdout)


class FlightWebMcpRegistryTest(unittest.TestCase):
    def test_actual_registry_rejects_mixed_fields_and_retains_all_native_diagnostics(self):
        evidence = verify_flight_web_mcp(WebMcpRegistryFixturePage(), {"phase": "ready"})
        self.assertEqual(len(evidence["diagnostics"]), 15)
        mixed = next(item for item in evidence["diagnostics"] if item["operation"] == "mixed-native-structured")
        self.assertEqual(mixed["schemaRejection"], {
            "name": "WebMcpToolInputValidationError",
            "toolName": "agentic-graph.control_local_flight_sim",
        })
        self.assertTrue(mixed["stateUnchanged"] and mixed["withinDeadline"])
        self.assertEqual(len(evidence["timeoutDiagnostics"]), 2)
        self.assertEqual(len(evidence["calls"]), 18)

    def test_acceptance_wrong_errors_state_mutation_and_late_rejection_fail(self):
        for mode in ("accepted", "wrong-error", "wrong-tool", "state-change", "slow-rejection", "other-diagnostic"):
            with self.subTest(mode=mode), self.assertRaises((AssertionError, RuntimeError)):
                verify_flight_web_mcp(WebMcpRegistryFixturePage(mode), {"phase": "ready"})


class FlightExitFixturePage(WebMcpRegistryFixturePage):
    def __init__(self, mode="closed"):
        self.mode, self.prior = mode, {}

    def evaluate(self, expression):
        result = self.run_js(expression, None, r"""
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initJsdomHarness } from './src/tests/lib/jsdomHarness.ts';
import { closeWorkspaceView } from './src/features/workspace-table/workspaceTableSsot.ts';
const modules = {};
for (const [folder, names] of Object.entries({ 'game-flight-sim': ['flightSimRuntime', 'flightSimMcpRuntime'],
  three: ['xrNativeControllerDemoRuntime', 'xrPhysicsRuntime', 'xrNativeControllerCameraRuntime'],
  'agent-ready': ['webMcpRuntime'] })) {
  for (const name of names) modules[name] = await import(`./src/features/${folder}/${name}.ts`);
}
modules.graphStore = await import('./src/hooks/useGraphStore.ts');
modules.gympgrphStore = await import('gympgrph');
const { flightSimRuntime: runtime, xrNativeControllerDemoRuntime: controller, xrPhysicsRuntime: physics,
  graphStore: store, webMcpRuntime: discovery } = modules;
const { expression, mode } = JSON.parse(fs.readFileSync(0, 'utf8'));
const auxiliaries = mode.startsWith('aux-');
const text = fs.readFileSync('../docs/workspace-seeds/agentic-graph-game-flight-sim-demo.md', 'utf8');
const name = '/imports/training.md';
store.useGraphStore.setState({ markdownDocumentName: name, markdownDocumentText: text,
  sourceFiles: [{ id: 'training', name, text, enabled: true, status: 'parsed', parsedGraphRevision: 1,
    source: { kind: 'local', path: name } }], workspaceViewMode: 'canvas', canvasRenderMode: '3d',
  canvas3dMode: '3d', floatingPanelOpen: auxiliaries, floatingPanelView: auxiliaries ? 'motionControl' : 'propsPanel',
  floatingPanelMinimized: mode === 'aux-minimized', workspaceCanvasPaneOpen: auxiliaries,
  ...(auxiliaries ? { workspaceViewMode: 'editor' } : {}), timelineTransportPlaying: false });
controller.setSharedXrNativeControllerDemoTerrain('tropical-playground');
controller.selectXrNativeControllerDemoMode('ball');
controller.developAndRunXrNativeControllerDemo();
physics.pauseXrPhysicsRuntime();
const prior = { ...store.useGraphStore.getState(), physics: physics.readXrPhysicsRuntime(),
  controller: controller.readXrNativeControllerDemo(), controllerFrame: controller.readSharedXrNativeControllerDemoFrame(),
  geospatialModeEnabled: false, mapLibreActive: false, timelinePlaying: false,
  canvasCount: 1, rendererCanvasCount: 1, auxiliaryCanvasCount: 0, rootCount: 1 };
assert.equal((await runtime.openFlightSimSurface({ openPanel: false, webglSupported: true,
  workspace: { readFileText: async () => null } })).active, true);
controller.setSharedXrNativeControllerDemoTerrain('singapore');
controller.selectXrNativeControllerDemoMode('rocket');
controller.pauseXrNativeControllerDemo();
const { restore } = initJsdomHarness('<div data-kg-xr-scene-media-drop="1"><canvas data-engine="three.js"></canvas></div>');
window.requestAnimationFrame = undefined;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
window.__kgFlightSimCanvas = document.querySelector('canvas');
// Model editor disposal with DOM resources; JSDOM does not run the Monaco renderer.
const editor = document.createElement('section'), preview = document.createElement('section');
editor.className = 'monaco-editor'; editor.innerHTML = '<canvas></canvas>'.repeat(3);
preview.dataset.kgMotionControlPreview = 'local-only'; preview.innerHTML = '<canvas></canvas>';
const renderOwners = state => {
  if (!auxiliaries) return;
  if (state.workspaceViewMode === 'editor') document.body.append(editor); else editor.remove();
  if (state.floatingPanelOpen && state.floatingPanelView === 'motionControl' && !state.floatingPanelMinimized) {
    document.body.append(preview);
  } else preview.remove();
};
renderOwners(store.useGraphStore.getState());
const releaseOwners = store.useGraphStore.subscribe(renderOwners);
Object.assign(prior, { canvasCount: document.querySelectorAll('canvas').length,
  auxiliaryCanvasCount: document.querySelectorAll('canvas').length - 1 });
if (auxiliaries && mode !== 'aux-open' && mode !== 'aux-monaco-lost') {
  closeWorkspaceView(store.useGraphStore.getState());
  assert.equal(editor.isConnected, false);
  assert.equal(store.useGraphStore.getState().workspaceCanvasPaneOpen, false);
}
const corruptOwners = () => {
  const canvas = () => document.createElement('canvas');
  if (mode === 'aux-preview-missing') preview.remove();
  if (mode === 'aux-preview-duplicate') preview.append(canvas());
  if (mode === 'aux-monaco-added') document.body.append(editor);
  if (mode === 'aux-monaco-lost') editor.remove();
  if (mode === 'aux-foreign') document.body.append(canvas());
  if (mode === 'aux-map') { const c = canvas(); c.className = 'maplibregl-canvas'; document.body.append(c); }
  if (mode === 'aux-renderer-extra') document.body.append(window.__kgFlightSimCanvas.cloneNode());
  if (mode === 'aux-renderer-replaced') window.__kgFlightSimCanvas.replaceWith(window.__kgFlightSimCanvas.cloneNode());
  if (mode === 'aux-root-extra') document.body.append(window.__kgFlightSimCanvas.parentElement.cloneNode());
  if (mode === 'aux-root-replaced') {
    const root = window.__kgFlightSimCanvas.parentElement, replacement = root.cloneNode();
    replacement.append(window.__kgFlightSimCanvas); root.replaceWith(replacement);
  }
  if (mode === 'aux-editor-state') store.useGraphStore.setState({ workspaceCanvasPaneOpen: true });
};
window.__kgFlightSimBrowserProof = { importModule: async key => modules[key] };
store.useGraphStore.setState({ floatingPanelOpen: true, floatingPanelView: 'flightSim' });
discovery.installAgenticGraphWebMcpRuntime();
const context = navigator.modelContext;
assert.ok(context.tools.some(tool => tool.name.endsWith('control_local_flight_sim')));
if (mode !== 'exposed') {
  store.useGraphStore.setState({ floatingPanelView: 'camera' });
  store.useGraphStore.setState({ floatingPanelOpen: false });
  assert.equal(document.documentElement.dataset.kgWebmcpScope, store.useGraphStore.getState().workspaceViewMode === 'editor' ? 'editor' : 'xr');
  assert.ok(!context.tools.some(tool => tool.name.endsWith('control_local_flight_sim')));
}
let offset = 0;
const now = performance.now.bind(performance);
Object.defineProperty(performance, 'now', { value: () => now() + offset });
const selector = context.tools.find(tool => tool.name === 'agentic-graph.select_local_tool_scope');
if (auxiliaries) {
  await selector.execute({ scope: 'flightSim' });
  context.tools = context.tools.map(item => !item.name.endsWith('control_local_flight_sim') ? item : {
    ...item, execute: async value => { const result = await item.execute(value); corruptOwners(); return result; },
  });
}
else if (mode === 'missing') context.tools = context.tools.filter(tool => tool !== selector);
else if (!auxiliaries && mode !== 'closed' && mode !== 'exposed') context.tools = context.tools.map(tool => tool !== selector ? tool : {
  ...tool, execute: async input => {
    if (mode === 'reject') throw Error('scope rejected');
    if (mode === 'pending') return new Promise(() => {});
    if (mode === 'absent') return { scope: 'flightSim' };
    const result = await tool.execute(input);
    if (mode === 'wrong-scope') return { ...result, scope: 'xr' };
    if (mode === 'mutate') runtime.exitFlightSimSurface();
    if (mode === 'late') offset += 2001;
    return result;
  },
});
try {
  const evidence = await globalThis.eval('(' + expression + ')')();
  if (evidence.registered) {
    assert.equal(evidence.postExit.restoration.controller.terrainId, 'singapore');
    assert.equal(evidence.postExit.restoration.controller.mode, 'rocket');
    assert.equal(evidence.postExit.restoration.controller.phase, prior.controller.phase);
  }
  console.log(JSON.stringify({ prior, evidence }));
} finally { releaseOwners(); discovery.resetAgenticGraphWebMcpRuntimeForTests(); restore(); }
        """)
        self.prior.update(result["prior"])
        self.evidence = result["evidence"]
        return self.evidence


class FlightExitDiscoveryTest(unittest.TestCase):
    def test_native_closed_panel_rediscovery_and_authored_controller_restoration(self):
        for mode in ("closed", "exposed"):
            with self.subTest(mode=mode):
                page, calls = FlightExitFixturePage(mode), []
                _, _, result = verify_flight_exit(page, calls, page.prior)
                self.assertEqual(len(calls), 2)
                for owner in ("controller", "controllerFrame"):
                    for key in ("mode", "terrainId", "phase"):
                        saved = result["restoration"][owner][key]
                        result["restoration"][owner][key] = "wrong"
                        with self.assertRaises(AssertionError):
                            verify_flight_exit(type("Page", (), {"evaluate": lambda _, expression: page.evidence})(), [], page.prior)
                        result["restoration"][owner][key] = saved

    def test_auxiliary_counts_follow_native_editor_close_and_restored_panel(self):
        for mode, monaco, motion in (("aux-closed", 0, 1), ("aux-open", 3, 1), ("aux-minimized", 0, 0)):
            with self.subTest(mode=mode):
                page = FlightExitFixturePage(mode)
                _, _, result = verify_flight_exit(page, [], page.prior)
                self.assertEqual(result["restoration"]["auxiliaryCanvasCount"], monaco + motion)
                self.assertGreater(page.prior["canvasCount"], 1)

    def test_missing_extra_foreign_and_replaced_canvas_owners_fail(self):
        faults = ("preview-missing", "preview-duplicate", "monaco-added", "monaco-lost", "foreign", "map",
                  "renderer-extra", "renderer-replaced", "root-extra", "root-replaced", "editor-state")
        for fault in faults:
            with self.subTest(fault=fault), self.assertRaisesRegex(AssertionError, "deeply restore Physics"):
                page = FlightExitFixturePage("aux-" + fault)
                verify_flight_exit(page, [], page.prior)

    def test_invalid_discovery_fails_before_exit(self):
        for mode in ("missing", "reject", "absent", "wrong-scope", "mutate", "late", "pending"):
            with self.subTest(mode=mode), self.assertRaisesRegex(
                (AssertionError, RuntimeError), "Flight Exit scope|Flight WebMCP tools disappeared|scope rejected",
            ):
                page = FlightExitFixturePage(mode)
                verify_flight_exit(page, [], page.prior)


if __name__ == "__main__":
    unittest.main()
