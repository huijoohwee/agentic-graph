import { createHash } from "node:crypto";

import {
  AGENTIC_CANVAS_OS_DOCS_KIND_FILES,
  AGENTIC_CANVAS_OS_LIVE_AGENT_PROOF_FILE,
  AGENTIC_CANVAS_OS_PROGRESSIVE_AGENTS_FILE,
  AGENTIC_CANVAS_OS_DOCS_SOURCE_ROOT_URL,
  AGENTIC_CANVAS_OS_DOCS_WORKSPACE_ROOT,
  AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA,
  dictionaryFileForAgenticCanvasOsToken,
  kindForAgenticCanvasOsToken,
  serializeAgenticCanvasOsDocsCatalogForDigest,
  serializeAgenticCanvasOsDocsRoutingForDigest,
} from "./agentic-canvas-os-docs-contract.mjs";

const FRONTMATTER_BOUNDARY = "---";
const MAX_SNIPPET_CHARS = 2400;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

const normalizeText = (value) => String(value || "").trim();

const parseQuotedYamlScalar = (value) => {
  const text = normalizeText(value);
  if (!text) return "";
  if (
    (text.startsWith('"') && text.endsWith('"'))
    || (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
};
const extractFrontmatter = (markdown) => {
  const lines = String(markdown || "").split(/\r?\n/);
  if (lines[0] !== FRONTMATTER_BOUNDARY) return "";
  const endIndex = lines.findIndex((line, index) => index > 0 && line === FRONTMATTER_BOUNDARY);
  return endIndex > 0 ? lines.slice(1, endIndex).join("\n") : "";
};

const readFrontmatterScalar = (frontmatter, key) => {
  const escapedKey = normalizeText(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(frontmatter || "").match(new RegExp(`^${escapedKey}:\\s*(.+?)\\s*$`, "m"));
  return match ? parseQuotedYamlScalar(match[1]) : "";
};

const numberFromWordOrDigits = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  const words = { zero: 0, one: 1, two: 2, three: 3, four: 4 };
  if (Object.hasOwn(words, normalized)) return words[normalized];
  const parsed = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : -1;
};

export const buildAgentLiveProviderProofSummary = ({
  markdown = "",
  sourceRevision = "",
  proofRevision = "",
} = {}) => {
  const normalizedSourceRevision = normalizeText(sourceRevision);
  const normalizedProofRevision = normalizeText(proofRevision);
  const frontmatter = extractFrontmatter(markdown);
  const evidenceSchema = readFrontmatterScalar(frontmatter, "schema");
  const sourceStatus = readFrontmatterScalar(frontmatter, "status");
  const modelMatch = String(markdown).match(/run used `([^`]+)` with ([a-z-]+) reasoning/i);
  const callMatch = String(markdown).match(/completed its (one|two|three|four|[\d,]+)-call ceiling/i);
  const usageMatch = String(markdown).match(
    /returned ([\d,]+) input tokens, ([\d,]+) output tokens, (zero|[\d,]+) cached-input hits, and an estimated cost of USD ([\d.]+)/i,
  );
  const providerCalls = numberFromWordOrDigits(callMatch?.[1]);
  const inputTokens = numberFromWordOrDigits(usageMatch?.[1]);
  const outputTokens = numberFromWordOrDigits(usageMatch?.[2]);
  const cachedInputTokens = numberFromWordOrDigits(usageMatch?.[3]);
  const estimatedCostUsd = Number(usageMatch?.[4]);
  const managerOwnsDelegation = /Delegation finished with the manager as final-answer owner/i.test(markdown);
  const specialistOwnsHandoff = /handoff finished with the specialist as owner/i.test(markdown);
  const preservesAllTurns = /confirmed effective `all_turns`/i.test(markdown);
  const defaultWorkerConfigured = !/default Worker (?:wiring is unchanged|still has no execution adapter)/i.test(markdown);
  const verified = SHA_PATTERN.test(normalizedSourceRevision)
    && SHA_PATTERN.test(normalizedProofRevision)
    && evidenceSchema === "agent-live-provider-proof-contract/v1"
    && sourceStatus === "runtime-ready-dev"
    && Boolean(modelMatch?.[1] && modelMatch?.[2])
    && providerCalls > 0
    && inputTokens >= 0
    && outputTokens >= 0
    && cachedInputTokens >= 0
    && Number.isFinite(estimatedCostUsd)
    && managerOwnsDelegation
    && specialistOwnsHandoff
    && preservesAllTurns
    && !defaultWorkerConfigured;

  return {
    schema: "agent-live-provider-proof-summary/v1",
    status: verified ? "verified-bounded-live" : "unavailable",
    evidenceSchema,
    sourceStatus,
    sourceRevision: normalizedSourceRevision,
    proofRevision: normalizedProofRevision,
    sourcePath: `docs/${AGENTIC_CANVAS_OS_LIVE_AGENT_PROOF_FILE}`,
    sourceUrl: SHA_PATTERN.test(normalizedProofRevision)
      ? `https://github.com/huijoohwee/agentic-canvas-os/blob/${normalizedProofRevision}/docs/${AGENTIC_CANVAS_OS_LIVE_AGENT_PROOF_FILE}`
      : "",
    model: normalizeText(modelMatch?.[1]),
    reasoningEffort: normalizeText(modelMatch?.[2]).toLowerCase(),
    providerCalls: Math.max(0, providerCalls),
    inputTokens: Math.max(0, inputTokens),
    outputTokens: Math.max(0, outputTokens),
    cachedInputTokens: Math.max(0, cachedInputTokens),
    estimatedCostUsd: Number.isFinite(estimatedCostUsd) ? estimatedCostUsd : 0,
    finalAnswerOwners: {
      delegation: managerOwnsDelegation ? "manager" : "",
      handoff: specialistOwnsHandoff ? "specialist" : "",
    },
    continuationContext: preservesAllTurns ? "all_turns" : "",
    defaultWorkerConfigured,
  };
};

