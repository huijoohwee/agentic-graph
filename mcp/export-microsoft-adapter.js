import crypto from "node:crypto";
import { describeMicrosoftAuth, resolveMicrosoftAccessToken } from "./export-provider-auth.js";
import {
  deleteProviderResource,
  ExportProviderError,
  requestProviderJson,
} from "./export-provider-http.js";

const GRAPH_API = "https://graph.microsoft.com/v1.0";
const OFFICE_MIME_TYPES = Object.freeze({
  spreadsheet: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  slides: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
});

const loadOfficeRuntime = () => import("../grph-shared/dist/office/markdownOfficeArtifacts.js");

const sanitizeFilePart = (value) => String(value || "artifact")
  .normalize("NFKD")
  .replace(/[^A-Za-z0-9._-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 80) || "artifact";

const encodeDrivePath = (value) => String(value)
  .split("/")
  .filter(Boolean)
  .map((segment) => encodeURIComponent(segment))
  .join("/");

const buildStableFileName = ({ artifact, identity, kind }) => {
  const extension = kind === "spreadsheet" ? "xlsx" : "pptx";
  const base = sanitizeFilePart(artifact.artifact_id || artifact.title);
  const digest = crypto.createHash("sha256").update(identity).digest("hex").slice(0, 12);
  return `${base}-${digest}.${extension}`;
};

const buildDriveItemPath = ({ folderPath, fileName }) => (
  [folderPath.replace(/^\/+|\/+$/g, ""), fileName].filter(Boolean).join("/")
);

export const normalizeMicrosoftFolderPath = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) {
    throw new ExportProviderError("Microsoft OneDrive folder contains a control character or backslash", {
      code: "PROVIDER_CONFIG_INVALID",
      provider: "microsoft",
    });
  }
  const canonical = raw.replace(/^\/+|\/+$/g, "");
  const segments = canonical.split("/");
  if (!canonical || segments.some((segment) => !segment || segment === "." || segment === ".." || segment.trim() !== segment)) {
    throw new ExportProviderError("Microsoft OneDrive folder must use canonical non-traversing path segments", {
      code: "PROVIDER_CONFIG_INVALID",
      provider: "microsoft",
    });
  }
  return canonical;
};

const getGraphItemById = async ({ itemId, accessToken, fetchImpl }) => requestProviderJson({
  fetchImpl,
  provider: "microsoft",
  url: `${GRAPH_API}/me/drive/items/${encodeURIComponent(itemId)}?$select=id,name,webUrl,size,file,deleted,parentReference`,
  accessToken,
});

const getGraphItemByPath = async ({ drivePath, accessToken, fetchImpl }) => {
  try {
    return await requestProviderJson({
      fetchImpl,
      provider: "microsoft",
      url: `${GRAPH_API}/me/drive/root:/${encodeDrivePath(drivePath)}?$select=id,name,webUrl,size,file,deleted,parentReference`,
      accessToken,
    });
  } catch (error) {
    if (error instanceof ExportProviderError && error.status === 404) return null;
    throw error;
  }
};

const driveItemMatchesArtifact = ({ item, fileName, mimeType }) => (
  Boolean(item?.id)
  && !item.deleted
  && item.name === fileName
  && item.file?.mimeType === mimeType
);

const assertCanonicalPathItem = ({ item, fileName, mimeType }) => {
  if (item && !driveItemMatchesArtifact({ item, fileName, mimeType })) {
    throw new ExportProviderError("Microsoft canonical export path is occupied by a conflicting item", {
      code: "PROVIDER_IDENTITY_CONFLICT",
      provider: "microsoft",
    });
  }
  return item;
};

const resolveExistingItem = async ({
  existing,
  drivePath,
  fileName,
  mimeType,
  accessToken,
  fetchImpl,
}) => {
  if (existing?.external_id) {
    try {
      const item = await getGraphItemById({ itemId: existing.external_id, accessToken, fetchImpl });
      if (driveItemMatchesArtifact({ item, fileName, mimeType })) return { item, apiCalls: 1 };
    } catch (error) {
      if (!(error instanceof ExportProviderError) || error.status !== 404) throw error;
    }
    const pathItem = await getGraphItemByPath({ drivePath, accessToken, fetchImpl });
    return {
      item: assertCanonicalPathItem({ item: pathItem, fileName, mimeType }),
      apiCalls: 2,
    };
  }
  const pathItem = await getGraphItemByPath({ drivePath, accessToken, fetchImpl });
  return {
    item: assertCanonicalPathItem({ item: pathItem, fileName, mimeType }),
    apiCalls: 1,
  };
};

