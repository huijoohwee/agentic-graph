import {
  AdlcProjectionError,
  assertBoundedJson,
  canonicalValue,
  cloneJson,
  digestJson as digest,
  stableJson,
  typedId,
} from "./adlc-observability-json.js";
import { deriveDeployedFromReceipts } from "./adlc-observability-lifecycle.js";
import { LEGACY_RUN_SCHEMA } from "./adlc-legacy-ledger.js";

export { AdlcProjectionError };

export const ADLC_CANVAS_PROJECTION_SCHEMA = "adlc-canvas-projection/v1";
export const ADLC_AGENTIC_OS_SCHEMA = "agentic-os-computing-flow/v1";
export const ADLC_OBSERVABILITY_INVOCATION =
  "/adlc.observe #adlc-observability @implementation-run @canvas @runtime-proof";
export const ADLC_OBSERVABILITY_VIEWS = Object.freeze([
  "overview", "plan", "execution", "evidence", "economics", "recovery", "receipts", "full",
]);

const CURSOR_SCHEMA = "adlc-cursor/v1";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const NODE_TYPES = Object.freeze([
  "run", "criterion", "vcc", "task", "transition", "dispatch", "return",
  "check", "evidence", "finding", "budget", "receipt", "gate", "checkpoint",
]);
const EDGE_TYPES = Object.freeze([
  "defines", "covers", "dependsOn", "transitionsTo", "dispatchedAs",
  "returnedAs", "verifiedBy", "evidencedBy", "consumes", "gatedBy", "persistedAs",
]);
const NODE_RANK = new Map(NODE_TYPES.map((type, index) => [type, index]));
const EDGE_RANK = new Map(EDGE_TYPES.map((type, index) => [type, index]));
const VIEW_TYPES = Object.freeze({
  overview: new Set(["run", "task", "finding", "budget", "receipt", "gate", "checkpoint"]),
  plan: new Set(["run", "criterion", "vcc", "task", "budget"]),
  execution: new Set(["run", "task", "transition", "dispatch", "return", "check"]),
  evidence: new Set(["run", "task", "check", "evidence", "finding", "checkpoint"]),
  economics: new Set(["run", "task", "budget"]),
  recovery: new Set(["run", "task", "transition", "gate", "checkpoint"]),
  receipts: new Set(["run", "receipt", "gate", "checkpoint"]),
  full: new Set(NODE_TYPES),
});
const fail = (code, message) => { throw new AdlcProjectionError(code, message); };
const text = (value) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const orderedRecords = (value) =>
  list(value).map(cloneJson).sort((left, right) => compareText(stableJson(left), stableJson(right)));
const statusText = (value, fallback = "observed") => text(value) || fallback;
const nodeOrder = (left, right) =>
  (NODE_RANK.get(left.type) ?? NODE_TYPES.length) - (NODE_RANK.get(right.type) ?? NODE_TYPES.length)
  || compareText(left.id, right.id);
const edgeOrder = (left, right) =>
  (EDGE_RANK.get(left.type) ?? EDGE_TYPES.length) - (EDGE_RANK.get(right.type) ?? EDGE_TYPES.length)
  || compareText(left.source, right.source) || compareText(left.target, right.target)
  || compareText(left.id, right.id);
const sourceIdentity = (item, ...candidates) =>
  candidates.map(text).find(Boolean) ?? digest(item);
