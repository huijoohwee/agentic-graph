---
title: "Offline Python Learning Workspace — implementation evidence"
version: "0.2.0"
status: "implementation-in-progress"
date: "2026-09-22"
continuity_id: "OFFLINE-PYTHON-LEARNING-WORKSPACE-001"
plan_revision: "1.0.0"
plan_commit: "f69d48f9a862fee6328b7d716d6b79e9fa5d23d4"
source_base: "b242ab5d82c49155808a86b45565c797f8e04f61"
---

# Offline Python learning implementation evidence

Intent: `/change #python.learning.runtime @codex-python-learning-runtime`.
The implementation binds the committed `docs/documents/prd-tad-adr-mvp-gtm-offline-python-learning-workspace.md` at the plan commit above. That document currently belongs to its separate, preserved specification lane. The user's implementation instruction authorizes this runtime work. This record does not declare the whole MVP accepted, deployed or commercially validated.

## Scope and implementation decisions

- Graph owns the existing Editor Workspace, runtime, native physics/ECS, lessons and local persistence. OS owns admission/release. Canvas documentation and invocation-catalog integration remain separate owner work.
- The Python pane follows `bin` in the existing pane controls. `.py` files use the existing Monaco/textarea editor, exact document URI and source setter. Opening, importing, changing a lesson, and loading a saved debrief never execute code. Starter/restore actions explicitly replace source; worked solutions are display-only.
- The three original procedural lessons run a bounded Python AST evaluator in a disposable worker. This is a documented language subset, not unrestricted Python or a claim of CPython/package compatibility. It does not execute JavaScript source, invoke a host interpreter, import packages, or expose filesystem/network/DOM capabilities.
- The preview occupies the existing Python pane and reuses native procedural vehicle geometry, the spatial physics engine and ECS World. It does not change the global Canvas mode; no mode restoration or competing global scene controller is needed. This is a scoped refinement of A3's provisional mode-switch design.
- Source retains the existing workspace file owner. Explicit debrief save uses the native `world_tick_result` Decision type and existing durable IndexedDB workspace adapter. The local adapter suppresses mirror/seed refresh and propagates errors; it introduces no database, SQL service, volatile fallback or account.
- The module cap is replanned from 24 to **36 changed runtime/test modules**, retaining **180 KiB added authored source**, <600 lines per new file, <500 kB per new chunk, no dependency additions and no always-load guidance growth. Separate protocol, persistence UI and test boundaries require more files than the provisional estimate. Existing oversized Monaco code shrinks by extracting its language loader. This adjustment removes no Must acceptance criterion.
- The admitted `python-learning-offline` successor preserves the published execution/editor head `4906970fd59a969fd972eb327ac9901790465a13` (PR #1149) and extends the native Vite, Workbox and service-worker revision owners. Installation is explicit: a bounded same-origin manifest enumerates the final emitted shell, lazy editor/language/worker code, fonts and procedural scenes. SHA-256 download/readback precedes one atomic active-pointer write under a browser-wide lock. Every admitted navigation verifies complete membership; cached asset reads also verify their bytes. The prior complete pack remains available for explicit recovery, including through service-worker activation. No other service worker, database or global navigation fallback is added.
- Offline navigation is opt-in through `python-learning-offline=<source revision>`. Ordinary application navigation keeps its HTTP authority. Missing, evicted or corrupt installed files produce an explicit failure. Source/debrief storage is separate and retained. Unsupported locking/service-worker capabilities fail visibly; an uncached first visit still needs a local distribution or connection.

## Executable profile

`learning-python-1`: ASCII identifiers; decimal bounded integers and finite floats; single-line quoted strings with supported explicit escapes; booleans/None; one-name assignment; numeric/string arithmetic; comparisons; short-circuit `and`/`or`/`not`; `if`/`elif`/`else`; `while`; `for` over `range`; top-level positional functions; return/break/continue/pass; print/abs/min/max/range. Unsupported syntax is rejected with a span. Tabs for indentation, multiline/triple strings, attributes, containers, imports, exponentiation, augmented assignment, function defaults/keywords, nested function definitions and recursion are outside this revision.

Limits are enforced at parsing, evaluation, allocation, worker protocol and simulation boundaries: 32 KiB source, 4,096 AST nodes, depth 32, 50,000 evaluator steps, 16 function frames, 256 live variables, 4,096 string characters, 1,024 integer bits, 64 KiB output, 7,200 simulation ticks, 1 MiB trace, five seconds active compute and 15 minutes paused lifetime. The main thread can terminate a noncooperating worker. Cooperation is checked each native physics tick and between statements; timer delivery is not a real-time guarantee.

`drive(speed,ticks)` accepts finite −6…6 m/s and 1…3,600 integer ticks per call. A tick is 1/60 second. `turn(degrees)` accepts −360…360 and normalizes heading. Both return None. `distance()` returns forward free metres; `at_goal()` returns a boolean. The instructional kinematics uses native collision/sensor queries and does not claim physical robotics or Flight parity.

Run identity binds workspace, document, SHA-256 source/scene digests, lesson/runtime revisions, seed, run ID and generation. Worker events have monotonic sequence and validated payloads. Run and Step share one evaluator. Stop, document/lesson/source change and unmount fence late work. Assessment is one pure rubric over actual scene state and executed-concept counters, shared by UI and tool adapters.

## Verification ledger

Commands run from the implementation lane unless noted. Each browser runner records source SHA/state in its external evidence artifact; only a clean-candidate artifact establishes that exact source proof. No local browser result establishes deployment.

| Check | Observation | Acceptance coverage / limits |
|---|---|---|
| `TSX_TSCONFIG_PATH=canvas/tsconfig.json node --import tsx --test canvas/src/__tests__/pythonLearning.test.ts canvas/src/__tests__/pythonLearningLifecycle.test.ts` | 14 tests passed on clean execution/editor candidate `4906970fd59a969fd972eb327ac9901790465a13` | Q1–Q4 and persistence/tool-executor portions of Q5/Q6 |
| Local Python oracle | Python 3.9.6, isolated `-I` execution of authored static fixtures only; supported arithmetic, scoping and control flow compared | No learner code is sent to the host interpreter. Not proof of all Python semantics |
| Native worker bundle inspection | Minified ES2020 browser bundle 111,213 bytes, 20 dependency modules, zero external imports | Worker closure is below 500 kB; existing vendor chunks retain their existing budgets |
| `node canvas/scripts/run_python_learning_browser_smoke.mjs` | Clean execution/editor candidate: all three lessons, save/reload, no-auto-run import/export, 375 px layout, desktop Python highlighting/Unicode and bound tool acknowledgement passed; 9,324 ms; zero page errors or remote requests | Native Workspace Main and locked Chromium; fixture tool executor, not production registration. Harness time is not learner completion time |
| `canvas/src/__tests__/pythonLearningOffline.test.ts` | Six tests: atomic admission, invalid membership, interrupted download, quota, corruption, concurrent installation, two-version retention, recovery and build inventory | Fault-injected cache owner plus native build manifest; browser proof below verifies real CacheStorage/Workbox |
| Native service-worker revision/asset tests | Nine tests passed after retaining the existing single message/activation listeners | Existing revision, cache convergence and no-HTML-fallback contracts remain intact |
| `AG_SKIP_DOCS_UPDATE=1 VITE_BASE_PATH=/agentic-graph/ npm run build` and `npm run pwa:build-authority:check` | Production build and native PWA authority check passed; manifest hashes final files after native stylesheet postprocessing | Conservative application closure: about 26.5 MiB / 838 files before final freeze. Exact sizes are recorded in the candidate manifest. No deployment |
| `node canvas/scripts/run_python_learning_offline_smoke.mjs` | Full built application: real file import; verified install; network-disabled reload; three lessons and durable debrief/source reopen; missing-worker navigation fails 503 without losing source. Development observation: 4,400 ms install / 722 ms initial reload, zero page errors | Q5 local browser evidence. Existing unrelated source/control-plane probes fail without blocking learning. Exact-candidate run follows source freeze. These are device observations, not performance guarantees |
| Scoped TypeScript diagnostics | Full native Canvas check passed with its pinned TypeScript 5.8 toolchain and dependency tree | An earlier root-only dependency setup selected TypeScript 5.9 and lacked Canvas-local jsdom. Linking the existing pinned Canvas dependencies resolved those setup errors without source changes. |
| Agentic OS affected check | 4/226 suites, 28 tests passed; receipt `validation-60684fc3ab048501fad756db/last.json` | Lifecycle harness observation; does not prove product delivery |

Browser artifacts are emitted to `PYTHON_LEARNING_PROOF_DIR` or an OS temporary proof directory and include source state, timings and screenshots. They use a fresh browser profile and authored fixtures. The component runner distinguishes its fixture tool executor from registration; the production-build runner separately records offline reload/corruption results and denies deployment/learner-session proof.

Source file save and debrief save have distinct receipts. The debrief includes its exact source snapshot. “Save source” delegates to the existing Workspace action bridge, making the native Save action reachable inside the mobile pane. The browser proof requires its Saved acknowledgement and database readback before reload. Immediate/debounced autosave attempts intermittently reopened older source and are not retained as passing source-reopen evidence; automatic-save timing is not certified by this slice.

No dependency or lockfile was added. Reused local dependency metadata identifies React/React DOM 18.3.1, Three 0.170.0, React Three Fiber 8.18.0, Monaco 0.53.0, Workbox core 7.4.1 and Vite 6.4.3 as MIT. Their existing distributions retain their license notices. This scoped inventory is not a new license audit of every unrelated application feature.

## Outstanding acceptance and ownership

1. **Q5 candidate proof:** implementation and full-app local offline observations are present. Refresh the built candidate after final source changes, including the browser-wide upgrade/recovery check and corruption rejection. Browser eviction remains detectable, not preventable; portable debrief export is available.
2. **Q6 production registration:** `learningToolContract.mjs` and `learningWebMcp.ts` implement the two bounded operations over the same runtime, rubric and persistence. They remain unregistered. Lane admission rejected overlap with `design-review-bounds` for the central agent-ready contract and WebMCP registry. Do not edit those files until their owner releases or hands them off. The OS sigil route and Canvas documentation are not yet registered/published.
3. **Q1/Q7 release proof:** refresh exact-candidate checks. Automated mobile geometry, accessible names, keyboard activation and static procedural rendering cover part of accessibility; a screen-reader/manual device session is unobserved. A timed learner session and buyer/demand evidence remain unmeasured. The new focused tests run explicitly; adding them to the shared affected-check contract awaits its current owner.

No whole-slice acceptance, protected merge, production deployment, production runtime proof, zero-cost-of-operation savings, learning efficacy or revenue claim follows from the current checks.

## Semantic references

Python language semantics were checked against the primary [expression reference](https://docs.python.org/3.13/reference/expressions.html) and [execution model](https://docs.python.org/3.13/reference/executionmodel.html). The executable local comparison uses the separately identified 3.9.6 interpreter and only the declared subset. Native repository implementations own rendering, simulation, storage and lifecycle behavior.
