---
title: "agentic-graph — AI-assisted Programmatic Video Generation"
id: md:agentic-graph-pitchdeck
author: joohwee
institution: "agentic-graph — airvio.co/agentic-graph"
date: "2026-04-28"
index:
  legend:
    nodes:
      problem: "#e74c3c — red — pain point / gap"
      insight: "#f39c12 — amber — reframe / principle"
      product: "#2980b9 — blue — widget / component / layer"
      actor: "#27ae60 — green — user segment / stakeholder"
      output: "#8e44ad — purple — artifact / export"
      business: "#16a085 — teal — revenue / model"
      milestone: "#7f8c8d — grey — roadmap item"
    edges:
      user_flow: "solid blue — actor interacts with product"
      work_flow: "dashed amber — stage produces next stage"
      data_flow: "dotted purple — artifact passes between nodes"
  mermaid: |
    %%{init:{
      "theme":"base",
      "themeVariables":{
        "primaryColor":"#1a1a2e",
        "primaryTextColor":"#f0f0f0",
        "primaryBorderColor":"#444",
        "lineColor":"#aaa",
        "secondaryColor":"#16213e",
        "tertiaryColor":"#0f3460"
      }
    }}%%
    flowchart TD

      %% ── NODE STYLES ──────────────────────────────────────────
      classDef problem  fill:#c0392b,color:#fff,stroke:#922b21
      classDef insight  fill:#d68910,color:#fff,stroke:#9a6301
      classDef product  fill:#1a6fa8,color:#fff,stroke:#154f7a
      classDef actor    fill:#1e8449,color:#fff,stroke:#145a32
      classDef output   fill:#7d3c98,color:#fff,stroke:#5b2c6f
      classDef business fill:#117a65,color:#fff,stroke:#0e6655
      classDef milestone fill:#5d6d7e,color:#fff,stroke:#424f5c

      %% ── SECTION 0 · HOOK ─────────────────────────────────────
      subgraph S0["① Hook"]
        TAGLINE["Write it. See it. Ship it."]:::insight
        CANVAS_IS["Canvas = product · AI = runtime"]:::insight
      end

      %% ── SECTION 1 · PROBLEM ──────────────────────────────────
      subgraph S1["② Problem"]
        P_SLOW["Slow iteration cycles"]:::problem
        P_AUTO["Hard to automate"]:::problem
        P_AUDIT["Hard to audit"]:::problem
        P_SCALE["Hard to scale variants"]:::problem
        P_TABS["3 disconnected tabs"]:::problem
        P_LOSS["Context lost at every handoff"]:::problem
      end

      %% ── SECTION 2 · INSIGHT ──────────────────────────────────
      subgraph S2["③ Insight"]
        I_MD["Markdown = control plane"]:::insight
        I_AI["AI = orchestrator (not sidebar)"]:::insight
        I_WIDGET["Widgets = compiled stages"]:::insight
        I_SSOT["Canvas = single source of truth"]:::insight
        I_DEPS["Explicit data dependencies"]:::insight
      end

      %% ── SECTION 3 · PRODUCT ──────────────────────────────────
      subgraph S3["④ Product — Widget Canvas"]
        subgraph S3A["Core Widgets"]
          W_TEXT["Text Gen widget"]:::product
          W_IMG["Image Gen widget"]:::product
          W_VID["Video Gen widget"]:::product
          W_PANEL["Rich Media Panel"]:::product
        end
        subgraph S3B["Canvas Layers"]
          L_FLOW["Storyboard Widget Canvas"]:::product
          L_2D["2D Graph Canvas (D3)"]:::product
          L_3D["3D Canvas (Three.js)"]:::product
          L_GEO["Geospatial (MapLibre)"]:::product
          L_MD["Markdown Workspace"]:::product
          L_CHAT["Floating Panel Chat"]:::product
        end
      end

      %% ── SECTION 4 · WORKFLOW ─────────────────────────────────
      subgraph S4["⑤ End-to-End Workflow"]
        subgraph S4A["INGEST"]
          WF_SRC["MD / JSON / CSV / PDF / URL"]:::product
          WF_PARSE["Parser + Validator"]:::product
          WF_GD[("GraphData SSOT")]:::output
        end
        subgraph S4B["PRODUCE"]
          WF_SCHEMA["Schema Engine"]:::product
          WF_DERIVE["Deriver"]:::product
        end
        subgraph S4C["REUSE"]
          WF_R2D["2D Renderer"]:::product
          WF_R3D["3D Renderer"]:::product
          WF_RFLOW["Flow Renderer"]:::product
          WF_EXP["Export: JSON/PNG/HTML/MP4"]:::output
        end
      end

      %% ── SECTION 5 · ARCHITECTURE ─────────────────────────────
      subgraph S5["⑥ Architecture"]
        subgraph S5A["Frontend (React + Vite + TS)"]
          A_FC["Storyboard Widget Canvas"]:::product
          A_MC["Markdown Workspace"]:::product
          A_RMP["Rich Media Panel"]:::product
        end
        subgraph S5B["AI Providers"]
          A_CHAT["Text API (BytePlus / OpenAI)"]:::product
          A_IMGAPI["Image API"]:::product
          A_VIDAPI["Video API"]:::product
        end
        subgraph S5C["Parser Engine (Python)"]
          A_KG["NetworkX Knowledge Graph"]:::product
          A_GN["Graph Normalizer"]:::product
        end
      end

      %% ── SECTION 6 · DIFFERENTIATION ─────────────────────────
      subgraph S6["⑦ Differentiation"]
        D_TIMELINE["Timeline editors — manual"]:::problem
        D_PROMPT["Prompt-only tools — no pipeline"]:::problem
        D_AGENTS["Agent chains — opaque"]:::problem
        D_US["agentic-graph — automatable + inspectable"]:::insight
      end

      %% ── SECTION 7 · ACTORS ───────────────────────────────────
      subgraph S7["⑧ Target Users"]
        AC_GROWTH["Growth & marketing teams"]:::actor
        AC_PRODUCT["Product teams"]:::actor
        AC_EDU["Education creators"]:::actor
        AC_COMMS["Internal comms"]:::actor
        AC_DEV["Developers & DevRel"]:::actor
      end

      %% ── SECTION 8 · BUSINESS ─────────────────────────────────
      subgraph S8["⑨ Business Model"]
        B_SUB["Workspace subscription"]:::business
        B_USAGE["Usage-based compute"]:::business
        B_MKT["Template marketplace (future)"]:::business
        B_ENT["Enterprise tier"]:::business
      end

      %% ── SECTION 9 · ROADMAP ──────────────────────────────────
      subgraph S9["⑩ Roadmap"]
        R_NOW["Now — core pipeline + Stripe"]:::milestone
        R_NEXT["Next — batch variants + eval harness"]:::milestone
        R_LATER["Later — collab + plugin system"]:::milestone
      end

      %% ── SECTION 10 · ASK ─────────────────────────────────────
      subgraph S10["⑪ The Ask"]
        ASK_DP["Design partners"]:::actor
        ASK_FB["Domain feedback"]:::actor
        ASK_DATA["Real-world briefs & templates"]:::output
        ASK_DIST["Distribution intros"]:::actor
      end

      %% ── USER FLOW EDGES (solid, actors → product) ────────────
      AC_GROWTH -->|"briefs canvas"| L_MD
      AC_PRODUCT -->|"authors brief"| L_MD
      AC_EDU -->|"authors brief"| L_MD
      AC_DEV -->|"scripts pipeline"| L_FLOW
      ASK_DP -->|"validates"| S3
      linkStyle 0,1,2,3,4 stroke:#2980b9,stroke-width:2px

      %% ── WORK FLOW EDGES (dashed, stage → stage) ──────────────
      S0 -.->|"frames"| S1
      S1 -.->|"motivates"| S2
      S2 -.->|"enables"| S3
      S3 -.->|"executes"| S4
      S4 -.->|"runs on"| S5
      S5 -.->|"beats"| S6
      S6 -.->|"targets"| S7
      S7 -.->|"monetised via"| S8
      S8 -.->|"delivered by"| S9
      S9 -.->|"closes with"| S10
      linkStyle 5,6,7,8,9,10,11,12,13,14 stroke:#d68910,stroke-width:2px,stroke-dasharray:6 3

      %% ── DATA FLOW EDGES (dotted, artifact → artifact) ────────
      W_TEXT -->|"text_out"| W_IMG
      W_IMG -->|"imageUrl"| W_VID
      W_VID -->|"videoUrl"| W_PANEL
      W_TEXT -->|"text_out"| W_PANEL
      W_IMG -->|"imageUrl"| W_PANEL
      WF_SRC -->|"raw source"| WF_PARSE
      WF_PARSE -->|"GraphData"| WF_GD
      WF_GD -->|"schema pass"| WF_SCHEMA
      WF_SCHEMA -->|"derived graph"| WF_DERIVE
      WF_DERIVE -->|"render"| WF_R2D
      WF_DERIVE -->|"render"| WF_R3D
      WF_DERIVE -->|"render"| WF_RFLOW
      WF_R2D & WF_R3D & WF_RFLOW -->|"export"| WF_EXP
      linkStyle 15,16,17,18,19,20,21,22,23,24,25,26,27 stroke:#7d3c98,stroke-width:1.5px,stroke-dasharray:3 3
