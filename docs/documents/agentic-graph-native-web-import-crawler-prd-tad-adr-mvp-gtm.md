---
title: "Reference implementation: agentic-graph Native Web Import Crawler — PRD-TAD-ADR-MVP-GTM"
id: "md:agentic-graph-native-web-import-crawler-prd-tad"
doc_type: "PRD-TAD-ADR-MVP-GTM"
version: "0.2.44"
date: "2026-10-01"
lang: "en-US"
guideline_version: "1.7.0"
owner: "docs.native-web-import-crawler"
local_rung: "spec-complete"
delivered_rung: "undocumented"
lane: "authoring"
universal_scope: false
doc_path: "docs/documents/agentic-graph-native-web-import-crawler-prd-tad-adr-mvp-gtm.md"
scope: "Native Import URL crawler, progressive Source Files materialization, accessible icon controls, Canvas projection, and local Markdown export destination"
deploy_boundary: "Authoring-only; mirror and delivery lanes are not provisioned for this increment"
reference_repository: "https://github.com/apify/crawlee"
reference_boundary: "Concept-only review of queue, browser, proxy, retry, and storage capabilities; no source, tests, fixtures, schemas, prose, assets, or dependency copied or imported"
runtime_library: "Reference implementation uses the existing Playwright dependency"
invocation: "/reference.expand @url:<https-url> @reference-policy #canvas"
constraints:
  - "native in-repo implementation"
  - "no Apify or Crawlee package, service, generated code, or runtime dependency"
  - "server-owned credentials and proxy configuration"
  - "bounded pages, downloads, bytes, concurrency, redirects, and navigation time"
  - "private-network targets fail closed unless explicitly enabled for local development"
  - "no proxy endpoint or credential in client options, manifests, Canvas documents, or logs"
frontmatter_contract: "required"
continuity_id: "PLAN-AGENTIC-GRAPH-NATIVE-WEB-IMPORT-CRAWLER-PRD-TAD-ADR-MVP-GTM"
worktree_id: "device-cba000d3779d--planning-v27"
agent_id: "codex-01a0940a"
guideline_revision: "2.7.0"
guideline_source: "https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md"
reviewed_source_revision: "7fb85741121d8c2886027e4a630d013ba91c1027"
previous_document_version: "0.2.42"
prd_revision: "0.2.44"
tad_revision: "0.2.44"
adr_revision: "0.2.44"
mvp_revision: "0.2.44"
gtm_revision: "0.2.44"
---

# Reference implementation: agentic-graph Native Web Import Crawler

## 2026-10-01 stable website import destinations

- PRD: `/fix #website-stable-paths @codex` imports each website page into one host/path document under the configured local `docs_/websites` root. New captures must not create timestamp folders or duplicate date-suffixed copies. Repeat imports update the same URL-owned document; local edits and unrelated files fail closed.
- TAD / ADR: single-page and crawl imports share URL path identity and the existing guarded local-copy publisher. Local Dev awaits each final document write; remote browsers retain their workspace store. Concurrent page writes serialize through the existing guarded publisher, and refreshed host files project into the same workspace paths. Discovery and recovered crawl links use the same host/path identity. Reveal uses the same direct website tree. Private crawler run artifacts retain capture provenance, while workspace migration flattens proven dated collections and preserves conflicting historical bytes and previous-path navigation.
- MVP: eleven existing runtime modules, affected tests and this joined contract; 30 active minutes, 40 KB textual diff, no new dependency or runtime module. Check repeat imports across capture IDs, distinct query URLs, old-path restoration, local copy readback, edited-file conflicts, concurrency and same-origin bounds. Verify the user-supplied URL live without adding its URL or content to product fixtures.
- Observed: the live task UI imported the supplied URL twice and retained exactly one directly saved document with unchanged bytes. The URL, content and filesystem receipt remain outside repository fixtures.
- GTM / rollback: remove repeated-folder navigation from the existing import flow; no revenue claim. Revert this scoped change to restore former destination behavior, preserving existing files. Protected source integration, Dev certification and production remain distinct receipt boundaries.

## 2026-10-01 Folder Import entry and scoped confirmation

- PRD: `/fix #website-folder-import @codex` makes Import usable on a folder containing saved website sources. One distinct source starts the existing page chooser; several distinct sources require an explicit choice. Discovery alone saves no page. A folder can select its discovered descendants and explicitly import its selected pages.
- TAD / ADR: derive candidates from descendant file URL metadata with path-segment boundaries and URL deduplication; never infer a network target from a folder name. Reuse the existing discovery session, projection, import bridge and persistence. The folder confirmation consumes only its selected descendant URLs across pagination and filtering; selections outside it survive, as do selected URLs on failure. Busy and stale sessions remain guarded. No package, service or persistent schema is added.
- MVP: four existing runtime modules, one focused regression file, affected-check registration and this joined specification; 30 active minutes, under 40 KB total diff after pagination coverage. Five focused regressions cover idle folder entry, multiple-source choice, paginated inventory, exact descendant imports, retry and concurrent-action guards. Task-preview UI imported one selected page and returned to zero selected; canonical Dev and exact protected integration require their own receipts. The existing file-only gate caused the disabled icon; prior folder tests exercised selection without invoking that icon.
- GTM / rollback: let users continue from the folder they are already inspecting, with no duplicate import form or guessed website. Buyer and revenue evidence remain unmeasured. Revert the scoped source change to restore file-only import controls. Production activation requires its own exact authorization and receipt.

## 2026-09-30 Production release handover and host-write finding

