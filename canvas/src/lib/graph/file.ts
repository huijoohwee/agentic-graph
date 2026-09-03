import { GraphData } from './types';
import { exportAsJsonLdBlob, exportAsCombinedCsvBlob, exportAsRawJsonBlob, exportAsGraphMlBlob, exportAsCypherBlob } from './io/adapter';
import { buildWidgetBundleJsonText } from './io/widgetBundle'
import { readExportPrefs, writeExportPrefs, saveBlobWithPicker, downloadBlob } from './save';
import type { GraphValidationSummary } from './validation';
export { pickTextFile, pickTextFileWithExtensions, pickTextFilesWithExtensions } from './filePicker';
export {
  buildSelectionSubgraph,
  buildSelectionSubgraphForAnchorIds,
  buildSelectionSubgraphForIds,
  readSelectionSubgraphMembershipForAnchorIds,
  readSelectionSubgraphMembershipForIds,
  type SelectionSubgraphMembership,
} from './selectionSubgraph'
import { buildSelectionSubgraph } from './selectionSubgraph'

declare const datasetPathBrand: unique symbol;
declare const schemaConfigPathBrand: unique symbol;

export type DatasetPath = string & { readonly [datasetPathBrand]: true };
export type SchemaConfigPath = string & { readonly [schemaConfigPathBrand]: true };

export const toDatasetPath = (path: string): DatasetPath => path as DatasetPath;
export const toSchemaConfigPath = (path: string): SchemaConfigPath => path as SchemaConfigPath;
export const SCHEMA_CONFIG_DIR = 'data/config/schema'
export const SCHEMA_CONFIG_PATH_PREFIX = `${SCHEMA_CONFIG_DIR}/`
export const DEFAULT_SCHEMA_CONFIG_FILENAME = 'agentic-graph-universal-schema-config.jsonld'
export const DEFAULT_SCHEMA_CONFIG_PATH = toSchemaConfigPath(`${SCHEMA_CONFIG_PATH_PREFIX}${DEFAULT_SCHEMA_CONFIG_FILENAME}`)

export const normalizeSchemaConfigPath = (
  path: string | null | undefined,
  fallback: SchemaConfigPath = DEFAULT_SCHEMA_CONFIG_PATH,
): SchemaConfigPath => {
  const trimmed = String(path || '').trim()
  if (!trimmed) return fallback
  if (trimmed.startsWith(SCHEMA_CONFIG_PATH_PREFIX)) return toSchemaConfigPath(trimmed)
  return toSchemaConfigPath(`${SCHEMA_CONFIG_PATH_PREFIX}${trimmed}`)
}

export const schemaConfigFilePath = (filename: string): SchemaConfigPath => normalizeSchemaConfigPath(filename)

export const ensureExt = (name: string, allowed: string[], fallback: string): string => {
  const s = String(name || '').toLowerCase()
  const ok = allowed.some(ext => s.endsWith(ext))
  return ok ? name : fallback
}

export const readExportPrefsMeta = (): { format: string | null; filename: string | null } => {
  const prefs = readExportPrefs()
  const format = typeof (prefs as { format?: unknown }).format === 'string' ? (prefs as { format?: string }).format || null : null
  const filename =
    typeof (prefs as { filename?: unknown }).filename === 'string' ? (prefs as { filename?: string }).filename || null : null
  return { format, filename }
}

export async function saveGraphFile(data: GraphData, suggested?: DatasetPath): Promise<void> {
  try {
    const blob = exportAsJsonLdBlob(data);
    const base = suggested ? String(suggested) : 'graph.jsonld';
    const name = ensureExt(base, ['.jsonld', '.json'], 'graph.jsonld');
    const saved = await saveBlobWithPicker(blob, name, { description: 'JSON-LD Files', accept: { 'application/ld+json': ['.jsonld', '.json'] } });
    if (saved === '') return;
    if (!saved) downloadBlob(blob, 'graph.jsonld');
  } catch {
    void 0
  }
}

