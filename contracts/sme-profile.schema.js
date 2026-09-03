import { inspectSmeSourceSafety } from "./sme-source-safety.js";

export const SME_PROFILE_SCHEMA_ID = "agentic-graph-sme-profile/v1";
export const SME_GROWTH_STAGES = Object.freeze(["pre_seed", "early", "growth", "established"]);
export const SME_RISK_DOMAINS = Object.freeze(["cyber", "supply_chain", "asset_physical"]);
export const SME_UNDECLARED = "undeclared";
export const SME_TEXT_MAX = 200;
export const SME_COLLECTION_MAX = 100;
export const SME_SIZE_RANGE = Object.freeze({ minimum: 1, maximum: 250 });

const REQUIRED_FIELDS = Object.freeze(["schema", "profile_id", "industry", "size", "growth_stage"]);
const OPTIONAL_FIELDS = Object.freeze(["assets", "digital_footprint", "suppliers", "declared_coverage"]);
const PRINT_FIELDS = Object.freeze([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.trim().length > 0 && value.length <= SME_TEXT_MAX;

function error(path, reason) {
  return { ok: false, error: { code: "invalid_sme_profile", path, reason }, costState: "zero_spend" };
}

function unsafeError(rejectedFields) {
  return {
    ok: false,
    error: {
      code: "unsafe_sme_profile",
      path: rejectedFields[0] || "source",
      reason: "registry, financial-account, or credential-like input is forbidden",
      rejected_fields: rejectedFields,
    },
    costState: "zero_spend",
  };
}

function normalizeCoverage(value) {
  if (typeof value === "string") return value.trim();
  if (!isObject(value)) return value;
  return ["label", "category", "scope", "semantic_key"].reduce((out, field) => {
    if (typeof value[field] === "string" && value[field].trim()) out[field] = value[field].trim();
    return out;
  }, {});
}

export function validateSmeProfile(value) {
  if (!isObject(value)) return error("", "profile must be an object");
  const safety = inspectSmeSourceSafety(value);
  if (!safety.safe) return unsafeError(safety.rejected_fields);
  if (!("schema" in value) || value.schema === "") return error("schema", "required field is missing");
  if (value.schema !== SME_PROFILE_SCHEMA_ID) return error("schema", `must equal ${SME_PROFILE_SCHEMA_ID}`);
  for (const field of REQUIRED_FIELDS.slice(1)) {
    if (!(field in value) || value[field] === "") return error(field, "required field is missing");
  }
  for (const field of ["profile_id", "industry"]) {
    if (!isText(value[field])) return error(field, `must be a non-empty string of at most ${SME_TEXT_MAX} characters`);
  }
  if (/[\\/]/.test(value.profile_id) || value.profile_id.includes("..")) return error("profile_id", "must be one safe path segment");
  if (!Number.isInteger(value.size) || value.size < SME_SIZE_RANGE.minimum || value.size > SME_SIZE_RANGE.maximum) {
    return error("size", `must be an integer from ${SME_SIZE_RANGE.minimum} to ${SME_SIZE_RANGE.maximum}`);
  }
  if (!SME_GROWTH_STAGES.includes(value.growth_stage)) {
    return error("growth_stage", `must be one of ${SME_GROWTH_STAGES.join(", ")}`);
  }
  for (const field of ["assets", "suppliers"]) {
    const entry = value[field] ?? SME_UNDECLARED;
    if (entry === SME_UNDECLARED) continue;
    if (!Array.isArray(entry)) return error(field, `must be ${SME_UNDECLARED} or an array`);
    if (entry.length > SME_COLLECTION_MAX) return error(field, `must contain at most ${SME_COLLECTION_MAX} entries`);
    const invalid = entry.findIndex((item) => !isText(item));
    if (invalid >= 0) return error(`${field}[${invalid}]`, `must be a non-empty string of at most ${SME_TEXT_MAX} characters`);
  }
  const digital = value.digital_footprint ?? SME_UNDECLARED;
  if (digital !== SME_UNDECLARED && !isText(digital)) return error("digital_footprint", `must be ${SME_UNDECLARED} or a non-empty string of at most ${SME_TEXT_MAX} characters`);
  const coverage = value.declared_coverage ?? SME_UNDECLARED;
  if (coverage !== SME_UNDECLARED) {
    if (!Array.isArray(coverage)) return error("declared_coverage", `must be ${SME_UNDECLARED} or an array`);
    for (let index = 0; index < coverage.length; index += 1) {
      const item = coverage[index];
      if (typeof item === "string") {
        if (!isText(item)) return error(`declared_coverage[${index}]`, `must be a non-empty string of at most ${SME_TEXT_MAX} characters`);
      } else if (!isObject(item) || !isText(item.label || item.category)) {
        return error(`declared_coverage[${index}]`, "must be a string or an object with a valid label or category");
      } else {
        for (const field of ["label", "category", "scope", "semantic_key"]) {
          if (item[field] !== undefined && !isText(item[field])) return error(`declared_coverage[${index}].${field}`, `must be a non-empty string of at most ${SME_TEXT_MAX} characters`);
        }
      }
    }
  }
  const profile = {
    schema: SME_PROFILE_SCHEMA_ID,
    profile_id: value.profile_id.trim(),
    industry: value.industry.trim(),
    size: value.size,
    growth_stage: value.growth_stage,
    assets: value.assets === undefined ? SME_UNDECLARED : value.assets === SME_UNDECLARED ? SME_UNDECLARED : value.assets.map((item) => item.trim()),
    digital_footprint: value.digital_footprint === undefined ? SME_UNDECLARED : value.digital_footprint === SME_UNDECLARED ? SME_UNDECLARED : value.digital_footprint.trim(),
    suppliers: value.suppliers === undefined ? SME_UNDECLARED : value.suppliers === SME_UNDECLARED ? SME_UNDECLARED : value.suppliers.map((item) => item.trim()),
    declared_coverage: value.declared_coverage === undefined ? SME_UNDECLARED : value.declared_coverage === SME_UNDECLARED ? SME_UNDECLARED : value.declared_coverage.map(normalizeCoverage),
  };
  return { ok: true, profile };
}

function parseScalar(raw) {
  const value = raw.trim();
  if (!value) return "";
  if (/^-?\d+$/.test(value)) return Number(value);
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}")) || (value.startsWith('"') && value.endsWith('"'))) {
    try { return JSON.parse(value); } catch { return Symbol.for("invalid"); }
  }
  if ((value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1).replace(/''/g, "'");
  return value;
}

export function parseSmeProfileMarkdown(markdown) {
  if (typeof markdown !== "string" || !markdown.trim()) return error("", "document must be non-empty Markdown");
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return error("", "document must begin with frontmatter delimiter ---");
  const end = lines.slice(1).findIndex((line) => line.trim() === "---");
  if (end < 0) return error("", "frontmatter closing delimiter is missing");
  const source = {};
  const safetySource = {};
  for (const line of lines.slice(1, end + 1)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!match) return error("", "frontmatter must use one key: value pair per line");
    const parsed = parseScalar(match[2]);
    if (parsed === Symbol.for("invalid")) return error(match[1], "contains invalid JSON-compatible YAML");
    safetySource[match[1]] = parsed;
    if (!PRINT_FIELDS.includes(match[1])) continue;
    if (Object.hasOwn(source, match[1])) return error(match[1], "field must appear once");
    source[match[1]] = parsed;
  }
  const safety = inspectSmeSourceSafety(safetySource);
  if (!safety.safe) return unsafeError(safety.rejected_fields);
  return validateSmeProfile(source);
}

export function printSmeProfileMarkdown(value) {
  const validated = validateSmeProfile(value);
  if (!validated.ok) return validated;
  const profile = validated.profile;
  const lines = PRINT_FIELDS.map((field) => `${field}: ${JSON.stringify(profile[field])}`);
  return { ok: true, markdown: `---\n${lines.join("\n")}\n---\n\n# SME Risk Profile\n` };
}
