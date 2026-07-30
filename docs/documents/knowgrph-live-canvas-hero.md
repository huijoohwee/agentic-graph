---
schema: kgc-live-canvas-hero/v1
id: knowgrph-live-canvas-hero
version: 1.0.0
status: implemented
created: 2026-07-11
updated: 2026-07-22
author: airvio / joohwee
domain: knowgrph
tags: [agent-ready, live-canvas, hero, discovery]
title: airvio · agentic canvas os
eyebrow: airvio · agentic canvas os
headline:
  - Map intent
  - Run agents
  - Get results
lede: An agentic canvas that lets `/` route work, `#` set meaning, and `@` bind context.
posture:
  - 0 model calls before Run
  - Frontmatter SSOT
  - Approval-gated
enter_href: /knowgrph/
markdown_route: /knowgrph-live-canvas-hero.md
frontmatter_contract: required
---

# Knowgrph

## Live Canvas Hero

Map intent. Run agents. Get results.

An agentic canvas that lets `/` route work, `#` set meaning, and `@` bind context.

## Agentic Grammar

- `/` routes intent
- `#` sets meaning
- `@` binds context

The Home command deck is **Agentic Video Canvas**. Its editable query is the SSOT: `/video-agent` selects the route, `@provider.byteplus|@provider.openai` selects the provider, `@text|@image|@audio|@video` selects outputs, and `#spec.low|#spec.medium|#spec.high` selects the specification. BytePlus and Low are defaults; the visual controls only edit these tokens.

## Actions

- [Enter Knowgrph](/knowgrph/)
- [Read this discovery markdown](/knowgrph-live-canvas-hero.md)
- [Inspect the agent-ready homepage](/)

## Execution Posture

- 0 model calls before Run
- Frontmatter SSOT
- Approval-gated

## Discovery Notes

- The React Live Canvas Hero reads its eyebrow, headline, lede, and posture labels from this document.
- The apex Home hero retains viewport ownership during persisted workspace document bootstrap; the switching-document placeholder remains exclusive to `/knowgrph` workspace routes.
- The default shared background resolves the published Physics Playground path owned by `XR_PHYSICS_DEMO_PUBLISHED_CANONICAL_PATH`; its opaque share token is derived from that active canonical D1 path. The source frontmatter owns XR/3D renderer initialization, so Home does not pin a competing renderer query. MainPanel Settings → Canvas Embed exposes the same default as **Use Physics Playground background**.
- Production JavaScript, CSS, and generated assets are emitted under the exact 40-character Knowgrph source revision. A new protected release therefore uses a new asset namespace and cannot reuse an HTML-poisoned browser cache entry from an older deployment.
- Public discovery should advertise this route as the compact Markdown entry point for agent-first landing context.