function lifecycleStatus(run, conformance, implementationRun) {
  const metrics = record(conformance.metrics);
  const tasks = list(run.tasks);
  const evidence = list(run.evidenceReferences);
  const verified = conformance.runtimeReady === true
    && tasks.length > 0
    && metrics.taskCount === tasks.length
    && metrics.verifiedTaskCount === tasks.length
    && metrics.evidenceReferenceCount === evidence.length
    && tasks.every((task) => {
      const taskId = text(task.id ?? task.taskId);
      const evaluatorVerified = list(task.transitions).some((transition) =>
        transition?.to === "verified"
        && transition?.role === "evaluator"
        && Boolean(text(transition?.mechanismId)));
      const taskEvidence = evidence.some((reference) =>
        text(reference?.taskId) === taskId
        && reference?.checkRanInTask === true
        && reference?.recordedResult?.status === "passed"
        && Boolean(text(reference?.namedCheck ?? reference?.checkName))
        && Boolean(text(reference?.checkRunId)));
      return task?.state === "verified" && evaluatorVerified && taskEvidence;
    });
  const deliveryReady = text(implementationRun.state)
    ? text(implementationRun.state) === "delivery_ready"
    : null;
  return {
    verified,
    deliveryReady,
    deployed: deriveDeployedFromReceipts(receiptEntries(run)),
  };
}
function receiptCarrierEntries(carrier) {
  if (Array.isArray(carrier)) {
    return orderedRecords(carrier).map((value, index) => ({
      key: text(value.receiptType ?? value.type ?? value.schema) || `receipt-${index + 1}`, value,
    }));
  }
  return Object.entries(record(carrier)).sort(([a], [b]) => compareText(a, b))
    .map(([key, value]) => ({ key, value: cloneJson(value) }));
}
function receiptEntries(run) {
  const releaseLifecycle = record(run.releaseLifecycle);
  if (Object.hasOwn(releaseLifecycle, "receipts")) return receiptCarrierEntries(releaseLifecycle.receipts);
  if (Object.hasOwn(run, "receipts")) return receiptCarrierEntries(run.receipts);
  const production = record(run.productionLifecycle);
  if (Object.hasOwn(production, "receipts")) return receiptCarrierEntries(production.receipts);
  return ["localReview", "readiness", "candidate", "authorization"]
    .filter((key) => Object.hasOwn(production, key))
    .map((key) => ({ key, value: cloneJson(production[key]) }));
}
function buildRecordGraph(run, implementationRun, source, conformance) {
  const nodes = new Map();
  const edgeSpecs = new Map();
  const taskIds = new Map();
  const vccIds = new Map();
  const criterionIds = new Map();
  const lifecycle = lifecycleStatus(run, conformance, implementationRun);
  const tasks = orderedRecords(run.tasks).map((task) => ({
    ...task, transitions: orderedRecords(task.transitions),
  }));
  const nested = (key) => tasks.flatMap((task) => {
    const value = task[key];
    const items = Array.isArray(value) ? value : value && typeof value === "object"
      && Object.keys(value).length ? [value] : [];
    return items.map((item) => ({ ...item, taskId: item.taskId ?? task.id }));
  });
  const transitions = orderedRecords(nested("transitions"));
  const dispatches = orderedRecords(nested("dispatch"));
  const returns = orderedRecords(nested("return"));
  const addNode = (kind, id, label, status, sourceRecord, properties = {}) => {
    const next = {
      id, label: text(label) || id, type: kind,
      properties: canonicalValue({
        kind, status: statusText(status), ...properties,
        ...(sourceRecord === undefined ? {} : { source: sourceRecord }),
      }),
    };
    if (!nodes.has(id) || nodes.get(id).properties.stub === true) nodes.set(id, next);
    return id;
  };
  const addStub = (kind, id) => {
    if (!nodes.has(id)) addNode(kind, id, id, "unresolved", undefined, {
      stub: true, stubReason: "missing_endpoint",
    });
  };
  const addEdge = (type, sourceId, targetId, sourceKind, targetKind) => {
    const key = stableJson([type, sourceId, targetId]);
    if (!edgeSpecs.has(key)) edgeSpecs.set(key, {
      type, source: sourceId, target: targetId, sourceKind, targetKind,
    });
  };
  const runId = typedId("run", run.runId);
  addNode("run", runId, `ADLC run ${run.runId}`, "observed", {
    schema: run.schema, runId: run.runId,
  }, {
    implementationRun, sourceIdentity: source, conformance, lifecycleStatus: lifecycle,
    invocation: ADLC_OBSERVABILITY_INVOCATION,
  });
  for (const vcc of orderedRecords(run.vccs)) {
    const key = text(vcc.conditionId ?? vcc.vccId ?? vcc.id);
    if (!key) continue;
    const id = typedId("vcc", key);
    vccIds.set(key, id);
    addNode("vcc", id, vcc.endState ?? key, "defined", vcc, { sourceId: key });
    addEdge("defines", runId, id, "run", "vcc");
    const criterionKey = text(vcc.criterionId);
    if (!criterionKey) continue;
    const criterionId = typedId("criterion", criterionKey);
    criterionIds.set(criterionKey, criterionId);
    addNode("criterion", criterionId, criterionKey, "defined", { criterionId: criterionKey });
    addEdge("covers", id, criterionId, "vcc", "criterion");
  }
  for (const task of tasks) {
    const key = text(task.taskId ?? task.id);
    if (!key) continue;
    const id = typedId("task", key);
    taskIds.set(key, id);
    addNode("task", id, task.text ?? `Task ${key}`, task.state, task, { sourceId: key });
    addEdge("defines", runId, id, "run", "task");
    for (const vccKey of [...list(task.vccIds), ...list(task.sourceVccIds)].map(text).sort(compareText)) {
      addEdge("covers", id, vccIds.get(vccKey) ?? typedId("vcc", vccKey), "task", "vcc");
    }
    for (const criterionKey of list(task.criterionIds).map(text).sort(compareText)) {
      addEdge("covers", id, criterionIds.get(criterionKey) ?? typedId("criterion", criterionKey), "task", "criterion");
    }
    for (const dependency of [...list(task.dependencyIds), ...list(task.dependencies)].map(text).sort(compareText)) {
      addEdge("dependsOn", id, taskIds.get(dependency) ?? typedId("task", dependency), "task", "task");
    }
    const taskBudget = task.effectiveBudgets ?? task.dispatch?.budgets ?? task.budgets;
    if (taskBudget && typeof taskBudget === "object") {
      const budgetId = typedId("budget", key, "allocated");
      addNode("budget", budgetId, `Budget · task ${key}`, "allocated", taskBudget, {
        budgetKind: "allocated", taskId: key,
      });
      addEdge("consumes", id, budgetId, "task", "budget");
    }
  }
  const transitionsByTask = new Map();
  transitions.forEach((item, index) => {
    const taskKey = text(item.taskId);
    const identity = sourceIdentity(item, item.sequence, item.ordinal, item.transitionId, item.id);
    const id = typedId("transition", taskKey, identity);
    addNode("transition", id, `${item.from ?? "start"} → ${item.to ?? "unknown"}`, item.to, item, {
      sourceId: `${taskKey}:${identity}`,
    });
    addEdge("transitionsTo", taskIds.get(taskKey) ?? typedId("task", taskKey), id, "task", "transition");
    if (!transitionsByTask.has(taskKey)) transitionsByTask.set(taskKey, []);
    transitionsByTask.get(taskKey).push({
      id, sequence: Number(item.sequence ?? item.ordinal ?? index),
    });
  });
  for (const items of transitionsByTask.values()) {
    items.sort((a, b) => a.sequence - b.sequence || compareText(a.id, b.id));
    for (let index = 1; index < items.length; index += 1) {
      addEdge("transitionsTo", items[index - 1].id, items[index].id, "transition", "transition");
    }
  }
  dispatches.forEach((item) => {
    const taskKey = text(item.taskId);
    const identity = sourceIdentity(item, item.dispatchId, item.id, item.derivationRevision);
    const id = typedId("dispatch", taskKey, identity);
    addNode("dispatch", id, `Dispatch · task ${taskKey}`, "dispatched", item, {
      sourceId: `${taskKey}:${identity}`,
    });
    addEdge("dispatchedAs", taskIds.get(taskKey) ?? typedId("task", taskKey), id, "task", "dispatch");
  });
  const addCheck = ({ ownerId, ownerKind, taskKey, kind, name, result, identity }) => {
    if (!result || typeof result !== "object") return;
    const id = typedId("check", taskKey, kind, identity);
    addNode("check", id, name || kind, result.status, result, { checkKind: kind, taskId: taskKey || null });
    addEdge("verifiedBy", ownerId, id, ownerKind, "check");
    const taskId = taskIds.get(taskKey);
    if (taskId && taskId !== ownerId) addEdge("verifiedBy", taskId, id, "task", "check");
  };
  returns.forEach((item) => {
    const taskKey = text(item.taskId);
    const identity = sourceIdentity(item, item.returnId, item.id, item.idempotencyKey);
    const id = typedId("return", taskKey, identity);
    addNode("return", id, `Return · task ${taskKey}`, "returned", item, {
      sourceId: `${taskKey}:${identity}`,
    });
    addEdge("returnedAs", taskIds.get(taskKey) ?? typedId("task", taskKey), id, "task", "return");
    addCheck({
      ownerId: id, ownerKind: "return", taskKey, kind: "named", name: item.namedCheck,
      result: item.checkResult ?? item.namedCheckResult,
      identity: sourceIdentity(item, item.checkRunId, identity),
    });
    addCheck({
      ownerId: id, ownerKind: "return", taskKey, kind: "existing-verification",
      name: item.existingVerificationLane?.name ?? item.existingVerificationLane,
      result: typeof item.existingVerificationLane === "object"
        ? item.existingVerificationLane : item.existingVerificationResult,
      identity: item.existingVerificationLane?.checkRunId
        ?? item.existingVerificationResult?.checkRunId ?? identity,
    });
    list(item.propertyResults).forEach((property, propertyIndex) => addCheck({
      ownerId: id, ownerKind: "return", taskKey, kind: "property",
      name: property.checkName ?? property.propertyId, result: property.recordedResult,
      identity: property.checkRunId ?? property.propertyId ?? propertyIndex,
    }));
    const witness = record(item.failingFirstWitness);
    addCheck({
      ownerId: id, ownerKind: "return", taskKey, kind: "failing-first-witness",
      name: witness.check, result: witness.recordedResult,
      identity: sourceIdentity(witness, witness.checkRunId, identity),
    });
    if (item.consumption && typeof item.consumption === "object") {
      const budgetId = typedId("budget", taskKey, "consumed", identity);
      addNode("budget", budgetId, `Consumption · task ${taskKey}`, "recorded", item.consumption, {
        budgetKind: "consumed", taskId: taskKey,
      });
      addEdge("consumes", id, budgetId, "return", "budget");
    }
  });
  orderedRecords(run.evidenceReferences).forEach((item) => {
    const taskKey = text(item.taskId);
    const key = sourceIdentity(item, item.id, item.evidenceId, item.checkRunId);
    const id = typedId("evidence", taskKey, key);
    addNode("evidence", id, item.namedCheck ?? item.checkName ?? key, item.recordedResult?.status, item, {
      sourceId: key, taskId: taskKey || null,
    });
    addEdge("evidencedBy", taskIds.get(taskKey) ?? typedId("task", taskKey), id, "task", "evidence");
    addCheck({
      ownerId: id, ownerKind: "evidence", taskKey, kind: "evidence",
      name: item.namedCheck ?? item.checkName,
      result: item.recordedResult, identity: item.checkRunId ?? key,
    });
  });
  orderedRecords([
    ...list(run.priorFindings).map((item) => ({ ...item, observationSource: "prior-run" })),
    ...list(conformance.findings).map((item) => ({ ...item, observationSource: "evaluated-conformance" })),
  ]).forEach((item, index) => {
    const identity = sourceIdentity(
      item, item.findingId, item.id,
      [item.observationSource, item.findingType, item.artifactReference,
        item.guidelineAnchor, item.evidenceExcerpt]
        .map(text).filter(Boolean).join("\u001f"),
    );
    const id = typedId("finding", identity);
    addNode("finding", id, item.findingType ?? `Finding ${index + 1}`, item.severity, item, {
      sourceId: text(item.findingType) || String(index),
    });
    addEdge("evidencedBy", runId, id, "run", "finding");
  });
  orderedRecords(run.humanGateEvents).forEach((item) => {
    const taskKey = text(item.taskId);
    const identity = sourceIdentity(item, item.id, item.gateId);
    const id = typedId("gate", taskKey, identity);
    addNode("gate", id, item.trigger ?? item.id ?? item.gateId, item.resolution, item, {
      sourceId: identity, taskId: taskKey || null,
    });
    addEdge("gatedBy", taskIds.get(taskKey) ?? typedId("task", taskKey), id, "task", "gate");
  });
  orderedRecords(run.persistedTerminals).forEach((item) => {
    const taskKey = text(item.taskId);
    const identity = sourceIdentity(
      item, item.checkpointDigest, item.id, item.transitionOrdinal, item.ledgerRevision,
    );
    const id = typedId("checkpoint", taskKey, "terminal", identity);
    addNode("checkpoint", id, `Checkpoint · task ${taskKey}`, item.state, item, {
      checkpointKind: "terminal", taskId: taskKey || null,
    });
    addEdge("persistedAs", taskIds.get(taskKey) ?? typedId("task", taskKey), id, "task", "checkpoint");
  });
  orderedRecords(run.recoveryEvents).forEach((item) => {
    const taskKey = text(item.taskId);
    const identity = sourceIdentity(item, item.id, item.eventId, item.checkpointDigest);
    const id = typedId("checkpoint", taskKey, "recovery", identity);
    addNode("checkpoint", id, `Recovery · ${item.id ?? item.eventId ?? taskKey}`, item.resumed ? "resumed" : "recorded", item, {
      checkpointKind: "recovery", taskId: taskKey || null,
    });
    addEdge("persistedAs", taskIds.get(taskKey) ?? typedId("task", taskKey), id, "task", "checkpoint");
    addCheck({
      ownerId: id, ownerKind: "checkpoint", taskKey, kind: "recovery", name: "Recovery check",
      result: item.recoveryCheck, identity,
    });
  });
  if (run.persistence && typeof run.persistence === "object") {
    const id = typedId("checkpoint", run.runId, "persistence");
    addNode("checkpoint", id, "Run persistence", run.persistence.reconstructable ? "reconstructable" : "recorded", run.persistence, {
      checkpointKind: "persistence",
    });
    addEdge("persistedAs", runId, id, "run", "checkpoint");
    addCheck({
      ownerId: id, ownerKind: "checkpoint", taskKey: "", kind: "reconstruction",
      name: "Reconstruction check", result: run.persistence.reconstructionCheck,
      identity: run.persistence.reconstructionCheck?.checkRunId ?? "persistence",
    });
  }
  for (const [key, value, label] of [
    ["total-consumption", run.reportedAggregateConsumption, "Run consumption"],
    ["guideline-load", run.guidelineLoadEvents?.length
      ? { events: run.guidelineLoadEvents } : null, "Guideline load cost"],
  ]) {
    if (!value || typeof value !== "object") continue;
    const id = typedId("budget", run.runId, key);
    addNode("budget", id, label, "recorded", value, { budgetKind: key });
    addEdge("consumes", runId, id, "run", "budget");
  }
  const receiptNodes = receiptEntries(run).map(({ key, value }) => {
    const item = record(value);
    const receiptType = text(item.receiptType ?? item.type ?? item.schema) || key;
    const identity = sourceIdentity(
      item, item.receiptId, item.id, item.receiptDigest, item.digest,
    );
    const id = typedId("receipt", receiptType, identity);
    addNode("receipt", id, receiptType, item.status, item, {
      receiptType, sourceId: identity,
    });
    addEdge("defines", runId, id, "run", "receipt");
    return { id, item, key };
  });
  const receiptDigestOwners = new Map();
  for (const value of receiptNodes) {
    for (const key of ["receiptDigest", "digest"]) {
      const valueDigest = text(value.item[key]);
      if (!valueDigest) continue;
      const owners = receiptDigestOwners.get(valueDigest) ?? [];
      owners.push(value);
      receiptDigestOwners.set(valueDigest, owners);
    }
  }
  for (const value of receiptNodes) {
    for (const [key, referencedDigest] of Object.entries(value.item)) {
      if (!/(?:receipt|candidate|parent|previous).*digest$/i.test(key)) continue;
      for (const owner of receiptDigestOwners.get(text(referencedDigest)) ?? []) {
        if (owner.id === value.id) continue;
        const relation = ["candidateDigest", "interactionReceiptDigest"].includes(key)
          && value.item.schema === "agentic-human-authorization-receipt/v2"
          ? "gatedBy" : "transitionsTo";
        addEdge(relation, owner.id, value.id, "receipt", "receipt");
      }
    }
  }
  const localReview = receiptNodes.find((value) => value.key === "localReview");
  const candidate = receiptNodes.find((value) => value.key === "candidate");
  const authorization = receiptNodes.find((value) => value.key === "authorization");
  if (localReview && candidate
    && text(candidate.item.localReviewCandidateDigest) === text(localReview.item.candidateDigest)) {
    addEdge("transitionsTo", localReview.id, candidate.id, "receipt", "receipt");
  }
  if (candidate && authorization
    && text(authorization.item.candidateDigest) === text(candidate.item.candidateDigest)) {
    addEdge("gatedBy", candidate.id, authorization.id, "receipt", "receipt");
  }
  for (const spec of edgeSpecs.values()) {
    addStub(spec.sourceKind, spec.source);
    addStub(spec.targetKind, spec.target);
  }
  const edges = [...edgeSpecs.values()].map((spec) => ({
    id: typedId("edge", spec.type, spec.source, spec.target),
    source: spec.source, target: spec.target, label: spec.type, type: spec.type,
    properties: { relation: spec.type },
  })).sort(edgeOrder);
  return { lifecycle, nodes: [...nodes.values()].sort(nodeOrder), edges };
}
function encodeCursor(projectionDigest, view, offset) {
  return Buffer.from(stableJson({
    schema: CURSOR_SCHEMA, digest: projectionDigest, view, offset,
  }), "utf8").toString("base64url");
}

