from __future__ import annotations

import hashlib
import time
from pathlib import Path
from typing import Any, Callable

from playwright.sync_api import Page
from lib.game_flight_sim_smoke_scene import (
    read_and_pin_authored_physics_baseline,
)
from lib.game_flight_sim_smoke_source_selection import (
    close_source_files_selection_surface,
    verify_source_file_button_round_trip,
)


SOURCE_BASENAME = "knowgrph-game-flight-sim-demo.md"
SOURCE_DEMO_ID = "flight-sim"
PHYSICS_SOURCE_BASENAME = "knowgrph-physics-playground-demo.md"
EXPECTED_SOURCE_NODE_IDS = {
    "flight_aircraft",
    "flight_asset_spec",
    "flight_demo_entry",
    "flight_runtime_gate",
}
AUTHORED_XR_NODE_IDS = {
    "kg_graph_xr_stage",
    "kg_xr_native_controller_demo",
    "kg_xr_stage_preset_singapore",
    "kg_xr_playground_treasure",
    "kg_xr_native_terrain_singapore",
}


def _poll(
    page: Page,
    read: Callable[[], dict[str, Any]],
    accepted: Callable[[dict[str, Any]], bool],
    *,
    label: str,
    timeout_ms: int = 120_000,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_ms / 1000
    last_value: dict[str, Any] = {}
    while time.monotonic() < deadline:
        last_value = read()
        if accepted(last_value):
            return last_value
        page.wait_for_timeout(100)
    raise AssertionError(f"timed out waiting for {label}: {last_value}")


def _read_source_identity(
    page: Page,
    expected_source_text: str,
) -> dict[str, Any]:
    return page.evaluate(
        """
        async expectedSourceText => {
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          const demos = await window.__kgFlightSimBrowserProof.importModule('workspaceRunReadyDemos')
          const workspaceModule = await window.__kgFlightSimBrowserProof.importModule('workspaceFs')
          const seedBundle = await window.__kgFlightSimBrowserProof.importModule('workspaceCanonicalSeedBundle')
          const state = store.useGraphStore.getState()
          const workspace = await workspaceModule.getWorkspaceFs()
          const sourcePath = `/${demos.FLIGHT_SIM_DEMO_REPO_REL_PATH}`
          const sourceText = await workspace.readFileText(sourcePath)
          const authoredSeeds =
            await seedBundle.readCanonicalWorkspaceSeedBundleEntries()
          const sourceBasename =
            demos.FLIGHT_SIM_DEMO_WORKSPACE_SEED_BASENAME
          const authoredSeed = authoredSeeds.find(
            seed => {
              const relPath = String(seed?.relPath || '')
                .replace(/^\\/+/, '')
              return relPath === sourceBasename
                || relPath === `workspace-seeds/${sourceBasename}`
                || relPath === `docs/workspace-seeds/${sourceBasename}`
            },
          )
          const sha256Text = async text => {
            const bytes = new TextEncoder().encode(String(text || ''))
            const digest = await crypto.subtle.digest('SHA-256', bytes)
            return Array.from(new Uint8Array(digest))
              .map(value => value.toString(16).padStart(2, '0'))
              .join('')
          }
          const graphMetadata = state.graphData?.metadata
            && typeof state.graphData.metadata === 'object'
            ? state.graphData.metadata
            : {}
          const canvasWorkspacePreset = graphMetadata.canvasWorkspacePreset
            && typeof graphMetadata.canvasWorkspacePreset === 'object'
            ? graphMetadata.canvasWorkspacePreset
            : {}
          const graphNodeIds = Array.isArray(state.graphData?.nodes)
            ? state.graphData.nodes.map(node => String(node?.id || '')).sort()
            : []
          const sourceContract = {
            statusRuntimeReady:
              /^status:\\s*["']runtime-ready["']\\s*$/m.test(sourceText),
            runtimeStatusRuntimeReady:
              /^runtime_status:\\s*["']runtime-ready["']\\s*$/m.test(sourceText),
            localRuntimeReadyClaim:
              /^runtime_claim:\\s*["']local-runtime-ready["']\\s*$/m.test(sourceText),
            exactHeadEvidenceRequired:
              /^evidence_status:\\s*["']exact-head source and browser proof required at every handoff["']\\s*$/m.test(sourceText),
            surfaceGeoXr:
              /^kgCanvasSurfaceMode:\\s*["']geo-xr["']\\s*$/m.test(sourceText),
            render3d:
              /^kgCanvasRenderMode:\\s*["']3d["']\\s*$/m.test(sourceText),
            stageXr:
              /^kgCanvas3dMode:\\s*["']xr["']\\s*$/m.test(sourceText),
            runReadyDeclaration:
              /^run_ready_demo:\\s*$/m.test(sourceText),
            noPlannedBlocks:
              !/^planned_[A-Za-z0-9_]*:\\s*$/m.test(sourceText),
            no2dRenderer:
              !/^kgCanvas2dRenderer:\\s*/m.test(sourceText),
          }
          return {
            documentName: state.markdownDocumentName,
            sourcePath,
            authoredSeedPath: authoredSeed?.relPath || null,
            authoredSeedAuthority: authoredSeed
              ? 'knowgrph-workspace-seeds-bundled'
              : null,
            authoredSeedByteIdentical:
              authoredSeed?.text === expectedSourceText,
            authoredSeedSha256: await sha256Text(authoredSeed?.text),
            authoredSeedHead: String(authoredSeed?.text || '').slice(0, 120),
            demoId: demos.resolveWorkspaceRunReadyDemoIdForDocument(
              state.markdownDocumentName,
              state.markdownDocumentText,
            ),
            active: demos.isFlightSimRunReadyDemoActive(
              state.markdownDocumentName,
              state.markdownDocumentText,
            ),
            sourceDeclaration: String(authoredSeed?.text || '')
              .includes('id: "flight-sim"'),
            workspaceSourceMaterialized: typeof sourceText === 'string'
              && sourceText.length > 0,
            workspaceSourceByteIdentical:
              sourceText === expectedSourceText,
            workspaceSourceSha256: await sha256Text(sourceText),
            expectedSourceSha256: await sha256Text(expectedSourceText),
            graphDocumentName:
              String(graphMetadata.markdownDocumentName || ''),
            graphNodeIds,
            graphOwnedByDocument: String(graphMetadata.source || '')
              === `markdown:${String(state.markdownDocumentName || '')}`,
            sourceContract,
            surfaceMode: String(canvasWorkspacePreset.canvasSurfaceMode || ''),
            renderMode: state.canvasRenderMode,
            canvas3dMode: state.canvas3dMode,
          }
        }
        """,
        expected_source_text,
    )


def prepare_authored_physics_surface(page: Page) -> dict[str, Any]:
    source_path = (
        Path(__file__).resolve().parents[3]
        / "docs"
        / "workspace-seeds"
        / PHYSICS_SOURCE_BASENAME
    )
    expected_text = source_path.read_text(encoding="utf-8")
    if not expected_text:
        raise AssertionError(f"authored Physics seed is empty: {source_path}")
    expected_sha256 = hashlib.sha256(expected_text.encode("utf-8")).hexdigest()
    _poll(
        page,
        lambda: page.evaluate(
            """
            async () => {
              const readiness = await window.__kgFlightSimBrowserProof.importModule('sourceFilesBootstrapReadiness')
              return readiness.readSourceFilesBootstrapSnapshot()
            }
            """
        ),
        lambda value: value.get("phase") == "ready",
        label="Physics Source Files bootstrap readiness",
    )
    application = _poll(
        page,
        lambda: page.evaluate(
            """
            async expectedText => {
              const explorer = await window.__kgFlightSimBrowserProof.importModule('markdownExplorerStore')
              const materialization = await window.__kgFlightSimBrowserProof.importModule('sourceFilesRuntimeMaterialization')
              const workspaceModule = await window.__kgFlightSimBrowserProof.importModule('workspaceFs')
              const seedBundle = await window.__kgFlightSimBrowserProof.importModule('workspaceCanonicalSeedBundle')
              const demos = await window.__kgFlightSimBrowserProof.importModule('workspaceRunReadyDemos')
              const workspace = await workspaceModule.getWorkspaceFs()
              await workspace.ensureSeed()
              const sourcePath = `/${demos.XR_PHYSICS_DEMO_REPO_REL_PATH}`
              const sourceText = await workspace.readFileText(sourcePath)
              const authoredSeeds =
                await seedBundle.readCanonicalWorkspaceSeedBundleEntries()
              const basename = demos.XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME
              const authored = authoredSeeds.find(seed => {
                const relPath = String(seed?.relPath || '').replace(/^\\/+/, '')
                return relPath === basename
                  || relPath === `workspace-seeds/${basename}`
                  || relPath === `docs/workspace-seeds/${basename}`
              })
              explorer.useMarkdownExplorerStore.getState().setActivePath(sourcePath)
              const applied = await materialization
                .reapplyActiveWorkspaceMarkdownDocument({
                  activePathOverride: sourcePath,
                  fs: workspace,
                })
              return {
                applied,
                sourcePath,
                sourceLength: String(sourceText || '').length,
                workspaceByteIdentical: sourceText === expectedText,
                authoredPath: authored?.relPath || null,
                authoredByteIdentical: authored?.text === expectedText,
              }
            }
            """,
            expected_text,
        ),
        lambda value: (
            value.get("workspaceByteIdentical") is True
            and value.get("authoredByteIdentical") is True
            and str(value.get("sourcePath") or "").endswith(
                PHYSICS_SOURCE_BASENAME
            )
            and value.get("sourceLength", 0) > 0
        ),
        label="exact authored Physics seed apply",
    )
    baseline = _poll(
        page,
        lambda: read_and_pin_authored_physics_baseline(
            page, expected_sha256
        ),
        lambda value: value.get("ready") is True,
        label="running authored Physics XR surface",
    )
    if set(baseline.get("requiredNodeNames") or []) != AUTHORED_XR_NODE_IDS:
        raise AssertionError(f"authored Physics XR identity was incomplete: {baseline}")
    return {
        "sourcePath": str(source_path),
        "sourceSha256": expected_sha256,
        "application": application,
        **baseline,
    }


def _apply_exact_authored_source(
    page: Page,
    expected_source_text: str,
) -> dict[str, Any]:
    bootstrap = _poll(
        page,
        lambda: page.evaluate(
            """
            async () => {
              const readiness = await window.__kgFlightSimBrowserProof.importModule('sourceFilesBootstrapReadiness')
              const snapshot = readiness.readSourceFilesBootstrapSnapshot()
              return {
                phase: snapshot.phase,
                basePhase: snapshot.basePhase,
                error: snapshot.error ? String(snapshot.error) : null,
              }
            }
            """
        ),
        lambda value: value.get("phase") == "ready",
        label="Source Files bootstrap readiness",
    )
    result = _poll(
        page,
        lambda: page.evaluate(
            """
            async expectedSourceText => {
              if (!window.__kgFlightSimFirstFrameProof) {
                const proof = {
                  startedAtMs: performance.now(),
                  firstFrameAtMs: null,
                  firstFrameClassName: null,
                  firstFrameSurface: null,
                  preExisting: Boolean(document.querySelector(
                    'canvas[data-kg-flight-sim-first-frame="1"]',
                  )),
                }
                const captureFirstFrame = () => {
                  const firstFrameCanvas = document.querySelector(
                    'canvas[data-kg-flight-sim-first-frame="1"]',
                  )
                  if (
                    proof.firstFrameAtMs === null
                    && firstFrameCanvas instanceof HTMLCanvasElement
                  ) {
                    proof.firstFrameAtMs = performance.now()
                    proof.firstFrameClassName = firstFrameCanvas.className
                    proof.firstFrameSurface =
                      firstFrameCanvas.dataset.kgFlightSimFirstFrameSurface
                      || null
                    window.__kgFlightSimFirstFrameObserver?.disconnect()
                  }
                }
                window.__kgFlightSimFirstFrameProof = proof
                window.__kgFlightSimFirstFrameObserver = new MutationObserver(
                  captureFirstFrame,
                )
                window.__kgFlightSimFirstFrameObserver.observe(
                  document.documentElement,
                  {
                    attributes: true,
                    attributeFilter: ['data-kg-flight-sim-first-frame'],
                    childList: true,
                    subtree: true,
                  },
                )
                captureFirstFrame()
              }
              const explorer = await window.__kgFlightSimBrowserProof.importModule('markdownExplorerStore')
              const materialization = await window.__kgFlightSimBrowserProof.importModule('sourceFilesRuntimeMaterialization')
              const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
              const workspaceModule = await window.__kgFlightSimBrowserProof.importModule('workspaceFs')
              const seedBundle = await window.__kgFlightSimBrowserProof.importModule('workspaceCanonicalSeedBundle')
              const physics = await window.__kgFlightSimBrowserProof.importModule('xrPhysicsRuntime')
              const controller = await window.__kgFlightSimBrowserProof.importModule('xrNativeControllerDemoRuntime')
              const camera = await window.__kgFlightSimBrowserProof.importModule('xrNativeControllerCameraRuntime')
              const demos = await window.__kgFlightSimBrowserProof.importModule('workspaceRunReadyDemos')
              const workspace = await workspaceModule.getWorkspaceFs()
              await workspace.ensureSeed()
              const sourcePath =
                `/${demos.FLIGHT_SIM_DEMO_REPO_REL_PATH}`
              const authoredSeeds =
                await seedBundle.readCanonicalWorkspaceSeedBundleEntries()
              const sourceBasename =
                demos.FLIGHT_SIM_DEMO_WORKSPACE_SEED_BASENAME
              const authored = authoredSeeds.find(
                seed => {
                  const relPath = String(seed?.relPath || '')
                    .replace(/^\\/+/, '')
                  return relPath === sourceBasename
                    || relPath === `workspace-seeds/${sourceBasename}`
                    || relPath === `docs/workspace-seeds/${sourceBasename}`
                },
              )
              const sourceText = await workspace.readFileText(sourcePath)
              const hasSourceText = typeof sourceText === 'string'
                && sourceText.length > 0
              const priorState = store.useGraphStore.getState()
              const baselineIdentity =
                window.__kgFlightSimBaselineSceneIdentity || {}
              const root = document.querySelector(
                '[data-kg-xr-scene-media-drop="1"]',
              )
              const canvas = root?.querySelector('canvas') || null
              const documentCanvases = Array.from(
                document.querySelectorAll('canvas'),
              )
              const rendererCanvases = documentCanvases.filter(
                candidate => String(
                  candidate.dataset.engine || '',
                ).startsWith('three.js'),
              )
              const auxiliaryCanvases = documentCanvases.filter(
                candidate => !rendererCanvases.includes(candidate),
              )
              const nativeController =
                controller.readXrNativeControllerDemo()
              const physicsSnapshot = {
                ...physics.readXrPhysicsRuntime(),
              }
              delete physicsSnapshot.revision
              const controllerSnapshot = {
                ...nativeController,
              }
              delete controllerSnapshot.revision
              const priorSurface = {
                canvasRenderMode: priorState.canvasRenderMode,
                canvas3dMode: priorState.canvas3dMode,
                canvasRenderModeLastFree:
                  priorState.canvasRenderModeLastFree,
                canvasRenderModeIsAuto:
                  priorState.canvasRenderModeIsAuto,
                floatingPanelOpen: priorState.floatingPanelOpen,
                floatingPanelView: priorState.floatingPanelView,
                timelinePlaying: priorState.timelineTransportPlaying === true,
                physicsPhase: physics.readXrPhysicsRuntime().phase,
                physics: physicsSnapshot,
                physicsFrame: physics.readXrPhysicsRuntimeFrame(),
                camera: {
                  mode: camera.readXrNativeControllerCamera().mode,
                },
                controller: controllerSnapshot,
                controllerFrame:
                  controller.readSharedXrNativeControllerDemoFrame(),
                canvasCount: documentCanvases.length,
                rendererCanvasCount: rendererCanvases.length,
                auxiliaryCanvasCount: auxiliaryCanvases.length,
                auxiliaryCanvasesLocalOnly: auxiliaryCanvases.every(
                  candidate => Boolean(candidate.closest(
                    '[data-kg-motion-control-preview="local-only"], .monaco-editor',
                  )),
                ),
                rootCount: document.querySelectorAll(
                  '[data-kg-xr-scene-media-drop="1"]',
                ).length,
                baselineCanvasIdentityRetained:
                  Boolean(canvas) && window.__kgFlightSimCanvas === canvas,
                authoredSceneSignature:
                  baselineIdentity.authoredSceneSignature || null,
                atmosphereTerrainSignature:
                  baselineIdentity.atmosphereTerrainSignature || null,
                cameraAuthoritySignature:
                  baselineIdentity.cameraAuthoritySignature || null,
                cameraMode:
                  camera.readXrNativeControllerCamera().mode,
                controllerPhase: nativeController.phase,
                controllerMode: nativeController.mode,
                controllerTerrainId: nativeController.terrainId,
                physicsSourceSha256:
                  baselineIdentity.sourceSha256 || null,
              }
              let applied = false
              if (hasSourceText) {
                explorer.useMarkdownExplorerStore.getState()
                  .setActivePath(sourcePath)
                applied = await materialization
                  .reapplyActiveWorkspaceMarkdownDocument({
                    activePathOverride: sourcePath,
                    fs: workspace,
                  })
              }
              const state = store.useGraphStore.getState()
              return {
                applied,
                activeTextByteIdentical: hasSourceText
                  && state.markdownDocumentText === sourceText,
                authoredSourcePath: authored?.relPath || null,
                authoredSourceAuthority: authored
                  ? 'knowgrph-workspace-seeds-bundled'
                  : null,
                authoredSourceByteIdentical:
                  authored?.text === expectedSourceText,
                byteIdentical: hasSourceText
                  && sourceText === expectedSourceText,
                documentName: state.markdownDocumentName,
                sourcePath,
                sourceTextLength: String(sourceText || '').length,
                priorSurface,
              }
            }
            """,
            expected_source_text,
        ),
        lambda value: (
            value.get("activeTextByteIdentical") is True
            and value.get("authoredSourceByteIdentical") is True
            and value.get("byteIdentical") is True
            and str(value.get("documentName") or "").endswith(SOURCE_BASENAME)
            and str(value.get("sourcePath") or "").endswith(SOURCE_BASENAME)
            and value.get("sourceTextLength", 0) > 0
        ),
        label="production Source Files exact-seed apply",
    )
    return {"bootstrap": bootstrap, **result}


def apply_and_verify_exact_authored_source(
    page: Page,
) -> tuple[dict[str, Any], dict[str, Any]]:
    source_path = (
        Path(__file__).resolve().parents[3]
        / "docs"
        / "workspace-seeds"
        / SOURCE_BASENAME
    )
    expected_source_text = source_path.read_text(encoding="utf-8")
    if not expected_source_text:
        raise AssertionError(f"authored Flight seed is empty: {source_path}")
    expected_source_sha256 = hashlib.sha256(
        expected_source_text.encode("utf-8")
    ).hexdigest()

    selection_round_trip = verify_source_file_button_round_trip(
        page,
        expected_source_text,
        flight_basename=SOURCE_BASENAME,
        physics_basename=PHYSICS_SOURCE_BASENAME,
        poll=_poll,
        read_source_identity=_read_source_identity,
    )
    selection_surface_transition = close_source_files_selection_surface(page)
    application = _apply_exact_authored_source(page, expected_source_text)
    application["selectionRoundTrip"] = selection_round_trip
    application["selectionSurfaceTransition"] = selection_surface_transition
    source = _poll(
        page,
        lambda: _read_source_identity(page, expected_source_text),
        lambda value: (
            str(value.get("documentName") or "").endswith(SOURCE_BASENAME)
            and str(value.get("sourcePath") or "").endswith(SOURCE_BASENAME)
            and value.get("demoId") == SOURCE_DEMO_ID
            and value.get("active") is True
            and value.get("sourceDeclaration") is True
            and value.get("authoredSeedByteIdentical") is True
            and value.get("authoredSeedSha256") == expected_source_sha256
            and value.get("workspaceSourceMaterialized") is True
            and value.get("workspaceSourceByteIdentical") is True
            and value.get("workspaceSourceSha256") == expected_source_sha256
            and value.get("expectedSourceSha256") == expected_source_sha256
            and value.get("graphOwnedByDocument") is True
            and all((value.get("sourceContract") or {}).values())
            and str(value.get("graphDocumentName") or "").endswith(
                SOURCE_BASENAME
            )
            and EXPECTED_SOURCE_NODE_IDS.issubset(
                set(value.get("graphNodeIds") or [])
            )
            and value.get("surfaceMode") == "geo-xr"
            and value.get("renderMode") == "3d"
            and value.get("canvas3dMode") == "xr"
        ),
        label="exact authored Flight seed materialization",
    )
    source["path"] = str(source_path)
    source["sha256"] = expected_source_sha256
    return application, source
