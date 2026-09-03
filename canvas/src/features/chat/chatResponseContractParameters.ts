// ── PARAMETER KEYS ────────────────────────────────────────────────────────────
// Two sets: AGENTIC_OS full-document output vs. standard Chat UI response.
// Both are universal and project-agnostic.
// domain_vars: Tier B {{}} identity resolution map — include only keys known in context.
// runtime + pipeline: REQUIRED for AGENTIC_OS full-document output; omit for generic Chat.
// All remaining keys: conditional — include only when the request warrants them.

export const CHAT_RESPONSE_BASE_PARAMETER_KEYS = [
  'intent',           // parsed goal of the user request
  'domain_vars',      // Tier B {{key}} → resolved value (only keys present in context)
  'context_scope',    // active node / edge / graph selection passed into the response
  'graph_refs',       // @node:id + @edge:src:h→tgt:h sigils referenced in output
  'workspace_refs',   // linked docs, links.self_ref cross-document targets
  'runtime',          // typed inline mappings: entry, exit, sandbox, trace, maxRetry
  'pipeline',         // ordered traversal; all fifteen step dimensions per entry
  'flow_editor',      // computing graph: nodes (typed mappings) + labelled edges
  'structuredContent',// MCP-shaped render payload: widgets, panels, cards, media, nodes, edges
  'table',            // row/column projections: Pipeline, Node Reference, Goals, etc.
  'assumptions',      // stated assumptions from context — never inferred silently
  'open_questions',   // OQ base set; domain extensions appended from OQ-08 onward
] as const

export const CHAT_RESPONSE_BASE_PARAMETER_KEYS_GENERIC = [
  'intent',           // parsed goal of the user request
  'domain_vars',      // Tier B {{key}} → resolved value map
  'context_scope',    // active selection context
  'graph_refs',       // @node:id + @edge: sigils cited in prose
  'workspace_refs',   // linked document references
  'flow_editor',      // node / edge summary (no full typed mappings)
  'structuredContent',// MCP-shaped render payload for shared Canvas materialization
  'table',            // row/column records
  'assumptions',      // stated assumptions
  'open_questions',   // open items that need resolution
] as const