function decodeCursor(cursor, projectionDigest, view, total) {
  if (!cursor) return 0;
  if (typeof cursor !== "string" || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    fail("invalid_cursor", "Cursor must be canonical base64url.");
  }
  let parsed;
  let decoded;
  try {
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") !== cursor) throw new Error("non-canonical");
    decoded = bytes.toString("utf8");
    parsed = JSON.parse(decoded);
  } catch {
    fail("invalid_cursor", "Cursor is malformed.");
  }
  if (stableJson(parsed) !== decoded || parsed.schema !== CURSOR_SCHEMA
    || !Number.isInteger(parsed.offset) || parsed.offset < 0 || parsed.offset > total) {
    fail("invalid_cursor", "Cursor payload is invalid.");
  }
  if (parsed.digest !== projectionDigest || parsed.view !== view) {
    fail("stale_cursor", "Cursor does not match the current projection digest and view.");
  }
  return parsed.offset;
}

function pagedGraph(nodes, edges, offset, limit) {
  const primary = nodes.slice(offset, offset + limit);
  const primaryIds = new Set(primary.map((node) => node.id));
  const pageEdges = edges.filter((edge) => primaryIds.has(edge.source) || primaryIds.has(edge.target));
  const allNodes = new Map(nodes.map((node) => [node.id, node]));
  const pageNodes = new Map(primary.map((node) => [node.id, node]));
  for (const edge of pageEdges) {
    for (const endpoint of [edge.source, edge.target]) {
      if (pageNodes.has(endpoint) || !allNodes.has(endpoint)) continue;
      const item = allNodes.get(endpoint);
      pageNodes.set(endpoint, {
        id: item.id, label: item.label, type: item.type,
        properties: {
          kind: item.type, status: item.properties.status,
          stub: true, stubReason: "page_endpoint",
        },
      });
    }
  }
  return {
    nodes: [...pageNodes.values()].sort(nodeOrder),
    edges: pageEdges.sort(edgeOrder),
    primaryCount: primary.length,
    stubCount: pageNodes.size - primary.length,
  };
}

