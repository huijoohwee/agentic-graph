const DEFAULT_ENDPOINT = "http://127.0.0.1:11434";

const normalizeString = (value) => String(value || "").replace(/\s+/g, " ").trim();
const normalizeContent = (value) => String(value || "").replace(/\u0000/g, "").trim();

const isLoopbackHost = (hostname) => (
  hostname === "localhost"
  || hostname === "127.0.0.1"
  || hostname === "::1"
  || hostname.endsWith(".localhost")
);

const parseEndpoint = ({ endpoint, allowRemote, envPrefix }) => {
  let url;
  try {
    url = new URL(normalizeString(endpoint) || DEFAULT_ENDPOINT);
  } catch {
    throw new Error(`${envPrefix}_URL must be a valid URL.`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${envPrefix}_URL must use http or https.`);
  }
  if (url.username || url.password) {
    throw new Error(`${envPrefix}_URL must not include embedded credentials.`);
  }
  if (!allowRemote && !isLoopbackHost(url.hostname)) {
    throw new Error(`${envPrefix}_URL must be loopback unless ${envPrefix}_ALLOW_REMOTE=1.`);
  }
  return url;
};

export function readLocalOllamaConfig(env = process.env, {
  envPrefix,
  defaultTimeoutMs = 20_000,
  maximumTimeoutMs = 120_000,
} = {}) {
  if (!/^[A-Z][A-Z0-9_]+$/.test(String(envPrefix || ""))) {
    throw new TypeError("A valid local Ollama environment prefix is required.");
  }
  const model = normalizeString(env[envPrefix]);
  const provider = normalizeString(env[`${envPrefix}_PROVIDER`] || (model ? "ollama" : ""));
  if (!provider && !model) return Object.freeze({ configured: false, provider: "", model: "" });
  if (provider !== "ollama") {
    return Object.freeze({ configured: false, provider, model, disabledReason: "unsupported_model_provider" });
  }
  if (!model) {
    return Object.freeze({ configured: false, provider, model, disabledReason: "missing_model" });
  }
  const allowRemote = normalizeString(env[`${envPrefix}_ALLOW_REMOTE`]).toLowerCase() === "1";
  const endpoint = parseEndpoint({
    endpoint: env[`${envPrefix}_URL`],
    allowRemote,
    envPrefix,
  });
  const timeoutMs = Math.max(
    1_000,
    Math.min(maximumTimeoutMs, Math.floor(Number(env[`${envPrefix}_TIMEOUT_MS`]) || defaultTimeoutMs)),
  );
  return Object.freeze({
    configured: true,
    provider,
    model,
    endpoint: endpoint.toString().replace(/\/$/, ""),
    timeoutMs,
  });
}

const composeSignal = (outerSignal, timeoutMs) => {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) controller.abort(outerSignal?.reason);
  };
  if (outerSignal?.aborted) abort();
  else outerSignal?.addEventListener?.("abort", abort, { once: true });
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort(new Error("Local model request timed out."));
  }, timeoutMs);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      outerSignal?.removeEventListener?.("abort", abort);
    },
  };
};

export async function callLocalOllamaChat({
  config,
  messages,
  format,
  options = {},
  signal,
  fetchImpl = fetch,
}) {
  if (config?.configured !== true) {
    throw Object.assign(new Error("Local Ollama model is not configured."), {
      code: config?.disabledReason || "model_not_configured",
    });
  }
  const composed = composeSignal(signal, config.timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetchImpl(`${config.endpoint}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: composed.signal,
      body: JSON.stringify({
        model: config.model,
        stream: false,
        ...(format ? { format } : {}),
        options: { temperature: 0, ...options },
        messages,
      }),
    });
    if (!response.ok) {
      throw Object.assign(new Error(`Local Ollama request failed with HTTP ${response.status}.`), {
        code: `ollama_http_${response.status}`,
      });
    }
    const payload = await response.json();
    return Object.freeze({
      content: normalizeContent(payload?.message?.content || payload?.response),
      model: normalizeString(payload?.model) || config.model,
      promptTokens: Math.max(0, Math.floor(Number(payload?.prompt_eval_count) || 0)),
      outputTokens: Math.max(0, Math.floor(Number(payload?.eval_count) || 0)),
      timeMs: Math.max(1, Math.ceil(performance.now() - startedAt)),
    });
  } finally {
    composed.dispose();
  }
}
