// =============================================================================

import { JSON_SCHEMA, load as loadYaml } from "js-yaml";
// AgenticOs_Document (`agentic-os-computing-flow/v1`) — canonical parser / serializer (SSOT)
// agentic-graph-acos-mcp-connector spec · Section 8 (Data models / shared contracts)
// Task 8.6 · Requirement R7.3 · design.md › Correctness Properties › Property 13
// =============================================================================
//
// WHY THIS FILE EXISTS
// --------------------
// A AgenticOs_Document is the `agentic-os-computing-flow/v1` storyboard artifact
//   { canvasDocumentMarkdown, flow: { nodes[], edges[] } }
// produced by the Storyboard_Harness (`mcp/video-remix/storyboard-harness.js`,
// graph built by `mcp/video-remix/storyboard.js` `buildStoryboardFlow`). The
// round-trip property of the document was previously asserted by a PLACEHOLDER
// structural helper forked inside `mcp/video-remix/storyboard-fallback.js`
// (`serializeFlow` / `parseFlow` / `flowEquivalent` / `flowRoundTripEquivalent`).
//
// This module is the SINGLE SOURCE OF TRUTH for parsing, serializing and the
// round-trip guarantee. It is:
//   - framework-agnostic and uses the repository-pinned YAML parser only for
//     lossless Markdown-frontmatter fallback extraction,
//   - plain ESM ("type":"module") reachable by every tier (.js / .mjs),
//   - PURE + TOTAL: every exported function NEVER throws, makes ZERO network
//     calls, and is fully deterministic.
//
// THE GUARANTEE (R7.3 / Property 13)
// ----------------------------------
// For any emitted AgenticOs_Document, parse → serialize → parse yields an EQUIVALENT
// flow structure, where equivalence means:
//   * identical node COUNT,
//   * identical SET of node ids,
//   * identical node ORDERING, and
//   * identical edge CONNECTIONS between nodes.
// `agenticOsRoundTripEquivalent` proves this (and the second pass is stable, i.e.
// parse∘serialize is idempotent up to equivalence).
//
// The canonical graph shape mirrors `buildStoryboardFlow` EXACTLY:
//   node = { id, label, type, status, properties }
//   edge = { id, source, target }
// =============================================================================

// -----------------------------------------------------------------------------
// Canonical constants
// -----------------------------------------------------------------------------

/** The `agentic-os-computing-flow/v1` schema id the AgenticOs_Document declares. */
export const AGENTIC_OS_COMPUTING_FLOW_SCHEMA = "agentic-os-computing-flow/v1";

/** Round-trip-significant node field names (order is canonical). */
export const AGENTIC_OS_NODE_FIELDS = Object.freeze(["id", "label", "type", "status", "properties"]);

/** Round-trip-significant edge field names (order is canonical). */
export const AGENTIC_OS_EDGE_FIELDS = Object.freeze(["id", "source", "target"]);

// -----------------------------------------------------------------------------
// Small pure helpers (no throw, no I/O)
// -----------------------------------------------------------------------------

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Coerce any value to a trimmed string; non-strings / nullish -> "". */
function asString(value) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return "";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function defineCanonicalProperty(target, key, value) {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

/**
 * Clone a JSON-safe value while sorting object keys for stable serialization.
 * Unsupported values are rejected by returning `undefined`; callers preserve
 * the parser's totality by falling back to an empty properties object.
 */
function cloneCanonicalJson(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object" || ancestors.has(value)) return undefined;

  ancestors.add(value);
  if (Array.isArray(value)) {
    const result = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        ancestors.delete(value);
        return undefined;
      }
      const item = cloneCanonicalJson(value[index], ancestors);
      if (item === undefined) {
        ancestors.delete(value);
        return undefined;
      }
      result.push(item);
    }
    ancestors.delete(value);
    return result;
  }

  if (!isPlainObject(value)) {
    ancestors.delete(value);
    return undefined;
  }
  const result = {};
  for (const key of Object.keys(value).sort()) {
    const item = cloneCanonicalJson(value[key], ancestors);
    if (item === undefined) {
      ancestors.delete(value);
      return undefined;
    }
    defineCanonicalProperty(result, key, item);
  }
  ancestors.delete(value);
  return result;
}

function normalizeAgenticOsNodeProperties(value) {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return {};
    }
  }
  const canonical = cloneCanonicalJson(source);
  return isPlainObject(canonical) ? canonical : {};
}

