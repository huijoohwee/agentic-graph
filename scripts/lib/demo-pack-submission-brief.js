import { validateDemoPack } from "../../contracts/demo-pack.schema.js";

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function truthyBoolean(value) {
  return value === true;
}

function renderUrlLines(urls = []) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return ["- No URLs recorded."];
  }
  return urls.map((entry) => {
    const url = cleanString(entry?.url, "(missing)");
    const kind = cleanString(entry?.kind, "unknown");
    const reachable = "reachable" in (entry ?? {}) ? (entry.reachable ? "reachable" : "unverified") : "recorded";
    return `- \`${kind}\`: ${url} (${reachable})`;
  });
}

function summarizeSections(sections = []) {
  if (!Array.isArray(sections)) return [];
  return sections.map((section) => {
    const dimension = cleanString(section?.dimension, "Unknown Dimension");
    const evidence = cleanString(section?.evidence, "No evidence recorded.");
    const verified = truthyBoolean(section?.verified) ? "verified" : "unverified";
    return `### ${dimension}\n\n- Status: ${verified}\n- Evidence: ${evidence}`;
  });
}

export function buildSubmissionBriefMarkdown(artifact, options = {}) {
  if (!isPlainObject(artifact)) {
    throw new Error("submission brief export requires an artifact object");
  }
  const demoPack = artifact.demoPack;
  if (!isPlainObject(demoPack)) {
    throw new Error("submission brief export requires artifact.demoPack");
  }

  const validation = validateDemoPack(demoPack);
  if (!validation.valid) {
    throw new Error(`submission brief export requires a valid Demo_Pack: ${JSON.stringify(validation.errors)}`);
  }

  const title = cleanString(
    options.title,
    `AgenticGraph Submission Brief — ${cleanString(artifact.runId, "unknown-run")}`,
  );
  const runId = cleanString(artifact.runId, "unknown-run");
  const manifestState = cleanString(artifact.manifestState, "unknown");
  const manifestMode = cleanString(artifact.manifestMode, "unknown");
  const generatedAt = cleanString(artifact.generatedAt, new Date().toISOString());
  const proofSummary = isPlainObject(artifact.proofSummary) ? artifact.proofSummary : {};
  const supplementalUrls = Array.isArray(artifact.supplementalUrls) ? artifact.supplementalUrls : [];

  const lines = [
    `# ${title}`,
    "",
    `- Generated: ${generatedAt}`,
    `- Run ID: \`${runId}\``,
    `- Manifest state: \`${manifestState}\``,
    `- Manifest mode: \`${manifestMode}\``,
    "",
    "## Summary",
    "",
    "- Product: autonomous reference-video-to-remix agent with Cloudflare control plane, AWS REST access surface, and Vercel frontend.",
    "- Proof path: hosted `POST /auth/session` -> `POST /run` -> same-session `GET /runs/{id}`.",
    `- Proof status: auth ${proofSummary.authSessionStatus ?? "n/a"}, submit ${proofSummary.runSubmissionStatus ?? "n/a"}, read-back ${proofSummary.readbackStatus ?? "n/a"}.`,
    `- Persistence: persistedAt ${cleanString(proofSummary.persistedAt, "n/a")}.`,
    "",
    "## Reachable URLs",
    "",
    ...renderUrlLines(demoPack.urls),
    ...(supplementalUrls.length > 0
      ? ["", "## Supplemental URLs", "", ...renderUrlLines(supplementalUrls)]
      : []),
    "",
    "## Judge Dimensions",
    "",
    ...summarizeSections(demoPack.sections).flatMap((block) => [block, ""]),
    "## Validation",
    "",
    `- Demo_Pack valid: ${artifact.demoPackValidation?.valid === true ? "true" : "false"}`,
    `- Same run id across submit/read-back: ${proofSummary.sameRunId === true ? "true" : "false"}`,
    `- Same state across submit/read-back: ${proofSummary.sameState === true ? "true" : "false"}`,
    `- Same mode across submit/read-back: ${proofSummary.sameMode === true ? "true" : "false"}`,
  ];

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}