export async function exportSelectionAsJsonLd(data: GraphData, selectedNodeId: string | null, selectedEdgeId: string | null, suggested?: DatasetPath): Promise<void> {
  const subgraph = buildSelectionSubgraph(data, selectedNodeId, selectedEdgeId);
  if (!subgraph) return;
  try {
    const blob = exportAsJsonLdBlob(subgraph);
    const base = suggested ? String(suggested) : 'graph-selection.jsonld';
    const name = ensureExt(base, ['.jsonld', '.json'], 'graph-selection.jsonld');
    const saved = await saveBlobWithPicker(blob, name, { description: 'JSON-LD Files', accept: { 'application/ld+json': ['.jsonld', '.json'] } });
    if (saved === '') return;
    if (!saved) downloadBlob(blob, 'graph-selection.jsonld');
  } catch {
    void 0
  }
}

export async function exportSelectionAsJSON(data: GraphData, selectedNodeId: string | null, selectedEdgeId: string | null, suggested?: DatasetPath): Promise<void> {
  const subgraph = buildSelectionSubgraph(data, selectedNodeId, selectedEdgeId);
  if (!subgraph) return;
  try {
    const blob = exportAsRawJsonBlob(subgraph);
    const prefs = readExportPrefs();
    const pref = (typeof (prefs as Record<string, unknown>).filename === 'string' && (prefs as Record<string, unknown>).format === 'json-selection')
      ? ((prefs as Record<string, unknown>).filename as string) : 'graph-selection.json';
    const base = suggested ? String(suggested) : pref;
    const name = ensureExt(base, ['.json'], 'graph-selection.json');
    const saved = await saveBlobWithPicker(blob, name, { description: 'JSON Files', accept: { 'application/json': ['.json'] } });
    if (saved === '') return;
    if (saved) {
      writeExportPrefs({ format: 'json-selection', filename: saved });
      return;
    }
    downloadBlob(blob, 'graph-selection.json');
  } catch {
    void 0
  }
}

export async function exportSelectionAsCombinedCSV(data: GraphData, selectedNodeId: string | null, selectedEdgeId: string | null, suggested?: DatasetPath): Promise<void> {
  const subgraph = buildSelectionSubgraph(data, selectedNodeId, selectedEdgeId);
  if (!subgraph) return;
  try {
    const blob = exportAsCombinedCsvBlob(subgraph);
    const prefs = readExportPrefs();
    const pref = (typeof (prefs as Record<string, unknown>).filename === 'string' && (prefs as Record<string, unknown>).format === 'csv-combined-selection')
      ? ((prefs as Record<string, unknown>).filename as string) : 'graph-selection.csv';
    const base = suggested ? String(suggested) : pref;
    const name = ensureExt(base, ['.csv'], 'graph-selection.csv');
    const saved = await saveBlobWithPicker(blob, name, { description: 'CSV Files', accept: { 'text/csv': ['.csv'] } });
    if (saved === '') return;
    if (saved) {
      writeExportPrefs({ format: 'csv-combined-selection', filename: saved });
      return;
    }
    downloadBlob(blob, 'graph-selection.csv');
  } catch {
    void 0
  }
}

export async function exportSelectionAsGraphML(data: GraphData, selectedNodeId: string | null, selectedEdgeId: string | null, suggested?: DatasetPath): Promise<void> {
  const subgraph = buildSelectionSubgraph(data, selectedNodeId, selectedEdgeId);
  if (!subgraph) return;
  try {
    const blob = exportAsGraphMlBlob(subgraph);
    const prefs = readExportPrefs();
    const pref = (typeof (prefs as Record<string, unknown>).filename === 'string' && (prefs as Record<string, unknown>).format === 'graphml-selection')
      ? ((prefs as Record<string, unknown>).filename as string) : 'graph-selection.graphml';
    const base = suggested ? String(suggested) : pref;
    const name = ensureExt(base, ['.graphml', '.xml'], 'graph-selection.graphml');
    const saved = await saveBlobWithPicker(blob, name, { description: 'GraphML Files', accept: { 'application/graphml+xml': ['.graphml', '.xml'] } });
    if (saved === '') return;
    if (saved) {
      writeExportPrefs({ format: 'graphml-selection', filename: saved });
      return;
    }
    downloadBlob(blob, 'graph-selection.graphml');
  } catch {
    void 0
  }
}