export const buildProgressiveAgentsReadinessSummary = ({
  markdown = "",
  sourceRevision = "",
} = {}) => {
  const normalizedSourceRevision = normalizeText(sourceRevision);
  const frontmatter = extractFrontmatter(markdown);
  const contractSchema = readFrontmatterScalar(frontmatter, "schema");
  const sourceStatus = readFrontmatterScalar(frontmatter, "status");
  const runtimeScope = readFrontmatterScalar(frontmatter, "runtime_scope");
  const runtimeClaim = readFrontmatterScalar(frontmatter, "runtime_claim");
  const runtimeOwner = readFrontmatterScalar(frontmatter, "runtime_owner");
  const runtimeProof = readFrontmatterScalar(frontmatter, "runtime_proof");
  const externalSourcePolicy = readFrontmatterScalar(frontmatter, "external_source_policy");
  const deployPolicy = readFrontmatterScalar(frontmatter, "publish_policy");
  const normalizedBody = String(markdown || "").replace(/\s+/g, " ");
  const growthStagesReady = ["Register one agent", "Run one agent", "Add tools", "Add specialists"]
    .every((stage) => String(markdown || "").includes(`| ${stage} |`));
  const noExternalSdk = /does not import or emulate an external Agents SDK/i.test(normalizedBody);
  const providerUnverified = /provider execution `unverified`/i.test(normalizedBody);
  const defaultWorkerUnconfigured = /default Worker execution remains unconfigured/i.test(runtimeClaim)
    && /default Worker keeps all execution states false/i.test(normalizedBody);
  const ready = SHA_PATTERN.test(normalizedSourceRevision)
    && contractSchema === "progressive-agents-runtime-contract/v1"
    && sourceStatus === "runtime-ready-dev"
    && Boolean(runtimeScope)
    && runtimeOwner === "../agent-api/src/progressive-agents.js"
    && runtimeProof === "../__tests__/progressive-agents.test.mjs"
    && externalSourcePolicy.includes("forbid copied code")
    && deployPolicy === "Dev-only until explicit operator approval"
    && growthStagesReady
    && noExternalSdk
    && providerUnverified
    && defaultWorkerUnconfigured;

  return {
    schema: "progressive-agents-readiness-summary/v1",
    status: ready ? "runtime-ready-dev" : "unavailable",
    sourceRevision: normalizedSourceRevision,
    sourcePath: `docs/${AGENTIC_CANVAS_OS_PROGRESSIVE_AGENTS_FILE}`,
    sourceUrl: SHA_PATTERN.test(normalizedSourceRevision)
      ? `https://github.com/huijoohwee/agentic-canvas-os/blob/${normalizedSourceRevision}/docs/${AGENTIC_CANVAS_OS_PROGRESSIVE_AGENTS_FILE}`
      : "",
    contractSchema,
    runtimeScope,
    runtimeOwner,
    runtimeProof,
    contractReady: ready,
    configured: ready ? false : null,
    progressionPolicy: ready ? "single-agent-then-tools-then-specialists" : "unavailable",
    growthStages: ready ? ["single-agent", "tool-enabled-agent", "specialist-workflow"] : [],
    externalSdkDependency: ready ? false : null,
    providerExecutionStatus: ready ? "unverified" : "unavailable",
    defaultWorkerConfigured: ready ? false : null,
    deployPolicy,
  };
};

