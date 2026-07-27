const SCHEMA_ID = "knowgrph-geospatial-command/v1";

const normalizeCommand = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.kind === "mode.set" && typeof value.enabled === "boolean") {
    return { kind: "mode.set", enabled: value.enabled };
  }
  if (
    value.kind === "extrusion.visibility"
    && typeof value.layerId === "string"
    && value.layerId.trim()
    && typeof value.visible === "boolean"
  ) {
    return { kind: "extrusion.visibility", layerId: value.layerId.trim(), visible: value.visible };
  }
  if (
    value.kind === "asset.visibility"
    && typeof value.assetId === "string"
    && value.assetId.trim()
    && typeof value.visible === "boolean"
  ) {
    return { kind: "asset.visibility", assetId: value.assetId.trim(), visible: value.visible };
  }
  return null;
};

export const runGeospatialLayerTool = (args = {}, defaults = {}) => {
  const command = normalizeCommand(args.command);
  if (!command) {
    return {
      ok: false,
      envelope: {},
      url: "",
      error: {
        code: "invalid-command",
        message: "command must enable mode or set one configured extrusion or asset visibility.",
      },
    };
  }
  const host = typeof args.host === "string" && args.host.trim()
    ? args.host.trim()
    : String(defaults.host || "127.0.0.1");
  const portValue = Number(args.port ?? defaults.port ?? 5173);
  const port = Number.isInteger(portValue) && portValue >= 1 && portValue <= 65535 ? portValue : 5173;
  const envelope = { schemaId: SCHEMA_ID, command };
  const query = new URLSearchParams({
    kgGeo: "1",
    kgGeoCommand: JSON.stringify(envelope),
  });
  return {
    ok: true,
    envelope,
    url: `http://${host}:${port}/?${query.toString()}`,
  };
};