// -----------------------------------------------------------------------------
// Normalization — turn loose input into the canonical node/edge/flow shape
// -----------------------------------------------------------------------------

/**
 * Normalize a single node into the canonical
 * `{ id, label, type, status, properties }`
 * shape. Total: any input yields an object (with empty-string fields for a
 * non-object input).
 */
export function normalizeAgenticOsNode(node) {
  const source = isPlainObject(node) ? node : {};
  return {
    id: asString(source.id),
    label: asString(source.label),
    type: asString(source.type),
    status: asString(source.status),
    properties: normalizeAgenticOsNodeProperties(source.properties),
  };
}

/**
 * Normalize a single edge into the canonical `{ id, source, target }` shape.
 * Total: any input yields an object (with empty-string fields for a non-object
 * input).
 */
export function normalizeAgenticOsEdge(edge) {
  const source = isPlainObject(edge) ? edge : {};
  return {
    id: asString(source.id),
    source: asString(source.source),
    target: asString(source.target),
  };
}

/**
 * Normalize a flow graph into `{ nodes: Node[], edges: Edge[] }`, preserving
 * node/edge ORDERING (significant for the round-trip property). Total.
 */
export function normalizeAgenticOsFlow(flow) {
  const source = isPlainObject(flow) ? flow : {};
  return {
    nodes: asArray(source.nodes).map(normalizeAgenticOsNode),
    edges: asArray(source.edges).map(normalizeAgenticOsEdge),
  };
}

// -----------------------------------------------------------------------------
// Markdown frontmatter flow extraction (fallback parse source)
// -----------------------------------------------------------------------------
//
// The AgenticOs_Document carries the SAME graph twice: a structured `flow` object AND
// the `flow:` block of the canvas-markdown YAML frontmatter (emitted by
// `buildStoryboardMarkdown`). The canonical parser PREFERS the structured
// `flow` object (the authoritative graph); when it is absent/empty it falls
// back to extracting the graph from the markdown so a document carrying only
// markdown still round-trips. The extractor is line-based and tolerant — it
// mirrors the exact `- key: "value"` shape the harness emits and never throws.

const FRONTMATTER_FENCE = "---";

/** Read a `  <indent>key: "value"` (or unquoted) line -> { key, value } | null. */
function readKeyValueLine(rawLine) {
  const line = String(rawLine || "");
  const match = line.match(/^\s*-?\s*([A-Za-z0-9_]+):\s*(.*)$/);
  if (!match) return null;
  let value = match[2].trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }
  return { key: match[1], value, isListItem: /^\s*-\s/.test(line) };
}

/**
 * Extract `{ nodes[], edges[] }` from the `flow:` block of a canvas-markdown
 * frontmatter string. Returns a normalized flow; an empty flow when no block is
 * present. Total — never throws.
 */
export function extractFlowFromMarkdown(markdown) {
  const text = typeof markdown === "string" ? markdown : "";
  const lines = text.split(/\r?\n/);

  // Bound the scan to the frontmatter block (between the first two `---`
  // fences) when present; otherwise scan the whole document.
  let start = 0;
  let end = lines.length;
  let frontmatterSource = null;
  if (lines[0] !== undefined && lines[0].trim() === FRONTMATTER_FENCE) {
    start = 1;
    const closing = lines.slice(1).findIndex((l) => l.trim() === FRONTMATTER_FENCE);
    if (closing >= 0) {
      end = closing + 1;
      frontmatterSource = lines.slice(start, end).join("\n");
    }
  }

  if (frontmatterSource !== null) {
    try {
      const frontmatter = loadYaml(frontmatterSource, { json: false, schema: JSON_SCHEMA });
      if (isPlainObject(frontmatter) && Object.hasOwn(frontmatter, "flow")) {
        return normalizeAgenticOsFlow(frontmatter.flow);
      }
    } catch {
      // Keep the historical total line parser as a malformed-YAML fallback.
    }
  }

  const nodes = [];
  const edges = [];
  let section = null; // "nodes" | "edges" | null
  let current = null; // accumulating record

  const flush = () => {
    if (!current) return;
    if (section === "nodes") nodes.push(normalizeAgenticOsNode(current));
    else if (section === "edges") edges.push(normalizeAgenticOsEdge(current));
    current = null;
  };

  for (let i = start; i < end; i += 1) {
    const raw = lines[i];
    const trimmed = String(raw || "").trim();
    if (trimmed === "nodes:") {
      flush();
      section = "nodes";
      continue;
    }
    if (trimmed === "edges:") {
      flush();
      section = "edges";
      continue;
    }
    if (section === null) continue;
    // A top-level key that is not part of the flow block ends the section.
    if (trimmed.length && !trimmed.startsWith("-") && /^[A-Za-z0-9_]+:/.test(trimmed) &&
        trimmed !== "flow:" && !/^(nodes|edges):/.test(trimmed)) {
      // still could be a nested key inside a list item — only break on flow-leaving
      // keys when not currently accumulating a record handled below.
    }
    const kv = readKeyValueLine(raw);
    if (!kv) continue;
    if (kv.isListItem) {
      // A new list item begins; flush the previous record.
      flush();
      current = {};
    }
    if (!current) current = {};
    current[kv.key] = kv.value;
  }
  flush();

  return { nodes, edges };
}

