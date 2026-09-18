# Agent Mission workspace observation

Agent Mission uses the original Dashboard Span tree card and the existing Editor Workspace.
The read-only `/agent-mission/agent-mission.manifest.json` source reflects the same in-memory
observation as the tree. Select the card once, then choose **Flip** on its shared floating toolbar
to configure imports, filters, run selection, refresh and display settings. Configuration scrolls
inside the unchanged card dimensions; the front presents evidence.

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
