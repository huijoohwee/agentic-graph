# Agent Mission workspace observation

Agent Mission uses the original Dashboard Span tree card and the existing Editor Workspace.
The read-only `/agent-mission/agent-mission.manifest.json` source reflects the same in-memory
observation as the tree and the shared Dashboard metrics, charts and tables. While inspection is
active, cards summarize retained span kinds, causal links and recorded measurements; they never
fall back to the authored canvas graph. Table selection selects the corresponding span and its
source label stays read-only. Closing inspection restores the authored Dashboard. The original
cards and configuration backs share this source binding; display settings remain editable.
Select the card once, then choose **Flip** on its shared floating toolbar
to configure imports, filters, run selection, refresh and display settings. Configuration scrolls
inside the unchanged card dimensions; the front presents evidence.

The front's compact metric selector independently toggles Time, Exclusive observed, Tokens,
CPU, Peak RSS and Cost in aligned columns. Two-line span rows keep the same height on selection.
Time retains source clock offsets; resource bars compare recorded per-span values
against the largest loaded measurement. Unknown values have no bar, measured zero stays zero,
and reused spans retain their labelled original measurements. The selection survives refreshes.

Collect real phase receipts with the native `agentic-os workflow collect --input=<input>` owner.
Select the exact immutable `manifest` path returned by collection for this local clone:

```sh
git config --local agentic-os.workflowManifest /absolute/.workspace/.artifacts/workflows/REPOSITORY_DIGEST/MANIFEST_DIGEST/manifest.json
```

Opening Agent Mission reads that selection through the existing guarded loopback bridge, then
streams all its native archive pages using the existing SSE reader. Completed page validation
publishes one snapshot to both the tree and Editor JSON. The default workspace feed refreshes
every 15 seconds while visible and online; the flip side can pause it. It never executes agents.
A subsequent collection creates a new immutable root. Set the same clone-local selection to its
returned path to follow that root; old archives remain intact. No directory crawl, guessed latest
file or second observation ledger is used. Missing phases and unknown costs remain explicit.

The bridge enforces same-origin POST, input and concurrency bounds, regular private manifest files,
workspace containment and native source/digest validation. Browser requests cannot choose an
arbitrary filesystem path. Invalid selected sources fail visibly rather than switching authority.
Snapshots expire after 60 seconds and are not persisted into authored documents or browser storage.
Clear the selection with `git config --local --unset agentic-os.workflowManifest` to use the
existing hosted-runtime query path. Imported files remain explicit read-only snapshots.

## Explicit Markdown dashboard checkpoints

Dashboard → **Markdown dashboard** uses the registered Mission template in
`huijoohwee.github.io/template/agentic-graph-agent-mission-template.md`. Choose **Workspace · .workspace** to read the host-selected native archive through the existing
validated observation reader, **Current Mission** to save the loaded inspection, or **Imported snapshot**
for a finite JSON/SSE upload. Workspace-backed Missions default to the workspace source; **Inspect current
Mission source** opens its read-only manifest in the shared Editor. Select a Markdown template path and save. **Open saved dashboard**
opens the historical `.md` in Source Files and the shared Dashboard; it does not reconnect the run.
The report retains resolved scalar/table values and layout. Props, fold, shared drag and resize update
that document's configuration. Notes outside the generated boundaries remain authored text.

Generic input uses `agentic-graph/dashboard-event/v1`: `sourceId`, nonnegative integer `sequence`,
`observedAt` in Unix milliseconds, boolean `complete`, and object `data`. The Mission template binds
`run.id`, `run.status`, `run.spanCount`, `resources` (`label`, `value`) and `spans` (`operation`, `status`,
`durationMs`, `cpuMs`, `peakMemoryBytes`). Missing scalar measurements display Unknown.
SSE uses complete JSON events in `data:` frames, optionally ending with `[DONE]`. Input is bounded to
32 full snapshots / 1 MiB; conflicting replay, source changes, backward revisions and truncated frames
fail before saving. Patches and continuous reconnect are unsupported in this increment.

Export is deliberate and local; the native manifest and template remain unchanged. Existing Source
Files authenticated Markdown transfer can upload the report explicitly. It does not transport native
archives or make saved observations authoritative. See the
[joined implementation plan](documents/agentic-graph-stream-dashboard-prd-tad-adr-mvp-gtm.md).
