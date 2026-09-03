import { JSON_SCHEMA, load as loadYaml } from "js-yaml";

export const ECS_COMPONENT_SCHEMA_NODE_TYPE = "EcsComponentSchema";
export const ECS_ENTITY_NODE_TYPE = "EcsEntity";
export const ECS_DECISION_NODE_TYPE = "EcsDecision";

export const SUPPORTED_COMPONENT_FIELD_TYPES = Object.freeze([
  "f32",
  "f64",
  "i8",
  "i16",
  "i32",
  "u8",
  "u16",
  "u32",
]);

export const DECISION_TYPES = Object.freeze([
  "dialogue_outcome",
  "quest_flag",
  "world_tick_result",
]);

const SUPPORTED_FIELD_TYPE_SET = new Set(SUPPORTED_COMPONENT_FIELD_TYPES);
const DECISION_TYPE_SET = new Set(DECISION_TYPES);
const INTEGER_RANGES = Object.freeze({
  i8: [-128, 127],
  i16: [-32768, 32767],
  i32: [-2147483648, 2147483647],
  u8: [0, 255],
  u16: [0, 65535],
  u32: [0, 4294967295],
});
const ISO_8601_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/;

export class AgenticOsNodeContractError extends Error {
  constructor(code, message, ref = null) {
    super(message);
    this.name = "AgenticOsNodeContractError";
    this.code = code;
    this.ref = ref;
  }
}

export function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function defineCanonicalProperty(target, key, value) {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

export function canonicalizeJsonValue(value, path = "$", ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return Object.is(value, -0) ? 0 : value;
    throw new AgenticOsNodeContractError("ECS_AGENTIC_OS_UNREPRESENTABLE_VALUE", `${path} must be finite`, path);
  }
  if (typeof value !== "object") {
    throw new AgenticOsNodeContractError(
      "ECS_AGENTIC_OS_UNREPRESENTABLE_VALUE",
      `${path} is not JSON-safe`,
      path,
    );
  }
  if (ancestors.has(value)) {
    throw new AgenticOsNodeContractError("ECS_AGENTIC_OS_UNREPRESENTABLE_VALUE", `${path} is cyclic`, path);
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    const result = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        ancestors.delete(value);
        throw new AgenticOsNodeContractError(
          "ECS_AGENTIC_OS_UNREPRESENTABLE_VALUE",
          `${path}[${index}] is sparse`,
          `${path}[${index}]`,
        );
      }
      result.push(canonicalizeJsonValue(value[index], `${path}[${index}]`, ancestors));
    }
    ancestors.delete(value);
    return result;
  }
  if (!isPlainObject(value)) {
    ancestors.delete(value);
    throw new AgenticOsNodeContractError(
      "ECS_AGENTIC_OS_UNREPRESENTABLE_VALUE",
      `${path} must be a plain object`,
      path,
    );
  }

  const result = {};
  for (const key of Object.keys(value).sort()) {
    defineCanonicalProperty(
      result,
      key,
      canonicalizeJsonValue(value[key], `${path}.${key}`, ancestors),
    );
  }
  ancestors.delete(value);
  return result;
}

export function stableStringifyJson(value) {
  return JSON.stringify(canonicalizeJsonValue(value));
}

export function compareCanonicalStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function assertExactKeys(value, expectedKeys, ref) {
  if (!isPlainObject(value)) {
    throw new AgenticOsNodeContractError("ECS_AGENTIC_OS_INVALID_NODE", `${ref} must be an object`, ref);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new AgenticOsNodeContractError(
      "ECS_AGENTIC_OS_INVALID_NODE",
      `${ref} must contain exactly ${expected.join(", ")}`,
      ref,
    );
  }
}

function assertNonEmptyString(value, ref) {
  if (typeof value !== "string" || value.trim() === "" || value.trim() !== value) {
    throw new AgenticOsNodeContractError("ECS_AGENTIC_OS_INVALID_NODE", `${ref} must be a non-empty string`, ref);
  }
  return value;
}

function isExactIsoTimestamp(value) {
  const match = ISO_8601_TIMESTAMP.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
  const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);
  if (
    month < 1 || month > 12 ||
    hour > 23 || minute > 59 || second > 59 ||
    offsetHour > 23 || offsetMinute > 59
  ) {
    return false;
  }
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day >= 1 && day <= daysInMonth[month - 1];
}

export function normalizeComponentSchemaNode(node, nodeIndex) {
  const ref = `flow.nodes[${nodeIndex}].properties.ecsComponent`;
  const value = node?.properties?.ecsComponent;
  assertExactKeys(value, ["name", "fields"], ref);
  const name = assertNonEmptyString(value.name, `${ref}.name`);
  if (!isPlainObject(value.fields) || Object.keys(value.fields).length === 0) {
    throw new AgenticOsNodeContractError(
      "ECS_AGENTIC_OS_INVALID_NODE",
      `${ref}.fields must be a non-empty object`,
      `${ref}.fields`,
    );
  }
  const fields = Object.create(null);
  for (const fieldName of Object.keys(value.fields).sort()) {
    assertNonEmptyString(fieldName, `${ref}.fields key`);
    const fieldType = value.fields[fieldName];
    if (!SUPPORTED_FIELD_TYPE_SET.has(fieldType)) {
      throw new AgenticOsNodeContractError(
        "ECS_AGENTIC_OS_UNSUPPORTED_FIELD_TYPE",
        `${ref}.fields.${fieldName} has unsupported type ${String(fieldType)}`,
        `${ref}.fields.${fieldName}`,
      );
    }
    fields[fieldName] = fieldType;
  }
  return { name, fields };
}

