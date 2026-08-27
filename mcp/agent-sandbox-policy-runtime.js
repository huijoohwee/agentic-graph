import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const AGENT_SANDBOX_POLICY_SCHEMA = "agenticgraph-agent-sandbox-policy/v1";

const POLICY_DOMAINS = Object.freeze(["filesystem", "process", "network", "credentials"]);
const NETWORK_PROTOCOLS = Object.freeze(["http", "https"]);
const NETWORK_METHODS = Object.freeze(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]);

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" ? value.trim() : "";
const uniqueStrings = (value, field, errors) => {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array.`);
    return [];
  }
  const normalized = value.map(text).filter(Boolean);
  if (normalized.length !== value.length) errors.push(`${field} entries must be non-empty strings.`);
  return [...new Set(normalized)].sort();
};
const rejectUnknownKeys = (record, allowed, field, errors) => {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) errors.push(`${field}.${key} is not supported.`);
  }
};
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
};
const digestPolicy = (policy) => crypto.createHash("sha256").update(JSON.stringify(stableValue(policy))).digest("hex");
const isWithin = (parent, candidate) => {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

function parsePolicySource(sourceText) {
  try {
    return { value: JSON.parse(sourceText), errors: [] };
  } catch {
    return {
      value: null,
      errors: ["Policy source must use the dependency-free YAML 1.2 JSON-compatible subset."],
    };
  }
}

function normalizeNetworkRules(value, errors) {
  if (!Array.isArray(value)) {
    errors.push("network.rules must be an array.");
    return [];
  }
  const ids = new Set();
  return value.map((rawRule, index) => {
    const field = `network.rules[${index}]`;
    if (!isRecord(rawRule)) {
      errors.push(`${field} must be an object.`);
      return null;
    }
    rejectUnknownKeys(rawRule, new Set(["id", "hosts", "ports", "protocols", "methods", "path_prefixes", "executables"]), field, errors);
    const id = text(rawRule.id);
    if (!id) errors.push(`${field}.id must be a non-empty string.`);
    if (ids.has(id)) errors.push(`${field}.id must be unique.`);
    ids.add(id);
    const hosts = uniqueStrings(rawRule.hosts, `${field}.hosts`, errors).map((host) => host.toLowerCase());
    const ports = Array.isArray(rawRule.ports) ? [...new Set(rawRule.ports)] : [];
    if (!Array.isArray(rawRule.ports) || ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)) {
      errors.push(`${field}.ports must contain integers from 1 to 65535.`);
    }
    const protocols = uniqueStrings(rawRule.protocols, `${field}.protocols`, errors).map((protocol) => protocol.toLowerCase());
    if (protocols.some((protocol) => !NETWORK_PROTOCOLS.includes(protocol))) errors.push(`${field}.protocols contains an unsupported protocol.`);
    const methods = uniqueStrings(rawRule.methods, `${field}.methods`, errors).map((method) => method.toUpperCase());
    if (methods.some((method) => !NETWORK_METHODS.includes(method))) errors.push(`${field}.methods contains an unsupported method.`);
    return {
      id,
      hosts,
      ports: ports.sort((left, right) => left - right),
      protocols,
      methods,
      path_prefixes: uniqueStrings(rawRule.path_prefixes, `${field}.path_prefixes`, errors),
      executables: uniqueStrings(rawRule.executables, `${field}.executables`, errors),
    };
  }).filter(Boolean);
}

export function compileAgentSandboxPolicy(sourceText) {
  const parsed = parsePolicySource(sourceText);
  if (!parsed.value) return { ok: false, schema: AGENT_SANDBOX_POLICY_SCHEMA, errors: parsed.errors };
  const errors = [];
  const raw = parsed.value;
  if (!isRecord(raw)) return { ok: false, schema: AGENT_SANDBOX_POLICY_SCHEMA, errors: ["Policy root must be an object."] };
  rejectUnknownKeys(raw, new Set(["schema", "policy_id", ...POLICY_DOMAINS, "audit"]), "policy", errors);
  if (raw.schema !== AGENT_SANDBOX_POLICY_SCHEMA) errors.push(`schema must equal ${AGENT_SANDBOX_POLICY_SCHEMA}.`);
  const policyId = text(raw.policy_id);
  if (!policyId) errors.push("policy_id must be a non-empty string.");

  const filesystem = isRecord(raw.filesystem) ? raw.filesystem : {};
  const processPolicy = isRecord(raw.process) ? raw.process : {};
  const network = isRecord(raw.network) ? raw.network : {};
  const credentials = isRecord(raw.credentials) ? raw.credentials : {};
  const audit = isRecord(raw.audit) ? raw.audit : {};
  if (!isRecord(raw.filesystem)) errors.push("filesystem must be an object.");
  if (!isRecord(raw.process)) errors.push("process must be an object.");
  if (!isRecord(raw.network)) errors.push("network must be an object.");
  if (!isRecord(raw.credentials)) errors.push("credentials must be an object.");
  if (!isRecord(raw.audit)) errors.push("audit must be an object.");
  rejectUnknownKeys(filesystem, new Set(["read", "write"]), "filesystem", errors);
  rejectUnknownKeys(processPolicy, new Set(["executables", "max_runtime_ms", "max_output_bytes"]), "process", errors);
  rejectUnknownKeys(network, new Set(["default", "rules"]), "network", errors);
  rejectUnknownKeys(credentials, new Set(["environment"]), "credentials", errors);
  rejectUnknownKeys(audit, new Set(["decision_log", "redact_values"]), "audit", errors);

  const maxRuntimeMs = Number(processPolicy.max_runtime_ms);
  const maxOutputBytes = Number(processPolicy.max_output_bytes);
  if (!Number.isInteger(maxRuntimeMs) || maxRuntimeMs < 1) errors.push("process.max_runtime_ms must be a positive integer.");
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1) errors.push("process.max_output_bytes must be a positive integer.");
  if (network.default !== "deny") errors.push("network.default must be deny.");
  if (audit.decision_log !== "required") errors.push("audit.decision_log must be required.");
  if (audit.redact_values !== true) errors.push("audit.redact_values must be true.");

  const policy = {
    schema: AGENT_SANDBOX_POLICY_SCHEMA,
    policy_id: policyId,
    filesystem: {
      read: uniqueStrings(filesystem.read, "filesystem.read", errors),
      write: uniqueStrings(filesystem.write, "filesystem.write", errors),
    },
    process: {
      executables: uniqueStrings(processPolicy.executables, "process.executables", errors),
      max_runtime_ms: maxRuntimeMs,
      max_output_bytes: maxOutputBytes,
    },
    network: { default: "deny", rules: normalizeNetworkRules(network.rules, errors) },
    credentials: { environment: uniqueStrings(credentials.environment, "credentials.environment", errors) },
    audit: { decision_log: "required", redact_values: true },
  };
  if (errors.length) return { ok: false, schema: AGENT_SANDBOX_POLICY_SCHEMA, errors };
  return {
    ok: true,
    schema: AGENT_SANDBOX_POLICY_SCHEMA,
    policy,
    policy_digest: digestPolicy(policy),
    enforcement: {
      decision_engine: "runtime-ready",
      application_preflight: true,
      kernel_or_container_isolation: "required-not-provided",
      static_domains: ["filesystem", "process", "credentials"],
      dynamic_domains: ["network"],
    },
  };
}

export async function loadAgentSandboxPolicy(policyPath, { rootDir = process.cwd() } = {}) {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, text(policyPath));
  if (!text(policyPath) || !isWithin(root, resolved)) {
    return { ok: false, schema: AGENT_SANDBOX_POLICY_SCHEMA, errors: ["policy_path must resolve inside the runtime root."] };
  }
  try {
    const result = compileAgentSandboxPolicy(await fs.readFile(resolved, "utf8"));
    return { ...result, policy_path: path.relative(root, resolved) };
  } catch (error) {
    return { ok: false, schema: AGENT_SANDBOX_POLICY_SCHEMA, policy_path: path.relative(root, resolved), errors: [error instanceof Error ? error.message : String(error)] };
  }
}

const hostMatches = (ruleHost, requestHost) => ruleHost.startsWith("*.")
  ? requestHost.endsWith(ruleHost.slice(1)) && requestHost !== ruleHost.slice(2)
  : ruleHost === requestHost;
const pathAllowed = (workspaceRoot, allowedRoots, requestedPath) => {
  const target = path.resolve(workspaceRoot, requestedPath);
  return isWithin(workspaceRoot, target) && allowedRoots.some((allowedRoot) => isWithin(path.resolve(workspaceRoot, allowedRoot), target));
};

export function authorizeAgentSandboxOperation(compiled, operation, { workspaceRoot = process.cwd() } = {}) {
  if (!compiled?.ok || !compiled.policy) return { ok: false, schema: AGENT_SANDBOX_POLICY_SCHEMA, decision: "deny", reason_code: "policy_invalid", errors: compiled?.errors || ["Policy is not compiled."] };
  const policy = compiled.policy;
  const kind = text(operation?.kind);
  let allowed = false;
  let reasonCode = "operation_unsupported";
  let matchedRuleId = null;

  if (kind === "filesystem.read" || kind === "filesystem.write") {
    const access = kind.endsWith("read") ? policy.filesystem.read : policy.filesystem.write;
    allowed = Boolean(text(operation?.path)) && pathAllowed(path.resolve(workspaceRoot), access, operation.path);
    reasonCode = allowed ? "filesystem_allowed" : "filesystem_denied";
  } else if (kind === "process.execute") {
    const executable = text(operation?.executable);
    const runtimeMs = Number(operation?.runtime_ms);
    allowed = path.isAbsolute(executable)
      && policy.process.executables.includes(executable)
      && Number.isFinite(runtimeMs)
      && runtimeMs >= 0
      && runtimeMs <= policy.process.max_runtime_ms;
    reasonCode = allowed ? "process_allowed" : "process_denied";
  } else if (kind === "credentials.use") {
    allowed = policy.credentials.environment.includes(text(operation?.environment));
    reasonCode = allowed ? "credential_allowed" : "credential_denied";
  } else if (kind === "network.request") {
    try {
      const url = new URL(operation?.url);
      const protocol = url.protocol.slice(0, -1).toLowerCase();
      const port = Number(url.port || (protocol === "https" ? 443 : 80));
      const method = text(operation?.method).toUpperCase();
      const executable = text(operation?.executable);
      const rule = policy.network.rules.find((candidate) =>
        candidate.hosts.some((host) => hostMatches(host, url.hostname.toLowerCase()))
        && candidate.ports.includes(port)
        && candidate.protocols.includes(protocol)
        && candidate.methods.includes(method)
        && candidate.path_prefixes.some((prefix) => url.pathname.startsWith(prefix))
        && candidate.executables.includes(executable));
      allowed = Boolean(rule);
      matchedRuleId = rule?.id || null;
      reasonCode = allowed ? "network_allowed" : "network_denied";
    } catch {
      reasonCode = "network_request_invalid";
    }
  }

  return {
    ok: true,
    schema: AGENT_SANDBOX_POLICY_SCHEMA,
    decision: allowed ? "allow" : "deny",
    reason_code: reasonCode,
    matched_rule_id: matchedRuleId,
    policy_id: policy.policy_id,
    policy_digest: compiled.policy_digest,
    enforcement: compiled.enforcement,
    audit: { redacted: true, operation_kind: kind || "unknown" },
  };
}

export async function runAgentSandboxPolicyTool(toolName, args, options = {}) {
  const compiled = await loadAgentSandboxPolicy(args?.policy_path, options);
  if (toolName === "agenticgraph.sandbox.policy.validate") return compiled;
  if (toolName === "agenticgraph.sandbox.policy.authorize") {
    return authorizeAgentSandboxOperation(compiled, args?.operation, { workspaceRoot: options.rootDir });
  }
  return { ok: false, schema: AGENT_SANDBOX_POLICY_SCHEMA, decision: "deny", reason_code: "tool_unsupported" };
}
