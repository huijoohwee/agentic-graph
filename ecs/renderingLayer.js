import { snapshotWorld } from "./world.js";
import {
  canonicalizeJsonValue,
  compareCanonicalStrings,
  stableStringifyJson,
} from "./agenticOsNodeContract.js";

export const ECS_PROJECTION_ABSENT = "[absent]";
export const ECS_PROJECTION_NAN = "[NaN]";
export const ECS_PROJECTION_POSITIVE_INFINITY = "[Infinity]";
export const ECS_PROJECTION_NEGATIVE_INFINITY = "[-Infinity]";

function quoteYamlString(value) {
  return JSON.stringify(String(value));
}

function normalizeProjectionSpec(snapshot, projection) {
  const requested = projection?.components ?? snapshot.components;
  if (!Array.isArray(requested)) {
    throw new TypeError("projection.components must be an array");
  }
  return requested
    .map((component) => {
      if (!component || typeof component.name !== "string" || component.name.trim() === "") {
        throw new TypeError("every projected component requires a name");
      }
      const fields = Array.isArray(component.fields)
        ? component.fields
        : Object.keys(component.fields ?? {});
      if (fields.some((field) => typeof field !== "string" || field.trim() === "")) {
        throw new TypeError(`projection component ${component.name} has an invalid field`);
      }
      return { name: component.name, fields: [...new Set(fields)].sort() };
    })
    .sort((left, right) => compareCanonicalStrings(left.name, right.name));
}

function normalizeProjectedValue(value) {
  if (typeof value !== "number" || Number.isFinite(value)) return value;
  if (Number.isNaN(value)) return ECS_PROJECTION_NAN;
  return value > 0 ? ECS_PROJECTION_POSITIVE_INFINITY : ECS_PROJECTION_NEGATIVE_INFINITY;
}

function projectEntity(entity, projectionSpec) {
  const components = Object.create(null);
  for (const component of projectionSpec) {
    const source = entity.components?.[component.name];
    const fields = Object.create(null);
    for (const fieldName of component.fields) {
      fields[fieldName] =
        source && Object.prototype.hasOwnProperty.call(source, fieldName)
          ? normalizeProjectedValue(source[fieldName])
          : ECS_PROJECTION_ABSENT;
    }
    components[component.name] = fields;
  }
  return canonicalizeJsonValue({
    components,
    entityId: entity.entityId,
    entityRef: entity.entityRef,
  });
}

function buildProjectionMarkdown(snapshot, projectionSpec, title) {
  const lines = [
    "---",
    'kgSchema: "agentic-os-computing-flow/v1"',
    'kgCanvasSurfaceMode: "2d"',
    `title: ${quoteYamlString(title)}`,
    "flow:",
    "  nodes:",
  ];
  for (const entity of snapshot.entities) {
    const projected = projectEntity(entity, projectionSpec);
    lines.push(
      `    - id: ${quoteYamlString(`ecs-projection:${entity.entityId}`)}`,
      `      label: ${quoteYamlString(entity.entityRef)}`,
      '      type: "EcsEntityProjection"',
      '      status: "computed"',
      `      properties: ${stableStringifyJson({ ecsProjection: projected })}`,
    );
  }
  if (snapshot.entities.length === 0) lines.push("    []");
  lines.push("  edges:", "    []", "---", "", `# ${title}`, "");
  return lines.join("\n");
}

export async function projectWorldToCanvas(world, options = {}) {
  const name = options.name ?? "Agentic ECS Projection.md";
  if (typeof options.applyDocument !== "function") {
    return {
      ok: false,
      errorCode: "ECS_PROJECTION_APPLY_REQUIRED",
      message: "projectWorldToCanvas requires applyDocument({ name, text })",
      failedPortion: "applyDocument",
    };
  }

  let snapshot;
  let text;
  try {
    if (typeof name !== "string" || name.trim() === "") {
      throw new TypeError("projection name must be a non-empty string");
    }
    snapshot = snapshotWorld(world);
    const projectionSpec = normalizeProjectionSpec(snapshot, options.projection);
    const title = name.replace(/[\r\n]+/g, " ").replace(/\.md$/i, "");
    text = buildProjectionMarkdown(snapshot, projectionSpec, title);
  } catch {
    return {
      ok: false,
      errorCode: "ECS_PROJECTION_SNAPSHOT_FAILED",
      message: "ECS projection snapshot failed",
      failedPortion: "snapshot",
    };
  }

  try {
    const applied = await options.applyDocument({ name, text });
    if (applied === false || applied?.ok === false) {
      return {
        ok: false,
        errorCode: "ECS_PROJECTION_APPLY_FAILED",
        message: "Canvas apply path rejected the ECS projection",
        failedPortion: "applyDocument",
      };
    }
    return { ok: true, name, text, entityCount: snapshot.entities.length };
  } catch {
    return {
      ok: false,
      errorCode: "ECS_PROJECTION_APPLY_FAILED",
      message: "Canvas apply path rejected the ECS projection",
      failedPortion: "applyDocument",
    };
  }
}