export async function exportSelectionAsCypher(data: GraphData, selectedNodeId: string | null, selectedEdgeId: string | null, suggested?: DatasetPath): Promise<void> {
  const subgraph = buildSelectionSubgraph(data, selectedNodeId, selectedEdgeId);
  if (!subgraph) return;
  try {
    const blob = exportAsCypherBlob(subgraph);
    const prefs = readExportPrefs();
    const pref = (typeof (prefs as Record<string, unknown>).filename === 'string' && (prefs as Record<string, unknown>).format === 'cypher-selection')
      ? ((prefs as Record<string, unknown>).filename as string) : 'graph-selection.cypher';
    const base = suggested ? String(suggested) : pref;
    const name = ensureExt(base, ['.cypher', '.cql', '.txt'], 'graph-selection.cypher');
    const saved = await saveBlobWithPicker(blob, name, { description: 'Cypher Files', accept: { 'text/plain': ['.cypher', '.cql', '.txt'] } });
    if (saved === '') return;
    if (saved) {
      writeExportPrefs({ format: 'cypher-selection', filename: saved });
      return;
    }
    downloadBlob(blob, 'graph-selection.cypher');
  } catch {
    void 0
  }
}

export async function exportGraphAsJSON(data: GraphData, suggested?: DatasetPath): Promise<void> {
  try {
    const blob = exportAsRawJsonBlob(data);
    const prefs = readExportPrefs();
    const pref = (typeof (prefs as Record<string, unknown>).filename === 'string' && (prefs as Record<string, unknown>).format === 'json')
      ? ((prefs as Record<string, unknown>).filename as string) : 'graph.json';
    const base = suggested ? String(suggested) : pref;
    const name = ensureExt(base, ['.json'], 'graph.json');
    const saved = await saveBlobWithPicker(blob, name, { description: 'JSON Files', accept: { 'application/json': ['.json'] } });
    if (saved === '') return;
    if (saved) {
      writeExportPrefs({ format: 'json', filename: saved });
      return;
    }
    downloadBlob(blob, 'graph.json');
  } catch {
    void 0
  }
}

export async function exportGraphAsGraphML(data: GraphData, suggested?: DatasetPath): Promise<void> {
  try {
    const blob = exportAsGraphMlBlob(data);
    const prefs = readExportPrefs();
    const pref = (typeof (prefs as Record<string, unknown>).filename === 'string' && (prefs as Record<string, unknown>).format === 'graphml')
      ? ((prefs as Record<string, unknown>).filename as string) : 'graph.graphml';
    const base = suggested ? String(suggested) : pref;
    const name = ensureExt(base, ['.graphml', '.xml'], 'graph.graphml');
    const saved = await saveBlobWithPicker(blob, name, { description: 'GraphML Files', accept: { 'application/graphml+xml': ['.graphml', '.xml'] } });
    if (saved === '') return;
    if (saved) {
      writeExportPrefs({ format: 'graphml', filename: saved });
      return;
    }
    downloadBlob(blob, 'graph.graphml');
  } catch {
    void 0
  }
}

export async function exportGraphAsCypher(data: GraphData, suggested?: DatasetPath): Promise<void> {
  try {
    const blob = exportAsCypherBlob(data);
    const prefs = readExportPrefs();
    const pref = (typeof (prefs as Record<string, unknown>).filename === 'string' && (prefs as Record<string, unknown>).format === 'cypher')
      ? ((prefs as Record<string, unknown>).filename as string) : 'graph.cypher';
    const base = suggested ? String(suggested) : pref;
    const name = ensureExt(base, ['.cypher', '.cql', '.txt'], 'graph.cypher');
    const saved = await saveBlobWithPicker(blob, name, { description: 'Cypher Files', accept: { 'text/plain': ['.cypher', '.cql', '.txt'] } });
    if (saved === '') return;
    if (saved) {
      writeExportPrefs({ format: 'cypher', filename: saved });
      return;
    }
    downloadBlob(blob, 'graph.cypher');
  } catch {
    void 0
  }
}

