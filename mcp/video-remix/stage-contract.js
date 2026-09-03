export const VIDEO_REMIX_STAGE_CONTRACT_VERSION = "agentic-graph.video_remix.stages/v1";

const stage = ({ id, gateId, spendBearing }) => Object.freeze({ id, gateId, spendBearing });

/**
 * Canonical runtime stage topology. Director ordering, gate maps, manifest
 * projection, and spend classification derive from this registry.
 */
export const VIDEO_REMIX_STAGES = Object.freeze([
  stage({ id: "research", gateId: "paid-model-call", spendBearing: true }),
  stage({ id: "storyboard", gateId: "paid-model-call", spendBearing: true }),
  stage({ id: "render", gateId: "render-action", spendBearing: true }),
  stage({ id: "edit", gateId: "edit-manifest-assembly", spendBearing: false }),
  stage({ id: "publish", gateId: "cloud-deploy", spendBearing: true }),
  stage({ id: "checkout", gateId: "payment-action", spendBearing: true }),
]);

export const VIDEO_REMIX_STAGE_ORDER = Object.freeze(VIDEO_REMIX_STAGES.map(({ id }) => id));

export const VIDEO_REMIX_STAGE_GATES = Object.freeze(
  Object.fromEntries(VIDEO_REMIX_STAGES.map(({ id, gateId }) => [id, gateId])),
);

export const VIDEO_REMIX_SPEND_BEARING_STAGES = Object.freeze(
  VIDEO_REMIX_STAGES.filter(({ spendBearing }) => spendBearing).map(({ id }) => id),
);
