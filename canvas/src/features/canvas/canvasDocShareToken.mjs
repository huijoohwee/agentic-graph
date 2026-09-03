export const PUBLISHED_DOC_SHARE_TOKEN_PARAM = "kgShare";

const textEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
const textDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;

const toBase64 = (bytes) => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const fromBase64 = (value) => {
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(value, "base64"));
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const toBase64Url = (value) => value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const fromBase64Url = (value) => {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized) return "";
  const padLength = normalized.length % 4;
  return padLength ? `${normalized}${"=".repeat(4 - padLength)}` : normalized;
};

const encodeUtf8Base64Url = (value) => {
  if (!textEncoder) {
    throw new Error("TextEncoder is required to encode published doc share tokens");
  }
  return toBase64Url(toBase64(textEncoder.encode(String(value || ""))));
};

const decodeUtf8Base64Url = (value) => {
  if (!textDecoder) {
    throw new Error("TextDecoder is required to decode published doc share tokens");
  }
  return textDecoder.decode(fromBase64(fromBase64Url(value)));
};

const normalizeWorkspaceId = (value) => {
  const workspaceId = String(value || "").trim();
  return workspaceId || null;
};

const normalizeCanonicalPath = (value) => String(value || "").trim();
const DEFAULT_APP_BASE_PATH = "/agentic-graph";
const DEFAULT_DOC_SHARE_PREFIX = "/doc-default/";
const WORKSPACE_DOC_SHARE_PREFIX = "/doc/";
const TOKEN_DOC_SHARE_PREFIX = "/share/";
const WORKSPACE_ID_PARAM = "kgWorkspaceId";
const CANONICAL_PATH_PARAM = "kgCanonicalPath";

const normalizeAppBasePath = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return DEFAULT_APP_BASE_PATH;
  return `/${normalized.replace(/^\/+|\/+$/g, "")}`;
};

const scopePublishedDocKgPath = (rawPath, appBasePath) => {
  const normalizedBasePath = normalizeAppBasePath(appBasePath);
  const normalizedRawPath = `/${String(rawPath || "").trim().replace(/^\/+/, "")}`;
  if (
    normalizedBasePath === "/"
    || normalizedRawPath === normalizedBasePath
    || normalizedRawPath.startsWith(`${normalizedBasePath}/`)
  ) {
    return normalizedRawPath;
  }
  return `${normalizedBasePath}${normalizedRawPath}`;
};

const normalizePublishedDocIdentity = (args) => {
  const canonicalPath = normalizeCanonicalPath(args?.canonicalPath);
  if (!canonicalPath) return null;
  return {
    canonicalPath,
    workspaceId: normalizeWorkspaceId(args?.workspaceId),
  };
};

const parsePublishedDocPathname = (pathname, appBasePath) => {
  const normalizedBasePath = normalizeAppBasePath(appBasePath);
  const normalizedPathname = String(pathname || "").replace(/\/+$/, "") || "/";
  if (!normalizedPathname.startsWith(normalizedBasePath)) return null;
  const scopedPath = normalizedBasePath === "/"
    ? normalizedPathname
    : normalizedPathname.slice(normalizedBasePath.length) || "/";
  if (scopedPath.startsWith(TOKEN_DOC_SHARE_PREFIX)) {
    const shareToken = decodeURIComponent(scopedPath.slice(TOKEN_DOC_SHARE_PREFIX.length)).trim();
    return decodePublishedDocShareToken(shareToken);
  }
  if (scopedPath.startsWith(DEFAULT_DOC_SHARE_PREFIX)) {
    return normalizePublishedDocIdentity({
      canonicalPath: decodeURIComponent(scopedPath.slice(DEFAULT_DOC_SHARE_PREFIX.length)),
    });
  }
  if (!scopedPath.startsWith(WORKSPACE_DOC_SHARE_PREFIX)) return null;
  const suffix = scopedPath.slice(WORKSPACE_DOC_SHARE_PREFIX.length);
  const firstSlash = suffix.indexOf("/");
  if (firstSlash < 1) return null;
  return normalizePublishedDocIdentity({
    workspaceId: decodeURIComponent(suffix.slice(0, firstSlash)),
    canonicalPath: decodeURIComponent(suffix.slice(firstSlash + 1)),
  });
};

