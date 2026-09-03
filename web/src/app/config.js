// Public, build-time Frontend configuration for the agentic-graph Cloudflare Pages
// tier. The build step (`scripts/build.mjs`) REGENERATES this module in the
// output bundle from a PUBLIC build-time env var (VITE_AGENT_API_URL /
// PUBLIC_AGENT_API_URL / AGENT_API_URL). The base URL is therefore NEVER
// hard-coded into the shipped bundle — injected at build time and defaults to
// a relative origin when unset.
//
// STACK BOUNDARY: these are PUBLIC deployment values only — never a model
// provider key and never an auth signing secret. The empty-string default
// means "same origin as the Frontend", so relative `/run` etc. resolve against
// the deployed Cloudflare Pages site.

/** Worker origin (e.g. https://airvio.co/agentic-graph/mcp). Empty = same origin. */
export const AGENT_API_BASE_URL = "";

/** Optional Cloudflare AI Gateway base (public). Empty when not configured. */
export const AI_GATEWAY_BASE_URL = "";

/**
 * agentic-graph control-plane canvas base (public), e.g. https://airvio.co/agentic-graph.
 * The product EMBEDS the run-scoped canvas doc-view from this base rather than
 * reimplementing the renderer. Empty = no canvas embed shown. Injected at build
 * time from a public env var; never a model key or auth secret.
 */
export const CANVAS_BASE_URL = "";
