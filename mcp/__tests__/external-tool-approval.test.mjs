import assert from "node:assert/strict";
import test from "node:test";

import {
  EXTERNAL_FILE_WRITE_GATE_ID,
  ExternalToolApprovalError,
  authorizeExternalToolAction,
  computeExternalToolActionDigest,
  createExternalToolApprovalToken,
} from "../external-tool-approval.js";

const SECRET = "test-only-external-mcp-approval-secret-32chars";
const NOW = 1_800_000_000_000;
const ACTION = Object.freeze({
  capabilityId: "agenticOsap_11111111111111111111111111111111",
  capabilityRevision: "2".repeat(64),
  artifact: {
    title: "Quarterly plan",
    content: "# Slide 1\n\n---\n\n# Slide 2",
    contentType: "text/markdown",
  },
  idempotencyKey: "deck-run-0001",
});

test("approval token is digest-bound, signed, expiring, and single-use", () => {
  const actionDigest = computeExternalToolActionDigest(ACTION);
  const token = createExternalToolApprovalToken({ ...ACTION, secret: SECRET, now: NOW, tokenId: "approval-token-0001" });
  assert.equal(token.gateId, EXTERNAL_FILE_WRITE_GATE_ID);
  assert.equal(token.actionDigest, actionDigest);
  assert.match(token.signature, /^[0-9a-f]{64}$/);

  const consumedTokenIds = new Set();
  const authorization = authorizeExternalToolAction({
    token,
    secret: SECRET,
    actionDigest,
    consumedTokenIds,
    now: NOW + 1,
  });
  assert.equal(authorization.ok, true);
  assert.equal(consumedTokenIds.has(token.tokenId), true);
  assert.throws(
    () => authorizeExternalToolAction({ token, secret: SECRET, actionDigest, consumedTokenIds, now: NOW + 2 }),
    (error) => error instanceof ExternalToolApprovalError && error.code === "approval_consumed",
  );
});

test("approval token cannot authorize changed artifact arguments or idempotency", () => {
  const originalDigest = computeExternalToolActionDigest(ACTION);
  const token = createExternalToolApprovalToken({ actionDigest: originalDigest, secret: SECRET, now: NOW, tokenId: "approval-token-0002" });
  const changedDigest = computeExternalToolActionDigest({
    ...ACTION,
    artifact: { ...ACTION.artifact, title: "Changed title" },
  });
  assert.throws(
    () => authorizeExternalToolAction({ token, secret: SECRET, actionDigest: changedDigest, consumedTokenIds: new Set(), now: NOW }),
    (error) => error instanceof ExternalToolApprovalError && error.code === "approval_digest_mismatch",
  );
  assert.equal(token.actionDigest, originalDigest);
});

test("approval verification rejects wrong signatures, expiry, and missing host secret", () => {
  const actionDigest = computeExternalToolActionDigest(ACTION);
  const token = createExternalToolApprovalToken({ actionDigest, secret: SECRET, now: NOW, ttlMs: 1_000, tokenId: "approval-token-0003" });
  assert.throws(
    () => authorizeExternalToolAction({ token: { ...token, signature: "0".repeat(64) }, secret: SECRET, actionDigest, consumedTokenIds: new Set(), now: NOW }),
    (error) => error.code === "approval_invalid_signature",
  );
  assert.throws(
    () => authorizeExternalToolAction({ token, secret: SECRET, actionDigest, consumedTokenIds: new Set(), now: NOW + 1_001 }),
    (error) => error.code === "approval_expired",
  );
  assert.throws(
    () => authorizeExternalToolAction({ token, secret: "", actionDigest, consumedTokenIds: new Set(), now: NOW }),
    (error) => error.code === "approval_not_configured",
  );
});
