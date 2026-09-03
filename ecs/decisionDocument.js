import { JSON_SCHEMA, load as loadYaml } from "js-yaml";

import {
  ECS_DECISION_NODE_TYPE,
  AgenticOsNodeContractError,
  buildDecisionAgenticOsNode,
  compareCanonicalStrings,
  decisionRecordsEqual,
  normalizeDecisionNode,
  normalizeDecisionRecord,
  readAgenticOsNodeState,
  stableStringifyJson,
} from "./agenticOsNodeContract.js";

function quoteYamlString(value) {
  return JSON.stringify(value);
}

export function serializeDecisionNode(decisionRecord) {
  const node = buildDecisionAgenticOsNode(decisionRecord);
  return [
    `    - id: ${quoteYamlString(node.id)}`,
    `      label: ${quoteYamlString(node.label)}`,
    `      type: ${quoteYamlString(node.type)}`,
    `      status: ${quoteYamlString(node.status)}`,
    `      properties: ${stableStringifyJson(node.properties)}`,
  ].join("\n");
}

export function deserializeDecisionNode(input) {
  let node = input;
  if (typeof input === "string") {
    let parsed;
    try {
      parsed = loadYaml(input, { json: false, schema: JSON_SCHEMA });
    } catch (error) {
      throw new AgenticOsNodeContractError(
        "ECS_DECISION_INVALID_YAML",
        `Decision node YAML is invalid: ${error instanceof Error ? error.message : String(error)}`,
        "decision",
      );
    }
    if (Array.isArray(parsed)) [node] = parsed;
    else if (Array.isArray(parsed?.flow?.nodes)) [node] = parsed.flow.nodes;
    else node = parsed;
  }
  if (!node || node.type !== ECS_DECISION_NODE_TYPE) {
    throw new AgenticOsNodeContractError(
      "ECS_DECISION_INVALID_NODE",
      `Decision node type must be ${ECS_DECISION_NODE_TYPE}`,
      "decision.type",
    );
  }
  return normalizeDecisionNode(node);
}

export function normalizeDecisionBatch(decisions) {
  if (!Array.isArray(decisions)) {
    throw new AgenticOsNodeContractError(
      "ECS_DECISION_BATCH_REQUIRED",
      "decisions must be an array",
      "decisions",
    );
  }
  const byId = new Map();
  decisions.forEach((decision, index) => {
    const normalized = normalizeDecisionRecord(decision, `decisions[${index}]`);
    if (byId.has(normalized.decisionId)) {
      throw new AgenticOsNodeContractError(
        "ECS_DECISION_DUPLICATE_ID",
        `decisionId ${normalized.decisionId} occurs more than once in the batch`,
        normalized.decisionId,
      );
    }
    byId.set(normalized.decisionId, normalized);
  });
  return [...byId.values()].sort((left, right) =>
    compareCanonicalStrings(left.decisionId, right.decisionId),
  );
}

function frontmatterLines(markdown) {
  const opening = markdown.match(/^(?:\uFEFF)?---[ \t]*(\r?\n)/);
  if (!opening) {
    throw new AgenticOsNodeContractError(
      "ECS_AGENTIC_OS_FRONTMATTER_REQUIRED",
      "AGENTIC_OS Markdown must begin with YAML frontmatter",
      "frontmatter",
    );
  }
  const contentStart = opening[0].length;
  const remainder = markdown.slice(contentStart);
  const closing = /(^|\r?\n)---[ \t]*(?=\r?\n|$)/.exec(remainder);
  if (!closing) {
    throw new AgenticOsNodeContractError(
      "ECS_AGENTIC_OS_FRONTMATTER_REQUIRED",
      "AGENTIC_OS Markdown frontmatter has no closing fence",
      "frontmatter",
    );
  }
  const contentEnd = contentStart + closing.index + closing[1].length;
  const content = markdown.slice(contentStart, contentEnd);
  const lines = [];
  const linePattern = /([^\r\n]*)(\r\n|\n|$)/g;
  let match;
  while ((match = linePattern.exec(content)) !== null) {
    if (match[0] === "") break;
    lines.push({
      content: match[1],
      end: match.index + match[0].length,
      ending: match[2],
      start: match.index,
    });
  }
  return { content, contentStart, lines, lineEnding: opening[1] };
}

function leadingSpaces(line) {
  if (line.startsWith("\t")) return -1;
  return line.match(/^ */)?.[0].length ?? 0;
}

