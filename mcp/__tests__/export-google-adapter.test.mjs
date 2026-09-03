import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import * as officeRuntime from "../../grph-shared/dist/office/markdownOfficeArtifacts.js";
import { publishGoogleArtifact } from "../export-google-adapter.js";
import { ExportProviderError } from "../export-provider-http.js";

const SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet";
const PRESENTATION_MIME = "application/vnd.google-apps.presentation";
const identityKey = (identity) => crypto.createHash("sha256").update(identity).digest("hex").slice(0, 48);

const jsonResponse = (body, status = 200) => new Response(
  status === 204 ? null : JSON.stringify(body),
  {
    status,
    headers: status === 204 ? {} : { "Content-Type": "application/json" },
  },
);

const artifact = ({ body, title = "Investor Pack" }) => Object.freeze({
  artifact_id: "docs/investor-pack.md",
  title,
  body,
  markdown: `---\ntitle: "${title}"\ninternal: true\n---\n\n${body}`,
  source_sha256: "a".repeat(64),
});

const callRecord = (url, init = {}) => ({
  url: String(url),
  method: init.method || "GET",
  headers: init.headers || {},
  body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
});

test("Google Sheets creates, writes atomically, reads back, and excludes KGC frontmatter", async () => {
  const calls = [];
  const identity = '["docs/investor-pack.md","google","spreadsheet"]';
  const source = artifact({
    body: "# Model\n\n| Year | Revenue | Margin |\n|---|---:|---:|\n| 2026 | RM 1,250 | 25% |\n| 2027 | RM 2,500 | 30% |\n",
  });
  const fetchImpl = async (url, init = {}) => {
    const call = callRecord(url, init);
    calls.push(call);
    if (call.url.includes("/drive/v3/files?") && call.method === "GET") {
      return jsonResponse({ files: [] });
    }
    if (call.url.includes("/drive/v3/files?") && call.method === "POST") {
      return jsonResponse({ id: "sheet-1", mimeType: SPREADSHEET_MIME });
    }
    if (call.url.includes("/spreadsheets/sheet-1?") && call.method === "GET") {
      return jsonResponse({
        sheets: [{ properties: { sheetId: 7, title: "Sheet1", gridProperties: { rowCount: 1000, columnCount: 26 } } }],
      });
    }
    if (call.url.endsWith("/spreadsheets/sheet-1:batchUpdate") && call.method === "POST") {
      return jsonResponse({ replies: [] });
    }
    if (call.url.includes("/drive/v3/files/sheet-1?") && call.method === "GET") {
      return jsonResponse({
        id: "sheet-1",
        name: "Investor Pack — Financial Model",
        mimeType: SPREADSHEET_MIME,
        webViewLink: "https://docs.google.com/spreadsheets/d/sheet-1/edit",
        trashed: false,
        appProperties: { agenticGraphIdentity: identityKey(identity) },
      });
    }
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  };

  const before = structuredClone(source);
  const result = await publishGoogleArtifact({
    artifact: source,
    kind: "spreadsheet",
    identity,
    env: {
      AGENTIC_OS_GOOGLE_SHARED_DRIVE_FOLDER_ID: "shared-drive-folder",
      AGENTIC_OS_GOOGLE_DRIVE_FOLDER_ID: "human-oauth-folder",
    },
    fetchImpl,
    officeRuntime,
    resolveAccessToken: async () => "google-token",
  });

  assert.deepEqual(source, before);
  assert.equal(result.externalId, "sheet-1");
  assert.equal(result.created, true);
  assert.equal(result.apiCalls, 5);
  assert.equal(result.url, "https://docs.google.com/spreadsheets/d/sheet-1/edit");
  assert.equal(calls.length, 5);
  assert.ok(calls.every((call) => call.headers.Authorization === "Bearer google-token"));

  const create = calls.find((call) => call.method === "POST" && call.url.includes("/drive/v3/files?"));
  assert.equal(create.body.mimeType, SPREADSHEET_MIME);
  assert.match(create.body.appProperties.agenticGraphIdentity, /^[0-9a-f]{48}$/);
  assert.deepEqual(create.body.parents, ["shared-drive-folder"]);
  const identityLookup = calls.find((call) => call.method === "GET" && call.url.includes("/drive/v3/files?"));
  assert.match(new URL(identityLookup.url).searchParams.get("q"), /'shared-drive-folder' in parents/);

  const batch = calls.find((call) => call.url.endsWith("sheet-1:batchUpdate"));
  assert.equal(batch.body.requests.length, 5);
  const write = batch.body.requests.find((request) => request.updateCells?.rows);
  assert.equal(write.updateCells.rows.length, 3);
  assert.equal(write.updateCells.rows[1].values[1].userEnteredValue.numberValue, 1250);
  assert.equal(write.updateCells.rows[1].values[2].userEnteredValue.numberValue, 0.25);
  assert.ok(!JSON.stringify(batch.body).includes("internal: true"));
});

