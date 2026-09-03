import crypto from "node:crypto";
import { describeGoogleAuth, resolveGoogleAccessToken } from "./export-provider-auth.js";
import {
  deleteProviderResource,
  ExportProviderError,
  requestProviderJson,
} from "./export-provider-http.js";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SHEETS_API = "https://sheets.googleapis.com/v4";
const SLIDES_API = "https://slides.googleapis.com/v1";
const GOOGLE_MIME_TYPES = Object.freeze({
  spreadsheet: "application/vnd.google-apps.spreadsheet",
  slides: "application/vnd.google-apps.presentation",
});
const EMU_PER_INCH = 914400;

const loadOfficeRuntime = () => import("../grph-shared/dist/office/markdownOfficeArtifacts.js");

const normalizeTitle = (artifact, kind) => {
  const suffix = kind === "spreadsheet" ? "Financial Model" : "Slide Deck";
  return `${String(artifact.title || "agentic-graph Export").trim()} — ${suffix}`.slice(0, 200);
};

const escapeDriveQueryValue = (value) => String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const buildDriveIdentity = (identity) => (
  crypto.createHash("sha256").update(String(identity)).digest("hex").slice(0, 48)
);

const buildDriveQueryUrl = ({ identityKey, mimeType, folderId }) => {
  const clauses = [
    "trashed = false",
    `mimeType = '${escapeDriveQueryValue(mimeType)}'`,
    `appProperties has { key='agenticGraphIdentity' and value='${escapeDriveQueryValue(identityKey)}' }`,
  ];
  if (folderId) clauses.push(`'${escapeDriveQueryValue(folderId)}' in parents`);
  const query = new URLSearchParams({
    q: clauses.join(" and "),
    spaces: "drive",
    pageSize: "2",
    fields: "files(id,name,mimeType,webViewLink,trashed,appProperties)",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  return `${DRIVE_API}/files?${query.toString()}`;
};

const getDriveFile = async ({ fileId, accessToken, fetchImpl }) => requestProviderJson({
  fetchImpl,
  provider: "google",
  url: `${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType,webViewLink,trashed,appProperties`,
  accessToken,
});

const driveFileMatchesIdentity = ({ file, identityKey, mimeType }) => (
  Boolean(file?.id)
  && !file.trashed
  && file.mimeType === mimeType
  && file.appProperties?.agenticGraphIdentity === identityKey
);

const findDriveFile = async ({ identityKey, mimeType, folderId, accessToken, fetchImpl }) => {
  const payload = await requestProviderJson({
    fetchImpl,
    provider: "google",
    url: buildDriveQueryUrl({ identityKey, mimeType, folderId }),
    accessToken,
  });
  const files = Array.isArray(payload.files) ? payload.files.filter((file) => !file.trashed) : [];
  if (files.length > 1) {
    throw new ExportProviderError("Google Drive contains duplicate files for the export identity", {
      code: "PROVIDER_IDENTITY_CONFLICT",
      provider: "google",
    });
  }
  if (files[0] && !driveFileMatchesIdentity({ file: files[0], identityKey, mimeType })) {
    throw new ExportProviderError("Google Drive identity lookup returned a mismatched file", {
      code: "PROVIDER_IDENTITY_CONFLICT",
      provider: "google",
    });
  }
  return files[0] || null;
};

const resolveExistingDriveFile = async ({
  existing,
  identityKey,
  mimeType,
  folderId,
  accessToken,
  fetchImpl,
}) => {
  if (existing?.external_id) {
    try {
      const file = await getDriveFile({ fileId: existing.external_id, accessToken, fetchImpl });
      if (driveFileMatchesIdentity({ file, identityKey, mimeType })) return { file, apiCalls: 1 };
    } catch (error) {
      if (!(error instanceof ExportProviderError) || error.status !== 404) throw error;
    }
    return {
      file: await findDriveFile({ identityKey, mimeType, folderId, accessToken, fetchImpl }),
      apiCalls: 2,
    };
  }
  return {
    file: await findDriveFile({ identityKey, mimeType, folderId, accessToken, fetchImpl }),
    apiCalls: 1,
  };
};

const createDriveFile = async ({
  title,
  identityKey,
  mimeType,
  folderId,
  accessToken,
  fetchImpl,
}) => requestProviderJson({
  fetchImpl,
  provider: "google",
  url: `${DRIVE_API}/files?supportsAllDrives=true&fields=id,name,mimeType,webViewLink,trashed,appProperties`,
  method: "POST",
  accessToken,
  body: {
    name: title,
    mimeType,
    appProperties: { agenticGraphIdentity: identityKey },
    ...(folderId ? { parents: [folderId] } : {}),
  },
});

const updateDriveFileName = async ({ fileId, title, accessToken, fetchImpl }) => requestProviderJson({
  fetchImpl,
  provider: "google",
  url: `${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType,webViewLink,trashed,appProperties`,
  method: "PATCH",
  accessToken,
  body: { name: title },
});

const parseNumericCell = (source) => {
  const value = String(source ?? "").trim();
  if (/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value)) {
    return { userEnteredValue: { numberValue: Number(value.replace(/,/g, "")) } };
  }
  const percent = value.match(/^(-?(?:\d+|\d*\.\d+))%$/);
  if (percent) {
    return {
      userEnteredValue: { numberValue: Number(percent[1]) / 100 },
      userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0.00%" } },
    };
  }
  const currency = value.match(/^(RM|MYR|USD|SGD|\$)\s*(-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?)$/i);
  if (currency) {
    return {
      userEnteredValue: { numberValue: Number(currency[2].replace(/,/g, "")) },
      userEnteredFormat: {
        numberFormat: { type: "CURRENCY", pattern: `${currency[1].toUpperCase()} #,##0.00` },
      },
    };
  }
  return { userEnteredValue: { stringValue: value } };
};

const buildSheetRows = (table) => {
  const values = [table.columns, ...table.rows];
  return values.map((row, rowIndex) => ({
    values: row.map((cell) => ({
      ...parseNumericCell(cell),
      ...(rowIndex === 0
        ? { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.88, green: 0.94, blue: 1 } } }
        : {}),
    })),
  }));
};

