import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ExportPublishError, createExportPublishError } from "./export-publish-contract.js";

export const DEFAULT_EXPORT_ARTIFACT_MAX_BYTES = 1024 * 1024;
export const MAX_EXPORT_ARTIFACT_MAX_BYTES = 8 * 1024 * 1024;

const moduleRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const topLevelKey = /^([A-Za-z0-9_.-]+):(?:[ \t]*(.*))?$/;

const isSensitiveFrontmatterKey = (value) => {
  const normalized = String(value || "").toLowerCase().replace(/[.-]+/g, "_");
  return /(?:^|_)(?:api_?key|access_?token|refresh_?token|oauth_?token|auth_?token|bearer_?token|client_?secret|private_?key|credentials?|password|secrets?)(?:$|_)/.test(normalized);
};

function artifactError(code, message, details, cause) {
  return createExportPublishError(code, message, { details, cause });
}

function normalizedArtifactId(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw artifactError("ARTIFACT_INVALID", "artifact_id must identify a repository-relative Markdown file.");
  }
  const artifactId = value.trim();
  if (
    artifactId.length > 512
    || /[\u0000-\u001f\u007f]/.test(artifactId)
    || artifactId.includes("\\")
    || path.posix.isAbsolute(artifactId)
    || /^[A-Za-z]:/.test(artifactId)
  ) {
    throw artifactError("ARTIFACT_INVALID", "artifact_id must be a bounded repository-relative POSIX path.", { artifact_id: artifactId });
  }
  const segments = artifactId.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw artifactError("ARTIFACT_INVALID", "artifact_id must be a canonical path without empty or traversal segments.", { artifact_id: artifactId });
  }
  if (!/\.(?:md|markdown)$/i.test(artifactId)) {
    throw artifactError("ARTIFACT_INVALID", "artifact_id must reference a .md or .markdown artifact.", { artifact_id: artifactId });
  }
  return artifactId;
}

function boundedMaxBytes(value) {
  const maxBytes = value === undefined ? DEFAULT_EXPORT_ARTIFACT_MAX_BYTES : Number(value);
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_EXPORT_ARTIFACT_MAX_BYTES) {
    throw artifactError(
      "ARTIFACT_INVALID",
      `maxBytes must be an integer from 1 through ${MAX_EXPORT_ARTIFACT_MAX_BYTES}.`,
    );
  }
  return maxBytes;
}