const parsePublishedDocSearchParams = (searchParams, appBasePath) => {
  const shareToken = decodePublishedDocShareToken(searchParams?.get(PUBLISHED_DOC_SHARE_TOKEN_PARAM));
  if (shareToken) return shareToken;
  const canonicalPath = normalizeCanonicalPath(decodeURIComponent(String(searchParams?.get(CANONICAL_PATH_PARAM) || "")));
  if (canonicalPath) {
    return normalizePublishedDocIdentity({
      workspaceId: decodeURIComponent(String(searchParams?.get(WORKSPACE_ID_PARAM) || "")),
      canonicalPath,
    });
  }
  const rawPath = String(searchParams?.get("kgPath") || "").trim();
  if (!rawPath) return null;
  const normalizedBasePath = normalizeAppBasePath(appBasePath);
  return parsePublishedDocPathname(scopePublishedDocKgPath(rawPath, normalizedBasePath), normalizedBasePath);
};

export const encodePublishedDocShareToken = (args) => {
  const canonicalPath = normalizeCanonicalPath(args?.canonicalPath);
  if (!canonicalPath) return "";
  const payload = {
    canonicalPath,
    workspaceId: normalizeWorkspaceId(args?.workspaceId),
  };
  return encodeUtf8Base64Url(JSON.stringify(payload));
};

export const decodePublishedDocShareToken = (token) => {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return null;
  try {
    const payload = JSON.parse(decodeUtf8Base64Url(normalizedToken));
    const canonicalPath = normalizeCanonicalPath(payload?.canonicalPath);
    if (!canonicalPath) return null;
    return {
      canonicalPath,
      workspaceId: normalizeWorkspaceId(payload?.workspaceId),
    };
  } catch {
    return null;
  }
};

export const resolvePublishedDocIdentity = (args = {}) => {
  const directShareToken = decodePublishedDocShareToken(args.shareToken);
  if (directShareToken) return directShareToken;
  const shareUrl = String(args.shareUrl || "").trim();
  if (!shareUrl) return null;
  try {
    const normalizedBaseUrl = String(args.baseUrl || "https://airvio.co").trim() || "https://airvio.co";
    const url = new URL(shareUrl, normalizedBaseUrl);
    return parsePublishedDocSearchParams(url.searchParams, args.appBasePath)
      || parsePublishedDocPathname(url.pathname, args.appBasePath);
  } catch {
    return null;
  }
};