---

# agentic-graph

**AI-assisted programmatic video generation.** A widget-based canvas where AI-orchestrated Markdown responses become images — and images become video.

> The canvas is the product. The AI is the runtime.

---

## The problem

Video production is still timeline-first, which makes it slow, hard to automate, hard to audit, and hard to scale. Teams want video to behave like software: versioned, testable, composable, diffable.

Today's toolchain gives you three disconnected tabs — a chat window, an image generator, a timeline editor — and every handoff loses context.

---

## The insight

If you can represent a scene plan as structured Markdown, then:

- **AI becomes the orchestrator** — not just a chat sidebar, but the runtime that drives each stage
- **Widgets become compiled stages** — text node produces structured narrative; image node renders keyframes; video node composes clips
- **The canvas becomes a single source of truth** for prompts, intermediate artifacts, final outputs, and provenance

Markdown is the control plane. Media generation is the data plane.

Every connection on the canvas is an explicit data dependency. Change one prompt upstream, and all downstream nodes re-execute automatically.

---

## What we are building

agentic-graph is a widget-based node canvas for AI-assisted media pipelines — where the entire text → image → video workflow lives as an inspectable, executable graph.

| Widget | Role | Output |
|---|---|---|
| Text Generation | AI produces structured scene plans, shot lists, captions from Markdown brief | Structured text |
| Image Generation | Renders keyframes, storyboards, overlays from plan-derived prompts | Image URL |
| Video Generation | Composes images + motion prompts into clips with resolution, duration, audio | Video URL |
| Rich Media Panel | Canonical preview surface for all outputs | Rendered preview |

