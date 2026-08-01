import { buildEvidence, makeEdge, makeNode, spanFromOffsets, stableEntityId, versionKnowledgeGraphParserOutput } from "./contract.mjs";

export const SQL_PARSER_ID = "local-sql-structure";
export const SQL_PARSER_VERSION = versionKnowledgeGraphParserOutput("1.0.0");

function tokenizeSql(text, checkpoint = () => {}) {
  const tokens = [];
  const pattern = /\s+|--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[(?:[^\]]|\]\])*\]|[A-Za-z_][A-Za-z0-9_$-]*|[0-9]+(?:\.[0-9]+)?|[(),.;]|[^\s]/gy;
  let match;
  while ((match = pattern.exec(text))) {
    checkpoint("sql.tokens");
    const value = match[0];
    if (/^\s+$/.test(value) || value.startsWith("--") || value.startsWith("/*")) continue;
    tokens.push({ value, upper: value.toUpperCase(), start: match.index, end: pattern.lastIndex });
  }
  return tokens;
}

const unquoteIdentifier = (value) => {
  const raw = String(value || "");
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("`") && raw.endsWith("`"))) return raw.slice(1, -1);
  if (raw.startsWith("[") && raw.endsWith("]")) return raw.slice(1, -1);
  return raw;
};

const normalizedSqlName = (value) => String(value || "").trim().toLowerCase();

