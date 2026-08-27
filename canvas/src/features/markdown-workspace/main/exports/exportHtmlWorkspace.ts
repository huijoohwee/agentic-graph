import { downloadBlob, saveBlobWithPicker } from '@/lib/graph/save'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { UiToastInput } from '@/hooks/store/types'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { writeKgcCompanionOutputText } from '@/features/chat/chatHistoryWorkspace.output'
import {
  buildHtmlViewerSnapshotDocument,
  type BuildHtmlViewerSnapshotDocumentArgs,
} from './exportHtmlViewer'
import { buildHtmlCanvasWorkspaceDocument } from './exportHtmlCanvas'

type WorkspaceHtmlExportMeta = {
  kind: 'workspace'
  title: string
  exportedAt: string
  activeDocumentPath?: string | null
  graphNodeCount: number
  graphEdgeCount: number
  graphSemanticKey: string
  canvasMode: '2d' | '3d'
}

export type BuildWorkspaceHtmlExportDocumentArgs = {
  title: string
  editorHtml: string
  canvasHtml: string
  meta: WorkspaceHtmlExportMeta
}

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const jsonScriptPayload = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')

export function buildWorkspaceHtmlExportDocument(args: BuildWorkspaceHtmlExportDocumentArgs): string {
  const title = String(args.title || '').trim() || 'AgenticGraph Workspace Export'
  const editorHtml = String(args.editorHtml || '')
  const canvasHtml = String(args.canvasHtml || '')
  const meta = args.meta

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <meta name="agenticgraph-export-kind" content="workspace" />',
    `  <title>${escapeHtml(title)}</title>`,
    '  <style>',
    '    :root{color-scheme:light dark;--kg-bg:#f7f8fa;--kg-panel:#ffffff;--kg-border:#d7dde5;--kg-text:#172033;--kg-muted:#5d687a;--kg-accent:#2563eb}',
    '    *{box-sizing:border-box}',
    '    body{margin:0;background:var(--kg-bg);color:var(--kg-text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
    '    header{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--kg-border);background:var(--kg-panel)}',
    '    h1{margin:0;font-size:16px;line-height:1.25;font-weight:650}',
    '    .kg-meta{margin:4px 0 0;color:var(--kg-muted);font-size:12px;line-height:1.4}',
    '    nav{display:flex;gap:8px;flex-wrap:wrap;font-size:12px}',
    '    nav a{color:var(--kg-accent);text-decoration:none;border:1px solid var(--kg-border);border-radius:6px;padding:5px 8px;background:var(--kg-panel)}',
    '    main{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:12px;padding:12px;height:calc(100vh - 70px);min-height:560px}',
    '    section{min-width:0;min-height:0;border:1px solid var(--kg-border);border-radius:8px;background:var(--kg-panel);overflow:hidden;display:flex;flex-direction:column}',
    '    h2{margin:0;padding:9px 11px;border-bottom:1px solid var(--kg-border);font-size:13px;line-height:1.2;font-weight:650}',
    '    iframe{display:block;width:100%;height:100%;min-height:0;border:0;background:#fff;flex:1}',
    '    @media (max-width: 960px){header{display:block}nav{margin-top:10px}main{grid-template-columns:1fr;height:auto;min-height:0}section{height:72vh}}',
    '    @media (prefers-color-scheme:dark){:root{--kg-bg:#11151c;--kg-panel:#171d26;--kg-border:#303948;--kg-text:#e7ecf4;--kg-muted:#a8b2c2;--kg-accent:#8ab4ff}iframe{background:#fff}}',
    '  </style>',
    '</head>',
    '<body data-kg-workspace-export="workspace">',
    '  <header>',
    '    <section aria-label="Workspace export summary">',
    `      <h1>${escapeHtml(title)}</h1>`,
    `      <p class="kg-meta">Exported ${escapeHtml(meta.exportedAt)} - ${escapeHtml(meta.graphNodeCount)} nodes - ${escapeHtml(meta.graphEdgeCount)} edges - Canvas ${escapeHtml(meta.canvasMode)}</p>`,
    '    </section>',
    '    <nav aria-label="Workspace export sections">',
    '      <a href="#editor-workspace">Editor Workspace</a>',
    '      <a href="#canvas">Canvas</a>',
    '    </nav>',
    '  </header>',
    '  <main>',
    '    <section id="editor-workspace" data-kg-workspace-export-section="editor-workspace">',
    '      <h2>Editor Workspace</h2>',
    '      <iframe id="kg-workspace-editor-frame" title="Editor Workspace"></iframe>',
    '    </section>',
    '    <section id="canvas" data-kg-workspace-export-section="canvas">',
    '      <h2>Canvas</h2>',
    '      <iframe id="kg-workspace-canvas-frame" title="Canvas"></iframe>',
    '    </section>',
    '  </main>',
    `  <script type="application/json" id="kg-workspace-export-meta">${jsonScriptPayload(meta)}</script>`,
    `  <script type="application/json" id="kg-workspace-export-editor-html">${jsonScriptPayload(editorHtml)}</script>`,
    `  <script type="application/json" id="kg-workspace-export-canvas-html">${jsonScriptPayload(canvasHtml)}</script>`,
    '  <script>',
    '    (function(){',
    '      function readJson(id){',
    '        var el = document.getElementById(id);',
    '        if (!el) return "";',
    '        try { return JSON.parse(el.textContent || "\\"\\""); } catch (_err) { return ""; }',
    '      }',
    '      var editorFrame = document.getElementById("kg-workspace-editor-frame");',
    '      var canvasFrame = document.getElementById("kg-workspace-canvas-frame");',
    '      if (editorFrame) editorFrame.srcdoc = readJson("kg-workspace-export-editor-html");',
    '      if (canvasFrame) canvasFrame.srcdoc = readJson("kg-workspace-export-canvas-html");',
    '    })();',
    '  </script>',
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

export async function exportHtmlWorkspaceFromWorkspace(args: BuildHtmlViewerSnapshotDocumentArgs & {
  activeDocumentPath?: string | null
}): Promise<void> {
  const exportBaseName = String(args.exportBaseName || '').trim() || 'document'
  const editorHtml = await buildHtmlViewerSnapshotDocument(args)
  if (!editorHtml) return

  const canvas = await buildHtmlCanvasWorkspaceDocument({
    exportBaseName,
    pushUiToast: args.pushUiToast,
  })
  if (!canvas) return

  const store = useGraphStore.getState()
  const graphData = store.graphData || null
  const nodes = Array.isArray(graphData?.nodes) ? graphData!.nodes : []
  const edges = Array.isArray(graphData?.edges) ? graphData!.edges : []
  const graphSemanticKey = buildScopedGraphSemanticKey('workspace-html-export', {
    graphData,
    graphRevision: store.graphDataRevision,
  })
  const exportedAt = new Date().toISOString()
  const html = buildWorkspaceHtmlExportDocument({
    title: `${exportBaseName} (Workspace)`,
    editorHtml,
    canvasHtml: canvas.html,
    meta: {
      kind: 'workspace',
      title: `${exportBaseName} (Workspace)`,
      exportedAt,
      activeDocumentPath: args.activeDocumentPath || null,
      graphNodeCount: nodes.length,
      graphEdgeCount: edges.length,
      graphSemanticKey,
      canvasMode: canvas.mode,
    },
  })

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const name = `${exportBaseName}-workspace.html`
  const saved = await saveBlobWithPicker(blob, name, { description: 'HTML Files', accept: { 'text/html': ['.html'] } })
  if (saved === '') return
  if (!saved) downloadBlob(blob, name)
  await writeKgcCompanionOutputText({
    workspacePath: args.activeDocumentPath,
    extension: 'html',
    variant: 'workspace',
    text: html,
  })
}
