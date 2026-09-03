# agentic-graph Agent Ready

[Cloudflare/Is Your Site Agent-Ready?](https://isitagentready.com)

[Cloudflare/Radar](https://radar.cloudflare.com/scan)

## Is Your Site Agent-Ready?

Scan your website to see how ready it is for AI agents. We check multiple emerging standards — from robots.txt and [Markdown negotiation](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/) to [MCP](https://modelcontextprotocol.io/), OAuth, [Agent Skills](https://agentskills.io/home) and agentic commerce.

---

## Discoverability

### robots.txt

```
Goal: Publish /robots.txt with clear crawl rules

Issue: robots.txt not found

Fix: Create /robots.txt at the site root with explicit User-agent directives and allow/disallow rules for key paths. Ensure it is plain text and returns 200.

Skill: https://isitagentready.com/.well-known/agent-skills/robots-txt/SKILL.md

Docs: https://www.rfc-editor.org/rfc/rfc9309
```

### Sitemap

```
Goal: Publish a sitemap and reference it from robots.txt

Issue: sitemap.xml not found

Fix: Generate /sitemap.xml listing canonical URLs, keep it updated on publish, and reference it from /robots.txt.

Skill: https://isitagentready.com/.well-known/agent-skills/sitemap/SKILL.md

Docs: https://www.sitemaps.org/protocol.html
```

### Link Headers

```
Goal: Include Link response headers for agent discovery (RFC 8288)

Issue: No Link headers found on homepage

Fix: Add Link response headers to your homepage that point agents to useful resources. For example: Link: </.well-known/api-catalog>; rel="api-catalog" to advertise your API catalog, or Link: </docs/api>; rel="service-doc" for API documentation. See RFC 8288 for the Link header format and IANA Link Relations for registered relation types.

Skill: https://isitagentready.com/.well-known/agent-skills/link-headers/SKILL.md

Docs: https://www.rfc-editor.org/rfc/rfc8288, https://www.rfc-editor.org/rfc/rfc9727#section-3
```

#### DNS for AI Discovery (DNS-AID)
Goal: Publish DNS for AI Discovery (DNS-AID) records for DNS-based agent discovery

Issue: DNS for AI Discovery (DNS-AID) well-known entrypoint records not found

Fix: Publish DNS for AI Discovery (DNS-AID) records under your domain, for example _index._agents.example.com or _a2a._agents.example.com, using ServiceMode SVCB/HTTPS records with alpn and endpoint parameters. Sign the public discovery zone with DNSSEC so validating resolvers return authenticated data.

Skill: https://isitagentready.com/.well-known/agent-skills/dns-aid/SKILL.md

Docs: https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/, https://www.rfc-editor.org/rfc/rfc9460

---

## Content

### Markdown Negotiation

```
Goal: Return HTML responses as markdown when agents request it

Issue: Site does not support Markdown for Agents

Fix: Enable Markdown for Agents so requests with Accept: text/markdown return a markdown version of your HTML response while HTML stays the default for browsers. Confirm the response uses Content-Type: text/markdown (and x-markdown-tokens if available).

Skill: https://isitagentready.com/.well-known/agent-skills/markdown-negotiation/SKILL.md

Docs: https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/
```

---

## Bot Access Control

### Web Bot Auth request signing

```
Goal: Let your site identify itself as a bot with Web Bot Auth

Note: Web Bot Auth directory returned HTML instead of JSON (informational only)

Fix: Publish a JWKS at /.well-known/http-message-signatures-directory so your site can identify itself when it sends bot or agent requests. Receiving sites can use it to verify those signed requests.

Skill: https://isitagentready.com/.well-known/agent-skills/web-bot-auth/SKILL.md

Docs: https://datatracker.ietf.org/wg/webbotauth/about/, https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/
```

### AI bot rules in robots.txt

```
Goal: Add User-agent rules for AI crawlers like GPTBot, Claude-Web, and others

Issue: Cannot check AI rules without robots.txt

Fix: Add explicit User-agent entries for AI crawlers (GPTBot, OAI-SearchBot, Claude-Web, Google-Extended) with allow/disallow rules that match your policy.

Skill: https://isitagentready.com/.well-known/agent-skills/ai-rules/SKILL.md

Docs: https://www.rfc-editor.org/rfc/rfc9309, https://developers.cloudflare.com/ai-crawl-control/
```

### Content Signals in robots.txt

```
Goal: Declare AI content usage preferences with Content Signals in robots.txt

Issue: Cannot check Content Signals without robots.txt

Fix: Add Content-Signal directives to your robots.txt declaring preferences for ai-train, search, and ai-input. For example:
Content-Signal: ai-train=no, search=yes, ai-input=no

Skill: https://isitagentready.com/.well-known/agent-skills/content-signals/SKILL.md

Docs: https://contentsignals.org/, https://datatracker.ietf.org/doc/draft-romm-aipref-contentsignals/
```

---

## API, Auth, MCP & Skill Discovery

### API Catalog

```
Goal: Publish an API catalog for automated API discovery (RFC 9727)

Issue: API Catalog returned HTML instead of JSON

Fix: Create /.well-known/api-catalog returning application/linkset+json with a "linkset" array. Each entry should include an "anchor" URL for the API and link relations for service-desc (OpenAPI spec), service-doc (documentation), and status (health endpoint). See RFC 9727 Appendix A for examples.

Skill: https://isitagentready.com/.well-known/agent-skills/api-catalog/SKILL.md

Docs: https://www.rfc-editor.org/rfc/rfc9727, https://www.rfc-editor.org/rfc/rfc9264
```

### OAuth / OIDC discovery

```
Goal: Publish OAuth Protected Resource Metadata so agents can discover how to authenticate

Issue: No OAuth Protected Resource Metadata found

Fix: Publish /.well-known/oauth-protected-resource with your resource identifier, authorization_servers (list of OAuth/OIDC issuer URLs that can issue tokens for this resource), and scopes_supported. This tells agents how to obtain access tokens for your protected APIs.

Skill: https://isitagentready.com/.well-known/agent-skills/oauth-protected-resource/SKILL.md

Docs: https://www.rfc-editor.org/rfc/rfc9728
```

### OAuth Protected Resource

```
Goal: Publish OAuth Protected Resource Metadata so agents can discover how to authenticate

Issue: No OAuth Protected Resource Metadata found

Fix: Publish /.well-known/oauth-protected-resource with your resource identifier, authorization_servers (list of OAuth/OIDC issuer URLs that can issue tokens for this resource), and scopes_supported. This tells agents how to obtain access tokens for your protected APIs.

Skill: https://isitagentready.com/.well-known/agent-skills/oauth-protected-resource/SKILL.md

Docs: https://www.rfc-editor.org/rfc/rfc9728
```

### MCP Server Card

```
Goal: Publish an MCP Server Card for agent discovery

Issue: MCP Server Card not found

Fix: Serve an MCP Server Card (SEP-1649) at /.well-known/mcp/server-card.json with serverInfo (name, version), transport endpoint, and capabilities. The schema is being standardized at https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127

Skill: https://isitagentready.com/.well-known/agent-skills/mcp-server-card/SKILL.md

Docs: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127
```

### Agent Skills index

```
Goal: Publish an agent skills discovery index

Issue: Agent Skills index returned HTML instead of JSON

Fix: Publish a skills discovery index at /.well-known/agent-skills/index.json (per the Agent Skills Discovery RFC v0.2.0). Include a $schema field, and a skills array where each entry has name, type, description, url, and a sha256 digest.

Skill: https://isitagentready.com/.well-known/agent-skills/agent-skills/SKILL.md

Docs: https://github.com/cloudflare/agent-skills-discovery-rfc, https://agentskills.io/
```

### Auth.md agent registration

Goal: Publish Auth.md metadata for agent registration

Issue: auth.md returned HTML instead of Markdown

Fix: Serve /auth.md at the site root with agent registration instructions, publish /.well-known/oauth-protected-resource, and include an agent_auth block in /.well-known/oauth-authorization-server with register_uri, supported identity types, credential types, and claim/revocation URLs where applicable.

Skill: https://isitagentready.com/.well-known/agent-skills/auth-md/SKILL.md

Docs: https://workos.com/auth-md, https://github.com/workos/auth.md

### WebMCP

Goal: Support WebMCP to expose site tools to AI agents via the browser

Issue: Could not check WebMCP: Execution context was destroyed, most likely because of a navigation.

Fix: Implement the WebMCP API by calling navigator.modelContext.provideContext() with tool definitions that expose your site's key actions to AI agents. Each tool needs a name, description, inputSchema (JSON Schema), and an execute callback function.

Skill: https://isitagentready.com/.well-known/agent-skills/webmcp/SKILL.md

Docs: https://webmachinelearning.github.io/webmcp/, https://developer.chrome.com/blog/webmcp-epp

---

## Commerce

### x402 Protocol

Goal: Support x402 protocol for agent-native HTTP payments

Status: Implemented with the official `@x402/hono` middleware in the payment Worker. `GET /api`, `GET /api/v1`, and `GET /api/payments/commerce/x402` return HTTP 402 with a middleware-generated `payment-required` header, facilitator-backed `exact` scheme metadata, `eip155:84532`, and the configured `payTo` wallet.

Fix: Add x402 payment middleware to your API routes to enable AI agents to pay for access via HTTP. Use @x402/express, @x402/hono, or @x402/next middleware with a facilitator URL and wallet address. Protected routes will return HTTP 402 with payment requirements that agents can fulfill automatically.

Skill: https://isitagentready.com/.well-known/agent-skills/x402/SKILL.md

Docs: https://x402.org, https://github.com/coinbase/x402, https://docs.x402.org

### MPP (Machine Payment Protocol)

Goal: Support MPP (Machine Payment Protocol) for agent-native HTTP payments

Status: Implemented through root MPP discovery. `GET /openapi.json` publishes payable operations with `x-payment-info` fields for intent, method, amount, and currency.

Fix: Publish an OpenAPI document at /openapi.json with x-payment-info extensions on payable operations. Each operation should declare intent (charge or session), method (tempo, stripe, lightning, card), amount, and currency. Use the MPP SDK (mppx for TypeScript, pympp for Python) with framework middleware for Hono, Express, Next.js, or Elysia to add MPP payment handling.

Skill: https://isitagentready.com/.well-known/agent-skills/mpp/SKILL.md

Docs: https://mpp.dev, https://paymentauth.org/draft-payment-discovery-00.txt

### Universal Commerce Protocol

Goal: Enable content payments via Universal Commerce Protocol

Status: Implemented through root UCP discovery. `GET /.well-known/ucp` returns JSON with the required `ucp` object, UCP version `2026-04-08`, services, capabilities, payment handlers, and endpoints.

Fix: Serve /.well-known/ucp with protocol version, services, capabilities, and endpoints, and ensure spec URLs and schemas are reachable.

Skill: https://isitagentready.com/.well-known/agent-skills/ucp/SKILL.md

Docs: https://ucp.dev/specification/overview/

### ACP (Agentic Commerce Protocol)

Goal: Publish ACP discovery metadata so agents can discover your commerce API

Status: Implemented through root ACP discovery. `GET /.well-known/acp.json` returns JSON with `protocol.name`, `protocol.version`, `protocol.supported_versions`, `api_base_url`, REST transport, and spec-shaped `capabilities.services: ["checkout"]`.

Fix: Serve /.well-known/acp.json at the origin root with protocol.name "acp", protocol.version, api_base_url, supported transports, and capabilities.services so agents can discover your ACP implementation without creating a checkout session first.

Skill: https://isitagentready.com/.well-known/agent-skills/acp/SKILL.md

Docs: https://agenticcommerce.dev, https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/blob/main/rfcs/rfc.discovery.md
