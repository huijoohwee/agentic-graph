import {
  GraphData,
  GraphNode,
  GraphEdge,
  JSONValue,
} from '../types';
import {
  AGENTIC_RAG_CONTEXT_URL,
  AGENTIC_RAG_EDGE_TYPE_IRI,
  AGENTIC_RAG_NODE_TYPE_IRI,
  AG_SUBJECT,
  AG_PREDICATE,
  AG_OBJECT,
} from '@/lib/agenticrag';
import {
  stripKg,
  isRecord,
  isIdPropertyKey,
  AGENTIC_RAG_MINIMAL_CONTEXT,
} from './utils';
import { isPlainObject } from '@/lib/graph/value';

const compareText = (a: unknown, b: unknown): number => String(a || '').localeCompare(String(b || ''));

const readPlainObject = (value: unknown): Record<string, unknown> | null => {
  return isPlainObject(value) ? (value as Record<string, unknown>) : null;
};

const getSortedRecordKeys = (value: Record<string, unknown>): string[] => Object.keys(value).sort((a, b) => compareText(a, b));

const getStableRecordText = (value: Record<string, unknown>): string => {
  return getSortedRecordKeys(value).map(key => `${key}:${JSON.stringify(value[key])}`).join('|');
};

const compareRecords = (a: Record<string, unknown>, b: Record<string, unknown>): number => compareText(getStableRecordText(a), getStableRecordText(b));

const sortJsonLdNodes = (nodes: GraphNode[]): GraphNode[] => {
  return [...nodes].sort((a, b) => compareText(a.id, b.id) || compareText(a.type, b.type) || compareText(a.label, b.label));
};

const sortJsonLdEdges = (edges: GraphEdge[]): GraphEdge[] => {
  return [...edges].sort((a, b) => compareText(a.source, b.source) || compareText(a.label, b.label) || compareText(a.target, b.target) || compareText(a.id, b.id));
};

