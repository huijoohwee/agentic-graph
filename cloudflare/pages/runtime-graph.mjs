/**
 * Cloudflare Pages Function: /api/graph
 *
 * Purpose:
 * - Provide same-origin API data source for agentic-graph ("Toolbar → Launch → Fetch API Data Source")
 * - Backed by the HackaMap SSOT import bundle under `/agentic-graph/imports/hackamap/`
 *
 * Notes:
 * - This is intentionally NOT a generic proxy.
 * - No external deps; deterministic conversion.
 */
import { corsHeaders } from "./runtime-integration-hub.mjs";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function jsonResponse(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request) },
  });
}

async function fetchHackamapGraphJson(request) {
  // Static asset served by the Pages site (agentic-graph is deployed under /agentic-graph/).
  const url = new URL("/agentic-graph/imports/hackamap/hackamap-graph.json", request.url);
  const res = await fetch(url.toString(), { redirect: "follow" });
  if (!res.ok) return null;
  return await res.json();
}

async function fetchHackamapJson(request, pathname) {
  const url = new URL(pathname, request.url);
  const res = await fetch(url.toString(), { redirect: "follow" });
  if (!res.ok) return null;
  return await res.json();
}

async function fetchHackamapApiGraphJson(request) {
  const payload = await fetchHackamapJson(request, "/agentic-graph/imports/hackamap/hackamap_api_graph.json");
  return isApiGraphPayload(payload) ? payload : null;
}

async function fetchHackamapPipelineJson(request) {
  const payload = await fetchHackamapJson(request, "/agentic-graph/imports/hackamap/hackamap_pipeline.json");
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

async function fetchHackamapQueryPresetsJson(request) {
  const payload = await fetchHackamapJson(request, "/agentic-graph/imports/hackamap/hackamap_query_presets.json");
  return Array.isArray(payload) ? payload.filter(Boolean) : [];
}

async function fetchHackamapQueryRunsManifestJson(request) {
  const payload = await fetchHackamapJson(request, "/agentic-graph/imports/hackamap/query-outputs/query-runs.manifest.json");
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

function isApiGraphPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Array.isArray(value.nodes) && Array.isArray(value.edges);
}

function buildHackamapTablePrefix(presetEntry, runEntry) {
  const basePrefix = String((presetEntry && presetEntry.output && presetEntry.output.per_table_prefix) || presetEntry?.id || runEntry?.preset || "").trim();
  const suffix = String(runEntry?.output_suffix || "").trim();
  return suffix ? `${basePrefix}-${suffix}` : basePrefix;
}

function collectRowIds(rows, key) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const value = String(row[key] || "").trim();
    if (value) out.push(value);
  }
  return out;
}

async function countHackamapQueryRows(request, pathname) {
  const payload = await fetchHackamapJson(request, pathname);
  return Array.isArray(payload) ? payload.length : 0;
}

async function readHackamapRunTableCounts(request, presetEntry, runEntry) {
  const tablePrefix = buildHackamapTablePrefix(presetEntry, runEntry);
  if (!tablePrefix) return {};
  const tableFiles = ["events", "demos", "sources", "organizer", "team", "techstack"];
  const counts = await Promise.all(
    tableFiles.map(async (tableFile) => [
      tableFile,
      await countHackamapQueryRows(request, `/agentic-graph/imports/hackamap/query-outputs/${tableFile}.${tablePrefix}.query.json`),
    ]),
  );
  return Object.fromEntries(counts.filter(([, count]) => count > 0));
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
      .map(([key, nested]) => [key, sortObjectKeys(nested)]),
  );
}

function stableParamSignature(value) {
  try {
    return JSON.stringify(sortObjectKeys(value));
  } catch {
    return "";
  }
}

function toBuilderOption(value) {
  if (typeof value === "string") return { value, label: value };
  return { value, label: JSON.stringify(value) };
}