// prefs moved to ./save

export async function exportGraphAsCombinedCSV(data: GraphData, suggested?: DatasetPath): Promise<void> {
  try {
    const blob = exportAsCombinedCsvBlob(data);
    const prefs = readExportPrefs();
    const pref = (typeof (prefs as Record<string, unknown>).filename === 'string' && (prefs as Record<string, unknown>).format === 'csv-combined')
      ? ((prefs as Record<string, unknown>).filename as string) : 'graph.csv';
    const base = suggested ? String(suggested) : pref;
    const name = ensureExt(base, ['.csv'], 'graph.csv');
    const saved = await saveBlobWithPicker(blob, name, { description: 'CSV Files', accept: { 'text/csv': ['.csv'] } });
    if (saved === '') return;
    if (saved) {
      writeExportPrefs({ format: 'csv-combined', filename: saved });
      return;
    }
    downloadBlob(blob, 'graph.csv');
  } catch {
    void 0
  }
}

export async function exportSvgSnapshot(svgMarkup: string, suggestedName?: string): Promise<void> {
  try {
    const trimmed = String(svgMarkup || '').trim();
    if (!trimmed) return;
    const blob = new Blob([trimmed], { type: 'image/svg+xml;charset=utf-8' });
    const prefs = readExportPrefs();
    const pref = (typeof (prefs as Record<string, unknown>).filename === 'string' && (prefs as Record<string, unknown>).format === 'svg-snapshot')
      ? ((prefs as Record<string, unknown>).filename as string) : 'graph-snapshot.svg';
    const base = typeof suggestedName === 'string' && suggestedName.trim() ? suggestedName : pref;
    const name = ensureExt(base, ['.svg'], 'graph-snapshot.svg');
    const saved = await saveBlobWithPicker(blob, name, { description: 'SVG Files', accept: { 'image/svg+xml': ['.svg'] } });
    if (saved === '') return;
    if (saved) {
      writeExportPrefs({ format: 'svg-snapshot', filename: saved });
      return;
    }
    downloadBlob(blob, 'graph-snapshot.svg');
  } catch {
    void 0
  }
}

export async function exportPngSnapshot(pngBlob: Blob, suggestedName?: string): Promise<void> {
  try {
    const blob = pngBlob;
    const prefs = readExportPrefs();
    const pref = (typeof (prefs as Record<string, unknown>).filename === 'string' && (prefs as Record<string, unknown>).format === 'png-snapshot')
      ? ((prefs as Record<string, unknown>).filename as string) : 'graph-snapshot.png';
    const base = typeof suggestedName === 'string' && suggestedName.trim() ? suggestedName : pref;
    const name = ensureExt(base, ['.png'], 'graph-snapshot.png');
    const saved = await saveBlobWithPicker(blob, name, { description: 'PNG Files', accept: { 'image/png': ['.png'] } });
    if (saved === '') return;
    if (saved) {
      writeExportPrefs({ format: 'png-snapshot', filename: saved });
      return;
    }
    downloadBlob(blob, 'graph-snapshot.png');
  } catch {
    void 0
  }
}

