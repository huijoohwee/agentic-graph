// Editing_Stage harness for the video-remix Director.
//
// This increment is intentionally manifest-only: it assembles and persists an
// Edit_Manifest reference without introducing a compositor, transcoder, or new
// datastore. The output can be consumed by a later renderer while current runs
// remain zero-spend and deterministic.

import { cleanString } from "./helpers.js";

export const EDIT_STAGE_ID = "edit";
export const EDIT_GATE_ID = "edit-manifest-assembly";

export class EditManifestValidationError extends Error {
  constructor(shotId, reason) {
    super(`Invalid Edit_Manifest trim for ${cleanString(shotId, "unknown_shot")}: ${reason}`);
    this.name = "EditManifestValidationError";
    this.code = "invalid_edit_manifest";
    this.shotId = cleanString(shotId, "unknown_shot");
    this.reason = cleanString(reason, "invalid_trim");
  }
}

function invalidTrim(shotId, reason) {
  return {
    valid: false,
    shotId: cleanString(shotId, "unknown_shot"),
    reason: cleanString(reason, "invalid_trim"),
  };
}

function normalizeDuration(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function assetKey(asset) {
  return cleanString(asset?.shotId || asset?.id);
}

function shotKey(shot) {
  return cleanString(shot?.shotId || shot?.id);
}

function buildAssetIndex(renderAssets) {
  const index = new Map();
  for (const asset of Array.isArray(renderAssets) ? renderAssets : []) {
    const shotId = assetKey(asset);
    if (shotId) index.set(shotId, asset);
  }
  return index;
}

function ownDurationMs(durations, shotId, fallback) {
  if (durations && typeof durations === "object" && Object.prototype.hasOwnProperty.call(durations, shotId)) {
    return durations[shotId];
  }
  return fallback;
}

export function buildEditManifest({ plannedShots, renderAssets, assetDurationsMs } = {}) {
  const assetIndex = buildAssetIndex(renderAssets);
  const durations = assetDurationsMs && typeof assetDurationsMs === "object" ? assetDurationsMs : {};
  const entries = [];

  for (const shot of Array.isArray(plannedShots) ? plannedShots : []) {
    const shotId = shotKey(shot);
    if (!shotId) continue;
    const asset = assetIndex.get(shotId);
    if (!asset) continue;
    const durationMs = normalizeDuration(ownDurationMs(durations, shotId, asset.durationMs));
    entries.push({
      shotId,
      assetUrl: cleanString(asset.durableR2Url || asset.assetUrl),
      objectKey: asset.objectKey ?? null,
      provider: asset.provider ?? null,
      trim: { startMs: 0, endMs: durationMs },
    });
  }

  return {
    schema: "agenticgraph.video_remix.edit_manifest/v1",
    gateId: EDIT_GATE_ID,
    stageId: EDIT_STAGE_ID,
    entries,
  };
}

export function validateEditManifestTrims(editManifest, assetDurationsMs = {}) {
  const entries = Array.isArray(editManifest?.entries) ? editManifest.entries : [];
  for (const entry of entries) {
    const shotId = cleanString(entry?.shotId, "unknown_shot");
    const durationMs = normalizeDuration(ownDurationMs(assetDurationsMs, shotId, entry?.trim?.endMs));
    const startMs = Number(entry?.trim?.startMs);
    const endMs = Number(entry?.trim?.endMs);

    if (!Number.isFinite(startMs) || startMs < 0) {
      return invalidTrim(shotId, "startMs_negative_or_invalid");
    }
    if (!Number.isFinite(endMs) || endMs <= startMs) {
      return invalidTrim(shotId, "endMs_must_exceed_startMs");
    }
    if (startMs > durationMs || endMs > durationMs) {
      return invalidTrim(shotId, "trim_exceeds_asset_duration");
    }
  }
  return { valid: true };
}

export function assertEditManifestTrims(editManifest, assetDurationsMs = {}) {
  const result = validateEditManifestTrims(editManifest, assetDurationsMs);
  if (!result.valid) {
    throw new EditManifestValidationError(result.shotId, result.reason);
  }
  return result;
}

export function composeEditedVideoReference({ runId, editManifest, mediaPersister } = {}) {
  if (!mediaPersister || typeof mediaPersister.persist !== "function") {
    throw new TypeError("composeEditedVideoReference: mediaPersister must implement { persist }");
  }
  const bytes = new TextEncoder().encode(JSON.stringify(editManifest));
  return mediaPersister.persist({
    runId: cleanString(runId, "video-remix-run"),
    stageId: EDIT_STAGE_ID,
    shotId: "manifest",
    ext: "json",
    bytes,
    contentType: "application/json",
  });
}

export async function runEditingHarness(input = {}, deps = {}) {
  const result = runEditingHarnessSync(input, { ...deps, sync: false });
  if (result.status !== "ready_to_persist") return result;

  try {
    const editedVideoReference = await Promise.resolve(result.persist());
    return {
      status: "complete",
      blocksPublish: false,
      manifest: result.manifest,
      editedVideoReference,
      persistCallCount: 1,
    };
  } catch (error) {
    return {
      status: "failed",
      blocksPublish: true,
      manifest: result.manifest,
      failure: { reason: cleanString(error?.message || error?.name, "edit_manifest_persist_failed") },
      persistCallCount: 1,
    };
  }
}

export function runEditingHarnessSync(input = {}, deps = {}) {
  const plannedShots = Array.isArray(input.plannedShots) ? input.plannedShots : [];
  const renderAssets = Array.isArray(input.renderAssets) ? input.renderAssets : [];
  const assetDurationsMs = input.assetDurationsMs && typeof input.assetDurationsMs === "object"
    ? input.assetDurationsMs
    : {};
  const manifest = buildEditManifest({ plannedShots, renderAssets, assetDurationsMs });

  if (manifest.entries.length === 0) {
    return { status: "skipped", skipReason: "no_completed_shot_assets", blocksPublish: true, manifest };
  }

  const validation = validateEditManifestTrims(manifest, assetDurationsMs);
  if (!validation.valid) {
    return {
      status: "rejected",
      blocksPublish: true,
      manifest,
      failure: { shotId: validation.shotId, reason: validation.reason },
    };
  }

  const persist = () => composeEditedVideoReference({
    runId: deps.runId,
    editManifest: manifest,
    mediaPersister: deps.mediaPersister,
  });

  if (deps.sync === false) {
    return { status: "ready_to_persist", blocksPublish: true, manifest, persist };
  }
  try {
    const editedVideoReference = persist();
    if (editedVideoReference && typeof editedVideoReference.then === "function") {
      return { status: "ready_to_persist", blocksPublish: true, manifest, persist };
    }
    return { status: "complete", blocksPublish: false, manifest, editedVideoReference, persistCallCount: 1 };
  } catch (error) {
    return {
      status: "failed",
      blocksPublish: true,
      manifest,
      failure: { reason: cleanString(error?.message || error?.name, "edit_manifest_persist_failed") },
      persistCallCount: 1,
    };
  }
}

export function buildEditStage(id = EDIT_STAGE_ID, editResult = {}) {
  return {
    id,
    status: editResult.status === "complete" ? "complete" : editResult.status || "skipped",
    manifest: editResult.manifest ?? null,
    editedVideoReference: editResult.editedVideoReference ?? null,
    skipped: editResult.status === "skipped",
    skipReason: editResult.skipReason ?? null,
    failure: editResult.failure ?? null,
  };
}
