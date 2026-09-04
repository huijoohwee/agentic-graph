import assert from "node:assert/strict";
import test from "node:test";

import { digestJson } from "../adlc-observability-json.js";
import { projectAdlcCanvas } from "../adlc-observability-projection.js";

const receipt = (evidence) => ({ ...evidence, receiptDigest: digestJson(evidence) });

function deployedReceipts({
  interactionActor = "human:test",
  authorizationActor = interactionActor,
  interactionRecordedAt = "2026-07-29T01:00:30.000Z",
  authorizationIssuedAt = "2026-07-29T01:01:00.000Z",
} = {}) {
  const candidate = receipt({
    schema: "agentic-candidate-manifest/v1",
    status: "awaiting-human-authorization",
    runtimeReviewReceiptDigest: "1".repeat(64),
    sourceDigest: "2".repeat(64),
    dependencyClosureDigest: "3".repeat(64),
    policyDigest: "4".repeat(64),
    targetDigest: "5".repeat(64),
    artifactDigest: "6".repeat(64),
    manifestDigest: "7".repeat(64),
    rollbackTargetDigest: "8".repeat(64),
    builtAt: "2026-07-29T01:00:00.000Z",
  });
  const interaction = receipt({
    schema: "agentic-authorization-interaction-receipt/v1",
    status: "observed",
    candidateDigest: candidate.receiptDigest,
    targetDigest: candidate.targetDigest,
    humanActorId: interactionActor,
    interactionAdapterId: "interaction:test",
    transportClass: "interactive-reference-transport",
    browserRequired: false,
    challengeDigest: "9".repeat(64),
    responseDigest: "a".repeat(64),
    recordedAt: interactionRecordedAt,
  });
  const authorized = receipt({
    schema: "agentic-human-authorization-receipt/v2",
    status: "authorized",
    candidateDigest: candidate.receiptDigest,
    targetDigest: candidate.targetDigest,
    releaseKey: digestJson({
      targetDigest: candidate.targetDigest,
      candidateDigest: candidate.receiptDigest,
    }),
    decisionKind: "human",
    humanActorId: authorizationActor,
    decisionRef: "decision:test",
    authorityAdapterId: "adapter:test",
    interactionReceiptDigest: interaction.receiptDigest,
    issuedAt: authorizationIssuedAt,
    expiresAt: "2026-07-29T02:01:00.000Z",
    consumedAt: null,
  });
  const { receiptDigest: authorizationReceiptDigest, ...authorizationFields } = authorized;
  const authorization = receipt({
    ...authorizationFields,
    status: "consumed",
    consumedAt: "2026-07-29T01:02:00.000Z",
    controllerId: "controller:test",
    authorizationReceiptDigest,
  });
  const live = receipt({
    schema: "agentic-live-verification-receipt/v1",
    status: "verified",
    authorizationReceiptDigest: authorization.receiptDigest,
    candidateDigest: candidate.receiptDigest,
    targetDigest: candidate.targetDigest,
    controllerId: authorization.controllerId,
    deployedArtifactDigest: candidate.artifactDigest,
    observedRuntimeDigest: "a".repeat(64),
    probesDigest: "b".repeat(64),
    rollbackTargetDigest: candidate.rollbackTargetDigest,
    verifiedAt: "2026-07-29T01:03:00.000Z",
  });
  return { candidate, interaction, authorized, authorization, live };
}

const input = (receipts) => ({
  normalizedRun: {
    schema: "agentic-sdlc-run/v1",
    runId: "release-run",
    tasks: [],
    releaseLifecycle: { receipts },
  },
  implementationRun: {
    runId: "ir_111111111111111111111111",
    revision: 7,
    ledgerDigest: "e".repeat(64),
  },
  source: { ledgerDigest: "e".repeat(64) },
  conformance: { runtimeReady: false, metrics: {} },
  view: "receipts",
});