// -----------------------------------------------------------------------------
// parse / serialize — the canonical SSOT
// -----------------------------------------------------------------------------

/**
 * Parse a AgenticOs_Document into its canonical normalized form
 *   { schema, canvasDocumentMarkdown, flow: { nodes[], edges[] } }.
 *
 * Accepts either:
 *   - a AgenticOs_Document object `{ canvasDocumentMarkdown, flow }`, or
 *   - a serialized string produced by `serializeAgenticOsDocument`, or
 *   - any malformed value (yields an empty canonical document).
 *
 * The authoritative graph is the structured `flow` object when it carries
 * nodes; otherwise the graph is extracted from the canvas-markdown frontmatter.
 * Node/edge ORDERING is preserved. PURE + TOTAL — never throws.
 *
 * @param {unknown} input
 * @returns {{ schema: string, canvasDocumentMarkdown: string,
 *            flow: { nodes: object[], edges: object[] } }}
 */
export function parseAgenticOsDocument(input) {
  let doc = input;

  // Accept a serialized string (round-trip from serializeAgenticOsDocument / JSON).
  if (typeof input === "string") {
    try {
      doc = JSON.parse(input);
    } catch {
      // Not JSON — treat the string as raw canvas markdown.
      doc = { canvasDocumentMarkdown: input, flow: null };
    }
  }

  const source = isPlainObject(doc) ? doc : {};
  const canvasDocumentMarkdown =
    typeof source.canvasDocumentMarkdown === "string" ? source.canvasDocumentMarkdown : "";

  const structuredFlow = normalizeAgenticOsFlow(source.flow);
  const flow =
    structuredFlow.nodes.length > 0
      ? structuredFlow
      : extractFlowFromMarkdown(canvasDocumentMarkdown);

  const schema =
    asString(source.schema) ||
    (isPlainObject(source.frontmatter) ? asString(source.frontmatter.schema) : "") ||
    AGENTIC_OS_COMPUTING_FLOW_SCHEMA;

  return { schema, canvasDocumentMarkdown, flow };
}

/**
 * Serialize a AgenticOs_Document (or an already-parsed canonical document) into a
 * STABLE JSON string. The string captures exactly the round-trip-significant
 * fields in canonical field order, so `parseAgenticOsDocument(serializeAgenticOsDocument(d))`
 * is stable. PURE + TOTAL — never throws.
 *
 * @param {unknown} doc
 * @returns {string}
 */
export function serializeAgenticOsDocument(doc) {
  const parsed = parseAgenticOsDocument(doc);
  return JSON.stringify({
    schema: parsed.schema || AGENTIC_OS_COMPUTING_FLOW_SCHEMA,
    canvasDocumentMarkdown: parsed.canvasDocumentMarkdown,
    flow: {
      nodes: parsed.flow.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        type: node.type,
        status: node.status,
        properties: node.properties,
      })),
      edges: parsed.flow.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      })),
    },
  });
}

// -----------------------------------------------------------------------------
// Flow-level parse / serialize (the seam the storyboard-fallback re-point uses)
// -----------------------------------------------------------------------------

/**
 * Serialize JUST a flow graph `{ nodes, edges }` into a stable JSON string.
 * Mirrors the (now superseded) placeholder `serializeFlow` so the
 * storyboard-fallback can delegate here without behavior change. PURE + TOTAL.
 */
export function serializeAgenticOsFlow(flow) {
  const normalized = normalizeAgenticOsFlow(flow);
  return JSON.stringify({
    nodes: normalized.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      type: node.type,
      status: node.status,
      properties: node.properties,
    })),
    edges: normalized.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    })),
  });
}

