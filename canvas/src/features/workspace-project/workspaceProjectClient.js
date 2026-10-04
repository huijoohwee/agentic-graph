import { WORKSPACE_ARTIFACT_TOOL_DEFINITIONS, WORKSPACE_PROJECT_OPERATIONS } from "../../../../mcp/workspace-artifact-contract.js";

// One bounded in-memory recovery slot survives panel closure when browser storage fails.
let suspendedDraft = null;

// Moved from the MIT MCP package; retained draft keys and protocol remain unchanged.
export function mountWorkspaceProject(root, { endpoint = "/__workspace_project", captureFile, openFile } = {}) {
const lifetime = new AbortController();
let disposed = false;
const registeredTools = [];
const $ = (id) => root.querySelector(`#${id}`);
const encoder = new TextEncoder();
const MAX_FILE = 256 * 1024, MAX_PROJECT = 2 * 1024 * 1024, MAX_DRAFTS = 10 * 1024 * 1024;
const state = { root: "", token: "", id: "", expectedVersion: "", files: [], selected: "", history: [], inspecting: false, dirty: false, busy: false, writer: crypto.randomUUID(), ancestors: [], recoveryBlocked: true };
let writerEpoch = 0, writerRelease = null;
const status = (message, error = false) => { if (disposed) return; $("status").textContent = message; $("status").dataset.error = String(error); };
const assertRecoveryAdmission = () => {
  if (disposed || state.recoveryBlocked) throw Object.assign(new Error("Tab recovery admission failed; visible drafts and retained keys remain untouched."), { code: "RECOVERY_BLOCKED" });
};
const request = async (mode, args) => {
  const epoch = writerEpoch;
  if (mode === "apply") assertRecoveryAdmission();
  const response = await fetch(`${endpoint}/api/${mode}`, { signal: lifetime.signal, method: "POST", headers: { "Content-Type": "application/json", "x-workspace-token": state.token }, body: JSON.stringify(args) });
  const result = await response.json();
  if (disposed || epoch !== writerEpoch) throw Object.assign(new Error("Page lifecycle changed during the operation; inspect its saved version before retrying."), { code: "RECOVERY_BLOCKED" });
  if (mode === "apply") assertRecoveryAdmission();
  if (!response.ok || !result.ok) throw Object.assign(new Error(result.error?.message || "Local operation failed."), { code: result.error?.code || "STORAGE_UNAVAILABLE" });
  return result;
};
const argsFor = (operation, extra = {}, id = state.id) => ({ operation: `project-${operation}`, workspaceRoot: state.root, path: id || "_", ...extra });
const read = (operation, extra = {}, id) => request("plan", argsFor(operation, extra, id));
const apply = async (operation, extra = {}) => {
  assertRecoveryAdmission();
  const args = argsFor(operation, extra); const plan = await request("plan", args);
  return request("apply", { ...args, planDigest: plan.planDigest, operatorAuthorized: true });
};
const draftPrefix = () => `agentic-graph-local-draft:${state.root}:`;
const draftKey = () => `${draftPrefix()}${state.writer}:${state.id}`;
const recoverDraft = () => {
  if (suspendedDraft?.root === state.root && suspendedDraft.id === state.id) return suspendedDraft.draft;
  for (const key of [draftKey(), ...state.ancestors.map((writer) => `${draftPrefix()}${writer}:${state.id}`), `${draftPrefix()}${state.id}`]) {
    const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw);
  }
  return null;
};
const claimWriter = async (candidate, epoch) => {
  if (typeof navigator.locks?.request !== "function") return false;
  return new Promise((resolve) => {
    navigator.locks.request(`agentic-graph-draft:${state.root}:${candidate}`, { ifAvailable: true }, async (lock) => {
      if (!lock || disposed || epoch !== writerEpoch) { resolve(false); return; }
      state.writer = candidate;
      let releaseLock;
      await new Promise((release) => { releaseLock = release; writerRelease = release; resolve(true); });
      if (writerRelease === releaseLock) writerRelease = null;
    }).catch(() => resolve(false));
  });
};
const admitWriter = async (previous = {}) => {
  const epoch = ++writerEpoch;
  state.recoveryBlocked = true; writerRelease?.(); writerRelease = null;
  const ancestors = [...new Set([...(previous.ancestors || []), ...(previous.writer ? [previous.writer] : [])])];
  if (ancestors.length > 100 || ancestors.some((writer) => typeof writer !== "string" || writer.length > 128)) throw new Error("Writer recovery history exceeds its bound.");
  const candidate = previous.writer || state.writer;
  if (!await claimWriter(candidate, epoch) && !await claimWriter(crypto.randomUUID(), epoch)) throw new Error("Exclusive tab recovery admission is unavailable.");
  if (disposed || epoch !== writerEpoch) throw new Error("Page lifecycle changed during tab recovery admission.");
  state.ancestors = ancestors.filter((writer) => writer !== state.writer);
  sessionStorage.setItem(`agentic-graph-local-writer:${state.root}`, JSON.stringify({ writer: state.writer, ancestors: state.ancestors }));
  state.recoveryBlocked = false;
};
const activeKey = () => `agentic-graph-local-active:${state.root}`;
const validateFiles = (files) => {
  if (!Array.isArray(files) || files.length > 100) throw new Error("At most 100 text files are supported.");
  const seen = new Set(); let bytes = 0;
  for (const file of files) {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string" || !file.path
      || file.path.length > 1024 || /[\\\u0000-\u001f\u007f]/u.test(file.path)
      || file.path.split("/").some((part) => !part || [".", "..", ".git"].includes(part.toLowerCase())) || seen.has(file.path)) throw new Error("File paths must be unique, portable, and outside .git.");
    const size = encoder.encode(file.content).length;
    if (size > MAX_FILE) throw new Error("A file exceeds 256 KiB. The visible draft is retained.");
    if (new TextDecoder("utf-8", { fatal: true }).decode(encoder.encode(file.content)) !== file.content) throw new Error("Text must contain valid Unicode.");
    seen.add(file.path); bytes += size;
  }
  if (bytes > MAX_PROJECT) throw new Error("Project text exceeds 2 MiB. The visible draft is retained.");
};
const persist = () => {
  if (disposed) return false;
  if (state.recoveryBlocked) { $("draft-state").textContent = "Draft remains visible; exclusive browser recovery is unavailable."; return false; }
  if (!state.id || state.inspecting) return true;
  try {
    validateFiles(state.files);
    const draft = JSON.stringify({ expectedVersion: state.expectedVersion, files: state.files.map(({ path, content }) => ({ path, content })), selected: state.selected, dirty: state.dirty });
    let size = encoder.encode(draft).length;
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key.startsWith("agentic-graph-local-draft:") && key !== draftKey()) size += encoder.encode(localStorage.getItem(key)).length;
    }
    if (size > MAX_DRAFTS) throw new Error("Browser draft cache exceeds 10 MiB. Export this draft before closing.");
    localStorage.setItem(draftKey(), draft);
    localStorage.setItem(activeKey(), state.id);
    if (suspendedDraft?.root === state.root && suspendedDraft.id === state.id) suspendedDraft = null;
    $("draft-state").textContent = state.dirty ? "Draft retained in this browser." : "Checkpoint saved.";
    return true;
  } catch (error) {
    if (state.dirty) suspendedDraft = { root: state.root, id: state.id, writer: state.writer, ancestors: state.ancestors,
      draft: { expectedVersion: state.expectedVersion, files: state.files.map(file => ({ ...file })), selected: state.selected, dirty: true } };
    $("draft-state").textContent = "Draft retained in this app session only. Export before reloading or closing the browser.";
    status(error.message, true); return false;
  }
};
const retainDraft = () => { if (state.dirty && !persist()) throw new Error("Draft recovery could not be saved. Copy or export the visible draft before switching."); };
const setDirty = () => { state.dirty = true; persist(); };
const render = () => {
  if (disposed) return;
  $("project-title").textContent = state.id || "Files";
  $("file-list").replaceChildren();
  for (const file of state.files) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = file.path;
    button.setAttribute("aria-current", String(file.path === state.selected));
    button.disabled = state.recoveryBlocked || state.busy;
    button.addEventListener("click", () => { if (state.recoveryBlocked || state.busy) return; state.selected = file.path; render(); persist(); }); $("file-list").append(button);
  }
  const selected = state.files.find(({ path }) => path === state.selected);
  $("editor").value = selected?.content || ""; $("editor").disabled = !selected || state.busy; $("editor").readOnly = state.inspecting || state.recoveryBlocked;
  $("editor-label").firstChild.textContent = selected ? `${selected.path}${state.inspecting ? " · saved version" : ""}` : "File contents";
  $("delete-file").disabled = !selected || state.inspecting || state.busy;
  $("checkpoint").disabled = !state.id || state.inspecting || state.busy || state.recoveryBlocked;
  $("new-file").querySelector("button").disabled = !state.id || state.inspecting || state.busy || state.recoveryBlocked;
  $("export").disabled = !state.expectedVersion || state.busy; $("export-draft").disabled = !state.id || state.busy;
  $("versions").disabled = !state.expectedVersion || state.busy;
  $("restore").disabled = !state.inspecting || state.busy || state.recoveryBlocked;
  $("capture-canvas").disabled = !captureFile || !state.id || state.inspecting || state.busy || state.recoveryBlocked;
  $("open-canvas").disabled = !openFile || !selected || state.busy || state.recoveryBlocked;
  $("version-id").textContent = state.expectedVersion ? `Base: ${state.expectedVersion}` : "New project draft. Save its first checkpoint.";
};
const versions = (history = []) => {
  $("versions").replaceChildren(new Option("Current draft", ""));
  for (const entry of history) $("versions").add(new Option(`${entry.version.slice(0, 8)} · ${entry.message || "Checkpoint"}`, entry.version));
};
const list = async () => {
  const result = await read("list", {}, "_");
  $("projects").replaceChildren(new Option("Choose a project", ""));
  for (const project of result.data.projects) $("projects").add(new Option(project.id, project.id));
  const prefix = draftPrefix();
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index); if (!key.startsWith(prefix)) continue;
      const suffix = key.slice(prefix.length).split(":");
      if (suffix.length === 2 && ![state.writer, ...state.ancestors].includes(suffix[0])) continue;
      const id = suffix.at(-1); const draft = JSON.parse(localStorage.getItem(key));
      if (draft?.dirty && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(id) && ![...$("projects").options].some(({ value }) => value === id)) {
        $("projects").add(new Option(`${id} · browser draft`, id));
      }
    }
  } catch { status("Saved projects loaded; browser draft inventory unavailable.", true); }
  if (suspendedDraft?.root === state.root && ![...$("projects").options].some(({ value }) => value === suspendedDraft.id)) {
    $("projects").add(new Option(`${suspendedDraft.id} · session recovery`, suspendedDraft.id));
  }
  $("projects").value = state.id;
};
const load = async (id) => {
  let data;
  try { data = (await read("inspect", {}, id)).data; }
  catch (error) { if (error.code !== "NOT_FOUND") throw error; data = { version: "", files: [], history: [] }; }
  state.id = id; state.expectedVersion = data.version; state.files = data.files; state.history = data.history || []; state.inspecting = false; state.dirty = false;
  try {
    const draft = recoverDraft();
    if (draft?.dirty) { validateFiles(draft.files); state.files = draft.files; state.expectedVersion = draft.expectedVersion; state.dirty = true; state.selected = draft.selected; }
  } catch (error) { status(`Saved version loaded; draft recovery failed: ${error.message}`, true); }
  if (!state.files.some(({ path }) => path === state.selected)) state.selected = state.files[0]?.path || "";
  versions(state.history); render(); persist();
  status(state.dirty ? "Recovered unsaved draft. Saving will check its original base version." : "Loaded exact saved files.");
};
const guard = (callback) => async (event) => {
  event?.preventDefault(); if (state.busy) return;
  state.busy = true; render();
  try { if (state.recoveryBlocked) throw new Error("Tab recovery admission failed; retained draft keys remain untouched."); await callback(event); } catch (error) { status(`${error.code || "INVALID_INPUT"}: ${error.message} Draft bytes remain available.`, true); }
  finally { state.busy = false; render(); }
};
const download = (data, name) => {
  const bytes = JSON.stringify(data); const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([bytes], { type: "application/json" })); link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