function buildHackamapPresetRuntimeEntries(presets, runs) {
  return presets
    .map((entry) => {
      const presetId = String(entry?.id || "").trim();
      if (!presetId) return null;
      const defaults = entry?.params && typeof entry.params === "object" && !Array.isArray(entry.params) ? entry.params : {};
      const relatedRuns = runs.filter((run) => String(run?.preset || "").trim() === presetId);
      const paramKeys = Array.from(
        new Set([
          ...Object.keys(defaults),
          ...relatedRuns.flatMap((run) =>
            run?.params && typeof run.params === "object" && !Array.isArray(run.params) ? Object.keys(run.params) : [],
          ),
        ]),
      ).sort((left, right) => String(left).localeCompare(String(right)));
      const publishedParamOptions = Object.fromEntries(
        paramKeys.map((key) => {
          const seen = new Set();
          const options = [];
          const values = [
            defaults[key],
            ...relatedRuns.map((run) =>
              run?.params && typeof run.params === "object" && !Array.isArray(run.params) ? run.params[key] : undefined,
            ),
          ];
          for (const candidate of values) {
            if (typeof candidate === "undefined") continue;
            const signature = stableParamSignature(candidate);
            if (!signature || seen.has(signature)) continue;
            seen.add(signature);
            options.push(toBuilderOption(candidate));
          }
          return [key, options];
        }),
      );
      return {
        id: presetId,
        title: String(entry?.title || presetId).trim(),
        params: defaults,
        param_keys: paramKeys,
        published_param_options: publishedParamOptions,
      };
    })
    .filter(Boolean);
}

async function buildHackamapRuntimeMeta(request) {
  const [pipeline, presets, runsManifest] = await Promise.all([
    fetchHackamapPipelineJson(request),
    fetchHackamapQueryPresetsJson(request),
    fetchHackamapQueryRunsManifestJson(request),
  ]);
  const runtime = pipeline && typeof pipeline === "object" ? pipeline.runtime || {} : {};
  const defaultRunId = String(runtime?.query_selection?.default_run_id || "").trim() || "enhanced";
  const runsRaw = Array.isArray(runsManifest?.runs) ? runsManifest.runs : [];
  const runs = (
    await Promise.all(
      runsRaw.map(async (entry) => {
        const id = String(entry?.id || "").trim();
        const presetId = String(entry?.preset || "").trim();
        if (!id) return null;
        const presetEntry = presets.find((preset) => String(preset?.id || "").trim() === presetId);
        const table_counts = await readHackamapRunTableCounts(request, presetEntry, entry);
        return {
          id,
          preset: presetId,
          title: String(entry?.title || entry?.id || "").trim(),
          params: entry?.params && typeof entry.params === "object" && !Array.isArray(entry.params) ? entry.params : {},
          output_suffix: String(entry?.output_suffix || "").trim(),
          is_default: id === defaultRunId,
          table_counts,
        };
      }),
    )
  ).filter((entry) => entry?.id);
  return {
    ok: true,
    runtime: {
      ...(runtime && typeof runtime === "object" ? runtime : {}),
      presets: buildHackamapPresetRuntimeEntries(presets, runs),
      runs,
    },
  };
}

async function readHackamapQueryRunSelection(request, runId) {
  const normalizedRunId = String(runId || "").trim();
  if (!normalizedRunId) return null;
  const [presets, runsManifest] = await Promise.all([
    fetchHackamapQueryPresetsJson(request),
    fetchHackamapQueryRunsManifestJson(request),
  ]);
  const runs = Array.isArray(runsManifest?.runs) ? runsManifest.runs : [];
  const runEntry = runs.find((entry) => String(entry?.id || "").trim() === normalizedRunId);
  if (!runEntry) return null;
  const presetEntry = presets.find((entry) => String(entry?.id || "").trim() === String(runEntry?.preset || "").trim());
  const tablePrefix = buildHackamapTablePrefix(presetEntry, runEntry);
  if (!tablePrefix) return null;
  const [eventsJson, demosJson] = await Promise.all([
    fetchHackamapJson(request, `/agentic-graph/imports/hackamap/query-outputs/events.${tablePrefix}.query.json`),
    fetchHackamapJson(request, `/agentic-graph/imports/hackamap/query-outputs/demos.${tablePrefix}.query.json`),
  ]);
  const eventIds = new Set(collectRowIds(eventsJson, "id"));
  const demoIds = new Set(collectRowIds(demosJson, "id"));
  const demoEventIds = collectRowIds(demosJson, "event_id");
  for (const id of demoEventIds) eventIds.add(id);
  return { eventIds, demoIds };
}

