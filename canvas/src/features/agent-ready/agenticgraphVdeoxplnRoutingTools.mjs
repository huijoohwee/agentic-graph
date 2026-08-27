const normalizeString = (value) => String(value || "").trim();

const readToolNames = (tools = {}) => ({
  local: Array.from(new Set((tools.local || []).map(normalizeString).filter(Boolean))).sort(),
  browserLocal: Array.from(new Set((tools.browserLocal || []).map(normalizeString).filter(Boolean))).sort(),
  published: Array.from(new Set((tools.published || []).map(normalizeString).filter(Boolean))).sort(),
});

export const buildVdeoxplnToolRoutingAliases = (tools = {}) => {
  const names = readToolNames(tools);
  return [...names.local, ...names.browserLocal, ...names.published].flatMap((name) => {
    const withoutNamespace = name.replace(/^knowgrph\./, "");
    return withoutNamespace && withoutNamespace !== name ? [name, withoutNamespace] : [name];
  });
};

export const buildVdeoxplnToolPromptLines = (tools = {}) => {
  const names = readToolNames(tools);
  const format = (values) => values.length ? values.join(", ") : "none";
  return [
    `- Local MCP tools: ${format(names.local)}`,
    `- Browser-local tools: ${format(names.browserLocal)}`,
    `- Published tools: ${format(names.published)}`,
  ];
};