const sha = async (content) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(content))), (byte) => byte.toString(16).padStart(2, "0")).join("");
$("new-project").addEventListener("submit", guard(async () => {
  const id = $("project-name").value;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(id)) throw new Error("Use a lowercase project slug.");
  if ([...$("projects").options].some(({ value }) => value === id)) throw new Error("Project exists. Select it to retain version fencing.");
  retainDraft(); state.id = id; state.expectedVersion = ""; state.files = [{ path: "README.md", content: "" }]; state.selected = "README.md"; state.inspecting = false; state.history = []; state.dirty = true;
  versions(); persist(); status("New draft ready. Edit a file, then save a checkpoint.");
}));
$("projects").addEventListener("change", guard(async () => { retainDraft(); if ($("projects").value) await load($("projects").value); }));
$("refresh").addEventListener("click", guard(async () => { retainDraft(); await list(); if (state.id && state.expectedVersion) await load(state.id); status("Local projects refreshed; drafts retained."); }));
$("new-file").addEventListener("submit", guard(async () => {
  const file = { path: $("file-path").value, content: "" }; validateFiles([...state.files, file]); state.files.push(file); state.selected = file.path; $("file-path").value = ""; setDirty(); status("File added to draft.");
}));
$("editor").addEventListener("input", () => { if (!state.inspecting && !state.busy && !state.recoveryBlocked) { const file = state.files.find(({ path }) => path === state.selected); if (file) { const previous = file.content; file.content = $("editor").value;
    try { validateFiles(state.files); setDirty(); }
    catch (error) { file.content = previous; $("editor").value = previous; status(`Edit exceeds project limits: ${error.message}`, true); } } } });