export const resolveAgentLiveProviderProofRevisionFromGitHub = async ({
  sourceRevision = "",
  fetchImpl = globalThis.fetch,
  token = "",
  requestInit = {},
} = {}) => {
  const normalizedSourceRevision = normalizeText(sourceRevision);
  if (!SHA_PATTERN.test(normalizedSourceRevision) || typeof fetchImpl !== "function") return "";
  const response = await fetchImpl(
    `https://api.github.com/repos/huijoohwee/agentic-canvas-os/commits?sha=${normalizedSourceRevision}&path=docs/${AGENTIC_CANVAS_OS_LIVE_AGENT_PROOF_FILE}&per_page=100`,
    {
      ...requestInit,
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "agentic-graph-agentic-canvas-os-docs-runtime",
        ...(normalizeText(token) ? { authorization: `Bearer ${normalizeText(token)}` } : {}),
        ...(requestInit.headers || {}),
      },
    },
  );
  if (!response.ok) return "";
  const proofCommits = await response.json();
  return Array.isArray(proofCommits) && proofCommits.length > 0 && proofCommits.length < 100
    ? normalizeText(proofCommits.at(-1)?.sha)
    : "";
};

const parseDictionaryEntriesFromFrontmatter = (frontmatter) => {
  const entries = [];
  const lines = String(frontmatter || "").split(/\r?\n/);
  let inEntries = false;
  for (const line of lines) {
    if (/^dictionary_entries:\s*$/.test(line)) {
      inEntries = true;
      continue;
    }
    if (inEntries && /^[a-zA-Z0-9_-]+:\s*/.test(line)) break;
    const match = inEntries ? line.match(/^\s{2}-\s+(.+?)\s*$/) : null;
    if (!match) continue;
    const token = parseQuotedYamlScalar(match[1]);
    if (token) entries.push(token);
  }
  return entries;
};

const parseDirectResolutionFromFrontmatter = (frontmatter) => {
  const out = new Map();
  const lines = String(frontmatter || "").split(/\r?\n/);
  let inDirectResolution = false;
  for (const line of lines) {
    if (/^direct_resolution:\s*$/.test(line)) {
      inDirectResolution = true;
      continue;
    }
    if (inDirectResolution && /^[a-zA-Z0-9_-]+:\s*/.test(line)) break;
    const match = inDirectResolution ? line.match(/^\s{2}(.+?):\s+(.+?)\s*$/) : null;
    if (!match) continue;
    const token = parseQuotedYamlScalar(match[1]);
    const sourcePath = parseQuotedYamlScalar(match[2]);
    if (token && sourcePath) out.set(token, sourcePath);
  }
  return out;
};

const sourceRootUrlForRevision = (sourceRevision = "") => {
  const normalizedSourceRevision = normalizeText(sourceRevision);
  return SHA_PATTERN.test(normalizedSourceRevision)
    ? AGENTIC_CANVAS_OS_DOCS_SOURCE_ROOT_URL.replace("/blob/main/", `/blob/${normalizedSourceRevision}/`)
    : AGENTIC_CANVAS_OS_DOCS_SOURCE_ROOT_URL;
};

const sourceUrlForPath = (sourcePath, sourceRootUrl = AGENTIC_CANVAS_OS_DOCS_SOURCE_ROOT_URL) => {
  const normalizedSourcePath = normalizeText(sourcePath);
  const fragmentIndex = normalizedSourcePath.indexOf("#");
  const fileName = fragmentIndex >= 0
    ? normalizedSourcePath.slice(0, fragmentIndex)
    : normalizedSourcePath;
  const fragment = fragmentIndex >= 0
    ? normalizedSourcePath.slice(fragmentIndex + 1)
    : "";
  if (!fileName) return sourceRootUrl;
  return `${sourceRootUrl}/${fileName}${fragment ? `#${fragment}` : ""}`;
};

