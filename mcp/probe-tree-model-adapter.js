import {
  extractProbeTreeClarificationContextText,
  extractProbeTreeUserInputText,
} from "../canvas/src/features/agent-ready/probeTreeUserInputRelevance.mjs";
import {
  callLocalOllamaChat,
  readLocalOllamaConfig,
} from "./local-ollama-client.js";

const DEFAULT_TIMEOUT_MS = 20000;

const normalizeString = (value) => String(value || "").replace(/\s+/g, " ").trim();

export function readProbeTreeModelConfig(env = process.env) {
  return readLocalOllamaConfig(env, {
    envPrefix: "AGENTICGRAPH_PROBE_TREE_MODEL",
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  });
}

const optionFormatSchema = Object.freeze({
  type: "object",
  properties: {
    options: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          rationale: { type: "string" },
          evidenceNeeded: { type: "string" },
          selectionOptions: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
        },
        required: ["text", "rationale", "evidenceNeeded", "selectionOptions"],
      },
    },
  },
  required: ["options"],
});

export const buildProbeModelPrompt = ({ contextText, recalledExemplars, k }) => [
  "Generate concise candidate next questions and bounded answers for a branching probe-tree.",
  "Return JSON only with shape {\"options\":[{\"text\":\"...\",\"rationale\":\"...\",\"evidenceNeeded\":\"...\",\"selectionOptions\":[\"...\",\"...\"]}]}",
  `Return at most ${k} options.`,
  "Use the current user input as the only topic source. Do not use stock evidence, process, policy, reviewer, or system-of-record choices unless those concepts appear in that input.",
  "Each question must introduce one concrete missing decision variable whose answer would materially change the requested result; each selectionOptions array must contain 2-4 concise suggested answers to that exact question.",
  "Never copy or paraphrase the current user input as a question. Treat named entities and alternatives already supplied by the user as subjects to clarify, not as a ready-made selectionOptions array.",
  "Suggested answers may introduce plausible user preferences for the missing decision variable, but must not assert invented facts.",
  "Ask about missing parameters that materially change the requested answer. Never pair copied nouns inside canned relationship/evidence/dependency/decision-order questions or wrap the whole query in scope, priority, constraint, basis, or deliverable templates.",
  "Every selectionOptions item must be a suggested clarification answer. Never split the selected focus or repeat its words as bare answer fragments.",
  "Give every card a different request-specific decision variable. Never reuse a choice label, another card's complete selection set, or a subset or superset of another card's choices.",
  "Mention the request subject plus at least one named entity or distinctive request term in every question. The runtime derives source-verbatim context anchors after semantic acceptance.",
  "Questions must ask for missing context or user-selected direction, not answer the user's problem.",
  "Morphological variants such as invest and investment are allowed when the named entities and meaning remain intact. If the selected input does not support 2-4 distinct query-specific cards without invented facts, return {\"options\":[]} instead of restating the query or emitting generic or hardcoded filler.",
  "Avoid medical advice, diagnosis, medication instructions, PHI, credentials, URLs, or provider claims.",
  "",
  `Current selected child input: ${normalizeString(extractProbeTreeUserInputText(contextText))}`,
  `Preceding probe context (lineage only): ${normalizeString(extractProbeTreeClarificationContextText(contextText)) || "none"}`,
  recalledExemplars.length
    ? `Resolved structural exemplars (structure only; never reuse their content):\n${recalledExemplars.map((entry) => `- ${normalizeString(entry.memory)}`).join("\n")}`
    : "Resolved exemplars: none",
].join("\n");

const parseOptionsJson = (text) => {
  const raw = normalizeString(text);
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return [];
    }
  }
  const options = Array.isArray(parsed?.options) ? parsed.options : [];
  return options.map((option) => ({
    text: normalizeString(option?.text),
    rationale: normalizeString(option?.rationale),
    evidenceNeeded: normalizeString(option?.evidenceNeeded),
    selectionOptions: Array.isArray(option?.selectionOptions) ? option.selectionOptions.map(normalizeString).filter(Boolean) : [],
  })).filter((option) => (
    option.text
    && option.rationale
    && option.evidenceNeeded
    && option.selectionOptions.length >= 2
  ));
};

export async function generateProbeOptionsWithLocalModel({ contextText, recalledExemplars = [], k, env = process.env, fetchImpl = fetch }) {
  const config = readProbeTreeModelConfig(env);
  if (!config.configured) return { configured: false, reason: config.disabledReason || "model_not_configured", options: [], costLog: null };
  const result = await callLocalOllamaChat({
    config,
    format: optionFormatSchema,
    messages: [
      { role: "system", content: "You produce strict JSON for a local AgenticGraph probe-tree agent." },
      { role: "user", content: buildProbeModelPrompt({ contextText, recalledExemplars, k }) },
    ],
    fetchImpl,
  });
  const content = result.content;
    const options = parseOptionsJson(content).slice(0, k);
    if (!options.length) throw new Error("model_returned_no_valid_options");
    return {
      configured: true,
      provider: config.provider,
      model: result.model,
      options,
      costLog: {
        model: result.model,
        prompt_tokens: result.promptTokens,
        completion_tokens: result.outputTokens,
        cache_hits: 0,
        estimated_cost_usd: 0,
      },
    };
}
