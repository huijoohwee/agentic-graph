import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { strFromU8, unzipSync } from "fflate";

import * as officeRuntime from "../../grph-shared/dist/office/markdownOfficeArtifacts.js";
import { publishMicrosoftArtifact } from "../export-microsoft-adapter.js";
import { ExportProviderError } from "../export-provider-http.js";

const MIME_TYPES = Object.freeze({
  spreadsheet: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  slides: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
});

const stableFileName = ({ identity, kind }) => {
  const extension = kind === "spreadsheet" ? "xlsx" : "pptx";
  const digest = crypto.createHash("sha256").update(identity).digest("hex").slice(0, 12);
  return `docs-investor-pack.md-${digest}.${extension}`;
};

const jsonResponse = (body, status = 200) => new Response(
  status === 204 ? null : JSON.stringify(body),
  {
    status,
    headers: status === 204 ? {} : { "Content-Type": "application/json" },
  },
);

const sourceArtifact = ({ kind }) => {
  const body = kind === "spreadsheet"
    ? "# Financial Model\n\n| Year | Revenue | Margin |\n|---|---:|---:|\n| 2026 | RM 1,250 | 25% |\n| 2027 | RM 2,500 | 30% |"
    : "# Investor Thesis\n\n- Durable demand\n\n---\n\n# Financial Outlook\n\n- Profitable growth";
  return Object.freeze({
    artifact_id: "docs/investor-pack.md",
    title: "Investor Pack",
    body,
    markdown: `---\ntitle: Investor Pack\nprivate_note: hidden\n---\n\n${body}`,
    source_sha256: "b".repeat(64),
  });
};

const recordCall = (url, init = {}) => ({
  url: String(url),
  method: init.method || "GET",
  headers: init.headers || {},
  body: init.body,
});

for (const kind of ["spreadsheet", "slides"]) {
  test(`Microsoft ${kind} uploads a real native Office package and verifies Graph read-back`, async () => {
    const calls = [];
    let uploadedBytes;
    const itemId = `item-${kind}`;
    const identity = `["docs/investor-pack.md","microsoft","${kind}"]`;
    const fetchImpl = async (url, init = {}) => {
      const call = recordCall(url, init);
      calls.push(call);
      if (call.url.includes("/me/drive/root:/") && call.method === "GET") {
        return jsonResponse({ error: { message: "Not found" } }, 404);
      }
      if (call.url.includes("/me/drive/root:/") && call.method === "PUT") {
        uploadedBytes = call.body;
        return jsonResponse({ id: itemId });
      }
      if (call.url.includes(`/me/drive/items/${itemId}?`) && call.method === "GET") {
        return jsonResponse({
          id: itemId,
          name: stableFileName({ identity, kind }),
          webUrl: `https://onedrive.live.com/?id=${itemId}`,
          size: uploadedBytes.byteLength,
          file: { mimeType: MIME_TYPES[kind] },
        });
      }
      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    };

    const source = sourceArtifact({ kind });
    const before = structuredClone(source);
    const result = await publishMicrosoftArtifact({
      artifact: source,
      kind,
      identity,
      env: { AGENTICGRAPH_MICROSOFT_ONEDRIVE_FOLDER: "AgenticGraph Acceptance" },
      fetchImpl,
      officeRuntime,
      resolveAccessToken: async () => "microsoft-token",
    });

    assert.deepEqual(source, before);
    assert.equal(result.provider, "microsoft");
    assert.equal(result.externalId, itemId);
    assert.equal(result.mimeType, MIME_TYPES[kind]);
    assert.equal(result.created, true);
    assert.equal(result.byteLength, uploadedBytes.byteLength);
    assert.match(result.sha256, /^[0-9a-f]{64}$/);
    assert.ok(uploadedBytes instanceof Uint8Array);
    assert.equal(uploadedBytes[0], 0x50);
    assert.equal(uploadedBytes[1], 0x4b);

    const upload = calls.find((call) => call.method === "PUT");
    assert.equal(upload.headers["Content-Type"], MIME_TYPES[kind]);
    assert.equal(upload.headers.Authorization, "Bearer microsoft-token");
    assert.ok(upload.url.includes("AgenticGraph%20Acceptance"));
    assert.ok(upload.url.endsWith(":/content"));

    const parts = unzipSync(uploadedBytes);
    assert.ok(parts["[Content_Types].xml"]);
    const primaryPart = kind === "spreadsheet" ? "xl/workbook.xml" : "ppt/presentation.xml";
    assert.ok(parts[primaryPart]);
    const allXml = Object.entries(parts)
      .filter(([name]) => name.endsWith(".xml"))
      .map(([, bytes]) => strFromU8(bytes))
      .join("\n");
    assert.ok(!allXml.includes("private_note: hidden"));
  });
}

