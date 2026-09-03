import process from "node:process";
import { BROWSER_API_NATIVE_BROWSER_OPERATIONS, buildNativeBrowserRequest } from "./browser-api-native-operations.js";

const BROWSER_API_ROUTE_OPERATIONS = /** @type {const} */ ([
  "health",
  "search",
  "searchDomain",
  "resolve",
  "execute",
  "login",
  "cookieImport",
  "skills",
  "stats",
  "feedback",
  "verify",
  "issues",
]);

const BROWSER_API_OPERATIONS = /** @type {const} */ ([
  ...BROWSER_API_ROUTE_OPERATIONS,
  ...BROWSER_API_NATIVE_BROWSER_OPERATIONS,
]);

const sharedDefaults = await import("../grph-shared/dist/browser/apiNativeBrowserMcpSsot.js").catch(() => ({}));
const API_NATIVE_BROWSER_DEFAULT_RUNTIME_URL =
  typeof sharedDefaults.API_NATIVE_BROWSER_DEFAULT_RUNTIME_URL === "string"
    ? sharedDefaults.API_NATIVE_BROWSER_DEFAULT_RUNTIME_URL
    : "http://localhost:6969";
const API_NATIVE_BROWSER_DEFAULT_INTENT =
  typeof sharedDefaults.API_NATIVE_BROWSER_DEFAULT_INTENT === "string"
    ? sharedDefaults.API_NATIVE_BROWSER_DEFAULT_INTENT
    : "resolve a browser task into a reusable first-party API route";
const API_NATIVE_BROWSER_DEFAULT_TARGET_URL =
  typeof sharedDefaults.API_NATIVE_BROWSER_DEFAULT_TARGET_URL === "string"
    ? sharedDefaults.API_NATIVE_BROWSER_DEFAULT_TARGET_URL
    : "";
const API_NATIVE_BROWSER_DEFAULT_DRY_RUN =
  typeof sharedDefaults.API_NATIVE_BROWSER_DEFAULT_DRY_RUN === "boolean"
    ? sharedDefaults.API_NATIVE_BROWSER_DEFAULT_DRY_RUN
    : true;
const API_NATIVE_BROWSER_DEFAULT_CONFIRM_UNSAFE =
  typeof sharedDefaults.API_NATIVE_BROWSER_DEFAULT_CONFIRM_UNSAFE === "boolean"
    ? sharedDefaults.API_NATIVE_BROWSER_DEFAULT_CONFIRM_UNSAFE
    : false;
const API_NATIVE_BROWSER_DEFAULT_CONFIRM_THIRD_PARTY_TERMS =
  typeof sharedDefaults.API_NATIVE_BROWSER_DEFAULT_CONFIRM_THIRD_PARTY_TERMS === "boolean"
    ? sharedDefaults.API_NATIVE_BROWSER_DEFAULT_CONFIRM_THIRD_PARTY_TERMS
    : false;
const API_NATIVE_BROWSER_DEFAULT_CONFIRM_COOKIE_IMPORT =
  typeof sharedDefaults.API_NATIVE_BROWSER_DEFAULT_CONFIRM_COOKIE_IMPORT === "boolean"
    ? sharedDefaults.API_NATIVE_BROWSER_DEFAULT_CONFIRM_COOKIE_IMPORT
    : false;

const DEFAULT_BROWSER_API_RUNTIME_URL =
  process.env.AGENTIC_OS_BROWSER_API_RUNTIME_URL?.trim() || API_NATIVE_BROWSER_DEFAULT_RUNTIME_URL;
const DEFAULT_BROWSER_API_INTENT =
  process.env.AGENTIC_OS_BROWSER_API_DEFAULT_INTENT?.trim() || API_NATIVE_BROWSER_DEFAULT_INTENT;
const DEFAULT_BROWSER_API_TARGET_URL =
  process.env.AGENTIC_OS_BROWSER_API_DEFAULT_TARGET_URL?.trim() || API_NATIVE_BROWSER_DEFAULT_TARGET_URL;