function filterHackamapApiGraphPayloadByRun(payload, runId, selection) {
  if (!selection || !isApiGraphPayload(payload)) return payload;
  if (selection.eventIds.size === 0 && selection.demoIds.size === 0) {
    return {
      ...payload,
      meta: {
        ...(payload?.meta && typeof payload.meta === "object" ? payload.meta : {}),
        selected_run_id: runId,
        selected_run_filter_skipped: "no-event-demo-rows",
      },
    };
  }
  const keep = new Set();
  selection.eventIds.forEach((id) => keep.add(`Event:${id}`));
  selection.demoIds.forEach((id) => keep.add(`Demo:${id}`));
  const nodes = Array.isArray(payload.nodes) ? payload.nodes.filter((node) => keep.has(String(node?.id || "").trim())) : [];
  const keepIds = new Set(nodes.map((node) => String(node?.id || "").trim()).filter(Boolean));
  const edges = Array.isArray(payload.edges)
    ? payload.edges.filter((edge) => keepIds.has(String(edge?.source || "").trim()) && keepIds.has(String(edge?.target || "").trim()))
    : [];
  return {
    ...payload,
    nodes,
    edges,
    meta: {
      ...(payload?.meta && typeof payload.meta === "object" ? payload.meta : {}),
      selected_run_id: runId,
      selected_event_count: selection.eventIds.size,
      selected_demo_count: selection.demoIds.size,
      total_problems: nodes.filter((node) => String(node?.type || "").trim() === "problem").length,
      total_solutions: nodes.filter((node) => String(node?.type || "").trim() === "solution").length,
    },
  };
}

function toBipartiteApiPayload(graphJson) {
  const nodesRaw = Array.isArray(graphJson?.nodes) ? graphJson.nodes : [];
  const linksRaw = Array.isArray(graphJson?.links) ? graphJson.links : [];

  // Bipartite: Event -> Demo (`has_demo`) so it renders well in d3Bipartite.
  const nodes = [];
  const keep = new Set();
  for (const n of nodesRaw) {
    const id = String(n?.id || "").trim();
    const type = String(n?.type || "").trim();
    const label = String(n?.label || "").trim();
    if (!id || !type || !label) continue;
    if (type === "Event") {
      nodes.push({ id, type: "problem", label, cluster: "Event" });
      keep.add(id);
      continue;
    }
    if (type === "Demo") {
      nodes.push({ id, type: "solution", label, cluster: "Demo" });
      keep.add(id);
    }
  }

  const edges = [];
  for (const e of linksRaw) {
    const source = String(e?.source || "").trim();
    const target = String(e?.target || "").trim();
    const t = String(e?.type || "").trim();
    if (!source || !target) continue;
    if (t !== "has_demo") continue;
    if (!keep.has(source) || !keep.has(target)) continue;
    edges.push({ source, target, type: "has_demo", strength: 0.35 });
  }

  return {
    nodes,
    edges,
    meta: {
      source: "hackamap-graph.json:fallback",
      total_problems: nodes.filter((n) => n.type === "problem").length,
      total_solutions: nodes.filter((n) => n.type === "solution").length,
      ...(graphJson?.content_signature ? { content_signature: String(graphJson.content_signature) } : {}),
    },
  };
}

export async function onRequest(context) {
  const { request } = context;
  const method = String(request.method || "GET").toUpperCase();
  const url = new URL(request.url);
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(request),
        "access-control-allow-methods": "GET, HEAD, OPTIONS",
        "access-control-allow-headers": "*",
        "access-control-max-age": "86400",
      },
    });
  }
  if (method !== "GET" && method !== "HEAD") {
    return jsonResponse(request, { ok: false, error: "unsupported_method" }, 405);
  }

  if (String(url.searchParams.get("view") || "").trim().toLowerCase() === "meta") {
    const metaPayload = await buildHackamapRuntimeMeta(request);
    if (method === "HEAD") return new Response(null, { status: 200, headers: { ...JSON_HEADERS, ...corsHeaders(request) } });
    return jsonResponse(request, metaPayload, 200);
  }

  const runId = String(url.searchParams.get("run") || "").trim();
  const selection = await readHackamapQueryRunSelection(request, runId);

  const apiPayload = await fetchHackamapApiGraphJson(request);
  if (apiPayload) {
    const filteredPayload = filterHackamapApiGraphPayloadByRun(apiPayload, runId, selection);
    if (method === "HEAD") return new Response(null, { status: 200, headers: { ...JSON_HEADERS, ...corsHeaders(request) } });
    return jsonResponse(request, filteredPayload, 200);
  }

  const graphJson = await fetchHackamapGraphJson(request);
  if (!graphJson) {
    return jsonResponse(
      request,
      {
        ok: false,
        error: "missing_hackamap_graph",
        hint: "/agentic-graph/imports/hackamap/{hackamap_api_graph.json,hackamap-graph.json} not found",
      },
      404,
    );
  }

  const payload = toBipartiteApiPayload(graphJson);
  const filteredPayload = filterHackamapApiGraphPayloadByRun(payload, runId, selection);
  if (method === "HEAD") return new Response(null, { status: 200, headers: { ...JSON_HEADERS, ...corsHeaders(request) } });
  return jsonResponse(request, filteredPayload, 200);
}
