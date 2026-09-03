// Deterministic mock AI Gateway client + in-memory R2 client.
// agentic-graph-widget-canvas-media · Task 2.2 · Requirements 8.1, 8.6, 8.8
//
// NO network sockets opened; every output is keyed by a sync hash of the
// model + stringified inputs so identical inputs always produce identical
// outputs (R8.8). Clock and sleep are injectable for instant poll-loop tests.
//
// Exports:
//   createMockAiGatewayClient(options?) -> { chat, image, submitVideo, pollVideo, pollVideoUntilDone }
//   createMockR2Client(options?)        -> { put, get, head }
//
// Options for createMockAiGatewayClient:
//   failOnCall?            boolean | () => boolean  — all calls fail
//   failVideo?             boolean | () => boolean  — submitVideo / pollVideo fail
//   videoCompletionStatus? "complete" | "failed"    — status when task "completes"
//   videoCompletionAfterPolls? number               — how many pollVideo calls until done (default 1)
//   chatLatencyMs?         number                   — simulated delay for chat
//   imageLatencyMs?        number                   — simulated delay for image
//   videoLatencyMs?        number                   — simulated delay per poll
//   now?                   () => number             — injectable clock (default Date.now)
//   sleepImpl?             (ms:number) => Promise   — injectable sleep (default real setTimeout)
//
// Options for createMockR2Client:
//   failOnPut?  boolean | () => boolean
//   failOnGet?  boolean | () => boolean
//   failOnHead? boolean | () => boolean
//   latencyMs?  number — uniform simulated latency for all ops
//   now?        () => number

// ---------------------------------------------------------------------------
// Sync djb2-variant hash — gives us a deterministic 32-bit integer from a
// string without any async I/O.  Used only for mock output keying (not for
// content-addressed storage).
// ---------------------------------------------------------------------------

/**
 * djb2 variant — maps any string to a 32-bit unsigned integer.
 * Pure, sync, zero dependencies.
 *
 * @param {string} str
 * @returns {number}
 */
function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // (hash * 33) XOR charCode, kept in 32-bit unsigned range.
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // force unsigned 32-bit
  }
  return hash >>> 0;
}

/**
 * Produce a 6-character hex tag from model + stringified args.
 * Deterministic: identical inputs always produce the same tag (R8.8).
 *
 * @param {string} model
 * @param {unknown} args
 * @returns {string}
 */
function hashTag(model, args) {
  const seed = `${model}::${JSON.stringify(args)}`;
  // Two djb2 passes with different seeds to widen the tag space.
  const a = djb2(seed);
  const b = djb2(seed + "\x00");
  const combined = ((a ^ (b << 4)) >>> 0).toString(16).padStart(8, "0");
  return combined.slice(0, 6);
}

// ---------------------------------------------------------------------------
// Shared internal helpers
// ---------------------------------------------------------------------------

function resolveBool(value) {
  if (typeof value === "function") return Boolean(value());
  return Boolean(value);
}

function noop() {}