function readQualifiedName(tokens, startIndex) {
  const parts = [];
  let index = startIndex;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token || ["(", ")", ",", ";"].includes(token.value)) break;
    if (token.value === ".") {
      index += 1;
      continue;
    }
    if (!/^([A-Za-z_]|["`\[])/.test(token.value)) break;
    parts.push(unquoteIdentifier(token.value));
    index += 1;
    if (tokens[index]?.value !== ".") break;
  }
  return { name: parts.join("."), nextIndex: index };
}

function findClosingParen(tokens, openIndex, checkpoint = () => {}) {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    checkpoint("sql.parentheses");
    if (tokens[index].value === "(") depth += 1;
    if (tokens[index].value === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function findTableClosingParen(tokens, openIndex, checkpoint = () => {}) {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    checkpoint("sql.table-parentheses");
    if (tokens[index].value === ";" && depth === 1) return -1;
    if (tokens[index].value === "(") depth += 1;
    if (tokens[index].value === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevelSegments(tokens, startIndex, endIndex, checkpoint = () => {}) {
  const segments = [];
  let depth = 0;
  let segmentStart = startIndex;
  for (let index = startIndex; index < endIndex; index += 1) {
    checkpoint("sql.segments");
    if (tokens[index].value === "(") depth += 1;
    if (tokens[index].value === ")") depth -= 1;
    if (tokens[index].value === "," && depth === 0) {
      if (index > segmentStart) segments.push(tokens.slice(segmentStart, index));
      segmentStart = index + 1;
    }
  }
  if (endIndex > segmentStart) segments.push(tokens.slice(segmentStart, endIndex));
  return segments.filter((segment) => segment.length);
}

function columnListAfter(segment, keywordIndex) {
  const open = segment.findIndex((token, index) => index > keywordIndex && token.value === "(");
  if (open < 0) return [];
  const close = findClosingParen(segment, open);
  if (close < 0) return [];
  return segment.slice(open + 1, close).filter((token) => token.value !== ",").map((token) => unquoteIdentifier(token.value));
}

function referenceAfter(segment, referenceIndex) {
  const target = readQualifiedName(segment, referenceIndex + 1);
  const openIndex = segment.findIndex((token, index) => index >= target.nextIndex && token.value === "(");
  const closeIndex = openIndex >= 0 ? findClosingParen(segment, openIndex) : -1;
  const columns = openIndex >= 0 ? columnListAfter(segment, openIndex - 1) : [];
  const endToken = segment[closeIndex >= 0 ? closeIndex : Math.max(referenceIndex, target.nextIndex - 1)];
  return { table: target.name, columns, token: segment[referenceIndex], endToken };
}

function parseTableDefinitions(
  tokens,
  checkpoint = () => {},
  retainRecord = () => {},
) {
  const tables = [];
  const diagnostics = [];
  for (let index = 0; index < tokens.length - 2; index += 1) {
    checkpoint("sql.statements");
    if (tokens[index].upper !== "CREATE") continue;
    let cursor = index + 1;
    if (tokens[cursor]?.upper === "OR" && tokens[cursor + 1]?.upper === "REPLACE") cursor += 2;
    if (tokens[cursor]?.upper !== "TABLE") continue;
    cursor += 1;
    if (tokens[cursor]?.upper === "IF" && tokens[cursor + 1]?.upper === "NOT" && tokens[cursor + 2]?.upper === "EXISTS") cursor += 3;
    const qualified = readQualifiedName(tokens, cursor);
    if (!qualified.name) {
      retainRecord("diagnostic", "sql.diagnostics");
      diagnostics.push({ token: tokens[index], message: "CREATE TABLE is missing a table name." });
      continue;
    }
    let openIndex = -1;
    for (let tokenIndex = qualified.nextIndex; tokenIndex < tokens.length; tokenIndex += 1) {
      checkpoint("sql.table-opening");
      const token = tokens[tokenIndex];
      if (token.value === "(" ) {
        openIndex = tokenIndex;
        break;
      }
      if (token.value === ";" || token.upper === "CREATE") break;
    }
    if (openIndex < 0) {
      retainRecord("diagnostic", "sql.diagnostics");
      diagnostics.push({ token: tokens[index], message: `CREATE TABLE ${qualified.name} has no column-list opening parenthesis before the statement boundary.` });
      continue;
    }
    const closeIndex = findTableClosingParen(tokens, openIndex, checkpoint);
    if (closeIndex < 0) {
      retainRecord("diagnostic", "sql.diagnostics");
      diagnostics.push({ token: tokens[index], message: `CREATE TABLE ${qualified.name} has no closing parenthesis before the statement boundary.` });
      continue;
    }
    tables.push({
      name: qualified.name,
      createToken: tokens[index],
      nameToken: tokens[cursor],
      endToken: tokens[closeIndex],
      segments: splitTopLevelSegments(tokens, openIndex + 1, closeIndex, checkpoint),
    });
    index = closeIndex;
  }
  return { tables, diagnostics };
}

function analyzeTable(table, checkpoint = () => {}) {
  const columns = [];
  const primaryKeys = [];
  const foreignKeys = [];
  for (const segmentRaw of table.segments) {
    checkpoint("sql.table-segments");
    let segment = segmentRaw;
    if (segment[0]?.upper === "CONSTRAINT" && segment.length > 2) segment = segment.slice(2);
    const primaryIndex = segment.findIndex((token) => token.upper === "PRIMARY");
    const foreignIndex = segment.findIndex((token) => token.upper === "FOREIGN");
    const referenceIndex = segment.findIndex((token) => token.upper === "REFERENCES");
    if (primaryIndex === 0) {
      for (const name of columnListAfter(segment, primaryIndex)) primaryKeys.push({ name, token: segment[primaryIndex] });
      continue;
    }
    if (foreignIndex === 0 && referenceIndex > foreignIndex) {
      const sourceColumns = columnListAfter(segment, foreignIndex);
      const reference = referenceAfter(segment, referenceIndex);
      foreignKeys.push({ sourceColumns, ...reference });
      continue;
    }
    const first = segment[0];
    if (!first || ["UNIQUE", "CHECK", "KEY", "INDEX"].includes(first.upper)) continue;
    const name = unquoteIdentifier(first.value);
    columns.push({ name, token: first, endToken: segment[segment.length - 1] || first });
    if (primaryIndex >= 0) primaryKeys.push({ name, token: segment[primaryIndex] });
    if (referenceIndex >= 0) foreignKeys.push({ sourceColumns: [name], ...referenceAfter(segment, referenceIndex) });
  }
  return { ...table, columns, primaryKeys, foreignKeys };
}

export function parseSqlSource({ sourcePath, text, contentHash, byteSize }, options = {}) {
  const checkpoint = options.checkpoint || (() => {});
  const retainRecord = options.retainRecord || (() => {});
  checkpoint("sql.start");
  const sourceId = stableEntityId("SourceFile", sourcePath, "source");
  const nodes = new Map();
  const edges = new Map();
  const sourceNode = makeNode({
    id: sourceId,
    label: sourcePath,
    type: "SourceFile",
    sourcePath,
    properties: {
      "corpus:contentHash": contentHash,
      "corpus:byteSize": byteSize,
      "corpus:parserId": SQL_PARSER_ID,
      "corpus:parserVersion": SQL_PARSER_VERSION,
      "corpus:parserFidelity": "structural-parser",
    },
  });
  retainRecord("node", "sql.source");
  nodes.set(sourceId, sourceNode);
  const parsedDefinitions = parseTableDefinitions(
    tokenizeSql(text, checkpoint),
    checkpoint,
    retainRecord,
  );
  const tables = parsedDefinitions.tables.map((table) => analyzeTable(table, checkpoint));
  const declaredTableNames = new Set(tables.map((table) => normalizedSqlName(table.name)));
  const declaredColumnNames = new Set(tables.flatMap((table) => table.columns.map((column) => `${normalizedSqlName(table.name)}.${normalizedSqlName(column.name)}`)));
  const evidenceForTokens = (startToken, endToken, ruleId, explanation, confidence = "high") => buildEvidence({
    sourcePath,
    sourceDigest: contentHash,
    text,
    startOffset: startToken.start,
    endOffset: endToken.end,
    ruleId,
    explanation,
    parserId: SQL_PARSER_ID,
    parserVersion: SQL_PARSER_VERSION,
    confidence,
  });
  const addNode = (node) => {
    if (!nodes.has(node.id)) {
      retainRecord("node", "sql.nodes");
      nodes.set(node.id, node);
    }
    return node.id;
  };
  const addEdge = (edge) => {
    if (!edges.has(edge.id)) {
      retainRecord("edge", "sql.edges");
      edges.set(edge.id, edge);
    }
  };
  const tableIdFor = (name) => stableEntityId("SqlTable", sourcePath, normalizedSqlName(name));
  const columnIdFor = (tableName, columnName) => stableEntityId("SqlColumn", sourcePath, `${normalizedSqlName(tableName)}.${normalizedSqlName(columnName)}`);

  for (const table of tables) {
    checkpoint("sql.tables");
    const tableId = tableIdFor(table.name);
    addNode(makeNode({ id: tableId, label: table.name, type: "SqlTable", sourcePath, properties: { "sql:qualifiedName": table.name } }));
    addEdge(makeEdge({
      source: sourceId,
      target: tableId,
      label: "definesTable",
      evidence: evidenceForTokens(table.createToken, table.nameToken, "sql.create-table.structure", `${sourcePath} defines SQL table ${table.name}.`),
    }));
    for (const column of table.columns) {
      checkpoint("sql.columns");
      const columnId = columnIdFor(table.name, column.name);
      addNode(makeNode({ id: columnId, label: `${table.name}.${column.name}`, type: "SqlColumn", sourcePath, properties: { "sql:table": table.name, "sql:column": column.name } }));
      addEdge(makeEdge({
        source: tableId,
        target: columnId,
        label: "hasColumn",
        evidence: evidenceForTokens(column.token, column.endToken, "sql.column.structure", `SQL table ${table.name} declares column ${column.name}.`),
      }));
    }
    for (const primary of table.primaryKeys) {
      checkpoint("sql.primary-keys");
      const columnId = columnIdFor(table.name, primary.name);
      if (!nodes.has(columnId)) continue;
      nodes.get(columnId).properties["sql:primaryKey"] = true;
      addEdge(makeEdge({
        source: tableId,
        target: columnId,
        label: "hasPrimaryKey",
        evidence: evidenceForTokens(primary.token, primary.token, "sql.primary-key.structure", `Column ${table.name}.${primary.name} is part of the table primary key.`),
      }));
    }
    for (const foreign of table.foreignKeys) {
      foreign.sourceColumns.forEach((sourceColumn, columnIndex) => {
        checkpoint("sql.foreign-keys");
        const sourceColumnId = columnIdFor(table.name, sourceColumn);
        if (!nodes.has(sourceColumnId) || !foreign.table) return;
        const targetDeclared = declaredTableNames.has(normalizedSqlName(foreign.table));
        const targetTableId = targetDeclared
          ? tableIdFor(foreign.table)
          : stableEntityId("SqlTableReference", sourcePath, `${normalizedSqlName(foreign.table)}:${foreign.token.start}`);
        if (!targetDeclared) {
          const span = spanFromOffsets(text, foreign.token.start, foreign.endToken.end);
          const referenceEvidence = evidenceForTokens(foreign.token, foreign.endToken, "sql.reference.structure", "reference");
          addNode(makeNode({
            id: targetTableId,
            label: foreign.table,
            type: "SqlTableReference",
            sourcePath,
            properties: {
              "sql:qualifiedName": foreign.table,
              "corpus:lineStart": span.lineStart,
              "corpus:lineEnd": span.lineEnd,
              "corpus:columnStart": span.columnStart,
              "corpus:columnEnd": span.columnEnd,
              "corpus:excerptHash": referenceEvidence.excerptHash,
            },
          }));
        }
        addEdge(makeEdge({
          source: sourceColumnId,
          target: targetTableId,
          label: "referencesTable",
          evidence: evidenceForTokens(foreign.token, foreign.endToken, "sql.foreign-key.structure", `Foreign-key column ${table.name}.${sourceColumn} references table ${foreign.table}.`),
        }));
        const targetColumn = foreign.columns[columnIndex];
        if (!targetColumn) return;
        const targetColumnDeclared = declaredColumnNames.has(`${normalizedSqlName(foreign.table)}.${normalizedSqlName(targetColumn)}`);
        const targetColumnId = targetColumnDeclared
          ? columnIdFor(foreign.table, targetColumn)
          : stableEntityId("SqlColumnReference", sourcePath, `${normalizedSqlName(foreign.table)}.${normalizedSqlName(targetColumn)}:${foreign.token.start}`);
        if (!targetColumnDeclared && !nodes.has(targetColumnId)) {
          addNode(makeNode({ id: targetColumnId, label: `${foreign.table}.${targetColumn}`, type: "SqlColumnReference", sourcePath, properties: { "sql:table": foreign.table, "sql:column": targetColumn } }));
        }
        addEdge(makeEdge({
          source: sourceColumnId,
          target: targetColumnId,
          label: "referencesColumn",
          evidence: evidenceForTokens(foreign.token, foreign.endToken, "sql.foreign-key-column.structure", `Foreign-key column ${table.name}.${sourceColumn} references column ${foreign.table}.${targetColumn}.`),
        }));
      });
    }
  }

  const malformedDiagnostics = parsedDefinitions.diagnostics.map((diagnostic) => {
    checkpoint("sql.diagnostics");
    const span = spanFromOffsets(text, diagnostic.token.start, diagnostic.token.end);
    return {
      code: "sql_create_table_malformed",
      sourcePath,
      lineStart: span.lineStart,
      columnStart: span.columnStart,
      message: diagnostic.message,
    };
  });
  const diagnostics = malformedDiagnostics.length
    ? malformedDiagnostics
    : tables.length
      ? []
      : [{ code: "sql_schema_not_found", sourcePath, message: `No CREATE TABLE structure was found in ${sourcePath}.` }];
  if (!malformedDiagnostics.length && !tables.length) {
    retainRecord("diagnostic", "sql.diagnostics");
  }
  return {
    parserId: SQL_PARSER_ID,
    parserVersion: SQL_PARSER_VERSION,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    diagnostics,
    status: malformedDiagnostics.length ? "partial" : "parsed",
  };
}
