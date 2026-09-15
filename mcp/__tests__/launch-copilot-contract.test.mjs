import test from "node:test";
import assert from "node:assert/strict";
import { buildLaunchCopilotPrompt, createLaunchOutline, serializeLaunchDocuments, validateLaunchProposal } from "../agent-graph/launch-copilot-contract.js";

const evidence = { cid: "first-sale", revision: "0.3.0", graphId: `kg:graph:${"a".repeat(32)}`, snapshotDigest: "b".repeat(64), parserRegistryDigest: "c".repeat(64), requirement: "Sell one reviewed agent service", sourceRole: "owned", nodes: [{ id: "checkout", label: "checkout.ts" }], edges: [], complete: true, truncated: false };
test("one bounded prompt and exactly five joined files; outline makes no drafting claim", () => {
  const outline = createLaunchOutline(evidence);
  assert.match(buildLaunchCopilotPrompt(evidence), /untrusted data/);
  const files = serializeLaunchDocuments(outline, evidence);
  assert.deepEqual(files.map(file => file.path), ["prd", "tad", "adr", "mvp", "gtm"].map(role => `docs/proposals/first-sale/${role}.md`));
  assert.ok(files.every(file => file.text.includes("not AI drafted") && file.text.includes("revision: 0.3.0")));
});
test("reject forged joins, missing roles, invented IDs, reference laundering and incomplete NEW work", () => {
  const mutate = change => { const proposal = createLaunchOutline(evidence); change(proposal); return proposal; };
  for (const change of [p => { p.snapshotDigest = "d".repeat(64); }, p => p.documents.pop(), p => { p.documents[0].claims[0] = { text: "Existing checkout", nodeIds: ["invented"] }; }, p => { p.documents[0].claims[0].newWork.check = ""; }]) {
    assert.throws(() => validateLaunchProposal(mutate(change), evidence));
  }
  const owned = mutate(p => { p.documents[1].claims[0] = { text: "Review checkout", nodeIds: ["checkout"] }; });
  assert.equal(validateLaunchProposal(owned, evidence), owned);
  assert.throws(() => validateLaunchProposal(owned, { ...evidence, sourceRole: "reference" }), /reference-only/);
  assert.throws(() => buildLaunchCopilotPrompt({ ...evidence, nodes: [{ id: "checkout", label: "x".repeat(9000) }] }), /budget/);
});