function appendNodesToMarkdown(markdown, serializedNodes) {
  if (serializedNodes.length === 0) return markdown;
  const frontmatter = frontmatterLines(markdown);
  const flowIndex = frontmatter.lines.findIndex((line) => /^\s*flow:\s*$/.test(line.content));
  if (flowIndex < 0) {
    throw new AgenticOsNodeContractError(
      "ECS_AGENTIC_OS_BLOCK_FLOW_REQUIRED",
      "AGENTIC_OS frontmatter must contain block-style flow",
      "flow",
    );
  }
  const flowIndent = leadingSpaces(frontmatter.lines[flowIndex].content);
  let nodesIndex = -1;
  for (let index = flowIndex + 1; index < frontmatter.lines.length; index += 1) {
    const line = frontmatter.lines[index];
    if (line.content.trim() === "") continue;
    const indentation = leadingSpaces(line.content);
    if (indentation <= flowIndent) break;
    if (/^\s*nodes:\s*(?:\[\])?\s*$/.test(line.content)) {
      nodesIndex = index;
      break;
    }
  }
  if (nodesIndex < 0) {
    throw new AgenticOsNodeContractError(
      "ECS_AGENTIC_OS_BLOCK_NODES_REQUIRED",
      "AGENTIC_OS frontmatter must contain block-style flow.nodes",
      "flow.nodes",
    );
  }

  const nodesLine = frontmatter.lines[nodesIndex];
  const nodesIndent = leadingSpaces(nodesLine.content);
  if (nodesIndent <= flowIndent || nodesIndent - flowIndent !== 2) {
    throw new AgenticOsNodeContractError(
      "ECS_AGENTIC_OS_BLOCK_NODES_REQUIRED",
      "flow.nodes must be indented two spaces beneath flow",
      "flow.nodes",
    );
  }
  const block = serializedNodes
    .map((node) => node.replace(/\n/g, frontmatter.lineEnding))
    .join(frontmatter.lineEnding);
  if (/nodes:\s*\[\]\s*$/.test(nodesLine.content)) {
    const replacement = `${" ".repeat(nodesIndent)}nodes:${frontmatter.lineEnding}${block}${frontmatter.lineEnding}`;
    return (
      markdown.slice(0, frontmatter.contentStart + nodesLine.start) +
      replacement +
      markdown.slice(frontmatter.contentStart + nodesLine.end)
    );
  }

  let firstChildIndex = -1;
  for (let index = nodesIndex + 1; index < frontmatter.lines.length; index += 1) {
    const line = frontmatter.lines[index];
    if (line.content.trim() === "") continue;
    if (leadingSpaces(line.content) <= nodesIndent) break;
    firstChildIndex = index;
    break;
  }
  if (firstChildIndex >= 0 && frontmatter.lines[firstChildIndex].content.trim() === "[]") {
    const emptyChild = frontmatter.lines[firstChildIndex];
    return (
      markdown.slice(0, frontmatter.contentStart + emptyChild.start) +
      block +
      frontmatter.lineEnding +
      markdown.slice(frontmatter.contentStart + emptyChild.end)
    );
  }

  let insertionOffset = frontmatter.content.length;
  for (let index = nodesIndex + 1; index < frontmatter.lines.length; index += 1) {
    const line = frontmatter.lines[index];
    if (line.content.trim() === "") continue;
    if (leadingSpaces(line.content) <= nodesIndent) {
      insertionOffset = line.start;
      break;
    }
  }
  return (
    markdown.slice(0, frontmatter.contentStart + insertionOffset) +
    block +
    frontmatter.lineEnding +
    markdown.slice(frontmatter.contentStart + insertionOffset)
  );
}

function existingDecisionIndex(nodes) {
  const decisions = new Map();
  const nodeIds = new Set();
  nodes.forEach((node, nodeIndex) => {
    if (typeof node?.id === "string" && node.id !== "") nodeIds.add(node.id);
    if (node?.type !== ECS_DECISION_NODE_TYPE) return;
    const decision = normalizeDecisionNode(node, nodeIndex);
    if (decisions.has(decision.decisionId)) {
      throw new AgenticOsNodeContractError(
        "ECS_DECISION_DUPLICATE_ID",
        `source AGENTIC_OS contains duplicate decisionId ${decision.decisionId}`,
        decision.decisionId,
      );
    }
    decisions.set(decision.decisionId, decision);
  });
  return { decisions, nodeIds };
}

export function mergeDecisionsIntoAgenticOsMarkdown(markdown, decisions) {
  if (typeof markdown !== "string") {
    throw new AgenticOsNodeContractError(
      "ECS_AGENTIC_OS_INVALID_DOCUMENT",
      "AGENTIC_OS Markdown must be a string",
      "document",
    );
  }
  const batch = normalizeDecisionBatch(decisions);
  const { nodes } = readAgenticOsNodeState(markdown);
  const existing = existingDecisionIndex(nodes);
  const additions = [];
  let idempotentCount = 0;

  for (const decision of batch) {
    const prior = existing.decisions.get(decision.decisionId);
    if (prior) {
      if (!decisionRecordsEqual(prior, decision)) {
        throw new AgenticOsNodeContractError(
          "ECS_DECISION_ID_CONFLICT",
          `decisionId ${decision.decisionId} already exists with different content`,
          decision.decisionId,
        );
      }
      idempotentCount += 1;
      continue;
    }
    const node = buildDecisionAgenticOsNode(decision);
    if (existing.nodeIds.has(node.id)) {
      throw new AgenticOsNodeContractError(
        "ECS_DECISION_NODE_ID_CONFLICT",
        `AGENTIC_OS node id ${node.id} is already in use`,
        decision.decisionId,
      );
    }
    additions.push(decision);
  }

  return {
    markdown: appendNodesToMarkdown(markdown, additions.map(serializeDecisionNode)),
    persistedCount: additions.length,
    idempotentCount,
  };
}
