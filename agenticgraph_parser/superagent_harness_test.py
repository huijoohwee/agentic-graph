import json
import os
import tempfile
import unittest

from .superagent_harness import (
    HarnessError,
    RICH_MEDIA_SURFACE_ROUTE,
    RunBudget,
    ToolRegistry,
    build_default_tool_registry,
    read_trace_events,
    run_harness,
)
from .superagent_contracts import (
    BALANCED_WIDGET_LAYOUT,
    RICH_MEDIA_PANEL_EDGE_LANES,
    SUPERAGENT_TASK_CAPABILITIES,
    SUPERAGENT_TASK_LEVELS,
)
from .superagent_responsive import REQUIRED_RESPONSIVE_WIDGET_IDS, required_responsive_proof_class_ids
from .agent_definition_registry import list_agent_definitions, resolve_agent_definition


GOAL_TEXT = """
# Goal

Build a universal super-agent harness for research, code, and creation tasks with rich media canvas output.

- Keep tests neutral and independent of a specific demo document.
- Produce research, code, sandbox, text, image, video, canvas, trace, and report artifacts.
- Stop only when deterministic validation passes or a blocker is recorded.
"""


NEUTRAL_BRIEF = """---
title: "Portable Product Walkthrough"
inputs:
  script: |
    Intake — A person submits a short brief with constraints.
    Build — The system creates a reference frame and motion plan.
    Review — The result is checked and exported with provenance.
---

# Portable Product Walkthrough

This neutral fixture exercises the harness without relying on a branded story.
"""

