export const PROBE_TREE_MULTI_SELECT_LIMITS = Object.freeze({ min: 2, max: 4 });

const PROBE_TREE_CONTEXT_MARKERS = Object.freeze([
  "Authored request",
  "Selected continuation question",
  "Selected continuation answer",
  "Probe lineage context",
  "Selected Widget title",
  "Selected Widget id",
  "Invocation route",
  "Agentic OS directives",
]);

const PROBE_TREE_CONTEXT_STOP_WORDS = new Set([
  "about", "across", "active", "agent", "agentic", "against", "also", "and", "answer", "assess", "author", "authored", "body", "bounded", "branch", "branches",
  "canvas", "card", "cards", "care", "change", "changes", "command", "confirm", "confirms", "context", "continuation", "contract", "cost", "depth", "editable", "economics", "for", "from", "frontmatter", "gate", "generate", "generated",
  "before", "call", "candidate", "connect", "directive", "directives", "do", "each", "fallback", "generation", "generic", "guidance", "harness", "into", "invocation", "keep", "agenticgraph", "label", "local", "log", "make", "media", "next", "node", "not", "output", "panel", "probe", "proof", "provider", "publish", "question", "questions",
  "id", "os", "ready", "request", "require", "requires", "response", "rich", "route", "run", "runtime", "scope", "selected", "separate", "separately", "sme-care-agent", "smes", "stop", "storyboard", "structured", "summary", "text", "the", "this", "title", "token", "tree", "unchanged", "unless",
  "what", "when", "where", "which", "who", "why", "using", "visibly", "widget", "with", "workspace", "would", "zero-cost",
]);

const PROBE_TREE_RUNTIME_META_WORDS = new Set([
  "branch", "branches", "canvas", "card", "cards", "cloudflare", "completion", "fallback", "frontmatter", "invocation", "media", "mcp", "panel", "prod", "prompt", "provider", "rich", "route", "run", "runtime", "storyboard", "token", "tree", "widget",
]);

const GENERIC_RESPONSE_CONTENT_PATTERN = /^(?:current (?:primary )?source for|verified system-of-record fact for|accountable reviewer confirmation for|which authoritative evidence confirms the current facts)/i;
const GENERIC_CLARIFICATION_QUESTION_PATTERN = /^(?:which (?:scope|priority|constraint) choice should clarify\b|which relationship between\b.+\bshould the next answer establish\b|which (?:evidence|decision) basis should resolve\b|which deliverable should resolve\b|what should the next clarification resolve about\b)/i;
const GENERIC_CLARIFICATION_CHOICE_PATTERN = /^(?:define the exact boundary|identify adjacent concerns|set what is outside|set the immediate priority|identify the next sequence|define when to defer|identify mandatory constraints|define acceptable tradeoffs|set unresolved limits|compare current evidence for|resolve the dependency between|choose the decision order for|use current evidence for|set a decision threshold for|choose a deliverable for|current authoritative evidence for|corroborating evidence for|known evidence gaps for|most conservative basis for|balanced basis for|most current basis for|comparison for|evidence ledger for|recommendation for)\b/i;
const PROBE_TREE_GENERATED_QUESTION_SCAFFOLD_PATTERN = /^(?:which requested items should guide the next branch)\s*:\s*/i;
const PROBE_TREE_TERMINAL_GENERATION_PATTERN = /^(?:please\s+)?(?:build|compose|create|draft|generate|prepare|produce|render|write)\b/i;
const PROBE_TREE_BUCKET_NUMBER_WORDS = new Set([
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million", "billion", "trillion",
]);
const PROBE_TREE_BUCKET_SYNTAX_WORDS = new Set([
  "and", "approx", "approximately", "around", "at", "between", "below", "fewer", "from", "greater", "least", "less", "maximum", "minimum", "more", "over", "per", "than", "through", "to", "under", "up", "versus",
]);
const PROBE_TREE_BUCKET_UNIT_WORDS = new Set([
  "bps", "cent", "cents", "day", "days", "dollar", "dollars", "eur", "gbp", "hour", "hours", "k", "m", "minute", "minutes", "month", "months", "percent", "percentage", "percentages", "quarter", "quarters", "second", "seconds", "sgd", "usd", "week", "weeks", "year", "years", "yr", "yrs",
]);
const PROBE_TREE_CHOICE_DECISION_CUE_PATTERN = /\b(?:accept|avoid|balance|enable|favor|focus|increase|limit|maximize|minimize|prefer|prioritize|protect|reduce|require|retain|target|tolerate)\b/i;

const probeTreeWordSegmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter(undefined, { granularity: "word" })
  : null;

const normalizeProbeTreeWord = value => String(value || "").normalize("NFKC").toLowerCase();

const collectProbeTreeWordSegments = value => {
  const text = String(value || "");
  const compounds = [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:-[\p{L}\p{N}][\p{L}\p{N}\p{M}]*)+/gu)]
    .map(match => ({ segment: match[0], index: match.index || 0, end: (match.index || 0) + match[0].length }));
  if (probeTreeWordSegmenter) {
    const out = [];
    const emittedCompounds = new Set();
    for (const part of probeTreeWordSegmenter.segment(text)) {
      if (!part.isWordLike) continue;
      const compoundIndex = compounds.findIndex(compound => part.index >= compound.index && part.index < compound.end);
      if (compoundIndex >= 0) {
        if (emittedCompounds.has(compoundIndex)) continue;
        emittedCompounds.add(compoundIndex);
        const compound = compounds[compoundIndex];
        out.push({ ...compound, normalized: normalizeProbeTreeWord(compound.segment) });
        continue;
      }
      const segment = String(part.segment || "").trim();
      if (!segment) continue;
      out.push({ segment, index: part.index, end: part.index + segment.length, normalized: normalizeProbeTreeWord(segment) });
    }
    return out;
  }
  return [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:-[\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*/gu)]
    .flatMap(match => {
      const segment = match[0];
      const index = match.index || 0;
      if (/[^\x00-\x7F]/.test(segment) && !segment.includes("-") && Array.from(segment).length > 1) {
        let offset = index;
        return Array.from(segment).map(character => {
          const item = { segment: character, index: offset, end: offset + character.length, normalized: normalizeProbeTreeWord(character) };
          offset += character.length;
          return item;
        });
      }
      return [{ segment, index, end: index + segment.length, normalized: normalizeProbeTreeWord(segment) }];
    });
};

export const cleanProbeTreeResponseText = (value, maxLength = 320) => (
  String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength)
);

