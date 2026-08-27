import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { load as parseYaml } from "js-yaml";

const TOOL_SUFFIX = Object.freeze({
  startRun: "start_run",
  runStatus: "run_status",
  postChoice: "post_choice",
  submitCritique: "submit_critique",
  approveStage: "approve_stage",
  getArtifact: "get_artifact",
});

const ARTIFACT_PATHS = Object.freeze({
  manifest: "manifest.md",
  failure_report: "failure_report.md",
  narration_manifest: "narration-manifest.md",
  choice_graph: "choice-graph.md",
  revision_history: "revision-history.md",
  cost_log: "cost-log.jsonl",
  state: "state.json",
});

const RUNS = new Map();

const text = (value) => String(value || "").trim();
const hash = (value) => createHash("sha256").update(String(value || ""), "utf8").digest("hex");
const runKey = (value) => `kgsr_${hash(value).slice(0, 24)}`;
const jsonResult = (payload) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError: payload.ok === false });

const readFrontmatter = (markdown) => {
  const source = String(markdown || "");
  if (!source.startsWith("---")) return { ok: false, error: { code: "BRIEF_VALIDATION_ERROR", message: "Missing YAML frontmatter." } };
  const end = source.indexOf("\n---", 3);
  if (end < 0) return { ok: false, error: { code: "BRIEF_VALIDATION_ERROR", message: "Missing closing YAML frontmatter fence." } };
  const meta = parseYaml(source.slice(3, end)) || {};
  return meta && typeof meta === "object" && !Array.isArray(meta)
    ? { ok: true, meta }
    : { ok: false, error: { code: "BRIEF_VALIDATION_ERROR", message: "Frontmatter must be an object." } };
};

const validateBrief = (markdown) => {
  const parsed = readFrontmatter(markdown);
  if (!parsed.ok) return parsed;
  const meta = parsed.meta;
  const errors = [];
  if (text(meta.schema) !== "agenticgraph-showrunner-brief/v1") errors.push("schema must be agenticgraph-showrunner-brief/v1");
  if (!["podcast", "narrative_game", "writers_room"].includes(text(meta.run_type))) errors.push("run_type is invalid");
  if (!text(meta.title)) errors.push("title is required");
  if (!(Number(meta.token_budget) > 0)) errors.push("token_budget must be positive");
  if (!Array.isArray(meta.agent_roles) || meta.agent_roles.length < 1) errors.push("agent_roles must include at least one role");
  if (errors.length) return { ok: false, error: { code: "BRIEF_VALIDATION_ERROR", message: errors.join("; ") } };
  return { ok: true, meta };
};

const safeRootPath = (rootDir, relativePath) => {
  const resolved = path.resolve(rootDir, relativePath);
  const rel = path.relative(rootDir, resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`Path must stay inside AGENTICGRAPH_ROOT: ${relativePath}`);
  return resolved;
};

const writeFile = async (rootDir, relativePath, content) => {
  const absolutePath = safeRootPath(rootDir, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
  return relativePath;
};

const loadState = async (rootDir, runId) => {
  if (RUNS.has(runId)) return RUNS.get(runId);
  const statePath = safeRootPath(rootDir, `showrunner/runs/${runId}/state.json`);
  const raw = await fs.readFile(statePath, "utf8");
  const state = JSON.parse(raw);
  RUNS.set(runId, state);
  return state;
};

const artifactPath = (runId, artifactType) => `showrunner/runs/${runId}/${ARTIFACT_PATHS[artifactType] || "manifest.md"}`;

export async function runShowrunnerLocalTool(toolName, args = {}, { rootDir }) {
  const suffix = text(toolName).split(".").pop();
  if (suffix === TOOL_SUFFIX.startRun) {
    const markdown = text(args.brief_markdown) || (text(args.brief_path) ? await fs.readFile(safeRootPath(rootDir, args.brief_path), "utf8") : "");
    const validated = validateBrief(markdown);
    if (!validated.ok) return jsonResult({ ok: false, error: validated.error });
    const runId = runKey(text(validated.meta.run_id) || `${validated.meta.run_type}:${validated.meta.title}`);
    const files = [];
    files.push(await writeFile(rootDir, `showrunner/briefs/${runId}/brief.md`, markdown));
    const state = { run_id: runId, run_status: "complete", status: "complete", token_budget: Number(validated.meta.token_budget), run_token_total: 0, token_budget_remaining: Number(validated.meta.token_budget), paid_call_count: 0, dry_run: args.dry_run !== false, source_file_paths: files };
    files.push(await writeFile(rootDir, artifactPath(runId, "cost_log"), ""));
    if (text(validated.meta.run_type) === "podcast") files.push(await writeFile(rootDir, artifactPath(runId, "narration_manifest"), "# Narration Manifest\n"));
    files.push(await writeFile(rootDir, artifactPath(runId, "manifest"), files.map((file) => `- ${file}`).join("\n")));
    state.source_file_paths = files;
    files.push(await writeFile(rootDir, artifactPath(runId, "state"), `${JSON.stringify(state, null, 2)}\n`));
    RUNS.set(runId, state);
    return jsonResult({ ok: true, run_id: runId, run_status: state.status, paid_call_count: 0, artifact_path: artifactPath(runId, "manifest") });
  }
  if (suffix === TOOL_SUFFIX.runStatus) return jsonResult({ ok: true, ...(await loadState(rootDir, text(args.run_id))) });
  if (suffix === TOOL_SUFFIX.getArtifact) return jsonResult({ ok: true, run_id: text(args.run_id), artifact_path: artifactPath(text(args.run_id), text(args.artifact_type)) });
  if (suffix === TOOL_SUFFIX.approveStage) return jsonResult({ ok: true, run_id: text(args.run_id), run_status: "running" });
  if (suffix === TOOL_SUFFIX.postChoice || suffix === TOOL_SUFFIX.submitCritique) {
    const state = await loadState(rootDir, text(args.run_id));
    if (state.status !== "running") return jsonResult({ ok: false, error: { code: "INVALID_RUN_STATE", message: `Pipeline_Run is ${state.status}.` } });
    return jsonResult({ ok: true, run_id: state.run_id, run_status: state.status });
  }
  return jsonResult({ ok: false, error: { code: "UNKNOWN_SHOWRUNNER_TOOL", message: `Unknown showrunner tool: ${toolName}` } });
}
