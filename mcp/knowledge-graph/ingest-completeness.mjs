import { compareStableStrings } from "./contract.mjs";

const MAX_MESSAGE_REASONS = 3;
const MAX_MESSAGE_SOURCES = 3;
const MAX_SOURCE_PATH_LENGTH = 144;

const REASON_SUMMARIES = Object.freeze({
  acquisition_incomplete: "source acquisition did not complete",
  parser_error: "a local parser reported an error",
  parser_partial: "a local parser returned an incomplete result",
  parser_pending: "a source requires an unavailable local parser or converter",
  parser_skipped: "a source parser skipped structural extraction",
  parser_unknown: "a source parser returned an unknown state",
  source_skipped: "one or more sources exceeded an admission bound",
  source_unsupported: "one or more sources were classified as unsupported",
  tracked_gitlink_omitted: "a tracked nested repository was omitted",
  tracked_symlink_omitted: "a tracked symbolic link was omitted",
});

function stableStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))].sort(compareStableStrings);
}

function sourcePathForMessage(value) {
  const normalized = String(value || "")
    .replace(/[\u0000-\u001F\u007F]+/gu, " ")
    .replaceAll("\\", "/")
    .trim()
    .replace(/^\/+/, "");
  if (!normalized) return "an unnamed source";
  return normalized.length <= MAX_SOURCE_PATH_LENGTH
    ? normalized
    : `…${normalized.slice(-(MAX_SOURCE_PATH_LENGTH - 1))}`;
}

function reasonForMessage(reason) {
  return REASON_SUMMARIES[reason]
    || `the source state ${reason.replace(/[^a-z0-9]+/giu, " ").trim() || "unknown"}`;
}

function summarizedList(values, maximum, formatter) {
  const listed = values.slice(0, maximum).map(formatter);
  const remaining = values.length - listed.length;
  return remaining > 0 ? [...listed, `${remaining} more`] : listed;
}

export function summarizeKnowledgeGraphCompleteness({
  admission,
  fragments,
  acquisitionComplete,
} = {}) {
  const sourceAdmission = admission && typeof admission === "object" ? admission : {};
  const fragmentEntries = fragments instanceof Map ? [...fragments.entries()] : [];
  const incompleteFragments = fragmentEntries.filter(([, fragment]) => fragment?.status !== "parsed");
  const incompleteSources = stableStrings([
    ...(sourceAdmission.incompleteSources || []),
    ...incompleteFragments.map(([sourcePath]) => sourcePath),
  ]);
  const reasons = stableStrings([
    ...(sourceAdmission.reasons || []),
    ...incompleteFragments.map(([, fragment]) => `parser_${String(fragment?.status || "unknown")}`),
    ...(acquisitionComplete === false ? ["acquisition_incomplete"] : []),
  ]);
  return {
    complete: sourceAdmission.complete === true
      && acquisitionComplete !== false
      && incompleteSources.length === 0,
    admission: sourceAdmission,
    incompleteSources,
    reasons,
  };
}

/** Returns a bounded, source-safe explanation that survives bridge sanitization. */
export function strictIngestIncompleteMessage({
  reasons,
  incompleteSources,
  previousReadySnapshotPreserved,
} = {}) {
  const normalizedReasons = stableStrings(reasons);
  const normalizedSources = stableStrings(incompleteSources).map(sourcePathForMessage);
  const reasonText = summarizedList(normalizedReasons, MAX_MESSAGE_REASONS, reasonForMessage).join("; ")
    || "the import did not reach a complete source state";
  const sourceList = summarizedList(normalizedSources, MAX_MESSAGE_SOURCES, (value) => value).join(", ");
  const sourceText = sourceList ? ` Affected sources: ${sourceList}.` : "";
  const publicationText = previousReadySnapshotPreserved
    ? "The previous ready snapshot remains selected."
    : "No ready snapshot was published.";
  return `Strict ingestion did not publish a new canonical knowledge graph because ${reasonText}.${sourceText} ${publicationText} Resolve the listed source condition and import again.`;
}
