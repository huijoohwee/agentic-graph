# agenticgraph - Storyboard Widget Run All Sequence Reference (Runtime SSOT)

App SSOT entrypoint: `canvas/src/lib/storyboardWidget/runAllSequenceSsot.ts`
Generated file: `docs/documents/agenticgraph-flow-run-all-reference.md`.

Validation fixture: pass an operator-owned Markdown file explicitly; do not default to sibling sandbox demo paths.

| Sequence | phase id | label |
| -------- | -------- | ----- |
| 1 | `text` | Text |
| 2 | `imageFoundation` | Character + Location Image |
| 3 | `imageScene` | Scene Image |
| 4 | `annotation` | Annotation |
| 5 | `video` | Video |

Run-order policy:
- Execute in phase order: Text -> Character + Location Image -> Scene Image -> Annotation -> Video.
- Keep ordering stable by node position (`y`, then `x`, then `id`) inside each phase.
- Prioritize scene images that feed video reference edges before other scene images.

Computing-flow policy:
- Run All reads connected widget inputs through the shared Storyboard Widget computing-flow helpers, not through renderer-local DOM state.
- Each phase consumes and emits values by semantic port key and normalized schema path; duplicate visible labels must not collapse ports, fields, or connected values.
- Empty `null` / `undefined` branch outputs are stop signals and must not be forwarded to downstream phases.
- Generated widget outputs write into existing graph nodes only. Run All must not rewrite Storyboard Widget layout, rich-media panel frames, or edge topology while computing.
- Once a Probe-Tree root has generated continuation cards, that root is lineage-only for Run All; selected child cards own their independent continuation runs.
- Storyboard toolbar routing uses the Strybldr video handoff only for a graph identified as Strybldr. Other multi-Widget Storyboards dispatch to the shared workflow runner.

Source-history policy:
- Live graph publication is synchronous. Each completed node then performs one awaited durable active-source write; publication must not start a competing fire-and-forget source write.
- A graph that is already serialized in the active Markdown source is an accepted no-op, not a rejected publication, and creates no duplicate document version.
- Each changed stage records a GitGraph document version labeled `Run All i/n: <card>` or `Chat Run All i/n: <card>` so toolbar and LLM Chat runs remain traceable by card.
