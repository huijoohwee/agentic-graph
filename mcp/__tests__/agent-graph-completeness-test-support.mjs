import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createAgentGraphRuntime } from "../agent-graph/runtime.mjs";
import { agentGraphStoreRoot } from "../agent-graph/store.mjs";

export async function createCompletenessFixture(t, options = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-kg-completeness-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const corpusRoot = path.join(base, "corpus");
  const outputRoot = path.join(base, "output");
  await fs.mkdir(corpusRoot, { recursive: true });
  const runtime = createAgentGraphRuntime({
    agenticGraphRoot: base,
    allowedRoots: [corpusRoot],
    outputRoot,
    ...options,
  });
  return { base, corpusRoot, outputRoot, runtime };
}

export const pointerPath = (value, graphId) => path.join(
  value.outputRoot,
  "graphs",
  `${graphId.slice("kg:graph:".length)}.json`,
);

export async function storedObjects(graphPointer) {
  const objectsRoot = path.join(agentGraphStoreRoot(graphPointer), "objects");
  const prefixes = await fs.readdir(objectsRoot, { withFileTypes: true });
  const values = [];
  for (const prefix of prefixes.filter((entry) => entry.isDirectory())) {
    const files = await fs.readdir(path.join(objectsRoot, prefix.name));
    for (const file of files.filter((name) => name.endsWith(".json"))) {
      values.push(JSON.parse(await fs.readFile(path.join(objectsRoot, prefix.name, file), "utf8")));
    }
  }
  return values;
}
