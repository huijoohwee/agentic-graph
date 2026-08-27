import crypto from "node:crypto";

const ANNOTATION_SCHEMA_VERSION = "agenticgraph-annotation/v1";
const DEFAULT_MODEL_ID = "heuristic-local";
const ANNOTATION_TASK_IDS = new Set([
  "caption",
  "detailed_caption",
  "more_detailed_caption",
  "object_detection",
  "dense_region_caption",
  "ocr",
]);

const buildFailure = ({ assetUrl = "", modelId = "", schemaVersion = "", code, message }) => ({
  ok: false,
  annotation_id: "",
  asset_url: assetUrl,
  model_id: modelId,
  schema_version: schemaVersion,
  tasks: {},
  error: {
    code,
    message,
  },
});

const readCleanString = (value) => (typeof value === "string" ? value.trim() : "");

const readAssetName = (assetUrl) => {
  const value = readCleanString(assetUrl);
  if (!value) return "visual asset";
  try {
    const parsed = new URL(value, "https://agenticgraph.local");
    const pathname = parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname;
    return decodeURIComponent(pathname).replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim() || "visual asset";
  } catch {
    const segment = value.split(/[/?#]/).filter(Boolean).pop() || value;
    return segment.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim() || "visual asset";
  }
};

const readAssetKind = (assetUrl, assetType) => {
  if (assetType === "video_frame") return "video frame";
  const lower = readCleanString(assetUrl).toLowerCase();
  if (/\.(png|jpe?g|webp|gif|avif|svg)(?:[?#]|$)/.test(lower)) return "image";
  return "visual asset";
};

const normalizeTasks = (tasks) => {
  if (!Array.isArray(tasks)) return { ok: false, message: "tasks must be an array" };
  if (tasks.length < 1 || tasks.length > 6) return { ok: false, message: "tasks must contain between 1 and 6 items" };
  const normalized = [];
  const seen = new Set();
  for (const task of tasks) {
    const value = readCleanString(task);
    if (!ANNOTATION_TASK_IDS.has(value)) {
      return { ok: false, message: `tasks contains unsupported value: ${String(task)}` };
    }
    if (seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  if (normalized.length < 1) return { ok: false, message: "tasks must contain at least one supported item" };
  return { ok: true, tasks: normalized };
};

const resolveModelId = (modelHint) => {
  const value = readCleanString(modelHint);
  if (!value) return { ok: true, modelId: DEFAULT_MODEL_ID };
  if (value === DEFAULT_MODEL_ID) return { ok: true, modelId: value };
  return { ok: false, modelId: value };
};

const buildAnnotationId = ({ assetUrl, tasks, modelId, frameTimestampMs = null }) => {
  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify({
      assetUrl,
      tasks: [...tasks].sort((left, right) => left.localeCompare(right)),
      modelId,
      ...(typeof frameTimestampMs === "number" ? { frameTimestampMs } : {}),
    }))
    .digest("hex");
  return `annotation_${digest.slice(0, 24)}`;
};

const buildTaskOutputs = ({ assetUrl, assetType, tasks, frameTimestampMs }) => {
  const assetName = readAssetName(assetUrl);
  const assetKind = readAssetKind(assetUrl, assetType);
  const frameText = assetType === "video_frame" && typeof frameTimestampMs === "number"
    ? ` at ${String(frameTimestampMs)}ms`
    : "";

  return tasks.reduce((out, taskId) => {
    if (taskId === "object_detection") {
      out[taskId] = {
        objects: [
          { label: assetKind, bbox: [0.08, 0.08, 0.84, 0.84], confidence: 0.51 },
        ],
      };
      return out;
    }
    if (taskId === "dense_region_caption") {
      out[taskId] = {
        regions: [
          { label: `${assetKind} foreground region for ${assetName}`, bbox: [0.08, 0.08, 0.84, 0.84] },
        ],
      };
      return out;
    }
    if (taskId === "ocr") {
      out[taskId] = { text: "", blocks: [] };
      return out;
    }
    out[taskId] = {
      text: `Runtime-local ${assetKind} annotation for ${assetName}${frameText}.`,
    };
    return out;
  }, {});
};

const validateBaseInput = ({ assetUrl, tasks, modelHint }) => {
  const cleanAssetUrl = readCleanString(assetUrl);
  if (!cleanAssetUrl) {
    return buildFailure({
      code: "invalid_spec",
      message: "asset_url must be a non-empty string",
    });
  }
  if (cleanAssetUrl.length > 2048) {
    return buildFailure({
      assetUrl: cleanAssetUrl,
      code: "invalid_spec",
      message: "asset_url must be at most 2048 characters",
    });
  }
  const normalizedTasks = normalizeTasks(tasks);
  if (!normalizedTasks.ok) {
    return buildFailure({
      assetUrl: cleanAssetUrl,
      code: "invalid_spec",
      message: normalizedTasks.message,
    });
  }
  const modelResolution = resolveModelId(modelHint);
  if (!modelResolution.ok) {
    return buildFailure({
      assetUrl: cleanAssetUrl,
      modelId: modelResolution.modelId,
      code: "model_not_configured",
      message: `Unsupported model_hint: ${modelResolution.modelId}`,
    });
  }
  return {
    ok: true,
    assetUrl: cleanAssetUrl,
    tasks: normalizedTasks.tasks,
    modelId: modelResolution.modelId,
  };
};

export async function handleAnnotateImageTool(input = {}) {
  const validation = validateBaseInput({
    assetUrl: input.asset_url,
    tasks: input.tasks,
    modelHint: input.model_hint,
  });
  if (validation.ok !== true) return validation;

  return {
    ok: true,
    annotation_id: buildAnnotationId({
      assetUrl: validation.assetUrl,
      tasks: validation.tasks,
      modelId: validation.modelId,
    }),
    asset_url: validation.assetUrl,
    model_id: validation.modelId,
    schema_version: ANNOTATION_SCHEMA_VERSION,
    tasks: buildTaskOutputs({
      assetUrl: validation.assetUrl,
      assetType: "image",
      tasks: validation.tasks,
    }),
  };
}

export async function handleAnnotateVideoFrameTool(input = {}) {
  const validation = validateBaseInput({
    assetUrl: input.asset_url,
    tasks: input.tasks,
    modelHint: input.model_hint,
  });
  if (validation.ok !== true) return validation;

  const frameTimestampMs = input.frame_timestamp_ms;
  if (!Number.isInteger(frameTimestampMs) || frameTimestampMs < 0) {
    return buildFailure({
      assetUrl: validation.assetUrl,
      modelId: validation.modelId,
      code: "invalid_spec",
      message: "frame_timestamp_ms must be an integer greater than or equal to 0",
    });
  }

  return {
    ok: true,
    annotation_id: buildAnnotationId({
      assetUrl: validation.assetUrl,
      tasks: validation.tasks,
      modelId: validation.modelId,
      frameTimestampMs,
    }),
    asset_url: validation.assetUrl,
    model_id: validation.modelId,
    schema_version: ANNOTATION_SCHEMA_VERSION,
    tasks: buildTaskOutputs({
      assetUrl: validation.assetUrl,
      assetType: "video_frame",
      tasks: validation.tasks,
      frameTimestampMs,
    }),
  };
}
