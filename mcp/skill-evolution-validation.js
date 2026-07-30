import Ajv2020 from "ajv/dist/2020.js";

import {
  SKILL_EVOLUTION_SPEC_SCHEMA,
  SKILL_EVOLUTION_TOOL_INPUT_SCHEMA,
} from "./skill-evolution-tool-contract.js";

const MAX_SPEC_BYTES = 128 * 1024;

export const SKILL_EVOLUTION_LIMITS = Object.freeze({
  maxSpecBytes: MAX_SPEC_BYTES,
  maxScenariosPerSet: 1000,
  maxEpochs: 100,
  maxBatchSize: 1000,
  maxMiniBatchSize: 1000,
  maxRequiredGates: 32,
});

const ajv = new Ajv2020({
  allErrors: true,
  ownProperties: true,
  strict: false,
  strictNumbers: true,
});
const validateSpecSchema = ajv.compile(SKILL_EVOLUTION_SPEC_SCHEMA);
const validateRequestSchema = ajv.compile(SKILL_EVOLUTION_TOOL_INPUT_SCHEMA);

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

const cloneAndFreeze = (value) => deepFreeze(structuredClone(value));

function serializedSizeError(value, label) {
  try {
    const bytes = Buffer.byteLength(JSON.stringify(value));
    return bytes <= MAX_SPEC_BYTES
      ? null
      : `${label} must serialize to at most ${MAX_SPEC_BYTES} UTF-8 bytes.`;
  } catch {
    return `${label} must be JSON serializable.`;
  }
}

function formatAjvErrors(errors = []) {
  return errors.map((error) => {
    const location = error.instancePath || "request";
    if (error.keyword === "additionalProperties") {
      return `${location} contains unsupported field ${error.params.additionalProperty}.`;
    }
    return `${location} ${error.message}.`;
  });
}

function normalizedIdentity(value) {
  return String(value).normalize("NFKC").trim().toLowerCase();
}

function duplicateRefErrors(refs, field) {
  const errors = [];
  const ids = new Set();
  const digests = new Set();
  const artifactRefs = new Set();
  for (const ref of refs) {
    const id = normalizedIdentity(ref.id);
    const artifactRef = normalizedIdentity(ref.ref);
    if (ids.has(id)) errors.push(`${field} contains duplicate id ${ref.id}.`);
    if (digests.has(ref.digest)) errors.push(`${field} contains duplicate digest ${ref.digest}.`);
    if (artifactRefs.has(artifactRef)) errors.push(`${field} contains duplicate ref ${ref.ref}.`);
    ids.add(id);
    digests.add(ref.digest);
    artifactRefs.add(artifactRef);
  }
  return errors;
}

function crossFieldSpecErrors(request) {
  const errors = [];
  const finiteFields = [
    [request.evaluator.metric.threshold, "request.evaluator.metric.threshold"],
    [request.schedule.learningRate.initial, "request.schedule.learningRate.initial"],
    [request.schedule.learningRate.decay, "request.schedule.learningRate.decay"],
    [request.schedule.learningRate.floor, "request.schedule.learningRate.floor"],
    [request.validation.minDelta, "request.validation.minDelta"],
    [request.bounds.maxCostUsd, "request.bounds.maxCostUsd"],
  ];
  for (const [value, field] of finiteFields) {
    if (!Number.isFinite(value)) errors.push(`${field} must be finite.`);
  }
  if (request.schedule.miniBatchSize > request.schedule.batchSize) {
    errors.push("request.schedule.miniBatchSize must not exceed request.schedule.batchSize.");
  }
  if (request.schedule.learningRate.floor > request.schedule.learningRate.initial) {
    errors.push("request.schedule.learningRate.floor must not exceed initial.");
  }
  errors.push(...duplicateRefErrors(request.dataset.training, "request.dataset.training"));
  errors.push(...duplicateRefErrors(request.dataset.validation, "request.dataset.validation"));

  const trainingIds = new Set(request.dataset.training.map((ref) => normalizedIdentity(ref.id)));
  const trainingDigests = new Set(request.dataset.training.map((ref) => ref.digest));
  const trainingRefs = new Set(request.dataset.training.map((ref) => normalizedIdentity(ref.ref)));
  for (const ref of request.dataset.validation) {
    if (
      trainingIds.has(normalizedIdentity(ref.id))
      || trainingDigests.has(ref.digest)
      || trainingRefs.has(normalizedIdentity(ref.ref))
    ) {
      errors.push(`Training and validation scenarios must be disjoint; validation ref ${ref.id} overlaps.`);
    }
  }
  return errors;
}

export class SkillEvolutionValidationError extends TypeError {
  constructor(errors) {
    const messages = Array.isArray(errors) && errors.length > 0
      ? errors.map(String)
      : ["Skill-evolution request is invalid."];
    super(messages.join(" "));
    this.name = "SkillEvolutionValidationError";
    this.code = "invalid_skill_evolution_request";
    this.errors = Object.freeze(messages);
  }
}

export function validateSkillEvolutionSpec(raw) {
  const sizeError = serializedSizeError(raw, "request");
  if (sizeError) return { ok: false, errors: [sizeError] };
  if (!validateSpecSchema(raw)) {
    return { ok: false, errors: formatAjvErrors(validateSpecSchema.errors) };
  }
  const request = cloneAndFreeze(raw);
  const errors = crossFieldSpecErrors(request);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, spec: request };
}

export function assertSkillEvolutionSpec(raw) {
  const result = validateSkillEvolutionSpec(raw);
  if (!result.ok) throw new SkillEvolutionValidationError(result.errors);
  return result.spec;
}

export function validateSkillEvolutionRequest(args) {
  const sizeError = serializedSizeError(args, "request");
  if (sizeError) return { ok: false, errors: [sizeError] };
  if (!validateRequestSchema(args)) {
    return { ok: false, errors: formatAjvErrors(validateRequestSchema.errors) };
  }
  if (args.operation === "plan" || args.operation === "start") {
    const request = cloneAndFreeze(args);
    const errors = crossFieldSpecErrors(request);
    return errors.length > 0 ? { ok: false, errors } : { ok: true, request };
  }
  return { ok: true, request: cloneAndFreeze(args) };
}

export function assertSkillEvolutionRequest(args) {
  const result = validateSkillEvolutionRequest(args);
  if (!result.ok) throw new SkillEvolutionValidationError(result.errors);
  return result.request;
}