test("Google Sheets reuses a ledger ID without creating or searching for another file", async () => {
  const calls = [];
  const identity = "stable-google-sheet";
  const fetchImpl = async (url, init = {}) => {
    const call = callRecord(url, init);
    calls.push(call);
    if (call.url.includes("/drive/v3/files/sheet-existing?") && call.method === "GET") {
      return jsonResponse({
        id: "sheet-existing",
        name: "Investor Pack — Financial Model",
        mimeType: SPREADSHEET_MIME,
        webViewLink: "https://docs.google.com/spreadsheets/d/sheet-existing/edit",
        trashed: false,
        appProperties: { agenticGraphIdentity: identityKey(identity) },
      });
    }
    if (call.url.includes("/spreadsheets/sheet-existing?") && call.method === "GET") {
      return jsonResponse({ sheets: [{ properties: { sheetId: 1, gridProperties: {} } }] });
    }
    if (call.url.endsWith("/spreadsheets/sheet-existing:batchUpdate")) return jsonResponse({});
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  };

  const result = await publishGoogleArtifact({
    artifact: artifact({ body: "| Year | Revenue |\n|---|---:|\n| 2026 | 100 |" }),
    kind: "spreadsheet",
    identity,
    existing: { external_id: "sheet-existing" },
    fetchImpl,
    officeRuntime,
    resolveAccessToken: async () => "google-token",
  });

  assert.equal(result.created, false);
  assert.equal(result.externalId, "sheet-existing");
  assert.equal(calls.length, 4);
  assert.equal(calls.filter((call) => call.url.includes("/drive/v3/files/sheet-existing?")).length, 2);
  assert.equal(calls.some((call) => call.method === "POST" && call.url.includes("/drive/v3/files?")), false);
  assert.equal(calls.some((call) => call.url.includes("q=")), false);
});

test("Google Slides creates and replaces slides in one atomic batch before read-back", async () => {
  const calls = [];
  const identity = "stable-google-slides";
  const fetchImpl = async (url, init = {}) => {
    const call = callRecord(url, init);
    calls.push(call);
    if (call.url.includes("/drive/v3/files?") && call.method === "GET") return jsonResponse({ files: [] });
    if (call.url.includes("/drive/v3/files?") && call.method === "POST") {
      return jsonResponse({ id: "slides-1", mimeType: PRESENTATION_MIME });
    }
    if (call.url.includes("/presentations/slides-1?")) {
      return jsonResponse({ slides: [{ objectId: "provider-default-slide" }] });
    }
    if (call.url.endsWith("/presentations/slides-1:batchUpdate")) return jsonResponse({ replies: [] });
    if (call.url.includes("/drive/v3/files/slides-1?") && call.method === "GET") {
      return jsonResponse({
        id: "slides-1",
        name: "Investor Pack — Slide Deck",
        mimeType: PRESENTATION_MIME,
        webViewLink: "https://docs.google.com/presentation/d/slides-1/edit",
        trashed: false,
        appProperties: { agenticGraphIdentity: identityKey(identity) },
      });
    }
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  };

  const result = await publishGoogleArtifact({
    artifact: artifact({ body: "# Market\n\n- Demand is growing\n\n---\n\n# Economics\n\n- Gross margin expands" }),
    kind: "slides",
    identity,
    fetchImpl,
    officeRuntime,
    resolveAccessToken: async () => "google-token",
  });

  assert.equal(result.externalId, "slides-1");
  assert.equal(result.apiCalls, 5);
  assert.equal(calls.some((call) => call.method === "PATCH"), false);
  const slideBatches = calls.filter((call) => call.url.endsWith("slides-1:batchUpdate"));
  assert.equal(slideBatches.length, 1);
  const requests = slideBatches[0].body.requests;
  assert.equal(requests.filter((request) => request.createSlide).length, 2);
  assert.deepEqual(
    requests.filter((request) => request.deleteObject).map((request) => request.deleteObject.objectId),
    ["provider-default-slide"],
  );
  assert.ok(requests.findIndex((request) => request.deleteObject) > requests.findIndex((request) => request.createSlide));
  assert.ok(!JSON.stringify(requests).includes("internal: true"));
});