- PRD / MVP: Source Files page selection, contextual Preview, and website import are in protected Graph source `78740f780912e6e04aef73e12bf80ea190c6f611` (PR #1415). The candidate passed its protected Integration Gate and the exact browser/build checks recorded with the release. [Production run 36675515249](https://github.com/huijoohwee/agentic-graph/actions/runs/36675515249) completed with human-authorized lifecycle candidate `38d8b1f21cfea013e25f4ca60d66f279a4f4b7e6edf7aeaeb7cf93eb44c308cd`, Pages deployment `04549d39-0263-4e6c-8625-9f958503906c`, direct D1 parity and published mirror `235418c4de5d071c2bebf7579021c70755f7b704`. Runtime proof is bounded to those live routes and browser checks; mobile/device parity and buyer demand remain unknown.
- TAD / ADR: The protected release workflow also preflighted and activated its exact travel-mesh plan. Its sealed core receipt records `agentic-storage` version `9b27abdd-5627-4b17-a61f-0d2c8ae9b9eb`; the [runbook](../agentic-graph-acos-deploy-runbook.md) now states that owner and rollback boundary. No separately operated Worker or DNS publication follows from this receipt. This documentation successor changes no deployed artifact, runtime module or migration.
- Host-write finding: at 2026-09-30 05:54 UTC, local canonical seed `docs/workspace-seeds/agentic-graph-storyboard-widget-computing-flow-template.md` contained YC Library page text. The exact 38,901-byte residue was preserved locally under the task evidence directory, and the seed was restored to the committed bytes before release. The browser action that supplied the text is unproven. Source inspection shows editable `/docs` entries can schedule host mirror writes, while the current duplicate-content guard does not identify unrelated incoming plain text. Do not claim a reproduced defect or assign a code cause. A future source-bound reproduction must capture the active document path, source URL and write request before changing that owner.
- GTM / next bounded action: keep the verified release closed. Reopen a scoped host-write repair only if the trigger is reproduced; use the existing Source Files mirror and autosave checks, compare canonical Git bytes before/after, and preserve other local edits. Commercial demand and first-dollar evidence are still unmeasured. This handover adds no spend, module or always-loaded bytes; it updates two existing Markdown owners under a 9 KB diff cap.

## 2026-09-30 Source Files fixed action slots

- PRD: `/fix #source-files-fixed-action-slots @codex` keeps source URL, Find links, Import, and Cloud icons in the same respective columns on every file row, including discovered pages and rows without an active import. Unavailable actions remain visible as greyed-out, disabled icons with descriptive labels.
- TAD / ADR: retain the existing four-slot Source Files action strip. The shared tree renders a disabled source-link placeholder only in its aligned Source Files mode; the website action owner always renders discovery and import slots, enabling each only when its URL or selection permits. Pending cloud status is visibly disabled. No additional import pathway, cloud effect, storage change, or dependency is introduced.
- MVP: three existing UI owners, one focused test, and this document; under 3 KB of authored code, 15 active minutes excluding external validation, and no new module. Assert four semantic controls in test, compare live icon coordinates across pending, saved, and import-owner rows at narrow width, then run exact-candidate affected validation.
- GTM / rollback: restore scanable actions in the current Source Files tree; no buyer or revenue result claimed. Revert this scoped successor to restore compacted icon positions. Protected integration and production need separate authority and receipts.

## 2026-09-30 Source Files action column alignment

- PRD: `/fix #source-files-action-columns @codex` aligns corresponding source URL, discovery, import, and cloud actions across different file depths in the narrow Source Files pane. Missing actions remain compacted into the next available position.
- TAD / ADR: Source Files requests the shared file tree's aligned action strip in idle and import states. Its action controls use a 24-pixel width with a four-slot minimum strip and no outer gap, leaving room for the leading control and a truncatable name at the deepest observed website page row. The existing compact inner spacing and action handlers remain unchanged. The mission browser smoke runner accepts a bounded local port override so parallel checkouts do not contend for its fixed default port. No product storage, network, or dependency change.
- MVP: four existing files, under 3 KB of authored text, and 15 active minutes excluding external port contention. Measure group and icon positions on imported files at adjacent depths in the live narrow pane, ensure no right-edge overflow, check idle and page-selection modes, and validate the exact clean candidate using an unused test port.
- GTM / rollback: restore scanable action columns in the existing tree; no buyer or revenue result claimed. Revert this successor to restore former action widths. Protected integration and production require separate authority and receipts.

## 2026-09-30 Source Files folder alignment

- PRD: `/fix #source-files-folder-alignment @codex` aligns the first character of each folder name directly above the next level's leading chevron or file glyph. The relationship holds for nested imported website folders and ordinary local folders.
- TAD / ADR: the shared directory tree uses one depth indent for rows and hierarchy guides. Increase that indent by the measured seven-pixel difference between a parent label start and its child's glyph start. Keep selection, disclosure, names, and import ownership unchanged; no new dependency, storage, or network effect.
- MVP: two existing files, under 2 KB of authored text, and 10 active minutes. Compare live parent text and child glyph geometry for two adjacent nesting levels, check selected and idle Source Files states, then run the exact clean affected validation.
- GTM / rollback: improve scanability of the existing tree with no buyer or revenue result claimed. Revert this scoped successor to restore prior spacing; protected integration and production require separate authority and receipts.

## 2026-09-30 idle Source Files page selection entry

- PRD: `/fix #source-files-selection-entry @codex` keeps the first page-selection checkbox visible after restart and whenever no import session is active. Checking it discovers and selects pages linked from the currently selected website file. Until then, folder chevrons and file icons remain visible. Saved copies of the same page URL, including `library.md`, expose that page's checkbox; unrelated local rows are disabled. Unchecking all restores normal icons.
- TAD / ADR: Source Files owns the single global native checkbox; the lazy URL form owns only URL input and errors. The current selected file's existing URL metadata supplies the discovery target, and discovery auto-selects its returned pages only for that initial checkbox action. The tree projection maps a discovered URL to all matching saved file rows while retaining the clicked file as the sole import-confirmation owner. The existing URL selection session and bounded draft remain authoritative. If no website file is selected, the checkbox is visible but disabled. An empty or failed discovery reports an error and leaves that same checkbox available to retry; there is no automatic import or new dependency.
- MVP: six files and under 30 KB textual diff, with a 20-minute implementation and live-check target. Verify idle checkbox availability, one discovery request, retry after empty discovery, selected-page icon swap on matching saved copies, disabled unrelated rows, uncheck and reselect, cancellation retaining the idle checkbox, sole source-row confirmation, browser reload, and exact committed-candidate affected validation. Runtime target and browser proof remain outside source.
- GTM / rollback: make the existing page-import entry visible in the tree users are already using. No buyer or revenue result is claimed. Revert this successor to restore the session-only checkbox; protected integration and production remain separately authorized.

## 2026-09-30 storage settings and compact page chooser

- PRD: `/fix #source-files-storage-settings @codex` places canonical Product, Workspace, Seeds, Templates, and Offline roots inside MainPanel Settings → Workspace Storage Sync. Source Files no longer repeats those roots. During page selection, the chooser displays only its accessible Select visible checkbox; existing tree rows hold per-page controls, and Import URL changes to Cancel import selection.
- TAD / ADR: one Settings Key/Type/Value row reads the existing authority constants and retains the template open action. The Source Files ownership component and duplicate Document Storage & Sync roots row are retired. The active chooser keeps its native checkbox, with failures in an adjacent alert; the idle Import URL form remains available. Selection and import still use the existing session and source-row confirmation owner. No added service, dependency, persistence layer, or automatic import.
- MVP: ten paths, 35 KB incremental diff, and 30 active minutes. Verify roots and template action location, absence of the former Source Files block and duplicate Settings row, active chooser containing one checkbox and no legacy controls, cancellation, page selection, restart restoration, and the exact clean affected validation receipt. Browser captures and runtime validation inputs remain outside source.
- GTM / rollback: reduce Source Files clutter and place storage authority beside its controls; no buyer or revenue result is claimed. Revert this successor to restore the prior layout. Protected integration and production remain separate decisions requiring their own receipts.

## 2026-09-30 checkbox replaces folder chevron

- PRD: `/fix #source-files-replace-chevron @codex` removes the duplicate folder chevron while page selection is active. The existing checkbox occupies that leading slot; clicking the folder name expands or collapses its children without changing selected pages. When selection clears, normal chevrons return.
- TAD / ADR: the shared tree routes the folder name button to its existing expansion owner only when a leading selection control exists. Its accessible name and expanded state describe that action. The selection checkbox retains exact URL ownership; unrelated mission folders have disabled selection but remain expandable by name. No new storage, network effect, dependency, or site-specific branch.
- MVP: five existing files, 14 KB incremental diff and 15 active minutes. Check folder selection versus expansion, mission and website rows, selected versus unselected icon state, keyboard-accessible name buttons, live UI, and the exact clean affected validation receipt. Runtime validation input and captures stay outside source.
- GTM / rollback: remove the extra adjacent control in the existing page picker. No buyer or revenue outcome is claimed. Revert this scoped successor to restore the adjacent chevron; protected integration and deployment remain separately authorized.

## 2026-09-30 leading Source Files selection

- PRD: `/fix #source-files-leading-selection @codex` keeps normal folder arrows and file icons until Select visible checks pages. Selected pages reveal discovery checkboxes in the leading tree control slot, including disabled controls on unrelated mission and ordinary source rows. Clearing the last selection restores the icons. Folder expansion remains an adjacent control while checkboxes are shown. Remove the former right-side selection slot.
- TAD / ADR: one selection renderer feeds both existing Source Files tree instances, conditional on the session's selected URL set. The shared tree places the renderer before disclosure or label, retaining semantic native inputs and independent folder arrows. The URL set remains the sole selection and import authority; disabled unrelated rows cannot enter it. No new persistence, network call, dependency, or automatic import.
- MVP: six existing files, 24 KB incremental diff and 20 active minutes. Verify Select visible, individual and folder toggles, real `.workspace` and inspection rows, disclosure independence, action ordering, absence of right-side duplicate checkboxes, browser reload, and exact committed-candidate validation. Runtime validation targets and captures stay outside source.
- GTM / rollback: reduce visual jumps while choosing existing website pages; no buyer or revenue result is claimed. Revert this scoped successor to restore prior icon placement. Protected integration and deployment require separate authority and receipts.

## 2026-09-30 restartable Source Files page selection

- PRD: `/fix #source-files-restart-selection @codex` restores discovered page checkboxes, checked URLs and Explorer filtering after a browser restart. No page is imported until the user explicitly confirms; unchecking and rechecking still work after restoration.
- TAD / ADR: Source Files discovery alone writes a bounded 256 KiB local browser draft of up to 500 pages. Startup validates and restores the draft without network access. The existing import bridge handles an explicitly confirmed restored selection; a failed restored import keeps that draft for retry. Launch sessions with an unserializable setup callback do not persist. Invalid or unavailable browser storage is reported in the import surface. Cancellation or successful import removes the draft. No new dependency, remote storage or automatic import is introduced.
- MVP: six existing files, 30 KB incremental source diff and a 20-minute repair target. Verify a fresh mount restores checkbox state, unselect/reselect updates the draft, reload causes no import or discovery, explicit confirmation imports only selected URLs, and live browser reload behaves the same. Runtime validation URLs and captures stay outside source.
- GTM / rollback: users can resume a pending import after reopening their local browser; no buyer or revenue outcome is claimed. Revert the scoped successor to restore transient selection and clear a leftover local draft through Cancel or browser site data. Protected integration and production require their own authority.

## 2026-09-30 Source Files action-column consistency

- PRD: `/fix #source-files-action-alignment @codex` makes selection and available row actions scan in the same columns across folders, pending pages, and saved files during discovery. An icon with no applicable action is omitted; the next action occupies that position. Idle rows omit the unavailable import confirmation.
- TAD / ADR: the existing semantic action group reserves the maximum five compact action slots only during an import session. Selection, source link, discovery, confirmation, and cloud status remain independent native controls packed in DOM order. Normal browsing retains flexible labels and no reserved strip. No new dependency, storage state, network effect, or site-specific branch.
- MVP: five files, 14 KB incremental diff and roughly 15 active minutes. Check native action order and accessible labels, measure the live row column starts and hit targets, then run exact committed-candidate validation. Runtime targets and captures remain outside source.
- GTM / rollback: faster scanning of the existing import tree is the observed user pain; no revenue outcome is asserted. Revert the scoped successor to restore the previous layout without changing imported documents. Source publication requires green proof; protected integration and production remain separate.

## 2026-09-30 Source Files control alignment

- PRD: `/fix #source-files-import-controls @codex` aligns discovery, source-link, cloud and selection affordances with the existing tree file control. Filter discovered pages through the Explorer header search field. Reduce hierarchy-guide opacity by half and position selection beside row actions.
- TAD: reuse shared 28-pixel row action and compact-glyph classes, with native checkboxes centered in the same action slot. Move the existing tree's leading selection slot after the flexible row label, immediately before source links. Route Explorer search to the active discovery query while a session is open; preserve the saved file-search value for return.
- ADR: retain one search control and one Source Files tree. Discovery selection remains ephemeral, and only explicit confirmation invokes import. Shared hierarchy guide opacity changes apply to the common directory-tree control.
- MVP: 20 active minutes, nine files and 35 KB patch cap; no dependency. Verify control sizes, row order, partial selection, filtered selection, cancellation, and live desktop layout. Runtime URLs and captures stay outside source.
- GTM / rollback: improve scanning and hit targets for the existing import flow. Revert this successor to restore prior control placement; already imported documents remain intact. Publish after exact clean native validation; protected integration and production stay separate.

## 2026-09-30 Source Files import consolidation

- PRD: `/refactor #source-files-import @codex` places Import URL and “Choose folder(s)/page(s) to import” within Source Files. Find links and Import selected precede cloud sync on the relevant imported file row. Remove the MainPanel tab, renderer, icon metadata and source-owned session path.
- TAD: move the existing bounded selection session to the Source Files owner; retain tree selection, cancellation and stale-discovery guards. Project discovered folders/pages into the same Source Files tree with selection checkboxes. Lazy-load the import controls above that tree; never create a nested chooser tree. Launch invokes the same Source Files session and workspace import dispatch.
- ADR: discovery never imports or synchronizes cloud storage. Only explicit confirmation submits selected URLs. The source row owns selection confirmation immediately before its independent cloud action. Pending entries expose discovery/selection only and cannot reach saved-file actions or cloud upload. Source metadata supplies URLs without site-specific cases. Existing cloud synchronization remains independently triggered.
- MVP: 30 active minutes plus 15 minutes for the requested same-tree correction and validation, at most 16 files / 70 KB; new owners below 600 lines, with chooser code loaded on demand. Validate folder/partial selection, cancellation, session replacement, Source Files routing, exact selected-page dispatch, MainPanel retirement and live action ordering. Validation inputs and captures stay outside repository source.
- GTM / rollback: keep source discovery, selection and import next to the files users manage. No dependency, paid feature or production claim. Revert this successor to restore the prior import surface; imported documents remain intact. Publish only with exact clean native validation and retain the running review checkout.
- Validation: nine discovery/selection regressions pass against the actual Source Files component, including folder partial selection, cancellation, superseding a pending session, exact selected-page import, pending cloud disablement, action order and clicked-source identity when generated siblings share the URL. TypeScript and three runtime smoke contracts pass. Final live browser evidence and exact-candidate native validation remain external receipts.

## 2026-09-30 contextual Preview modes

- PRD: `/fix #preview-context @codex` adapts Media, 3D for XR and AI Voice Studio to the active document and selection. A Preview tab must not inherit the full Media workspace's authoring state or unrelated catalog content.
- TAD: share one controlled mode selector and existing catalog layout/search primitives. Preview owns its mode locally. Filter the shared inventory to current Markdown plus the selected graph node; the existing media renderer receives that scoped collection. Lazy-load the gallery and voice audition only when used.
- ADR: Media previews current content; 3D for XR filters model content and provides an explicit full-library action. Voice auditions an editable, bounded document excerpt or selected-item caption using installed local voices through the existing speech runtime. Metadata, code, images and destination URLs are omitted. Full voice authoring opens through the existing Create invocation with the prepared text. Apply explicit modes after the launcher default and react only to new XR activation/workbench events, preserving the caller’s selected mode on mount. Preview never uploads, places scene assets, clones a voice or starts microphone capture.
- MVP: 30-minute target, extended by twenty active minutes after live verification found both synchronous and deferred launcher resets overwrote explicit Voice/XR handoffs; at most 13 files / 56 KB changed bytes; new owners below 600 lines. Gallery shows up to 100 search matches. Narration scans at most 64,000 source characters and exposes a 2,000-character editable limit. Test scope isolation, mode independence, local-voice filtering, cancellation on source change/unmount, stale callbacks, type checking and live UI behavior in all modes. Runtime input URLs and captures stay outside source.
- GTM / rollback: prioritize reading and inspecting existing content before creation. Preserve full Media/XR/Voice authoring through explicit handoffs. No new dependency, paid capability or production claim. Revert this scoped successor to restore the prior Preview; saved documents and uploaded assets remain intact. Publish only after fresh native validation, retaining the immutable predecessor and running preview.
- Validation: nine focused context, explicit handoff, insights and existing XR surface checks pass. Two stale XR select assertions now follow the existing value-callback API; the legacy test file has no line growth. TypeScript and three runtime smoke contracts pass. The live imported page exposes scoped Media, an accurate empty model view and bounded narration with installed local voices. The deferred FloatingPanel request effect preserves the caller’s Media mode, while direct toolbar selection keeps its defaults. Image cards use their original image source. Exact committed-candidate affected validation, final interaction readback and publication receipts remain separate external evidence.

## 2026-09-30 FloatingPanel Preview migration

- PRD: move Preview Panel out of MainPanel; reuse the FloatingPanel Media catalog and make document signal badges actionable.
- TAD: lazy FloatingPanel Preview owns selected media/diagrams, the existing Media catalog, and collapsible source-linked Document insights. A document-bound subscription supplies current editor text and jump callbacks. Existing MainPanel preview event requests redirect to the single FloatingPanel owner.
- ADR: reuse the Media catalog component, layout controls, search, and selection state. No duplicate media library, additional dependency, or paid service. Signal extraction excludes metadata, fenced code, image destinations, and URLs; bounded results disclose truncation and heuristic meaning.
- MVP: native admission; at most 22 files / 80 KB diff; new modules under 600 lines; 45-minute target. Verify routing, source identity, extraction limits, Media selection, source jumps, and reload in the live local browser.
- GTM: existing Preview actions and signal badges discover the same inspector. Local-only increment; publication requires native green receipts. Rollback is the scoped commit revert; imported documents and Media persistence remain intact.
- Validation: TypeScript and three local runtime smoke contracts pass; six focused regression cases and the runtime-input hardcoding guard pass. Live browser verification confirms badge hit testing, PRICE/TIME routing, matching source-line selection, Media list/search/selection reuse, and repeat activation after full reload. All ten affected partitions passed on clean candidate `719ba689306c71bf9c78d72688fc7b44c0c59599`, including its exact-candidate mission browser stage. Runtime validation URLs and screenshots stay outside tracked files.
- Review continuation: native publication refused a stale protected base. After START readmission, merge protected `82276a39bde3ef861bd5db4091bde896ee204ddc` without rewriting the immutable predecessor or Preview candidate. The resulting tree preserves Preview and imports six protected files byte-for-byte, with no conflicts or feature edits. Native START rebinds the merged head before fresh affected checks and protected-review publication. Budget: 15 active minutes, one planning file, less than 4 KB authored changes, no new module. Preserve the running preview; keep exact validation and publication receipts outside source. This continuation requests source review only; production authority and deployment remain separate.

## 2026-09-30 imported document rendering repair

**PRD.** `/fix #website-markdown-ui-e2e @codex`: the selected imported document must render content, preserve source metadata, and expose real semantic media to selection tools. Bind this continuation to plan revision 0.2.26 and retained source `3afccea3d12adde168f91ab840bc8fe98eaba8dc`. Initial 30-minute target, extended by 15 active minutes for live browser recovery and shared media verification; cap refreshed from six to eleven existing files, 50 KB changed text, no new dependency or module.

**TAD / ADR.** Correct the sanitizer that classified YAML fences as decoration. Preserve the complete first metadata block. Recover only app-owned, quoted webpage import metadata followed by a heading when both fences were removed; leave arbitrary prose intact. Normalize recovered text through the existing active-document owner. Preserve bounded SVG geometry through conversion and indexing instead of transparent replacement, expose oversized media as an explicit visible limit message, and name the existing semantic document article. Compact SVG viewboxes keep their dimensions on a contrasting surface; standalone images expose hit-testable selection surfaces and existing preview interactions. Saved-capture refresh shares the 32-million-character raw cap while retaining the 10-million-character normalized-content limit. Linked images reuse the same media owner. Existing oversized UI/sanitizer owners receive no line growth; other modified source remains below 600 lines. Keep external runtime inputs and captures outside source.

**MVP.** Ten conversion and saved-refresh regressions pass, including repeated indexing, damaged-header recovery, retained SVG geometry and large inert hydration. The 76 existing conversion/frontmatter tests, Canvas type check plus three smoke contracts, and external-input hardcode guard pass. Native affected validation passes all ten selected partitions. Six of eight supplemental media checks pass; the two failures (unknown semantic chip color and shared card text frame contract) reproduce unchanged on baseline `3afccea3d12adde168f91ab840bc8fe98eaba8dc`. Live UI refresh restores content; a named article exposes loaded media, a compact 34-pixel SVG and actual IMG hit targets with selection markers. Clicking the icon opens its linked article. Reload retains repaired metadata and visible icons; no console errors were observed in the final tab. A stalled browser tab required a fresh tab; this is bounded desktop proof, not full-suite or mobile parity. Evidence and supplied target remain outside source.

**GTM / rollback.** Fix the first saved-page reading experience before expanding crawl scope. No demand, revenue or production claim. Revert the scoped repair to roll back behavior; preserve saved imports and immutable published source. Publication and deployment retain separate owner receipts.

## 2026-09-30 live UI verification

**PRD / scope.** Verify the implemented website import through the actual browser UI, saved document and reload. Bind source behavior to `768003ca22e0562dd69e355cd6df6faec5a0cc5a`, and documentation continuity to this plan at 0.2.25, successor `website-markdown-ui-e2e`. Use the operator-supplied target only as an external runtime input. Initial sprint: 20 active minutes; refreshed by 10 minutes to resolve covered controls and complete reload readback. Cap: one documentation file, less than 8 KB new text, no new module, dependency or paid resource.

**TAD / ADR.** Run the candidate's native dev command on a separate loopback origin with a task-owned external artifact store. Use visible controls for Launch, URL entry, page selection and import; browser-local runtime identity proves the source revision. Preserve browser-policy failures as failures. Do not substitute the earlier headless conversion receipt for UI completion. Existing helper modules and published source remain unchanged.

**MVP / observed results.** The predecessor's protected Integration Gate passed. The actual desktop UI completed Launch → Import URL → Crawl website headlessly → page selection → import. Discovery returned three pages; one selected page completed in 20,354 ms without manifest errors. Artifacts contain 16,903,437 raw HTML bytes, 151,985 Markdown bytes and 24 downloaded images totaling 652,985 bytes. Source Files displayed the page, sitemap and Canvas document. Opening the page visibly rendered its title and content; two DOM readbacks timed out while the large page loaded. Reload recovered responsiveness and retained the selected local Markdown file, source content and title in the table of contents. The browser console reported no warnings/errors after reload. Evidence belongs to the task's external UI record and before/after screenshots; source receipt remains the exact candidate above.

**Partial-pass boundaries.** The ordinary Import URL path did not complete in the in-app browser: hidden document requests were rejected with `ERR_BLOCKED_BY_CLIENT`, reason `inspector`. Browser automation required the screenshot coordinate offset; pinned panels covered controls until closed. Source inspection also identified an existing five-million-character slice in `workspaceImport/urlContent.ts` before ordinary conversion, requiring a separate implementation follow-up. This verification update changes no runtime behavior. One-page local import and persistence pass; ordinary import, full-site discovery completeness, responsive mobile behavior, offline use and production delivery remain unverified.

**GTM / rollback.** This increment adds verification evidence only and makes no revenue or deployment claim. Retain the test-owned store and screenshots outside source. Stop the task-owned preview to release runtime resources; preserve the published candidate and stored user imports. Rollback of this documentation update is a source revert; production activation requires separate authority and receipts.

## 2026-09-30 reference implementation: website Markdown safety

**Authorization and continuity.** The operator explicitly authorized implementation of the audit recommendations and supplied a live validation URL as external input. Bind this increment to `PLAN-AGENTIC-GRAPH-NATIVE-WEB-IMPORT-CRAWLER-PRD-TAD-ADR-MVP-GTM@0.2.24`, source base `2699bbb06228caa504cd64c53adf6026bb338e9d`, lane `website-markdown-safety`, actor `@codex`, action `/fix`, semantic `#website-markdown-safety`. The validation URL, captured remote content and private reference stay outside tracked source, fixtures, configuration and this plan. Authoring guidance: `huijoohwee.github.io/guidelines/prd-tad-adr-mvp-gtm-guidelines.md` at `deddd90682dc412f421e51bdd09c23bacd153505`; no guidance is copied.

**PRD.** Existing import users need complete article text, independent concurrent imports and a consistent public-URL boundary. S1: static imports and redirects reject private destinations; static connections use the validated address. S2: concurrent new runs retain independent manifests; explicit reuse verifies the request and never overwrites incompatible or unbound data. S3: over-budget input is a visible failure, never a successful prefix. S4: CLI image exclusion works in every argument position. S5: the existing conversion owner is decomposed into modules below 600 lines without changing its public successful-result contract. The supplied live page validates generic behavior only; it must not become a product-specific code path.

**TAD / ADR.** Reuse the static fetch API, native crawler, storage resolver and converter. A shared Node network policy owns public-address checks; static HTTP uses checked DNS addresses at connection time and revalidates redirects. Browser routing consumes the shared policy; browser/proxy connection-level DNS behavior is a separate runtime boundary. Atomic directory creation reserves a UTC-format run slot; actual wall time remains in manifest timestamps, and request bindings prevent unsafe reuse. Existing artifact readers retain the token grammar. A 32-million-character raw capture cap retains large hydration payloads; conversion excludes only JSON-shaped `data-*` attributes exceeding 64 KiB, then applies the existing normalized-content budgets. Body text and ordinary attributes remain intact. Over-budget content fails before parsing or fallback. Move existing HAST, media and layout behavior into focused helpers and remove no-op branches. No service, dependency, paid resource or second converter is added.

**MVP and evidence.** Implement S1–S5 with synthetic regression fixtures, existing conversion/import tests, type checking, source hygiene and an external-input live-page run. New source cases cover default private-address rejection, mapped IPv6, redirect policy, byte limits, parallel admission, unchanged manifest replay, incompatible reuse, image options and explicit size failure. Local evidence: 11 new safety cases passed; 100 existing conversion/import cases passed; the Canvas-owned TypeScript and smoke check passed. The supplied live page completed in 17,915 ms: 16,880,900 HTML characters produced 151,759 Markdown bytes, with 41 discovered links and 304 Markdown links (single page, no downloads or proxy). Runtime inputs and captured content remain external. The repository hardcode guard exposed short-route false positives and five pre-existing remote fixture literals; preserve exact URL/authority-path and opaque-token checks, and replace those fixtures with synthetic addresses. Final local affected validation passed all 10 native partitions and all 9 selected commands (281 case executions, including overlapping suites), including the environment-supplied hardcode guard, Canvas type checking and browser-smoke runtime contract. This is affected-scope proof, not full-suite or production parity. Source publication remains a separate owner effect. Budget refreshed after the initial 30-active-minute sprint: 15 additional active minutes; at most 23 files, five helper modules and 100 KB changed text, no added dependencies. Five legacy test files receive literal-only replacements without line growth; their existing size is not expanded. New helper modules and the decomposed conversion owner stay below 600 lines.

**GTM / rollback.** Rank accurate one-page Markdown first, a small selected documentation bundle second, and offline saved HTML third. The first-dollar hypothesis is a reviewed export using existing delivery capabilities; demand, willingness to pay and resource savings remain unmeasured. No outreach, payment or deployment is authorized by this code change. Revert the scoped source candidate to roll back; preserve existing artifacts and request bindings. Protected source release, deployment and runtime receipts remain separate. Development verification and remaining limitations will be appended before handoff.

## Product decision

Enhance the existing website-import job instead of adding a second crawler stack. The Import URL globe action discovers a selectable folder/page tree before starting a server-owned headless import of the chosen pages, materializes extracted pages through the existing Markdown workspace owner, creates a Canvas projection document, and exposes bounded HTML and downloaded-file artifacts. Import local files remains owned by the existing corpus import path, which already resolves source units and applies corpus-backed imports to Canvas.

The external crawler project is a capability reference only. The implementation uses the repository's existing Playwright dependency and native Node.js modules. It does not copy or depend on the reference project.

## 2026-09-29 URL import icon row

**PRD.** The URL input has one icon row for standard import, Codebase graph mode,
Design renderer, video validation/download, and headless website crawl. Every icon has an accessible name and tooltip. Codebase
graph retains its pressed-state mode; the separate label and help row are removed.
The primary action identifies whether it imports a URL into the workspace or a
codebase graph. Keyboard Enter retains the same dispatch.

**TAD / ADR.** Extend the existing `ImportUrlPrompt` with an optional confirmation
icon; other callers retain their text confirmation. Reuse the shared responsive
control sizes and wrap the row on narrow screens. Keep the crawl globe visible
when the Markdown workspace bridge is absent, and lazily reuse
`importWebsiteViaWorkspaceRuntime` after the existing page-selection step. Preserve
selected URLs, server-owned limits, source-backed invocation checks and visible
errors. No new runtime module, dependency, service or paid resource.

**MVP / verification.** Native successor of `d3063bdccc3fa67ab641f5119d2033f3f9d13c64`.
Four files, source patch below 20 KiB, no new modules; implementation/check target
was 20 minutes after owner handoff. The existing rate-limit recovery check now
locates the accessible Codebase graph button instead of its removed visible text.
All 20 focused import/conversion checks and seven page-selection checks pass,
along with TypeScript, three browser-runtime policy checks and changed-file hygiene.
These cover every command selected by the collaboration contract for this delta.
The live task preview starts at `http://127.0.0.1:5175/`, but menu interaction and
screenshot coordinates disagree in the in-app browser; desktop/mobile visual and
live crawl confirmation remain unverified. Publication gets a separate five-minute
local budget; provider checks are an external dependency. This bounded evidence
does not establish full-suite, protected integration or Production deployment proof.

**GTM / rollback.** Address the observed difficulty locating crawl and identifying
Import actions. Demand, time savings and willingness to pay $1 remain unmeasured.
Revert this scoped successor diff to restore the previous controls; imported files
and the predecessor's changes remain intact. Release and Production receipts stay
separate under the existing owner workflows.

## 2026-09-29 shared Settings typography and layout

**PRD.** Import URL uses the same configured panel typography and density as Main Panel Settings. Preserve aligned selection checkboxes, file-only icons, square disclosure controls and keyboard/focus hierarchy guides.

**TAD / ADR.** Consume existing `usePanelTypography`, `useCanvasKeyTypeValueRuntime`, `MainPanelSettingsPanelShell`, `PanelTextInput` and Settings section-action styles. Remove picker-owned fixed text sizes and oversized padding. Keep selection and discovery in their existing owners; the shared directory controls are unchanged. No new module or dependency.

**MVP / verification.** All three existing picker regressions pass. Local live discovery lists four pages; two remain selected after collapse/reopen and search filtering. Computed picker labels and actions match Settings at 14 px with the same system font; row padding is 4 px. Root checkboxes align exactly beneath Select visible, children indent 20 px, and no horizontal overflow is present. Required affected validation is bound separately to the committed candidate.

**GTM / bounds / rollback.** Reuse familiar panel controls for existing import users. Two files, no new module or paid resource; 15-minute edit/live-check target followed by required release checks. Reverting this successor restores prior styling without changing imported data. Local preview evidence makes no Production claim.

## 2026-09-28 Import URL checkbox alignment

**PRD.** Top-level folder and page checkboxes align directly beneath Select visible. Nested rows retain the shared 20-pixel hierarchy indent. Checkboxes lead the row, followed by the existing disclosure or file icon and the clickable label.

**TAD / ADR.** Keep native input/label associations through React-generated IDs while separating selection from disclosure. A shared optional guide-center offset aligns the picker hierarchy guide with its fixed 16-pixel checkbox column; Source Files retains its existing icon-centered default. Guide and nested checkbox hit areas remain separate. No new module, dependency, storage or network change.

**MVP / verification.** Existing picker regressions pass. Live readback confirms the root folder and page checkbox left edges equal Select visible, with nested rows offset by 20 pixels and both user-selected pages retained. Required affected validation binds the committed candidate separately.

**GTM / bounds / rollback.** Small visual correction for existing import selection. Three files, under 5 KB changed, ten-minute edit and live-check budget followed by required release checks. Revert this successor increment to restore the previous ordering; selection data and imported files are unaffected. No Production claim.

## 2026-09-28 shared Import URL tree controls

**PRD.** Import URL reuses Source Files directory rows, file-only icons, square disclosure buttons and hover/focus hierarchy guides. Folder checkboxes and names select all visible descendants; page icons and labels toggle page selection. Disclosure only changes expansion. Import still requires the explicit Import selected action.

**TAD / ADR.** Move the existing file glyph mapping, row indentation, disclosure button and hierarchy guide into one shared `DirectoryTreeControls` module consumed by both trees. Native buttons, checkboxes, labels, lists, sections and named SVG images provide separate semantic targets. The picker owns multi-selection and local expansion; Source Files keeps its existing single-selection owner. Folder icons remain omitted per the user's preference. No site-specific branches, new dependency, persistence schema or network endpoint.

**MVP / verification.** Three picker regressions cover exact selected imports, partial folder selection, icon/guide selection, collapse/reopen retention, session retention and abort-on-cancel. Five Source Files regressions and TypeScript checking pass. Live discovery of the requested library URL lists four pages with the shared 28×28 disclosure/file controls, zero folder icons and zero hidden SVG images. Keyboard activation of the search page icon selects exactly one page; collapsing and reopening retains it, and focus reveals the hierarchy guide at 60% opacity. The affected gate exposed a pre-existing strict locator that assumed a single Source files navigation despite separate mission and workspace trees. The block-editor smoke now waits for their shared Source Files content region; all downstream edit, touch, persistence and offline assertions remain. The required committed-candidate affected gate is recorded separately; this is local evidence only.

**GTM / bounds / rollback.** Reduce repeated learning between source browsing and choosing import pages. One shared module replaces duplicate markup; six changed files and under 40 KB of changes within the 20-minute implementation/verification budget, followed by required release validation. Existing picker loading remains lazy and source-tree glyph code is moved rather than duplicated. No paid resources or Production claim. Revert the successor commit to restore the previous picker; imported files and saved documents are untouched.

## 2026-09-28 square Source Files selection controls

**PRD.** Folder names and file icon buttons select their source in both authored and session-only mission trees. Disclosure buttons expand/collapse independently. File icon and disclosure affordances use shared 28×28 square native controls and expose named SVG images to selection tooling. Per the final user preference, folder glyphs are omitted; neutral extension-based icons appear only for files. Vertical hierarchy guides appear on hover or keyboard focus; each is a named native button that selects its parent folder.

**TAD / ADR.** Require a folder-selection callback in MarkdownFileTree; remove its browse/expand fallback. Reuse the existing data-view square icon-action class and shared filename row. Mission folder selection belongs to the existing inspection selection store, remains separate from the open document, clears on explicit source selection/close, and never activates a Canvas view. Both source trees consume one effective highlight. Reuse Lucide glyphs, theme-aware utility colors and hover/focus utilities; nested rows retain a 20-pixel hierarchy step instead of flattening deeper folders. No source bytes, permissions, import behavior, or dependency changes.

**MVP / verification.** Five focused component cases cover icon click selection, independent disclosure, mission folder name selection without activating a workspace, retention of an open mission file, selection clearing, source links/cloud actions, active-file reveal and seed ownership. TypeScript checking passed. Live keyboard selection of the actual workflow-member folder retained expansion and selected only that folder; file icon and disclosure controls measured 28×28. The in-app browser pointer driver landed on different rows, so live pointer behavior is not claimed from that driver; DOM-event pointer tests provide the bounded click proof. Hover made the hierarchy guides visible at 60% opacity; keyboard focus raised the focused guide to 100%, and activating it selected its parent. The final file-only icon revision was checked live: zero folder glyphs, with file selection and disclosure controls still 28×28. Required affected validation binds the committed candidate separately.

**GTM / scope / rollback.** Existing source browsing usability correction, with no Production or demand claim. Scope: four source files, three existing test files and this plan, below 40 KB changed; no new module, dependency or paid service. Initial 15-minute implementation estimate was exceeded while checking the mission selection owner and browser pointer mismatch; revised local cap is 25 minutes plus required validation/provider handoff. The subsequent icon/hover-guide request adds at most 10 minutes within the same eight-file, 40 KB budget. Revert this successor commit to restore prior controls without changing imported files or browser storage.

## 2026-09-28 Source Files selection and affordances

**PRD.** Source Files shows one current selection across session observations and authored files. Folder icons and names select workspace folders; separate named disclosure buttons expand or collapse children without changing selection. Imported source URLs occupy the trailing action area immediately before cloud status in ordinary file rows.

**TAD / ADR.** The mission projection consumes the existing Explorer active path; it no longer creates a highlighted fallback while inactive. Selecting a workspace folder leaves mission inspection through the existing source-selection owner. Reuse MarkdownFileTree, its shared row shell, theme/focus tokens, and URL normalization. Native buttons and anchors own actions; named SVG images expose icon hit targets. No hidden icon decorations, generic div wrappers, nested buttons, site-specific branches, new dependencies or background services are introduced in the changed tree.

**MVP / verification.** Five focused component cases pass: independent folder selection/disclosure, source inventory filtering, active-file reveal without focus theft, and mission/authored selection plus trailing source/cloud actions, safe URL schemes, read-only menus and cloud indicator activation. TypeScript checking passes. Live local verification at 1037×952 exercised folder icon selection, keyboard disclosure, mission JSON → workspace folder → website.sitemap.md. The final Source Files selection contains only website.sitemap.md; its URL link ends at x=303 and the cloud button begins at x=303, with zero hidden SVG icons in either source tree. Repository affected checks must bind the committed candidate separately.

**GTM / scope / rollback.** This is a usability correction for existing source browsing; no demand or Production claim. Scope: five source files, two existing test files and this plan, below 60 KB of changes, no paid resource. The local implementation/verification sprint is bounded to 25 minutes, followed by required validation/provider handoff. Revert these source changes to restore prior controls; imported content and stored documents are unchanged.

## 2026-09-28 Import URL Main Panel tab

**Viewport placement follow-up.** Main Panel opens and restores at the viewport center, follows viewport resizing, and keeps that center across tab changes. Saved drag coordinates no longer control a new opening. Manual dragging reuses the shared full-viewport clamp; a resize observer keeps the header reachable when the card size changes. Live local verification measured zero horizontal and vertical center offset at 1280×720 and 1104×952 while switching Settings → Workflow Manager → Import URL. Scope: five source/test files, under 10 KB, no dependency or service added; rollback is a source revert. This is local UI evidence, with no new Production or demand claim.

**PRD.** The website page picker lives in a new Import URL tab immediately to the right of Workflow Manager in Main Panel. Launch → Import URL → Crawl website headlessly opens that tab. It keeps the existing folder/page checkboxes, filter, link discovery and exact-selection import action.

**TAD / ADR.** Reuse the shared Main Panel registry, icon library and open event. Resolve tabs from the registry instead of maintaining a conflicting event allowlist. The lazy picker view replaces the body-mounted modal. One bounded selection session owns discovery, cancellation and selection state across tab switches and closing/reopening Main Panel; starting another selection cancels and settles its predecessor. Nothing is imported until Import selected is chosen.

**MVP / GTM / rollback.** This 20-minute follow-up removes the extra dialog surface and keeps the picker near workflow controls. Scope is 12 source/test/doc paths, under 30 KB added production code, with lazy panel loading and no new service or paid dependency. Verify adjacent tab order, Launch routing, retained selections, cancellation and exact selected imports. Revert this placement change to the predecessor if needed; existing workspace files are preserved. No Production authority is granted by the UI change.

## 2026-09-28 discover and select website pages

**PRD.** Users choose pages and folders before importing, converting or parsing a website. The Launch globe action opens a searchable path tree with no pages selected. Folder and visible-page checkboxes support partial selection; Find links expands the discovered inventory on demand. Cancel leaves imports unchanged. Confirmation sends the exact selected URLs to the existing progressive import owner and retains its D3 default.

**TAD.** The lazy picker calls a bounded, same-origin discovery endpoint. The existing headless capture owner returns unique links and title before HTML serialization, conversion or artifact writes. This allows discovery even when the index page exceeds the full-capture HTML budget. Selection is limited to 500 HTTP(S) URLs in the source origin/path; credentials, asset paths, empty lists and oversized requests fail explicitly. The generation manifest records the selection and rejects replay with another selection. Selected jobs bypass sitemap/root discovery and do not enqueue links found in their chosen pages. Existing complete-content limits and failure receipts still apply to each chosen page.

**ADR.** Reuse the native crawler, URL scope rules, workspace action bridge, progressive writer and renderer defaults. Extract the existing server job and filesystem/discovery helpers into single-responsibility modules below 600 lines. No site names or filenames influence discovery, selection or conversion. Discovery cancellation closes its browser; stale UI responses are ignored and the native modal restores focus on close. No new dependency or remote service is introduced.

**MVP.** Focused regressions cover scope/credential/size rejection, nested folders and query variants, discovery on oversized HTML without persisted artifacts, explicit page/folder confirmation, cancellation, selected-only jobs, partial manifest visibility and generation replay mismatch. The actual library URL is checked in the local preview; bounded link discovery is not evidence of complete website inventory. Production remains outside this source increment.

**GTM / bounds / rollback.** The immediate pain is spending resources converting unwanted pages before users can choose useful content. This extends the existing near-built importer; a pilot can measure time to the first chosen usable page and test willingness to pay $1. No demand or revenue claim. The initial 30-minute sprint budget is extended for browser and release checks; the implementation stays within 12 production modules and 60 KB of added production code, with the picker loaded only when requested. Discovery lists up to 500 pages per picker, serializes requests and keeps the crawler's existing navigation/security bounds. Roll back through a protected source revert to the predecessor; saved imports are preserved.

## 2026-09-28 local reveal and saved-capture refresh

**PRD.** Source Files → Reveal in Finder opens the saved local artifact or file/folder. Imported Markdown can be rebuilt from the complete captured HTML through the existing Explorer Refresh action. Both actions use shared source ownership and metadata rather than hostnames or filenames.

**TAD / ADR.** Replace URL opening, `file://` navigation and silent Explorer-selection fallbacks with a lazy client call to a local host bridge. Crawl metadata resolves the existing import-store `page.md`; ordinary paths reuse the workspace mirror resolver and canonical seed authority. The bridge accepts same-origin loopback POST requests, limits bodies to 8 KB, checks real paths against permitted roots, rejects symlink escapes, serializes launches, and awaits a bounded native file-manager command without shell interpolation. Browser-only deployments and missing files report errors. macOS selects the file in Finder, Windows uses Explorer selection, and Linux opens the containing folder.

**Content recovery.** The reported saved HTML contains approximately 35,800 characters of prose while its old Markdown artifact contains an 880-character introduction. The current universal converter already retains the full transcript. Refresh now rebuilds imported document bodies from their saved capture, preserves the exact frontmatter including source identity and renderer settings, and checks for a changed persisted document before writing. Missing captures and HTML beyond the 10-million-character conversion budget fail visibly before replacing workspace content. Original crawl artifacts remain provenance snapshots; refreshed workspace text is persisted through the existing mutation owner. No automatic replacement of user-edited documents or site-specific repair is introduced.

**MVP verification.** Five focused regressions cover host file/folder and capture resolution, canonical seeds, path and origin rejection, symlink escape, literal command arguments, host failure reporting, mounted Explorer action coalescing, complete generic article/transcript conversion, metadata retention, and missing-capture failure. Twenty-one existing Explorer and converter cases pass. TypeScript, hygiene, the collaboration contract and 118 repository contract tests pass. In the actual saved browser session, Refresh restored a 35,660-character body and the Transcript heading; the persisted document remains 36,686 characters after reload. Native reveal returned the resolved capture path, and Finder selection independently matched that exact file. The live preview remains on port 5174.

**GTM / bounds / rollback.** This removes a dead local navigation action and restores complete reading content from existing captures. No paid dependency, new service, revenue or Production claim. The combined user requests require seven production modules and four test modules, below 32 KB of source/test changes; new modules remain below 600 lines and the client bridge is loaded on demand. The initial 15-minute Finder slice expanded to include the later content-recovery request and actual-session verification. Rollback uses a protected source revert; saved captures remain available. Integration and Production effects require their own exact receipts.

## 2026-09-28 library renderer stability and workspace persistence

**PRD.** Crawl pages default to 2D D3 when opened, including older saved imports without renderer metadata. Explicit authored renderer choices remain valid. Large imported documents must permit Canvas View Mode switching and full Markdown scrolling. Autosave must persist every edit, including equal-length changes in the middle of a document; Storage Sync must honor its on/off setting through the existing storage owner.

**TAD / ADR.** The actual saved query-variant `library.md` restored Storyboard with 436 cards. Profiling identified repeated Cartesian collision-candidate allocation and a full edge measurement notification per projected card. Replace the shared collision solver with a sweep over horizontal boundaries and merged vertical blocker intervals, retaining exact nearest-position tie order, pinned cards and media clearance. Commit geometry once after all changed card positions are written; unchanged projection emits no notification. The common frontmatter resolver supplies missing D3 fields for crawl metadata, preserving explicit presets. These changes use no hostname or filename branches and do not rewrite imported artifacts. Autosave now hashes the entire draft instead of only its length and two end samples, fixing skipped middle edits in the existing scheduler.

**Import completion.** The predecessor Integration Gate exposed a race: status reported done while the persisted manifest still had no completed nodes. The existing server owner now publishes terminal status after the final manifest flush. Progress stays live; consumers can read the terminal manifest immediately after completion. The existing local article integration check covers this ordering.

**Storage Sync.** The shared Explorer polling effect retains a scheduled retry while inline editing or a preceding effect’s read temporarily blocks reconciliation. One effect owns at most one timer; turning sync off cancels future polling, and turning it back on during an existing read resumes after that read settles. A mounted-hook regression fails before this fix and passes afterward.

**MVP evidence.** The corrected actual-session replay reproduced the Canvas-menu hang and renderer crash before repair. The earlier isolated replay used a different library node and selected D3, so it did not exercise this Storyboard workload. After repair, the user's existing in-app session opened the query-variant library in D3, switched to Storyboard and back, reopened Canvas View Mode, and scrolled the Markdown preview through its midpoint, end and top without a crash. The full 232,051-character rendered preview remained present. Browser evidence: `/tmp/library-stability-inapp.png`. This establishes that reported sequence on the existing session; it is not an unrestricted performance guarantee.

**Verification.** Six new regressions pass: exact comparison against exhaustive collision placement on randomized small layouts, 1,000-card non-overlap with pinned retention, one geometry commit per projection, crawl defaults with explicit choice preservation, equal-length middle-edit Autosave scheduling/cancellation, and Storage Sync resume across editing/toggles. Thirty-nine existing renderer, Autosave, settings, storage, Explorer suspension/inventory and conversion checks pass. TypeScript and 118 collaboration checks pass. The dense collision test has a three-second ceiling and completed locally in about half a second. An isolated Chromium session verifies same-size middle edits, persisted reload, Autosave Off withholding writes and On committing the pending draft. Storage Sync Off stops local source polling; On ingests an external source update. The fixture uses the normal local-source ownership index and intercepts host writes, preserving user files. Evidence: `/tmp/workspace-persistence-proof.json` and `/tmp/workspace-persistence-proof.png`. This proves local storage behavior; authenticated cross-device synchronization was not exercised.

**GTM / bounds / recovery.** The immediate outcome is reliable crawl-to-reading and edit retention. No buyer, revenue or Production outcome is claimed. The slice changes six production modules and three regression modules, reuses the current preview, and targets a source/test diff below 32 KB with new modules below 600 lines. The inherited oversized website server receives a minimal completion-order repair and shrinks by one line; splitting its unrelated routes is deferred. The investigation extended beyond its initial 20-minute target to reproduce the actual restored renderer and verify both persistence controls; a further 15-minute slice covers polling recovery and its regression. Source rollback is a protected revert; saved imports remain intact. Exact protected integration and any subsequent Production authorization require their own receipts.

## 2026-09-28 shared webpage resource lifecycle

**PRD.** The user confirmed that `library.md` was open when Canvas View Mode crashed. Fix shared source owners for all imports. Preserve complete accepted content and progressive Source Files updates; do not match filenames or hosts, alter saved artifacts, or add another converter.

**TAD / ADR.** The shared webpage text loader previously retained 24 response bodies regardless of size, and cancelled viewers left upstream requests running and eligible for caching. Replace that implementation with one request/cache owner: 24 MiB aggregate retained UTF-16 payload, 8 MiB maximum retained entry, and the existing 24-entry/TTL policy. Larger accepted pages are delivered in full without retention. A request belongs to its subscribers; cancelling the last subscriber aborts its controller, while cancelling one of several subscribers leaves their request intact. Replacement requests are fenced by identity so late settlement cannot evict or overwrite them. Cache bypass follows the same lifetime rule. The preview hook stops cancelled artifact work before fallback or transformation.

**Capture / streaming contract.** Artifact bodies use the existing incremental reader with a 32 MiB byte ceiling, checked both against Content-Length and actual streamed bytes before decoding a chunk. Limit failures cancel the stream and never populate the cache. This bounds request buffering without truncating accepted content. The headless crawler retains its configured HTML character limit but now rejects an oversized capture instead of slicing it mid-attribute and marking the incomplete document successful. The existing import error path reports that failure. Previously truncated saved HTML is preserved and cannot recover its missing body through this change.

**MVP evidence.** Generic regressions reproduced missing upstream cancellation and retained-body budget overflow before the change. Tests cover shared subscribers, cache bypass, late obsolete completion, byte eviction, oversized bodies delivered without retention, declared and streamed response ceilings, split Unicode, and a real local headless capture that must reject a large attribute while preserving a complete small page. The saved `library.md` contains a 12,017,857-byte HTML capture ending inside an attribute. Its isolated Canvas-menu replay passed before the fix; the original Codex renderer crash is not reproduced, so request/retention proof is not a crash-parity claim. A paint-containment experiment did not reduce the large composited surface and was discarded.

**Verification / delivery.** The resource and cancellation suite passes nine tests, including a real headless capture. Sixteen existing progressive-import/filesystem/cancellation tests, four preview/refresh units, TypeScript plus three browser-runtime policy tests, 118 collaboration checks and ten integration-policy checks pass. An isolated Chromium replay first reads eight saved artifacts larger than 10 MB, then opens `library.md`, opens Canvas View Mode, selects D3 and scrolls the Markdown pane through its midpoint, end and top. All preview text remains present; Launch still opens afterward, with zero page exceptions or renderer crashes. Captured-site script/CORS failures remain visible in the console, so this does not claim external-asset fidelity. Local evidence is `/tmp/website-library-resources-after-proof.json` and `/tmp/website-resources-{green,typecheck,unit,progress,contract,policy}.log`. Protected integration and Production are not established by these local checks.

**GTM / bounds.** Prioritize reliable reading and switching during and after a crawl. No buyer, revenue or Production outcome is claimed. This slice has a 20-minute initial target, at most six source modules and a 30 KB diff cap. The successor reuses the existing checkout and preview; exact affected checks and native publication are required before handoff.

## 2026-09-28 dense imported document scrolling

**PRD.** Existing imported documents must remain readable through the midpoint and end of both Markdown and captured-HTML panes. The reported saved `search.md` has 14 root blocks but over 4,400 nested tokens, and generates a 587-node document graph. File length and root-block count alone do not represent this workload.

**TAD / ADR.** Extend the shared preview guard to walk list items, inline tokens and table cells iteratively, stopping at its existing 2,500-token or 120-heading budget. The existing large-document mode reduces optional block chrome and media work without truncating the document. For automatic Markdown document projections, reuse the existing summary graph when the generated structure exceeds 500 nodes or 1,000 edges. Both synchronous and asynchronous parser paths apply the same guard; explicit frontmatter/panel flows and Mermaid geometry retain their existing routing. Full Markdown and captured HTML stay available. No hostname-specific logic, dependency, selector or alternate converter is introduced.

**Verification / delivery.** Generic dense-list, table and synchronous/asynchronous graph regressions failed before the change and pass afterward. An isolated browser replay of the saved `search.md` at 1108 × 952 completed forward and reverse scrolling through both panes, pausing at the midpoint on each pass: zero page errors, one Markdown read, one HTML read, and all 112,535 rendered text characters retained. The 19.3-second CPU profile spent 17.3 seconds idle; automatic document graph work was bounded. This is workload evidence, not a controlled before/after benchmark. The three existing large-document/flow regressions, TypeScript check, three local browser-runtime policy tests, 118 collaboration checks and ten integration-policy checks pass. The original Codex browser crash has not been reproduced in the isolated browser; this increment addresses observed resource gaps and does not establish crash-recovery parity.

**GTM / bounds.** Prioritize reliable reading after progressive import. No new revenue claim. This slice changes three source modules, one regression file and this existing contract/documentation, with a 30 KB diff cap and a 20-minute investigation/repair target. Production promotion requires the current candidate's protected proof and release authority.

## 2026-09-28 usability increment

**PRD.** The Launch → Import URL icon row shows its labels in a shared hover or focus tooltip above the menu, with no extra text below the controls. During a sitemap or website crawl, the website import folder and each completed page appear in Source Files as the manifest advances. The terminal sitemap and Canvas projection appear when the crawl completes. Launch → Export → Markdown defaults to the configured local sibling `docs_` directory derived from the current workspace; the browser save picker remains the fallback when local host writing is unavailable.

**TAD.** The existing server manifest remains the source of completed node records. The icon actions retain `aria-label` and `title`; the existing delegated tooltip renders their labels in a body portal above the anchored menu. Rich media hover previews also use that shared tooltip owner, and a source guard rejects another `role="tooltip"` renderer or legacy `z-[10000]` layer. The extra crawler hint below the icons is removed. The workspace action checks the manifest when the processed count advances, and one workspace writer deduplicates node IDs across snapshots and writes each page through the existing workspace filesystem. Each completed page publishes only file and folder metadata to the Explorer; the workspace performs one full reconciliation at completion. The `/websites` workspace root is projected into Source Files, and completed page folders expand during the run. Finalization writes the sitemap and Canvas document once. The Markdown export derives the host output root from the configured docs mirror instead of hardcoding a device path.

**ADR.** Reuse the shared tooltip owner and its z-index constants for plain labels and rich media previews; remove standalone tooltip renderers. Keep the crawler server and artifact routes unchanged. Reuse the manifest and local filesystem write contracts, with the existing save picker as the cross-device fallback. This keeps the page writer under 600 lines and avoids adding a second export service or paid dependency.

**MVP check.** Focused tests cover a page appearing in the projected Source Files tree and its folders expanding before the terminal status, deduplication when a later snapshot repeats it, and the Markdown destination path and bytes. A live local crawl showed page files in Source Files while its server manifest remained `running`. The local browser preview confirms that the crawler tooltip appears above the open menu on focus, with no extra text below the icon row. Source checks and any protected CI result belong to the source lane receipt; no Production or buyer outcome is claimed by this increment.

**GTM.** The immediate buyer pain is waiting through a multi-page import without usable files and then hunting for its export. A timed user pilot should compare time to first usable page and time to locate the exported Markdown file, then record willingness to pay $1. Demand and revenue remain unverified.

## 2026-09-28 browser freeze recovery

**PRD.** A long website crawl must keep Source Files usable as pages arrive and must not freeze the browser tab from a full workspace rebuild for each page.

**TAD and ADR.** The website importer publishes a metadata-only file entry when its workspace write succeeds. The Explorer's automatic refresh listener ignores filesystem events under the active import folder; unrelated workspace changes continue to refresh normally. The importer releases that folder guard and reconciles the full workspace once after finalization or on failure. This retains the existing filesystem as the durable source and avoids copying every page body into React state during progress updates.

**MVP check.** A focused 500-page projection test checks metadata-only growth, folder projection, and deduplication. The progress integration test checks that the first file is visible before terminal status and that the full refresh runs once. A live rerun of the user's crashed in-app browser tab remains unverified because the browser tool rejects the crash page's `data:` URL under its URL policy; source checks cannot substitute for that live observation.

**GTM.** Measure browser responsiveness and time to first visible file during a timed 100-page pilot before claiming this recovery for users. No buyer or revenue evidence is recorded.

## 2026-09-28 bounded import writes and conversion ownership

**PRD.** Completed crawl pages must become usable progressively without repeated whole-workspace reconciliation or large HTML conversion on the browser UI thread. When server Markdown is unavailable, the file must clearly report that condition and retain the existing captured-HTML viewer reference.

**TAD.** Text upserts now reuse the shared filesystem initialization owner. One crawl writer shares a single folder inventory and serializes folder creation across page workers. Its Explorer refresh guard begins before the import folder is created. Completed Markdown still writes through the shared workspace filesystem and publishes metadata immediately; one final refresh reconciles the tree.

**ADR.** The server owns crawl HTML-to-Markdown conversion. Remove the client raw-HTML conversion fallback, which can parse a multi-megabyte capture and copy its full snapshot into a workspace document. Keep the server artifact and existing HTML viewer reference; emit an explicit Markdown-unavailable notice when conversion did not produce text. Browser enhancement remains disabled for the Launch headless action. Reuse the shared initialization and folder owners instead of introducing an import-specific filesystem.

**MVP check.** A 100-page regression reproduced 103 seed reconciliations before the fix and one afterward, with one folder inventory and progressive visibility preserved. The saved 100-node crawl replay included a 12,017,857-byte HTML-only capture: removing the duplicate conversion reduced the local replay from 15.2 seconds to 1.3 seconds and maximum observed event-loop delay from 9,160 ms to 78 ms. It retained all 99 successful page files and both terminal documents. These local measurements are bounded evidence, not a browser crash-recovery claim. Focused tests also cover missing Markdown without raw-HTML fetch, concurrent folder ancestors, failed initialization retry, explicit seed refresh, and the first file's refresh guard. The crashed in-app tab remains inaccessible to automation under the browser URL policy; live review is pending.

**GTM.** The immediate outcome is shorter time to a usable imported page and a responsive Source Files tree. Validate the exact reported browser flow before closing the crash report; no buyer or revenue result is claimed.

## 2026-09-28 D3 crawl default

**PRD / MVP.** Launch → Import URL → Crawl website headlessly selects 2D D3 when the canvas import starts. Progressive Source Files remain usable during the crawl. The completed `website.crawl.canvas.md` also declares D3, so opening it uses the same renderer.

**TAD / ADR.** `runWorkspaceWebsiteImport` uses the shared `applyCanvasFrontmatterPreset` owner for canvas imports after checking the current job. Storage-only imports leave the current view alone. `buildWebsiteCrawlCanvasMarkdown` owns the saved D3 preset; the previous Flowchart override is removed. Other import types and the user's ability to choose another renderer retain their existing owners.

**Verification / delivery.** The two native crawler/Launch checks, nine progressive import/filesystem regressions, TypeScript, hygiene and collaboration checks passed. A direct runtime probe confirms D3 before the crawl request, saved crawl preset readback, preserved storage-only view and no view change from a stale job. The in-app preview remained on Storyboard after menu clicks; live crawl verification remains pending. Source publication, protected integration and Production evidence remain separate. No new dependency or service is introduced. GTM remains the existing crawl-to-exploration workflow; no new commercial claim.

## 2026-09-28 automatic webpage fidelity

**PRD / MVP.** Imported webpages use the existing automatic conversion policy. The workspace toolbar has no fidelity selector or replacement fidelity label; the HTML and Markdown pane controls remain available.

**TAD / ADR.** Remove the manual fidelity selector, its toolbar/main/runtime props and the unused metadata-update callback. Keep the conversion owner and its size-aware limits unchanged. Previously saved fidelity metadata remains readable for compatibility and is not rewritten on open. No new conversion mode, dependency or always-loaded module is introduced.

**Verification / delivery.** The three existing toolbar consolidation, automatic routing and HTML/Viewer coexistence checks passed. The live preview at `http://127.0.0.1:5174/` has no fidelity selector and retains the HTML, Markdown, Viewer and Canvas controls. The inherited D3 renderer is also visible. TypeScript, hygiene and collaboration checks passed. Publication, protected integration and Production remain separate. GTM remains the existing crawl workflow with fewer decisions; buyer and payment claims are unchanged.

## 2026-09-28 complete webpage content

**PRD / MVP.** A completed headless capture imports the article title, media, sibling sections and full body instead of stopping at an embedded summary. The same conversion applies across sites without domain, URL, publisher class or chapter-label branches. Visual rows remain separate readable paragraphs. The automatic toolbar policy and progressive file writes retain their current owners.

**TAD / ADR.** The shared HTML converter consumes rendered content first and uses caller-supplied embedded Markdown only when the body conversion is empty. Head metadata cannot mask that fallback. One extracted content-root owner includes the nearest bounded title-bearing container around a prose fragment while respecting explicit article/main and existing strong root boundaries, multiple-title boundaries, and surrounding navigation. Existing embedded-data compatibility remains an input fallback, never an early return that discards rendered siblings. The crawler writes normal article Markdown; head diagnostics remain in the captured raw HTML artifact. Debug snapshot formatting moves into its own helper; the webpage artifact entry point drops below 600 lines. The pre-existing 1,420-line unified converter shrinks; splitting its remaining unrelated transforms is outside this increment. No new dependency or always-loaded renderer is added.

**Verification / delivery.** Nineteen focused cases pass, including fixtures with no embedded data, independent URLs, explicit article markup, title/media/section preservation, separate visual rows, embedded-only pages with image exclusion, and existing multilingual/media conversions. A local server import verifies article output without diagnostic metadata. Replaying the saved 196,776-byte reported page changed the former 104-character result to complete article Markdown; title, video reference, all 27 chapter rows, description once and transcript ending are checked. TypeScript, hygiene and collaboration contract checks pass. This is captured-source replay evidence, not a claim of pixel-identical reproduction or recovery of an already-saved workspace file. The screenshot's `destroy` error has no reproduced stack and remains unresolved. Source publication, protected integration and Production receipts remain distinct. GTM remains reliable crawl-to-exploration; no new buyer or payment claim.

## 2026-09-28 progressive import lifecycle and page identity

**PRD / MVP.** While completed pages appear, opening one must preserve its URL and content through the remaining crawl. Different query variants of a pathname are separate files. Imported page notifications must not restart workspace reconciliation or active-document materialization for every write.

**TAD / ADR.** The existing import refresh owner now includes parent-folder creation. The Source Files open event expands the progressive tree without its former full refresh; the persistence bootstrap invalidates its cache but skips repeated materialization for crawler-owned paths. The shared URL-to-file resolver adds a bounded query identity suffix, also used by crawl-table links. The writer rejects any remaining path collision before a write, so sanitization collisions fail visibly instead of overwriting another page. The shared preview fetch owner rejects cancelled requests before starting network work and observes a request that fails after its subscriber cancels. Every generated page, including an unavailable-conversion stub, uses the existing webpage document builder and shared D3 preset so opening it cannot inherit a previous document's XR renderer. Normal paths, unrelated filesystem changes, completion reconciliation and failure cleanup retain their existing owners. No site-specific branch, dependency or renderer is added.

**Verification / delivery.** A regression reproduced three query variants overwriting one file; it now preserves all three and leaves the already-opened page unchanged. The real Explorer open hook reproduced an extra full refresh and now opens/expands without it. Tests also check parent paths, sibling boundaries, concurrent import ownership, cancellation, D3 presets and collision failure. An isolated Chromium replay through Launch completed the saved 99-successful-node capture while its large `library.md` was open during import. Files appeared progressively; 99 Markdown artifacts and one raw-HTML preview were requested, with zero page errors. Reload and reopening Launch succeeded, with just one further raw-HTML request and zero page errors. The replay blocked external network traffic; missing artifacts and captured-page CSP messages are expected fixture limitations. Local evidence is recorded in `/tmp/website-import-active-proof.json`, `/tmp/website-import-replay-proof.json` and `/tmp/website-import-state-replay.log`; capture content is not committed. The user's existing in-app session and Production are not covered by that receipt. The earlier null `destroy` error was not reproduced or traced in this run.

**Required local checks.** The candidate passes 16 focused import/filesystem/lifecycle/cancellation tests, four bootstrap/manual-refresh/two-tab-save cases, 13 Block editor tests, 118 collaboration contract tests, 10 integration-policy tests, Canvas TypeScript checking and three Vite runtime tests. The production build and required 375-pixel mobile browser check pass with offline reopen, edit/save/reload, pinch zoom and zero page errors. These are local working-tree checks before publication; protected CI must bind its result to the published commit. Collaboration contract, hygiene and whitespace checks pass.

**GTM / bounds.** Restore reliable crawl-to-exploration before a user pilot. No buyer/payment claim. This increment is limited to six source modules plus focused tests and contracts, below 30 KB; existing overlong files must not grow. Full runtime crash recovery requires browser evidence, not source assertions alone.

## User outcomes

| Surface | Outcome |
|---|---|
| Import URL | Crawl a public HTTP(S) site in headless Chromium, follow same-site links, extract rendered HTML, and download bounded linked files. |
| Import local files | Preserve the established local-file and folder corpus pipeline and its existing Canvas extraction behavior. |
| Canvas | Create `website.crawl.canvas.md` with page nodes, link edges, downloaded-file nodes, and direct artifact links, then apply it through the shared workspace-to-Canvas owner. |
| Chat and Widget Card invocation | Route `/reference.expand @url:<https-url> @reference-policy #canvas` through the existing live `/`, `@`, and `#` grammar and the same website-import runtime. Widget Card Run creates or reuses a Rich Media Panel immediately, bypasses text-model generation, and falls back to the imperative importer when the React workspace bridge is unavailable. |

## Acceptance contract

- Rendered HTML from JavaScript-driven pages is captured in headless mode.
- Same-site links discovered in rendered DOM are queued until the configured page ceiling is reached.
- HTML, PDF, JPG, PNG, and other linked file types use one bounded artifact record and download route.
- Each downloaded artifact records its source URL, safe file name, MIME type, byte count, and SHA-256 digest.
- Proxy rotation is enabled when `AGENTIC_OS_CRAWLER_PROXY_URLS` contains valid HTTP, HTTPS, SOCKS4, or SOCKS5 proxy URLs; the pool is bounded to crawler concurrency.
- When no proxy pool is configured, runtime metadata reports direct mode rather than claiming rotation occurred.
- Loopback, link-local, RFC1918, carrier-grade NAT, unique-local IPv6, and resolved private addresses are blocked by default.
- Userinfo-bearing target URLs are rejected by the chat invocation. Redirects used for file retrieval are checked at every hop.
- The dependency manifests contain no Apify or Crawlee dependency.
- Headless HTML capture and direct PDF download pass real Chromium smoke proof.
- Physical crawler artifacts are stored under the sibling `sandbox/agentic-graph-workspace` root. New manifests use portable `agentic-graph-workspace/...` logical paths, while existing dot-prefixed paths remain readable through the shared resolver.
- One `YYYYMMDDTHHmmssZ` UTC generation token owns the crawl folder and every derived artifact; an existing valid token from the active generated document is reused.

## Reference implementation: Technical architecture

### Existing owners retained

| Responsibility | Owner |
|---|---|
| Website job lifecycle and manifests | `canvas/src/lib/websites/server/websiteImportServer.ts` |
| Native browser crawl, proxy pool, SSRF policy, and download budget | `canvas/src/lib/websites/server/nativeWebsiteCrawler.ts` |
| Binary and text artifact delivery | `canvas/src/lib/websites/server/websiteImportArtifactServer.ts` |
| Sandbox storage resolution and UTC generation identity | `canvas/src/lib/websites/server/websiteImportStorage.ts` |
| Workspace materialization | `canvas/src/features/markdown-workspace/useWorkspaceFileActions/websiteImportAction.ts` |
| Local files and corpus-to-Canvas application | existing `workspaceImport` and `applyWorkspaceImportToCanvas` owners |
| Live invocation grammar | existing Agentic Canvas OS dictionary-backed catalog plus `nativeCrawlerInvocation.ts` route adapter |
| Prompt preset | centralized Agentic Canvas OS `PROMPT-PRESETS.md`; `/crawler-agent @url:<https-url> @reference-policy #canvas` routes to the same native executor |

### Input contract

The client may request `browserMode=headless`, proxy rotation, asset downloads, a maximum page count, concurrency, download count, total download bytes, and an existing valid UTC generation token. It cannot provide proxy URLs or credentials. Server proxy endpoints come only from `AGENTIC_OS_CRAWLER_PROXY_URLS`, with one URL per comma or line.

The default physical store is the sibling `sandbox` checkout, resolved from the repository root without a developer-specific absolute path. `AGENTIC_OS_WORKSPACE_STORE_ROOT` may override that root for another local environment. The portable logical output setting is `agentic-graph-workspace/website-imports`, so workspace frontmatter and artifact URLs are machine-neutral. Legacy `.agentic-graph-workspace/website-imports` references resolve to the same physical store.

`AGENTIC_OS_CRAWLER_ALLOW_PRIVATE_NETWORKS=1` is an explicit development override for testing a locally hosted target. It is not sent by the client and is off by default.

### Runtime flow

1. The existing start route normalizes bounds, reuses a valid supplied `YYYYMMDDTHHmmssZ` token or creates one once, and creates a typed manifest under that generation ID.
2. Headless mode seeds the root URL without static prefetch, keeping discovery inside the browser and proxy boundary.
3. A browser pool rotates requests across the configured proxy endpoints by crawl sequence.
4. Each isolated browser context blocks unsafe subresource destinations, captures the rendered DOM, and extracts links and file candidates.
5. The job appends normalized same-site links to its bounded queue and converts captured HTML through the existing artifact converter.
6. Download candidates reserve shared count and byte budgets before persistence.
7. Workspace materialization creates page documents, the existing sitemap document, and one flowchart-backed Canvas document.

### Output contract

The manifest records engine, headless state, proxy mode, proxy pool size, download bounds, page links, and downloaded artifact metadata. It never records proxy endpoints or credentials. The artifact route validates import, node, and download identifiers against the manifest before reading a stored file.

The Canvas document exposes the page relationship graph and artifact download links. It is deliberately bounded to 500 pages, 1,500 graph edges, and 24 displayed downloads per page even if future server limits grow.

### Failure and fallback behavior

- An unsafe target or redirect produces a typed node error.
- A missing browser executable produces a crawl failure with the Playwright launch error. Development setup must run `npx playwright install chromium`; a system Chrome channel is the secondary launch option.
- A file with missing or invalid size metadata, a per-file size over 25 MiB, exhausted count budget, or exhausted total-byte budget is skipped.
- A headless crawl does not silently fall back to the static HTTP crawler, because doing so would bypass the selected proxy and browser security boundary.
- Markdown conversion failure leaves the raw HTML artifact available and does not discard the successful page capture.

### Cost and token posture

The crawler makes no model calls and consumes zero model tokens. Runtime cost is local browser CPU, memory, network traffic, proxy service cost if the operator configures one, and stored artifact bytes. Hard limits cap the crawl at 500 pages, 12 workers, 500 downloaded files, 1 GiB total downloaded bytes, 100 MiB configurable per-file bytes, five file redirects, and a 120-second configurable navigation timeout. The Import URL action requests the tighter defaults of 120 downloaded files and 250 MiB total bytes; the current native crawler keeps per-file downloads at 25 MiB and navigation at 30 seconds.

### Lane topology

This increment is authoring-only. The repository has source owners and test hosts, but it has no
separately provisioned crawler mirror, public server-owned crawler runtime, delivery receipt, or
operator promotion instruction.

| Lane | Function | Mutation rights | Residency | Current state | Local rung | Delivered rung |
|---|---|---|---|---|---|---|
| Authoring | edit and exercise crawler source/tests locally | scoped source, tests, and local artifacts | developer checkout plus sibling sandbox workspace | VCCs stated; results not attached | `spec-complete` | `undocumented` |
| Mirror | not provisioned for this increment | none | not assigned | absent; no candidate evidence | `undocumented` | `undocumented` |
| Delivery | not provisioned for this increment | none | not assigned | absent; no reachable runtime evidence | `undocumented` | `undocumented` |

| Boundary | From lane | To lane | Evidence Reference | Operator instruction | Rollback statement and check | State |
|---|---|---|---|---|---|---|
| `CRAWLER-SOURCE-TO-MIRROR` | Authoring | Mirror | none; mirror is absent | `none` | retain the prior Authoring revision and local artifacts | `closed` |
| `CRAWLER-MIRROR-TO-DELIVERY` | Mirror | Delivery | none; both lanes are absent | `none` | no delivered state exists to roll back | `closed` |

### VCC and Evidence Reference register

No satisfying result is attached to this revision. The source files and registered test cases
establish invocable hosts, not completed evidence.

| VCC | End state | Named check | Constraint | Recorded result | Local rung | Delivered rung |
|---|---|---|---|---|---|---|
| `VCC-NC-1` | private-network policy, proxy parsing, storage identity, canvas/download output, invocation routing, recovery, and dependency prohibition cases pass | `npm --prefix canvas run test:ci:unit -- websiteImport.native` exits 0 | no external crawler dependency or client-owned proxy credential is introduced | not recorded | `spec-complete` | `undocumented` |
| `VCC-NC-2` | the client type/build contract accepts the retained owners | `npm --prefix canvas run check` exits 0 | no unrelated generated document changes | not recorded | `spec-complete` | `undocumented` |
| `VCC-NC-3` | a clean environment captures one rendered page and one bounded linked file through the browser path | clean-environment browser smoke records the URL, artifact digest, byte count, and terminal status | private targets remain blocked and configured bounds remain active | not recorded; no dedicated smoke host exists | `spec-complete` | `undocumented` |
| `VCC-NC-4` | an exact approved candidate and reachable crawler runtime pass live verification | protected mirror and delivery checks exit 0 | source/unit checks cannot satisfy delivery | not applicable this increment; lanes absent | `spec-complete` | `undocumented` |

### Readiness Gap Matrix

| Workstream | Local rung | Delivered rung | Gap | Priority | Exit criteria (VCC) |
|---|---|---|---|---|---|
| Source contract and bounded unit behavior | `spec-complete` | `undocumented` | focused source result is not attached | none | `VCC-NC-1` and `VCC-NC-2` gain satisfying local Evidence References |
| Clean-environment browser behavior | `spec-complete` | `undocumented` | no dedicated invocable browser smoke host or recorded result | major | add a source-owned bounded smoke host and satisfy `VCC-NC-3` |
| Mirror and delivery | `undocumented` | `undocumented` | both lanes are deliberately absent from this increment | none | keep `VCC-NC-4` out of scope, or add a follow-on PRD/TAD before provisioning either lane |

## Planning revision — reference implementation

All five roles below consume `PLAN-AGENTIC-GRAPH-NATIVE-WEB-IMPORT-CRAWLER-PRD-TAD-ADR-MVP-GTM@0.2.1`. Existing source and runtime observations retain their original revisions and scope; this documentation update renews no deployment or demand evidence. The guideline is [v2.7.0](https://github.com/huijoohwee/huijoohwee.github.io/blob/e8d2a10a8d3e5735c43edf350a22523df05fdf91/guidelines/prd-tad-adr-mvp-gtm-guidelines.md); the shared maturity rubric loads on demand.

| Role | Owning content at this revision |
|---|---|
| PRD | [Acceptance contract](agentic-graph-native-web-import-crawler-prd-tad-adr-mvp-gtm.md#acceptance-contract) |
| TAD | [Reference implementation: Technical architecture](agentic-graph-native-web-import-crawler-prd-tad-adr-mvp-gtm.md#reference-implementation-technical-architecture) |
| ADR | [Product decision](agentic-graph-native-web-import-crawler-prd-tad-adr-mvp-gtm.md#product-decision) |
| MVP | [MVP — reference implementation](agentic-graph-native-web-import-crawler-prd-tad-adr-mvp-gtm.md#mvp--reference-implementation) |
| GTM | [GTM — reference implementation](agentic-graph-native-web-import-crawler-prd-tad-adr-mvp-gtm.md#gtm--reference-implementation) |

## MVP — reference implementation

Reuse the minimum scope, acceptance conditions and component owners identified above. The demonstration must follow the documented entry, permitted action, durable outcome and readback, including its stated failure/recovery path. Use `npm run check` for its actual coverage and the named feature checks in the specification; attach exact source, command, result and authoring/mirror/delivery surface to each VCC before advancing readiness. A source locator or structural check alone proves no user outcome.

Record the observed steps and elapsed time against the existing TTV target. If no target or invocation is stated, the demonstration remains unverified until the document owner supplies it. All four experience criteria are **unassessed** in this authoring review: Core Requirements & Functionality, Innovation & Theme Alignment, Technical Execution & Integration, and Usefulness & Agentic Experience. No scored user observation is attached to this revision; the document owner must capture a timed pilot and criterion-specific evidence.

## GTM — reference implementation

Use the stated persona and pain hypothesis to test one priced pilot in the existing user environment. Keep the documented free/self-serve workflow as the comparison; additional hosting, channels or agent roles require an evidenced constraint or buyer need. Record the buyer’s workaround, frequency, accepted outcome, offered price, observed response and support minutes before ranking a commercial winner. Demand, collected payment and repeat use remain unvalidated by this documentation review; mechanism evidence keeps its narrower original scope. Measure tokens, cash expense and maintenance separately for each proposed deployment model. Feed actual pilot outcomes into a successor Context using the shared four-column planning record.

## Planning gaps — reference implementation

Source review is bounded to repository `7fb85741121d8c2886027e4a630d013ba91c1027`. Confirmed: these referenced artifacts exist at that revision: [`canvas/src/lib/websites/server/websiteImportServer.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/lib/websites/server/websiteImportServer.ts), [`canvas/src/lib/websites/server/nativeWebsiteCrawler.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/lib/websites/server/nativeWebsiteCrawler.ts), [`canvas/src/lib/websites/server/websiteImportArtifactServer.ts`](https://github.com/huijoohwee/agentic-graph/blob/7fb85741121d8c2886027e4a630d013ba91c1027/canvas/src/lib/websites/server/websiteImportArtifactServer.ts). Their existence does not confirm every behavior asserted by the specification.
Experience observations, current VCC execution and buyer/payment evidence are unverified here. This is a bounded planning update, not a full-guideline conformance verdict; historical conformance percentages above apply only to their recorded profile and revision.


## Shared document-signal policy (0.2.41)

PRD: the same visible Markdown produces the same NAV/CTA/PRICE/TIME occurrence counts in
Document insights and website-artifact summaries. TAD/ADR: summaries project the existing
`indexDocumentSignals` owner, replacing their duplicate raw-line scan. Caller limits may narrow
results; both use the 8,000-line / 2-million-character / 24-label / 10-location hard bounds.
Frontmatter, code, image labels and link destinations share the same exclusion policy. No new
runtime dependency or filename/domain-specific path is introduced. MVP: three files / 10 KB /
10 active minutes, two new parity/bounds regressions plus existing insights and artifact checks.
The user authorized coordination; the prior writer completed its published candidate before
`/refactor #document-signal-policy @codex` resumed this lane. Both new regressions, all 13
existing insights/artifact tests, Canvas typechecking and its three runner checks pass. Rollback
reverts this source change; no data migration is needed. GTM: fewer contradictory document
counts; buyer value remains unmeasured. Protected integration and deployment are unverified.
