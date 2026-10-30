import { APP_BASE_PATH } from "./agentic-graph-agent-ready-shared.mjs";
import { jsonStatusResponse } from "./agentic-graph-agent-ready-responses.mjs";

const GITHUB_WORKSPACE_WRITE_ROUTE_PATH = `${APP_BASE_PATH}/api/workspace/github/write`;
const GITHUB_WORKSPACE_WRITE_ROUTE_ALIAS_PATH = "/api/workspace/github/write";
const GITHUB_WORKSPACE_WRITE_MAX_FILES = 12;
const GITHUB_WORKSPACE_WRITE_MAX_TEXT_BYTES = 900_000;
const GITHUB_WORKSPACE_WRITE_TEXT_EXTENSIONS = new Set([
  "css",
  "html",
  "js",
  "json",
  "md",
  "mdx",
  "mjs",
  "svg",
  "ts",
  "tsx",
  "txt",
  "yaml",
  "yml",
]);
const readEnvString = (env, key) => String(env?.[key] || "").trim();
const readGitHubWriteConfig = (env) => {
  const repository = readEnvString(env, "AGENTIC_OS_GITHUB_WRITE_REPOSITORY");
  const token = readEnvString(env, "AGENTIC_OS_GITHUB_WRITE_TOKEN");
  const branch = readEnvString(env, "AGENTIC_OS_GITHUB_WRITE_BRANCH");
  const missing = [];
  if (!repository) missing.push("AGENTIC_OS_GITHUB_WRITE_REPOSITORY");
  if (!token) missing.push("AGENTIC_OS_GITHUB_WRITE_TOKEN");
  const parts = repository.split("/").map((part) => part.trim()).filter(Boolean);
  if (repository && parts.length !== 2) missing.push("AGENTIC_OS_GITHUB_WRITE_REPOSITORY:owner/repo");
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    owner: parts[0],
    repo: parts[1],
    branch,
    token,
  };
};

const normalizeGitHubWriteWorkspacePath = (value) => {
  const raw = String(value || "")
    .trim()
    .replace(/^workspace:/i, "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!raw) return { ok: false, error: "missing_workspace_path" };
  if (/[\u0000-\u001f\u007f]/.test(raw)) return { ok: false, error: "invalid_workspace_path" };
  const parts = raw.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) return { ok: false, error: "path_traversal_forbidden" };
  if (parts[0] !== "chat-log") return { ok: false, error: "unsupported_workspace_root" };
  if (parts.length < 3) return { ok: false, error: "chat_log_session_file_required" };
  const filename = parts[parts.length - 1] || "";
  const extension = filename.includes(".") ? filename.split(".").pop().toLowerCase() : "";
  if (!extension || !GITHUB_WORKSPACE_WRITE_TEXT_EXTENSIONS.has(extension)) {
    return { ok: false, error: "unsupported_text_extension" };
  }
  return { ok: true, path: parts.join("/") };
};

const encodeBase64Utf8 = (text) => {
  const bytes = new TextEncoder().encode(String(text || ""));
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
};

class GitHubWorkspaceWriteError extends Error {
  constructor(code, upstreamStatus, upstreamMessage) {
    super(code);
    this.name = "GitHubWorkspaceWriteError";
    this.code = code;
    this.upstreamStatus = upstreamStatus;
    this.upstreamMessage = upstreamMessage;
  }
}
const sanitizeGitHubApiMessage = (value) => String(value || "unknown")
  .replace(/[\u0000-\u001f\u007f]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 240);

const buildGitHubContentsApiUrl = (config, path) => {
  const encodedPath = String(path || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const url = new URL(`https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}`);
  if (config.branch) url.searchParams.set("ref", config.branch);
  return url;
};

const gitHubApiHeaders = (config) => ({
  accept: "application/vnd.github+json",
  authorization: `Bearer ${config.token}`,
  "user-agent": "agentic-graph-cloudflare-pages",
  "x-github-api-version": "2022-11-28",
});

export const isGitHubWorkspaceWriteRoutePath = (pathname) => {
  const normalizedPathname = String(pathname || "").replace(/\/+$/, "") || "/";
  return normalizedPathname === GITHUB_WORKSPACE_WRITE_ROUTE_PATH
    || normalizedPathname === GITHUB_WORKSPACE_WRITE_ROUTE_ALIAS_PATH;
};

const fetchGitHubExistingFileSha = async (config, path) => {
  const response = await fetch(buildGitHubContentsApiUrl(config, path), {
    method: "GET",
    headers: gitHubApiHeaders(config),
  });
  if (response.status === 404) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new GitHubWorkspaceWriteError(
      "github_read_failed",
      response.status,
      sanitizeGitHubApiMessage(payload?.message || response.statusText),
    );
  }
  if (payload?.type && payload.type !== "file") {
    throw new GitHubWorkspaceWriteError("github_path_not_file", 409, path);
  }
  return String(payload?.sha || "").trim() || null;
};

