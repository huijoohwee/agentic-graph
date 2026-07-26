import { createRunningAgentAdapterRegistry } from "../contracts/agent-model-runtime.js";
import {
  createLocalAgentTeamModelAdapter,
  LOCAL_AGENT_TEAM_ADAPTER_ID,
} from "./agent-team-local-model-adapter.js";
import { verifyLocalAgentTeamReferences } from "./agent-team-local-owner-registry.js";
import {
  authorizeLocalAgentTeamControl,
  LocalAgentTeamReviewStore,
} from "./agent-team-local-review-store.js";

export function createLocalAgentTeamHost({
  rootDir,
  env = process.env,
  fetchImpl = fetch,
  reviewStore = new LocalAgentTeamReviewStore({ rootDir }),
} = {}) {
  const adapter = createLocalAgentTeamModelAdapter({
    rootDir,
    env,
    fetchImpl,
  });
  const readiness = Object.freeze({
    schema: "knowgrph.agent-team-local-host-readiness/v1",
    referenceVerifier: "ready",
    controlAuthorizer: "ready",
    reviewReceiptVerifier: "ready",
    executionAdapter: adapter.configured ? "ready" : "configuration_required",
    adapterId: LOCAL_AGENT_TEAM_ADAPTER_ID,
    modelConfigured: adapter.readiness.modelConfigured,
    loopbackOnly: adapter.readiness.loopbackOnly,
    status: adapter.configured ? "runtime_ready" : "configuration_required",
  });
  return Object.freeze({
    readiness,
    options: Object.freeze({
      referenceVerifier: verifyLocalAgentTeamReferences,
      controlAuthorizer: authorizeLocalAgentTeamControl,
      reviewReceiptVerifier: (expected) => reviewStore.verify(expected),
      adapterRegistry: createRunningAgentAdapterRegistry([adapter]),
      defaultAdapterId: LOCAL_AGENT_TEAM_ADAPTER_ID,
    }),
  });
}