test("Google ignores a malicious ledger ID and mutates only the canonical identity match", async () => {
  const calls = [];
  const identity = "stable-google-sheet";
  const canonicalIdentityKey = identityKey(identity);
  const fetchImpl = async (url, init = {}) => {
    const call = callRecord(url, init);
    calls.push(call);
    if (call.url.includes("/drive/v3/files/unrelated-file?") && call.method === "GET") {
      return jsonResponse({
        id: "unrelated-file",
        name: "Quarterly Payroll",
        mimeType: SPREADSHEET_MIME,
        trashed: false,
        appProperties: { agenticGraphIdentity: "not-the-requested-identity" },
      });
    }
    if (call.url.includes("/drive/v3/files?") && call.method === "GET") {
      return jsonResponse({
        files: [{
          id: "sheet-canonical",
          name: "Investor Pack — Financial Model",
          mimeType: SPREADSHEET_MIME,
          trashed: false,
          appProperties: { agenticGraphIdentity: canonicalIdentityKey },
        }],
      });
    }
    if (call.url.includes("/spreadsheets/sheet-canonical?") && call.method === "GET") {
      return jsonResponse({ sheets: [{ properties: { sheetId: 1, gridProperties: {} } }] });
    }
    if (call.url.endsWith("/spreadsheets/sheet-canonical:batchUpdate")) return jsonResponse({});
    if (call.url.includes("/drive/v3/files/sheet-canonical?") && call.method === "GET") {
      return jsonResponse({
        id: "sheet-canonical",
        name: "Investor Pack — Financial Model",
        mimeType: SPREADSHEET_MIME,
        webViewLink: "https://docs.google.com/spreadsheets/d/sheet-canonical/edit",
        trashed: false,
        appProperties: { agenticGraphIdentity: canonicalIdentityKey },
      });
    }
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  };

  const result = await publishGoogleArtifact({
    artifact: artifact({ body: "| Year | Revenue |\n|---|---:|\n| 2026 | 100 |" }),
    kind: "spreadsheet",
    identity,
    existing: { external_id: "unrelated-file" },
    fetchImpl,
    officeRuntime,
    resolveAccessToken: async () => "google-token",
  });

  assert.equal(result.externalId, "sheet-canonical");
  assert.equal(result.created, false);
  assert.equal(result.apiCalls, 5);
  assert.equal(calls.filter((call) => call.url.includes("unrelated-file")).length, 1);
  assert.equal(calls.some((call) => call.url.includes("unrelated-file") && call.method !== "GET"), false);
  assert.equal(calls.some((call) => call.method === "POST" && call.url.includes("/drive/v3/files?")), false);
});

test("Google restores a renamed Slides file before replacing its slide content", async () => {
  const calls = [];
  const identity = "renamed-google-slides";
  let ledgerReads = 0;
  const fetchImpl = async (url, init = {}) => {
    const call = callRecord(url, init);
    calls.push(call);
    if (call.url.includes("/drive/v3/files/slides-renamed?") && call.method === "GET") {
      ledgerReads += 1;
      return jsonResponse({
        id: "slides-renamed",
        name: ledgerReads === 1 ? "User Renamed Deck" : "Investor Pack — Slide Deck",
        mimeType: PRESENTATION_MIME,
        webViewLink: "https://docs.google.com/presentation/d/slides-renamed/edit",
        trashed: false,
        appProperties: { agenticGraphIdentity: identityKey(identity) },
      });
    }
    if (call.url.includes("/drive/v3/files/slides-renamed?") && call.method === "PATCH") {
      assert.deepEqual(call.body, { name: "Investor Pack — Slide Deck" });
      return jsonResponse({ id: "slides-renamed", name: "Investor Pack — Slide Deck" });
    }
    if (call.url.includes("/presentations/slides-renamed?") && call.method === "GET") {
      return jsonResponse({ slides: [{ objectId: "old-slide" }] });
    }
    if (call.url.endsWith("/presentations/slides-renamed:batchUpdate")) return jsonResponse({ replies: [] });
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  };

  const result = await publishGoogleArtifact({
    artifact: artifact({ body: "# Market\n\n- Demand is growing" }),
    kind: "slides",
    identity,
    existing: { external_id: "slides-renamed" },
    fetchImpl,
    officeRuntime,
    resolveAccessToken: async () => "google-token",
  });

  assert.equal(result.externalId, "slides-renamed");
  assert.equal(result.created, false);
  assert.equal(result.apiCalls, 5);
  assert.equal(calls.filter((call) => call.method === "PATCH").length, 1);
  assert.ok(calls.findIndex((call) => call.method === "PATCH") < calls.findIndex((call) => call.url.includes(":batchUpdate")));
});

test("Google deletes a newly-created artifact when the atomic content write fails", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const call = callRecord(url, init);
    calls.push(call);
    if (call.url.includes("/drive/v3/files?") && call.method === "GET") return jsonResponse({ files: [] });
    if (call.url.includes("/drive/v3/files?") && call.method === "POST") {
      return jsonResponse({ id: "sheet-partial", mimeType: SPREADSHEET_MIME });
    }
    if (call.url.includes("/spreadsheets/sheet-partial?")) {
      return jsonResponse({ sheets: [{ properties: { sheetId: 1, gridProperties: {} } }] });
    }
    if (call.url.endsWith("/spreadsheets/sheet-partial:batchUpdate")) {
      return jsonResponse({ error: { message: "Service temporarily unavailable" } }, 503);
    }
    if (call.url.includes("/drive/v3/files/sheet-partial?") && call.method === "DELETE") {
      return jsonResponse(null, 204);
    }
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  };

  await assert.rejects(
    publishGoogleArtifact({
      artifact: artifact({ body: "| Year | Revenue |\n|---|---:|\n| 2026 | 100 |" }),
      kind: "spreadsheet",
      identity: "cleanup-google-sheet",
      fetchImpl,
      officeRuntime,
      resolveAccessToken: async () => "google-token",
    }),
    (error) => error instanceof ExportProviderError && error.status === 503 && error.retryable === true,
  );
  assert.equal(calls.filter((call) => call.method === "DELETE").length, 1);
});
