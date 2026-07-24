const closed = (required, properties) => ({
  type: "object",
  additionalProperties: false,
  required,
  properties,
});

export function buildAgentTeamToolOutputSchemas({
  resultSchema,
  bounds,
  controlActions,
  patterns,
  boundsSchema,
  workflowSchema,
  sourceIdentitySchema,
}) {
  const { id, revision, sha, digest, runId, planId } = patterns;
  const usage = closed(
    ["turns", "inputTokens", "outputTokens", "totalTokens", "costUsd", "costStatus"],
    {
      turns: { type: "integer", minimum: 0 },
      inputTokens: { type: "integer", minimum: 0 },
      outputTokens: { type: "integer", minimum: 0 },
      totalTokens: { type: "integer", minimum: 0 },
      costUsd: { type: ["number", "null"], minimum: 0 },
      costStatus: { enum: ["reported", "unreported"] },
    },
  );
  const error = closed(["code", "message"], {
    code: { type: "string", minLength: 1, maxLength: 120 },
    message: { type: "string", minLength: 1, maxLength: 2_000 },
    details: {
      type: "array",
      maxItems: 64,
      items: closed(["path", "reason"], {
        path: { type: "string", maxLength: 4_096 },
        reason: { type: "string", maxLength: 2_000 },
      }),
    },
  });
  const evidence = closed(["kind"], {
    kind: { type: "string", minLength: 1, maxLength: 120 },
    token: { type: "string", maxLength: 200 },
    sourceRevision: { type: "string", pattern: sha },
    sourcePath: { type: "string", maxLength: 4_096 },
    uri: { type: "string", maxLength: 4_096 },
    digest: { type: "string", pattern: digest },
    local: { type: "boolean" },
    status: { type: "string", maxLength: 40 },
    participantCount: { type: "integer", minimum: 0, maximum: 16 },
    workflowId: { type: "string", pattern: id },
    workflowRevision: { type: "string", pattern: revision },
    branchCount: { type: "integer", minimum: 0, maximum: bounds.maxTurns },
    policyId: { type: "string", pattern: id },
    policyRevision: { type: "string", pattern: revision },
    sequence: { type: "integer", minimum: 1, maximum: 64 },
    type: { type: "string", minLength: 1, maxLength: 120 },
    at: { type: "string", minLength: 1, maxLength: 80 },
    branchId: { type: "string", pattern: id },
    participantId: { type: "string", pattern: id },
    resultStateVersion: { type: "integer", minimum: 1, maximum: 64 },
    action: { enum: controlActions },
    authorizationDigest: { type: "string", pattern: digest },
    decision: { enum: ["approve", "revise", "reject"] },
  });
  const policy = closed(["policyId", "policyRevision"], {
    policyId: { type: "string", pattern: id },
    policyRevision: { type: "string", pattern: revision },
  });
  const review = closed([
    "status", "policyId", "policyRevision", "question", "allowedDecisions",
    "evidenceReferences", "receiptId", "decision", "verificationDigest",
  ], {
    status: { enum: ["not_requested", "pending", "recorded"] },
    ...policy.properties,
    question: { type: ["string", "null"], maxLength: 2_000 },
    allowedDecisions: {
      type: "array",
      maxItems: 3,
      uniqueItems: true,
      items: { enum: ["approve", "revise", "reject"] },
    },
    evidenceReferences: {
      type: "array",
      maxItems: 16,
      items: closed(["kind"], {
        kind: { enum: ["plan_digest", "checkpoint", "branch"] },
        digest: { type: "string", pattern: digest },
        checkpointId: { type: "string", pattern: "^atc_[0-9a-f]{24}$" },
        branchId: { type: "string", pattern: id },
      }),
    },
    receiptId: { type: ["string", "null"], maxLength: 200 },
    decision: { enum: [null, "approve", "revise", "reject"] },
    verificationDigest: { type: ["string", "null"], pattern: digest },
  });
  const envelope = closed(
    ["inputTokens", "outputTokens", "totalTokens", "costUsd", "timeMs", "costStatus"],
    {
      inputTokens: { type: "integer", minimum: 0 },
      outputTokens: { type: "integer", minimum: 0 },
      totalTokens: { type: "integer", minimum: 0 },
      costUsd: { type: "number", minimum: 0 },
      timeMs: { type: "integer", minimum: 1 },
      costStatus: { const: "reported" },
    },
  );
  const settlement = {
    anyOf: [
      { type: "null" },
      closed([
        "branchId", "mode", "sourceParticipantId", "targetParticipantId",
        "delegationDepth", "fanout", "effectId", "attempt", "adapterId",
        "adapterRevision", "settlementReceiptDigest", "synthesisReceiptDigest",
        "outputAcceptanceReceiptDigest", "inputDigest", "admittedEnvelope", "usage",
      ], {
        branchId: { type: "string", pattern: id },
        mode: { enum: ["delegate", "handoff"] },
        sourceParticipantId: { type: "string", pattern: id },
        targetParticipantId: { type: "string", pattern: id },
        delegationDepth: { type: "integer", minimum: 0, maximum: bounds.maxDelegationDepth },
        fanout: { type: "integer", minimum: 1, maximum: bounds.maxFanout },
        effectId: { type: "string", pattern: "^ate_[0-9a-f]{24}$" },
        attempt: { type: "integer", minimum: 1 },
        adapterId: { type: "string", minLength: 1, maxLength: 200 },
        adapterRevision: { type: "string", pattern: revision },
        settlementReceiptDigest: { type: "string", pattern: digest },
        synthesisReceiptDigest: { type: ["string", "null"], pattern: digest },
        outputAcceptanceReceiptDigest: { type: "string", pattern: digest },
        inputDigest: { type: "string", pattern: digest },
        admittedEnvelope: envelope,
        usage: envelope,
      }),
    ],
  };
  const runResultRequired = [
    "checkpointId", "transitionSequence", "currentBranchId",
    "currentConversationOwnerParticipantId", "finalAnswerOwnerParticipantId",
    "completedBranchIds", "review",
  ];
  const runResultProperties = {
    checkpointId: { type: "string", pattern: "^atc_[0-9a-f]{24}$" },
    transitionSequence: { type: "integer", minimum: 1, maximum: 64 },
    currentBranchId: { type: ["string", "null"], pattern: id },
    currentConversationOwnerParticipantId: { type: "string", pattern: id },
    finalAnswerOwnerParticipantId: { type: "string", pattern: id },
    completedBranchIds: {
      type: "array",
      maxItems: bounds.maxTurns,
      uniqueItems: true,
      items: { type: "string", pattern: id },
    },
    lastSettlement: settlement,
    maxDelegationDepthObserved: { type: "integer", minimum: 0, maximum: bounds.maxDelegationDepth },
    maxFanoutObserved: { type: "integer", minimum: 0, maximum: bounds.maxFanout },
    review,
  };
  const startRunResult = closed(runResultRequired, {
    ...runResultProperties,
    finalAnswer: { type: "string", minLength: 1, maxLength: 200_000 },
  });
  const controlRunResult = closed(runResultRequired, runResultProperties);
  const planResult = closed([
    "planId", "planDigest", "state", "stateVersion", "sourceRevision", "source",
    "participants", "workflow", "reviewPolicy", "resolvedReferences", "owners",
    "effectiveBounds", "requestedTaskDigest",
  ], {
    planId: { type: "string", pattern: planId },
    planDigest: { type: "string", pattern: digest },
    state: { const: "planned" },
    stateVersion: { const: 1 },
    sourceRevision: { type: "string", pattern: sha },
    source: sourceIdentitySchema,
    participants: {
      type: "array",
      minItems: 2,
      maxItems: 16,
      items: closed(["participantId", "agentId", "agentRevision", "role", "personaAuthority"], {
        participantId: { type: "string", pattern: id },
        agentId: { type: "string", pattern: id },
        agentRevision: { type: "string", pattern: revision },
        role: { type: "string", minLength: 1, maxLength: 160 },
        personaAuthority: { const: false },
      }),
    },
    workflow: workflowSchema,
    reviewPolicy: policy,
    resolvedReferences: closed(["participants", "workflow", "reviewPolicy"], {
      participants: {
        type: "array",
        minItems: 2,
        maxItems: 16,
        items: closed(["participantId", "agentId", "agentRevision"], {
          participantId: { type: "string", pattern: id },
          agentId: { type: "string", pattern: id },
          agentRevision: { type: "string", pattern: revision },
        }),
      },
      workflow: closed(["workflowId", "workflowRevision", "branches"], {
        workflowId: { type: "string", pattern: id },
        workflowRevision: { type: "string", pattern: revision },
        branches: {
          type: "array",
          minItems: 1,
          maxItems: bounds.maxTurns,
          items: closed(["branchId", "mode", "sourceParticipantId", "targetParticipantId"], {
            branchId: { type: "string", pattern: id },
            mode: { enum: ["delegate", "handoff"] },
            sourceParticipantId: { type: "string", pattern: id },
            targetParticipantId: { type: "string", pattern: id },
          }),
        },
      }),
      reviewPolicy: policy,
    }),
    owners: closed([
      "initialConversationOwnerParticipantId",
      "initialFinalAnswerOwnerParticipantId",
      "finalOwnershipSource",
    ], {
      initialConversationOwnerParticipantId: { type: "string", pattern: id },
      initialFinalAnswerOwnerParticipantId: { type: "string", pattern: id },
      finalOwnershipSource: { const: "agent-orchestration-branch-result" },
    }),
    effectiveBounds: boundsSchema,
    requestedTaskDigest: { type: "string", pattern: digest },
  });
  const runSummaryRequired = [
    "runId", "teamId", "teamRevision", "state", "stateVersion", "checkpointId",
    "planDigest", "currentBranchId", "currentConversationOwnerParticipantId",
    "finalAnswerOwnerParticipantId", "completedBranchCount", "totalBranchCount",
    "lastSettlement", "maxDelegationDepthObserved", "maxFanoutObserved", "usage",
    "review", "updatedAt", "error",
  ];
  const runSummaryProperties = {
    runId: { type: "string", pattern: runId },
    teamId: { type: "string", pattern: id },
    teamRevision: { type: "string", pattern: revision },
    state: { enum: ["queued", "running", "review_pending", "paused", "blocked", "failed", "completed", "canceled"] },
    stateVersion: { type: "integer", minimum: 1, maximum: 64 },
    checkpointId: { type: "string", pattern: "^atc_[0-9a-f]{24}$" },
    planDigest: { type: "string", pattern: digest },
    currentBranchId: { type: ["string", "null"], pattern: id },
    currentConversationOwnerParticipantId: { type: "string", pattern: id },
    finalAnswerOwnerParticipantId: { type: "string", pattern: id },
    completedBranchCount: { type: "integer", minimum: 0, maximum: bounds.maxTurns },
    totalBranchCount: { type: "integer", minimum: 1, maximum: bounds.maxTurns },
    lastSettlement: settlement,
    maxDelegationDepthObserved: { type: "integer", minimum: 0, maximum: bounds.maxDelegationDepth },
    maxFanoutObserved: { type: "integer", minimum: 0, maximum: bounds.maxFanout },
    usage,
    review,
    updatedAt: { type: "string", minLength: 1, maxLength: 80 },
    error: { anyOf: [{ type: "null" }, error] },
  };
  const broadRunSummary = closed(runSummaryRequired, runSummaryProperties);
  const exactRunSummary = closed(runSummaryRequired, {
    ...runSummaryProperties,
    finalAnswer: { type: "string", minLength: 1, maxLength: 200_000 },
  });
  exactRunSummary.allOf = [{
    if: { properties: { state: { const: "completed" } }, required: ["state"] },
    then: { required: ["finalAnswer"] },
    else: { not: { required: ["finalAnswer"] } },
  }];
  const broadListResult = closed(["runs"], {
    runs: { type: "array", maxItems: 200, items: broadRunSummary },
  });
  const exactListResult = closed(["runs"], {
    runs: { type: "array", minItems: 1, maxItems: 1, items: exactRunSummary },
  });
  const variant = (operation, operationResult, constraints = []) => ({
    type: "object",
    additionalProperties: false,
    required: [
      "schema", "ok", "operation", "teamId", "teamRevision", "runId",
      "state", "stateVersion", "planDigest", "evidence", "usage",
    ],
    properties: {
      schema: { const: resultSchema },
      ok: { type: "boolean" },
      operation: { const: operation },
      teamId: { type: ["string", "null"], pattern: id },
      teamRevision: { type: ["string", "null"], pattern: revision },
      runId: { type: ["string", "null"], pattern: runId },
      state: { enum: [null, "planned", "queued", "running", "review_pending", "paused", "blocked", "failed", "completed", "canceled"] },
      stateVersion: { type: ["integer", "null"], minimum: 1, maximum: 64 },
      planDigest: { type: ["string", "null"], pattern: digest },
      evidence: { type: "array", maxItems: 64, items: evidence },
      usage,
      result: operationResult,
      error,
    },
    allOf: [{
      if: { required: ["ok"], properties: { ok: { const: true } } },
      then: { required: ["result"], not: { required: ["error"] } },
      else: { required: ["error"] },
    }, ...constraints],
  });
  const planOutput = variant("plan", planResult);
  const startOutput = variant("start", startRunResult, [{
    if: { properties: { state: { const: "completed" } }, required: ["state"] },
    then: { properties: { result: { required: ["finalAnswer"] } } },
    else: { properties: { result: { not: { required: ["finalAnswer"] } } } },
  }]);
  const listOutput = variant("list", { anyOf: [broadListResult, exactListResult] }, [{
    if: { properties: { runId: { type: "string" } }, required: ["runId"] },
    then: { properties: { result: exactListResult } },
    else: {
      properties: {
        teamId: { type: "null" },
        teamRevision: { type: "null" },
        runId: { type: "null" },
        state: { type: "null" },
        stateVersion: { type: "null" },
        planDigest: { type: "null" },
        result: broadListResult,
      },
    },
  }]);
  const controlOutput = variant("control", controlRunResult);
  return Object.freeze({
    plan: planOutput,
    start: startOutput,
    list: listOutput,
    control: controlOutput,
    all: {
    type: "object",
      oneOf: [planOutput, startOutput, listOutput, controlOutput],
    },
  });
}