const ALLOW_REMOTE_BROWSER_API_RUNTIME = readEnvFlag("AGENTIC_OS_BROWSER_API_ALLOW_REMOTE_RUNTIME");

export const BROWSER_API_TOOL = {
  name: "agentic-graph.browser_api.run",
  description:
    "Use this when a local MCP host needs a configurable API-native browser runtime for health, search, route resolution, login/auth, skill listing, feedback, verification, or dry-run/confirmed route execution.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      operation: {
        type: "string",
        enum: BROWSER_API_OPERATIONS,
        default: "resolve",
        description: "Browser API operation to run.",
      },
      runtimeUrl: {
        type: "string",
        description:
          "Local browser API runtime URL. Loopback is enforced unless AGENTIC_OS_BROWSER_API_ALLOW_REMOTE_RUNTIME=1 is set on the MCP server.",
      },
      intent: {
        type: "string",
        description: "Natural-language browser task intent for search/resolve operations.",
      },
      targetUrl: {
        type: "string",
        description: "Website URL used for route discovery, search, or login.",
      },
      domain: {
        type: "string",
        description: "Optional domain scope for searchDomain, feedback, or auth operations.",
      },
      skillId: {
        type: "string",
        description: "Resolved skill or route id required for execute, verify, or issues operations.",
      },
      sessionId: {
        type: "string",
        description: "Optional browser/runtime session id.",
      },
      payload: {
        type: "object",
        description: "Operation-specific JSON payload passed through to the browser API runtime.",
      },
      runtimePath: {
        type: "string",
        description:
          "Optional advanced override for compatible browser runtime HTTP paths. Defaults are Unbrowse-like neutral paths.",
      },
      selector: {
        type: "string",
        description: "Optional selector or element reference for native browser actions.",
      },
      text: {
        type: "string",
        description: "Optional text for type/fill/eval/native browser operations.",
      },
      value: {
        type: "string",
        description: "Optional value for select/fill/native browser operations.",
      },
      key: {
        type: "string",
        description: "Optional keyboard key for press/native browser operations.",
      },
      x: {
        type: "number",
        description: "Optional x coordinate for native browser operations.",
      },
      y: {
        type: "number",
        description: "Optional y coordinate for native browser operations.",
      },
      dryRun: {
        type: "boolean",
        default: API_NATIVE_BROWSER_DEFAULT_DRY_RUN,
        description: "Default true. Keeps route execution inspectable until the caller explicitly disables dry-run.",
      },
      confirmUnsafe: {
        type: "boolean",
        default: API_NATIVE_BROWSER_DEFAULT_CONFIRM_UNSAFE,
        description: "Explicit unsafe-action confirmation flag forwarded to the browser API runtime.",
      },
      confirmThirdPartyTerms: {
        type: "boolean",
        default: API_NATIVE_BROWSER_DEFAULT_CONFIRM_THIRD_PARTY_TERMS,
        description: "Explicit third-party terms confirmation flag for policy-sensitive browser API routes.",
      },
      confirmCookieImport: {
        type: "boolean",
        default: API_NATIVE_BROWSER_DEFAULT_CONFIRM_COOKIE_IMPORT,
        description: "Explicit confirmation required before cookieImport can access browser cookie storage.",
      },
      timeoutMs: {
        type: "number",
        description: "Optional runtime call timeout in milliseconds.",
      },
    },
  },
};

