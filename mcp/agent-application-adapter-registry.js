import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { compileAgentRun, resolveAgentDefinition } from "../contracts/agent-runtime.schema.js";
import {
  APPLICATION_ADAPTER_INTERFACE_ID,
  APPLICATION_ADAPTER_INTERFACE_REVISION,
  deepFreezeApplicationValue,
  digestApplicationValue,
  stableApplicationJson,
} from "../contracts/agent-application.schema.js";
import { computeExternalToolActionDigest } from "./external-tool-approval.js";

export const APPLICATION_ADAPTER_POLICY_SCHEMA_ID = "agenticgraph.application-adapter-policy/v1";
const ADAPTER_REVISION = "1.0.0";
const ADAPTER_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const EXACT_REVISION = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const SHA256 = /^[0-9a-f]{64}$/;
const compareCodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const exactDataRecord = (value, keys) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return false;
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && ownKeys.every((key) => typeof key === "string" && keys.includes(key) && Object.getOwnPropertyDescriptor(value, key)?.enumerable && "value" in Object.getOwnPropertyDescriptor(value, key));
};
const exactDataArray = (value, max, { min = 1 } = {}) => {
  if (!Array.isArray(value) || value.length < min || value.length > max) return false;
  const expected = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === expected.size && ownKeys.every((key) => typeof key === "string" && expected.has(key)) && Array.from({ length: value.length }, (_, index) => Object.getOwnPropertyDescriptor(value, String(index))).every((descriptor) => descriptor?.enumerable && "value" in descriptor);
};
const exactString = (value, max, pattern) => typeof value === "string" && value.length > 0 && value.length <= max && pattern.test(value);
const sourceDigest = (relativePaths) => digestApplicationValue(relativePaths.map((relativePath) => ({ relativePath, source: readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8") })));
const MODULE_SOURCE_DIGEST = sourceDigest(["../contracts/agent-application.schema.js", "./agent-application-adapter-registry.js", "./agent-application-runtime.js"]);
const APPLICATION_OWNER_EVIDENCE = deepFreezeApplicationValue({ ownerId: "agenticgraph.application-runtime", implementationRevision: ADAPTER_REVISION, implementationDigest: MODULE_SOURCE_DIGEST });
const AGENT_OWNER_EVIDENCE = deepFreezeApplicationValue({ ownerId: "agenticgraph.agent-runtime", implementationRevision: ADAPTER_REVISION, implementationDigest: sourceDigest(["../contracts/agent-runtime.schema.js", "../data/config/agents/agent-definitions.json"]) });

const normalizeRefs = (entries, label, { revisions = false, max = 32 } = {}) => {
  if (!exactDataArray(entries, max)) throw new TypeError(`${label} must be an exact non-empty data array with at most ${max} entries.`);
  const normalized = entries.map((entry) => {
    if (!exactDataRecord(entry, ["id", "revision"]) || !exactString(entry.id, 120, ADAPTER_ID) || !exactString(entry.revision, revisions ? 40 : 120, revisions ? EXACT_REVISION : ADAPTER_ID)) throw new TypeError(`${label} contains an invalid exact reference.`);
    return { id: entry.id, revision: entry.revision };
  }).sort((left, right) => compareCodeUnits(left.id, right.id) || compareCodeUnits(left.revision, right.revision));
  if (new Set(normalized.map((entry) => `${entry.id}@${entry.revision}`)).size !== normalized.length) throw new TypeError(`${label} contains duplicate references.`);
  return normalized;
};
const normalizeAdapter = (adapter) => {
  const keys = ["id", "revision", "adapterKind", "interfaceId", "interfaceRevision", "implementationRevision", "implementationDigest", "ownerId", "ownerImplementationRevision", "ownerImplementationDigest", "supportedComponents", "supportedModes", "capabilities", "sideEffect", "replay", "execute"];
  if (!exactDataRecord(adapter, keys)) throw new TypeError("Application adapters must use the exact own-data descriptor contract.");
  if (!exactString(adapter.id, 120, ADAPTER_ID) || !exactString(adapter.revision, 40, EXACT_REVISION) || !exactString(adapter.adapterKind, 120, ADAPTER_ID) || !exactString(adapter.ownerId, 120, ADAPTER_ID)) throw new TypeError("Application adapter identity is invalid.");
  if (adapter.interfaceId !== APPLICATION_ADAPTER_INTERFACE_ID || adapter.interfaceRevision !== APPLICATION_ADAPTER_INTERFACE_REVISION) throw new TypeError(`Adapter ${adapter.id} uses an unsupported interface.`);
  for (const field of ["implementationRevision", "ownerImplementationRevision"]) if (!exactString(adapter[field], 40, EXACT_REVISION)) throw new TypeError(`Adapter ${adapter.id}.${field} must be exact.`);
  for (const field of ["implementationDigest", "ownerImplementationDigest"]) if (!exactString(adapter[field], 64, SHA256)) throw new TypeError(`Adapter ${adapter.id}.${field} must be SHA-256.`);
  if (!exactDataArray(adapter.supportedModes, 2)) throw new TypeError(`Adapter ${adapter.id} has invalid supported modes.`);
  const supportedModes = [...adapter.supportedModes].sort(compareCodeUnits);
  if (new Set(supportedModes).size !== supportedModes.length || supportedModes.some((mode) => !["dry-run", "live"].includes(mode))) throw new TypeError(`Adapter ${adapter.id} has invalid supported modes.`);
  if (!["none", "external-write"].includes(adapter.sideEffect) || !["safe", "idempotency-key"].includes(adapter.replay) || typeof adapter.execute !== "function") throw new TypeError(`Adapter ${adapter.id} has invalid execution metadata.`);
  const publicDescriptor = { ...adapter, capabilities: normalizeRefs(adapter.capabilities, `Adapter ${adapter.id} capabilities`), supportedComponents: normalizeRefs(adapter.supportedComponents, `Adapter ${adapter.id} supportedComponents`, { revisions: true }), supportedModes };
  delete publicDescriptor.execute;
  return deepFreezeApplicationValue({ ...publicDescriptor, execute: adapter.execute });
};
const refKey = (entry) => `${entry.id}@${entry.revision}`;
const supportsComponent = (adapter, component, mode) => {
  const available = new Set(adapter.capabilities.map(refKey));
  return adapter.supportedComponents.some((entry) => entry.id === component.id && entry.revision === component.revision)
    && (!mode || adapter.supportedModes.includes(mode)) && adapter.adapterKind === component.runtime.adapterKind
    && adapter.interfaceId === component.runtime.interfaceId && adapter.interfaceRevision === component.runtime.interfaceRevision
    && adapter.ownerId === component.runtime.ownerId && adapter.sideEffect === component.runtime.sideEffect && adapter.replay === component.runtime.replay
    && component.runtime.requiredCapabilities.every((capability) => available.has(refKey(capability)));
};

export function createApplicationAdapterRegistry(adapters, { preference = [] } = {}) {
  if (!exactDataArray(adapters, 1000)) throw new TypeError("Application adapter registry requires an exact bounded adapter array.");
  const normalized = adapters.map(normalizeAdapter).sort((left, right) => compareCodeUnits(left.id, right.id));
  if (new Set(normalized.map((adapter) => adapter.id)).size !== normalized.length) throw new TypeError("Application adapter ids must be globally unique; register a new id for another revision.");
  if (!exactDataArray(preference, 1000, { min: 0 }) || preference.some((id) => !exactString(id, 120, ADAPTER_ID)) || new Set(preference).size !== preference.length || preference.some((id) => !normalized.some((adapter) => adapter.id === id))) throw new TypeError("Adapter preference must name unique registered adapter ids.");
  const policy = deepFreezeApplicationValue({ schemaVersion: APPLICATION_ADAPTER_POLICY_SCHEMA_ID, preference: [...preference], adapters: normalized.map(({ execute: ignored, ...descriptor }) => descriptor) });
  const resolve = (component, mode) => {
    const candidates = normalized.filter((adapter) => supportsComponent(adapter, component, mode));
    if (!candidates.length) return { ok: false, error: { code: "component_adapter_unavailable", message: `No exact host adapter owns ${component.id}@${component.revision}${mode ? ` in ${mode} mode` : ""}.` } };
    if (candidates.length === 1) return { ok: true, adapter: candidates[0] };
    const preferred = preference.map((id) => candidates.find((adapter) => adapter.id === id)).filter(Boolean);
    if (preferred.length !== 1) return { ok: false, error: { code: "component_adapter_ambiguous", message: `Host policy does not select exactly one adapter for ${component.id}@${component.revision}.` } };
    return { ok: true, adapter: preferred[0] };
  };
  return Object.freeze({ adapters: Object.freeze(normalized), policy, policyDigest: digestApplicationValue(policy), resolve });
}

const createDescriptor = (id, ownerEvidence, capabilities, execute, { sideEffect = "none", replay = "safe" } = {}) => ({
  id: `agenticgraph.${id}`, revision: ADAPTER_REVISION, adapterKind: id, interfaceId: APPLICATION_ADAPTER_INTERFACE_ID, interfaceRevision: APPLICATION_ADAPTER_INTERFACE_REVISION,
  implementationRevision: ADAPTER_REVISION, implementationDigest: digestApplicationValue({ moduleSourceDigest: MODULE_SOURCE_DIGEST, ownerEvidence, adapterKind: id, implementationRevision: ADAPTER_REVISION }),
  ownerId: ownerEvidence.ownerId, ownerImplementationRevision: ownerEvidence.implementationRevision, ownerImplementationDigest: ownerEvidence.implementationDigest,
  supportedComponents: [{ id, revision: "1.0.0" }], supportedModes: ["dry-run", "live"], capabilities, sideEffect, replay, execute,
});
const success = (outputs, evidence = {}) => ({ ok: true, status: "completed", outputs, evidence });
const failure = (code, message, status = "blocked", evidence = {}) => ({ ok: false, status, error: { code, message }, evidence });
const stringifyPromptValue = (input) => input.kind === "text" && typeof input.value === "string" ? input.value : stableApplicationJson(input.value);

export function createDefaultApplicationAdapterRegistry(options = {}) {
  const externalGateway = options.externalGateway;
  const gatewayEvidence = externalGateway?.ownerEvidence;
  if (!externalGateway || typeof externalGateway.call !== "function" || typeof externalGateway.listApplicationIntegrations !== "function" || typeof externalGateway.resolveApplicationIntegration !== "function" || typeof externalGateway.validateApplicationArtifact !== "function") throw new TypeError("Application adapters require the existing host-owned external gateway instance.");
  if (!gatewayEvidence || gatewayEvidence.ownerId !== "agenticgraph.external-tool-gateway" || !EXACT_REVISION.test(gatewayEvidence.implementationRevision) || !SHA256.test(gatewayEvidence.implementationDigest)) throw new TypeError("External gateway must expose exact owner implementation evidence.");
  const integrations = deepFreezeApplicationValue(structuredClone(externalGateway.listApplicationIntegrations()));
  const resolveIntegration = (config) => externalGateway.resolveApplicationIntegration(config);
  const adapters = [
    createDescriptor("core.input", APPLICATION_OWNER_EVIDENCE, [{ id: "application.core.input", revision: "v1" }], async ({ node }) => success({ value: structuredClone(node.config.value) })),
    createDescriptor("prompt.template", APPLICATION_OWNER_EVIDENCE, [{ id: "application.prompt.template", revision: "v1" }], async ({ node, inputs }) => success({ prompt: { kind: "text", value: node.config.template.split("{{input}}").join(stringifyPromptValue(inputs.input)) } }, { renderer: "literal-token/v1" })),
    createDescriptor("agent.registered", AGENT_OWNER_EVIDENCE, [{ id: "application.agent.plan", revision: "v1" }], async ({ node, inputs, planDigest }) => {
      const runId = `application-${digestApplicationValue({ planDigest, nodeId: node.id }).slice(0, 32)}`;
      const compiled = compileAgentRun({ agentDefinitionId: node.config.agentDefinitionId, brief: inputs.prompt.value, mode: "dry-run", runId }, { createRunId: () => runId });
      if (!compiled.ok || compiled.payload?.status !== "planned" || compiled.payload?.budgetMeters?.paidProviderCalls !== 0) return failure("agent_plan_blocked", "The registered agent owner could not produce a zero-call plan.");
      return success({ plan: { kind: "agent-plan", value: compiled.payload } }, { ownerContract: compiled.payload.contractVersion, paidProviderCalls: 0 });
    }),
    createDescriptor("integration.external-artifact", gatewayEvidence, [{ id: "application.external-artifact", revision: "v1" }], async ({ node, inputs, mode, planDigest, idempotencyKey, signal, markSideEffectDispatched }) => {
      const resolved = resolveIntegration(node.config);
      if (!resolved.ok) return failure(resolved.error?.code || "integration_capability_drift", resolved.error?.message || "The exact integration binding is unavailable.");
      const artifactValidation = externalGateway.validateApplicationArtifact(inputs.artifact.value);
      if (!artifactValidation.ok) return failure(artifactValidation.error?.code || "invalid_artifact", artifactValidation.error?.message || "The canonical artifact is invalid.");
      const nodeIdempotencyKey = `kgapp_${digestApplicationValue({ idempotencyKey, planDigest, nodeId: node.id })}`;
      if (mode !== "live") return success({ receipt: { kind: "external-receipt", value: { status: "planned", capabilityId: node.config.capabilityId, capabilityRevision: node.config.capabilityRevision, idempotencyKey: nodeIdempotencyKey } } }, { paidProviderCalls: 0, externalCalls: 0 });
      if (typeof options.resolveExternalApproval !== "function") return failure("approval_required", "Host authorization is required before external execution.", "approval_required");
      const callArgs = { capabilityId: node.config.capabilityId, capabilityRevision: node.config.capabilityRevision, artifact: inputs.artifact.value, idempotencyKey: nodeIdempotencyKey };
      const actionDigest = computeExternalToolActionDigest(callArgs);
      signal?.throwIfAborted?.();
      const approvalToken = await options.resolveExternalApproval({ actionDigest, planDigest, nodeId: node.id, integrationProfileId: node.config.integrationProfileId, capabilityId: node.config.capabilityId, capabilityRevision: node.config.capabilityRevision, signal });
      if (!approvalToken) return failure("approval_required", "Host authorization is required before external execution.", "approval_required", { actionDigest });
      signal?.throwIfAborted?.();
      let dispatched = false;
      const result = await externalGateway.call({ ...callArgs, approvalToken, signal }, { markSideEffectDispatched: (digest) => { markSideEffectDispatched(digest); dispatched = true; } });
      if (!result || typeof result !== "object" || typeof result.ok !== "boolean") return failure("external_mcp_call_failed", "External owner returned an invalid result envelope.");
      if (!result.ok) return failure(result.error?.code || "external_execution_failed", result.error?.message || "External owner blocked execution.", result.error?.code === "approval_required" ? "approval_required" : "blocked", { ...(dispatched ? { externalCallAttempted: true, sideEffectDispatched: true } : {}), ...(result.actionDigest ? { actionDigest: result.actionDigest } : {}) });
      if (typeof result.cached !== "boolean") return failure("external_mcp_call_failed", "External owner returned an invalid replay marker.", "blocked", { ...(dispatched ? { externalCallAttempted: true, sideEffectDispatched: true } : {}), ...(result.actionDigest ? { actionDigest: result.actionDigest } : {}) });
      if (!result.cached && !dispatched) return failure("external_dispatch_unconfirmed", "External owner returned success without confirming mutation dispatch.");
      return success({ receipt: { kind: "external-receipt", value: result.receipt } }, { actionDigest: result.actionDigest, cached: result.cached === true, ...(dispatched ? { externalCallAttempted: true, sideEffectDispatched: true } : {}) });
    }, { sideEffect: "external-write", replay: "idempotency-key" }),
    createDescriptor("core.output", APPLICATION_OWNER_EVIDENCE, [{ id: "application.core.output", revision: "v1" }], async ({ inputs }) => success({ result: structuredClone(inputs.value) })),
  ];
  const registry = createApplicationAdapterRegistry(adapters, { preference: adapters.map((adapter) => adapter.id) });
  const resolveNodeOwnerEvidence = (node, component, adapter) => {
    if (component.id === "agent.registered") {
      const definition = resolveAgentDefinition(node.config.agentDefinitionId);
      return definition ? { ok: true, evidence: deepFreezeApplicationValue({ contractId: "agenticgraph.agent-definition", ownerId: adapter.ownerId, revision: definition.version, digest: digestApplicationValue(definition) }) } : { ok: false, error: { code: "agent_definition_unavailable", message: "The exact registered agent definition is unavailable." } };
    }
    if (component.id === "integration.external-artifact") {
      const resolved = resolveIntegration(node.config);
      return resolved.ok ? { ok: true, evidence: deepFreezeApplicationValue({ contractId: "agenticgraph.integration-profile", ownerId: adapter.ownerId, revision: resolved.evidence.integrationProfileRevision, digest: digestApplicationValue(resolved.evidence), integration: resolved.evidence }) } : resolved;
    }
    return { ok: true, evidence: deepFreezeApplicationValue({ contractId: "agenticgraph.application-runtime", ownerId: adapter.ownerId, revision: adapter.ownerImplementationRevision, digest: adapter.ownerImplementationDigest }) };
  };
  return Object.freeze({ ...registry, integrations, resolveNodeOwnerEvidence });
}