const buildOfficeArtifact = async ({ kind, markdown, title, officeRuntime }) => {
  const artifact = kind === "spreadsheet"
    ? officeRuntime.buildSpreadsheetArtifactFromMarkdown({ markdown, sheetName: title })
    : officeRuntime.buildPresentationArtifactFromMarkdown({ markdown, title });
  if (!(artifact?.bytes instanceof Uint8Array) || artifact.bytes.byteLength === 0) {
    throw new ExportProviderError("Native Office conversion returned no bytes", {
      code: "ARTIFACT_CONVERSION_FAILED",
      provider: "microsoft",
    });
  }
  const expectedMimeType = OFFICE_MIME_TYPES[kind];
  if (artifact.mimeType !== expectedMimeType) {
    throw new ExportProviderError("Native Office conversion returned an unexpected MIME type", {
      code: "ARTIFACT_CONVERSION_FAILED",
      provider: "microsoft",
    });
  }
  return artifact;
};

const uploadOfficeArtifact = async ({
  existingItem,
  drivePath,
  officeArtifact,
  accessToken,
  fetchImpl,
}) => requestProviderJson({
  fetchImpl,
  provider: "microsoft",
  url: existingItem?.id
    ? `${GRAPH_API}/me/drive/items/${encodeURIComponent(existingItem.id)}/content`
    : `${GRAPH_API}/me/drive/root:/${encodeDrivePath(drivePath)}:/content`,
  method: "PUT",
  accessToken,
  headers: { "Content-Type": officeArtifact.mimeType },
  body: officeArtifact.bytes,
});

export const isMicrosoftExportConfigured = (env = process.env) => (
  describeMicrosoftAuth(env).configured
);

export const publishMicrosoftArtifact = async ({
  artifact,
  kind,
  identity,
  existing = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  officeRuntime: suppliedOfficeRuntime,
  resolveAccessToken = resolveMicrosoftAccessToken,
}) => {
  const folderPath = normalizeMicrosoftFolderPath(env.AGENTICGRAPH_MICROSOFT_ONEDRIVE_FOLDER);
  const accessToken = await resolveAccessToken({ env, fetchImpl });
  const officeRuntime = suppliedOfficeRuntime || await loadOfficeRuntime();
  const title = String(artifact.title || "AgenticGraph Export").trim().slice(0, 200);
  const fileName = buildStableFileName({ artifact, identity, kind });
  const drivePath = buildDriveItemPath({ folderPath, fileName });
  const officeArtifact = await buildOfficeArtifact({
    kind,
    markdown: String(artifact.body || artifact.markdown || ""),
    title,
    officeRuntime,
  });
  const resolved = await resolveExistingItem({
    existing,
    drivePath,
    fileName,
    mimeType: officeArtifact.mimeType,
    accessToken,
    fetchImpl,
  });
  const existingItem = resolved.item;
  const created = !existingItem;

  let uploaded;
  try {
    uploaded = await uploadOfficeArtifact({
      existingItem,
      drivePath,
      officeArtifact,
      accessToken,
      fetchImpl,
    });
    if (!uploaded?.id) {
      throw new ExportProviderError("Microsoft Graph upload returned no Drive item ID", {
        code: "PROVIDER_INVALID_RESPONSE",
        provider: "microsoft",
      });
    }
    const verified = await getGraphItemById({
      itemId: uploaded.id,
      accessToken,
      fetchImpl,
    });
    const actualMimeType = String(verified?.file?.mimeType || "");
    if (
      !verified.id
      || verified.deleted
      || verified.name !== fileName
      || actualMimeType !== officeArtifact.mimeType
      || Number(verified.size || 0) !== officeArtifact.bytes.byteLength
    ) {
      throw new ExportProviderError("Microsoft Graph read-back did not match the native Office artifact", {
        code: "PROVIDER_VERIFY_FAILED",
        provider: "microsoft",
      });
    }
    return {
      provider: "microsoft",
      externalId: verified.id,
      url: verified.webUrl,
      mimeType: actualMimeType,
      created,
      apiCalls: resolved.apiCalls + 2,
      byteLength: officeArtifact.bytes.byteLength,
      sha256: crypto.createHash("sha256").update(officeArtifact.bytes).digest("hex"),
      cleanup: created
        ? () => deleteProviderResource({
          fetchImpl,
          provider: "microsoft",
          url: `${GRAPH_API}/me/drive/items/${encodeURIComponent(verified.id)}`,
          accessToken,
        })
        : null,
    };
  } catch (error) {
    if (created && uploaded?.id) {
      await deleteProviderResource({
        fetchImpl,
        provider: "microsoft",
        url: `${GRAPH_API}/me/drive/items/${encodeURIComponent(uploaded.id)}`,
        accessToken,
      });
    }
    throw error;
  }
};