export function normalizeEntityNode(node, nodeIndex) {
  const ref = `flow.nodes[${nodeIndex}].properties.ecsEntity`;
  const value = node?.properties?.ecsEntity;
  assertExactKeys(value, ["entityRef", "components"], ref);
  const entityRef = assertNonEmptyString(value.entityRef, `${ref}.entityRef`);
  if (!isPlainObject(value.components)) {
    throw new AgenticOsNodeContractError(
      "ECS_AGENTIC_OS_INVALID_NODE",
      `${ref}.components must be an object`,
      `${ref}.components`,
    );
  }
  return {
    entityRef,
    components: canonicalizeJsonValue(value.components, `${ref}.components`),
  };
}

export function assertRepresentableComponentValue(fieldType, value, ref) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AgenticOsNodeContractError(
      "ECS_AGENTIC_OS_UNREPRESENTABLE_VALUE",
      `${ref} must be a finite number representable as ${fieldType}`,
      ref,
    );
  }
  if (fieldType === "f32" && !Number.isFinite(Math.fround(value))) {
    throw new AgenticOsNodeContractError(
      "ECS_AGENTIC_OS_UNREPRESENTABLE_VALUE",
      `${ref} is outside the f32 range`,
      ref,
    );
  }
  const range = INTEGER_RANGES[fieldType];
  if (range && (!Number.isInteger(value) || value < range[0] || value > range[1])) {
    throw new AgenticOsNodeContractError(
      "ECS_AGENTIC_OS_UNREPRESENTABLE_VALUE",
      `${ref} is outside the ${fieldType} range`,
      ref,
    );
  }
  return value;
}

export function normalizeDecisionRecord(value, ref = "decision") {
  assertExactKeys(
    value,
    ["decisionId", "decisionType", "entityRef", "payload", "producedAt"],
    ref,
  );
  const decisionId = assertNonEmptyString(value.decisionId, `${ref}.decisionId`);
  const decisionType = assertNonEmptyString(value.decisionType, `${ref}.decisionType`);
  if (!DECISION_TYPE_SET.has(decisionType)) {
    throw new AgenticOsNodeContractError(
      "ECS_DECISION_UNSUPPORTED_TYPE",
      `${ref}.decisionType ${decisionType} is unsupported`,
      `${ref}.decisionType`,
    );
  }
  const entityRef = assertNonEmptyString(value.entityRef, `${ref}.entityRef`);
  if (!isPlainObject(value.payload)) {
    throw new AgenticOsNodeContractError(
      "ECS_DECISION_INVALID_PAYLOAD",
      `${ref}.payload must be a JSON-safe object`,
      `${ref}.payload`,
    );
  }
  const payload = canonicalizeJsonValue(value.payload, `${ref}.payload`);
  const producedAt = assertNonEmptyString(value.producedAt, `${ref}.producedAt`);
  if (!isExactIsoTimestamp(producedAt)) {
    throw new AgenticOsNodeContractError(
      "ECS_DECISION_INVALID_TIMESTAMP",
      `${ref}.producedAt must be an ISO-8601 timestamp`,
      `${ref}.producedAt`,
    );
  }
  return { decisionId, decisionType, entityRef, payload, producedAt };
}

export function normalizeDecisionNode(node, nodeIndex = 0) {
  return normalizeDecisionRecord(
    node?.properties?.ecsDecision,
    `flow.nodes[${nodeIndex}].properties.ecsDecision`,
  );
}

export function decisionRecordsEqual(left, right) {
  return (
    stableStringifyJson(normalizeDecisionRecord(left)) ===
    stableStringifyJson(normalizeDecisionRecord(right))
  );
}

export function buildDecisionAgenticOsNode(decisionRecord) {
  const decision = normalizeDecisionRecord(decisionRecord);
  return {
    id: `ecs-decision:${decision.decisionId}`,
    label: `Decision ${decision.decisionId}`,
    type: ECS_DECISION_NODE_TYPE,
    status: "recorded",
    properties: { ecsDecision: decision },
  };
}

function parseMarkdownFrontmatter(markdown) {
  const match = String(markdown).match(/^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) {
    throw new AgenticOsNodeContractError(
      "ECS_AGENTIC_OS_FRONTMATTER_REQUIRED",
      "AGENTIC_OS Markdown must begin with YAML frontmatter",
      "frontmatter",
    );
  }
  let frontmatter;
  try {
    frontmatter = loadYaml(match[1], { json: false, schema: JSON_SCHEMA });
  } catch (error) {
    throw new AgenticOsNodeContractError(
      "ECS_AGENTIC_OS_INVALID_YAML",
      `AGENTIC_OS frontmatter is invalid: ${error instanceof Error ? error.message : String(error)}`,
      "frontmatter",
    );
  }
  return frontmatter;
}

export function readAgenticOsNodeState(input) {
  let source = input;
  if (typeof input === "string") {
    const trimmed = input.trimStart();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        source = JSON.parse(input);
      } catch {
        source = parseMarkdownFrontmatter(input);
      }
    } else {
      source = parseMarkdownFrontmatter(input);
    }
  }
  if (!isPlainObject(source)) {
    throw new AgenticOsNodeContractError("ECS_AGENTIC_OS_INVALID_DOCUMENT", "AGENTIC_OS input must be a document", "document");
  }
  const flow = isPlainObject(source.flow) ? source.flow : source;
  if (!Array.isArray(flow.nodes)) {
    throw new AgenticOsNodeContractError(
      "ECS_AGENTIC_OS_NODES_REQUIRED",
      "AGENTIC_OS document must contain flow.nodes",
      "flow.nodes",
    );
  }
  return { nodes: flow.nodes, schema: source.kgSchema ?? source.schema ?? null };
}
