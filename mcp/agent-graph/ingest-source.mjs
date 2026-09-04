import fs from "node:fs/promises";
import path from "node:path";

import {
  checkAgentGraphBudget,
  AgentGraphError,
  remainingAgentGraphDuration,
  sha256,
} from "./contract.mjs";
import { resolveRealDirectory } from "./discovery.mjs";
import { acquireRepositoryUrl } from "./repository-acquisition.mjs";
import { ensureAgentGraphStorageRoot } from "./store.mjs";

export const pathIsInside = (candidatePath, rootPath) => {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

async function resolveAllowedRoots(deps, budget) {
  const roots = [
    deps.agenticGraphRoot,
    ...(Array.isArray(deps.allowedRoots) ? deps.allowedRoots : []),
  ].filter(Boolean);
  const resolved = [];
  for (const root of roots) {
    checkAgentGraphBudget({ ...budget, stage: "allowed-root-resolution" });
    const real = await resolveRealDirectory(root, {
      ...budget,
      stage: "allowed-root-resolution",
    });
    if (!resolved.includes(real)) resolved.push(real);
  }
  if (!resolved.length) {
    throw new AgentGraphError(
      "allowed_roots_required",
      "At least one host-owned allowed root is required.",
    );
  }
  return resolved;
}

async function assertLocalRootAllowed(rootPathRaw, deps, budget) {
  const rootPath = await resolveRealDirectory(rootPathRaw, {
    ...budget,
    stage: "input-root-resolution",
  });
  const allowedRoots = await resolveAllowedRoots(deps, budget);
  if (!allowedRoots.some((allowed) => pathIsInside(rootPath, allowed))) {
    throw new AgentGraphError(
      "root_outside_allowed_roots",
      "rootPath is outside the host-owned allowed roots.",
    );
  }
  return rootPath;
}

export async function resolveOutputRoot(deps, budget) {
  const configured = path.resolve(
    deps.outputRoot
    || path.join(deps.agenticGraphRoot, "data", "outputs", "agent-graph"),
  );
  let ancestor = configured;
  const tail = [];
  while (true) {
    checkAgentGraphBudget({ ...budget, stage: "output-root-resolution" });
    try {
      const real = await fs.realpath(ancestor);
      checkAgentGraphBudget({ ...budget, stage: "output-root-resolution" });
      const resolved = path.resolve(real, ...tail);
      if (!pathIsInside(resolved, real)) {
        throw new AgentGraphError(
          "output_outside_output_root",
          "Output root is invalid.",
        );
      }
      return resolved;
    } catch (error) {
      if (error instanceof AgentGraphError) throw error;
    }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) return configured;
    tail.unshift(path.basename(ancestor));
    ancestor = parent;
  }
}

const graphIdFor = (identity) => `kg:graph:${sha256(identity).slice(0, 32)}`;

export async function resolveIngestSource(args, deps, abortSignal, deadline) {
  const budget = { abortSignal, deadline };
  checkAgentGraphBudget({ ...budget, stage: "source-resolution" });
  const hasRoot = Boolean(String(args.rootPath || "").trim());
  const hasUrl = Boolean(String(args.repositoryUrl || "").trim());
  if (hasRoot === hasUrl) {
    throw new AgentGraphError(
      "source_identity_required",
      "Provide exactly one of rootPath or repositoryUrl.",
    );
  }
  const outputRoot = await resolveOutputRoot(deps, budget);
  if (hasUrl) {
    const canonicalOutputRoot = await ensureAgentGraphStorageRoot(outputRoot);
    checkAgentGraphBudget({ ...budget, stage: "repository-acquisition-root" });
    const requestedTimeout = Number(args.acquisitionTimeoutMs);
    const remaining = Math.max(1, remainingAgentGraphDuration(deadline));
    const acquired = await acquireRepositoryUrl({
      repositoryUrl: args.repositoryUrl,
      repositoryRef: args.repositoryRef,
      allowedHosts: deps.repositoryHosts,
      allowPrivateNetwork: deps.allowPrivateRepositoryNetwork === true,
      cacheRoot: path.join(canonicalOutputRoot, "acquisitions"),
      allowedRoot: canonicalOutputRoot,
      abortSignal,
      timeoutMs: Number.isFinite(requestedTimeout) && requestedTimeout > 0
        ? Math.min(requestedTimeout, remaining)
        : remaining,
    });
    checkAgentGraphBudget({ ...budget, stage: "repository-acquisition" });
    return {
      rootPath: acquired.rootPath,
      outputRoot: canonicalOutputRoot,
      graphId: graphIdFor(
        `repository-url\0${acquired.identity.repositoryUrl}\0`
        + `${acquired.identity.ref}\0${acquired.identity.subpath}`,
      ),
      acquisition: acquired.identity,
    };
  }
  const rootPath = await assertLocalRootAllowed(args.rootPath, deps, budget);
  if (rootPath === outputRoot) {
    throw new AgentGraphError(
      "output_root_matches_input_root",
      "The generated-output root must not equal the indexed corpus root.",
    );
  }
  return {
    rootPath,
    outputRoot,
    graphId: graphIdFor(`local-directory\0${rootPath}`),
    acquisition: { mode: "local-directory", networkRequests: 0, complete: true },
  };
}
