import fs from "node:fs/promises";
import path from "node:path";

import {
  AGENT_RUN_OUTPUT_SCHEMA_ID,
  resolveAgentDefinition,
} from "../contracts/agent-runtime.schema.js";
import { parseSmeProfileMarkdown } from "../contracts/sme-profile.schema.js";
import {
  buildSmeSourceFiles,
  runSmeRiskCoverageMarkdown,
} from "./sme-risk-coverage/core.js";
import { writeSmeSourceFilesAtomically } from "./sme-risk-coverage/local-source-files.js";

const approvedGateIds = (approvals) =>
  new Set(
    (Array.isArray(approvals) ? approvals : []).flatMap((approval) => {
      if (typeof approval === "string") {
        return approval.trim() ? [approval.trim()] : [];
      }
      if (
        !approval ||
        typeof approval !== "object" ||
        typeof approval.gateId !== "string" ||
        ["rejected", "pending"].includes(approval.approvalState)
      ) {
        return [];
      }
      return [approval.gateId.trim()];
    }),
  );

export async function runLocalAgentRuntime(args, deps) {
  const {
    rootDir,
    pythonBin,
    resolvePath,
    runCommand,
    summarizeArtifacts,
    formatCommand,
    truncate,
    jsonToolResult,
  } = deps;
  const timeoutMs =
    typeof args.timeoutMs === "number" ? args.timeoutMs : undefined;
  const resume = typeof args.resume === "boolean" ? args.resume : false;
  const outputDir =
    typeof args.outputDir === "string" && args.outputDir.trim()
      ? resolvePath(args.outputDir, { allowOutsideRoot: false })
      : path.join(rootDir, "data", "outputs", `superagent-mcp-run-${Date.now()}`);

  const definition = resume
    ? null
    : resolveAgentDefinition(args.agentDefinitionId || args.invocation);
  if (!resume && !definition) {
    throw new Error(
      "A known agentDefinitionId or invocation is required unless resume=true.",
    );
  }
  const mode = typeof args.mode === "string" ? args.mode : "dry-run";
  if (!resume && definition?.runtimeKernel === "sme.risk.profile") {
    if (typeof args.inputPath !== "string" || !args.inputPath.trim()) {
      throw new Error("Missing required argument: inputPath.");
    }
    const inputPath = resolvePath(args.inputPath, { allowOutsideRoot: Boolean(args.allowExternalInput) });
    const markdown = await fs.readFile(inputPath, "utf8");
    let previousProfile = null;
    let previousRun = null;
    if (mode === "live") {
      const current = parseSmeProfileMarkdown(markdown);
      const profileId = current.ok ? current.profile.profile_id : "";
      if (profileId) {
        try {
          const previousMarkdown = await fs.readFile(path.join(outputDir, "sme-agent", "profiles", profileId, "profile.md"), "utf8");
          const previous = runSmeRiskCoverageMarkdown(previousMarkdown);
          if (previous.ok) {
            previousProfile = previous.run.profile;
            previousRun = previous.run;
          }
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
    }
    const result = runSmeRiskCoverageMarkdown(markdown, {
      previousRun,
      previousProfile,
      runId: typeof args.runId === "string" ? args.runId : "",
      tokenBudget: typeof args.tokenBudget === "number" ? args.tokenBudget : undefined,
      timeoutSeconds: typeof timeoutMs === "number" ? timeoutMs / 1000 : undefined,
    });
    if (!result.ok) {
      const payload = {
        contractVersion: AGENT_RUN_OUTPUT_SCHEMA_ID,
        runId: typeof args.runId === "string" && args.runId.trim() ? args.runId.trim() : "validation-failed",
        agentDefinitionId: definition.id,
        invocation: definition.invocation,
        mode,
        status: "blocked",
        plan: { profileId: definition.planProfile, skillId: definition.skillId, topology: definition.topology },
        budgetMeters: { estimatedCostUsd: 0, actualCostUsd: 0, paidProviderCalls: 0 },
        error: result.error,
        result: { costLogs: result.costLogs, mutationPerformed: false },
      };
      return jsonToolResult(payload, true);
    }
    let persistence = { status: "not_requested", paths: [] };
    if (mode === "live") {
      try {
        const written = await writeSmeSourceFilesAtomically(outputDir, buildSmeSourceFiles(result.run));
        persistence = { status: "persisted", ...written };
      } catch (error) {
        return jsonToolResult({
          contractVersion: AGENT_RUN_OUTPUT_SCHEMA_ID,
          runId: result.run.runId,
          agentDefinitionId: definition.id,
          invocation: definition.invocation,
          mode,
          status: "blocked",
          plan: { profileId: definition.planProfile, skillId: definition.skillId, topology: definition.topology },
          budgetMeters: { estimatedCostUsd: 0, actualCostUsd: 0, paidProviderCalls: 0 },
          error: { code: "source_files_write_failed", message: error instanceof Error ? error.message : String(error) },
          result: { costLogs: result.run.costLogs, mutationPerformed: false },
        }, true);
      }
    }
    const payload = {
      contractVersion: AGENT_RUN_OUTPUT_SCHEMA_ID,
      runId: result.run.runId,
      agentDefinitionId: definition.id,
      invocation: definition.invocation,
      mode,
      status: "completed",
      plan: { profileId: definition.planProfile, skillId: definition.skillId, topology: definition.topology },
      budgetMeters: { estimatedCostUsd: 0, actualCostUsd: 0, paidProviderCalls: 0, tokensUsed: 0 },
      result: { ...result.run, persistence, outputDir },
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
      isError: false,
    };
  }
  if (mode === "live" && !approvedGateIds(args.approvals).has("paid-model-call")) {
    return jsonToolResult(
      {
        contractVersion: AGENT_RUN_OUTPUT_SCHEMA_ID,
        runId:
          typeof args.runId === "string" && args.runId.trim()
            ? args.runId.trim()
            : "approval-required",
        agentDefinitionId: definition?.id || "resume",
        invocation: definition?.invocation || "",
        mode,
        status: "approval_required",
        plan: {},
        budgetMeters: {
          estimatedCostUsd: 0,
          actualCostUsd: 0,
          paidProviderCalls: 0,
        },
        error: { code: "approval_required", gateId: "paid-model-call" },
      },
      true,
    );
  }

  const cmdArgs = ["-m", "agentic_graph_parser", "superagent", "--output-dir", outputDir];
  if (resume) {
    cmdArgs.push("--resume");
  } else {
    if (typeof args.inputPath !== "string" || !args.inputPath.trim()) {
      throw new Error("Missing required argument: inputPath (unless resume=true).");
    }
    cmdArgs.push(
      "--input",
      resolvePath(args.inputPath, {
        allowOutsideRoot: Boolean(args.allowExternalInput),
      }),
    );
  }
  if (typeof args.goalPath === "string" && args.goalPath.trim()) {
    cmdArgs.push(
      "--goal-file",
      resolvePath(args.goalPath, { allowOutsideRoot: false }),
    );
  }
  if (typeof args.runId === "string" && args.runId.trim()) {
    cmdArgs.push("--run-id", args.runId.trim());
  }
  if (definition) cmdArgs.push("--agent-definition", definition.id);
  if (typeof args.providerMode === "string" && args.providerMode.trim()) {
    const providerMode = args.providerMode.trim();
    if (!["byteplus-modelark", "mock"].includes(providerMode)) {
      throw new Error("providerMode must be byteplus-modelark or mock.");
    }
    cmdArgs.push("--provider-mode", providerMode);
  }
  if (typeof args.stopAfterStep === "number" && Number.isFinite(args.stopAfterStep)) {
    cmdArgs.push(
      "--stop-after-step",
      String(Math.max(0, Math.floor(args.stopAfterStep))),
    );
  }
  if (typeof args.failOnceTool === "string" && args.failOnceTool.trim()) {
    cmdArgs.push("--fail-once", args.failOnceTool.trim());
  }

  const result = await runCommand(pythonBin, cmdArgs, {
    cwd: rootDir,
    timeoutMs,
  });
  const artifacts = await summarizeArtifacts({ outputDir });
  const outputText = [
    `AGENTIC_OS_ROOT: ${rootDir}`,
    `Command: ${formatCommand(pythonBin, cmdArgs, rootDir)}`,
    `Exit: ${String(result.code)}${result.signal ? ` (signal: ${result.signal})` : ""}`,
    artifacts.length
      ? `Artifacts:\n- ${artifacts.join("\n- ")}`
      : "Artifacts: (none detected)",
    result.stdout.trim() ? `\nSTDOUT:\n${truncate(result.stdout)}` : "",
    result.stderr.trim() ? `\nSTDERR:\n${truncate(result.stderr)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let state = null;
  try {
    state = JSON.parse(await fs.readFile(path.join(outputDir, "state.json"), "utf8"));
  } catch {
    state = null;
  }
  const run = state?.run || {};
  const activeDefinition = state?.agent_definition || definition || {};
  const status =
    run.status === "completed"
      ? "completed"
      : run.status === "interrupted"
        ? "planned"
        : "blocked";
  return {
    content: [{ type: "text", text: outputText }],
    structuredContent: {
      contractVersion: AGENT_RUN_OUTPUT_SCHEMA_ID,
      runId: run.run_id || args.runId || "unknown",
      agentDefinitionId:
        activeDefinition.id || run.agent_definition_id || "unknown",
      invocation:
        activeDefinition.invocation || run.agent_invocation || "",
      mode,
      status,
      plan: {
        profileId: activeDefinition.planProfile || "unknown",
        tasks: state?.plan || [],
        roles: state?.agents || [],
        capabilities: activeDefinition.capabilities || [],
      },
      budgetMeters: {
        estimatedCostUsd: 0,
        actualCostUsd: 0,
        paidProviderCalls: 0,
      },
      result: {
        outputDir,
        verification: state?.verification || {},
        artifactCount: state?.artifacts?.length || 0,
      },
      ...(result.code === 0
        ? {}
        : { error: { code: "local_harness_failed", exitCode: result.code } }),
    },
    isError: result.code !== 0,
  };
}
