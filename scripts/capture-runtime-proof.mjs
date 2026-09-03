#!/usr/bin/env node
// Hosted live-proof helper for the agentic-graph AWS Agent-API path.
//
// This script performs the minimum operator-safe proof sequence against a
// DEPLOYED Agent-API:
//   1. POST /auth/session
//   2. POST /run with approvals:[]
//   3. GET /runs/{id} with the same Auth_Token
//
// The goal is to prove the hosted path needed for judging:
//   same browser/session -> minted token -> accepted run -> persisted read-back
//
// Optional FRONTEND_URL / MCP_ENDPOINT inputs let the proof output include the
// full set of reachable URLs that should appear in the Demo_Pack.

function requireEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    console.error(`runtime:proof refused: ${name} is required.`);
    process.exit(1);
  }
  return value.trim();
}

function optionalEnv(name, fallback = undefined) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function joinUrl(base, path) {
  return `${String(base).replace(/\/+$/, "")}${path}`;
}

async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { rawText: text };
  }
}

function extractManifestCarrier(payload) {
  if (payload?.manifest && typeof payload.manifest === "object") return payload.manifest;
  if (payload?.result?.structuredContent && typeof payload.result.structuredContent === "object") {
    return payload.result.structuredContent;
  }
  if (payload && typeof payload === "object" && typeof payload.runId === "string") return payload;
  return null;
}

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    body: await parseJsonResponse(res),
  };
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      ...headers,
    },
  });
  return {
    status: res.status,
    body: await parseJsonResponse(res),
  };
}

async function main() {
  const agentApiUrl = optionalEnv("MCP_ENDPOINT", "https://airvio.co/agentic-os/control-plane/mcp");
  const referenceUrl = optionalEnv("REFERENCE_URL", "https://example.com/reference-video.mp4");
  const brief = optionalEnv(
    "BRIEF",
    "Hosted proof run: verify blocked live submission plus same-session persisted read-back.",
  );
  const budgetUsdRaw = optionalEnv("BUDGET_USD", "10");
  const budgetUsd = Number(budgetUsdRaw);
  const frontendUrl = optionalEnv("FRONTEND_URL");
  const mcpEndpoint = optionalEnv("MCP_ENDPOINT", "https://airvio.co/agentic-os/control-plane/mcp");
  const outputPath = optionalEnv("PROOF_OUTPUT_PATH");

  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
    console.error("runtime:proof refused: BUDGET_USD must be a positive number.");
    process.exit(1);
  }

  const auth = await postJson(joinUrl(agentApiUrl, "/auth/session"), {});
  if (auth.status !== 201 || typeof auth.body?.token !== "string" || auth.body.token.length === 0) {
    console.error("runtime:proof failed at POST /auth/session");
    console.error(JSON.stringify(auth, null, 2));
    process.exit(1);
  }

  const token = auth.body.token;
  const run = await postJson(
    joinUrl(agentApiUrl, "/run"),
    {
      referenceUrl,
      brief,
      budgetUsd,
      approvals: [],
    },
    { authorization: `Bearer ${token}` },
  );
  if (run.status !== 202) {
    console.error("runtime:proof failed at POST /run");
    console.error(JSON.stringify(run, null, 2));
    process.exit(1);
  }

  const submittedManifest = extractManifestCarrier(run.body);
  const runId = submittedManifest?.runId;
  if (typeof runId !== "string" || runId.length === 0) {
    console.error("runtime:proof failed: POST /run returned no runId.");
    console.error(JSON.stringify(run.body, null, 2));
    process.exit(1);
  }

  const readback = await getJson(
    joinUrl(agentApiUrl, `/runs/${encodeURIComponent(runId)}`),
    { authorization: `Bearer ${token}` },
  );
  if (readback.status !== 200) {
    console.error("runtime:proof failed at GET /runs/{id}");
    console.error(JSON.stringify(readback, null, 2));
    process.exit(1);
  }

  const persistedManifest = extractManifestCarrier(readback.body);
  if (persistedManifest?.runId !== runId) {
    console.error("runtime:proof failed: persisted read-back runId mismatch.");
    console.error(JSON.stringify(readback.body, null, 2));
    process.exit(1);
  }

  const proof = {
    proofVersion: "1",
    generatedAt: new Date().toISOString(),
    workerUrl: agentApiUrl,
    frontendUrl: frontendUrl ?? null,
    mcpEndpoint,
    authSession: {
      status: auth.status,
      subject: auth.body.subject ?? null,
      entitledRunIds: auth.body.entitledRunIds ?? null,
    },
    runSubmission: {
      status: run.status,
      runId,
      state: submittedManifest?.state ?? null,
      mode: submittedManifest?.mode ?? null,
      approvalGateCount: Array.isArray(submittedManifest?.approvalGates)
        ? submittedManifest.approvalGates.length
        : null,
      actualCostUsd: submittedManifest?.budgetMeters?.actualCostUsd ?? null,
      providerSpendUsd: submittedManifest?.budgetMeters?.providerSpendUsd ?? null,
      responseBody: run.body,
      manifest: submittedManifest,
    },
    readback: {
      status: readback.status,
      persistedAt: readback.body?.persistedAt ?? null,
      contractVersion: readback.body?.contractVersion ?? null,
      sameRunId: persistedManifest?.runId === runId,
      sameState: persistedManifest?.state === submittedManifest?.state,
      sameMode: persistedManifest?.mode === submittedManifest?.mode,
      responseBody: readback.body,
      manifest: persistedManifest,
    },
    demoPackUrls: [
      ...(frontendUrl ? [{ url: frontendUrl, kind: "frontend" }] : []),
      { url: joinUrl(agentApiUrl, "/health"), kind: "worker" },
      { url: joinUrl(agentApiUrl, `/runs/${encodeURIComponent(runId)}`), kind: "worker-run-readback" },
      ...(mcpEndpoint ? [{ url: joinUrl(mcpEndpoint, "/health"), kind: "control_plane" }] : []),
    ],
  };

  if (outputPath) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(outputPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  }

  console.log("\n  Hosted Runtime Proof");
  console.log("  " + "-".repeat(40));
  console.log(`  Auth session:   HTTP ${auth.status} -> subject ${proof.authSession.subject}`);
  console.log(`  Run submit:     HTTP ${run.status} -> runId ${runId} (${proof.runSubmission.state ?? "unknown"})`);
  console.log(`  Run read-back:  HTTP ${readback.status} -> persistedAt ${proof.readback.persistedAt ?? "n/a"}`);
  console.log("\n  Proof JSON:");
  console.log(JSON.stringify(proof, null, 2));
}

main().catch((err) => {
  console.error("runtime:proof unexpected error:", err?.message ?? err);
  process.exit(1);
});
