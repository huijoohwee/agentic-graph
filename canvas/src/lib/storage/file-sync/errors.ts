import {
  replaceFileSyncControlCharacters,
  type FileSyncFailureReason,
} from "./contract";

export class FileSyncOperationError extends Error {
  readonly reason: FileSyncFailureReason;

  constructor(reason: FileSyncFailureReason, message: string) {
    super(message);
    this.name = "FileSyncOperationError";
    this.reason = reason;
  }
}

export function getFileSyncFailureReason(
  error: unknown,
): FileSyncFailureReason {
  return error instanceof FileSyncOperationError ? error.reason : "failed";
}

export function sanitizeFileSyncError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "File sync failed";
  const sanitized = replaceFileSyncControlCharacters(raw)
    .replace(/\bhttps?:\/\/[^\s]+/gi, "[remote]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(
      /\b(token|secret|password|api[_ -]?key|authorization)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
      "[redacted]",
    )
    .replace(/\s+/g, " ")
    .trim();
  return (sanitized || "File sync failed").slice(0, 240);
}

export function createFileSyncDeadline(timeoutMs: number): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => globalThis.clearTimeout(timer),
  };
}
