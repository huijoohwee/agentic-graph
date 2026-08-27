import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXPORT_PUBLISH_CONTRACT_VERSION,
  ExportPublishError,
  createExportIdentity,
  createExportPublishError,
  validateExportPublishRequest,
  validateExportPublishResult,
} from "./export-publish-contract.js";
import { readExportArtifact } from "./export-artifact-reader.js";
import {
  appendFleetExportEntry,
  findLatestSuccessfulExport,
} from "./export-ledger.js";
import { withExportIdentityLock } from "./export-identity-lock.js";
import {
  isGoogleExportConfigured,
  publishGoogleArtifact,
} from "./export-google-adapter.js";
import {
  isMicrosoftExportConfigured,
  publishMicrosoftArtifact,
} from "./export-microsoft-adapter.js";
import { sanitizeProviderMessage } from "./export-provider-http.js";

const DEFAULT_ADAPTERS = Object.freeze({
  google: Object.freeze({
    isConfigured: isGoogleExportConfigured,
    publish: publishGoogleArtifact,
  }),
  microsoft: Object.freeze({
    isConfigured: isMicrosoftExportConfigured,
    publish: publishMicrosoftArtifact,
  }),
});

const moduleRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const fallbackEnabled = (env) => {
  const value = String(env.AGENTICGRAPH_EXPORT_MICROSOFT_FALLBACK_ENABLED ?? "true")
    .trim()
    .toLowerCase();
  return value !== "0" && value !== "false" && value !== "off";
};

const buildProviderSequence = ({ request, configured, env }) => {
  if (request.target_provider === "microsoft") {
    return configured.microsoft ? ["microsoft"] : [];
  }
  const sequence = configured.google ? ["google"] : [];
  if (fallbackEnabled(env) && configured.microsoft) sequence.push("microsoft");
  return sequence;
};

const providerFailureIsFallbackEligible = (error) => (
  error?.retryable === true
);

const safeProviderFailure = (error, provider) => ({
  provider,
  code: String(error?.code || "PROVIDER_REQUEST_FAILED").slice(0, 128),
  status: Number(error?.status || 0),
  retryable: error?.retryable === true,
  message: sanitizeProviderMessage(
    error instanceof Error ? error.message : error,
    "Provider request failed",
  ),
});

const asToolError = (error) => {
  const source = error instanceof ExportPublishError
    ? error
    : createExportPublishError("EXPORT_FAILED", sanitizeProviderMessage(
      error instanceof Error ? error.message : error,
      "External export failed.",
    ), {
      cause: error,
    });
  return {
    schema: EXPORT_PUBLISH_CONTRACT_VERSION,
    error: {
      code: source.code,
      message: source.message,
      ...(source.provider ? { provider: source.provider } : {}),
      ...(source.details ? { details: source.details } : {}),
    },
  };
};

const readExistingExport = async ({ findLatest, identity, ledgerOptions }) => {
  try {
    return await findLatest(identity, ledgerOptions);
  } catch (error) {
    if (error?.code === "LEDGER_CORRUPT" && error?.cause?.code === "ENOENT") return null;
    throw error;
  }
};

const assertSourceUnchanged = async ({ artifact, readArtifact, artifactOptions }) => {
  const current = await readArtifact(artifact.artifact_id, artifactOptions);
  if (current.source_sha256 !== artifact.source_sha256) {
    throw createExportPublishError(
      "EXPORT_FAILED",
      "Source KGC changed during external publication; the result was rejected.",
      { details: { source_changed: true } },
    );
  }
};