function decodeYamlString(raw, label) {
  const value = String(raw || "").trim();
  if (!value || value === "|" || value === ">" || /^(?:null|~)$/i.test(value)) {
    throw artifactError("ARTIFACT_INVALID", `${label} must be a non-empty inline YAML string.`);
  }
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "string" || !parsed.trim()) throw new Error("empty title");
      return parsed.trim();
    } catch (cause) {
      throw artifactError("ARTIFACT_INVALID", `${label} contains an invalid double-quoted YAML string.`, null, cause);
    }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) {
      throw artifactError("ARTIFACT_INVALID", `${label} contains an invalid single-quoted YAML string.`);
    }
    const parsed = value.slice(1, -1).replace(/''/g, "'").trim();
    if (!parsed) throw artifactError("ARTIFACT_INVALID", `${label} must not be empty.`);
    return parsed;
  }
  const parsed = value.replace(/\s+#.*$/, "").trim();
  if (!parsed || /^[\[{!&*]/.test(parsed)) {
    throw artifactError("ARTIFACT_INVALID", `${label} must be a scalar YAML string.`);
  }
  return parsed;
}

export function parseExportArtifactFrontmatter(markdown, artifactId = "artifact") {
  const normalized = String(markdown || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) {
    throw artifactError("ARTIFACT_INVALID", `${artifactId} must start with a closed YAML frontmatter block.`);
  }
  const frontmatter = {};
  let currentTopLevelKey = null;
  for (const [index, line] of match[1].split("\n").entries()) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const anyLevelKey = line.trimStart().match(topLevelKey)?.[1];
    if (anyLevelKey && isSensitiveFrontmatterKey(anyLevelKey)) {
      throw artifactError("ARTIFACT_INVALID", `${artifactId} must not contain credential field ${anyLevelKey} in frontmatter.`);
    }
    if (/^[ \t]/.test(line)) {
      if (!currentTopLevelKey || /^\t/.test(line)) {
        throw artifactError("ARTIFACT_INVALID", `${artifactId} has invalid YAML indentation on frontmatter line ${index + 2}.`);
      }
      continue;
    }
    const keyMatch = line.match(topLevelKey);
    if (!keyMatch) {
      throw artifactError("ARTIFACT_INVALID", `${artifactId} has invalid YAML on frontmatter line ${index + 2}.`);
    }
    const [, key, rawValue = ""] = keyMatch;
    if (Object.hasOwn(frontmatter, key)) {
      throw artifactError("ARTIFACT_INVALID", `${artifactId} repeats frontmatter key ${key}.`);
    }
    frontmatter[key] = rawValue.trim();
    currentTopLevelKey = key;
  }
  if (!Object.hasOwn(frontmatter, "title")) {
    throw artifactError("ARTIFACT_INVALID", `${artifactId} frontmatter requires title.`);
  }
  const title = decodeYamlString(frontmatter.title, `${artifactId} frontmatter title`);
  const body = normalized.slice(match[0].length).trim();
  if (!body) throw artifactError("ARTIFACT_INVALID", `${artifactId} must contain Markdown content after frontmatter.`);
  return Object.freeze({ frontmatter: Object.freeze({ ...frontmatter, title }), title, body });
}

function isInsideRoot(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

export async function readExportArtifact(artifactIdInput, options = {}) {
  const artifactId = normalizedArtifactId(artifactIdInput);
  const maxBytes = boundedMaxBytes(options.maxBytes);
  const configuredRoot = options.repoRoot ?? process.env.AGENTIC_OS_ROOT ?? moduleRepoRoot;
  let rootPath;
  let artifactPath;
  try {
    rootPath = await fs.realpath(path.resolve(configuredRoot));
    const unresolvedPath = path.resolve(rootPath, ...artifactId.split("/"));
    if (!isInsideRoot(rootPath, unresolvedPath)) {
      throw artifactError("ARTIFACT_INVALID", "artifact_id resolves outside the configured repository root.", { artifact_id: artifactId });
    }
    artifactPath = await fs.realpath(unresolvedPath);
    if (!isInsideRoot(rootPath, artifactPath)) {
      throw artifactError("ARTIFACT_INVALID", "artifact_id resolves through a symlink outside the configured repository root.", { artifact_id: artifactId });
    }
    const stat = await fs.stat(artifactPath);
    if (!stat.isFile()) throw artifactError("ARTIFACT_INVALID", "artifact_id must resolve to a regular file.", { artifact_id: artifactId });
    if (stat.size > maxBytes) {
      throw artifactError("ARTIFACT_INVALID", `Artifact exceeds the ${maxBytes}-byte read limit.`, { artifact_id: artifactId, size: stat.size });
    }
    const bytes = await fs.readFile(artifactPath);
    if (bytes.byteLength > maxBytes) {
      throw artifactError("ARTIFACT_INVALID", `Artifact exceeds the ${maxBytes}-byte read limit.`, { artifact_id: artifactId, size: bytes.byteLength });
    }
    const markdown = bytes.toString("utf8");
    const parsed = parseExportArtifactFrontmatter(markdown, artifactId);
    return Object.freeze({
      artifact_id: artifactId,
      title: parsed.title,
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      markdown,
      source_sha256: createHash("sha256").update(bytes).digest("hex"),
      file_path: artifactPath,
      size_bytes: bytes.byteLength,
    });
  } catch (error) {
    if (error instanceof ExportPublishError) throw error;
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      throw artifactError("ARTIFACT_NOT_FOUND", `Export artifact not found: ${artifactId}.`, { artifact_id: artifactId }, error);
    }
    throw artifactError("ARTIFACT_INVALID", `Unable to read export artifact ${artifactId}.`, { artifact_id: artifactId }, error);
  }
}
