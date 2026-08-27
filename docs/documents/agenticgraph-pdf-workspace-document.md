# agenticgraph PDF Workspace (Local)

## Scope
Local-only, deterministic **PDF → Markdown → Render** pipeline that writes artifacts under the repo-local ignored `.agenticgraph-workspace/…` root, and surfaces the workflow inside **MainPanel → Workflow Manager** (no dedicated `/workspace` or `/import` pages).

## User Surface (SSOT)
- **Entry point**: `/` (Canvas) → open **Editor workspace** → **Source Files** → **PDF Workspace** addon.
- **Legacy routes**:
  - `/workspace` → redirects to `/?openEditorWorkspace=1`
  - `/import` → redirects to `/?openEditorWorkspace=1`

## Settings
- **`pdfWorkspaceOutputDirRel`** (string, localStorage-backed)
  - Repo-relative output dir for workspace artifacts.
  - Guardrails:
    - Must be under `.agenticgraph-workspace/`
    - Path traversal (`..`) is rejected client-side and server-side

## Local API (dev middleware)
Mounted by Vite dev server:
- `GET /__pdf_workspace/docs?outputDirRel=...`
- `POST /__pdf_workspace/import?outputDirRel=...&conversionMode=text-only|image-heavy|scan-ocr`
- `GET /__pdf_workspace/doc/:docId?outputDirRel=...&mode=...`

## Artifact Layout (filesystem)
Base: `<repoRoot>/.agenticgraph-workspace/pdf-md/`

Per document:
- `.agenticgraph-workspace/pdf-md/<docId>/document.json`
- `.agenticgraph-workspace/pdf-md/<docId>/modes/<mode>/output.md`
- `.agenticgraph-workspace/pdf-md/<docId>/modes/<mode>/anchor-map.json`
- `.agenticgraph-workspace/pdf-md/<docId>/modes/<mode>/conversion-report.json`

Index:
- `.agenticgraph-workspace/pdf-md/index.json`

## Stable Anchors
- Anchors are derived deterministically from Markdown headings.
- Viewer uses URL hash (`#anchorId`) as the touchpoint SSOT.
- On mode switch, the viewer resolves `anchorId` to the next best canonical anchor (parent fallback) to preserve navigation.