function defaultSleepImpl(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a minimal costLog compatible with the live client shape.
 *
 * @param {"chat"|"image"|"video"} kind
 * @param {string} model
 * @returns {object}
 */
function mockCostLog(kind, model) {
  return { kind, model, usageTokens: null, rawUsage: null };
}

// ---------------------------------------------------------------------------
// createMockAiGatewayClient
// ---------------------------------------------------------------------------

/**
 * Create a deterministic, network-free mock of `createAiGatewayClient`.
 *
 * Returns the same interface:
 *   { chat, image, submitVideo, pollVideo, pollVideoUntilDone }
 *
 * All outputs are keyed by `hashTag(model, inputs)` so identical inputs
 * produce byte-for-byte identical results across separate runs (R8.8).
 *
 * @param {{
 *   failOnCall?: boolean | (() => boolean),
 *   failVideo?:  boolean | (() => boolean),
 *   videoCompletionStatus?: "complete" | "failed",
 *   videoCompletionAfterPolls?: number,
 *   chatLatencyMs?:  number,
 *   imageLatencyMs?: number,
 *   videoLatencyMs?: number,
 *   now?:       () => number,
 *   sleepImpl?: (ms: number) => Promise<void>,
 * }} [options]
 *
 * @returns {{ chat, image, submitVideo, pollVideo, pollVideoUntilDone }}
 */
export function createMockAiGatewayClient(options = {}) {
  const {
    failOnCall = false,
    failVideo = false,
    videoCompletionStatus = "complete",
    videoCompletionAfterPolls = 1,
    chatLatencyMs = 0,
    imageLatencyMs = 0,
    videoLatencyMs = 0,
    now = () => Date.now(),
    sleepImpl = defaultSleepImpl,
  } = options ?? {};

  // Per-taskId poll counter (in-memory, per client instance).
  // This means a new client instance resets all counters — intentional for
  // test isolation.
  /** @type {Map<string, number>} */
  const pollCounters = new Map();

  // ---- helpers -------------------------------------------------------------

  async function maybeSleep(ms) {
    if (ms > 0) await sleepImpl(ms);
  }

  function buildError(context, code = "mock_error") {
    return { ok: false, error: `${context}: mock failure (failOnCall)`, code };
  }

  function buildVideoError(context, code = "mock_video_error") {
    return { ok: false, error: `${context}: mock video failure (failVideo)`, code };
  }

  // ---- chat ----------------------------------------------------------------

  /**
   * @param {{ prompt?: string, model?: string }} [args]
   * @returns {Promise<{ok:true, text:string, model:string, costLog:object}|{ok:false, error:string, code:string}>}
   */
  async function chat(args = {}) {
    await maybeSleep(chatLatencyMs);
    if (resolveBool(failOnCall)) return buildError("chat");
    const model = (args.model && String(args.model).trim()) || "agnes/seed";
    const tag = hashTag(model, { prompt: args.prompt });
    return { ok: true, text: `mock-chat:${tag}`, model, costLog: mockCostLog("chat", model) };
  }

  // ---- image ---------------------------------------------------------------

  /**
   * @param {{ prompt?: string, model?: string }} [args]
   * @returns {Promise<{ok:true, bytesOrB64:string, mediaType:string, model:string, costLog:object}|{ok:false, error:string, code:string}>}
   */
  async function image(args = {}) {
    await maybeSleep(imageLatencyMs);
    if (resolveBool(failOnCall)) return buildError("image");
    const model = (args.model && String(args.model).trim()) || "seedream";
    const tag = hashTag(model, { prompt: args.prompt });
    return {
      ok: true,
      bytesOrB64: `mock-image-b64-${tag}`,
      mediaType: "image/png",
      model,
      costLog: mockCostLog("image", model),
    };
  }

  // ---- submitVideo ---------------------------------------------------------

  /**
   * @param {{ prompt?: string, model?: string }} [args]
   * @returns {Promise<{ok:true, taskId:string, model:string}|{ok:false, error:string, code:string}>}
   */
  async function submitVideo(args = {}) {
    await maybeSleep(videoLatencyMs);
    if (resolveBool(failOnCall)) return buildError("submitVideo");
    if (resolveBool(failVideo)) return buildVideoError("submitVideo");
    const model = (args.model && String(args.model).trim()) || "seedance";
    const tag = hashTag(model, { prompt: args.prompt });
    const taskId = `mock-task-${tag}`;
    // Initialise poll counter for this task on submit.
    pollCounters.set(taskId, 0);
    return { ok: true, taskId, model };
  }

  // ---- pollVideo -----------------------------------------------------------

  /**
   * First `videoCompletionAfterPolls` calls return pending; the next call
   * returns the final status (complete or failed per `videoCompletionStatus`).
   *
   * @param {{ taskId?: string, model?: string }} [args]
   * @returns {Promise<{ok:true, status:string, ephemeralUrl?:string, mediaType?:string}|{ok:false, error:string, code:string}>}
   */
  async function pollVideo(args = {}) {
    await maybeSleep(videoLatencyMs);
    if (resolveBool(failOnCall)) return buildError("pollVideo");
    if (resolveBool(failVideo)) return buildVideoError("pollVideo");
    const model = (args.model && String(args.model).trim()) || "seedance";
    const taskId = String(args.taskId ?? "");
    // Derive the tag from the taskId itself (stable, was computed at submit).
    const tag = taskId.startsWith("mock-task-") ? taskId.slice("mock-task-".length) : hashTag(model, { taskId });

    const prev = pollCounters.get(taskId) ?? 0;
    const next = prev + 1;
    pollCounters.set(taskId, next);

    const completionThreshold = Number.isFinite(videoCompletionAfterPolls) && videoCompletionAfterPolls >= 1
      ? videoCompletionAfterPolls
      : 1;

    if (next <= completionThreshold) {
      // Still pending while under the threshold.
      if (next < completionThreshold) return { ok: true, status: "pending" };
      // On the threshold poll, return the final status.
      if (videoCompletionStatus === "failed") return { ok: true, status: "failed" };
      return {
        ok: true,
        status: "complete",
        ephemeralUrl: `https://mock.provider/video/${tag}.mp4`,
        mediaType: "video/mp4",
      };
    }
    // Beyond threshold: always returns complete again (idempotent).
    if (videoCompletionStatus === "failed") return { ok: true, status: "failed" };
    return {
      ok: true,
      status: "complete",
      ephemeralUrl: `https://mock.provider/video/${tag}.mp4`,
      mediaType: "video/mp4",
    };
  }

  // ---- pollVideoUntilDone --------------------------------------------------

  /**
   * Drives the submit → poll loop using the injectable clock and sleep so
   * poll loops complete instantly in tests.
   *
   * Returns the same shapes as the live `pollVideoUntilDone`:
   *   { ok: true, ephemeralUrl, mediaType, model, elapsed }       success
   *   { ok: false, timedOut: true, elapsed, model, error, code }  timeout
   *   { ok: false, error, code, model }                           error
   *
   * @param {{
   *   taskId?: string,
   *   model?: string,
   *   intervalMs?: number,
   *   maxDurationMs?: number,
   *   sleep?: (ms:number) => Promise<void>,
   * }} [args]
   */
  async function pollVideoUntilDone(args = {}) {
    const model = (args.model && String(args.model).trim()) || "seedance";
    const intervalMs = Number.isFinite(args.intervalMs) ? args.intervalMs : 5_000;
    const maxDurationMs = Number.isFinite(args.maxDurationMs) ? args.maxDurationMs : 600_000;
    // Prefer the per-call sleep, then the instance sleep.
    const sleepFn = typeof args.sleep === "function" ? args.sleep : sleepImpl;
    const startedAt = now();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const elapsed = now() - startedAt;
      if (elapsed >= maxDurationMs) {
        return {
          ok: false,
          timedOut: true,
          model,
          elapsed,
          error: `mock video task timed out after ${elapsed}ms (max ${maxDurationMs}ms)`,
          code: "video_poll_timeout",
        };
      }

      const result = await pollVideo({ taskId: args.taskId, model });
      if (!result.ok) return { ...result, model };

      if (result.status === "complete") {
        return {
          ok: true,
          ephemeralUrl: result.ephemeralUrl,
          mediaType: result.mediaType || "video/mp4",
          model,
          elapsed: now() - startedAt,
        };
      }
      if (result.status === "failed") {
        return {
          ok: false,
          error: `mock provider reported task failed (taskId=${args.taskId})`,
          code: "video_task_failed",
          model,
          elapsed: now() - startedAt,
        };
      }

      await sleepFn(intervalMs);
    }
  }

  return Object.freeze({ chat, image, submitVideo, pollVideo, pollVideoUntilDone });
}

