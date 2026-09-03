// Thin DOM render layer for the agentic-graph Cloudflare Pages frontend.
//
// Spec: agentic-graph-widget-canvas-media (Cloudflare Pages frontend;
// R1, R13). This module is INTENTIONALLY THIN: it consumes the render-ready
// view-models produced by the REUSED pure builders in `web/src/lib/*` and turns
// them into DOM nodes. It contains NO view logic of its own — no validation, no
// gate/state derivation, no budget math. Every decision is delegated to the lib
// builders; this file only paints their output.
//
// STACK BOUNDARY (R11/R15.7): presentation only. Holds no model provider key
// and no auth secret; performs no model-provider call.

// --- Tiny DOM helpers (no framework) ----------------------------------------

/**
 * Create an element with optional class, text, attributes, and children.
 * @param {string} tag
 * @param {{ class?: string, text?: string, attrs?: object, html?: string }} [opts]
 * @param {Array<Node|string>} [children]
 * @returns {HTMLElement}
 */
export function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text !== undefined) node.textContent = String(opts.text);
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) {
      if (v === true) node.setAttribute(k, "");
      else if (v !== false && v != null) node.setAttribute(k, String(v));
    }
  }
  for (const child of children) {
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

/** Replace all children of `host` with `nodes`, then reveal it. */
export function mount(host, ...nodes) {
  if (!host) return;
  host.replaceChildren(...nodes);
  host.hidden = false;
}

function sectionTitle(text) {
  return el("h2", { class: "card__title", text });
}

// --- Run state (R1.9, R13.4) ------------------------------------------------

/**
 * Render the current Run_State header from a run-manifest view-model.
 * @param {{ runState: string, isTerminalState: boolean }} view
 */
export function renderRunState(view) {
  return [
    sectionTitle("Run status"),
    el("p", {}, [
      el("span", { class: "tag tag--state", text: view.runState }),
      view.isTerminalState ? el("span", { class: "muted", text: "  (terminal)" }) : "",
    ]),
  ];
}

// --- Run initiation: planned stages + budget cap (R1.3) ---------------------

/**
 * Render the planned stage list + budget cap from a run-initiation view-model.
 * @param {{ stages: Array, budgetCapUsd: number|null }} view
 */
export function renderInitiation(view) {
  const items = view.stages.map((stage) =>
    el("li", { class: "list__item" }, [
      el("span", {}, [
        el("strong", { text: stage.label }),
        stage.gateId ? el("span", { class: "muted", text: `  · ${stage.gateId}` }) : "",
      ]),
      el("span", { class: "tag", text: stage.status }),
    ]),
  );
  const cap =
    typeof view.budgetCapUsd === "number"
      ? `$${view.budgetCapUsd.toFixed(2)}`
      : "no cap set";
  return [
    sectionTitle("Planned stages"),
    el("p", { class: "muted", text: `Budget cap: ${cap}` }),
    el("ul", { class: "list" }, items),
  ];
}

// --- Evidence_Pack sources (R1.4) -------------------------------------------

/**
 * Render every cited Source_Card from an evidence-pack view-model.
 * @param {{ sources: Array, count: number, summary: string, degraded: boolean }} view
 */
export function renderEvidence(view) {
  const nodes = [sectionTitle(`Evidence (${view.count} sources)`)];
  if (view.summary) nodes.push(el("p", { class: "muted", text: view.summary }));
  if (view.count === 0) {
    nodes.push(el("p", { class: "muted", text: "No sources yet." }));
    return nodes;
  }
  const items = view.sources.map((src) =>
    el("li", { class: "list__item" }, [
      src.citationUrl
        ? el("a", { text: src.title, attrs: { href: src.citationUrl, target: "_blank", rel: "noopener noreferrer" } })
        : el("span", { text: src.title }),
      el("span", { class: "tag", text: src.platform || src.evidenceLevel || "source" }),
    ]),
  );
  nodes.push(el("ul", { class: "list" }, items));
  return nodes;
}

// --- AgenticOs_Document shot-plan nodes (R1.5) ------------------------------------

/**
 * Render exactly one visual node per planned shot from a shot-plan view-model.
 * @param {{ nodes: Array, shotCount: number, fallbackSubstituted: boolean }} view
 */
export function renderShotPlan(view) {
  const nodes = [sectionTitle(`Shot plan (${view.shotCount} shots)`)];
  if (view.fallbackSubstituted) {
    nodes.push(el("p", { class: "muted", text: "Fallback shot-plan substituted." }));
  }
  if (view.shotCount === 0) {
    nodes.push(el("p", { class: "muted", text: "No shot-plan yet." }));
    return nodes;
  }
  const items = view.nodes.map((node) =>
    el("li", { class: "list__item" }, [
      el("span", {}, [
        el("strong", { text: node.label }),
        el("span", { class: "muted", text: `  · ${node.type}` }),
      ]),
      node.status ? el("span", { class: "tag", text: node.status }) : "",
    ]),
  );
  nodes.push(el("ul", { class: "list" }, items));
  return nodes;
}

// --- Approval prompts (R1.6, R13.1) -----------------------------------------

/**
 * Render one approval prompt per pending gate from an approval-prompt
 * view-model. Each prompt wires Approve/Reject buttons to `onDecision`.
 * @param {{ prompts: Array, pendingCount: number }} view
 * @param {(gateId: string, decision: "approved"|"rejected") => void} onDecision
 */
export function renderApprovals(view, onDecision) {
  const nodes = [sectionTitle(`Approvals (${view.pendingCount} pending)`)];
  if (view.pendingCount === 0) {
    nodes.push(el("p", { class: "muted", text: "No pending approvals." }));
    return nodes;
  }
  for (const prompt of view.prompts) {
    const approve = el("button", {
      class: "btn btn--primary",
      text: "Approve",
      attrs: { type: "button" },
    });
    const reject = el("button", {
      class: "btn btn--ghost",
      text: "Reject",
      attrs: { type: "button" },
    });
    approve.addEventListener("click", () => onDecision(prompt.gateId, "approved"));
    reject.addEventListener("click", () => onDecision(prompt.gateId, "rejected"));
    nodes.push(
      el("div", { class: "approval" }, [
        el("span", {}, [
          el("strong", { text: prompt.label }),
          el("span", { class: "muted", text: `  · ${prompt.estimatedCostDisplay}` }),
        ]),
        el("div", { class: "approval__actions" }, [approve, reject]),
      ]),
    );
  }
  return nodes;
}

// --- Budget_Meters (R13.4) --------------------------------------------------

/**
 * Render the three Budget_Meters from a run-manifest view-model.
 * @param {{ budgetMeters: object }} view
 */
export function renderBudgetMeters(view) {
  const m = view.budgetMeters;
  const meter = (label, value) =>
    el("div", { class: "meter" }, [
      el("span", { class: "meter__label", text: label }),
      el("span", { class: "meter__value", text: value }),
    ]);
  return [
    sectionTitle("Budget meters"),
    el("div", { class: "meters" }, [
      meter("Estimated", m.estimatedCostDisplay),
      meter("Actual", m.actualCostDisplay),
      meter("Provider spend", m.providerSpendDisplay),
    ]),
  ];
}

// --- Checkout entry (R1.7) --------------------------------------------------

/**
 * Render the post-render checkout entry point from a checkout-entry view-model.
 * @param {{ showCheckout: boolean, assetRef: object|null, reason: string, sessionId: string|null }} view
 */
export function renderCheckout(view) {
  const nodes = [sectionTitle("Checkout")];
  if (view.assetRef && view.assetRef.assetUrl) {
    nodes.push(
      el("p", {}, [
        "Rendered asset: ",
        el("a", {
          text: view.assetRef.assetUrl,
          attrs: { href: view.assetRef.assetUrl, target: "_blank", rel: "noopener noreferrer" },
        }),
      ]),
    );
  }
  if (view.showCheckout) {
    const href = view.sessionId ? `#checkout/${view.sessionId}` : "#checkout";
    nodes.push(
      el("a", {
        class: "btn btn--primary checkout__cta",
        text: "Proceed to Stripe checkout",
        attrs: { href },
      }),
    );
  } else {
    nodes.push(el("p", { class: "muted", text: `Checkout unavailable — ${view.reason}.` }));
  }
  return nodes;
}

// --- Embedded agentic-graph canvas (canvas consumed over MCP, not rebuilt) -------

/**
 * Render the embedded agentic-graph canvas from a canvas-embed view-model. When the
 * storyboard canvas is ready and a canvas base is configured, frames the
 * run-scoped doc-view in a sandboxed, no-referrer iframe; otherwise shows why it
 * is not yet available. The iframe is cross-origin (Cloudflare Pages frames
 * airvio.co/agentic-graph) — the doc-view route enforces frame-ancestors + run
 * entitlement server-side.
 * @param {{ available: boolean, src: string, sandbox: string, referrerPolicy: string, title: string, reason: string }} view
 */
export function renderCanvasEmbed(view) {
  const nodes = [sectionTitle("Canvas (live agentic-graph)")];
  if (!view.available) {
    nodes.push(el("p", { class: "muted", text: `Canvas unavailable — ${view.reason}.` }));
    return nodes;
  }
  nodes.push(
    el("iframe", {
      class: "canvas-embed",
      attrs: {
        src: view.src,
        title: view.title,
        sandbox: view.sandbox,
        referrerpolicy: view.referrerPolicy,
        loading: "lazy",
      },
    }),
  );
  nodes.push(
    el("p", {}, [
      "Open in agentic-graph: ",
      el("a", { text: view.src, attrs: { href: view.src, target: "_blank", rel: "noopener noreferrer" } }),
    ]),
  );
  return nodes;
}

// --- Field-level submission errors (R1.2) -----------------------------------

/**
 * Paint field-specific validation errors onto the form. Clears stale errors,
 * then shows the first error per field from the validator's structured output.
 * @param {Array<{ field: string, reason: string }>} errors
 * @param {Document|HTMLElement} [root]
 */
export function paintFieldErrors(errors, root = document) {
  for (const node of root.querySelectorAll("[data-error-for]")) {
    node.textContent = "";
    node.hidden = true;
  }
  for (const { field, reason } of errors) {
    const node = root.querySelector(`[data-error-for="${field}"]`);
    if (node && node.hidden) {
      node.textContent = reason;
      node.hidden = false;
    }
  }
}