// Keep the published HTML fallback resolver as a plain source literal so bundlers
// cannot rewrite nested helpers to page-scoped symbols like __name().
export const PUBLISHED_DOC_IDENTITY_RESOLVER_BROWSER_SOURCE = String.raw`(args = {}) => {
  const publishedDocShareTokenParam = String(args.publishedDocShareTokenParam || "kgShare");
  const workspaceIdParam = String(args.workspaceIdParam || "kgWorkspaceId");
  const canonicalPathParam = String(args.canonicalPathParam || "kgCanonicalPath");
  const kgPathParam = String(args.kgPathParam || "kgPath");
  const defaultAppBasePath = String(args.defaultAppBasePath || "/agentic-graph").trim() || "/agentic-graph";

  const normalizeWorkspaceId = (value) => {
    const workspaceId = String(value || "").trim();
    return workspaceId || null;
  };
  const normalizeCanonicalPath = (value) => String(value || "").trim();
  const normalizeAppBasePath = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized) return defaultAppBasePath;
    return "/" + normalized.replace(/^\/+|\/+$/g, "");
  };
  const scopePublishedDocKgPath = (rawPath, appBasePath) => {
    const normalizedBasePath = normalizeAppBasePath(appBasePath);
    const normalizedRawPath = "/" + String(rawPath || "").trim().replace(/^\/+/, "");
    if (
      normalizedBasePath === "/"
      || normalizedRawPath === normalizedBasePath
      || normalizedRawPath.startsWith(normalizedBasePath + "/")
    ) {
      return normalizedRawPath;
    }
    return normalizedBasePath + normalizedRawPath;
  };
  const normalizePublishedDocIdentity = (identityArgs) => {
    const canonicalPath = normalizeCanonicalPath(identityArgs && identityArgs.canonicalPath);
    if (!canonicalPath) return null;
    return {
      canonicalPath,
      workspaceId: normalizeWorkspaceId(identityArgs && identityArgs.workspaceId),
    };
  };
  const decodePublishedDocShareTokenLocal = (token) => {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken) return null;
    try {
      const normalizedBase64 = normalizedToken.replace(/-/g, "+").replace(/_/g, "/");
      const paddedBase64 = normalizedBase64.length % 4
        ? normalizedBase64 + "=".repeat(4 - (normalizedBase64.length % 4))
        : normalizedBase64;
      let bytes;
      if (typeof Buffer !== "undefined") {
        bytes = Uint8Array.from(Buffer.from(paddedBase64, "base64"));
      } else {
        const binary = atob(paddedBase64);
        bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
      }
      const decoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;
      if (!decoder) return null;
      const payload = JSON.parse(decoder.decode(bytes));
      const canonicalPath = normalizeCanonicalPath(payload && payload.canonicalPath);
      if (!canonicalPath) return null;
      return {
        canonicalPath,
        workspaceId: normalizeWorkspaceId(payload && payload.workspaceId),
      };
    } catch {
      return null;
    }
  };
  const parsePublishedDocPathname = (pathname, appBasePath) => {
    const normalizedBasePath = normalizeAppBasePath(appBasePath);
    const normalizedPathname = String(pathname || "").replace(/\/+$/, "") || "/";
    if (!normalizedPathname.startsWith(normalizedBasePath)) return null;
    const scopedPath = normalizedBasePath === "/"
      ? normalizedPathname
      : normalizedPathname.slice(normalizedBasePath.length) || "/";
    if (scopedPath.startsWith("/share/")) {
      return decodePublishedDocShareTokenLocal(decodeURIComponent(scopedPath.slice("/share/".length)));
    }
    if (scopedPath.startsWith("/doc-default/")) {
      return normalizePublishedDocIdentity({
        canonicalPath: decodeURIComponent(scopedPath.slice("/doc-default/".length)),
      });
    }
    if (!scopedPath.startsWith("/doc/")) return null;
    const suffix = scopedPath.slice("/doc/".length);
    const firstSlash = suffix.indexOf("/");
    if (firstSlash < 1) return null;
    return normalizePublishedDocIdentity({
      workspaceId: decodeURIComponent(suffix.slice(0, firstSlash)),
      canonicalPath: decodeURIComponent(suffix.slice(firstSlash + 1)),
    });
  };
  const parsePublishedDocSearchParams = (searchParams, appBasePath) => {
    const shareToken = decodePublishedDocShareTokenLocal(searchParams && searchParams.get(publishedDocShareTokenParam));
    if (shareToken) return shareToken;
    const canonicalPath = normalizeCanonicalPath(
      decodeURIComponent(String((searchParams && searchParams.get(canonicalPathParam)) || "")),
    );
    if (canonicalPath) {
      return normalizePublishedDocIdentity({
        workspaceId: decodeURIComponent(String((searchParams && searchParams.get(workspaceIdParam)) || "")),
        canonicalPath,
      });
    }
    const rawPath = String((searchParams && searchParams.get(kgPathParam)) || "").trim();
    if (!rawPath) return null;
    const normalizedBasePath = normalizeAppBasePath(appBasePath);
    return parsePublishedDocPathname(scopePublishedDocKgPath(rawPath, normalizedBasePath), normalizedBasePath);
  };

  return (resolverArgs = {}) => {
    const directShareToken = decodePublishedDocShareTokenLocal(resolverArgs.shareToken);
    if (directShareToken) return directShareToken;
    const shareUrl = String(resolverArgs.shareUrl || "").trim();
    if (!shareUrl) return null;
    try {
      const normalizedBaseUrl = String(resolverArgs.baseUrl || "https://airvio.co").trim() || "https://airvio.co";
      const url = new URL(shareUrl, normalizedBaseUrl);
      return parsePublishedDocSearchParams(url.searchParams, resolverArgs.appBasePath)
        || parsePublishedDocPathname(url.pathname, resolverArgs.appBasePath);
    } catch {
      return null;
    }
  };
}`;

