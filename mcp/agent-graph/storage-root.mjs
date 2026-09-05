import fs from "node:fs";
import path from "node:path";

const DEFAULT_OUTPUT_ROOT = "data/outputs/agent-graph";
const LEGACY_OUTPUT_ROOT = "data/outputs/knowledge-graph";

export function selectAgentGraphOutputRoot({
  rootDir,
  configuredRoot,
  pathExists = fs.existsSync,
}) {
  const absoluteRoot = path.resolve(rootDir);
  const configured = String(configuredRoot || "").trim();
  if (configured) return path.resolve(absoluteRoot, configured);

  const currentRoot = path.resolve(absoluteRoot, DEFAULT_OUTPUT_ROOT);
  const legacyRoot = path.resolve(absoluteRoot, LEGACY_OUTPUT_ROOT);
  const currentExists = pathExists(currentRoot);
  const legacyExists = pathExists(legacyRoot);
  if (currentExists && legacyExists) {
    throw new Error("Agent graph storage is ambiguous; set AGENTIC_OS_AGENT_GRAPH_OUTPUT_ROOT to one exact root.");
  }
  return legacyExists ? legacyRoot : currentRoot;
}