test("deployed requires an exact candidate, interaction, human authorization, and live join", () => {
  const joined = deployedReceipts();
  const projection = projectAdlcCanvas(input(Object.values(joined)));
  assert.equal(projection.graphData.metadata.status.deployed, true);
  const receipts = projection.graphData.nodes.filter((node) => node.type === "receipt");
  const bySource = (schema, status) => receipts.find((node) =>
    node.properties.source.schema === schema && node.properties.source.status === status);
  const candidateNode = bySource("agentic-candidate-manifest/v1", "awaiting-human-authorization");
  const interactionNode = bySource("agentic-authorization-interaction-receipt/v1", "observed");
  const authorizationNode = bySource("agentic-human-authorization-receipt/v2", "consumed");
  const liveNode = bySource("agentic-live-verification-receipt/v1", "verified");
  assert.equal(receipts.filter((node) =>
    node.properties.source.schema === "agentic-human-authorization-receipt/v2").length, 2);
  assert.ok(projection.graphData.edges.some((edge) =>
    edge.type === "gatedBy"
    && edge.source === candidateNode.id && edge.target === authorizationNode.id));
  assert.ok(projection.graphData.edges.some((edge) =>
    edge.type === "transitionsTo"
    && edge.source === candidateNode.id && edge.target === interactionNode.id));
  assert.ok(projection.graphData.edges.some((edge) =>
    edge.type === "gatedBy"
    && edge.source === interactionNode.id && edge.target === authorizationNode.id));
  assert.ok(projection.graphData.edges.some((edge) =>
    edge.type === "transitionsTo"
    && edge.source === authorizationNode.id && edge.target === liveNode.id));
  assert.equal(
    projectAdlcCanvas(input([joined.candidate, joined.authorization, joined.live]))
      .graphData.metadata.status.deployed,
    false,
  );
  const drifted = deployedReceipts();
  drifted.live.targetDigest = "f".repeat(64);
  assert.equal(
    projectAdlcCanvas(input(Object.values(drifted)))
      .graphData.metadata.status.deployed,
    false,
  );
  const detached = deployedReceipts();
  detached.authorization.interactionReceiptDigest = "0".repeat(64);
  assert.equal(
    projectAdlcCanvas(input(Object.values(detached)))
      .graphData.metadata.status.deployed,
    false,
  );
  for (const unjoined of [
    deployedReceipts({ authorizationActor: "human:other" }),
    deployedReceipts({
      interactionRecordedAt: "2026-07-29T01:01:30.000Z",
      authorizationIssuedAt: "2026-07-29T01:01:00.000Z",
    }),
  ]) {
    assert.equal(
      projectAdlcCanvas(input(Object.values(unjoined)))
        .graphData.metadata.status.deployed,
      false,
    );
  }
});

test("unrelated record insertion does not churn source-backed Canvas node IDs", () => {
  const baseRun = {
    schema: "agentic-sdlc-run/v1",
    runId: "stable-identities",
    tasks: [{
      id: "1",
      state: "verified",
      transitions: [{
        taskId: "1", ordinal: 1, to: "verified",
        role: "evaluator", mechanismId: "evaluator",
      }],
    }],
    evidenceReferences: [{
      id: "evidence:1", taskId: "1", namedCheck: "check",
      checkRunId: "check:1", checkRanInTask: true,
      recordedResult: { status: "passed" },
    }],
    priorFindings: [{
      findingType: "finding:1", artifactReference: "artifact:1",
      guidelineAnchor: "guide:1", evidenceExcerpt: "evidence:1", severity: "minor",
    }],
    humanGateEvents: [{ id: "gate:1", taskId: "1", resolution: "approved" }],
    persistedTerminals: [{
      taskId: "1", transitionOrdinal: 1, state: "verified",
      checkpointDigest: "1".repeat(64),
    }],
    recoveryEvents: [{ id: "recovery:1", taskId: "1", resumed: true }],
    releaseLifecycle: { receipts: Object.values(deployedReceipts()) },
  };
  const observe = (run) => projectAdlcCanvas({
    ...input(run.releaseLifecycle.receipts), normalizedRun: run, view: "full",
  }).graphData.nodes;
  const original = observe(baseRun);
  const expanded = structuredClone(baseRun);
  expanded.tasks[0].transitions.push({
    taskId: "1", ordinal: 2, from: "verified", to: "verified",
    role: "evaluator", mechanismId: "evaluator:2",
  });
  expanded.evidenceReferences.push({
    id: "evidence:2", taskId: "1", namedCheck: "check:2",
    checkRunId: "check:2", checkRanInTask: true, recordedResult: { status: "passed" },
  });
  expanded.priorFindings.push({
    findingType: "finding:0", artifactReference: "artifact:0",
    guidelineAnchor: "guide:0", evidenceExcerpt: "evidence:0", severity: "minor",
  });
  expanded.humanGateEvents.push({ id: "gate:0", taskId: "1", resolution: "approved" });
  expanded.persistedTerminals.push({
    taskId: "1", transitionOrdinal: 2, state: "verified",
    checkpointDigest: "0".repeat(64),
  });
  expanded.recoveryEvents.push({ id: "recovery:0", taskId: "1", resumed: true });
  expanded.releaseLifecycle.receipts.push({
    ...deployedReceipts().authorized, receiptDigest: "f".repeat(64),
  });
  const next = observe(expanded);
  for (const [type, sourceField, sourceValue] of [
    ["transition", "ordinal", 1],
    ["evidence", "id", "evidence:1"],
    ["finding", "findingType", "finding:1"],
    ["gate", "id", "gate:1"],
    ["checkpoint", "checkpointDigest", "1".repeat(64)],
    ["checkpoint", "id", "recovery:1"],
    ["receipt", "receiptDigest", deployedReceipts().candidate.receiptDigest],
  ]) {
    const find = (nodes) => nodes.find((node) =>
      node.type === type && node.properties.source?.[sourceField] === sourceValue);
    assert.equal(find(next).id, find(original).id, `${type}:${sourceField}`);
  }
});
