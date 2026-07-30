import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

import { createSkillEvolutionFileStore } from "./skill-evolution-file-store.js";
import { createSkillEvolutionHostAdapter } from "./skill-evolution-host-adapter.js";
import { createSkillEvolutionRuntime } from "./skill-evolution-runtime.js";

const namespaceDigest = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 16);

export function resolveSkillEvolutionStateDirectory(env = process.env, rootDir = process.cwd()) {
  const configured = String(env.KNOWGRPH_SKILL_EVOLUTION_STATE_DIR || "").trim();
  if (configured) return path.resolve(configured);
  const configuredStateRoot = String(env.XDG_STATE_HOME || "").trim();
  const stateRoot = configuredStateRoot && path.isAbsolute(configuredStateRoot)
    ? configuredStateRoot
    : path.join(homedir(), ".local", "state");
  const tenant = String(env.KNOWGRPH_SKILL_EVOLUTION_NAMESPACE || "local-operator");
  return path.join(
    stateRoot,
    "knowgrph",
    "skill-evolution",
    namespaceDigest(path.resolve(rootDir)),
    namespaceDigest(tenant),
  );
}

export function createLocalSkillEvolutionRuntime({ rootDir, env = process.env } = {}) {
  const repositoryRoot = path.resolve(rootDir);
  const directory = resolveSkillEvolutionStateDirectory(env, repositoryRoot);
  const relativeStatePath = path.relative(repositoryRoot, directory);
  if (relativeStatePath === "" || (!relativeStatePath.startsWith(`..${path.sep}`) && relativeStatePath !== ".." && !path.isAbsolute(relativeStatePath))) {
    throw new TypeError("Skill-evolution state must remain outside the Knowgrph repository.");
  }
  const adapter = createSkillEvolutionHostAdapter({ rootDir, env });
  const store = createSkillEvolutionFileStore({
    directory,
  });
  return createSkillEvolutionRuntime({ adapter, store, authorize: adapter.authorize });
}