$("delete-file").addEventListener("click", guard(async () => { state.files = state.files.filter(({ path }) => path !== state.selected); state.selected = state.files[0]?.path || ""; setDirty(); status("File removed from draft. Earlier versions retain it."); }));
$("checkpoint").addEventListener("click", guard(async () => {
  validateFiles(state.files); const files = state.files.map(({ path, content }) => ({ path, content }));
  const result = await apply("checkpoint", { expectedVersion: state.expectedVersion, files, message: $("message").value });
  state.expectedVersion = result.version; state.dirty = false; persist();
  const saved = await read("inspect", { version: result.version }); state.files = saved.data.files; state.history = saved.data.history || [];
  versions(state.history); await list(); status(`Checkpoint saved: ${result.version.slice(0, 8)}. Exact bytes verified.`);
}));
$("versions").addEventListener("change", guard(async () => {
  const version = $("versions").value;
  retainDraft(); if (!version) return load(state.id);
  const saved = await read("inspect", { version }); state.files = saved.data.files; state.inspecting = true; state.selected = state.files[0]?.path || "";
  status(`Inspecting immutable ${version.slice(0, 8)}. Project head is unchanged.`);
}));
$("restore").addEventListener("click", guard(async () => {
  const version = $("versions").value;
  if (!state.inspecting || !version) throw new Error("Choose a saved version to restore.");
  if (recoverDraft()?.dirty) throw new Error("An unsaved draft is retained. Return to Current draft and save it before restoring.");
  const files = state.files.map(({ path, content }) => ({ path, content }));
  validateFiles(files);
  const result = await apply("checkpoint", { expectedVersion: state.expectedVersion, files, message: `Restore ${version.slice(0, 8)}` });
  state.expectedVersion = result.version; state.inspecting = false; state.dirty = false; persist();
  await load(state.id); await list();
  status(`Restored ${version.slice(0, 8)} as checkpoint ${result.version.slice(0, 8)}. All earlier versions remain available.`);
}));
$("export").addEventListener("click", guard(async () => {
  const version = $("versions").value || state.expectedVersion;
  await read("export", { version });
  const link = document.createElement("a"); link.href = `${endpoint}/export/${encodeURIComponent(state.id)}?version=${encodeURIComponent(version)}`;
  link.download = `${state.id}.project.json`; link.click(); status("Export download requested with SHA-256 file digests.");
}));
$("export-draft").addEventListener("click", guard(async () => {
  validateFiles(state.files); const files = await Promise.all(state.files.map(async ({ path, content }) => ({ path, content, digest: await sha(content) })));
  download({ schemaVersion: "agentic-graph-project-export/v1", projectId: state.id, files }, `${state.id}.draft.json`); status("Draft exported; no project head changed.");
}));
$("import").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", guard(async () => {
  const file = $("import-file").files[0]; if (!file) return;
  if (file.size > 3 * 1024 * 1024) throw new Error("Encoded import exceeds 3 MiB.");
  const data = JSON.parse(await file.text());
  if (data.schemaVersion !== "agentic-graph-project-export/v1") throw new Error("Unsupported export format.");
  validateFiles(data.files);
  for (const entry of data.files) if (entry.digest !== await sha(entry.content)) throw new Error(`Digest mismatch: ${entry.path}`);
  const id = $("project-name").value || data.projectId;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(id)) throw new Error("Enter a valid new project name before import.");
  const saved = await read("list", {}, "_");
  if (saved.data.projects.some((project) => project.id === id)) throw new Error("Import requires a new project name; the existing project is retained.");
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key.startsWith(draftPrefix()) && (key.endsWith(`:${id}`) || key === `${draftPrefix()}${id}`)
      && JSON.parse(localStorage.getItem(key))?.dirty) throw new Error("That project name has a retained draft. Choose a new name before import.");
  }
  // Keep imported bytes as a recoverable draft before the exact authorized apply.
  retainDraft(); state.id = id; state.expectedVersion = ""; state.files = data.files; state.selected = data.files[0]?.path || ""; state.inspecting = false; state.dirty = true; persist();
  const result = await apply("import", { expectedVersion: "", files: data.files, message: "Import verified project" });
  state.expectedVersion = result.version; state.dirty = false; persist(); await list(); await load(id); status("Imported paths, bytes and digests verified in the local store.");
}));
$("command-form").addEventListener("submit", guard(async () => {
  const match = $("command").value.match(/^\/([a-z-]+)\s+#([a-z0-9_-]+)\s+@local-git$/u);
  if (!match || !WORKSPACE_PROJECT_OPERATIONS.includes(`project-${match[1]}`)) throw new Error("Use an admitted /operation #project @local-git command.");
  const extra = ["checkpoint", "import"].includes(match[1]) ? { expectedVersion: state.expectedVersion, files: state.files.map(({ path, content }) => ({ path, content })) } : {};
  const result = await read(match[1], extra, match[2]); $("command-result").textContent = JSON.stringify(result, null, 2); status("Prepared exact command; no mutation applied.");
}));
$("capture-canvas").addEventListener("click", guard(async () => {
  const file = captureFile();
  if (!file) throw new Error("Open a Canvas document first.");
  validateFiles([...state.files, file]);
  state.files.push(file); state.selected = file.path; setDirty();
  status("Canvas document added to this project draft. Save a checkpoint to retain it.");
}));
$("open-canvas").addEventListener("click", guard(async () => {
  const file = state.files.find(({ path }) => path === state.selected);
  retainDraft(); await openFile({ ...file, projectId: state.id });
  status("Opened a copy in Canvas. Project checkpoints are unchanged.");
}));
window.addEventListener("beforeunload", (event) => { if (state.dirty && !persist()) { event.preventDefault(); event.returnValue = ""; } }, { signal: lifetime.signal });
window.addEventListener("pagehide", () => {
  state.recoveryBlocked = true; writerEpoch++; writerRelease?.(); writerRelease = null; render();
}, { signal: lifetime.signal });
window.addEventListener("pageshow", async (event) => {
  if (!event.persisted || !state.root) return;
  try {
    await admitWriter({ writer: state.writer, ancestors: state.ancestors }); persist();
    status("Tab recovery readmitted. Retained draft bytes remain available.");
  } catch (error) { status(`Tab recovery unavailable: ${error.message} Visible drafts remain available.`, true); }
  render();
}, { signal: lifetime.signal });

const ready = (async () => {
try {
  const response = await fetch(`${endpoint}/session`, { signal: lifetime.signal });
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Project storage is not available on this Canvas host");
  const session = await response.json();
  if (!response.ok || !session.rootDir || !session.token) throw new Error(session.error?.message || "This host has no configured local project store.");
  if (disposed) return;
  state.root = session.rootDir; state.token = session.token;
  try {
    const key = `agentic-graph-local-writer:${state.root}`;
    const raw = sessionStorage.getItem(key); let previous;
    try { previous = JSON.parse(raw); } catch { previous = { writer: raw }; }
    if (typeof previous === "string") previous = { writer: previous };
    await admitWriter(suspendedDraft?.root === state.root ? suspendedDraft : previous || {});
  } catch { state.recoveryBlocked = true; status("Tab recovery admission failed; retained drafts remain untouched.", true); }
  const discovery = await read("discover", {}, "_"); $("discovery").textContent = JSON.stringify(discovery.data, null, 2);
  await list(); status("Local store ready. Create a draft or choose a saved project.");
  try {
    const active = suspendedDraft?.root === state.root ? suspendedDraft.id : localStorage.getItem(activeKey());
    if (active && [...$("projects").options].some(({ value }) => value === active)) { await load(active); $("projects").value = active; }
  } catch (error) { status(`Local projects ready; draft recovery unavailable: ${error.message}`, true); }
  try {
  const modelContext = document.modelContext;
  if (typeof modelContext?.registerTool === "function") {
    for (const definition of WORKSPACE_ARTIFACT_TOOL_DEFINITIONS) {
      const mode = definition.name.endsWith(".plan") ? "plan" : "apply";
      if (disposed) return;
      await modelContext.registerTool({ name: definition.name, description: `${definition.description} Confined local project mode.`,
        inputSchema: { ...definition.inputSchema, properties: { ...definition.inputSchema.properties, operation: { type: "string", enum: WORKSPACE_PROJECT_OPERATIONS } } },
        execute: async (args) => {
          assertRecoveryAdmission();
          if (mode === "apply" && !window.confirm(`Apply ${args.operation} to ${args.path}?\nPlan: ${args.planDigest}`)) throw new Error("Operator declined the exact plan.");
          return request(mode, args);
        } }, { signal: lifetime.signal });
      if (disposed) { modelContext.unregisterTool?.(definition.name); return; }
      registeredTools.push(definition.name);
    }
    $("webmcp").textContent = "WebMCP: registered the existing plan/apply identities in native document.modelContext.";
  } else $("webmcp").textContent = "WebMCP: unavailable in this browser. Local HTTP and stdio MCP remain separate supported adapters.";
  } catch (error) { if (!disposed) $("webmcp").textContent = `WebMCP unavailable: ${error.message}. Project controls remain available.`; }
} catch (error) { if (disposed) return; status(`Local store unavailable: ${error.message}. Existing drafts remain in this browser.`, true); }
render();

})();
return { ready, dispose() {
  if (disposed) return;
  persist(); disposed = true; state.recoveryBlocked = true; writerEpoch++;
  lifetime.abort(); writerRelease?.(); writerRelease = null;
  for (const name of registeredTools) document.modelContext?.unregisterTool?.(name);
} };
}
