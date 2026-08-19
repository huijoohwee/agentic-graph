export const REQUIRED_CONFIG_KEYS = [
  "STRAITSX_MCP_GATEWAY_ENDPOINT",
  "STRAITSX_MCP_GATEWAY_CREDENTIAL",
  "AVALANCHE_DATA_API_ENDPOINT",
  "TELEGRAM_BOT_TOKEN",
  "INVOCATION_SURFACE_CONTRACT_SCHEMA_URL",
  "EDGE_ORCHESTRATOR_ENDPOINT",
];

export function validateStartupConfig(env) {
  const missingKeys = REQUIRED_CONFIG_KEYS.filter((key) => !env?.[key]);
  if (missingKeys.length > 0) {
    return { ok: false, reason: "missing-required-config", missingKeys };
  }
  return { ok: true };
}
