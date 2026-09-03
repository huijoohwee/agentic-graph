import Ajv2020 from "ajv/dist/2020.js";

import {
  APPLICATION_ADAPTER_INTERFACE_ID,
  APPLICATION_ADAPTER_INTERFACE_REVISION,
  APPLICATION_COMPONENT_CATALOG,
  APPLICATION_COMPONENT_CATALOG_DIGEST,
  APPLICATION_PLAN_SCHEMA_ID,
  APPLICATION_RESULT_SCHEMA_ID,
  APPLICATION_VALUE_SCHEMA,
  compileApplicationManifest,
  deepFreezeApplicationValue,
  digestApplicationValue,
  stableApplicationJson,
} from "../contracts/agent-application.schema.js";
import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from "../canvas/src/features/agent-ready/agentic-graph-local-mcp-tool-names.mjs";

export const AGENT_APPLICATION_TOOL_NAMES = Object.freeze({
  catalog: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationCatalog,
  plan: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationPlan,
  execute: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationExecute,
});
const CATALOG_RESULT_SCHEMA_ID = "agentic-graph.application-catalog-result/v1";
const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const EXACT_REVISION = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const INTEGRATION_PROFILE_ID = /^kgip_[0-9a-f]{32}$/;
const CAPABILITY_ID = /^kgcap_[0-9a-f]{32}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;
const MAX_PUBLIC_COUNTER = 1_000_000;
const compareCodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const valueValidator = new Ajv2020({ strict: false }).compile(APPLICATION_VALUE_SCHEMA);
const endpointKey = (endpoint) => `${endpoint.node}.${endpoint.port}`;
const publicPort = (port, kinds = port.kinds) => ({ name: port.name, schemaRef: port.schemaRef, schemaDigest: port.schemaDigest, kinds: [...kinds], ...(typeof port.required === "boolean" ? { required: port.required } : {}) });
const fail = (code, message, extra = {}) => deepFreezeApplicationValue({ ok: false, error: { code, message }, ...extra });
const exactArgumentKeys = (args, keys) => args && typeof args === "object" && !Array.isArray(args) && Object.keys(args).length === keys.length && keys.every((key) => key in args);
const exactDataRecord = (value, keys) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return false;
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && ownKeys.every((key) => typeof key === "string" && keys.includes(key) && Object.getOwnPropertyDescriptor(value, key)?.enumerable && "value" in Object.getOwnPropertyDescriptor(value, key));
};
const exactDataArray = (value, max, { min = 0 } = {}) => {
  if (!Array.isArray(value) || value.length < min || value.length > max) return false;
  const expectedKeys = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== expectedKeys.size || ownKeys.some((key) => typeof key !== "string" || !expectedKeys.has(key))) return false;
  return Array.from({ length: value.length }, (_, index) => Object.getOwnPropertyDescriptor(value, String(index))).every((descriptor) => descriptor?.enumerable && "value" in descriptor);
};
const boundedString = (value, max, pattern) => typeof value === "string" && value.length > 0 && value.length <= max && (!pattern || pattern.test(value));
const projectRefs = (entries, { max, revisionPattern }) => {
  if (!exactDataArray(entries, max, { min: 1 })) return null;
  const refs = [];
  for (const entry of entries) {
    if (!exactDataRecord(entry, ["id", "revision"]) || !boundedString(entry.id, 120, SAFE_ID) || !boundedString(entry.revision, 120, revisionPattern)) return null;
    refs.push({ id: entry.id, revision: entry.revision });
  }
  if (new Set(refs.map((entry) => `${entry.id}@${entry.revision}`)).size !== refs.length) return null;
  return refs.sort((left, right) => compareCodeUnits(left.id, right.id) || compareCodeUnits(left.revision, right.revision));
};
const projectPublicAdapter = (adapter) => {
  try {
    const supportedComponents = projectRefs(adapter?.supportedComponents, { max: 32, revisionPattern: EXACT_REVISION });
    const supportedModes = exactDataArray(adapter?.supportedModes, 2, { min: 1 }) ? [...adapter.supportedModes].sort(compareCodeUnits) : null;
    if (!supportedComponents || !supportedModes || new Set(supportedModes).size !== supportedModes.length || supportedModes.some((mode) => !["dry-run", "live"].includes(mode))) return null;
    if (!boundedString(adapter.id, 120, SAFE_ID) || !boundedString(adapter.revision, 40, EXACT_REVISION) || adapter.interfaceId !== APPLICATION_ADAPTER_INTERFACE_ID || adapter.interfaceRevision !== APPLICATION_ADAPTER_INTERFACE_REVISION) return null;
    if (!boundedString(adapter.implementationRevision, 40, EXACT_REVISION) || !boundedString(adapter.ownerImplementationRevision, 40, EXACT_REVISION) || !SHA256.test(adapter.implementationDigest) || !SHA256.test(adapter.ownerImplementationDigest)) return null;
    return { id: adapter.id, revision: adapter.revision, interfaceId: adapter.interfaceId, interfaceRevision: adapter.interfaceRevision, implementationRevision: adapter.implementationRevision, implementationDigest: adapter.implementationDigest, ownerImplementationRevision: adapter.ownerImplementationRevision, ownerImplementationDigest: adapter.ownerImplementationDigest, supportedComponents, supportedModes };
  } catch { return null; }
};
const PUBLIC_OWNER_FAILURES = Object.freeze({
  component_adapter_unavailable: "No exact host adapter is available for this component revision and mode.", component_adapter_ambiguous: "Host policy does not select exactly one adapter for this component revision and mode.",
  agent_definition_unavailable: "The exact registered agent definition is unavailable.", owner_evidence_unavailable: "Exact runtime owner evidence is unavailable.",
  capability_not_found: "The exact integration capability is unavailable.", capability_revision_mismatch: "The exact integration capability revision changed; replan explicitly.", integration_profile_drift: "The opaque integration profile changed; replan explicitly.", integration_not_replay_safe: "External application execution requires an idempotent integration binding.",
});
const publicOwnerFailure = (error, fallbackCode = "owner_evidence_unavailable") => {
  const code = typeof error?.code === "string" && Object.hasOwn(PUBLIC_OWNER_FAILURES, error.code) ? error.code : fallbackCode;
  return { code, message: PUBLIC_OWNER_FAILURES[code] || PUBLIC_OWNER_FAILURES.owner_evidence_unavailable };
};
const PUBLIC_ADAPTER_FAILURES = Object.freeze({
  agent_plan_blocked: "The registered agent owner could not produce a zero-call plan.", approval_required: "Host authorization is required before external execution.",
  approval_gate_mismatch: "External authorization was rejected by the runtime owner.", approval_digest_mismatch: "External authorization was rejected by the runtime owner.", approval_malformed: "External authorization was rejected by the runtime owner.", approval_expired: "External authorization was rejected by the runtime owner.", approval_invalid_signature: "External authorization was rejected by the runtime owner.", approval_consumed: "External authorization was rejected by the runtime owner.", approval_not_configured: "External authorization was rejected by the runtime owner.", approval_reserved: "External authorization is already reserved by an in-flight action.", approval_reservations_full: "The bounded external authorization reservation ledger is full.",
  approval_ledger_full: "The bounded consumed-authorization ledger is full.",
  dispatch_marker_required: "External execution was blocked before egress because the host dispatch marker was unavailable.",
  capability_not_found: "The exact integration capability is unavailable.", capability_revision_mismatch: "The exact integration capability revision changed; replan explicitly.", integration_profile_drift: "The opaque integration profile changed; replan explicitly.", integration_not_replay_safe: "External application execution requires an idempotent integration binding.", idempotency_conflict: "The idempotency key is already bound to another external action.",
  invalid_artifact: "The canonical artifact is invalid.", invalid_workspace_path: "The canonical artifact workspace path is invalid.", invalid_source_url: "The canonical artifact source URL is invalid.", artifact_too_complex: "The canonical artifact exceeds its complexity bound.", upstream_tool_unavailable: "The approved external tool is unavailable.", upstream_schema_changed: "The approved external tool schema changed; replan explicitly.", upstream_arguments_invalid: "Mapped external tool arguments are invalid.", upstream_schema_invalid: "The approved external tool schema is invalid.", upstream_catalog_too_large: "The external tool catalog exceeds its bound.", upstream_tool_error: "The external tool returned an error.", invalid_upstream_receipt: "The external tool returned an invalid receipt.", external_mcp_call_failed: "External execution failed without exposing private details.",
  external_dispatch_unconfirmed: "External owner did not confirm mutation dispatch.",
  component_execution_blocked: "Runtime owner blocked component execution.",
});
const projectEvidence = (value) => {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const output = {};
    const read = (key) => { const descriptor = Object.getOwnPropertyDescriptor(value, key); return descriptor?.enumerable && "value" in descriptor ? descriptor.value : undefined; };
    for (const key of ["renderer", "ownerContract"]) { const entry = read(key); if (boundedString(entry, 160)) output[key] = entry; }
    for (const key of ["paidProviderCalls", "externalCalls"]) { const entry = read(key); if (Number.isInteger(entry) && entry >= 0 && entry <= MAX_PUBLIC_COUNTER) output[key] = entry; }
    const actionDigest = read("actionDigest"); if (typeof actionDigest === "string" && SHA256.test(actionDigest)) output.actionDigest = actionDigest;
    for (const key of ["cached", "externalCallAttempted", "cancellationRequested", "reconciliationRequired", "sideEffectDispatched"]) { const entry = read(key); if (typeof entry === "boolean") output[key] = entry; }
    return output;
  } catch { return {}; }
};
const projectIntegration = (value) => {
  try {
    const keys = ["integrationProfileId", "integrationProfileRevision", "capabilityId", "capabilityRevision", "schemaDigest", "artifactKind", "approvalRequired", "replay"];
    if (!exactDataRecord(value, keys) || !INTEGRATION_PROFILE_ID.test(value.integrationProfileId) || !SHA256.test(value.integrationProfileRevision) || !CAPABILITY_ID.test(value.capabilityId) || !SHA256.test(value.capabilityRevision) || !SHA256.test(value.schemaDigest)) return null;
    if (!["slides", "spreadsheet"].includes(value.artifactKind) || value.approvalRequired !== true || !["idempotency-key", "unsupported"].includes(value.replay)) return null;
    return Object.fromEntries(keys.map((key) => [key, value[key]]));
  } catch { return null; }
};
const projectIntegrations = (entries) => {
  try { if (!exactDataArray(entries, 1000)) return null; const projected = entries.map(projectIntegration); return projected.every(Boolean) ? projected.sort((left, right) => compareCodeUnits(left.capabilityId, right.capabilityId) || compareCodeUnits(left.integrationProfileId, right.integrationProfileId)) : null; }
  catch { return null; }
};
const projectOwnerEvidence = (value) => {
  try {
    const keys = value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "integration") ? ["contractId", "ownerId", "revision", "digest", "integration"] : ["contractId", "ownerId", "revision", "digest"];
    if (!exactDataRecord(value, keys) || !boundedString(value.contractId, 160) || !boundedString(value.ownerId, 120, SAFE_ID) || !boundedString(value.revision, 160) || !SHA256.test(value.digest)) return null;
    const integration = keys.includes("integration") ? projectIntegration(value.integration) : undefined;
    if (keys.includes("integration") && !integration) return null;
    return { contractId: value.contractId, ownerId: value.ownerId, revision: value.revision, digest: value.digest, ...(integration ? { integration } : {}) };
  } catch { return null; }
};
const publicDiagnostics = (diagnostics) => diagnostics.slice(0, 256).map((diagnostic) => ({
  code: String(diagnostic.code || "application_manifest_invalid").slice(0, 120), message: String(diagnostic.message || "Application manifest is invalid.").slice(0, 1000),
  ...(typeof diagnostic.nodeId === "string" ? { nodeId: diagnostic.nodeId } : {}), ...(typeof diagnostic.port === "string" ? { port: diagnostic.port } : {}),
  ...(diagnostic.requested ? { requested: structuredClone(diagnostic.requested) } : {}), ...(diagnostic.component ? { component: structuredClone(diagnostic.component) } : {}),
  ...(Array.isArray(diagnostic.availableRevisions) ? { availableRevisions: diagnostic.availableRevisions.slice(0, 100) } : {}), ...(Array.isArray(diagnostic.migrations) ? { migrations: [] } : {}),
}));
const jsonBytes = (value) => Buffer.byteLength(stableApplicationJson(value));
const boundTerminalResult = (result, maxBytes) => {
  const candidate = structuredClone(result);
  if (jsonBytes(candidate) <= maxBytes || candidate.ok !== false) return candidate;
  const hadSteps = Array.isArray(candidate.steps);
  if (hadSteps) {
    candidate.stepsTruncated = true;
    while (candidate.steps.length && jsonBytes(candidate) > maxBytes) candidate.steps.pop();
    if (jsonBytes(candidate) <= maxBytes) return candidate;
  }
  const code = boundedString(candidate.error?.code, 120, SAFE_ID) ? candidate.error.code : "application_execution_blocked";
  const minimal = { ok: false, error: { code, message: "Application execution failed; bounded details were omitted." } };
  const addIfBounded = (key, value) => {
    if (typeof value === "undefined") return;
    minimal[key] = value;
    if (jsonBytes(minimal) > maxBytes) delete minimal[key];
  };
  if (typeof candidate.cached === "boolean") addIfBounded("cached", candidate.cached);
  if (Array.isArray(candidate.diagnostics) || candidate.diagnosticsTruncated === true) addIfBounded("diagnosticsTruncated", true);
  if (hadSteps || candidate.stepsTruncated === true) addIfBounded("stepsTruncated", true);
  const evidence = projectEvidence(candidate.evidence); if (Object.keys(evidence).length) addIfBounded("evidence", evidence);
  for (const key of ["schemaVersion", "status", "planDigest", "executionDigest", "idempotencyKey", "mode", "failedNodeId", "actualPlanDigest", "nodeId", "port"]) addIfBounded(key, candidate[key]);
  return minimal;
};
const validateValue = (value, kinds) => {
  try { stableApplicationJson(value); } catch (error) { return error instanceof Error ? error.message : String(error); }
  if (!valueValidator(value)) return "Value does not satisfy agentic-graph.application-value/v1.";
  if (!kinds.includes(value.kind)) return `Value kind ${value.kind} is outside the locked port kinds.`;
  if (value.kind === "text" && typeof value.value !== "string") return "Text values require a string payload.";
  if (["agent-plan", "artifact", "external-receipt"].includes(value.kind) && (!value.value || typeof value.value !== "object" || Array.isArray(value.value))) return `${value.kind} values require an object payload.`;
  return "";
};
const deadlineError = () => Object.assign(new Error("Application runtime deadline was reached."), { code: "application_deadline_exceeded" });
const cancellationError = () => Object.assign(new Error("Application execution was cancelled by the host."), { code: "application_cancelled" });
const abortError = (signal) => signal.reason?.code === "application_deadline_exceeded" ? deadlineError() : cancellationError();
const withDeadline = async (invoke, deadlineAt, controller) => {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) { const error = deadlineError(); controller.abort(error); throw error; }
  if (controller.signal.aborted) throw abortError(controller.signal);
  let timer; let onAbort;
  try {
    const work = Promise.resolve().then(() => { if (controller.signal.aborted) throw abortError(controller.signal); return invoke(); });
    const aborted = new Promise((resolve, reject) => { onAbort = () => reject(abortError(controller.signal)); controller.signal.addEventListener("abort", onAbort, { once: true }); });
    const timedOut = new Promise((resolve, reject) => { timer = setTimeout(() => { const error = deadlineError(); controller.abort(error); reject(error); }, remaining); });
    return await Promise.race([work, aborted, timedOut]);
  } finally { clearTimeout(timer); if (onAbort) controller.signal.removeEventListener("abort", onAbort); }
};

