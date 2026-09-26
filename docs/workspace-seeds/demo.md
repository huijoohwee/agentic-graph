---
title: "Catalog prompt preset demos"
schema: agentic-graph-prompt-preset-demos/v1
demo_only: true
source_root: agentic-graph/docs
demos:
  - id: programmatic-drone-flight
    title: Programmatic Drone Flight
    reply: "Open the editable Python drone example. Choose Run to watch takeoff, hover, a flight to (4, 0) and landing. The example runs locally without a model call."
    outputs:
      - title: Program and simulate
        text: "Demo creates a fresh local Python file and selects the drone lesson. Edit takeoff, hover, fly and land; Run is explicit."
      - title: Share Canvas replay
        text: "After a completed flight, Share canvas embed copies an iframe for the same Graph scene and recorded flight. Replay never connects a receiver."
      - title: GameXR simulated bench
        text: "Send to GameXR opens a review tab with the flight path. Connect the simulated receiver, then Run. No physical aircraft or motors are controlled."
  - id: xr-physics
    title: Physics Playground
    background: xr-physics
    reply: "Explore the shared Physics Playground. The beach ball rolls and bounces; the rocket uses thrust and landing controls. Select a controller in the scene to try it."
    outputs:
      - title: Beach ball
        text: "Roll across the playground, climb a ramp and bounce off obstacles. Reset returns the controller to its starting position."
      - title: Rocket
        text: "Steer, apply the booster and hold the landing control to return to the pad. The controller selector switches between ball and rocket."
      - title: Shared scene
        text: "Source: docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md. This demo reuses the canonical interactive scene and its native physics runtime."
  - id: launch-copilot
    title: Launch Copilot (81rv10)
    repository: https://github.com/anthropics/commerce-agents
    reply: >-
      Demo imports anthropics/commerce-agents through the native repository parser
      and opens its knowledge graph in 2D Renderer: D3. Nodes retain source paths;
      clusters group source directories; edges retain parser explanations.
      The acquired commit, complete snapshot counts and bounded canvas counts
      appear in the local demo.md and its matching Chat thread.
      Select source evidence, then submit the Launch Copilot prompt to produce
      PRD, TAD, ADR, MVP and GTM. The planning examples below are hypotheses.
    outputs:
      - title: PRD · Shopping pilot
        text: >-
          NEW hypothesis: a solo merchant needs product discovery and cart review
          that reduce abandoned shopping sessions. Confirm the target buyer,
          current workaround, willingness to pay and measurable value. Inspect
          shopping-agent/core/shopping_agent/backend.py in the acquired graph.
      - title: TAD · Host checkout boundary
        text: >-
          Inspect StorefrontBackend and checkout_handoff, their source paths and
          explained edges. Declaration containment proves an interface relation;
          it does not prove a completed checkout or payment. Keep retailer
          adapters and host checkout integration in the separate NEW overlay.
      - title: ADR · One bounded loop
        text: >-
          Proposed decision: product discovery → cart review → existing host
          checkout. Compare alternatives against selected repository evidence;
          defer merchant listing changes and additional verticals for this pilot.
          The imported repository is a reference, not an owned implementation.
      - title: MVP · Acceptance evidence
        text: >-
          NEW acceptance plan: use test products, review one cart and verify the
          host handoff. Record actual results, selected source node IDs, explained
          edge IDs, acquisition commit and snapshot digest. No passing test or
          completed purchase is implied by parsing the repository.
      - title: GTM · Paid pilot hypothesis
        text: >-
          Interview the target merchants about their last abandoned shopping
          session, existing workaround and cost. Agree one measurable paid-pilot
          acceptance criterion. Keep demand, pricing and conversion assumptions
          explicitly unverified until customer evidence supports them.
  - id: video-agent
    title: Video Agent
    reply: "This example shows the planned outputs of a multilingual video package. Media generation still requires your script, configured provider and an explicit Run."
    outputs:
      - title: Storyboard
        text: "Example sequence: introduce the customer problem, demonstrate the smallest complete workflow, finish with a clear call to action. Each shot keeps a script reference and duration."
      - title: Audio and subtitles
        text: "Planned variants: Chinese, Cantonese and English narration, with synchronized Chinese/English subtitles. Timing and pronunciation are checked after generation."
      - title: Video timeline
        text: "Planned artifacts: typed text, image, audio and video lanes. No generated media, provider receipt or playable file is supplied by this example."
  - id: image-to-threejs
    title: Image to Three.js
    reply: "The example breaks an image reconstruction into scene geometry, materials and a preview. Import an image and run the native workflow to produce an actual scene."
    outputs:
      - title: Scene outline
        text: "Example subject: a desk lamp. Proposed objects: circular base, hinged stem and conical shade, with a camera framing the complete silhouette."
      - title: Material plan
        text: "Use a matte metal body and a warm emissive bulb. Compare proportions and lighting with the imported reference before accepting the reconstruction."
  - id: image-to-glb
    title: Image to GLB
    reply: "This example outlines a portable 3D asset derived from a reference image. An actual GLB is created only after you import a source and run the workflow."
    outputs:
      - title: Asset specification
        text: "Example subject: a small ceramic vase. Keep a centered origin, consistent scale and a low-complexity mesh suitable for a browser preview."
      - title: Export checklist
        text: "Inspect silhouette, materials and orientation, then validate the exported GLB in the native viewer. This example contains no generated download."
  - id: agentic-graph-probe-tree
    title: agentic-graph Probe-Tree
    reply: "Here is an example of a source-grounded probe tree. Replace the illustrative questions with references to your selected repository nodes."
    outputs:
      - title: Root question
        text: "Can a user complete the selected workflow? Trace the entry point, the state transition and the observable result."
      - title: Evidence branches
        text: "Check source ownership, a successful path and a recoverable failure. Attach exact file or node references to each conclusion; mark missing evidence as unresolved."
  - id: sme-care-agent
    title: SME Care Agent
    reply: "This fictional business example groups the information needed for a care review. It does not assess a real business or recommend a product."
    outputs:
      - title: Business context
        text: "Example: a small design studio depends on two partners and several repeat clients. Confirm obligations, cash flow, continuity arrangements and existing protection."
      - title: Review actions
        text: "Collect current documents, identify information gaps and assign an owner to each follow-up. Record assumptions separately from confirmed facts."
  - id: investment-research-agent
    title: Investment Research Agent
    reply: "This example demonstrates a research structure using hypothetical inputs. It contains no current market data or investment recommendation."
    outputs:
      - title: Research question
        text: "Compare two hypothetical businesses on revenue quality, cash generation and financing needs. Keep source dates and counterarguments next to each claim."
      - title: Evidence gaps
        text: "Request current filings, valuation inputs and risk disclosures before drawing a conclusion. Leave unsupported metrics blank."
  - id: crawler-agent
    title: Crawler Agent
    reply: "This example previews a bounded crawl plan and its output shape. No crawl or external request is performed by Demo."
    outputs:
      - title: Crawl scope
        text: "Start from one selected documentation page, follow only relevant same-site links and preserve each source URL and retrieval time."
      - title: Source inventory
        text: "Example fields: page title, canonical URL, content summary, parent link and status. Report unavailable pages explicitly instead of inventing their contents."
  - id: sme-risk-assessment
    title: SME Risk Assessment
    reply: "This fictional example separates business exposure, available evidence and next actions. Validate each item with the business owner."
    outputs:
      - title: Risk register
        text: "Example exposures: reliance on one key person, delayed receivables and a single critical supplier. Record likelihood and impact only when evidence supports them."
      - title: Mitigation plan
        text: "Assign a backup owner, review payment terms and identify an alternate supplier. Track completion evidence and reassess residual exposure."
  - id: sme-protection-comparison
    title: SME Protection Comparison
    reply: "This example shows how to compare protection documents without assuming coverage or suitability. No actual policy terms are represented."
    outputs:
      - title: Comparison fields
        text: "Collect benefit definitions, exclusions, limits, waiting periods, premium terms and renewal conditions from the actual documents."
      - title: Open questions
        text: "Mark missing terms as unknown. Ask the responsible adviser to resolve differences before the business makes a decision."
  - id: investment-options-comparison
    title: Investment Options Comparison
    reply: "This hypothetical comparison organizes information for a later review. It does not rank real products or supply market returns."
    outputs:
      - title: Comparison dimensions
        text: "Compare objectives, liquidity, fees, concentration, currency exposure and loss scenarios using dated source documents."
      - title: Decision record
        text: "Document constraints and unresolved questions. Keep projected outcomes separate from historical evidence and guarantees."
  - id: investment-plan-assessment
    title: Investment Plan Assessment
    reply: "This example illustrates a plan review with fictional inputs. A real assessment needs verified objectives, resources and product documents."
    outputs:
      - title: Plan inputs
        text: "Record the time horizon, emergency reserve, contribution capacity and tolerance for loss. Leave unknown inputs unresolved."
      - title: Review scenarios
        text: "Examine an interrupted contribution schedule, an early withdrawal and a sustained market decline. Record which assumptions change the plan's feasibility."
