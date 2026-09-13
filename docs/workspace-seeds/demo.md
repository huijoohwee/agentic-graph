---
title: "Catalog prompt preset demos"
schema: agentic-graph-prompt-preset-demos/v1
demo_only: true
source_root: agentic-graph/docs
demos:
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
        text: "Source: docs/workspace-seeds/agentic-graph-physics-playground-demo.md. This demo reuses the canonical interactive scene and its native physics runtime."
  - id: launch-copilot
    title: Launch Copilot (81rv10)
    reply: "Here is an illustrative MVP-to-GTM outline for a solopreneur who spends time chasing client approvals. Treat the buyer, pain and willingness to pay as hypotheses to validate against your own source."
    outputs:
      - title: PRD · Approval inbox
        text: "Buyer hypothesis: independent designers. Pain hypothesis: client feedback is scattered across email and chat. Smallest loop: share a proof, collect one decision, record the approved version. NEW proposed work; no repository implementation is claimed."
      - title: TAD → ADR → MVP
        text: "Proposed design: a versioned proof and decision record with a share link. Decision: begin with one owner and one reviewer. MVP acceptance: the reviewer can approve a version and the designer can retrieve that exact decision."
      - title: GTM experiment
        text: "Interview five designers about their last approval delay; then test a paid pilot with three. Success hypothesis: two complete a real approval loop and agree to pay. Record evidence before expanding scope."
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

This is the authored source for Home's example outputs and FloatingPanel Chat
conversation. The active prompt comes from the shared catalog or the user's
edited preset. Demo creates a local, selection-specific `demo.md` containing
that prompt, the corresponding example reply and these same output cards.

Examples are illustrative, not provider-generated results or execution evidence.
Demo makes no model call. The physics background reuses the canonical Physics
Playground; other selections render the matching example output graph.