test("Microsoft reuses an existing ledger item ID and updates it in place", async () => {
  const calls = [];
  let uploadedBytes;
  const identity = "stable-microsoft-sheet";
  const fetchImpl = async (url, init = {}) => {
    const call = recordCall(url, init);
    calls.push(call);
    if (call.url.includes("/me/drive/items/item-existing?") && call.method === "GET") {
      return jsonResponse({
        id: "item-existing",
        name: stableFileName({ identity, kind: "spreadsheet" }),
        webUrl: "https://onedrive.live.com/?id=item-existing",
        size: uploadedBytes?.byteLength || 1,
        file: { mimeType: MIME_TYPES.spreadsheet },
      });
    }
    if (call.url.endsWith("/me/drive/items/item-existing/content") && call.method === "PUT") {
      uploadedBytes = call.body;
      return jsonResponse({ id: "item-existing" });
    }
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  };

  const result = await publishMicrosoftArtifact({
    artifact: sourceArtifact({ kind: "spreadsheet" }),
    kind: "spreadsheet",
    identity,
    existing: { external_id: "item-existing" },
    fetchImpl,
    officeRuntime,
    resolveAccessToken: async () => "microsoft-token",
  });

  assert.equal(result.created, false);
  assert.equal(result.externalId, "item-existing");
  assert.equal(calls.length, 3);
  assert.equal(calls.some((call) => call.url.includes("/me/drive/root:/")), false);
  assert.equal(calls.filter((call) => call.method === "PUT").length, 1);
});

test("Microsoft ignores a renamed ledger item and updates only the canonical stable path item", async () => {
  const calls = [];
  const identity = "stable-microsoft-sheet";
  const fileName = stableFileName({ identity, kind: "spreadsheet" });
  let uploadedBytes;
  const fetchImpl = async (url, init = {}) => {
    const call = recordCall(url, init);
    calls.push(call);
    if (call.url.includes("/me/drive/items/item-renamed?") && call.method === "GET") {
      return jsonResponse({
        id: "item-renamed",
        name: "unrelated-quarterly-payroll.xlsx",
        size: 100,
        file: { mimeType: MIME_TYPES.spreadsheet },
      });
    }
    if (call.url.includes("/me/drive/root:/") && call.method === "GET") {
      return jsonResponse({
        id: "item-canonical",
        name: fileName,
        size: uploadedBytes?.byteLength || 1,
        file: { mimeType: MIME_TYPES.spreadsheet },
      });
    }
    if (call.url.endsWith("/me/drive/items/item-canonical/content") && call.method === "PUT") {
      uploadedBytes = call.body;
      return jsonResponse({ id: "item-canonical" });
    }
    if (call.url.includes("/me/drive/items/item-canonical?") && call.method === "GET") {
      return jsonResponse({
        id: "item-canonical",
        name: fileName,
        webUrl: "https://onedrive.live.com/?id=item-canonical",
        size: uploadedBytes.byteLength,
        file: { mimeType: MIME_TYPES.spreadsheet },
      });
    }
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  };

  const result = await publishMicrosoftArtifact({
    artifact: sourceArtifact({ kind: "spreadsheet" }),
    kind: "spreadsheet",
    identity,
    existing: { external_id: "item-renamed" },
    fetchImpl,
    officeRuntime,
    resolveAccessToken: async () => "microsoft-token",
  });

  assert.equal(result.externalId, "item-canonical");
  assert.equal(result.created, false);
  assert.equal(result.apiCalls, 4);
  assert.equal(calls.filter((call) => call.url.includes("item-renamed")).length, 1);
  assert.equal(calls.some((call) => call.url.includes("item-renamed") && call.method !== "GET"), false);
  assert.equal(calls.filter((call) => call.method === "PUT").length, 1);
});

