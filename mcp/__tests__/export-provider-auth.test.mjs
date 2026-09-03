import assert from "node:assert/strict";
import test from "node:test";

import {
  describeGoogleAuth,
  resolveGoogleAccessToken,
  resolveMicrosoftAccessToken,
} from "../export-provider-auth.js";
import {
  ExportProviderError,
  requestProviderJson,
} from "../export-provider-http.js";

const tokenResponse = (payload) => new Response(JSON.stringify(payload), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});

test("provider requests abort at a finite centralized timeout", async () => {
  let requestSignal;
  const fetchImpl = async (_url, init) => {
    requestSignal = init.signal;
    return new Promise((_resolve, reject) => {
      requestSignal.addEventListener("abort", () => reject(requestSignal.reason), { once: true });
    });
  };

  await assert.rejects(
    requestProviderJson({
      fetchImpl,
      provider: "google",
      url: "https://example.test/provider",
      timeoutMs: 10,
    }),
    (error) => error instanceof ExportProviderError
      && error.code === "PROVIDER_TIMEOUT"
      && error.provider === "google"
      && error.retryable === true,
  );
  assert.equal(requestSignal instanceof AbortSignal, true);
  assert.equal(requestSignal.aborted, true);
});

test("successful provider requests clear their timeout timer", async () => {
  let requestSignal;
  const result = await requestProviderJson({
    fetchImpl: async (_url, init) => {
      requestSignal = init.signal;
      return tokenResponse({ ok: true });
    },
    provider: "google",
    url: "https://example.test/provider",
    timeoutMs: 10,
  });

  assert.deepEqual(result, { ok: true });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(requestSignal.aborted, false);
});

test("provider timeout remains active while a non-OK response body stalls", async () => {
  let requestSignal;
  await assert.rejects(
    requestProviderJson({
      fetchImpl: async (_url, init) => {
        requestSignal = init.signal;
        return {
          ok: false,
          status: 503,
          text: async () => new Promise(() => {}),
        };
      },
      provider: "microsoft",
      url: "https://example.test/provider",
      timeoutMs: 10,
    }),
    (error) => error instanceof ExportProviderError
      && error.code === "PROVIDER_TIMEOUT"
      && error.provider === "microsoft"
      && error.retryable === true,
  );
  assert.equal(requestSignal.aborted, true);
});

test("token exchanges use a typed retryable authentication timeout", async () => {
  let requestSignal;
  await assert.rejects(
    resolveGoogleAccessToken({
      env: {
        AGENTIC_OS_GOOGLE_CLIENT_ID: "client",
        AGENTIC_OS_GOOGLE_CLIENT_SECRET: "secret",
        AGENTIC_OS_GOOGLE_REFRESH_TOKEN: "refresh",
      },
      timeoutMs: 10,
      fetchImpl: async (_url, init) => {
        requestSignal = init.signal;
        return {
          ok: true,
          status: 200,
          json: async () => new Promise(() => {}),
        };
      },
    }),
    (error) => error instanceof ExportProviderError
      && error.code === "PROVIDER_AUTH_TIMEOUT"
      && error.retryable === true,
  );
  assert.equal(requestSignal.aborted, true);
});

test("Google service-account mode requires impersonation or an explicit shared-drive folder", () => {
  const serviceAccount = JSON.stringify({ client_email: "service@example.test", private_key: "private" });
  assert.deepEqual(describeGoogleAuth({
    AGENTIC_OS_GOOGLE_SERVICE_ACCOUNT_JSON: serviceAccount,
    AGENTIC_OS_GOOGLE_DRIVE_FOLDER_ID: "generic-human-oauth-folder",
  }), { configured: false, mode: "none" });
  assert.deepEqual(describeGoogleAuth({
    AGENTIC_OS_GOOGLE_SERVICE_ACCOUNT_JSON: serviceAccount,
    AGENTIC_OS_GOOGLE_SHARED_DRIVE_FOLDER_ID: "shared-drive-folder",
  }), { configured: true, mode: "service_account" });
  assert.deepEqual(describeGoogleAuth({
    AGENTIC_OS_GOOGLE_SERVICE_ACCOUNT_JSON: serviceAccount,
    AGENTIC_OS_GOOGLE_IMPERSONATED_USER: "person@example.test",
  }), { configured: true, mode: "service_account" });
});

test("Microsoft refresh-token rotation updates memory and calls host persistence", async () => {
  const env = {
    AGENTIC_OS_MICROSOFT_CLIENT_ID: "client",
    AGENTIC_OS_MICROSOFT_REFRESH_TOKEN: "old-refresh-token",
  };
  const persisted = [];
  let submittedBody = "";
  const accessToken = await resolveMicrosoftAccessToken({
    env,
    fetchImpl: async (_url, init) => {
      submittedBody = init.body;
      return tokenResponse({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
      });
    },
    persistRefreshToken: async (value) => persisted.push(value),
  });

  assert.equal(accessToken, "new-access-token");
  assert.equal(env.AGENTIC_OS_MICROSOFT_REFRESH_TOKEN, "new-refresh-token");
  assert.deepEqual(persisted, ["new-refresh-token"]);
  assert.equal(new URLSearchParams(submittedBody).get("refresh_token"), "old-refresh-token");
});

test("provider errors redact JSON, colon, equal, query, and bearer credential shapes", async () => {
  const secrets = [
    "json-secret", "colon-refresh", "equal-private", "query-token", "query-api-key",
    "query-oauth-token", "query-code", "query-signature", "query-password", "bearer-token",
  ];
  const error = new ExportProviderError(
    '{"client_secret":"json-secret"} refresh_token: colon-refresh private_key=equal-private'
      + " https://example.test/?access_token=query-token&api_key=query-api-key&token=query-oauth-token"
      + "&code=query-code&sig=query-signature&password=query-password Bearer bearer-token",
  );

  for (const secret of secrets) assert.equal(error.message.includes(secret), false);
  assert.match(error.message, /client_secret.*\[redacted\]/i);
  assert.match(error.message, /refresh_token.*\[redacted\]/i);
});

test("Microsoft persistence failures remain sanitized and do not revert the rotated in-memory token", async () => {
  const env = {
    AGENTIC_OS_MICROSOFT_CLIENT_ID: "client",
    AGENTIC_OS_MICROSOFT_REFRESH_TOKEN: "old-refresh-token",
  };
  await assert.rejects(
    resolveMicrosoftAccessToken({
      env,
      fetchImpl: async () => tokenResponse({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
      }),
      persistRefreshToken: async () => {
        throw new Error('write failed client_secret: "persist-secret"');
      },
    }),
    (error) => error instanceof ExportProviderError
      && error.code === "PROVIDER_AUTH_PERSIST_FAILED"
      && !error.message.includes("persist-secret"),
  );
  assert.equal(env.AGENTIC_OS_MICROSOFT_REFRESH_TOKEN, "new-refresh-token");
});
