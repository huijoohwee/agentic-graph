// Director orchestration lane builders (SSOT).
//
// Previously exported as part of `agentic-canvas-os-lanes.js` under the
// now-removed agentic-canvas-os product name. The four pure builder functions
// exported here are the only parts of that module still in use: they are wired
// by `mcp/director-workflow.js` to produce the Director planning descriptor.
// Platform target is Cloudflare-only; no AWS/Vercel/Exa identifiers remain.

function cleanString(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function buildPlanner({ goal, repoProfile, budgets }) {
  const tasks = [
    { id: "profile", title: "Profile source repo", status: repoProfile.exists ? "complete" : "blocked" },
    { id: "plan", title: "Create bounded build plan", status: "dry_run_ready" },
    { id: "market-radar", title: "Prepare source-backed market validation", status: "dry_run_ready" },
    { id: "artifact-pipeline", title: "Map validated claims to artifacts", status: "dry_run_ready" },
    { id: "starter-repo", title: "Prepare secured full-stack starter blueprint", status: "dry_run_ready" },
    { id: "demo-pack", title: "Generate judging pack checklist", status: "dry_run_ready" },
  ];
  return {
    goal,
    tasks,
    dependencies: [
      { from: "profile", to: "plan" },
      { from: "market-radar", to: "artifact-pipeline" },
      { from: "plan", to: "starter-repo" },
      { from: "plan", to: "demo-pack" },
    ],
    maxIterations: budgets.maxIterations,
    stopConditions: ["blocked", "approval_required", "budget_exceeded", "verification_failed", "max_iterations"],
  };
}

function buildToolCalls({ lanes, args }) {
  const toolCalls = [
    { toolName: "agenticgraph.video_remix.run", adapter: "local-mcp", mode: "dry-run", status: "complete", attempt: 1 },
    { toolName: "agenticgraph.superagent.run", adapter: "local-superagent", mode: "dry-run", status: "approval_required", attempt: 0 },
  ];
  if (lanes.includes("market_radar")) {
    toolCalls.push({ toolName: "search.query", adapter: "evidence-adapter", mode: "dry-run", status: "approval_required", attempt: 0 });
  }
  if (lanes.includes("browser_evidence")) {
    toolCalls.push({ toolName: "browser.capture", adapter: "local-browser", mode: "dry-run", status: "approval_required", attempt: 0 });
  }
  if (args.failOnceTool) {
    toolCalls.push({ toolName: cleanString(args.failOnceTool), adapter: "failure-injection", mode: "dry-run", status: "failed_once_injected", attempt: 1 });
  }
  return toolCalls;
}

function buildApprovalGates({ artifactPaths }) {
  return [
    { id: "consumer-repo-write", actionKind: "file_write", risk: "consumer repo mutation", dryRunArtifact: artifactPaths[1], approvalState: "required" },
    { id: "cloud-deploy", actionKind: "deploy", risk: "cloud resource mutation or spend", dryRunArtifact: artifactPaths[1], approvalState: "required" },
    { id: "paid-model-call", actionKind: "paid_call", risk: "token or API spend", dryRunArtifact: artifactPaths[1], approvalState: "required" },
    { id: "payment-action", actionKind: "payment", risk: "Stripe product, price, session, refund, or payout mutation", dryRunArtifact: artifactPaths[1], approvalState: "required" },
    { id: "authenticated-browser", actionKind: "browser_auth", risk: "authenticated page inspection", dryRunArtifact: artifactPaths[1], approvalState: "required" },
  ];
}

function buildFailureHandling(args) {
  const injectedTool = cleanString(args.failOnceTool);
  return {
    failures: injectedTool ? [{
      failureKind: "injected_tool_failure",
      message: `${injectedTool} failed once in dry-run failure handling test`,
      retryCount: 1,
      resolution: "retry bounded, then fail closed if repeated",
    }] : [],
    policy: "retry under maxIterations, then fail closed by moving to blocked with evidence",
  };
}

export { buildPlanner, buildToolCalls, buildApprovalGates, buildFailureHandling };