function serializeAgenticOsMarkdown(graphData, metadata) {
  const json = (value) => JSON.stringify(value);
  const nodeLines = graphData.nodes.flatMap((node) => [
    `    - id: ${json(node.id)}`, `      type: ${json(node.type)}`,
    `      label: ${json(node.label)}`, `      status: ${json(statusText(node.properties.status))}`,
    `      properties: ${json(node.properties)}`,
  ]);
  const edgeLines = graphData.edges.flatMap((edge) => [
    `    - id: ${json(edge.id)}`, `      source: ${json(edge.source)}`,
    `      target: ${json(edge.target)}`, `      label: ${json(edge.label)}`,
    `      type: ${json(edge.type)}`, `      properties: ${json(edge.properties)}`,
  ]);
  return [
    "---", `schema: ${json(ADLC_CANVAS_PROJECTION_SCHEMA)}`,
    `kgSchema: ${json(ADLC_AGENTIC_OS_SCHEMA)}`, 'kgCanvasSurfaceMode: "2d"',
    'kgCanvasRenderMode: "2d"', 'kgCanvas2dRenderer: "storyboard"',
    'kgDocumentSemanticMode: "document"', "kgFrontmatterModeEnabled: true",
    "kgMultiDimTableModeEnabled: false", "kgDocumentStructureBaselineLock: false",
    `adlc_projection: ${json(metadata)}`, "flow:", "  direction: LR",
    "  edgeType: smoothstep", "  snapToGrid: true", "  gridSize: 20",
    "  computed: false", "  nodes:", ...nodeLines, "  edges:", ...edgeLines,
    "---", "", "# ADLC Observability", "",
    `Deterministic Canvas projection for run \`${metadata.runId}\`, view \`${metadata.view}\`.`, "",
    `Verification: ${String(metadata.status.verified)}; delivery-ready: ${String(metadata.status.deliveryReady)}; deployed: ${String(metadata.status.deployed)}.`,
    "",
  ].join("\n");
}