const labelForToken = (token) => (
  normalizeText(token)
    .replace(/^[/#@]+/, "")
    .replace(/[:.]/g, " ")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ") || normalizeText(token)
);

const rowForToken = (token, markdown) => {
  const escaped = normalizeText(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rowPattern = new RegExp(`^\\|\\s+\`${escaped}\`\\s+\\|.*$`, "m");
  const rowMatch = String(markdown || "").match(rowPattern);
  return rowMatch?.[0] || "";
};

const splitMarkdownTableRow = (row) => {
  const cells = [];
  let current = "";
  let escaped = false;
  for (const char of String(row || "").replace(/^\s*\|/, "").replace(/\|\s*$/, "")) {
    if (char === "|" && !escaped) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
    escaped = char === "\\" && !escaped;
    if (char !== "\\") escaped = false;
  }
  cells.push(current.trim());
  return cells;
};

const invocationMetadataForToken = (token, markdown) => {
  const cells = splitMarkdownTableRow(rowForToken(token, markdown));
  const summary = String(cells[1] || "").replace(/\s+/g, " ").trim();
  if (!String(token).startsWith("/")) return { summary };
  const extract = (cell, sigil) => [...String(cell || "").matchAll(/`((?:[/#][A-Za-z0-9_.-]+)|(?:@[A-Za-z0-9_.-]+:?))`/g)]
    .map((match) => match[1])
    .filter((value) => value.startsWith(sigil));
  const outcome = cells.slice(4).join(" ");
  const mcpTools = [...new Set([...outcome.matchAll(/`(agentic-graph\.[A-Za-z0-9_.-]+)`/g)]
    .map((match) => match[1]))];
  return {
    summary,
    bindings: [...new Set(extract(cells[2], "@"))],
    semantics: [...new Set(extract(cells[3], "#"))],
    ...(mcpTools.length ? { mcpTool: mcpTools[0], mcpTools } : {}),
  };
};

const snippetForToken = (token, markdown) => {
  const escaped = normalizeText(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rowPattern = new RegExp(`^\\|\\s+\`${escaped}\`\\s+\\|.*$`, "m");
  const rowMatch = String(markdown || "").match(rowPattern);
  if (rowMatch?.[0]) return rowMatch[0].slice(0, MAX_SNIPPET_CHARS);
  const headingPattern = new RegExp(`^#{2,4}\\s+${escaped}\\s*$`, "m");
  const headingMatch = headingPattern.exec(String(markdown || ""));
  if (!headingMatch) return "";
  const start = headingMatch.index;
  const remainder = String(markdown || "").slice(start + headingMatch[0].length);
  const nextHeading = remainder.search(/\n#{2,4}\s+/);
  const section = nextHeading >= 0
    ? String(markdown || "").slice(start, start + headingMatch[0].length + nextHeading)
    : String(markdown || "").slice(start);
  return section.slice(0, MAX_SNIPPET_CHARS);
};

export const buildAgenticCanvasOsDocsCatalog = (docsContentByFileName, { sourceRevision = "" } = {}) => {
  const sourceRootUrl = sourceRootUrlForRevision(sourceRevision);
  const factsFrontmatter = extractFrontmatter(docsContentByFileName["FACTS.md"] || "");
  const directResolution = parseDirectResolutionFromFrontmatter(factsFrontmatter);
  const catalog = new Map();

  for (const [kind, fileName] of Object.entries(AGENTIC_CANVAS_OS_DOCS_KIND_FILES)) {
    const markdown = docsContentByFileName[fileName] || "";
    const entries = parseDictionaryEntriesFromFrontmatter(extractFrontmatter(markdown));
    for (const token of entries) {
      const sourcePath = directResolution.get(token) || `${fileName}#${token}`;
      const metadata = invocationMetadataForToken(token, markdown);
      catalog.set(token, {
        token,
        kind,
        label: labelForToken(token),
        ...metadata,
        sourcePath,
        sourceUrl: sourceUrlForPath(sourcePath, sourceRootUrl),
      });
    }
  }

  for (const [token, sourcePath] of directResolution.entries()) {
    if (catalog.has(token)) continue;
    const fileName = dictionaryFileForAgenticCanvasOsToken(token);
    if (!fileName) continue;
    catalog.set(token, {
      token,
      kind: kindForAgenticCanvasOsToken(token),
      label: labelForToken(token),
      ...invocationMetadataForToken(token, docsContentByFileName[fileName] || ""),
      sourcePath,
      sourceUrl: sourceUrlForPath(sourcePath, sourceRootUrl),
    });
  }

  return [...catalog.values()].sort((left, right) => left.token.localeCompare(right.token));
};

export const buildAgenticCanvasOsDocsCatalogDigest = (catalog = []) => (
  createHash("sha256")
    .update(serializeAgenticCanvasOsDocsCatalogForDigest(catalog), "utf8")
    .digest("hex")
);

export const buildAgenticCanvasOsDocsRoutingDigest = (catalog = []) => (
  createHash("sha256")
    .update(serializeAgenticCanvasOsDocsRoutingForDigest(catalog), "utf8")
    .digest("hex")
);

export const buildAgenticCanvasOsDocsInvokePayload = ({
  docsContentByFileName = {},
  token = "",
  query = "",
  includeContent = false,
  limit = 120,
  absoluteDocsRoot = "",
  sourceRevision = "",
  liveAgentProviderProofRevision = "",
} = {}) => {
  const normalizedSourceRevision = normalizeText(sourceRevision);
  if (!/^[0-9a-f]{40}$/.test(normalizedSourceRevision)) {
    throw new Error("Agentic Canvas OS docs payload requires an exact source revision SHA");
  }
  const sourceRootUrl = sourceRootUrlForRevision(normalizedSourceRevision);
  const catalog = buildAgenticCanvasOsDocsCatalog(docsContentByFileName, {
    sourceRevision: normalizedSourceRevision,
  });
  const catalogDigest = buildAgenticCanvasOsDocsCatalogDigest(catalog);
  const routingDigest = buildAgenticCanvasOsDocsRoutingDigest(catalog);
  const counts = catalog.reduce((acc, entry) => {
    acc[entry.kind] = (acc[entry.kind] || 0) + 1;
    return acc;
  }, { command: 0, semantic: 0, binding: 0 });
  const normalizedToken = normalizeText(token);
  const normalizedQuery = normalizeText(query).toLowerCase();
  const sigilQuery = ["/", "#", "@"].includes(normalizedQuery) ? normalizedQuery : "";
  const boundedLimit = Math.max(1, Math.min(500, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 120));
  const matchesQuery = (entry) => sigilQuery
    ? entry.token.startsWith(sigilQuery)
    : !normalizedQuery || [
      entry.token,
      entry.kind,
      entry.label,
      entry.summary,
      entry.mcpTool,
      ...(entry.mcpTools || []),
      ...(entry.semantics || []),
      ...(entry.bindings || []),
      entry.sourcePath,
    ].some((value) => normalizeText(value).toLowerCase().includes(normalizedQuery));

  const invocation = normalizedToken
    ? catalog.find((entry) => entry.token === normalizedToken) || null
    : null;
  const resolvedInvocation = invocation && includeContent
    ? {
        ...invocation,
        content: snippetForToken(
          invocation.token,
          docsContentByFileName[dictionaryFileForAgenticCanvasOsToken(invocation.token)] || "",
        ),
      }
    : invocation;
  const filteredCatalog = normalizedToken
    ? []
    : catalog.filter(matchesQuery);
  const limitedCatalog = filteredCatalog.slice(0, boundedLimit);
  const liveAgentProviderProof = buildAgentLiveProviderProofSummary({
    markdown: docsContentByFileName[AGENTIC_CANVAS_OS_LIVE_AGENT_PROOF_FILE] || "",
    sourceRevision: normalizedSourceRevision,
    proofRevision: liveAgentProviderProofRevision,
  });
  const progressiveAgentsReadiness = buildProgressiveAgentsReadinessSummary({
    markdown: docsContentByFileName[AGENTIC_CANVAS_OS_PROGRESSIVE_AGENTS_FILE] || "",
    sourceRevision: normalizedSourceRevision,
  });

  return {
    ok: !normalizedToken || Boolean(invocation),
    docsRoot: AGENTIC_CANVAS_OS_DOCS_WORKSPACE_ROOT,
    sourceRootUrl,
    sourceRevision: normalizedSourceRevision,
    catalogDigest,
    routingSchema: AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA,
    routingDigest,
    liveAgentProviderProof,
    progressiveAgentsReadiness,
    ...(absoluteDocsRoot ? { absoluteDocsRoot } : {}),
    ...(normalizedToken ? { token: normalizedToken } : {}),
    invocation: resolvedInvocation,
    catalog: limitedCatalog,
    counts,
    truncated: filteredCatalog.length > limitedCatalog.length,
    ...(!normalizedToken || invocation
      ? {}
      : {
          error: {
            code: "unknown_invocation_token",
            message: `Unknown Agentic Canvas OS docs invocation token: ${normalizedToken}`,
          },
        }),
  };
};

export const buildAgenticCanvasOsDocsStaticResolutionPayload = (args = {}) => (
  buildAgenticCanvasOsDocsInvokePayload({
    ...args,
    docsContentByFileName: {
      "FACTS.md": "",
      "DICTIONARY-COMMAND.md": "",
      "DICTIONARY-SEMANTIC.md": "",
      "DICTIONARY-BINDING.md": "",
      [AGENTIC_CANVAS_OS_LIVE_AGENT_PROOF_FILE]: "",
      [AGENTIC_CANVAS_OS_PROGRESSIVE_AGENTS_FILE]: "",
    },
  })
);

export const buildAgenticCanvasOsDocsDynamicResolutionPayload = async (
  args = {},
  { fetchImpl = globalThis.fetch } = {},
) => {
  if (typeof fetchImpl !== "function") {
    throw new Error("Agentic Canvas OS docs resolution requires a fetch implementation");
  }
  const revisionResponse = await fetchImpl("https://api.github.com/repos/huijoohwee/agentic-canvas-os/commits/main", {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "agentic-graph-agentic-canvas-os-docs-runtime",
    },
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  if (!revisionResponse.ok) {
    throw new Error(`Agentic Canvas OS revision lookup failed with status ${revisionResponse.status}`);
  }
  const revisionPayload = await revisionResponse.json();
  const sourceRevision = normalizeText(revisionPayload?.sha);
  if (!/^[0-9a-f]{40}$/.test(sourceRevision)) {
    throw new Error("Agentic Canvas OS revision lookup returned an invalid SHA");
  }
  const fetchDoc = async (fileName) => {
    try {
      const url = `https://raw.githubusercontent.com/huijoohwee/agentic-canvas-os/${sourceRevision}/docs/${fileName}`;
      const res = await fetchImpl(url, {
        cf: { cacheTtl: 86400, cacheEverything: true }
      });
      if (!res.ok) return "";
      return await res.text();
    } catch {
      return "";
    }
  };

  const [facts, command, semantic, binding, liveAgentProviderProof, progressiveAgents, liveAgentProviderProofRevision] = await Promise.all([
    fetchDoc("FACTS.md"),
    fetchDoc("DICTIONARY-COMMAND.md"),
    fetchDoc("DICTIONARY-SEMANTIC.md"),
    fetchDoc("DICTIONARY-BINDING.md"),
    fetchDoc(AGENTIC_CANVAS_OS_LIVE_AGENT_PROOF_FILE),
    fetchDoc(AGENTIC_CANVAS_OS_PROGRESSIVE_AGENTS_FILE),
    resolveAgentLiveProviderProofRevisionFromGitHub({
      sourceRevision,
      fetchImpl,
      requestInit: { cf: { cacheTtl: 86400, cacheEverything: true } },
    }),
  ]);

  return buildAgenticCanvasOsDocsInvokePayload({
    ...args,
    sourceRevision,
    liveAgentProviderProofRevision,
    docsContentByFileName: {
      "FACTS.md": facts,
      "DICTIONARY-COMMAND.md": command,
      "DICTIONARY-SEMANTIC.md": semantic,
      "DICTIONARY-BINDING.md": binding,
      [AGENTIC_CANVAS_OS_LIVE_AGENT_PROOF_FILE]: liveAgentProviderProof,
      [AGENTIC_CANVAS_OS_PROGRESSIVE_AGENTS_FILE]: progressiveAgents,
    },
  });
};