export const runExportPublish = async (input, options = {}) => {
  const request = validateExportPublishRequest(input);
  const env = options.env ?? process.env;
  const repoRoot = options.repoRoot;
  const adapters = options.adapters ?? DEFAULT_ADAPTERS;
  const readArtifact = options.readArtifact ?? readExportArtifact;
  const findLatest = options.findLatest ?? findLatestSuccessfulExport;
  const appendLedger = options.appendLedger ?? appendFleetExportEntry;
  const artifactOptions = { ...(repoRoot ? { repoRoot } : {}) };
  const ledgerOptions = {
    ...(options.ledgerOptions ?? {}),
    env,
    ...(repoRoot ? { repoRoot } : {}),
    ...(options.ledgerPath ? { ledgerPath: options.ledgerPath } : {}),
  };
  const publicationNamespace = path.resolve(
    options.publicationNamespace
      ?? repoRoot
      ?? process.env.AGENTICGRAPH_ROOT
      ?? moduleRepoRoot,
  );
  const withIdentityLock = options.withIdentityLock ?? withExportIdentityLock;
  const artifact = await readArtifact(request.artifact_id, artifactOptions);
  const configured = {
    google: adapters.google.isConfigured(env),
    microsoft: adapters.microsoft.isConfigured(env),
  };
  const sequence = buildProviderSequence({ request, configured, env });
  if (sequence.length === 0) {
    throw createExportPublishError(
      "PROVIDER_NOT_CONFIGURED",
      request.target_provider === "microsoft"
        ? "Microsoft export credentials are not configured."
        : "Neither Google export nor Microsoft fallback credentials are configured.",
      { provider: request.target_provider },
    );
  }

  const failures = [];
  for (const [index, provider] of sequence.entries()) {
    const fallbackUsed = request.target_provider === "google" && provider === "microsoft";
    const hasNext = index + 1 < sequence.length;
    const identity = createExportIdentity({
      artifact_id: artifact.artifact_id,
      provider,
      kind: request.kind,
    });
    const attempt = await withIdentityLock({
      identityKey: identity.key,
      publicationNamespace,
    }, async () => {
      const existing = await readExistingExport({ findLatest, identity, ledgerOptions });
      let published;
      try {
        published = await adapters[provider].publish({
          artifact,
          kind: request.kind,
          identity: identity.key,
          existing: existing ? { external_id: existing.doc_id, url: existing.url } : null,
          env,
          fetchImpl: options.fetchImpl ?? globalThis.fetch,
          officeRuntime: options.officeRuntime,
        });
        if (
          published?.provider !== provider
          || !published.externalId
          || !published.url
          || !published.mimeType
        ) {
          throw createExportPublishError("EXPORT_FAILED", `${provider} returned an invalid export receipt.`, {
            provider,
          });
        }
        await assertSourceUnchanged({ artifact, readArtifact, artifactOptions });
        await appendLedger({
          artifact_id: artifact.artifact_id,
          provider,
          kind: request.kind,
          status: "success",
          fallback_used: fallbackUsed,
          source_sha256: artifact.source_sha256,
          api_calls: Number.isInteger(published.apiCalls) ? published.apiCalls : 0,
          estimated_cost_usd: 0,
          doc_id: published.externalId,
          url: published.url,
        }, ledgerOptions);
        return {
          result: validateExportPublishResult({
            schema: EXPORT_PUBLISH_CONTRACT_VERSION,
            artifact_id: artifact.artifact_id,
            kind: request.kind,
            provider,
            doc_id: published.externalId,
            url: published.url,
            url_or_file_id: published.url,
            fallback_used: fallbackUsed,
            source_sha256: artifact.source_sha256,
          }),
        };
      } catch (error) {
        if (published?.created && typeof published.cleanup === "function") {
          try {
            await published.cleanup();
          } catch {
            // Cleanup is compensating best effort; preserve the originating failure.
          }
        }
        const failure = safeProviderFailure(error, provider);
        const fallbackEligible = hasNext && providerFailureIsFallbackEligible(error);
        if (!fallbackEligible) {
          await appendLedger({
            artifact_id: artifact.artifact_id,
            provider,
            kind: request.kind,
            status: "failure",
            fallback_used: fallbackUsed,
            source_sha256: artifact.source_sha256,
            // Adapters expose exact call counts only on success; never invent a
            // provider-call count for a failed partial request.
            api_calls: 0,
            estimated_cost_usd: 0,
            error_code: failure.code,
          }, ledgerOptions);
        }
        return { failure, fallbackEligible };
      }
    }, options.identityLockOptions);
    if (attempt.result) return attempt.result;
    failures.push(attempt.failure);
    if (!attempt.fallbackEligible) break;
  }

  const lastFailure = failures.at(-1);
  throw createExportPublishError("EXPORT_FAILED", "External export failed.", {
    provider: lastFailure?.provider || request.target_provider,
    details: { attempts: failures },
  });
};

export const runExportPublishTool = async (input, options = {}) => {
  try {
    return { payload: await runExportPublish(input, options), isError: false };
  } catch (error) {
    return { payload: asToolError(error), isError: true };
  }
};
