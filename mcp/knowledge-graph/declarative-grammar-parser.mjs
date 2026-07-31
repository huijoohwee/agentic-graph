import { KNOWLEDGE_GRAPH_DECLARATIVE_GRAMMAR_SCHEMA_ID } from "../knowledge-graph-parser-contract.js";
import {
  compareStableStrings, KnowledgeGraphError, sha256, spanFromOffsets, stableStringify,
} from "./contract.mjs";

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const TOKEN_KINDS = new Set(["identifier", "newline", "number", "string", "whitespace"]);
const MAX_TOKENS = 64, MAX_RULES = 128, MAX_ALTERNATIVES = 32, MAX_TERMS = 64;
const MAX_TOTAL_TERMS = 4_096, MAX_REPEAT = 256, MAX_LITERAL_LENGTH = 64;
const MAX_GRAMMAR_BYTES = 128 * 1024, MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_LEXEMES = 100_000, MAX_PARSE_DEPTH = 256, MAX_LOCAL_OPERATIONS = 2_000_000;
const compiledGrammarCache = new WeakMap();

const invalid = (message, details) => {
  throw new KnowledgeGraphError("declarative_grammar_invalid", message, details);
};

function assertRecord(value, allowedKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(`${label} must be an object.`);
  }
  const unexpected = Object.keys(value)
    .filter((key) => !allowedKeys.has(key))
    .sort(compareStableStrings);
  if (unexpected.length) invalid(`${label} has unsupported keys.`, { keys: unexpected });
}

function identity(value, label) {
  const normalized = String(value || "").trim();
  if (!SAFE_ID.test(normalized)) invalid(`${label} must be a safe identity token.`);
  return normalized;
}

