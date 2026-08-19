export async function revalidateDefinitions(definitions, validate) {
  const results = [];
  for (const definition of definitions) {
    const result = await validate(definition);
    results.push({ agentId: definition.agentId, result, blocked: result.status !== "pass" });
  }
  return results;
}

export function shouldBlockOnSchemaRevision(definition, currentSchemaRevision) {
  return definition.schemaRevision !== currentSchemaRevision;
}