export function createAgentApplicationRuntime({ adapterRegistry, executionLedger = new Map(), maxLedgerEntries = 1000, ledgerTtlMs = 60 * 60 * 1000 } = {}) {
  if (!adapterRegistry || typeof adapterRegistry.resolve !== "function" || !SHA256.test(adapterRegistry.policyDigest) || typeof adapterRegistry.resolveNodeOwnerEvidence !== "function") throw new TypeError("Application runtime requires an exact host adapter registry.");
  if (!(executionLedger instanceof Map)) throw new TypeError("Application execution ledger must be Map-backed.");
  if (!Number.isInteger(maxLedgerEntries) || maxLedgerEntries < 1 || maxLedgerEntries > 100_000 || !Number.isInteger(ledgerTtlMs) || ledgerTtlMs < 60_000 || ledgerTtlMs > 7 * 24 * 60 * 60 * 1000) throw new TypeError("Application execution ledger bounds are invalid.");
  const suppliedCatalog = adapterRegistry.componentCatalog || APPLICATION_COMPONENT_CATALOG;
  const activeCatalogDigest = adapterRegistry.componentCatalogDigest || APPLICATION_COMPONENT_CATALOG_DIGEST;
  let activeCatalog;
  try { activeCatalog = deepFreezeApplicationValue(JSON.parse(stableApplicationJson(suppliedCatalog))); }
  catch { throw new TypeError("Application runtime component catalog must be immutable pure JSON data."); }
  if (!activeCatalog || activeCatalog.schemaVersion !== APPLICATION_COMPONENT_CATALOG.schemaVersion || activeCatalog.catalogRevision !== APPLICATION_COMPONENT_CATALOG.catalogRevision || !Array.isArray(activeCatalog.components) || !activeCatalog.components.length || activeCatalog.components.length > 100 || !SHA256.test(activeCatalogDigest) || digestApplicationValue(activeCatalog) !== activeCatalogDigest) throw new TypeError("Application runtime component catalog evidence is invalid.");

  const catalog = (args = {}) => {
    if (!exactArgumentKeys(args, [])) return fail("invalid_catalog_input", "Catalog accepts exactly an empty object.");
    let integrations; try { integrations = projectIntegrations(adapterRegistry.integrations); } catch { integrations = null; }
    if (!integrations) return fail("integration_catalog_invalid", "Host integration evidence does not satisfy the exact public catalog contract.");
    const components = [];
    for (const component of activeCatalog.components) {
      let resolution; try { resolution = adapterRegistry.resolve(component); } catch { resolution = null; }
      if (!resolution?.ok) { const error = publicOwnerFailure(resolution?.error, "component_adapter_unavailable"); return fail(error.code, error.message); }
      const adapter = projectPublicAdapter(resolution.adapter);
      if (!adapter) return fail("adapter_evidence_invalid", "Host adapter evidence does not satisfy the exact public contract.");
      components.push({
        id: component.id, revision: component.revision, title: component.title, description: component.description, stability: component.stability, sourceDigest: component.source.sourceDigest, definitionDigest: component.definitionDigest,
        interfaceId: component.runtime.interfaceId, interfaceRevision: component.runtime.interfaceRevision,
        inputs: component.inputs.map((port) => publicPort(port)), outputs: component.outputs.map((port) => publicPort(port)),
        providedCapabilities: structuredClone(component.runtime.providedCapabilities), requiredCapabilities: structuredClone(component.runtime.requiredCapabilities),
        ownerId: component.runtime.ownerId, riskClass: component.runtime.riskClass, readiness: component.runtime.readiness,
        configSchema: structuredClone(component.configSchema), configSchemaDigest: component.configSchemaDigest,
        sideEffect: component.runtime.sideEffect, replay: component.runtime.replay, adapter,
      });
    }
    return deepFreezeApplicationValue({ ok: true, schemaVersion: CATALOG_RESULT_SCHEMA_ID, catalogRevision: activeCatalog.catalogRevision, catalogDigest: activeCatalogDigest, adapterPolicyDigest: adapterRegistry.policyDigest, components, integrations });
  };

  const plan = (args = {}) => {
    if (!exactArgumentKeys(args, ["manifest", "mode"]) || !["dry-run", "live"].includes(args.mode)) return fail("invalid_plan_input", "Plan accepts exactly manifest and execution mode.");
    const compiled = compileApplicationManifest(args.manifest, { catalog: activeCatalog, catalogDigest: activeCatalogDigest });
    if (!compiled.ok) return fail("application_manifest_invalid", "Application planning failed closed.", { diagnostics: publicDiagnostics(compiled.diagnostics), diagnosticsTruncated: compiled.diagnostics.length > 256 });
    if (compiled.manifest.runtimeProof.adapterPolicyDigest !== adapterRegistry.policyDigest) return fail("adapter_policy_drift", "runtimeProof.adapterPolicyDigest does not match the exact active adapter policy.");
    const nodes = [];
    for (const node of compiled.manifest.nodes) {
      const component = compiled.resolvedComponents[node.id];
      let resolution; try { resolution = adapterRegistry.resolve(component, args.mode); } catch { resolution = null; }
      if (!resolution?.ok) { const error = publicOwnerFailure(resolution?.error, "component_adapter_unavailable"); return fail(error.code, error.message, { nodeId: node.id }); }
      const adapter = projectPublicAdapter(resolution.adapter);
      if (!adapter) return fail("adapter_evidence_invalid", "Host adapter evidence does not satisfy the exact public contract.", { nodeId: node.id });
      let owner; try { owner = adapterRegistry.resolveNodeOwnerEvidence(node, component, resolution.adapter); } catch { owner = null; }
      if (!owner?.ok) { const error = publicOwnerFailure(owner?.error); return fail(error.code, error.message, { nodeId: node.id }); }
      const ownerEvidence = projectOwnerEvidence(owner.evidence);
      if (!ownerEvidence || ownerEvidence.ownerId !== component.runtime.ownerId) return fail("owner_evidence_invalid", "Runtime owner evidence does not satisfy the exact public contract.", { nodeId: node.id });
      nodes.push({
        id: node.id,
        component: { id: component.id, revision: component.revision, sourceDigest: component.source.sourceDigest, definitionDigest: component.definitionDigest, configSchemaDigest: component.configSchemaDigest },
        interfaceId: component.runtime.interfaceId, interfaceRevision: component.runtime.interfaceRevision,
        inputs: component.inputs.map((port) => publicPort(port)), outputs: component.outputs.map((port) => publicPort(port, compiled.effectiveOutputKinds[node.id][port.name])),
        providedCapabilities: structuredClone(component.runtime.providedCapabilities), requiredCapabilities: structuredClone(component.runtime.requiredCapabilities),
        ownerId: component.runtime.ownerId, riskClass: component.runtime.riskClass, readiness: component.runtime.readiness, sideEffect: component.runtime.sideEffect, replay: component.runtime.replay,
        ownerEvidence, adapter,
      });
    }
    const base = {
      schemaVersion: APPLICATION_PLAN_SCHEMA_ID, mode: args.mode, invocation: structuredClone(compiled.manifest.invocation), application: structuredClone(compiled.manifest.application), source: structuredClone(compiled.manifest.source),
      manifestDigest: compiled.manifestDigest, catalogDigest: compiled.catalogDigest, adapterPolicyDigest: adapterRegistry.policyDigest,
      nodes, edges: structuredClone(compiled.manifest.edges), entrypoints: structuredClone(compiled.manifest.entrypoints), outputs: structuredClone(compiled.manifest.outputs),
      executionOrder: [...compiled.executionOrder], bounds: structuredClone(compiled.manifest.bounds),
    };
    return deepFreezeApplicationValue({ ok: true, plan: { ...base, planDigest: digestApplicationValue(base) } });
  };

  const execute = async (args = {}, context = {}) => {
    const requestedMaxOutputBytes = Number.isInteger(args?.manifest?.bounds?.maxOutputBytes) && args.manifest.bounds.maxOutputBytes >= 1024 && args.manifest.bounds.maxOutputBytes <= 1_048_576 ? args.manifest.bounds.maxOutputBytes : null;
    const boundEarly = (result) => requestedMaxOutputBytes ? deepFreezeApplicationValue(boundTerminalResult({ ...structuredClone(result), cached: false }, requestedMaxOutputBytes)) : result;
    if (!exactArgumentKeys(args, ["manifest", "expectedPlanDigest", "idempotencyKey", "mode"])) return boundEarly(fail("invalid_execute_input", "Execute accepts exactly manifest, expectedPlanDigest, idempotencyKey, and mode."));
    if (!SHA256.test(args.expectedPlanDigest) || !IDEMPOTENCY_KEY.test(args.idempotencyKey) || !["dry-run", "live"].includes(args.mode)) return boundEarly(fail("invalid_execute_input", "Execute digest, idempotency key, or mode is invalid."));
    if (context?.signal?.aborted === true) return boundEarly(fail("application_cancelled", "Application execution was cancelled before planning; no runtime owner was invoked.", { evidence: { cancellationRequested: true, sideEffectDispatched: false, reconciliationRequired: false } }));
    const planned = plan({ manifest: args.manifest, mode: args.mode });
    if (!planned.ok) return boundEarly(planned);
    if (planned.plan.planDigest !== args.expectedPlanDigest) return boundEarly(fail("application_plan_drift", "Expected plan digest does not match the exact current plan.", { actualPlanDigest: planned.plan.planDigest }));
    const executionDigest = digestApplicationValue({ planDigest: planned.plan.planDigest, idempotencyKey: args.idempotencyKey, mode: args.mode });
    const now = Date.now();
    for (const [key, entry] of executionLedger) if (entry.state === "completed" && entry.protected !== true && Number.isFinite(entry.completedAt) && entry.completedAt + ledgerTtlMs <= now) executionLedger.delete(key);
    const prior = executionLedger.get(args.idempotencyKey);
    if (prior) {
      if (prior.executionDigest !== executionDigest) return boundEarly(fail("application_idempotency_conflict", "Idempotency key is already bound to another exact application execution."));
      if (prior.state === "completed") return deepFreezeApplicationValue({ ...structuredClone(prior.result), cached: true });
      return boundEarly(fail("application_execution_in_progress", "This exact application execution is already in progress.", { executionDigest }));
    }
    if (executionLedger.size >= maxLedgerEntries) return boundEarly(fail("application_ledger_full", "The bounded execution ledger is full; reconcile or provision a host-owned ledger before another run."));
    executionLedger.set(args.idempotencyKey, deepFreezeApplicationValue({ executionDigest, state: "running", protected: false }));
    const compiled = compileApplicationManifest(args.manifest, { catalog: activeCatalog, catalogDigest: activeCatalogDigest });
    const values = new Map();
    const steps = [];
    const startedAt = Date.now();
    const deadlineAt = startedAt + compiled.manifest.bounds.maxRuntimeMs;
    const abortController = new AbortController();
    const callerSignal = context?.signal;
    let detachCallerAbort = () => {};
    if (callerSignal && typeof callerSignal.aborted === "boolean" && typeof callerSignal.addEventListener === "function" && typeof callerSignal.removeEventListener === "function") {
      const cancelFromCaller = () => abortController.abort(cancellationError());
      if (callerSignal.aborted) cancelFromCaller();
      else { callerSignal.addEventListener("abort", cancelFromCaller, { once: true }); detachCallerAbort = () => callerSignal.removeEventListener("abort", cancelFromCaller); }
    }
    let outputBytes = 0;
    let sideEffectInFlight = false;
    let sideEffectDispatched = false;
    let sideEffectActionDigest = "";
    const finish = (result, { protect = false } = {}) => {
      let terminal = structuredClone(result);
      if (terminal.ok === false) terminal = { schemaVersion: APPLICATION_RESULT_SCHEMA_ID, status: "blocked", planDigest: planned.plan.planDigest, executionDigest, idempotencyKey: args.idempotencyKey, mode: args.mode, ...terminal };
      terminal.cached = terminal.cached === true;
      if (terminal.evidence) terminal.evidence = projectEvidence(terminal.evidence);
      if (terminal.ok === false && sideEffectDispatched) terminal.evidence = { ...projectEvidence(terminal.evidence), externalCallAttempted: true, sideEffectDispatched: true, reconciliationRequired: true, ...(sideEffectActionDigest ? { actionDigest: sideEffectActionDigest } : {}) };
      terminal = boundTerminalResult(terminal, compiled.manifest.bounds.maxOutputBytes);
      const frozen = deepFreezeApplicationValue(terminal);
      executionLedger.set(args.idempotencyKey, deepFreezeApplicationValue({ executionDigest, state: "completed", completedAt: Date.now(), protected: protect || sideEffectDispatched, result: frozen }));
      return frozen;
    };
    try {
      for (const [stepIndex, nodeId] of compiled.executionOrder.entries()) {
        if (stepIndex >= compiled.manifest.bounds.maxSteps) return finish(fail("application_step_bound_exceeded", "Application step bound was reached.", { executionDigest, steps }));
        const node = compiled.manifest.nodes.find((entry) => entry.id === nodeId);
        const component = compiled.resolvedComponents[nodeId];
        let resolution; try { resolution = adapterRegistry.resolve(component, args.mode); } catch { resolution = null; }
        if (!resolution?.ok) { const error = publicOwnerFailure(resolution?.error, "component_adapter_unavailable"); return finish(fail(error.code, error.message, { executionDigest, nodeId, steps })); }
        const adapter = projectPublicAdapter(resolution.adapter);
        if (!adapter) return finish(fail("adapter_evidence_invalid", "Host adapter evidence does not satisfy the exact public contract.", { executionDigest, nodeId, steps }));
        const lockedNode = planned.plan.nodes.find((entry) => entry.id === nodeId);
        if (stableApplicationJson(adapter) !== stableApplicationJson(lockedNode.adapter)) return finish(fail("planned_adapter_drift", "The exact mode-bound planned adapter changed before admission.", { executionDigest, nodeId, steps }));
        let currentOwner;
        try { currentOwner = adapterRegistry.resolveNodeOwnerEvidence(node, component, resolution.adapter); } catch { currentOwner = null; }
        const currentOwnerEvidence = currentOwner?.ok ? projectOwnerEvidence(currentOwner.evidence) : null;
        if (!currentOwnerEvidence || stableApplicationJson(currentOwnerEvidence) !== stableApplicationJson(lockedNode.ownerEvidence)) return finish(fail("planned_owner_drift", "The exact planned runtime owner evidence changed before admission.", { executionDigest, nodeId, steps }));
        const inputs = {};
        for (const port of component.inputs) {
          const edge = compiled.manifest.edges.find((entry) => entry.to.node === nodeId && entry.to.port === port.name);
          if (!edge) continue;
          const value = values.get(endpointKey(edge.from));
          const invalid = validateValue(value, port.kinds);
          if (invalid) return finish(fail("application_input_invalid", invalid, { executionDigest, nodeId, port: port.name, steps }));
          inputs[port.name] = structuredClone(value);
        }
        const jsonContext = deepFreezeApplicationValue({ node: structuredClone(node), inputs, mode: args.mode, planDigest: planned.plan.planDigest, idempotencyKey: args.idempotencyKey, deadlineAt });
        const markSideEffectDispatched = (actionDigest) => { abortController.signal.throwIfAborted(); sideEffectDispatched = true; sideEffectInFlight = true; if (typeof actionDigest === "string" && SHA256.test(actionDigest)) sideEffectActionDigest = actionDigest; };
        const adapterResult = await withDeadline(() => resolution.adapter.execute(Object.freeze({ ...jsonContext, signal: abortController.signal, ...(args.mode === "live" && component.runtime.sideEffect !== "none" ? { markSideEffectDispatched } : {}) })), deadlineAt, abortController);
        sideEffectInFlight = false;
        const adapterEvidence = projectEvidence(adapterResult?.evidence);
        try { outputBytes += jsonBytes(adapterResult); } catch { return finish(fail("adapter_result_not_json", "Runtime owner returned a non-JSON result.", { executionDigest, nodeId, steps })); }
        if (outputBytes > compiled.manifest.bounds.maxOutputBytes) return finish(fail("application_output_bound_exceeded", "Application output byte bound was reached.", { executionDigest, nodeId, steps }));
        if (!adapterResult || typeof adapterResult !== "object" || adapterResult.ok !== true || adapterResult.status !== "completed") {
          const requestedCode = typeof adapterResult?.error?.code === "string" ? adapterResult.error.code : "";
          const code = Object.hasOwn(PUBLIC_ADAPTER_FAILURES, requestedCode) ? requestedCode : "component_execution_blocked";
          const status = code === "approval_required" ? "approval_required" : "blocked";
          return finish(fail(code, PUBLIC_ADAPTER_FAILURES[code], { schemaVersion: APPLICATION_RESULT_SCHEMA_ID, status, planDigest: planned.plan.planDigest, executionDigest, idempotencyKey: args.idempotencyKey, mode: args.mode, failedNodeId: nodeId, steps, evidence: adapterEvidence }));
        }
        const outputNames = Object.keys(adapterResult.outputs || {}).sort(compareCodeUnits);
        const expectedNames = component.outputs.map((port) => port.name).sort(compareCodeUnits);
        if (stableApplicationJson(outputNames) !== stableApplicationJson(expectedNames)) return finish(fail("component_outputs_invalid", "Runtime owner output ports differ from the exact component contract.", { executionDigest, nodeId, steps }));
        for (const port of component.outputs) {
          const value = adapterResult.outputs[port.name];
          const invalid = validateValue(value, compiled.effectiveOutputKinds[nodeId][port.name]);
          if (invalid) return finish(fail("component_output_invalid", invalid, { executionDigest, nodeId, port: port.name, steps }));
          values.set(`${nodeId}.${port.name}`, deepFreezeApplicationValue(structuredClone(value)));
        }
        steps.push(deepFreezeApplicationValue({ nodeId, status: "completed", ownerId: component.runtime.ownerId, adapterId: adapter.id, outputDigests: Object.fromEntries(component.outputs.map((port) => [port.name, digestApplicationValue(values.get(`${nodeId}.${port.name}`))])), evidence: adapterEvidence }));
      }
      if (abortController.signal.aborted) throw abortError(abortController.signal);
      const outputs = Object.fromEntries(compiled.manifest.outputs.map((output) => [output.name, structuredClone(values.get(`${output.node}.${output.port}`))]));
      const result = { ok: true, schemaVersion: APPLICATION_RESULT_SCHEMA_ID, status: "completed", planDigest: planned.plan.planDigest, executionDigest, idempotencyKey: args.idempotencyKey, mode: args.mode, steps, outputs, boundsEvidence: { steps: steps.length, runtimeMs: Date.now() - startedAt, outputBytes }, cached: false };
      if (jsonBytes(result) > compiled.manifest.bounds.maxOutputBytes) return finish(fail("application_output_bound_exceeded", "Final application result exceeds its output byte bound.", { executionDigest, steps }));
      return finish(deepFreezeApplicationValue(result));
    } catch (error) {
      const code = ["application_deadline_exceeded", "application_cancelled"].includes(error?.code) ? error.code : "component_execution_failed";
      const message = code === "application_deadline_exceeded" ? sideEffectDispatched ? "Application deadline was reached after side-effect dispatch; reconciliation is required before another attempt." : "Application deadline was reached before side-effect dispatch; no automatic retry was attempted." : code === "application_cancelled" ? sideEffectDispatched ? "Application execution was cancelled after side-effect dispatch; reconciliation is required before another attempt." : "Application execution was cancelled before side-effect dispatch; no automatic retry was attempted." : "Runtime owner failed without exposing private details; no automatic retry was attempted.";
      const cancellationEvidence = ["application_deadline_exceeded", "application_cancelled"].includes(code) ? { cancellationRequested: true, sideEffectDispatched, reconciliationRequired: sideEffectDispatched } : {};
      return finish(fail(code, message, { schemaVersion: APPLICATION_RESULT_SCHEMA_ID, status: "blocked", planDigest: planned.plan.planDigest, executionDigest, idempotencyKey: args.idempotencyKey, mode: args.mode, steps, ...(Object.keys(cancellationEvidence).length ? { evidence: cancellationEvidence } : {}) }), { protect: sideEffectInFlight || sideEffectDispatched });
    } finally { detachCallerAbort(); }
  };

  const run = (toolName, args = {}, context = {}) => {
    if (toolName === AGENT_APPLICATION_TOOL_NAMES.catalog) return catalog(args);
    if (toolName === AGENT_APPLICATION_TOOL_NAMES.plan) return plan(args);
    if (toolName === AGENT_APPLICATION_TOOL_NAMES.execute) return execute(args, context);
    throw new TypeError("Unknown application composition tool.");
  };
  return Object.freeze({ catalog, plan, execute, run });
}

export const isAgentApplicationToolName = (toolName) => Object.values(AGENT_APPLICATION_TOOL_NAMES).includes(toolName);