class SuperAgentHarnessTests(unittest.TestCase):
    def write_brief(self, tmp: str, text: str = NEUTRAL_BRIEF) -> str:
        path = os.path.join(tmp, "brief.md")
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)
        return path

    def test_agent_definition_registry_resolves_exact_invocations(self) -> None:
        self.assertEqual(
            [definition["invocation"] for definition in list_agent_definitions()],
            ["/investment-research-agent", "/sme-care-agent", "/video-agent"],
        )
        self.assertEqual(resolve_agent_definition("/sme-care-agent")["id"], "agent.sme-care")
        with self.assertRaises(HarnessError):
            resolve_agent_definition("/care-agent")

    def test_sme_care_definition_runs_through_shared_harness(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            brief = self.write_brief(tmp)
            state = run_harness(
                input_path=brief,
                output_dir=os.path.join(tmp, "sme-care-run"),
                goal_text=GOAL_TEXT,
                run_id="sme-care-e2e",
                agent_definition_id="agent.sme-care",
                provider_mode="mock",
                budget=RunBudget(max_steps=40, max_retries_per_task=2, max_wall_seconds=120),
            )
            self.assertEqual(state["run"]["status"], "completed")
            self.assertEqual(state["run"]["agent_invocation"], "/sme-care-agent")
            self.assertIn("coverage.graph", state["agent_definition"]["capabilities"])

    def test_external_xr_validation_document_is_runtime_input_only(self) -> None:
        repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
        external_name = "-".join(["knowgrph", "xr", "demo"]) + ".md"
        external_abs_path = os.path.join(
            os.path.sep,
            "Users",
            "huijoohwee",
            "Documents",
            "GitHub",
            "huijoohwee",
            "docs",
            external_name,
        )
        forbidden_tokens = {
            external_name,
            external_abs_path,
            external_abs_path.replace(os.path.sep, "/"),
        }
        skipped_dir_names = {
            ".git",
            ".mypy_cache",
            ".pytest_cache",
            ".venv",
            "__pycache__",
            "build",
            "coverage",
            "dist",
            "node_modules",
        }
        skipped_rel_prefixes = (
            "canvas/build",
            "canvas/dist",
            "canvas/node_modules",
            "data/outputs",
            "data/superagent-runs",
        )
        offenders: list[str] = []

        for root, dirs, files in os.walk(repo_root):
            rel_root = os.path.relpath(root, repo_root)
            rel_root = "" if rel_root == "." else rel_root.replace(os.path.sep, "/")
            dirs[:] = [
                name for name in dirs
                if name not in skipped_dir_names and not os.path.islink(os.path.join(root, name))
            ]
            if rel_root and any(rel_root == prefix or rel_root.startswith(f"{prefix}/") for prefix in skipped_rel_prefixes):
                dirs[:] = []
                continue
            for name in files:
                path = os.path.join(root, name)
                if os.path.islink(path):
                    continue
                try:
                    if os.path.getsize(path) > 2_000_000:
                        continue
                    with open(path, "r", encoding="utf-8") as handle:
                        text = handle.read()
                except (OSError, UnicodeDecodeError):
                    continue
                if any(token in text for token in forbidden_tokens):
                    offenders.append(os.path.relpath(path, repo_root).replace(os.path.sep, "/"))

        self.assertEqual([], sorted(offenders))

    def test_tool_registry_validates_required_inputs(self) -> None:
        registry = ToolRegistry()
        # Reuse the default registry through a tiny fake object because the builder does not depend on harness state.
        registry = build_default_tool_registry(object())  # type: ignore[arg-type]
        tool_by_name = {tool["name"]: tool for tool in registry.describe()}
        self.assertIn("skill.select", tool_by_name)
        self.assertIn("tool_inventory", tool_by_name["skill.select"]["required"])
        self.assertIn("research_result", tool_by_name["text.generate.mock"]["required"])
        self.assertIn("code_result", tool_by_name["text.generate.mock"]["required"])
        self.assertIn("skill_result", tool_by_name["text.generate.mock"]["required"])
        self.assertIn("research_result", tool_by_name["canvas.write"]["required"])
        self.assertIn("code_result", tool_by_name["canvas.write"]["required"])
        self.assertIn("skill_result", tool_by_name["canvas.write"]["required"])
        with self.assertRaises(HarnessError):
            registry.call("text.generate.mock", {"inspection": {}})

    def test_neutral_e2e_run_produces_trace_canvas_and_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            brief = self.write_brief(tmp)
            out = os.path.join(tmp, "run")
            state = run_harness(
                input_path=brief,
                output_dir=out,
                goal_text=GOAL_TEXT,
                run_id="neutral-e2e",
                budget=RunBudget(max_steps=40, max_retries_per_task=2, max_wall_seconds=120),
            )
            self.assertEqual(state["run"]["status"], "completed")
            self.assertTrue(state["verification"]["passed"])
            self.assertEqual(
                state["memory"]["observations"]["inspect_goal"]["tool_count"],
                len(state["tool_registry"]),
            )
            self.assertTrue(os.path.exists(os.path.join(out, "trace.jsonl")))
            self.assertTrue(os.path.exists(os.path.join(out, "final-report.md")))
            proof_path = os.path.join(out, "harness-proof.json")
            self.assertTrue(os.path.exists(proof_path))
            with open(proof_path, "r", encoding="utf-8") as handle:
                proof = json.load(handle)
            self.assertEqual(proof["schema_version"], "knowgrph.superagent.proof.v1")
            self.assertEqual(proof["harness_contract"]["codex_integration"]["mcp_tool"], "knowgrph.superagent.run")
            self.assertEqual(proof["harness_contract"]["codex_integration"]["surface_route"], RICH_MEDIA_SURFACE_ROUTE)
            self.assertEqual(proof["harness_contract"]["capabilities"]["task_capabilities"], SUPERAGENT_TASK_CAPABILITIES)
            self.assertEqual(proof["harness_contract"]["capabilities"]["task_levels"], SUPERAGENT_TASK_LEVELS)
            self.assertIn("skill.select", proof["harness_contract"]["capabilities"]["tools"])
            self.assertIn("research.scout", proof["harness_contract"]["capabilities"]["tools"])
            self.assertIn("code.write_and_run", proof["harness_contract"]["capabilities"]["tools"])
            self.assertIn("skill_curator", proof["harness_contract"]["capabilities"]["subagents"])
            self.assertIn("research_worker", proof["harness_contract"]["capabilities"]["subagents"])
            self.assertIn("code_worker", proof["harness_contract"]["capabilities"]["subagents"])
            self.assertTrue(proof["evidence"]["verification"]["passed"])
            self.assertGreaterEqual(proof["evidence"]["trace_event_counts"]["tool.call"], 1)
            self.assertIn("select_skills", proof["evidence"]["completed_task_ids"])
            self.assertIn("research_goal", proof["evidence"]["completed_task_ids"])
            self.assertIn("code_sandbox", proof["evidence"]["completed_task_ids"])
            self.assertIn("synthesize_report", proof["evidence"]["completed_task_ids"])
            self.assertTrue(proof["evidence"]["capability_evidence"]["skill"]["completed"])
            self.assertTrue(proof["evidence"]["capability_evidence"]["research"]["completed"])
            self.assertTrue(proof["evidence"]["capability_evidence"]["code"]["completed"])
            self.assertTrue(proof["evidence"]["capability_evidence"]["create"]["completed"])
            proof_artifacts = {artifact["artifact_id"] for artifact in proof["evidence"]["artifacts"]}
            self.assertIn("selected_skills_json", proof_artifacts)
            self.assertIn("research_pack_json", proof_artifacts)
            self.assertIn("code_generated_summary_py", proof_artifacts)
            self.assertIn("code_sandbox_result", proof_artifacts)
            self.assertIn("harness_proof_manifest", proof_artifacts)
            self.assertIn("responsive_verification", proof_artifacts)
            self.assertEqual(
                proof["harness_contract"]["responsive"]["proof_class_ids"],
                required_responsive_proof_class_ids(),
            )
            self.assertTrue(proof["evidence"]["responsive"]["passed"])
            canvas_path = os.path.join(out, "artifacts", "canvas", "canvas.graph.json")
            self.assertTrue(os.path.exists(canvas_path))
            with open(canvas_path, "r", encoding="utf-8") as handle:
                graph = json.load(handle)
            self.assertEqual(
                graph["metadata"]["surfaceRoute"],
                "MainPanel Integrations -> FloatingPanel Chat UI -> Editor Workspace -> Canvas -> Balanced 16:9 (1920x1080) Layout for Widgets (Text, Image, Video) AND Rich Media Panel AND Edges",
            )
            self.assertEqual(graph["metadata"]["layout"]["frame"]["width"], 1920)
            self.assertEqual(graph["metadata"]["layout"]["frame"]["height"], 1080)
            responsive = graph["metadata"]["layout"]["responsive"]
            self.assertEqual(
                [proof_class["id"] for proof_class in responsive["proofClasses"]],
                required_responsive_proof_class_ids(),
            )
            for proof_class in responsive["proofClasses"]:
                self.assertTrue(proof_class["controls"]["safeAreaAware"])
                self.assertTrue(set(REQUIRED_RESPONSIVE_WIDGET_IDS).issubset(proof_class["widgets"]))
                self.assertTrue(set(["e-text-panel", "e-image-panel", "e-video-panel"]).issubset(proof_class["edgePolicy"]["reachableEdgeIds"]))
            node_types = {node["type"] for node in graph["nodes"]}
            self.assertIn("SkillSelector", node_types)
            self.assertIn("ResearchAgent", node_types)
            self.assertIn("CodeWorker", node_types)
            self.assertIn("TextGeneration", node_types)
            self.assertIn("ImageGeneration", node_types)
            self.assertIn("VideoGeneration", node_types)
            self.assertIn("RichMediaPanel", node_types)
            node_by_id = {node["id"]: node for node in graph["nodes"]}
            required_layout = ["text-plan", "image-reference", "video-storyboard", "rich-media-panel"]
            center_sum_x = 0.0
            center_sum_y = 0.0
            for node_id in required_layout:
                node = node_by_id[node_id]
                props = node["properties"]
                self.assertGreaterEqual(node["x"], 0)
                self.assertGreaterEqual(node["y"], 0)
                self.assertLessEqual(node["x"] + props["visual:width"], 1920)
                self.assertLessEqual(node["y"] + props["visual:height"], 1080)
                self.assertEqual(props["layoutFrame"], "balanced-16x9")
                self.assertEqual(props["visual:xIndex"], BALANCED_WIDGET_LAYOUT[node_id]["xIndex"])
                self.assertEqual(props["visual:yIndex"], BALANCED_WIDGET_LAYOUT[node_id]["yIndex"])
                self.assertEqual(props["visual:zIndex"], BALANCED_WIDGET_LAYOUT[node_id]["zIndex"])
                center_sum_x += node["x"] + props["visual:width"] / 2
                center_sum_y += node["y"] + props["visual:height"] / 2
            self.assertAlmostEqual(center_sum_x / len(required_layout), 960, delta=1)
            self.assertAlmostEqual(center_sum_y / len(required_layout), 540, delta=1)
            panel_edges = {
                edge.get("targetHandle")
                for edge in graph["edges"]
                if edge.get("target") == "rich-media-panel"
            }
            self.assertTrue({"output", "imageUrl", "videoUrl"}.issubset(panel_edges))
            edge_ids = {edge["id"] for edge in graph["edges"]}
            self.assertTrue({"e-brief-skill", "e-skill-research", "e-brief-research", "e-research-code", "e-code-text", "e-research-text"}.issubset(edge_ids))
            for edge in graph["edges"]:
                if edge["id"] in {"e-text-panel", "e-image-panel", "e-video-panel"}:
                    self.assertEqual(edge["properties"]["layoutRoute"]["frame"], "balanced-16x9")
                    self.assertEqual(edge["properties"]["layoutRoute"]["strategy"], "fan-in-readable")
                    self.assertEqual(edge["properties"]["layoutRoute"]["laneIndex"], RICH_MEDIA_PANEL_EDGE_LANES[edge["id"]])
                    self.assertTrue(edge["properties"]["layoutRoute"]["avoidWidgetContent"])
            workspace_path = os.path.join(out, "artifacts", "workspace", "rich-media-flow.md")
            self.assertTrue(os.path.exists(workspace_path))
            with open(workspace_path, "r", encoding="utf-8") as handle:
                workspace_text = handle.read()
            self.assertIn('kgCanvas2dRenderer: "storyboard"', workspace_text)
            self.assertIn("kgSuperAgentLayout:", workspace_text)
            self.assertIn("kgSuperAgentCapabilities:", workspace_text)
            self.assertIn("kgSuperAgentTaskLevels:", workspace_text)
            self.assertIn("quick_triage", workspace_text)
            self.assertIn("parallel_build", workspace_text)
            self.assertIn("kgSuperAgentMessageGateway:", workspace_text)
            self.assertIn("kgSuperAgentSandbox:", workspace_text)
            self.assertIn("width: 1920", workspace_text)
            self.assertIn("height: 1080", workspace_text)
            self.assertIn("frontmatterFlowSettings:", workspace_text)
            self.assertIn("kgSuperAgentResponsive:", workspace_text)
            self.assertIn("strategy: mobile-first", workspace_text)
            self.assertIn("mobile-320x640", workspace_text)
            self.assertIn("tablet-768x1024", workspace_text)
            self.assertIn("wide-1920x1080", workspace_text)
            self.assertIn("balancedViewportPreset: widgetFrontmatter", workspace_text)
            self.assertIn("layoutRoute: \"balanced-16x9:fan-in-readable\"", workspace_text)
            self.assertIn("layoutLane: 0", workspace_text)
            self.assertIn("visual:xIndex", workspace_text)
            self.assertIn("visual:yIndex", workspace_text)
            self.assertIn("visual:zIndex", workspace_text)
            self.assertIn("TextGeneration", workspace_text)
            self.assertIn("SkillSelector", workspace_text)
            self.assertIn("ResearchAgent", workspace_text)
            self.assertIn("CodeWorker", workspace_text)
            self.assertIn("ImageGeneration", workspace_text)
            self.assertIn("VideoGeneration", workspace_text)
            self.assertIn("RichMediaPanel", workspace_text)
            self.assertIn("flow:widgetFormId", workspace_text)
            self.assertIn("richMediaPanel", workspace_text)
            check_ids = {check["id"] for check in state["verification"]["checks"]}
            self.assertIn("artifact:skill", check_ids)
            self.assertIn("canvas:has_rich_media_panel", check_ids)
            self.assertIn("canvas:has_skill_node", check_ids)
            self.assertIn("canvas:has_research_node", check_ids)
            self.assertIn("canvas:has_code_node", check_ids)
            self.assertIn("harness:research_code_create_capabilities", check_ids)
            self.assertIn("sandbox:generated_code_passed", check_ids)
            self.assertIn("workspace:frontmatter_flow_rich_media_panel", check_ids)
            self.assertIn("surface:route", check_ids)
            self.assertIn("layout:balanced_16x9_widgets", check_ids)
            self.assertIn("layout:balanced_16x9_edges", check_ids)
            self.assertIn("responsive:proof_classes", check_ids)
            self.assertIn("responsive:widget_reachability", check_ids)
            self.assertIn("responsive:edge_reachability", check_ids)
            self.assertIn("responsive:touch_controls", check_ids)
            self.assertIn("responsive:workspace_metadata", check_ids)
            responsive_proof_path = os.path.join(out, "artifacts", "responsive", "responsive-proof.json")
            self.assertTrue(os.path.exists(responsive_proof_path))
            trace_events = {event["event"] for event in read_trace_events(os.path.join(out, "trace.jsonl"))}
            self.assertIn("task.dispatch", trace_events)
            self.assertIn("tool.call", trace_events)
            self.assertIn("run.terminate", trace_events)

    def test_resume_continues_from_checkpoint(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            brief = self.write_brief(tmp)
            out = os.path.join(tmp, "resume-run")
            first = run_harness(
                input_path=brief,
                output_dir=out,
                goal_text=GOAL_TEXT,
                run_id="resume-e2e",
                budget=RunBudget(max_steps=40, max_retries_per_task=2, max_wall_seconds=120),
                stop_after_step=2,
            )
            self.assertEqual(first["run"]["status"], "interrupted")
            resumed = run_harness(
                input_path=None,
                output_dir=out,
                goal_text=GOAL_TEXT,
                run_id="resume-e2e",
                budget=RunBudget(max_steps=40, max_retries_per_task=2, max_wall_seconds=120),
                resume=True,
            )
            self.assertEqual(resumed["run"]["status"], "completed")
            self.assertTrue(resumed["verification"]["passed"])

    def test_retry_recovery_is_bounded_and_recorded(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            brief = self.write_brief(tmp)
            out = os.path.join(tmp, "retry-run")
            state = run_harness(
                input_path=brief,
                output_dir=out,
                goal_text=GOAL_TEXT,
                run_id="retry-e2e",
                budget=RunBudget(max_steps=40, max_retries_per_task=2, max_wall_seconds=120),
                fail_once_tools=["video.generate.byteplus_modelark_placeholder"],
            )
            self.assertEqual(state["run"]["status"], "completed")
            recovery_events = state["memory"]["recovery_events"]
            self.assertEqual(len(recovery_events), 1)
            self.assertEqual(recovery_events[0]["tool_name"], "video.generate.byteplus_modelark_placeholder")
            trace_events = [event["event"] for event in read_trace_events(os.path.join(out, "trace.jsonl"))]
            self.assertIn("recovery.retry", trace_events)

    def test_generated_state_is_not_fixture_story_locked(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            brief = self.write_brief(tmp)
            out = os.path.join(tmp, "neutrality-run")
            state = run_harness(
                input_path=brief,
                output_dir=out,
                goal_text=GOAL_TEXT,
                run_id="neutrality-e2e",
                budget=RunBudget(max_steps=40, max_retries_per_task=2, max_wall_seconds=120),
            )
            serialized = json.dumps(state, ensure_ascii=False).lower()
            self.assertNotIn("robodrone", serialized)
            self.assertNotIn("-".join(["knowgrph", "video", "demo"]) + ".md", serialized)
            self.assertNotIn("-".join(["knowgrph", "xr", "demo"]) + ".md", serialized)

    def test_default_provider_mode_records_byteplus_modelark_placeholder(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            brief = self.write_brief(tmp)
            out = os.path.join(tmp, "byteplus-placeholder")
            state = run_harness(
                input_path=brief,
                output_dir=out,
                goal_text=GOAL_TEXT,
                run_id="byteplus-placeholder",
                budget=RunBudget(max_steps=40, max_retries_per_task=2, max_wall_seconds=120),
            )
            self.assertEqual(state["run"]["provider_mode"], "byteplus-modelark")
            self.assertEqual(state["memory"]["observations"]["generate_video"]["video"]["provider_mode_resolved"], "byteplus-modelark")
            self.assertEqual(state["memory"]["observations"]["generate_video"]["video"]["provider_status"], "placeholder")
            self.assertEqual(state["memory"]["observations"]["generate_video"]["video"]["remote_mcp_server"], "byteplus-modelark-media")
            canvas_path = os.path.join(out, "artifacts", "canvas", "canvas.graph.json")
            with open(canvas_path, "r", encoding="utf-8") as handle:
                graph = json.load(handle)
            self.assertEqual(graph["metadata"]["providerModeRequested"], "byteplus-modelark")
            self.assertEqual(graph["metadata"]["providerMode"], "byteplus-modelark")
            video_node = next(node for node in graph["nodes"] if node["id"] == "video-storyboard")
            self.assertEqual(video_node["properties"]["provider"], "byteplus-modelark")
            self.assertEqual(video_node["properties"]["providerModeResolved"], "byteplus-modelark")
            self.assertEqual(video_node["properties"]["providerStatus"], "placeholder")


if __name__ == "__main__":
    unittest.main()