---

## The workflow (end-to-end)

```mermaid
flowchart LR
  subgraph Ingest ["1. INGEST"]
    MD[Markdown brief] --> P[Parser]
  end
  subgraph Produce ["2. PRODUCE"]
    P --> TG[Text Gen]
    TG --> IG[Image Gen]
    IG --> VG[Video Gen]
  end
  subgraph Reuse ["3. REUSE"]
    TG --> RMP[Rich Media Panel]
    IG --> RMP
    VG --> RMP
    RMP --> EXP[Export: JSON / PNG / HTML / MP4]
  end
```

---

## Architecture

```mermaid
flowchart TB
  subgraph Frontend ["Canvas App (React + Vite + TS)"]
    FC[Storyboard Widget Canvas]
    GC[Graph Canvas]
    MC[Markdown Workspace]
    RMP[Rich Media Panel]
    SP[Floating Panel Chat]
  end
  subgraph AI ["AI Providers"]
    BPChat[Text API]
    BPImg[Image API]
    BPVid[Video API]
  end
  subgraph Backend ["Parser Engine (Python)"]
    KB[Knowledge Graph Builder]
    GP[Graph Data Normalizer]
  end
  FC --> SP --> BPChat
  FC --> BPImg
  FC --> BPVid
  FC --> RMP
  MC --> Frontend
```

Key principle: **Client-First.** The browser handles parsing, rendering, and orchestration — AI APIs called directly from the canvas via serverless endpoints.

---

## System design — INGEST / PRODUCE / REUSE

```mermaid
flowchart LR
  subgraph INGEST
    SRC[MD / JSON / CSV / PDF / HTML / URL] --> LD[Loaders]
    LD --> VAL[Validator]
    VAL --> GD[(GraphData SSOT)]
  end
  subgraph PRODUCE
    GD --> SCH[Schema Engine]
    SCH --> DER[Deriver]
  end
  subgraph REUSE
    DER --> R2D[2D Renderer — D3 SVG]
    DER --> R3D[3D Renderer — Three.js]
    DER --> RFLOW[Storyboard Widget]
    R2D & R3D & RFLOW --> EXP[Exporters]
  end
```

