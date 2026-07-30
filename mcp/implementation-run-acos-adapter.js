import path from "node:path";

export const AGENTIC_DEVICE_RESULT_SCHEMA = "agentic-device-command-result/v1";
const ACTIONS = new Set(["start", "resume", "heartbeat", "review", "park"]);
const SHA = /^[a-f0-9]{40}$/;
const PARK_STASH_STATUSES = new Set(["pending", "restored"]);
const DEVICE_BRANCH =
  /^agent\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/;
const validPullRequestUrl = (value) => {
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
};

export function buildAgenticDeviceCommand({ scriptPath, action, positional = "", sessionId, repository, worktreePath = "", leaseTtlSeconds = 0, provision = true }) {
  if (!path.isAbsolute(scriptPath) || !ACTIONS.has(action) || !sessionId || !path.isAbsolute(repository)) throw new Error("Agentic device command identity is invalid.");
  const argv = [scriptPath, action];
  if (positional) argv.push(positional);
  argv.push(`--session=${sessionId}`, `--repository=${repository}`);
  if (action === "start") {
    if (!Number.isInteger(leaseTtlSeconds) || leaseTtlSeconds < 1 || (provision && !path.isAbsolute(worktreePath))) throw new Error("Agentic device start requires a positive lease TTL and an absolute provision target when provisioning.");
    if (provision) argv.push(`--worktree=${worktreePath}`, "--provision");
    argv.push(`--ttl-seconds=${leaseTtlSeconds}`);
  } else if (action === "heartbeat") {
    if (!Number.isInteger(leaseTtlSeconds) || leaseTtlSeconds < 1) throw new Error("Agentic device heartbeat requires a positive lease TTL.");
    argv.push(`--ttl-seconds=${leaseTtlSeconds}`);
  }
  argv.push("--json");
  return argv;
}

export function parseAgenticDeviceResult(stdout, { action, expectedStatus, sessionId, expectedProvisioned = action === "start" ? true : undefined }) {
  const source = String(stdout || "").trim();
  if (!source || source.includes("\n")) throw new Error(`ACOS ${action} must emit exactly one JSON object on stdout.`);
  let payload;
  try { payload = JSON.parse(source); } catch { throw new Error(`ACOS ${action} emitted invalid JSON.`); }
  if (!payload || payload.schema !== AGENTIC_DEVICE_RESULT_SCHEMA || payload.ok !== true || payload.action !== action || payload.status !== expectedStatus) throw new Error(`ACOS ${action} returned an invalid machine contract.`);
  if (!path.isAbsolute(payload.worktreePath || "") || !path.isAbsolute(payload.repoRoot || "") || path.resolve(payload.repoRoot) !== path.resolve(payload.worktreePath)) throw new Error(`ACOS ${action} omitted consistent absolute repository identity.`);
  if (action === "start" && payload.provisioned !== expectedProvisioned) throw new Error(`ACOS start did not prove the expected ${expectedProvisioned ? "atomic provisioning" : "existing-worktree reconciliation"} mode.`);
  const lease = payload.lease;
  if (!lease || lease.schema !== "agentic-writer-lease/v2" || lease.sessionId !== sessionId || lease.branch !== payload.branch || !path.isAbsolute(lease.worktreePath || "") || path.resolve(lease.worktreePath) !== path.resolve(payload.worktreePath) || !Number.isInteger(lease.epoch) || lease.epoch < 1 || !SHA.test(lease.baseSha || "") || !SHA.test(lease.fenceSha || "")) throw new Error(`ACOS ${action} omitted consistent token-bound lease identity.`);
  const branchIdentity = String(payload.branch || "").match(DEVICE_BRANCH);
  if (!branchIdentity || lease.device !== branchIdentity[1] || lease.scope !== branchIdentity[2]) throw new Error(`ACOS ${action} omitted consistent device and semantic-scope identity.`);
  if (!validPullRequestUrl(payload.pullRequest?.url) || !Number.isInteger(payload.pullRequest?.number) || payload.pullRequest.number < 1 || lease.pullRequestUrl !== payload.pullRequest.url) throw new Error(`ACOS ${action} omitted consistent pull-request ownership identity.`);
  const expectedDraft = action !== "review";
  if (payload.pullRequest.isDraft !== expectedDraft) throw new Error(`ACOS ${action} returned an invalid pull-request draft state.`);
  if (["start", "resume", "heartbeat"].includes(action) && (lease.status !== "active" || !payload.branch)) throw new Error(`ACOS ${action} omitted active lease identity.`);
  if (action === "review" && (lease.status !== "review_ready" || !payload.pullRequest?.url || !payload.branch)) throw new Error("ACOS review omitted review-ready pull-request identity.");
  if (action === "park") assertParkEvidence(payload, lease);
  return payload;
}

function assertParkEvidence(payload, lease) {
  const headFieldsValid = lease.status === "parked" && SHA.test(lease.parkHeadSha || "") && payload.headSha === lease.parkHeadSha && SHA.test(lease.parkBranchHeadSha || "") && lease.parkSourceEpoch === lease.epoch && lease.parkSourceFenceSha === lease.fenceSha;
  if (!headFieldsValid) throw new Error("ACOS park omitted exact parked head and source-fence evidence.");
  const stashFields = [lease.parkStashRef, lease.parkStashSha, lease.parkStashMessage, lease.parkStashStatus];
  const withoutStash = stashFields.every((value) => value === null);
  const expectedRef = `refs/agentic-canvas-os/parked/${lease.branch}/epoch-${lease.epoch}`;
  const expectedMessage = `park: ${lease.branch} epoch ${lease.epoch} fence ${lease.fenceSha}`;
  const withStash = lease.parkStashRef === expectedRef && SHA.test(lease.parkStashSha || "") && lease.parkStashMessage === expectedMessage && PARK_STASH_STATUSES.has(lease.parkStashStatus);
  if (!withoutStash && !withStash) throw new Error("ACOS park omitted internally consistent immutable stash evidence.");
  if (payload.stashRef !== lease.parkStashRef || payload.stashSha !== lease.parkStashSha || payload.stashStatus !== lease.parkStashStatus) throw new Error("ACOS park top-level stash evidence does not match its lease projection.");
}

export function parseAgenticDeviceFailure(stdout, action) {
  try {
    const payload = JSON.parse(String(stdout || "").trim());
    return payload?.schema === AGENTIC_DEVICE_RESULT_SCHEMA && payload.ok === false && payload.action === action && payload.status === "error"
      ? payload
      : null;
  } catch { return null; }
}