export async function exportHtmlSnapshot(htmlMarkup: string, suggestedName?: string): Promise<void> {
  try {
    const trimmed = String(htmlMarkup || '').trim()
    if (!trimmed) return
    const blob = new Blob([trimmed], { type: 'text/html;charset=utf-8' })
    const prefs = readExportPrefs()
    const pref = (typeof (prefs as Record<string, unknown>).filename === 'string' && (prefs as Record<string, unknown>).format === 'html-viewer')
      ? ((prefs as Record<string, unknown>).filename as string) : 'graph-viewer.html'
    const base = typeof suggestedName === 'string' && suggestedName.trim() ? suggestedName : pref
    const name = ensureExt(base, ['.html', '.htm'], 'graph-viewer.html')
    const saved = await saveBlobWithPicker(blob, name, { description: 'HTML Files', accept: { 'text/html': ['.html', '.htm'] } })
    if (saved === '') return
    if (saved) {
      writeExportPrefs({ format: 'html-viewer', filename: saved })
      return
    }
    downloadBlob(blob, 'graph-viewer.html')
  } catch {
    void 0
  }
}

export async function exportHtmlCanvasSnapshot(htmlMarkup: string, mode: '2d' | '3d', suggestedName?: string): Promise<void> {
  try {
    const trimmed = String(htmlMarkup || '').trim()
    if (!trimmed) return
    const blob = new Blob([trimmed], { type: 'text/html;charset=utf-8' })
    const prefs = readExportPrefs()
    const pref = (typeof (prefs as Record<string, unknown>).filename === 'string' && (prefs as Record<string, unknown>).format === 'html-canvas')
      ? ((prefs as Record<string, unknown>).filename as string) : `graph.canvas-${mode}.html`
    const base = typeof suggestedName === 'string' && suggestedName.trim() ? suggestedName : pref
    const baseStem = base.replace(/\.[a-z0-9]+$/i, '')
    const name = ensureExt(`${baseStem}.canvas-${mode}.html`, ['.html', '.htm'], `graph.canvas-${mode}.html`)
    const saved = await saveBlobWithPicker(blob, name, { description: 'HTML Files', accept: { 'text/html': ['.html', '.htm'] } })
    if (saved === '') return
    if (saved) {
      writeExportPrefs({ format: 'html-canvas', filename: saved })
      return
    }
    downloadBlob(blob, `graph.canvas-${mode}.html`)
  } catch {
    void 0
  }
}

export async function exportValidationSummaryAsJSON(summary: GraphValidationSummary, suggestedName?: string): Promise<void> {
  try {
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const prefs = readExportPrefs();
    const pref = (typeof (prefs as Record<string, unknown>).filename === 'string' && (prefs as Record<string, unknown>).format === 'validation-json')
      ? ((prefs as Record<string, unknown>).filename as string) : 'graph-validation.json';
    const base = typeof suggestedName === 'string' && suggestedName.trim() ? suggestedName : pref;
    const name = ensureExt(base, ['.json'], 'graph-validation.json');
    const saved = await saveBlobWithPicker(blob, name, { description: 'JSON Files', accept: { 'application/json': ['.json'] } });
    if (saved === '') return;
    if (saved) {
      writeExportPrefs({ format: 'validation-json', filename: saved });
      return;
    }
    downloadBlob(blob, 'graph-validation.json');
  } catch {
    void 0
  }
}