/**
 * Inverse of `serializeAgenticOsFlow`: parse a serialized flow (or any value) back
 * into a normalized `{ nodes, edges }`. Accepts a JSON string or an object.
 * PURE + TOTAL — never throws (malformed JSON yields an empty flow).
 */
export function parseAgenticOsFlow(serialized) {
  if (typeof serialized === "string") {
    try {
      return normalizeAgenticOsFlow(JSON.parse(serialized));
    } catch {
      return { nodes: [], edges: [] };
    }
  }
  return normalizeAgenticOsFlow(serialized);
}

// -----------------------------------------------------------------------------
// Equivalence + round-trip guarantee (R7.3 / Property 13)
// -----------------------------------------------------------------------------

/**
 * Flow-structure equivalence per R7.3 / Property 13:
 *   * identical node COUNT,
 *   * identical SET of node ids,
 *   * identical node ORDERING (positional id match), and
 *   * identical edge CONNECTIONS (ordered source -> target pairs).
 * PURE + TOTAL — accepts any input, never throws.
 */
export function agenticOsFlowEquivalent(a, b) {
  const left = normalizeAgenticOsFlow(a);
  const right = normalizeAgenticOsFlow(b);

  // identical node count
  if (left.nodes.length !== right.nodes.length) return false;

  // identical node ordering (positional id equality)
  for (let i = 0; i < left.nodes.length; i += 1) {
    if (left.nodes[i].id !== right.nodes[i].id) return false;
  }

  // identical SET of node ids (independent of the ordering check above, so a
  // duplicate-id permutation cannot slip through)
  const leftIds = new Set(left.nodes.map((n) => n.id));
  const rightIds = new Set(right.nodes.map((n) => n.id));
  if (leftIds.size !== rightIds.size) return false;
  for (const id of leftIds) {
    if (!rightIds.has(id)) return false;
  }

  // identical edge connections (ordered source -> target pairs)
  if (left.edges.length !== right.edges.length) return false;
  for (let i = 0; i < left.edges.length; i += 1) {
    if (left.edges[i].source !== right.edges[i].source) return false;
    if (left.edges[i].target !== right.edges[i].target) return false;
  }

  return true;
}

/**
 * Document-level equivalence: two AgenticOs_Documents are equivalent when their flow
 * structures are equivalent (`agenticOsFlowEquivalent`). The round-trip property is
 * defined over the flow structure (R7.3), not the markdown byte stream.
 * PURE + TOTAL.
 */
export function agenticOsDocumentEquivalent(a, b) {
  return agenticOsFlowEquivalent(parseAgenticOsDocument(a).flow, parseAgenticOsDocument(b).flow);
}

/**
 * Flow-level round-trip check: parse(serialize(flow)) yields an equivalent
 * flow, AND a second parse(serialize(...)) pass is stable (parse∘serialize is
 * idempotent up to equivalence). PURE + TOTAL. This is the seam the
 * storyboard-fallback placeholder delegates to.
 */
export function agenticOsFlowRoundTripEquivalent(flow) {
  const once = parseAgenticOsFlow(serializeAgenticOsFlow(flow));
  const twice = parseAgenticOsFlow(serializeAgenticOsFlow(once));
  return agenticOsFlowEquivalent(flow, once) && agenticOsFlowEquivalent(once, twice);
}

/**
 * THE GUARANTEE (R7.3 / Property 13). For any AgenticOs_Document input, assert that
 * parse → serialize → parse yields an equivalent flow structure (identical node
 * count, node-id set, node ordering, and edge connections), and that the
 * serialize∘parse pass is byte-stable on the second iteration. PURE + TOTAL —
 * any input (including malformed) returns a boolean and never throws.
 *
 * @param {unknown} input - a AgenticOs_Document object or a serialized string.
 * @returns {boolean}
 */
export function agenticOsRoundTripEquivalent(input) {
  const parsedOnce = parseAgenticOsDocument(input);
  const serializedOnce = serializeAgenticOsDocument(parsedOnce);
  const parsedTwice = parseAgenticOsDocument(serializedOnce);
  const serializedTwice = serializeAgenticOsDocument(parsedTwice);

  // flow equivalence across the parse -> serialize -> parse cycle (R7.3)
  if (!agenticOsFlowEquivalent(parsedOnce.flow, parsedTwice.flow)) return false;

  // serialize∘parse is byte-stable on the second pass (idempotence)
  return serializedOnce === serializedTwice;
}