function boundedArray(value, maximum, label) {
  if (!Array.isArray(value) || !value.length || value.length > maximum) {
    invalid(`${label} must contain 1-${maximum} entries.`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function normalizeToken(raw, index) {
  assertRecord(raw, new Set(["id", "kind", "literal", "skip"]), `Grammar token ${index}`);
  const id = identity(raw.id, `Grammar token ${index} id`);
  const hasKind = Object.hasOwn(raw, "kind");
  const hasLiteral = Object.hasOwn(raw, "literal");
  if (hasKind === hasLiteral) {
    invalid(`Grammar token ${id} must declare exactly one host token kind or literal.`);
  }
  if (hasLiteral) {
    if (Object.hasOwn(raw, "skip")) invalid(`Literal grammar token ${id} cannot be skipped.`);
    const literal = String(raw.literal ?? "");
    if (!literal
      || literal.length > MAX_LITERAL_LENGTH
      || /[\u0000-\u001f\u007f]/u.test(literal)) {
      invalid(`Grammar token ${id} has an invalid bounded literal.`);
    }
    return { id, literal };
  }
  const kind = String(raw.kind || "").trim();
  if (!TOKEN_KINDS.has(kind)) invalid(`Grammar token ${id} uses an unsupported host token kind.`);
  return { id, kind, ...(raw.skip === true ? { skip: true } : {}) };
}

function normalizeTerm(raw, ruleId, alternativeIndex, termIndex) {
  assertRecord(
    raw,
    new Set(["token", "rule", "capture", "min", "max"]),
    `Grammar term ${ruleId}.${alternativeIndex}.${termIndex}`,
  );
  const hasToken = Object.hasOwn(raw, "token");
  const hasRule = Object.hasOwn(raw, "rule");
  if (hasToken === hasRule) {
    invalid(`Grammar term ${ruleId}.${alternativeIndex}.${termIndex} must reference one token or rule.`);
  }
  const min = Number(raw.min ?? 1);
  const max = Number(raw.max ?? 1);
  if (!Number.isSafeInteger(min)
    || !Number.isSafeInteger(max)
    || min < 0
    || max < 1
    || min > max
    || max > MAX_REPEAT) {
    invalid(`Grammar term ${ruleId}.${alternativeIndex}.${termIndex} has invalid repetition bounds.`);
  }
  return {
    ...(hasToken
      ? { token: identity(raw.token, "Grammar token reference") }
      : { rule: identity(raw.rule, "Grammar rule reference") }),
    ...(Object.hasOwn(raw, "capture")
      ? { capture: identity(raw.capture, "Grammar capture") }
      : {}),
    min,
    max,
  };
}

function normalizeRule(raw, index, state) {
  assertRecord(raw, new Set(["id", "alternatives"]), `Grammar rule ${index}`);
  const id = identity(raw.id, `Grammar rule ${index} id`);
  const alternatives = boundedArray(
    raw.alternatives,
    MAX_ALTERNATIVES,
    `Grammar rule ${id} alternatives`,
  ).map((alternative, alternativeIndex) => {
    assertRecord(
      alternative,
      new Set(["sequence"]),
      `Grammar alternative ${id}.${alternativeIndex}`,
    );
    const sequence = boundedArray(
      alternative.sequence,
      MAX_TERMS,
      `Grammar alternative ${id}.${alternativeIndex} sequence`,
    ).map((term, termIndex) => (
      normalizeTerm(term, id, alternativeIndex, termIndex)
    ));
    state.totalTerms += sequence.length;
    if (state.totalTerms > MAX_TOTAL_TERMS) {
      invalid(`Grammar exceeds the ${MAX_TOTAL_TERMS}-term bound.`);
    }
    return { sequence };
  });
  alternatives.sort((left, right) => (
    compareStableStrings(stableStringify(left, 0), stableStringify(right, 0))
  ));
  return { id, alternatives };
}

function normalizeGrammar(raw) {
  assertRecord(raw, new Set(["schema", "start", "tokens", "rules"]), "Declarative grammar");
  if (raw.schema !== KNOWLEDGE_GRAPH_DECLARATIVE_GRAMMAR_SCHEMA_ID) {
    invalid("Declarative grammar schema identity is unsupported.");
  }
  let suppliedBytes;
  try {
    suppliedBytes = Buffer.byteLength(stableStringify(raw, 0), "utf8");
  } catch {
    invalid("Declarative grammar must be finite canonical JSON data.");
  }
  if (suppliedBytes > MAX_GRAMMAR_BYTES) {
    invalid(`Declarative grammar exceeds the ${MAX_GRAMMAR_BYTES}-byte bound.`);
  }
  const tokens = boundedArray(raw.tokens, MAX_TOKENS, "Grammar tokens")
    .map(normalizeToken)
    .sort((left, right) => compareStableStrings(left.id, right.id));
  const state = { totalTerms: 0 };
  const rules = boundedArray(raw.rules, MAX_RULES, "Grammar rules")
    .map((rule, index) => normalizeRule(rule, index, state))
    .sort((left, right) => compareStableStrings(left.id, right.id));
  return deepFreeze({
    schema: KNOWLEDGE_GRAPH_DECLARATIVE_GRAMMAR_SCHEMA_ID,
    start: identity(raw.start, "Grammar start rule"),
    tokens,
    rules,
  });
}

const intersects = (left, right) => [...left].some((entry) => right.has(entry));
const unionInto = (target, values) => {
  const before = target.size;
  for (const value of values) target.add(value);
  return target.size !== before;
};

function analyzeGrammar(grammar) {
  const tokenById = new Map();
  const literalOwner = new Map();
  const kindOwner = new Map();
  for (const token of grammar.tokens) {
    if (tokenById.has(token.id)) invalid(`Duplicate grammar token id: ${token.id}`);
    tokenById.set(token.id, token);
    if (Object.hasOwn(token, "literal")) {
      if (literalOwner.has(token.literal)) {
        invalid(`Duplicate grammar token literal: ${token.literal}`);
      }
      literalOwner.set(token.literal, token.id);
    } else {
      if (kindOwner.has(token.kind)) invalid(`Duplicate grammar token kind: ${token.kind}`);
      kindOwner.set(token.kind, token.id);
    }
  }
  const ruleById = new Map();
  for (const rule of grammar.rules) {
    if (ruleById.has(rule.id)) invalid(`Duplicate grammar rule id: ${rule.id}`);
    ruleById.set(rule.id, rule);
  }
  if (!ruleById.has(grammar.start)) invalid(`Grammar start rule does not exist: ${grammar.start}`);
  for (const rule of grammar.rules) {
    for (const alternative of rule.alternatives) {
      for (const term of alternative.sequence) {
        if (term.token) {
          const token = tokenById.get(term.token);
          if (!token) invalid(`Grammar rule ${rule.id} references unknown token ${term.token}.`);
          if (token.skip) invalid(`Grammar rule ${rule.id} references skipped token ${term.token}.`);
        } else if (!ruleById.has(term.rule)) {
          invalid(`Grammar rule ${rule.id} references unknown rule ${term.rule}.`);
        }
      }
    }
  }

  const reachable = new Set([grammar.start]);
  const pending = [grammar.start];
  while (pending.length) {
    const rule = ruleById.get(pending.pop());
    for (const alternative of rule.alternatives) {
      for (const term of alternative.sequence) {
        if (term.rule && !reachable.has(term.rule)) {
          reachable.add(term.rule);
          pending.push(term.rule);
        }
      }
    }
  }
  const unreachable = grammar.rules.map((rule) => rule.id).filter((id) => !reachable.has(id));
  if (unreachable.length) invalid("Declarative grammar contains unreachable rules.", { rules: unreachable });

  const nullable = new Map(grammar.rules.map((rule) => [rule.id, false]));
  const derivable = new Map(grammar.rules.map((rule) => [rule.id, false]));
  for (let pass = 0; pass < grammar.rules.length; pass += 1) {
    let changed = false;
    for (const rule of grammar.rules) {
      for (const alternative of rule.alternatives) {
        const isNullable = alternative.sequence.every((term) => (
          term.min === 0 || (term.rule ? nullable.get(term.rule) : false)
        ));
        const isDerivable = alternative.sequence.every((term) => (
          term.min === 0 || Boolean(term.token) || derivable.get(term.rule)
        ));
        if (isNullable && !nullable.get(rule.id)) {
          nullable.set(rule.id, true);
          changed = true;
        }
        if (isDerivable && !derivable.get(rule.id)) {
          derivable.set(rule.id, true);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  const nullableRules = grammar.rules
    .map((rule) => rule.id)
    .filter((id) => nullable.get(id));
  if (nullableRules.length) {
    invalid(
      "Declarative grammar rules must consume source text; nullable rules cannot provide exact edge evidence.",
      { rules: nullableRules },
    );
  }
  const nonDerivable = grammar.rules.map((rule) => rule.id).filter((id) => !derivable.get(id));
  if (nonDerivable.length) invalid("Declarative grammar contains non-terminating rules.", { rules: nonDerivable });

  const leftCorners = new Map(grammar.rules.map((rule) => [rule.id, new Set()]));
  for (const rule of grammar.rules) {
    for (const alternative of rule.alternatives) {
      for (const term of alternative.sequence) {
        if (term.rule) leftCorners.get(rule.id).add(term.rule);
        const termNullable = term.min === 0 || (term.rule && nullable.get(term.rule));
        if (!termNullable) break;
      }
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (ruleId, trail) => {
    if (visiting.has(ruleId)) {
      invalid("Declarative grammar is directly or indirectly left-recursive.", {
        rules: [...trail, ruleId],
      });
    }
    if (visited.has(ruleId)) return;
    visiting.add(ruleId);
    for (const child of leftCorners.get(ruleId)) visit(child, [...trail, ruleId]);
    visiting.delete(ruleId);
    visited.add(ruleId);
  };
  for (const rule of grammar.rules) visit(rule.id, []);

  const first = new Map(grammar.rules.map((rule) => [rule.id, new Set()]));
  const firstOfTerm = (term) => (
    term.token ? new Set([term.token]) : first.get(term.rule)
  );
  const firstOfSequence = (sequence) => {
    const values = new Set();
    for (const term of sequence) {
      unionInto(values, firstOfTerm(term));
      if (!(term.min === 0 || (term.rule && nullable.get(term.rule)))) break;
    }
    return values;
  };
  const alternativesByRule = new Map();
  for (let pass = 0; pass < grammar.rules.length * 2; pass += 1) {
    let changed = false;
    for (const rule of grammar.rules) {
      for (const alternative of rule.alternatives) {
        changed = unionInto(first.get(rule.id), firstOfSequence(alternative.sequence)) || changed;
      }
    }
    if (!changed) break;
  }
  for (const rule of grammar.rules) {
    const alternatives = rule.alternatives.map((alternative) => ({
      ...alternative,
      first: firstOfSequence(alternative.sequence),
      nullable: alternative.sequence.every((term) => (
        term.min === 0 || (term.rule && nullable.get(term.rule))
      )),
    }));
    for (let left = 0; left < alternatives.length; left += 1) {
      for (let right = left + 1; right < alternatives.length; right += 1) {
        if (intersects(alternatives[left].first, alternatives[right].first)
          || (alternatives[left].nullable && alternatives[right].nullable)) {
          invalid(`Grammar rule ${rule.id} has ambiguous alternatives.`);
        }
      }
    }
    for (const alternative of alternatives) {
      for (let index = 0; index < alternative.sequence.length; index += 1) {
        const term = alternative.sequence[index];
        if (term.rule && nullable.get(term.rule) && term.max > 1) {
          invalid(`Grammar rule ${rule.id} repeats nullable rule ${term.rule}.`);
        }
        if (term.min === 0
          || term.max > 1
          || (term.rule && nullable.get(term.rule))) {
          const suffixFirst = firstOfSequence(alternative.sequence.slice(index + 1));
          if (intersects(firstOfTerm(term), suffixFirst)) {
            invalid(`Grammar rule ${rule.id} has an ambiguous optional or repeated term.`);
          }
        }
      }
    }
    alternativesByRule.set(rule.id, alternatives);
  }
  return {
    alternativesByRule,
    first,
    kindOwner,
    literalOwner,
    nullable,
    ruleById,
    tokenById,
  };
}

function boundedRuntimeLimit(value, fallback, maximum) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
}

function createOperationCheckpoint(options) {
  let operations = 0;
  const maximum = boundedRuntimeLimit(
    options.maxDeclarativeOperations,
    MAX_LOCAL_OPERATIONS,
    MAX_LOCAL_OPERATIONS,
  );
  return (stage) => {
    operations += 1;
    if (operations > maximum) {
      throw new KnowledgeGraphError(
        "declarative_grammar_operation_limit_exceeded",
        "Declarative grammar parsing exceeded its operation bound.",
        { maxOperations: maximum, stage },
      );
    }
    options.checkpoint?.(`declarative-grammar.${stage}`);
  };
}

function sourcePosition(text, offset) {
  const span = spanFromOffsets(text, offset, offset);
  return { line: span.lineStart, column: span.columnStart, offset };
}

function tokenize(text, analysis, options, checkpoint) {
  const maxLexemes = boundedRuntimeLimit(
    options.maxDeclarativeTokens,
    MAX_LEXEMES,
    MAX_LEXEMES,
  );
  const literals = [...analysis.literalOwner.entries()]
    .map(([literal, id]) => ({ id, literal }))
    .sort((left, right) => (
      right.literal.length - left.literal.length
      || compareStableStrings(left.literal, right.literal)
      || compareStableStrings(left.id, right.id)
    ));
  const kindTokens = new Map(
    [...analysis.kindOwner.entries()].map(([kind, id]) => [kind, analysis.tokenById.get(id)]),
  );
  const tokens = [];
  let offset = 0;
  let lexemes = 0;
  const retain = (definition, endOffset) => {
    lexemes += 1;
    if (lexemes > maxLexemes) {
      throw new KnowledgeGraphError(
        "declarative_grammar_token_limit_exceeded",
        "Declarative grammar tokenization exceeded its token bound.",
        { maxTokens: maxLexemes },
      );
    }
    if (!definition.skip) {
      tokens.push({
        id: definition.id,
        startOffset: offset,
        endOffset,
        value: text.slice(offset, endOffset),
      });
    }
    offset = endOffset;
  };
  while (offset < text.length) {
    checkpoint("tokenize");
    let literalMatch = null;
    for (const candidate of literals) {
      if (!text.startsWith(candidate.literal, offset)) continue;
      const next = text[offset + candidate.literal.length] || "";
      if (/[A-Za-z0-9_-]/u.test(candidate.literal.at(-1))
        && /[A-Za-z0-9_-]/u.test(next)) continue;
      literalMatch = candidate;
      break;
    }
    if (literalMatch) {
      retain(analysis.tokenById.get(literalMatch.id), offset + literalMatch.literal.length);
      continue;
    }
    const rest = text.slice(offset);
    const quote = rest[0];
    if (kindTokens.has("string") && (quote === "\"" || quote === "'")) {
      let end = 1;
      let escaped = false;
      while (end < rest.length) {
        checkpoint("tokenize-string");
        const character = rest[end];
        if (!escaped && character === quote) {
          end += 1;
          break;
        }
        if (!escaped && (character === "\n" || character === "\r")) break;
        escaped = !escaped && character === "\\";
        if (character !== "\\") escaped = false;
        end += 1;
      }
      if (rest[end - 1] === quote) {
        retain(kindTokens.get("string"), offset + end);
        continue;
      }
    }
    const candidates = [
      ["newline", /^(?:\r\n|\n|\r)/u],
      ["whitespace", /^[\t ]+/u],
      ["number", /^[+-]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u],
      ["identifier", /^[A-Za-z_][A-Za-z0-9_-]*/u],
    ];
    let matched = false;
    for (const [kind, pattern] of candidates) {
      const definition = kindTokens.get(kind);
      if (!definition) continue;
      const match = pattern.exec(rest);
      if (!match) continue;
      retain(definition, offset + match[0].length);
      matched = true;
      break;
    }
    if (matched) continue;
    throw new KnowledgeGraphError(
      "declarative_grammar_tokenize_failed",
      "Declarative grammar could not tokenize the source.",
      sourcePosition(text, offset),
    );
  }
  return tokens;
}

function interpret(tokens, grammar, analysis, text, checkpoint) {
  let cursor = 0;
  let syntaxNodes = 0;
  const lookahead = () => tokens[cursor]?.id || "";
  const termStarts = (term) => (
    term.token
      ? lookahead() === term.token
      : analysis.first.get(term.rule).has(lookahead()) || (
        !lookahead() && analysis.nullable.get(term.rule)
      )
  );
  const syntaxError = (message) => {
    const offset = tokens[cursor]?.startOffset ?? text.length;
    throw new KnowledgeGraphError(
      "declarative_grammar_syntax_error",
      message,
      { ...sourcePosition(text, offset), token: lookahead() || "<eof>" },
    );
  };
  const parseRule = (ruleId, depth) => {
    checkpoint("parse-rule");
    if (depth > MAX_PARSE_DEPTH) {
      throw new KnowledgeGraphError(
        "declarative_grammar_depth_limit_exceeded",
        "Declarative grammar parsing exceeded its recursion-depth bound.",
        { maxDepth: MAX_PARSE_DEPTH, rule: ruleId },
      );
    }
    const rule = analysis.ruleById.get(ruleId);
    const alternatives = analysis.alternativesByRule.get(ruleId);
    const alternative = alternatives.find((candidate) => (
      candidate.first.has(lookahead())
    )) || alternatives.find((candidate) => candidate.nullable);
    if (!alternative) syntaxError(`Expected grammar rule ${ruleId}.`);
    const startOffset = tokens[cursor]?.startOffset ?? text.length;
    const children = [];
    for (const term of alternative.sequence) {
      let count = 0;
      while (count < term.max && termStarts(term)) {
        checkpoint("parse-term");
        const before = cursor;
        const child = term.token
          ? (() => {
              const token = tokens[cursor];
              if (!token || token.id !== term.token) {
                syntaxError(`Expected grammar token ${term.token}.`);
              }
              cursor += 1;
              return { kind: "token", tokenId: token.id, ...token };
            })()
          : parseRule(term.rule, depth + 1);
        children.push({ ...child, ...(term.capture ? { capture: term.capture } : {}) });
        count += 1;
        if (cursor === before) break;
      }
      if (count < term.min) {
        syntaxError(`Expected at least ${term.min} occurrence(s) in grammar rule ${ruleId}.`);
      }
    }
    const endOffset = children.at(-1)?.endOffset ?? startOffset;
    syntaxNodes += 1;
    if (syntaxNodes > MAX_LEXEMES) {
      throw new KnowledgeGraphError(
        "declarative_grammar_node_limit_exceeded",
        "Declarative grammar parsing exceeded its syntax-node bound.",
        { maxNodes: MAX_LEXEMES },
      );
    }
    return {
      kind: "rule",
      ruleId,
      alternative: alternatives.indexOf(alternative),
      startOffset,
      endOffset,
      children,
    };
  };
  const root = parseRule(grammar.start, 1);
  if (cursor !== tokens.length) syntaxError("Declarative grammar did not consume the complete source.");
  return root;
}

export function compileDeclarativeGrammar(rawGrammar) {
  if (rawGrammar && typeof rawGrammar === "object" && compiledGrammarCache.has(rawGrammar)) {
    return compiledGrammarCache.get(rawGrammar);
  }
  const grammar = normalizeGrammar(rawGrammar);
  const analysis = analyzeGrammar(grammar);
  const digest = sha256(stableStringify(grammar, 0));
  const compiled = Object.freeze({
    digest,
    grammar,
    parse(textRaw, options = {}) {
      const text = String(textRaw || "");
      const maximumBytes = boundedRuntimeLimit(
        options.maxDeclarativeSourceBytes,
        MAX_SOURCE_BYTES,
        MAX_SOURCE_BYTES,
      );
      const sourceBytes = Buffer.byteLength(text, "utf8");
      if (sourceBytes > maximumBytes) {
        throw new KnowledgeGraphError(
          "declarative_grammar_source_limit_exceeded",
          "Declarative grammar source exceeds its byte bound.",
          { maxSourceBytes: maximumBytes, sourceBytes },
        );
      }
      const checkpoint = createOperationCheckpoint(options);
      const tokens = tokenize(text, analysis, options, checkpoint);
      return interpret(tokens, grammar, analysis, text, checkpoint);
    },
  });
  compiledGrammarCache.set(grammar, compiled);
  if (rawGrammar && typeof rawGrammar === "object") compiledGrammarCache.set(rawGrammar, compiled);
  return compiled;
}