export async function exportValidationSummaryAsMarkdown(summary: GraphValidationSummary, suggestedName?: string): Promise<void> {
  try {
    const parts: string[] = [];
    parts.push('# Graph validation');
    parts.push('');
    parts.push('## Metrics');
    parts.push(`- Nodes: ${summary.metrics.nodeCount}`);
    parts.push(`- Edges: ${summary.metrics.edgeCount}`);
    parts.push(`- Duplicate node IDs: ${summary.metrics.duplicateNodeIdCount}`);
    parts.push(`- Dangling edges: ${summary.metrics.danglingEdgeCount}`);
    parts.push(`- Nodes without type: ${summary.metrics.nodesWithoutTypeCount}`);
    parts.push(`- Edges without label: ${summary.metrics.edgesWithoutLabelCount}`);
    parts.push(`- Max degree: ${summary.metrics.maxDegree}`);
    const nodeTypes = Object.entries(summary.metrics.nodeTypeCounts || {});
    if (nodeTypes.length > 0) {
      parts.push('');
      parts.push('### Node types');
      nodeTypes.forEach(([type, count]) => {
        parts.push(`- ${type}: ${count}`);
      });
    }
    const edgeLabels = Object.entries(summary.metrics.edgeLabelCounts || {});
    if (edgeLabels.length > 0) {
      parts.push('');
      parts.push('### Edge labels');
      edgeLabels.forEach(([label, count]) => {
        parts.push(`- ${label}: ${count}`);
      });
    }
    if (Array.isArray(summary.metrics.degreeHistogram) && summary.metrics.degreeHistogram.length > 0) {
      parts.push('');
      parts.push('### Degree histogram');
      summary.metrics.degreeHistogram.forEach((count, degree) => {
        if (!count || degree < 0) return;
        parts.push(`- Degree ${degree}: ${count} nodes`);
      });
    }
    if (summary.errors.length > 0) {
      parts.push('');
      parts.push('## Errors');
      summary.errors.forEach(msg => {
        parts.push(`- ${msg}`);
      });
    }
    if (summary.warnings.length > 0) {
      parts.push('');
      parts.push('## Warnings');
      summary.warnings.forEach(msg => {
        parts.push(`- ${msg}`);
      });
    }
    const text = parts.join('\n');
    const blob = new Blob([text], { type: 'text/markdown' });
    const prefs = readExportPrefs();
    const pref = (typeof (prefs as Record<string, unknown>).filename === 'string' && (prefs as Record<string, unknown>).format === 'validation-md')
      ? ((prefs as Record<string, unknown>).filename as string) : 'graph-validation.md';
    const base = typeof suggestedName === 'string' && suggestedName.trim() ? suggestedName : pref;
    const name = ensureExt(base, ['.md', '.markdown'], 'graph-validation.md');
    const saved = await saveBlobWithPicker(blob, name, { description: 'Markdown Files', accept: { 'text/markdown': ['.md', '.markdown'] } });
    if (saved === '') return;
    if (saved) {
      writeExportPrefs({ format: 'validation-md', filename: saved });
      return;
    }
    downloadBlob(blob, 'graph-validation.md');
  } catch {
    void 0
  }
}

export async function copyGraphJsonToClipboard(data: GraphData | null): Promise<boolean> {
  try {
    if (!data) return false;
    if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
    const text = JSON.stringify(data, null, 2);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function copyGraphJsonLdToClipboard(data: GraphData | null): Promise<boolean> {
  try {
    if (!data) return false;
    if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
    const blob = exportAsJsonLdBlob(data);
    const text = await blob.text();
    if (!text || !text.trim()) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function exportWidgetBundleAsJson(args: {
  graphData: GraphData | null
  registryEntries: unknown[]
  suggestedName?: string
  graphRevision?: number | null
}): Promise<void> {
  try {
    const graphData = args.graphData
    if (!graphData) return
    const text = buildWidgetBundleJsonText({
      registryEntries: args.registryEntries,
      graphData,
      graphRevision: args.graphRevision,
    })
    if (!text.trim()) return
    const blob = new Blob([text], { type: 'application/json' })
    const base = String(args.suggestedName || 'flow-widget.bundle.json')
    const name = ensureExt(base, ['.json'], 'flow-widget.bundle.json')
    const saved = await saveBlobWithPicker(blob, name, { description: 'JSON Files', accept: { 'application/json': ['.json'] } })
    if (saved === '') return
    if (saved) {
      writeExportPrefs({ format: 'flow-widget-bundle', filename: saved })
      return
    }
    downloadBlob(blob, 'flow-widget.bundle.json')
  } catch {
    void 0
  }
}

export async function copyWidgetBundleJsonToClipboard(args: {
  graphData: GraphData | null
  registryEntries: unknown[]
  graphRevision?: number | null
}): Promise<boolean> {
  try {
    if (!args.graphData) return false
    if (typeof navigator === 'undefined' || !navigator.clipboard) return false
    const text = buildWidgetBundleJsonText({
      registryEntries: args.registryEntries,
      graphData: args.graphData,
      graphRevision: args.graphRevision,
    })
    if (!text.trim()) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
