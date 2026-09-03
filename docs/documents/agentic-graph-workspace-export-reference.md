# agentic-graph - Workspace Export Reference (Runtime SSOT)

App SSOT entrypoint: `canvas/src/lib/toolbar/exportMenuSsot.ts`
Generated file: `docs/documents/agentic-graph-workspace-export-reference.md`.

Notes:
- Export menu entries are SSOT-driven so Launch → Export stays in sync with the codebase reference.
- PNG/SVG prefer DOM capture when `renderMediaAsNodes` is disabled so Rich Media overlays are included.

| Export menu label | export action key |
| --- | --- |
| Duplicate in workspace | `duplicateInWorkspace` |
| Workspace file (.jsonld) | `workspaceFileJsonLd` |
| Markdown (.md) | `markdown` |
| PNG (.png) | `png` |
| GLTF (.gltf) - 3D scene | `gltf` |
| GLB (.glb) - 3D scene | `glb` |
| HTML (.html) — Workspace | `htmlWorkspace` |
| HTML (.html) — Viewer | `htmlViewer` |
| HTML (.html) — Canvas | `htmlCanvas` |
| JSON (.json) | `json` |
| SVG (.svg) | `svg` |
| PDF — Portrait 9:16 (Print…) | `pdfPortrait` |
| PDF — Landscape 16:9 (Print…) | `pdfLandscape` |