const updateSpreadsheet = async ({ fileId, title, markdown, accessToken, fetchImpl, officeRuntime }) => {
  const table = officeRuntime.parseBoundedMarkdownPipeTable(markdown);
  if (!table?.columns?.length) {
    throw new ExportProviderError("Spreadsheet export requires a Markdown pipe table", {
      code: "ARTIFACT_CONTENT_INVALID",
      provider: "google",
    });
  }
  const metadata = await requestProviderJson({
    fetchImpl,
    provider: "google",
    url: `${SHEETS_API}/spreadsheets/${encodeURIComponent(fileId)}?fields=sheets(properties(sheetId,title,gridProperties))`,
    accessToken,
  });
  const sheet = metadata?.sheets?.[0]?.properties;
  if (!Number.isInteger(sheet?.sheetId)) {
    throw new ExportProviderError("Google spreadsheet did not expose a writable sheet", {
      code: "PROVIDER_INVALID_RESPONSE",
      provider: "google",
    });
  }
  const rowCount = Math.max(Number(sheet.gridProperties?.rowCount || 0), table.rows.length + 1, 2);
  const columnCount = Math.max(Number(sheet.gridProperties?.columnCount || 0), table.columns.length, 1);
  await requestProviderJson({
    fetchImpl,
    provider: "google",
    url: `${SHEETS_API}/spreadsheets/${encodeURIComponent(fileId)}:batchUpdate`,
    method: "POST",
    accessToken,
    body: {
      requests: [
        {
          updateSpreadsheetProperties: {
            properties: { title },
            fields: "title",
          },
        },
        {
          updateSheetProperties: {
            properties: {
              sheetId: sheet.sheetId,
              gridProperties: { rowCount, columnCount, frozenRowCount: 1 },
            },
            fields: "gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount",
          },
        },
        {
          updateCells: {
            range: { sheetId: sheet.sheetId },
            fields: "userEnteredValue,userEnteredFormat",
          },
        },
        {
          updateCells: {
            start: { sheetId: sheet.sheetId, rowIndex: 0, columnIndex: 0 },
            rows: buildSheetRows(table),
            fields: "userEnteredValue,userEnteredFormat",
          },
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: sheet.sheetId,
              dimension: "COLUMNS",
              startIndex: 0,
              endIndex: table.columns.length,
            },
          },
        },
      ],
    },
  });
  return 2;
};

const slideObjectId = (prefix, index, suffix) => `${prefix}_${index}_${suffix}`.slice(0, 50);

const buildSlideRequests = ({ slides, prefix, oldSlideIds }) => {
  const requests = [];
  slides.forEach((slide, index) => {
    const slideId = slideObjectId(prefix, index, "slide");
    const titleId = slideObjectId(prefix, index, "title");
    const bodyId = slideObjectId(prefix, index, "body");
    requests.push(
      { createSlide: { objectId: slideId, slideLayoutReference: { predefinedLayout: "BLANK" } } },
      {
        createShape: {
          objectId: titleId,
          shapeType: "TEXT_BOX",
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: 8.6 * EMU_PER_INCH, unit: "EMU" },
              height: { magnitude: 0.8 * EMU_PER_INCH, unit: "EMU" },
            },
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: 0.7 * EMU_PER_INCH,
              translateY: 0.45 * EMU_PER_INCH,
              unit: "EMU",
            },
          },
        },
      },
      { insertText: { objectId: titleId, text: slide.title || `Slide ${index + 1}`, insertionIndex: 0 } },
      {
        updateTextStyle: {
          objectId: titleId,
          style: { bold: true, fontSize: { magnitude: 28, unit: "PT" } },
          textRange: { type: "ALL" },
          fields: "bold,fontSize",
        },
      },
    );
    const body = slide.bodyLines.join("\n").trim();
    if (body) {
      requests.push(
        {
          createShape: {
            objectId: bodyId,
            shapeType: "TEXT_BOX",
            elementProperties: {
              pageObjectId: slideId,
              size: {
                width: { magnitude: 8.6 * EMU_PER_INCH, unit: "EMU" },
                height: { magnitude: 3.8 * EMU_PER_INCH, unit: "EMU" },
              },
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: 0.7 * EMU_PER_INCH,
                translateY: 1.45 * EMU_PER_INCH,
                unit: "EMU",
              },
            },
          },
        },
        { insertText: { objectId: bodyId, text: body, insertionIndex: 0 } },
        {
          updateTextStyle: {
            objectId: bodyId,
            style: { fontSize: { magnitude: 16, unit: "PT" } },
            textRange: { type: "ALL" },
            fields: "fontSize",
          },
        },
      );
    }
  });
  oldSlideIds.forEach((objectId) => requests.push({ deleteObject: { objectId } }));
  return requests;
};