test("Microsoft fails closed when the canonical path is occupied by a conflicting item", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const call = recordCall(url, init);
    calls.push(call);
    if (call.url.includes("/me/drive/root:/") && call.method === "GET") {
      return jsonResponse({
        id: "path-conflict",
        name: "folder-with-the-generated-name",
        folder: { childCount: 2 },
      });
    }
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  };

  await assert.rejects(
    publishMicrosoftArtifact({
      artifact: sourceArtifact({ kind: "slides" }),
      kind: "slides",
      identity: "microsoft-path-conflict",
      fetchImpl,
      officeRuntime,
      resolveAccessToken: async () => "microsoft-token",
    }),
    (error) => error instanceof ExportProviderError && error.code === "PROVIDER_IDENTITY_CONFLICT",
  );
  assert.equal(calls.length, 1);
  assert.equal(calls.some((call) => call.method === "PUT"), false);
});

test("Microsoft rejects non-canonical OneDrive folders before auth or egress", async () => {
  let authCalls = 0;
  let fetchCalls = 0;
  for (const folderPath of ["../Finance", "Finance/./Reports", "Finance//Reports", "Finance\\Reports", "Finance/\u0000Reports"]) {
    await assert.rejects(
      publishMicrosoftArtifact({
        artifact: sourceArtifact({ kind: "spreadsheet" }),
        kind: "spreadsheet",
        identity: "invalid-microsoft-folder",
        env: { AGENTICGRAPH_MICROSOFT_ONEDRIVE_FOLDER: folderPath },
        fetchImpl: async () => { fetchCalls += 1; },
        officeRuntime,
        resolveAccessToken: async () => { authCalls += 1; return "microsoft-token"; },
      }),
      (error) => error instanceof ExportProviderError && error.code === "PROVIDER_CONFIG_INVALID",
    );
  }
  assert.equal(authCalls, 0);
  assert.equal(fetchCalls, 0);
});

test("Microsoft deletes a newly-created file when Graph read-back does not match", async () => {
  const calls = [];
  let uploadedBytes;
  const identity = "cleanup-microsoft-slides";
  const fetchImpl = async (url, init = {}) => {
    const call = recordCall(url, init);
    calls.push(call);
    if (call.url.includes("/me/drive/root:/") && call.method === "GET") {
      return jsonResponse({ error: { message: "Not found" } }, 404);
    }
    if (call.url.includes("/me/drive/root:/") && call.method === "PUT") {
      uploadedBytes = call.body;
      return jsonResponse({ id: "item-partial" });
    }
    if (call.url.includes("/me/drive/items/item-partial?") && call.method === "GET") {
      return jsonResponse({
        id: "item-partial",
        name: stableFileName({ identity, kind: "slides" }),
        webUrl: "https://onedrive.live.com/?id=item-partial",
        size: uploadedBytes.byteLength,
        file: { mimeType: "application/octet-stream" },
      });
    }
    if (call.url.endsWith("/me/drive/items/item-partial") && call.method === "DELETE") {
      return jsonResponse(null, 204);
    }
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  };

  await assert.rejects(
    publishMicrosoftArtifact({
      artifact: sourceArtifact({ kind: "slides" }),
      kind: "slides",
      identity,
      fetchImpl,
      officeRuntime,
      resolveAccessToken: async () => "microsoft-token",
    }),
    (error) => error instanceof ExportProviderError && error.code === "PROVIDER_VERIFY_FAILED",
  );
  assert.equal(calls.filter((call) => call.method === "DELETE").length, 1);
});