const normalizeProbeTreeComparableText = value => collectProbeTreeWordSegments(
  cleanProbeTreeResponseText(value, 8_000)
    .replace(/(^|\s)[/#@][a-z0-9_.-]+(?=\s|$)/gi, " "),
).map(part => part.normalized).join(" ");

export const isProbeTreeTerminalGenerationRequest = value => (
  Boolean(resolveProbeTreeTerminalGenerationRequest(value))
);

export const safeProbeTreeResponseId = (value, fallback) => {
  const normalized = cleanProbeTreeResponseText(value, 160).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
};

export function normalizeProbeTreeSelectionOptions(value) {
  const candidates = Array.isArray(value) ? value : [];
  const seen = new Set();
  const options = [];
  for (const candidate of candidates) {
    const record = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : null;
    const label = cleanProbeTreeResponseText(record?.label || record?.text || candidate, 160);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    options.push({
      id: cleanProbeTreeResponseText(record?.id, 80) || `option-${options.length + 1}-${safeProbeTreeResponseId(label, String(options.length + 1)).slice(0, 48)}`,
      label,
    });
    if (options.length >= PROBE_TREE_MULTI_SELECT_LIMITS.max) break;
  }
  return options.length >= PROBE_TREE_MULTI_SELECT_LIMITS.min ? options : [];
}

const collectProbeTreeChoiceSemanticTokens = value => {
  const tokens = collectProbeTreeWordSegments(cleanProbeTreeResponseText(value, 160))
    .flatMap(part => part.normalized.split('-'));
  return tokens.filter(token => (
    !/^\d+(?:\.\d+)?(?:k|m|bn|b)?$/.test(token)
    && !PROBE_TREE_BUCKET_NUMBER_WORDS.has(token)
    && !PROBE_TREE_BUCKET_SYNTAX_WORDS.has(token)
    && !PROBE_TREE_BUCKET_UNIT_WORDS.has(token)
  ));
};

const isProbeTreeSemanticallyThinChoice = (value, contextText) => {
  const normalized = cleanProbeTreeResponseText(value, 160).toLowerCase();
  const semanticTokenCount = collectProbeTreeChoiceSemanticTokens(normalized).length;
  if (semanticTokenCount < 2) return true;
  if (PROBE_TREE_CHOICE_DECISION_CUE_PATTERN.test(normalized)) return false;
  if (semanticTokenCount < 3) return true;
  const comparableChoice = normalizeProbeTreeComparableText(normalized);
  const comparableContext = normalizeProbeTreeComparableText(contextText);
  return semanticTokenCount <= 3
    && comparableChoice
    && ` ${comparableContext} `.includes(` ${comparableChoice} `);
};

export function doProbeTreeSelectionOptionsContainSemanticallyThinChoices(value, contextText = "") {
  const options = normalizeProbeTreeSelectionOptions(value);
  return options.length >= PROBE_TREE_MULTI_SELECT_LIMITS.min
    && options.some(option => isProbeTreeSemanticallyThinChoice(option.label, contextText));
}

export function normalizeProbeTreeContextAnchors(value) {
  const candidates = Array.isArray(value) ? value : [];
  const seen = new Set();
  const anchors = [];
  for (const candidate of candidates) {
    const anchor = cleanProbeTreeResponseText(candidate, 240);
    const key = anchor.toLowerCase();
    if (!anchor || seen.has(key)) continue;
    seen.add(key);
    anchors.push(anchor);
    if (anchors.length >= 6) break;
  }
  return anchors.length >= 2 ? anchors : [];
}

const readContextMarker = (contextText, marker) => {
  const normalized = cleanProbeTreeResponseText(contextText, 12_000);
  const lower = normalized.toLowerCase();
  const markerToken = `${marker.toLowerCase()}:`;
  const startIndex = lower.indexOf(markerToken);
  if (startIndex < 0) return "";
  const valueStart = startIndex + markerToken.length;
  const endIndexes = PROBE_TREE_CONTEXT_MARKERS
    .filter(candidate => candidate !== marker)
    .map(candidate => lower.indexOf(`${candidate.toLowerCase()}:`, valueStart))
    .filter(index => index >= 0);
  const valueEnd = endIndexes.length > 0 ? Math.min(...endIndexes) : normalized.length;
  return cleanProbeTreeResponseText(normalized.slice(valueStart, valueEnd), 8_000);
};

export function extractProbeTreeUserInputText(contextText) {
  const continuationQuestion = readContextMarker(contextText, "Selected continuation question");
  const continuationAnswer = readContextMarker(contextText, "Selected continuation answer");
  if (continuationAnswer) return normalizeProbeTreeContinuationAnswer(continuationAnswer);
  if (continuationQuestion) return normalizeProbeTreeContinuationQuestion(continuationQuestion);
  return readContextMarker(contextText, "Authored request") || cleanProbeTreeResponseText(contextText, 8_000);
}

export function extractProbeTreeClarificationContextText(contextText) {
  const continuationQuestion = readContextMarker(contextText, "Selected continuation question");
  const lineageContext = readContextMarker(contextText, "Probe lineage context");
  return [continuationQuestion, lineageContext].filter(Boolean).join(" | ");
}

const extractProbeTreeGroundingText = contextText => {
  const userInput = extractProbeTreeUserInputText(contextText);
  const clarificationContext = extractProbeTreeClarificationContextText(contextText);
  return [userInput, clarificationContext].filter(Boolean).join(" | ");
};

const normalizeProbeTreeContinuationQuestion = value => cleanProbeTreeResponseText(value, 8_000)
  .replace(PROBE_TREE_GENERATED_QUESTION_SCAFFOLD_PATTERN, "")
  .replace(/[?]+$/g, "")
  .trim();

const readProbeTreeContinuationOtherSelection = value => cleanProbeTreeResponseText(
  cleanProbeTreeResponseText(value, 8_000).match(/(?:^|\s)Other\s*:\s*(.+)$/i)?.[1],
  240,
);

const readProbeTreeContinuationSelections = value => {
  const normalized = cleanProbeTreeResponseText(value, 8_000);
  const numberedSelections = [...normalized.matchAll(
    /(?:^|\s)\d+\.\s*(.+?)(?=(?:\s+\d+\.\s*)|(?:\s+Other(?:\s*:|$))|$)/gi,
  )].map(match => cleanProbeTreeResponseText(match[1], 240)).filter(Boolean);
  const otherSelection = readProbeTreeContinuationOtherSelection(normalized);
  const seen = new Set();
  return [...numberedSelections, otherSelection].filter(selection => {
    const key = selection.toLowerCase();
    if (!selection || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export function resolveProbeTreeTerminalGenerationRequest(value) {
  const normalized = cleanProbeTreeResponseText(value, 8_000);
  if (PROBE_TREE_TERMINAL_GENERATION_PATTERN.test(normalized)) return normalized;
  const otherSelection = readProbeTreeContinuationOtherSelection(normalized);
  return PROBE_TREE_TERMINAL_GENERATION_PATTERN.test(otherSelection) ? otherSelection : "";
}

const normalizeProbeTreeContinuationAnswer = value => {
  const normalized = cleanProbeTreeResponseText(value, 8_000);
  const otherSelection = readProbeTreeContinuationOtherSelection(normalized);
  if (otherSelection) return otherSelection;
  const selections = readProbeTreeContinuationSelections(normalized);
  return selections.length > 0 ? selections.join(", ") : normalized;
};

const escapeProbeTreePattern = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildProbeTreeKeywordPattern = keyword => keyword.split("-")
  .map(escapeProbeTreePattern)
  .join("(?:-|\\s)+");

export function collectProbeTreeContextKeywords(value, maxCount = 8) {
  const seen = new Set();
  const words = collectProbeTreeWordSegments(String(value || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/(^|\s)[/#@][a-z0-9_.-]+/gi, " ")
    .replace(/\b(?:response\.)?structuredcontent\b/gi, " "))
    .map(part => part.normalized);
  const out = [];
  for (const word of words) {
    const compoundStopWord = word.includes("-") && word.split("-").every(part => PROBE_TREE_CONTEXT_STOP_WORDS.has(part));
    const minimumLength = /^[\x00-\x7F]+$/.test(word) ? 3 : 1;
    if (!/\p{L}/u.test(word) || Array.from(word).length < minimumLength || PROBE_TREE_CONTEXT_STOP_WORDS.has(word) || compoundStopWord || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
    if (out.length >= Math.max(1, Math.min(128, Number(maxCount) || 8))) break;
  }
  return out;
}

export function areProbeTreeCardsMutuallyDistinct(cards) {
  const candidates = Array.isArray(cards) ? cards : [];
  const seenQuestions = new Set();
  const acceptedOptionSets = [];
  for (const candidate of candidates) {
    const question = cleanProbeTreeResponseText(candidate?.question || candidate?.text).toLowerCase();
    const optionSet = new Set(normalizeProbeTreeSelectionOptions(candidate?.selectionOptions).map(option => option.label.toLowerCase()));
    if (!question || optionSet.size < PROBE_TREE_MULTI_SELECT_LIMITS.min || seenQuestions.has(question)) return false;
    for (const accepted of acceptedOptionSets) {
      if ([...optionSet].some(label => accepted.has(label))) return false;
    }
    seenQuestions.add(question);
    acceptedOptionSets.push(optionSet);
  }
  return true;
}

const normalizeProbeTreeKeywordStem = value => {
  const word = String(value || "").toLowerCase();
  if (!/^[a-z][a-z0-9]*$/.test(word) || word.length < 5) return word;
  for (const suffix of ["ations", "ation", "ments", "ment", "ings", "ing", "ed", "es", "s"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) return word.slice(0, -suffix.length);
  }
  return word;
};

const collectProbeTreeComparableStems = value => new Set(
  collectProbeTreeWordSegments(value).map(part => normalizeProbeTreeKeywordStem(part.normalized)),
);

const matchedContextKeywords = (contextKeywords, value) => {
  const text = String(value || "").toLowerCase();
  const comparableWordList = collectProbeTreeWordSegments(text).map(part => part.normalized);
  const comparableWords = new Set(comparableWordList);
  const comparableStems = collectProbeTreeComparableStems(text);
  return contextKeywords.filter(keyword => (
    comparableWords.has(normalizeProbeTreeWord(keyword))
    || new RegExp(`(^|[^\\p{L}\\p{N}\\p{M}-])${buildProbeTreeKeywordPattern(keyword)}([^\\p{L}\\p{N}\\p{M}-]|$)`, "iu").test(text)
    || (/[^\x00-\x7F]/.test(keyword) && text.includes(String(keyword).toLowerCase()))
    || (!keyword.includes("-") && comparableStems.has(normalizeProbeTreeKeywordStem(keyword)))
    || (() => {
      const normalizedKeyword = normalizeProbeTreeWord(keyword);
      if (normalizedKeyword.includes("-") || Array.from(normalizedKeyword).length < 4) return false;
      return comparableWordList.some(word => (
        word.length >= normalizedKeyword.length + 2
        && word.length <= normalizedKeyword.length * 2
        && word.includes(normalizedKeyword)
      ));
    })()
  ));
};

const findProbeTreeSourceAnchor = (groundingText, keyword) => {
  const sourceText = cleanProbeTreeResponseText(groundingText, 12_000);
  const matchedSegment = collectProbeTreeWordSegments(sourceText)
    .find(part => part.normalized === normalizeProbeTreeWord(keyword));
  if (!matchedSegment) return "";
  const keywordStart = matchedSegment.index;
  const uppercasePrefix = sourceText.slice(Math.max(0, keywordStart - 8), keywordStart).match(/\b[A-Z]{2,5}\s+$/)?.[0] || "";
  return cleanProbeTreeResponseText(`${uppercasePrefix}${matchedSegment.segment}`, 240);
};

export function resolveProbeTreeContextAnchors({ contextText, question, contextAnchors } = {}) {
  const groundingInput = extractProbeTreeGroundingText(contextText);
  const normalizedInput = cleanProbeTreeResponseText(groundingInput, 12_000).toLowerCase();
  const providedAnchors = normalizeProbeTreeContextAnchors(contextAnchors)
    .filter(anchor => normalizedInput.includes(anchor.toLowerCase()));
  const contextKeywords = collectProbeTreeContextKeywords(groundingInput, 96)
    .filter(keyword => !PROBE_TREE_RUNTIME_META_WORDS.has(keyword));
  const derivedAnchors = matchedContextKeywords(contextKeywords, question)
    .map(keyword => findProbeTreeSourceAnchor(groundingInput, keyword))
    .filter(Boolean);
  return normalizeProbeTreeContextAnchors([...providedAnchors, ...derivedAnchors]);
}

const isProbeTreeSourceQueryRestatement = ({ userInput, question, selectionOptions }) => {
  const comparableInput = normalizeProbeTreeComparableText(userInput);
  const comparableQuestion = normalizeProbeTreeComparableText(question);
  if (!comparableInput || !comparableQuestion) return true;
  if (comparableInput === comparableQuestion) return true;

  const inputKeywords = collectProbeTreeContextKeywords(userInput, 96)
    .filter(keyword => !PROBE_TREE_RUNTIME_META_WORDS.has(keyword));
  const matchedKeywords = matchedContextKeywords(inputKeywords, question);
  const copiedOptions = normalizeProbeTreeSelectionOptions(selectionOptions)
    .every(option => comparableInput.includes(normalizeProbeTreeComparableText(option.label)));
  return inputKeywords.length >= 3
    && matchedKeywords.length / inputKeywords.length >= 0.75
    && copiedOptions;
};

export function areProbeTreeContinuationChoicesSuggested({ contextText, question, selectionOptions } = {}) {
  const continuationQuestion = readContextMarker(contextText, "Selected continuation question");
  const continuationAnswer = readContextMarker(contextText, "Selected continuation answer");
  if (!continuationQuestion && !continuationAnswer) return true;
  const options = normalizeProbeTreeSelectionOptions(selectionOptions);
  if (options.length < PROBE_TREE_MULTI_SELECT_LIMITS.min) return false;
  const quotedFocus = cleanProbeTreeResponseText(String(question || "").match(/"([^"]+)"/)?.[1], 480);
  const focus = cleanProbeTreeResponseText(quotedFocus || normalizeProbeTreeContinuationAnswer(continuationAnswer), 8_000).toLowerCase();
  if (!focus) return true;
  return options.every(option => !focus.includes(option.label.toLowerCase()));
}

export function isProbeTreeCardUserInputRelevant({ contextText, question, selectionOptions, contextAnchors } = {}) {
  const userInput = extractProbeTreeUserInputText(contextText);
  const continuationAnswer = readContextMarker(contextText, "Selected continuation answer");
  const groundingInput = extractProbeTreeGroundingText(contextText);
  const normalizedInput = cleanProbeTreeResponseText(groundingInput, 12_000).toLowerCase();
  const anchors = resolveProbeTreeContextAnchors({ contextText, question, contextAnchors });
  const options = normalizeProbeTreeSelectionOptions(selectionOptions);
  if (
    !normalizedInput
    || (continuationAnswer && isProbeTreeTerminalGenerationRequest(continuationAnswer))
    || anchors.length < 2
    || options.length < 2
    || doProbeTreeSelectionOptionsContainSemanticallyThinChoices(options, groundingInput)
    || isProbeTreeSourceQueryRestatement({ userInput, question, selectionOptions: options })
    || GENERIC_RESPONSE_CONTENT_PATTERN.test(String(question || "").trim())
    || GENERIC_CLARIFICATION_QUESTION_PATTERN.test(String(question || "").trim())
    || options.some(option => GENERIC_CLARIFICATION_CHOICE_PATTERN.test(option.label))
    || !areProbeTreeContinuationChoicesSuggested({ contextText, question, selectionOptions: options })
  ) return false;
  const contextKeywords = collectProbeTreeContextKeywords(groundingInput, 96).filter(keyword => !PROBE_TREE_RUNTIME_META_WORDS.has(keyword));
  if (contextKeywords.length < 2) return false;
  const questionMatches = new Set(matchedContextKeywords(contextKeywords, question));
  if (continuationAnswer) {
    const primaryKeywords = collectProbeTreeContextKeywords(userInput, 96).filter(keyword => !PROBE_TREE_RUNTIME_META_WORDS.has(keyword));
    const requiredPrimaryMatches = Math.min(2, primaryKeywords.length);
    const primaryMatches = new Set(matchedContextKeywords(primaryKeywords, question));
    if (requiredPrimaryMatches < 1 || primaryMatches.size < requiredPrimaryMatches) return false;
    return true;
  }
  return questionMatches.size >= 2;
}