const updatePresentation = async ({ fileId, markdown, accessToken, fetchImpl, officeRuntime }) => {
  const slides = officeRuntime.parseBoundedMarkdownSlides(markdown);
  if (!slides?.length) {
    throw new ExportProviderError("Slides export requires at least one Markdown slide", {
      code: "ARTIFACT_CONTENT_INVALID",
      provider: "google",
    });
  }
  const presentation = await requestProviderJson({
    fetchImpl,
    provider: "google",
    url: `${SLIDES_API}/presentations/${encodeURIComponent(fileId)}?fields=slides(objectId)`,
    accessToken,
  });
  const prefix = `kgrph_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const oldSlideIds = Array.isArray(presentation.slides)
    ? presentation.slides.map((slide) => String(slide.objectId || "")).filter(Boolean)
    : [];
  await requestProviderJson({
    fetchImpl,
    provider: "google",
    url: `${SLIDES_API}/presentations/${encodeURIComponent(fileId)}:batchUpdate`,
    method: "POST",
    accessToken,
    body: { requests: buildSlideRequests({ slides, prefix, oldSlideIds }) },
  });
  return 2;
};

export const isGoogleExportConfigured = (env = process.env) => describeGoogleAuth(env).configured;

export const publishGoogleArtifact = async ({
  artifact,
  kind,
  identity,
  existing = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  officeRuntime: suppliedOfficeRuntime,
  resolveAccessToken = resolveGoogleAccessToken,
}) => {
  const accessToken = await resolveAccessToken({ env, fetchImpl });
  const officeRuntime = suppliedOfficeRuntime || await loadOfficeRuntime();
  const folderId = String(
    env.AGENTIC_OS_GOOGLE_SHARED_DRIVE_FOLDER_ID
    || env.AGENTIC_OS_GOOGLE_DRIVE_FOLDER_ID
    || "",
  ).trim();
  const mimeType = GOOGLE_MIME_TYPES[kind];
  const identityKey = buildDriveIdentity(identity);
  const title = normalizeTitle(artifact, kind);
  const markdownBody = String(artifact.body || artifact.markdown || "");
  const resolved = await resolveExistingDriveFile({
    existing,
    identityKey,
    mimeType,
    folderId,
    accessToken,
    fetchImpl,
  });
  let file = resolved.file;
  let apiCalls = resolved.apiCalls;
  let created = false;
  if (!file) {
    file = await createDriveFile({
      title,
      identityKey,
      mimeType,
      folderId,
      accessToken,
      fetchImpl,
    });
    apiCalls += 1;
    created = true;
  }

  try {
    if (!created && file.name !== title) {
      await updateDriveFileName({
        fileId: file.id,
        title,
        accessToken,
        fetchImpl,
      });
      apiCalls += 1;
    }
    apiCalls += kind === "spreadsheet"
      ? await updateSpreadsheet({
        fileId: file.id,
        title,
        markdown: markdownBody,
        accessToken,
        fetchImpl,
        officeRuntime,
      })
      : await updatePresentation({
        fileId: file.id,
        markdown: markdownBody,
        accessToken,
        fetchImpl,
        officeRuntime,
      });
    const verified = await getDriveFile({ fileId: file.id, accessToken, fetchImpl });
    apiCalls += 1;
    if (
      !driveFileMatchesIdentity({ file: verified, identityKey, mimeType })
      || verified.name !== title
    ) {
      throw new ExportProviderError("Google Drive read-back did not match the requested artifact", {
        code: "PROVIDER_VERIFY_FAILED",
        provider: "google",
      });
    }
    const url = verified.webViewLink
      || `https://drive.google.com/open?id=${encodeURIComponent(verified.id)}`;
    return {
      provider: "google",
      externalId: verified.id,
      url,
      mimeType,
      created,
      apiCalls,
      cleanup: created
        ? () => deleteProviderResource({
          fetchImpl,
          provider: "google",
          url: `${DRIVE_API}/files/${encodeURIComponent(verified.id)}?supportsAllDrives=true`,
          accessToken,
        })
        : null,
    };
  } catch (error) {
    if (created && file?.id) {
      await deleteProviderResource({
        fetchImpl,
        provider: "google",
        url: `${DRIVE_API}/files/${encodeURIComponent(file.id)}?supportsAllDrives=true`,
        accessToken,
      });
    }
    throw error;
  }
};