---

# Catalog prompt preset demos

This is the Graph-owned source for Home's catalog previews and Demo behavior.
The prompt comes from the shared Canvas OS catalog or the user's edited preset.

Launch Copilot declares its Import URL above. Explicit **Demo** uses the existing
repository acquisition and parser, opens **2D Renderer: D3**, and creates a local
`notes/demos/launch-copilot/<session>/demo.md`. Its frontmatter identifies the
acquired source commit, parser and snapshot, and references the retained native
projection under `notes/codebase-graph/`. Opening that file restores the source
graph with node, source-directory cluster and edge selection. Markdown content
never substitutes for the parsed codebase. The canvas reports its bounded view
separately from full snapshot counts; native queries use the full snapshot.
The matching Chat thread records the actual import and the selected prompt.
Submit that prompt after selecting evidence to create the five editable proposal
documents through the existing Launch Copilot outline action. Demo makes no model
call and does not claim generated proposals, payment or test execution.

A connected Graph host is required for acquisition. Public sessions use the
existing host pairing described in [Launch Copilot](../launch-copilot.md).
Import errors remain visible; there is no silent Markdown or example fallback.

Other presets retain their authored example output cards and local demo
conversations. Physics Playground retains the canonical interactive physics
background. Merely selecting a catalog entry does not import or call a model.