export const createPublishedDocIdentityResolver = (args = {}) => {
  const publishedDocShareTokenParam = String(args.publishedDocShareTokenParam || "kgShare");
  const workspaceIdParam = String(args.workspaceIdParam || "kgWorkspaceId");
  const canonicalPathParam = String(args.canonicalPathParam || "kgCanonicalPath");
  const kgPathParam = String(args.kgPathParam || "kgPath");
  const defaultAppBasePath = String(args.defaultAppBasePath || "/agentic-graph").trim() || "/agentic-graph";

  const normalizeWorkspaceId = (value) => {
    const workspaceId = String(value || "").trim();
    return workspaceId || null;
  };
  const normalizeCanonicalPath = (value) => String(value || "").trim();
  const normalizeAppBasePath = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized) return defaultAppBasePath;
    return `/${normalized.replace(/^\/+|\/+$/g, "")}`;
  };
  const scopePublishedDocKgPath = (rawPath, appBasePath) => {
    const normalizedBasePath = normalizeAppBasePath(appBasePath);
    const normalizedRawPath = `/${String(rawPath || "").trim().replace(/^\/+/, "")}`;
    if (
      normalizedBasePath === "/"
      || normalizedRawPath === normalizedBasePath
      || normalizedRawPath.startsWith(`${normalizedBasePath}/`)
    ) {
      return normalizedRawPath;
    }
    return `${normalizedBasePath}${normalizedRawPath}`;
  };
  const normalizePublishedDocIdentity = (identityArgs) => {
    const canonicalPath = normalizeCanonicalPath(identityArgs?.canonicalPath);
    if (!canonicalPath) return null;
    return {
      canonicalPath,
      workspaceId: normalizeWorkspaceId(identityArgs?.workspaceId),
    };
  };
  const decodePublishedDocShareTokenLocal = (token) => {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken) return null;
    try {
      const normalizedBase64 = normalizedToken.replace(/-/g, "+").replace(/_/g, "/");
      const paddedBase64 = normalizedBase64.length % 4
        ? `${normalizedBase64}${"=".repeat(4 - (normalizedBase64.length % 4))}`
        : normalizedBase64;
      let bytes;
      if (typeof Buffer !== "undefined") {
        bytes = Uint8Array.from(Buffer.from(paddedBase64, "base64"));
      } else {
        const binary = atob(paddedBase64);
        bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
      }
      const decoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;
      if (!decoder) return null;
      const payload = JSON.parse(decoder.decode(bytes));
      const canonicalPath = normalizeCanonicalPath(payload?.canonicalPath);
      if (!canonicalPath) return null;
      return {
        canonicalPath,
        workspaceId: normalizeWorkspaceId(payload?.workspaceId),
      };
    } catch {
      return null;
    }
  };
  const parsePublishedDocPathname = (pathname, appBasePath) => {
    const normalizedBasePath = normalizeAppBasePath(appBasePath);
    const normalizedPathname = String(pathname || "").replace(/\/+$/, "") || "/";
    if (!normalizedPathname.startsWith(normalizedBasePath)) return null;
    const scopedPath = normalizedBasePath === "/"
      ? normalizedPathname
      : normalizedPathname.slice(normalizedBasePath.length) || "/";
    if (scopedPath.startsWith("/share/")) {
      return decodePublishedDocShareTokenLocal(decodeURIComponent(scopedPath.slice("/share/".length)));
    }
    if (scopedPath.startsWith("/doc-default/")) {
      return normalizePublishedDocIdentity({
        canonicalPath: decodeURIComponent(scopedPath.slice("/doc-default/".length)),
      });
    }
    if (!scopedPath.startsWith("/doc/")) return null;
    const suffix = scopedPath.slice("/doc/".length);
    const firstSlash = suffix.indexOf("/");
    if (firstSlash < 1) return null;
    return normalizePublishedDocIdentity({
      workspaceId: decodeURIComponent(suffix.slice(0, firstSlash)),
      canonicalPath: decodeURIComponent(suffix.slice(firstSlash + 1)),
    });
  };
  const parsePublishedDocSearchParams = (searchParams, appBasePath) => {
    const shareToken = decodePublishedDocShareTokenLocal(searchParams?.get(publishedDocShareTokenParam));
    if (shareToken) return shareToken;
    const canonicalPath = normalizeCanonicalPath(decodeURIComponent(String(searchParams?.get(canonicalPathParam) || "")));
    if (canonicalPath) {
      return normalizePublishedDocIdentity({
        workspaceId: decodeURIComponent(String(searchParams?.get(workspaceIdParam) || "")),
        canonicalPath,
      });
    }
    const rawPath = String(searchParams?.get(kgPathParam) || "").trim();
    if (!rawPath) return null;
    const normalizedBasePath = normalizeAppBasePath(appBasePath);
    return parsePublishedDocPathname(scopePublishedDocKgPath(rawPath, normalizedBasePath), normalizedBasePath);
  };

  return (resolverArgs = {}) => {
    const directShareToken = decodePublishedDocShareTokenLocal(resolverArgs.shareToken);
    if (directShareToken) return directShareToken;
    const shareUrl = String(resolverArgs.shareUrl || "").trim();
    if (!shareUrl) return null;
    try {
      const normalizedBaseUrl = String(resolverArgs.baseUrl || "https://airvio.co").trim() || "https://airvio.co";
      const url = new URL(shareUrl, normalizedBaseUrl);
      return parsePublishedDocSearchParams(url.searchParams, resolverArgs.appBasePath)
        || parsePublishedDocPathname(url.pathname, resolverArgs.appBasePath);
    } catch {
      return null;
    }
  };
};
