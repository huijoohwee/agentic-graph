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
    reply: >-
      This example uses [anthropics/commerce-agents](https://github.com/anthropics/commerce-agents)
      as an inspection-only reference, reviewed at commit
      fd4d59224ab96b43c6dc6888207c67b3bd5a24cf. It proposes a listing-review assistant
      for a solo retailer using the merchant agent's read, stage, review and approve flow.
      The shopping agent is a separate customer-facing flow; checkout hands off to the host.
      Demo does not import the repository or generate a proposal. Use the Import URL
      walkthrough below to work from your own acquired graph and source revision.
      Buyer pain, willingness to pay and pilot results remain hypotheses; NEW marks proposed work.
      CID: solo-retailer listing review / reduce correction effort / never invent product facts or bypass approval.
      The example identifier commerce-listing-review is not an executable proposal ID.
      RAO: solo merchant / review a staged correction / accurate listing.
      SVO: merchant approves listing correction. The same chain connects all five documents.
    outputs:
      - title: Import URL · commerce-agents
        text: |-
          1. Open Launch → Import URL, paste https://github.com/anthropics/commerce-agents and choose Import. The repository root URL selects the native Codebase graph importer. A connected Graph host is required; public sessions use the existing host pairing.
          2. Wait for a complete acquisition. Inspect its source remote, commit and snapshot; this example was reviewed at fd4d59224ab96b43c6dc6888207c67b3bd5a24cf. A later import can differ. The Demo cards are examples, not selectable repository evidence.
          3. Select real nodes or explained edges around merchant-agent/core/merchant_agent/backend.py, merchant-agent/core/merchant_agent/gates.py and examples/retail/api/mock_merchant.py in the imported graph.
          4. In FloatingPanel Chat, submit: /launch-copilot outline reference Help a solo retailer review one incomplete product listing, ask for missing facts, stage a correction, approve it and verify the result. Ground PRD, TAD, ADR, MVP and GTM in the selected commerce-agents source; label the business assumptions and all proposed implementation NEW.
          Outline creates five editable native documents without a model call. Use the returned CID to reopen or export those documents. Drafting with a model is a separate explicit Chat action. No import, generated files or live store changes are claimed by this example.
      - title: PRD · Listing review
        text: |-
          Buyer hypothesis: a solo retailer loses time reviewing incomplete listings across a spreadsheet and a store dashboard. Value hypothesis: fewer review minutes per listing without adding unsupported product facts.
          Smallest loop: read one listing → ask for missing facts → stage one correction → merchant reviews and approves → verify the resulting listing. NEW: adapt this loop to one retailer's systems; the reference is not an implementation owned by the retailer.
          Reference: the [retail walkthrough](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/examples/retail/README.md) demonstrates listing corrections and asks for missing material or coverage rather than inventing them. The demo companies and data are fictional.
      - title: TAD · Backend and approval
        text: |-
          Reference: [MerchantBackend](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/merchant-agent/core/merchant_agent/backend.py) defines get_listing, stage_listing_update, get_pending_changes and apply_change. Staging records a proposal; apply_change performs the backend write. [MockRetailMerchant](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/examples/retail/api/mock_merchant.py) supplies the retail example backend.
          Trace those symbols and their explained edges in the imported graph. NEW: implement the retailer's adapter, authenticated merchant session and result readback around the existing interface. Keep credentials server-side and preserve the host approval surface. These adaptations are proposed dependencies, not existing source edges or completed integrations.
      - title: ADR · One merchant workflow
        text: |-
          Decision: begin with one listing correction in the retail merchant flow. Reuse the backend interface and staged-change boundary; defer shopping, campaigns and additional verticals until this loop is validated.
          Reference: [merchant gates](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/merchant-agent/core/merchant_agent/gates.py) and the [safety contract](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/docs/safety.md) distinguish tool provenance, host approval and deployment-owned controls. Keep host approval enabled; a typed chat approval is not a substitute for the default approval card.
          Tradeoff: a narrower pilot provides less automation but makes one review decision observable. NEW: document the retailer's authorization and field-validation rules before connecting a real store. Reference-role inspection does not prove ownership, payment support or production readiness.
      - title: MVP · Verify the review loop
        text: |-
          NEW acceptance plan: use a test catalog with one incomplete listing. Read it, request the missing fact, stage the supplied correction and verify the catalog stays unchanged before approval. Approve through the host surface, read back the correction and confirm a rejected change stays unapplied. An unknown field must remain unknown rather than becoming generated product copy.
          Record the acquired source commit, selected node IDs, explained edge references and actual test results alongside the five generated documents. Keep retailer adapter tasks in the separate NEW overlay. No passing test, provider receipt or live listing write is supplied by Demo.
          Reference checks: [retail merchant backend tests](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/examples/retail/api/tests/test_retail_merchant_backend.py).
      - title: GTM · Retailer pilot
        text: |-
          NEW experiment: interview five solo retailers about their most recent listing correction, current workaround, time spent and cost of an inaccurate description. Invite three to review the same bounded workflow with their own test data.
          Hypotheses to validate: reduce median review time by 30% against each retailer's baseline, introduce no unsupported product facts, and have two retailers agree to a paid pilot at a price discussed in the interviews. These numbers are proposed criteria, not observed outcomes or a pricing recommendation.
          Keep commerce-listing-review as the example's shared CID. Attach interview notes and measured outcomes to the actual generated proposal's CID before expanding the workflow. The reference repository provides technical examples, not customer-demand or revenue evidence.
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

The 81rv10 Launch Copilot example uses `anthropics/commerce-agents` at the pinned
revision cited in its reply and cards. Its Import URL walkthrough and five
document examples are projected into the same local `demo.md`, background and
Chat thread. Importing the URL is a separate explicit native action that acquires
the current repository revision; generating a source-bound outline then uses
the selected real nodes and explained edges. Recheck the acquired source before
using this authored example as a reference. Existing local demo copies retain
their original content; choose Demo again to create the updated example.