export function projectAdlcCanvas({
  normalizedRun, implementationRun, source, conformance,
  view = "overview", cursor = null, limit = DEFAULT_LIMIT,
} = {}) {
  const run = canonicalValue(normalizedRun);
  const implementationInput = canonicalValue(implementationRun);
  const sourceIdentity = canonicalValue(source);
  const conformanceRecord = canonicalValue(conformance);
  if (!run || typeof run !== "object" || Array.isArray(run)
    || run.schema !== LEGACY_RUN_SCHEMA || !text(run.runId)) {
    fail("invalid_projection_input", "normalizedRun must retain its validated historical source schema.");
  }
  if (!implementationInput || typeof implementationInput !== "object"
    || Array.isArray(implementationInput)) {
    fail("invalid_projection_input", "implementationRun identity is incomplete.");
  }
  const implementation = canonicalValue({
    runId: implementationInput.runId ?? implementationInput.id
      ?? sourceIdentity?.implementationRunId,
    revision: implementationInput.revision,
    ledgerDigest: implementationInput.ledgerDigest ?? sourceIdentity?.ledgerDigest,
    ...(text(implementationInput.state) ? { state: implementationInput.state } : {}),
  });
  if (!text(implementation.runId) || !Number.isInteger(implementation.revision)
    || !text(implementation.ledgerDigest)) {
    fail("invalid_projection_input", "implementationRun identity is incomplete.");
  }
  if (!sourceIdentity || typeof sourceIdentity !== "object" || Array.isArray(sourceIdentity)) {
    fail("invalid_projection_input", "source must be a JSON object.");
  }
  if (!conformanceRecord || typeof conformanceRecord !== "object" || Array.isArray(conformanceRecord)) {
    fail("invalid_projection_input", "conformance must be a JSON object.");
  }
  if (!ADLC_OBSERVABILITY_VIEWS.includes(view)) {
    fail("invalid_view", `view must be one of ${ADLC_OBSERVABILITY_VIEWS.join(", ")}.`);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    fail("invalid_projection_input", `limit must be an integer from 1 to ${MAX_LIMIT}.`);
  }

  const records = buildRecordGraph(run, implementation, sourceIdentity, conformanceRecord);
  const allowed = VIEW_TYPES[view];
  const viewNodes = records.nodes.filter((node) => allowed.has(node.type));
  const viewIds = new Set(viewNodes.map((node) => node.id));
  const viewEdges = records.edges.filter((edge) => viewIds.has(edge.source) && viewIds.has(edge.target));
  const recordSetDigest = digest({
    invocation: ADLC_OBSERVABILITY_INVOCATION,
    implementationRun: implementation, source: sourceIdentity, conformance: conformanceRecord,
    lifecycleStatus: records.lifecycle, nodes: records.nodes, edges: records.edges,
  });
  const projectionDigest = digest({
    recordSetDigest, view, nodes: viewNodes, edges: viewEdges,
  });
  const offset = decodeCursor(cursor, projectionDigest, view, viewNodes.length);
  const pageGraph = pagedGraph(viewNodes, viewEdges, offset, limit);
  const pageDigest = digest({
    projectionDigest, offset, limit, nodes: pageGraph.nodes, edges: pageGraph.edges,
  });
  const nextOffset = offset + pageGraph.primaryCount;
  const nextCursor = nextOffset < viewNodes.length
    ? encodeCursor(projectionDigest, view, nextOffset) : null;
  const metadata = {
    schema: ADLC_CANVAS_PROJECTION_SCHEMA,
    invocation: ADLC_OBSERVABILITY_INVOCATION, runId: run.runId,
    view, recordSetDigest, projectionDigest, status: records.lifecycle,
  };
  const graphData = {
    type: "Graph", context: "adlc-observability", metadata,
    nodes: pageGraph.nodes, edges: pageGraph.edges,
  };
  for (const item of [...graphData.nodes, ...graphData.edges]) {
    assertBoundedJson(item.properties);
  }
  const agenticOsMarkdown = serializeAgenticOsMarkdown(graphData, metadata);
  if (graphData.nodes.length > 400 || graphData.edges.length > 1_200
    || agenticOsMarkdown.length > 2_000_000
    || graphData.nodes.some((node) => node.id.length > 4_096 || node.label.length > 4_096)
    || graphData.edges.some((edge) => edge.id.length > 4_096
      || edge.source.length > 4_096 || edge.target.length > 4_096)) {
    fail("projection_too_large", "Projection exceeds the closed MCP output bound.");
  }
  return {
    schema: ADLC_CANVAS_PROJECTION_SCHEMA,
    projectionDigest, pageDigest, view, ordering: "type_rank_then_id",
    page: {
      cursor, nextCursor, offset, limit, count: pageGraph.primaryCount,
      total: viewNodes.length, stubCount: pageGraph.stubCount,
      truncated: nextCursor !== null,
    },
    graphData,
    agenticOsMarkdown,
  };
}