const putGitHubWorkspaceFile = async (config, file, message) => {
  const sha = await fetchGitHubExistingFileSha(config, file.repositoryPath);
  const body = {
    message,
    content: encodeBase64Utf8(file.text),
    ...(config.branch ? { branch: config.branch } : {}),
    ...(sha ? { sha } : {}),
  };
  const response = await fetch(buildGitHubContentsApiUrl(config, file.repositoryPath), {
    method: "PUT",
    headers: {
      ...gitHubApiHeaders(config),
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new GitHubWorkspaceWriteError(
      "github_write_failed",
      response.status,
      sanitizeGitHubApiMessage(payload?.message || response.statusText),
    );
  }
  return {
    workspacePath: file.workspacePath,
    repositoryPath: file.repositoryPath,
    action: sha ? "updated" : "created",
    commitSha: String(payload?.commit?.sha || ""),
    contentSha: String(payload?.content?.sha || ""),
    htmlUrl: String(payload?.content?.html_url || ""),
  };
};

export const handleGitHubWorkspaceWrite = async (request, env) => {
  const config = readGitHubWriteConfig(env);
  if (!config.ok) {
    return jsonStatusResponse(503, {
      ok: false,
      status: "skipped",
      error: "github_write_not_configured",
      missing: config.missing,
    });
  }
  const body = await request.json().catch(() => null);
  const inputFiles = Array.isArray(body?.files) ? body.files : [];
  if (inputFiles.length < 1) {
    return jsonStatusResponse(400, { ok: false, status: "failed", error: "files_required" });
  }
  if (inputFiles.length > GITHUB_WORKSPACE_WRITE_MAX_FILES) {
    return jsonStatusResponse(413, {
      ok: false,
      status: "failed",
      error: "too_many_files",
      maxFiles: GITHUB_WORKSPACE_WRITE_MAX_FILES,
    });
  }
  const files = [];
  const seen = new Set();
  for (const input of inputFiles) {
    const normalized = normalizeGitHubWriteWorkspacePath(input?.workspacePath || input?.path);
    if (!normalized.ok) {
      return jsonStatusResponse(400, {
        ok: false,
        status: "failed",
        error: normalized.error,
        workspacePath: String(input?.workspacePath || input?.path || ""),
      });
    }
    if (seen.has(normalized.path)) continue;
    seen.add(normalized.path);
    const text = String(input?.text ?? "");
    const byteLength = new TextEncoder().encode(text).length;
    if (byteLength > GITHUB_WORKSPACE_WRITE_MAX_TEXT_BYTES) {
      return jsonStatusResponse(413, {
        ok: false,
        status: "failed",
        error: "file_too_large",
        workspacePath: `/${normalized.path}`,
        maxTextBytes: GITHUB_WORKSPACE_WRITE_MAX_TEXT_BYTES,
      });
    }
    files.push({
      workspacePath: `/${normalized.path}`,
      repositoryPath: normalized.path,
      text,
    });
  }
  if (files.length < 1) return jsonStatusResponse(400, { ok: false, status: "failed", error: "files_required" });
  const messageText = String(body?.message || "").trim();
  const message = messageText && messageText.length <= 160
    ? messageText
    : `agentic-graph chat artifact ${files[0].repositoryPath}`;
  if (body?.dryRun === true) {
    return jsonStatusResponse(200, {
      ok: true,
      status: "dry_run",
      repository: `${config.owner}/${config.repo}`,
      branch: config.branch || null,
      files: files.map((file) => ({
        workspacePath: file.workspacePath,
        repositoryPath: file.repositoryPath,
        textBytes: new TextEncoder().encode(file.text).length,
      })),
    });
  }
  try {
    const written = [];
    for (const file of files) {
      written.push(await putGitHubWorkspaceFile(config, file, message));
    }
    return jsonStatusResponse(200, {
      ok: true,
      status: "applied",
      repository: `${config.owner}/${config.repo}`,
      branch: config.branch || null,
      files: written,
    });
  } catch (error) {
    const isGitHubError = error instanceof GitHubWorkspaceWriteError;
    return jsonStatusResponse(isGitHubError ? 424 : 500, {
      ok: false,
      status: "failed",
      error: isGitHubError
        ? error.code
        : error instanceof Error ? error.message : String(error || "github_write_failed"),
      ...(isGitHubError ? {
        upstreamStatus: error.upstreamStatus,
        upstreamMessage: error.upstreamMessage,
      } : {}),
    });
  }
};
