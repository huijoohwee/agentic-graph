import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

import { validateAgentTeamSourceDocument } from "../contracts/agent-team.schema.js";
import { digestAgentTeamValue } from "./agent-team-store.js";

const MAX_SOURCE_BYTES = 256 * 1024;

export const digestAgentTeamSourceDocument = (document) => {
  const canonical = structuredClone(document);
  if (canonical?.source && typeof canonical.source === "object") delete canonical.source.digest;
  return digestAgentTeamValue(canonical);
};

const resolveLocalSourcePath = (rootDir, uri) => {
  const value = String(uri || "").trim();
  if (!value || value.includes("\0")) {
    throw Object.assign(new Error("Agent-team source URI must be a non-empty local path."), { code: "invalid_team_source_uri" });
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    throw Object.assign(new Error("Agent-team source URI must be workspace-local; network and scheme-based sources are not accepted."), { code: "unsupported_team_source_uri" });
  }
  return path.resolve(rootDir, value);
};

export async function loadLocalAgentTeamSource(identity, { rootDir } = {}) {
  const runtimeRoot = path.resolve(rootDir || process.cwd());
  const sourcePath = resolveLocalSourcePath(runtimeRoot, identity?.uri);
  const rootReal = await fs.realpath(runtimeRoot);
  const pathStat = await fs.lstat(sourcePath).catch((error) => {
    throw Object.assign(new Error(`Agent-team source is unavailable: ${error?.code || "read_failed"}.`), { code: "team_source_unavailable" });
  });
  if (!pathStat.isFile() || pathStat.isSymbolicLink() || pathStat.size > MAX_SOURCE_BYTES) {
    throw Object.assign(new Error("Agent-team source must be a bounded regular non-symlink file."), { code: "invalid_team_source_file" });
  }
  const sourceReal = await fs.realpath(sourcePath).catch((error) => {
    throw Object.assign(new Error(`Agent-team source is unavailable: ${error?.code || "read_failed"}.`), { code: "team_source_unavailable" });
  });
  const relative = path.relative(rootReal, sourceReal);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw Object.assign(new Error("Agent-team source must be a regular file strictly inside the runtime root."), { code: "team_source_outside_root" });
  }
  let handle;
  let document;
  try {
    handle = await fs.open(sourcePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) throw new Error("invalid_file");
    document = JSON.parse(await handle.readFile("utf8"));
  } catch {
    throw Object.assign(new Error("Agent-team source must contain valid UTF-8 JSON."), { code: "invalid_team_source_json" });
  } finally {
    await handle?.close().catch(() => undefined);
  }
  const validation = validateAgentTeamSourceDocument(document);
  if (!validation.ok) {
    throw Object.assign(new Error("Agent-team source contract failed validation."), {
      code: "invalid_team_source_contract",
      details: validation.issues,
    });
  }
  const expectedUri = String(identity?.uri || "");
  const expectedDigest = String(identity?.digest || "");
  const actualDigest = digestAgentTeamSourceDocument(document);
  if (document.source.uri !== expectedUri || document.source.digest !== expectedDigest || actualDigest !== expectedDigest) {
    throw Object.assign(new Error("Agent-team source URI or digest does not match the exact local contract."), {
      code: "team_source_digest_mismatch",
      details: { expectedUri, expectedDigest, actualDigest },
    });
  }
  return Object.freeze({
    document: structuredClone(document),
    evidence: Object.freeze({
      kind: "team_source",
      uri: expectedUri,
      digest: actualDigest,
      local: true,
    }),
  });
}
