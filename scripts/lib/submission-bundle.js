import { basename } from "node:path";

function cleanString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sectionBlocks(sections = []) {
  if (!Array.isArray(sections)) return [];
  return sections.map((section) => ({
    dimension: cleanString(section?.dimension, "Unknown Dimension"),
    evidence: cleanString(section?.evidence, "No evidence recorded."),
    verified: section?.verified === true,
  }));
}

function urlBlocks(urls = []) {
  if (!Array.isArray(urls)) return [];
  return urls.map((entry) => ({
    kind: cleanString(entry?.kind, "unknown"),
    url: cleanString(entry?.url, "(missing)"),
    reachable: entry?.reachable === true,
  }));
}

export function buildBundleIndexMarkdown(bundle = {}) {
  const runId = cleanString(bundle?.demoPackArtifact?.runId, "unknown-run");
  const manifestState = cleanString(bundle?.demoPackArtifact?.manifestState, "unknown");
  const manifestMode = cleanString(bundle?.demoPackArtifact?.manifestMode, "unknown");
  const proofSummary = bundle?.demoPackArtifact?.proofSummary ?? {};
  const urls = urlBlocks(bundle?.demoPackArtifact?.demoPack?.urls);
  const sections = sectionBlocks(bundle?.demoPackArtifact?.demoPack?.sections);

  const lines = [
    `# agentic-graph Submission Bundle — ${runId}`,
    "",
    `- Run ID: \`${runId}\``,
    `- Manifest state: \`${manifestState}\``,
    `- Manifest mode: \`${manifestMode}\``,
    `- Proof statuses: auth ${proofSummary.authSessionStatus ?? "n/a"}, submit ${proofSummary.runSubmissionStatus ?? "n/a"}, read-back ${proofSummary.readbackStatus ?? "n/a"}`,
    "",
    "## Files",
    "",
    `- [${basename(bundle?.proofFileName ?? "runtime-proof.json")}](./${basename(bundle?.proofFileName ?? "runtime-proof.json")})`,
    `- [${basename(bundle?.demoPackFileName ?? "runtime-demo-pack.json")}](./${basename(bundle?.demoPackFileName ?? "runtime-demo-pack.json")})`,
    `- [${basename(bundle?.briefFileName ?? "runtime-submission-brief.md")}](./${basename(bundle?.briefFileName ?? "runtime-submission-brief.md")})`,
    `- [summary.html](./summary.html)`,
    "",
    "## Reachable URLs",
    "",
    ...(urls.length > 0 ? urls.map((entry) => `- \`${entry.kind}\`: ${entry.url}`) : ["- No URLs recorded."]),
    "",
    "## Judge Dimensions",
    "",
    ...(sections.length > 0
      ? sections.flatMap((section) => [
          `### ${section.dimension}`,
          "",
          `- Status: ${section.verified ? "verified" : "unverified"}`,
          `- Evidence: ${section.evidence}`,
          "",
        ])
      : ["- No judging sections recorded.", ""]),
  ];

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

export function buildBundleSummaryHtml(bundle = {}) {
  const artifact = bundle?.demoPackArtifact ?? {};
  const runId = cleanString(artifact.runId, "unknown-run");
  const manifestState = cleanString(artifact.manifestState, "unknown");
  const manifestMode = cleanString(artifact.manifestMode, "unknown");
  const proofSummary = artifact.proofSummary ?? {};
  const urls = urlBlocks(artifact?.demoPack?.urls);
  const sections = sectionBlocks(artifact?.demoPack?.sections);

  const urlItems = urls.length > 0
    ? urls
        .map(
          (entry) =>
            `<li><strong>${escapeHtml(entry.kind)}</strong>: <a href="${escapeHtml(entry.url)}">${escapeHtml(entry.url)}</a></li>`,
        )
        .join("\n")
    : "<li>No URLs recorded.</li>";

  const sectionItems = sections.length > 0
    ? sections
        .map(
          (section) => `
        <article class="card">
          <h3>${escapeHtml(section.dimension)}</h3>
          <p><strong>Status:</strong> ${section.verified ? "verified" : "unverified"}</p>
          <p>${escapeHtml(section.evidence)}</p>
        </article>`,
        )
        .join("\n")
    : `<article class="card"><p>No judging sections recorded.</p></article>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>agentic-graph Submission Bundle</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #0b1020;
        --panel: #141b33;
        --text: #eef2ff;
        --muted: #b8c0ff;
        --accent: #7c9cff;
        --border: rgba(255,255,255,0.12);
      }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        background: linear-gradient(180deg, #0b1020 0%, #11182d 100%);
        color: var(--text);
      }
      main {
        max-width: 1080px;
        margin: 0 auto;
        padding: 32px 20px 72px;
      }
      .hero, .card {
        background: rgba(20, 27, 51, 0.92);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 20px;
      }
      .hero h1, .card h2, .card h3 {
        margin-top: 0;
      }
      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }
      .links a { color: var(--accent); }
      code {
        background: rgba(255,255,255,0.08);
        padding: 2px 6px;
        border-radius: 8px;
      }
      ul {
        padding-left: 20px;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>agentic-graph Submission Bundle</h1>
        <p>Portable review bundle generated from the hosted proof artifacts.</p>
        <p><strong>Run ID:</strong> <code>${escapeHtml(runId)}</code></p>
        <p><strong>Manifest:</strong> state <code>${escapeHtml(manifestState)}</code>, mode <code>${escapeHtml(manifestMode)}</code></p>
        <p><strong>Proof statuses:</strong> auth ${escapeHtml(proofSummary.authSessionStatus ?? "n/a")}, submit ${escapeHtml(proofSummary.runSubmissionStatus ?? "n/a")}, read-back ${escapeHtml(proofSummary.readbackStatus ?? "n/a")}</p>
        <p class="links"><a href="./index.md">index.md</a> · <a href="./${escapeHtml(basename(bundle?.briefFileName ?? "runtime-submission-brief.md"))}">submission brief</a> · <a href="./${escapeHtml(basename(bundle?.demoPackFileName ?? "runtime-demo-pack.json"))}">demo pack json</a> · <a href="./${escapeHtml(basename(bundle?.proofFileName ?? "runtime-proof.json"))}">proof json</a></p>
      </section>

      <section class="card" style="margin-top:16px">
        <h2>Reachable URLs</h2>
        <ul>${urlItems}</ul>
      </section>

      <section style="margin-top:16px">
        <div class="grid">
          ${sectionItems}
        </div>
      </section>
    </main>
  </body>
</html>
`;
}
