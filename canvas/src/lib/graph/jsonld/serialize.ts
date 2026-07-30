import {
  GraphData,
  JSONValue,
} from '../types';
import {
  AGENTIC_RAG_CONTEXT_URL,
  AGENTIC_RAG_EDGE_TYPE_IRI,
  AGENTIC_RAG_NODE_TYPE_IRI,
  KG_PREFIX,
} from '@/lib/agenticrag';

const compareText = (a: unknown, b: unknown): number => String(a || '').localeCompare(String(b || ''));

const getSortedJsonEntries = (value: Record<string, unknown> | null | undefined): Array<[string, unknown]> => {
  return Object.entries(value || {}).sort((a, b) => compareText(a[0], b[0]));
};

export function toJsonLd(
  data: GraphData,
): { '@context': Record<string, unknown> | string; '@graph': Array<Record<string, unknown>>; metadata?: Record<string, JSONValue> } {
  const toKgId = (raw: string): string => {
    const text = String(raw || '').trim();
    if (!text) return '';
    if (text.startsWith('http://') || text.startsWith('https://')) return text;
    if (text.includes(':')) return text;
    return `${KG_PREFIX}${text}`;
  };
  const toSafeIdSegment = (raw: string): string =>
    String(raw || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+/, '')
      .replace(/_+$/, '') || 'edge';
  const toEdgeId = (raw: string): string => {
    const text = String(raw || '').trim();
    if (!text) return '';
    if (text.startsWith('http://') || text.startsWith('https://')) return text;
    if (text.includes(':')) return text;
    if (text.startsWith('edge_')) return `${KG_PREFIX}${text}`;
    return `${KG_PREFIX}edge_${toSafeIdSegment(text)}`;
  };
  const graph: Array<Record<string, unknown>> = [];
  const nodes = [...(data.nodes || [])].sort((a, b) =>
    compareText(a.id, b.id) || compareText(a.type, b.type) || compareText(a.label, b.label),
  );
  for (const n of nodes) {
    const id = toKgId(String(n.id));
    if (!id) continue;
    const item: Record<string, unknown> = {
      '@id': id,
      '@type': AGENTIC_RAG_NODE_TYPE_IRI,
      labels: [String(n.type || 'Node')],
      name: String(n.label || n.id),
    };
    if (typeof n.x === 'number') item.x = n.x;
    if (typeof n.y === 'number') item.y = n.y;
    if (typeof n.fx === 'number') item.fx = n.fx;
    if (typeof n.fy === 'number') item.fy = n.fy;
    getSortedJsonEntries(n.properties || {}).forEach(([k, value]) => {
      if (!k || k === '@id' || k === '@type' || k === 'labels' || k === 'name' || k === 'metadata') return;
      item[k] = value as JSONValue;
    });
    if (n.metadata && Object.keys(n.metadata).length > 0) {
      item.metadata = n.metadata;
    }
    graph.push(item);
  }
  const edges = [...(data.edges || [])].sort((a, b) =>
    compareText(a.source, b.source) || compareText(a.label, b.label) || compareText(a.target, b.target) || compareText(a.id, b.id),
  );
  for (const e of edges) {
    const src = toKgId(String(e.source));
    const tgt = toKgId(String(e.target));
    if (!src || !tgt) continue;
    const baseId = `${String(e.source)}-${String(e.label)}-${String(e.target)}`;
    const providedId = String(e.id || '').trim();
    const canonicalBasePrefix = `edge_${toSafeIdSegment(baseId)}`;
    const rawEdgeId = providedId.startsWith(canonicalBasePrefix)
      ? providedId
      : providedId
        ? `${baseId}-${providedId}`
        : baseId;
    const item: Record<string, unknown> = {
      '@id': toEdgeId(rawEdgeId),
      '@type': AGENTIC_RAG_EDGE_TYPE_IRI,
      source: src,
      target: tgt,
      label: String(e.label),
    };
    getSortedJsonEntries(e.properties || {}).forEach(([k, value]) => {
      if (!k || k === '@id' || k === '@type' || k === 'source' || k === 'target' || k === 'label' || k === 'metadata') return;
      item[k] = value as JSONValue;
    });
    if (e.metadata && Object.keys(e.metadata).length > 0) {
      item.metadata = e.metadata;
    }
    graph.push(item);
  }
  const doc: { '@context': Record<string, unknown> | string; '@graph': Array<Record<string, unknown>>; metadata?: Record<string, JSONValue> } = {
    '@context': AGENTIC_RAG_CONTEXT_URL,
    '@graph': graph,
  };
  if (data.metadata && Object.keys(data.metadata).length > 0) {
    doc.metadata = data.metadata;
  }
  return doc;
}