Six design principles: Client-First, Performance, Neutrality, Modularity, Observability, Scalability (10k+ nodes).

---

## Why the canvas matters

The canvas transforms a "creative" into an explicit directed graph of stages — giving media creation software-like guarantees:

- **Reproducibility** — same Markdown + same parameters + same seed = identical artifacts
- **Traceability** — every output carries upstream provenance
- **Composable reuse** — save subgraphs as templates; wire into new pipelines in one click
- **Safe iteration** — diff a single prompt without breaking the project; downstream nodes re-execute
- **Variant branching** — one brief branches into style variants without duplicating work

---

## Differentiation

| Approach | Strength | Weakness |
|---|---|---|
| Timeline editors (Premiere, CapCut) | Fine-grained control | Not automatable; variants = manual labor |
| Prompt-only image tools | Fast single output | No pipeline; poor reproducibility |
| Agent chains (LangGraph, n8n) | Flexible reasoning | Hard to visually inspect |
| **agentic-graph** | **Automatable + Inspectable + Reusable + Visual** | Requires template discipline; early-stage UX |

The canvas is the build log.

---

## Target users

- **Growth & marketing teams** — campaign variants at scale: 10 languages × 3 CTAs × 2 styles = 60 videos from one Markdown brief
- **Product teams** — feature launch explainers, onboarding walkthroughs from PRDs
- **Education creators** — course clips, lesson summaries from structured lesson Markdown
- **Internal comms** — weekly update videos generated from status Markdown
- **Developers & DevRel** — programmatic media as part of CI/CD: docs → diagrams → explainer videos on every merge

Common thread: teams needing many videos with consistent structure and zero-friction iteration.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite 6 |
| State | Zustand (slice-based stores) |
| 2D visualization | D3.js force-directed + ELK/Dagre layouts |
| 3D visualization | Three.js + @react-three/fiber (WebGL) |
| Geospatial | MapLibre GL JS + Turf.js |
| Code editing | Monaco Editor |
| Markdown engine | markdown-it + remark/rehype + Mermaid + KaTeX |
| Local DB | Minimal persisted client cache (offline-first) |
| Backend parsers | Python 3.10+ (NetworkX, RDFLib, DuckDB, NLTK) |
| AI providers | BytePlus OpenArk + OpenAI Responses API |
| Payments | Stripe (subscriptions, usage-based billing) |
| MCP protocol | @modelcontextprotocol/sdk |
| Deployment | Cloudflare Pages (PWA) — airvio.co/agentic-graph |

Shell size: ~248 KB gzip; Monaco, Mermaid, Three.js lazy-loaded on demand.

---

## Business model

- **Workspace subscription** — authoring canvas, collaboration, storage, template library
- **Usage-based compute** — per-image and per-second-of-output pricing with budget caps
- **Template marketplace** (future) — branded subgraph templates sold per pipeline
- **Enterprise tier** — SSO/SAML, audit logs, on-prem/VPC, policy controls

Principle: cost and quality fully predictable with explicit, user-visible parameters.

---

## Roadmap

**Now (shipping)**
- Markdown-to-widget orchestration via frontmatter flow parser
- BytePlus OpenArk integration (chat, image, video)
- Storyboard Widget Canvas with widget registry, port handles, typed envelopes
- Stripe paywall and subscription gating

**Next**
- Scene templates + subgraph library
- Batch variant generation
- Evaluation harness (quality, brand compliance, regression)
- MCP server enhancement for AI-IDE canvas control

**Later**
- Multi-track composition (audio stem, captions, overlays)
- Real-time collaboration (WebSocket + CRDT)
- Plugin system (sandboxed custom widget extensions)

---

## The ask

- **Design partners** — teams generating video content variants weekly frustrated by timeline-tool friction
- **Domain feedback** — brand guidelines, compliance review, localization workflow constraints
- **Real-world data** — briefs, creative specs, existing output templates to encode as Markdown pipelines
- **Distribution intros** — growth teams, product marketing leads, education creators, DevRel communities

If you believe video creation should feel like writing software — declarative, versionable, composable, inspectable — let us build it together.

---

**Live demo**: airvio.co/agentic-graph
**Contact**: joohwee @ airvio.co

> *"Write it. See it. Ship it."*