// ---------------------------------------------------------------------------
// createMockR2Client
// ---------------------------------------------------------------------------

/**
 * In-memory R2 client that supports the same surface as the Cloudflare R2
 * binding (`put`, `get`, `head`) plus injectable failures and latency.
 *
 * Needed by Task 3.2 (media-persist tests).
 *
 * @param {{
 *   failOnPut?:  boolean | (() => boolean),
 *   failOnGet?:  boolean | (() => boolean),
 *   failOnHead?: boolean | (() => boolean),
 *   latencyMs?:  number,
 *   now?:        () => number,
 * }} [options]
 *
 * @returns {{
 *   put(key:string, body:unknown, opts?:object):  Promise<void>,
 *   get(key:string):                              Promise<{body:unknown, metadata:object}|null>,
 *   head(key:string):                             Promise<{key:string, size:number, uploaded:string}|null>,
 *   _store: Map<string, {body:unknown, opts:object, uploadedAt:number}>,
 * }}
 */
export function createMockR2Client(options = {}) {
  const {
    failOnPut = false,
    failOnGet = false,
    failOnHead = false,
    latencyMs = 0,
    now: nowFn = () => Date.now(),
  } = options ?? {};

  // Internal in-memory object store: key → { body, opts, uploadedAt }
  /** @type {Map<string, {body:unknown, opts:object|undefined, uploadedAt:number}>} */
  const _store = new Map();

  async function sleep(ms) {
    if (ms > 0) await defaultSleepImpl(ms);
  }

  function buildR2Error(op, key) {
    const err = new Error(`MockR2Client: ${op} failed for key="${key}" (injected failure)`);
    err.code = "mock_r2_failure";
    return err;
  }

  /**
   * Store an object.
   *
   * @param {string} key
   * @param {unknown} body
   * @param {object} [opts]
   * @returns {Promise<void>}
   */
  async function put(key, body, opts) {
    await sleep(latencyMs);
    if (resolveBool(failOnPut)) throw buildR2Error("put", key);
    _store.set(String(key), { body, opts: opts ?? {}, uploadedAt: nowFn() });
  }

  /**
   * Retrieve an object or null when not found.
   *
   * @param {string} key
   * @returns {Promise<{body:unknown, metadata:{key:string, size:number, uploaded:string}}|null>}
   */
  async function get(key) {
    await sleep(latencyMs);
    if (resolveBool(failOnGet)) throw buildR2Error("get", key);
    const entry = _store.get(String(key));
    if (!entry) return null;
    const size = entry.body instanceof Uint8Array
      ? entry.body.byteLength
      : typeof entry.body === "string"
        ? entry.body.length
        : 0;
    return {
      body: entry.body,
      metadata: {
        key: String(key),
        size,
        uploaded: new Date(entry.uploadedAt).toISOString(),
      },
    };
  }

  /**
   * Check object existence / metadata without fetching the body.
   * Returns null when the object does not exist.
   *
   * @param {string} key
   * @returns {Promise<{key:string, size:number, uploaded:string}|null>}
   */
  async function head(key) {
    await sleep(latencyMs);
    if (resolveBool(failOnHead)) throw buildR2Error("head", key);
    const entry = _store.get(String(key));
    if (!entry) return null;
    const size = entry.body instanceof Uint8Array
      ? entry.body.byteLength
      : typeof entry.body === "string"
        ? entry.body.length
        : 0;
    return {
      key: String(key),
      size,
      uploaded: new Date(entry.uploadedAt).toISOString(),
    };
  }

  // Expose the internal store for test inspection (e.g., verifying object count).
  return Object.freeze({ put, get, head, _store });
}