export function parseJsonLd(jsonld: unknown): GraphData {
  const root = jsonld as Record<string, unknown> | unknown[];
  const rootRecord = readPlainObject(root);
  const graph = Array.isArray(root) ? root : (Array.isArray(rootRecord?.['@graph']) ? (rootRecord['@graph'] as unknown[]) : []);
  const rawCtx = rootRecord?.['@context'] as unknown;
  const { ctxRecord, graphContext } = (() => {
    const mergeAgenticMinimalContext = (base: Record<string, unknown>): Record<string, unknown> => ({
      '@vocab': AGENTIC_RAG_CONTEXT_URL,
      ...AGENTIC_RAG_MINIMAL_CONTEXT,
      ...base,
    });

    if (typeof rawCtx === 'string') {
      const trimmed = rawCtx.trim();
      if (trimmed === AGENTIC_RAG_CONTEXT_URL) {
        const merged = mergeAgenticMinimalContext({});
        return { ctxRecord: merged, graphContext: merged as JSONValue };
      }
      try {
        const parsed = JSON.parse(rawCtx) as unknown;
        const parsedRecord = readPlainObject(parsed);
        if (parsedRecord) {
          const vocab = parsedRecord['@vocab'];
          const merged =
            typeof vocab === 'string' && vocab.trim() === AGENTIC_RAG_CONTEXT_URL
              ? mergeAgenticMinimalContext(parsedRecord)
              : parsedRecord;
          return { ctxRecord: merged, graphContext: merged as JSONValue };
        }
      } catch {
        void 0;
      }
      return { ctxRecord: {}, graphContext: trimmed as JSONValue };
    }

    if (Array.isArray(rawCtx)) {
      const merged: Record<string, unknown> = {};
      rawCtx.forEach((entry) => {
        const entryRecord = readPlainObject(entry);
        if (!entryRecord) return;
        Object.assign(merged, entryRecord);
      });
      const vocab = merged['@vocab'];
      const mergedWithAgentic =
        typeof vocab === 'string' && vocab.trim() === AGENTIC_RAG_CONTEXT_URL
          ? mergeAgenticMinimalContext(merged)
          : merged;
      return { ctxRecord: mergedWithAgentic, graphContext: mergedWithAgentic as JSONValue };
    }

    const rawContextRecord = readPlainObject(rawCtx);
    if (rawContextRecord) {
      const vocab = rawContextRecord['@vocab'];
      const merged =
        typeof vocab === 'string' && vocab.trim() === AGENTIC_RAG_CONTEXT_URL
          ? mergeAgenticMinimalContext(rawContextRecord)
          : rawContextRecord;
      return { ctxRecord: merged, graphContext: merged as JSONValue };
    }

    return { ctxRecord: {}, graphContext: undefined };
  })();
  let graphMetadata: Record<string, JSONValue> | undefined;
  const metaRaw = rootRecord?.['metadata'] as unknown;
  const graphMetadataRecord = readPlainObject(metaRaw);
  if (graphMetadataRecord && Object.keys(graphMetadataRecord).length > 0) {
    graphMetadata = graphMetadataRecord as Record<string, JSONValue>;
  }
  const extraEdgePropertyKeys = (() => {
    const out = new Set<string>()
    const meta = readPlainObject(graphMetadata as unknown)
    if (!meta) return out
    const cfgRaw = readPlainObject(meta.jsonLdMapping)
    if (!cfgRaw) return out
    const listRaw = cfgRaw.contextEdgeProperties as unknown
    if (!Array.isArray(listRaw)) return out
    for (let i = 0; i < listRaw.length; i += 1) {
      const v = listRaw[i]
      if (typeof v !== 'string') continue
      const key = v.trim()
      if (key) out.add(key)
    }
    return out
  })()
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeMap = new Map<string, Record<string, unknown>>();
  const edgeNodes: Array<Record<string, unknown>> = [];
  const edgeNodesAgenticGraph: Array<Record<string, unknown>> = [];
  const edgeNodesAgentic: Array<Record<string, unknown>> = [];
  const isNodeType = (typeList: string[]): boolean =>
    typeList.includes(AGENTIC_RAG_NODE_TYPE_IRI) || typeList.includes('Node') || typeList.includes('agenticgraph:Node');
  const isEdgeType = (typeList: string[]): boolean =>
    typeList.includes(AGENTIC_RAG_EDGE_TYPE_IRI) || typeList.includes('Edge');
  const normalizeEdgeLabel = (raw: unknown): string => {
    const text = String(raw ?? '').trim();
    if (!text) return '';
    return stripKg(text);
  };
  for (const itemAny of graph) {
    const item = isRecord(itemAny) ? itemAny : {};
    const hasReified = item[AG_SUBJECT] && item[AG_OBJECT] && item[AG_PREDICATE];
    if (hasReified) {
      edgeNodes.push(item);
      continue;
    }
    const typeRaw = item['@type'] as unknown;
    const typeList: string[] = [];
    if (Array.isArray(typeRaw)) {
      typeList.push(...typeRaw.map(v => String(v)));
    } else if (typeof typeRaw !== 'undefined' && typeRaw !== null) {
      typeList.push(String(typeRaw));
    }
    if (typeList.includes('agenticgraph:Edge')) {
      edgeNodesAgenticGraph.push(item);
      continue;
    }
    if (isEdgeType(typeList)) {
      edgeNodesAgentic.push(item);
      continue;
    }
    const id = stripKg((item['@id'] as unknown) ?? (item['id'] as unknown));
    if (!id) continue;
    let type = typeList.length > 0 ? typeList[0] : 'Thing';
    if (isNodeType(typeList)) {
      const labelsRaw = item['labels'] as unknown;
      if (Array.isArray(labelsRaw)) {
        const first = labelsRaw.find(v => typeof v === 'string' && v.trim().length > 0);
        if (typeof first === 'string') type = stripKg(first);
      } else {
        type = stripKg(type);
      }
    } else {
      type = stripKg(type);
    }
    const name =
      (item['name'] as unknown) ??
      (item['title'] as unknown) ??
      (item['label'] as unknown) ??
      id;
    nodeMap.set(id, item);
    const props: Record<string, JSONValue> = {};
    let metadata: Record<string, JSONValue> | undefined;
    getSortedRecordKeys(item).forEach((k) => {
      const shouldSkipLabelsKey = isNodeType(typeList);
      if (k === '@id' || k === '@type' || k === 'name' || k === 'label') return;
      if (k === 'labels' && shouldSkipLabelsKey) return;
      if (k === 'kg:x' || k === 'kg:y' || k === 'kg:fx' || k === 'kg:fy') return;
      if (k === 'x' || k === 'y' || k === 'fx' || k === 'fy') return;
      if (k === 'metadata') {
        const vMeta = item[k] as unknown;
        if (isRecord(vMeta)) metadata = vMeta as Record<string, JSONValue>;
        return;
      }
      if (k === 'properties') {
        const inner = item[k] as unknown;
        if (isRecord(inner)) {
          getSortedRecordKeys(inner).forEach((pk) => {
            if (!pk || pk === '@id' || pk === '@type' || pk === 'labels' || pk === 'name' || pk === 'metadata') return;
            if (typeof props[pk] !== 'undefined') return;
            props[pk] = inner[pk] as JSONValue;
          });
          return;
        }
      }
      const v = item[k] as unknown;
      const isIdKey = isIdPropertyKey(ctxRecord, k);
      if (Array.isArray(v)) {
        props[k] = v as JSONValue;
      } else if (!isIdKey || (!Array.isArray(v) && !isRecord(v))) {
        props[k] = v as JSONValue;
      }
    });
    const node: GraphNode = { id, label: String(name), type: String(type), properties: props, metadata };
    if (typeof item['kg:x'] === 'number') node.x = item['kg:x'] as number;
    if (typeof item['kg:y'] === 'number') node.y = item['kg:y'] as number;
    if (typeof item['kg:fx'] === 'number') node.fx = item['kg:fx'] as number;
    if (typeof item['kg:fy'] === 'number') node.fy = item['kg:fy'] as number;
    if (typeof item['x'] === 'number') node.x = item['x'] as number;
    if (typeof item['y'] === 'number') node.y = item['y'] as number;
    if (typeof item['fx'] === 'number') node.fx = item['fx'] as number;
    if (typeof item['fy'] === 'number') node.fy = item['fy'] as number;
    nodes.push(node);
  }
  const nodeEntries = Array.from(nodeMap.entries()).sort((a, b) => compareText(a[0], b[0]));
  for (const [id, item] of nodeEntries) {
    const keys = getSortedRecordKeys(item);
    for (const k of keys) {
      if (k === '@id' || k === '@type' || k === 'name' || k === 'label') continue;
      if (k.startsWith('kg:')) continue;
      const v = item[k] as unknown;
      const isIdKey = isIdPropertyKey(ctxRecord, k);
      const isEdgeKey = isIdKey || extraEdgePropertyKeys.has(k)
      if (!isEdgeKey) continue;
      const arr = (Array.isArray(v) ? v : [v]) as unknown[];
      if (arr.length === 0) continue;
      const allStringOrIdObject = arr.every((x) => {
        if (typeof x === 'string') return true;
        if (!isRecord(x)) return false;
        const idVal = (x['@id'] as unknown) ?? (x['id'] as unknown);
        return typeof idVal === 'string' && idVal.length > 0;
      });
      if (!allStringOrIdObject) continue;
      const label = normalizeEdgeLabel(k);
      if (!label) continue;
      for (let i = 0; i < arr.length; i++) {
        const raw = arr[i];
        let tgtId = '';
        const props: Record<string, JSONValue> = {};
        if (typeof raw === 'string') {
          tgtId = stripKg(raw as unknown);
        } else if (isRecord(raw)) {
          const rawId = (raw['@id'] as unknown) ?? (raw['id'] as unknown);
          if (typeof rawId === 'string') {
            tgtId = stripKg(rawId as unknown);
          }
          getSortedRecordKeys(raw).forEach((pk) => {
            if (pk === '@id' || pk === 'id') return;
            props[pk] = raw[pk] as JSONValue;
          });
        }
        if (!tgtId) continue;
        if (!nodeMap.has(tgtId)) continue;
        edges.push({ id: `${id}-${label}-${tgtId}-${i}`, source: id, target: tgtId, label, properties: props });
      }
    }
  }
  edgeNodes.sort(compareRecords);
  for (const e of edgeNodes) {
    const src = stripKg(e[AG_SUBJECT] as unknown);
    const tgt = stripKg(e[AG_OBJECT] as unknown);
    let label = e[AG_PREDICATE] as unknown;
    if (typeof label === 'string') label = normalizeEdgeLabel(label);
    const props: Record<string, JSONValue> = {};
    let metadata: Record<string, JSONValue> | undefined;
    getSortedRecordKeys(e).forEach((k) => {
      if (k === '@id' || k === AG_SUBJECT || k === AG_OBJECT || k === AG_PREDICATE) return;
      if (k === 'metadata') {
        const vMeta = e[k] as unknown;
        if (isRecord(vMeta)) metadata = vMeta as Record<string, JSONValue>;
        return;
      }
      props[k] = e[k] as JSONValue;
    });
    edges.push({ id: `${src}-${String(label)}-${tgt}-${edges.length}`, source: src, target: tgt, label: String(label), properties: props, metadata });
  }
  edgeNodesAgenticGraph.sort(compareRecords);
  for (const e of edgeNodesAgenticGraph) {
    const src = stripKg((e['source_node'] as unknown) ?? (e['source'] as unknown));
    const tgt = stripKg((e['target_node'] as unknown) ?? (e['target'] as unknown));
    let label = (e['relation'] as unknown) ?? (e['label'] as unknown);
    if (!src || !tgt || !label) continue;
    if (typeof label === 'string') label = normalizeEdgeLabel(label);
    const props: Record<string, JSONValue> = {};
    let metadata: Record<string, JSONValue> | undefined;
    getSortedRecordKeys(e).forEach((k) => {
      if (k === '@id' || k === '@type' || k === 'source_node' || k === 'target_node' || k === 'relation' || k === 'source' || k === 'target' || k === 'label') return;
      if (k === 'metadata') {
        const vMeta = e[k] as unknown;
        if (isRecord(vMeta)) metadata = vMeta as Record<string, JSONValue>;
        return;
      }
      props[k] = e[k] as JSONValue;
    });
    edges.push({ id: `${src}-${String(label)}-${tgt}-${edges.length}`, source: src, target: tgt, label: String(label), properties: props, metadata });
  }
  edgeNodesAgentic.sort(compareRecords);
  for (const e of edgeNodesAgentic) {
    const rawSrc = (e['source'] as unknown) ?? (e['source_node'] as unknown);
    const rawTgt = (e['target'] as unknown) ?? (e['target_node'] as unknown);
    const src = stripKg(rawSrc);
    const tgt = stripKg(rawTgt);
    let label = (e['label'] as unknown) ?? (e['relation'] as unknown);
    if (!src || !tgt || !label) continue;
    if (typeof label === 'string') label = normalizeEdgeLabel(label);
    const props: Record<string, JSONValue> = {};
    let metadata: Record<string, JSONValue> | undefined;
    getSortedRecordKeys(e).forEach((k) => {
      if (
        k === '@id' ||
        k === '@type' ||
        k === 'source' ||
        k === 'target' ||
        k === 'label' ||
        k === 'source_node' ||
        k === 'target_node' ||
        k === 'relation'
      ) return;
      if (k === 'metadata') {
        const vMeta = e[k] as unknown;
        if (isRecord(vMeta)) metadata = vMeta as Record<string, JSONValue>;
        return;
      }
      props[k] = e[k] as JSONValue;
    });
    const edgeIdRaw = e['@id'] as unknown;
    const edgeId =
      typeof edgeIdRaw === 'string' && edgeIdRaw.trim().length > 0
        ? stripKg(edgeIdRaw)
        : `${src}-${String(label)}-${tgt}-${edges.length}`;
    edges.push({ id: edgeId, source: src, target: tgt, label: String(label), properties: props, metadata });
  }
  return { context: graphContext, metadata: graphMetadata, type: 'Graph', nodes: sortJsonLdNodes(nodes), edges: sortJsonLdEdges(edges) };
}
