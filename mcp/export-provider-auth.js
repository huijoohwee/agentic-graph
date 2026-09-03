import crypto from "node:crypto";
import { ExportProviderError, runProviderRequest } from "./export-provider-http.js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPES = Object.freeze([
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/presentations",
]);
const MICROSOFT_SCOPE = "offline_access Files.ReadWrite";

const readEnv = (env, name) => String(env?.[name] || "").trim();

const parseJsonSecret = (raw, label) => {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    } catch {
      throw new ExportProviderError(`${label} is not valid JSON or base64 JSON`, {
        code: "PROVIDER_AUTH_INVALID",
      });
    }
  }
};

const encodeBase64Url = (value) => Buffer.from(value).toString("base64url");

const buildServiceAccountAssertion = ({ clientEmail, privateKey, subject = "", now }) => {
  const issuedAt = Math.floor(now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = encodeBase64Url(JSON.stringify({
    iss: clientEmail,
    scope: GOOGLE_SCOPES.join(" "),
    aud: GOOGLE_TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
    ...(subject ? { sub: subject } : {}),
  }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url");
  return `${unsigned}.${signature}`;
};

const postTokenForm = async ({ fetchImpl, provider, url, values, timeoutMs }) => {
  try {
    return await runProviderRequest({
      provider,
      timeoutMs,
      timeoutCode: "PROVIDER_AUTH_TIMEOUT",
      execute: async (signal) => {
        const response = await fetchImpl(url, {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(values).toString(),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || typeof payload.access_token !== "string") {
          throw new ExportProviderError(
            payload.error_description || payload?.error?.message || `${provider} token exchange failed`,
            {
              code: "PROVIDER_AUTH_FAILED",
              provider,
              status: Number(response.status || 0),
              retryable: Number(response.status || 0) >= 500,
            },
          );
        }
        return payload;
      },
    });
  } catch (error) {
    if (error instanceof ExportProviderError) throw error;
    throw new ExportProviderError(error instanceof Error ? error.message : String(error), {
      code: "PROVIDER_AUTH_NETWORK_ERROR",
      provider,
      retryable: true,
    });
  }
};

export const describeGoogleAuth = (env = process.env) => {
  if (readEnv(env, "AGENTIC_OS_GOOGLE_ACCESS_TOKEN")) return { configured: true, mode: "access_token" };
  const refreshConfigured = [
    "AGENTIC_OS_GOOGLE_CLIENT_ID",
    "AGENTIC_OS_GOOGLE_CLIENT_SECRET",
    "AGENTIC_OS_GOOGLE_REFRESH_TOKEN",
  ].every((name) => readEnv(env, name));
  if (refreshConfigured) return { configured: true, mode: "oauth_refresh" };
  const serviceAccount = readEnv(env, "AGENTIC_OS_GOOGLE_SERVICE_ACCOUNT_JSON");
  const hasWritableOwner = readEnv(env, "AGENTIC_OS_GOOGLE_IMPERSONATED_USER")
    || readEnv(env, "AGENTIC_OS_GOOGLE_SHARED_DRIVE_FOLDER_ID");
  if (serviceAccount && hasWritableOwner) return { configured: true, mode: "service_account" };
  return { configured: false, mode: "none" };
};

export const resolveGoogleAccessToken = async ({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  timeoutMs,
} = {}) => {
  const direct = readEnv(env, "AGENTIC_OS_GOOGLE_ACCESS_TOKEN");
  if (direct) return direct;

  const auth = describeGoogleAuth(env);
  if (!auth.configured) {
    throw new ExportProviderError(
      "Google export requires user OAuth credentials, or a service account with impersonation/shared-drive folder access",
      { code: "PROVIDER_NOT_CONFIGURED", provider: "google" },
    );
  }

  if (auth.mode === "oauth_refresh") {
    const payload = await postTokenForm({
      fetchImpl,
      provider: "google",
      url: GOOGLE_TOKEN_URL,
      timeoutMs,
      values: {
        client_id: readEnv(env, "AGENTIC_OS_GOOGLE_CLIENT_ID"),
        client_secret: readEnv(env, "AGENTIC_OS_GOOGLE_CLIENT_SECRET"),
        refresh_token: readEnv(env, "AGENTIC_OS_GOOGLE_REFRESH_TOKEN"),
        grant_type: "refresh_token",
      },
    });
    return payload.access_token;
  }

  const secret = parseJsonSecret(
    readEnv(env, "AGENTIC_OS_GOOGLE_SERVICE_ACCOUNT_JSON"),
    "AGENTIC_OS_GOOGLE_SERVICE_ACCOUNT_JSON",
  );
  if (!secret.client_email || !secret.private_key) {
    throw new ExportProviderError("Google service-account JSON is missing client_email/private_key", {
      code: "PROVIDER_AUTH_INVALID",
      provider: "google",
    });
  }
  const assertion = buildServiceAccountAssertion({
    clientEmail: secret.client_email,
    privateKey: secret.private_key,
    subject: readEnv(env, "AGENTIC_OS_GOOGLE_IMPERSONATED_USER"),
    now,
  });
  const payload = await postTokenForm({
    fetchImpl,
    provider: "google",
    url: secret.token_uri || GOOGLE_TOKEN_URL,
    timeoutMs,
    values: {
      assertion,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    },
  });
  return payload.access_token;
};

export const describeMicrosoftAuth = (env = process.env) => {
  if (readEnv(env, "AGENTIC_OS_MICROSOFT_ACCESS_TOKEN")) return { configured: true, mode: "access_token" };
  const refreshConfigured = [
    "AGENTIC_OS_MICROSOFT_CLIENT_ID",
    "AGENTIC_OS_MICROSOFT_REFRESH_TOKEN",
  ].every((name) => readEnv(env, name));
  return refreshConfigured
    ? { configured: true, mode: "oauth_refresh" }
    : { configured: false, mode: "none" };
};

export const resolveMicrosoftAccessToken = async ({
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs,
  persistRefreshToken,
} = {}) => {
  const direct = readEnv(env, "AGENTIC_OS_MICROSOFT_ACCESS_TOKEN");
  if (direct) return direct;
  if (!describeMicrosoftAuth(env).configured) {
    throw new ExportProviderError("Microsoft export requires a delegated access token or refresh-token credentials", {
      code: "PROVIDER_NOT_CONFIGURED",
      provider: "microsoft",
    });
  }
  const tenant = readEnv(env, "AGENTIC_OS_MICROSOFT_TENANT") || "consumers";
  const payload = await postTokenForm({
    fetchImpl,
    provider: "microsoft",
    url: `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    timeoutMs,
    values: {
      client_id: readEnv(env, "AGENTIC_OS_MICROSOFT_CLIENT_ID"),
      refresh_token: readEnv(env, "AGENTIC_OS_MICROSOFT_REFRESH_TOKEN"),
      grant_type: "refresh_token",
      scope: readEnv(env, "AGENTIC_OS_MICROSOFT_SCOPE") || MICROSOFT_SCOPE,
      ...(readEnv(env, "AGENTIC_OS_MICROSOFT_CLIENT_SECRET")
        ? { client_secret: readEnv(env, "AGENTIC_OS_MICROSOFT_CLIENT_SECRET") }
        : {}),
    },
  });
  const rotatedRefreshToken = typeof payload.refresh_token === "string"
    ? payload.refresh_token.trim()
    : "";
  if (rotatedRefreshToken && rotatedRefreshToken !== readEnv(env, "AGENTIC_OS_MICROSOFT_REFRESH_TOKEN")) {
    try {
      env.AGENTIC_OS_MICROSOFT_REFRESH_TOKEN = rotatedRefreshToken;
      if (typeof persistRefreshToken === "function") await persistRefreshToken(rotatedRefreshToken);
    } catch (error) {
      throw new ExportProviderError(error instanceof Error ? error.message : String(error), {
        code: "PROVIDER_AUTH_PERSIST_FAILED",
        provider: "microsoft",
      });
    }
  }
  return payload.access_token;
};