function truncate(text, maxChars) {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.7));
  const tail = text.slice(text.length - Math.floor(maxChars * 0.3));
  return `${head}\n\n...(truncated ${text.length - maxChars} chars)...\n\n${tail}`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readEnvFlag(name) {
  const value = String(process.env[name] || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized) return false;
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  return /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function normalizeHttpUrl(rawUrl, fallback, { allowRemoteRuntime = false } = {}) {
  const candidate = typeof rawUrl === "string" && rawUrl.trim() ? rawUrl.trim() : fallback;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`Invalid browser API runtime URL: ${candidate}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Browser API runtime URL must use http or https.");
  }
  if (!allowRemoteRuntime && !isLoopbackHostname(parsed.hostname)) {
    throw new Error(
      "Browser API runtime URL must use a loopback host unless AGENTIC_OS_BROWSER_API_ALLOW_REMOTE_RUNTIME=1 is set."
    );
  }
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

function normalizeBrowserTargetUrl(rawUrl, label = "targetUrl") {
  const candidate = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!candidate) return "";
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`Invalid browser target URL ${label}: ${candidate}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Browser target URL must use http or https.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Browser target URL must not include embedded credentials.");
  }
  return parsed.toString();
}

function joinRuntimePath(runtimeUrl, apiPath) {
  const base = new URL(runtimeUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  const nextPath = String(apiPath || "").replace(/^\/+/, "");
  base.pathname = `${basePath}/${nextPath}`.replace(/\/{2,}/g, "/");
  return base.toString();
}

function readStringArg(value, fallback = "") {
  const next = typeof value === "string" ? value.trim() : "";
  return next || fallback;
}

function readBooleanArg(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function deriveDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function readPayloadUrl(payload) {
  return typeof payload.url === "string" ? payload.url.trim() : "";
}

function requireSkillId(skillId, operation) {
  if (!skillId) throw new Error(`Missing required argument for ${operation}: skillId.`);
  return skillId;
}

function assertConfirmedExecution(operation, { dryRun, confirmUnsafe }) {
  if (dryRun === false && !confirmUnsafe) {
    throw new Error(`${operation} with dryRun=false requires confirmUnsafe=true.`);
  }
}

function buildBrowserApiRequest(args) {
  const inputArgs = isPlainObject(args) ? args : {};
  const operation = readStringArg(inputArgs.operation, "resolve");
  const runtimeUrl = normalizeHttpUrl(inputArgs.runtimeUrl, DEFAULT_BROWSER_API_RUNTIME_URL, {
    allowRemoteRuntime: ALLOW_REMOTE_BROWSER_API_RUNTIME,
  });
  const runtimePath = readStringArg(inputArgs.runtimePath);
  const payload = isPlainObject(inputArgs.payload) ? inputArgs.payload : {};
  const rawTargetUrl = readStringArg(
    inputArgs.targetUrl,
    BROWSER_API_NATIVE_BROWSER_OPERATIONS.includes(operation) ? "" : DEFAULT_BROWSER_API_TARGET_URL
  );
  const targetUrl = normalizeBrowserTargetUrl(rawTargetUrl, "targetUrl");
  const payloadUrl = normalizeBrowserTargetUrl(readPayloadUrl(payload), "payload.url");
  const normalizedPayload = payloadUrl ? { ...payload, url: payloadUrl } : payload;
  const effectiveTargetUrl = targetUrl || payloadUrl;
  const intent = readStringArg(inputArgs.intent, DEFAULT_BROWSER_API_INTENT);
  const dryRun = readBooleanArg(inputArgs.dryRun, API_NATIVE_BROWSER_DEFAULT_DRY_RUN);
  const confirmUnsafe = readBooleanArg(inputArgs.confirmUnsafe, API_NATIVE_BROWSER_DEFAULT_CONFIRM_UNSAFE);
  const confirmThirdPartyTerms = readBooleanArg(
    inputArgs.confirmThirdPartyTerms,
    API_NATIVE_BROWSER_DEFAULT_CONFIRM_THIRD_PARTY_TERMS
  );
  const confirmCookieImport = readBooleanArg(
    inputArgs.confirmCookieImport,
    API_NATIVE_BROWSER_DEFAULT_CONFIRM_COOKIE_IMPORT
  );
  const sessionId = readStringArg(inputArgs.sessionId);
  const skillId = readStringArg(inputArgs.skillId);
  const domain = readStringArg(inputArgs.domain) || deriveDomain(effectiveTargetUrl);
  const withOptionalTargetUrl = (body) => (targetUrl ? { ...body, url: targetUrl } : body);
  const withSafety = (body) => ({
    ...body,
    dry_run: dryRun,
    confirm_unsafe: confirmUnsafe,
    confirm_third_party_terms: confirmThirdPartyTerms,
  });

  if (operation === "health") {
    return {
      operation,
      method: "GET",
      url: joinRuntimePath(runtimeUrl, "/health"),
      body: null,
      dryRun,
      confirmUnsafe,
      confirmThirdPartyTerms,
    };
  }
  if (operation === "skills") {
    return {
      operation,
      method: "GET",
      url: joinRuntimePath(runtimeUrl, "/v1/skills"),
      body: null,
      dryRun,
      confirmUnsafe,
      confirmThirdPartyTerms,
    };
  }
  if (operation === "stats") {
    return {
      operation,
      method: "GET",
      url: joinRuntimePath(runtimeUrl, "/v1/stats/summary"),
      body: null,
      dryRun,
      confirmUnsafe,
      confirmThirdPartyTerms,
    };
  }
  if (operation === "search") {
    return {
      operation,
      method: "POST",
      url: joinRuntimePath(runtimeUrl, "/v1/search"),
      body: withOptionalTargetUrl({ ...normalizedPayload, intent, ...(domain ? { domain } : {}) }),
      dryRun,
      confirmUnsafe,
      confirmThirdPartyTerms,
    };
  }
  if (operation === "searchDomain") {
    if (!domain) throw new Error("Missing required argument for searchDomain: domain or targetUrl.");
    return {
      operation,
      method: "POST",
      url: joinRuntimePath(runtimeUrl, "/v1/search/domain"),
      body: withOptionalTargetUrl({ ...normalizedPayload, intent, domain }),
      dryRun,
      confirmUnsafe,
      confirmThirdPartyTerms,
    };
  }
  if (operation === "resolve") {
    assertConfirmedExecution(operation, { dryRun, confirmUnsafe });
    return {
      operation,
      method: "POST",
      url: joinRuntimePath(runtimeUrl, "/v1/intent/resolve"),
      body: withSafety(withOptionalTargetUrl({ ...normalizedPayload, intent, ...(domain ? { domain } : {}) })),
      dryRun,
      confirmUnsafe,
      confirmThirdPartyTerms,
    };
  }
  if (operation === "login") {
    if (!effectiveTargetUrl) throw new Error("login requires targetUrl or payload.url.");
    return {
      operation,
      method: "POST",
      url: joinRuntimePath(runtimeUrl, "/v1/auth/login"),
      body: withOptionalTargetUrl({ ...normalizedPayload, ...(sessionId ? { session_id: sessionId } : {}) }),
      dryRun,
      confirmUnsafe,
      confirmThirdPartyTerms,
    };
  }
  if (operation === "cookieImport") {
    if (dryRun !== false || !confirmCookieImport || !confirmUnsafe || !confirmThirdPartyTerms) {
      throw new Error(
        "cookieImport requires dryRun=false, confirmCookieImport=true, confirmUnsafe=true, and confirmThirdPartyTerms=true."
      );
    }
    if (!effectiveTargetUrl && !domain) {
      throw new Error("cookieImport requires targetUrl, payload.url, or domain.");
    }
    return {
      operation,
      method: "POST",
      url: joinRuntimePath(runtimeUrl, "/v1/auth/steal"),
      body: withOptionalTargetUrl({
        ...normalizedPayload,
        ...(domain ? { domain } : {}),
        dry_run: false,
        confirm_cookie_import: true,
        confirm_unsafe: true,
        confirm_third_party_terms: true,
      }),
      dryRun,
      confirmUnsafe,
      confirmThirdPartyTerms,
      confirmCookieImport,
    };
  }
  if (operation === "execute") {
    const requiredSkillId = requireSkillId(skillId, operation);
    assertConfirmedExecution(operation, { dryRun, confirmUnsafe });
    return {
      operation,
      method: "POST",
      url: joinRuntimePath(runtimeUrl, `/v1/skills/${encodeURIComponent(requiredSkillId)}/execute`),
      body: withSafety({ ...normalizedPayload, ...(sessionId ? { session_id: sessionId } : {}) }),
      dryRun,
      confirmUnsafe,
      confirmCookieImport,
      confirmThirdPartyTerms,
    };
  }
  if (operation === "feedback") {
    return {
      operation,
      method: "POST",
      url: joinRuntimePath(runtimeUrl, "/v1/feedback"),
      body: withOptionalTargetUrl({
        ...normalizedPayload,
        intent,
        ...(domain ? { domain } : {}),
        ...(skillId ? { skill_id: skillId } : {}),
        ...(sessionId ? { session_id: sessionId } : {}),
      }),
      dryRun,
      confirmUnsafe,
      confirmCookieImport,
      confirmThirdPartyTerms,
    };
  }
  if (operation === "verify") {
    const requiredSkillId = requireSkillId(skillId, operation);
    return {
      operation,
      method: "POST",
      url: joinRuntimePath(runtimeUrl, `/v1/skills/${encodeURIComponent(requiredSkillId)}/verify`),
      body: normalizedPayload,
      dryRun,
      confirmUnsafe,
      confirmCookieImport,
      confirmThirdPartyTerms,
    };
  }
  if (operation === "issues") {
    const requiredSkillId = requireSkillId(skillId, operation);
    return {
      operation,
      method: "POST",
      url: joinRuntimePath(runtimeUrl, `/v1/skills/${encodeURIComponent(requiredSkillId)}/issues`),
      body: normalizedPayload,
      dryRun,
      confirmUnsafe,
      confirmCookieImport,
      confirmThirdPartyTerms,
    };
  }
  if (BROWSER_API_NATIVE_BROWSER_OPERATIONS.includes(operation)) {
    return buildNativeBrowserRequest({
      operation,
      runtimeUrl,
      runtimePath,
      payload: normalizedPayload,
      targetUrl,
      sessionId,
      skillId,
      dryRun,
      confirmUnsafe,
      confirmThirdPartyTerms,
      confirmCookieImport,
      inputArgs,
      joinRuntimePath,
      requireSkillId,
      assertConfirmedExecution,
    });
  }
  throw new Error(`Unknown browser API operation: ${operation}`);
}

export async function callBrowserApiRuntime(args, { maxOutputChars = 20000 } = {}) {
  const request = buildBrowserApiRequest(args);
  const timeoutMs = isPlainObject(args) && typeof args.timeoutMs === "number" ? Number(args.timeoutMs) : 60000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.body
        ? { accept: "application/json", "content-type": "application/json" }
        : { accept: "application/json" },
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: controller.signal,
    });
    const bodyText = await response.text().catch(() => "");
    const outputText = [
      `Operation: ${request.operation}`,
      `Endpoint: ${request.method} ${request.url}`,
      `Status: ${response.status} ${response.statusText}`,
      `Dry run: ${String(request.dryRun)}`,
      `Confirm unsafe: ${String(request.confirmUnsafe)}`,
      `Confirm third-party terms: ${String(request.confirmThirdPartyTerms)}`,
      `Confirm cookie import: ${String(Boolean(request.confirmCookieImport))}`,
      "",
      bodyText.trim() ? `Response:\n${truncate(bodyText, maxOutputChars)}` : "Response: (empty)",
    ].join("\n");
    return { content: [{ type: "text", text: outputText }], isError: !response.ok };
  } finally {
    clearTimeout(timer);
  }
}
