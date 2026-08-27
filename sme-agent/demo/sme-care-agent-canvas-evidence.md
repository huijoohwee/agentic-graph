---
schema: "agenticgraph-sme-canvas-evidence/v1"
kgSchema: "kgc-computing-flow/v1"
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "storyboard"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
runtime_evidence: {"run_id":"kg_b35c9ec7","profile_id":"synthetic-pre-seed","invocation":"/sme-care-agent","runtime_status":"runtime-ready","source_path":"sme-agent/runs/kg_b35c9ec7/canvas-evidence.md","exposure_count":3,"gap_count":3,"unknown_risk_count":3,"protection_count":3,"rationale_count":9,"paid_provider_calls":0,"tokens_used":0,"estimated_cost_usd":0,"deployment":{"status":"dev-only","prodMirrorMutation":false,"cloudflareMutation":false}}
flow:
  direction: LR
  edgeType: smoothstep
  snapToGrid: true
  gridSize: 20
  computed: false
  nodes:
    - id: "kg_9255abf6"
      type: "input"
      label: "Source Files"
      status: "complete"
      position: {"x":0,"y":220}
      handles: {"source":["invokes"]}
      properties: {"flow:portTypes":{"in":{},"out":{"invokes":"sme-evidence"}}}
      data: {"kind":"source_files","source_path":"sme-agent/runs/kg_b35c9ec7/canvas-evidence.md"}
    - id: "kg_ab75cafd"
      type: "agent"
      label: "/sme-care-agent"
      status: "complete"
      position: {"x":280,"y":220}
      handles: {"target":["invokes"],"source":["profiles","meters","bounds"]}
      properties: {"flow:portTypes":{"in":{"invokes":"sme-evidence"},"out":{"profiles":"sme-evidence","meters":"sme-evidence","bounds":"sme-evidence"}}}
      data: {"kind":"runtime","invocation":"/sme-care-agent","run_id":"kg_b35c9ec7","status":"completed","skill_variant":"agent.sme","skill_id":"sme.risk.profile"}
    - id: "kg_6e57db13"
      type: "sme-profile"
      label: "professional services · pre_seed"
      status: "complete"
      position: {"x":560,"y":220}
      handles: {"target":["profiles"],"source":["exposes"]}
      properties: {"flow:portTypes":{"in":{"profiles":"sme-evidence"},"out":{"exposes":"sme-evidence"}}}
      data: {"kind":"sme_profile","profile":{"schema":"agenticgraph-sme-profile/v1","profile_id":"synthetic-pre-seed","industry":"professional services","size":2,"growth_stage":"pre_seed","assets":"undeclared","digital_footprint":"undeclared","suppliers":"undeclared","declared_coverage":"undeclared"}}
    - id: "kg_0c2b369e"
      type: "risk-exposure"
      label: "cyber: digital_footprint_insufficient_input"
      status: "complete"
      position: {"x":840,"y":0}
      handles: {"target":["exposes"],"source":["reveals_gap","reveals_unknown"]}
      properties: {"flow:portTypes":{"in":{"exposes":"sme-evidence"},"out":{"reveals_gap":"sme-evidence","reveals_unknown":"sme-evidence"}}}
      data: {"kind":"risk_exposure","coverage_state":"uncovered","coverage_color":"#dc2626","semantic_key":"kg_0c2b369e","domain":"cyber","evidence_type":"digital_footprint_insufficient_input","description":"Digital footprint information is undeclared, so cyber exposure cannot be fully evaluated.","likelihood":"medium","impact":"medium","source_fields":["digital_footprint","industry","growth_stage"],"resolution":"insufficient_input","inference_chain":["digital_footprint is undeclared","cyber dependency remains unknown","evaluate digital exposure"]}
    - id: "kg_f9a7abe2"
      type: "risk-exposure"
      label: "supply_chain: supplier_dependency_insufficient_input"
      status: "complete"
      position: {"x":840,"y":360}
      handles: {"target":["exposes"],"source":["reveals_gap","reveals_unknown"]}
      properties: {"flow:portTypes":{"in":{"exposes":"sme-evidence"},"out":{"reveals_gap":"sme-evidence","reveals_unknown":"sme-evidence"}}}
      data: {"kind":"risk_exposure","coverage_state":"uncovered","coverage_color":"#dc2626","semantic_key":"kg_f9a7abe2","domain":"supply_chain","evidence_type":"supplier_dependency_insufficient_input","description":"Supplier information is undeclared, so dependency and interruption exposure cannot be fully evaluated.","likelihood":"medium","impact":"medium","source_fields":["suppliers","size","growth_stage"],"resolution":"insufficient_input","inference_chain":["suppliers are undeclared","dependency concentration remains unknown","evaluate supply-chain exposure"]}
    - id: "kg_30471764"
      type: "risk-exposure"
      label: "asset_physical: asset_inventory_insufficient_input"
      status: "complete"
      position: {"x":840,"y":720}
      handles: {"target":["exposes"],"source":["reveals_gap","reveals_unknown"]}
      properties: {"flow:portTypes":{"in":{"exposes":"sme-evidence"},"out":{"reveals_gap":"sme-evidence","reveals_unknown":"sme-evidence"}}}
      data: {"kind":"risk_exposure","coverage_state":"uncovered","coverage_color":"#dc2626","semantic_key":"kg_30471764","domain":"asset_physical","evidence_type":"asset_inventory_insufficient_input","description":"Asset information is undeclared, so physical loss and interruption exposure cannot be fully evaluated.","likelihood":"medium","impact":"medium","source_fields":["assets","industry","size"],"resolution":"insufficient_input","inference_chain":["assets are undeclared","physical values and concentrations remain unknown","evaluate asset exposure"]}
    - id: "kg_3702d8d5"
      type: "coverage-gap"
      label: "cyber: uncovered"
      status: "complete"
      position: {"x":1120,"y":0}
      handles: {"target":["reveals_gap"],"source":["guides","explains"]}
      properties: {"flow:portTypes":{"in":{"reveals_gap":"sme-evidence"},"out":{"guides":"sme-evidence","explains":"sme-evidence"}}}
      data: {"kind":"coverage_gap","semantic_key":"kg_3702d8d5","exposure_key":"kg_0c2b369e","domain":"cyber","match_outcome":"uncovered","severity":"medium","assumed_uncovered":true,"rationale_key":"kg_cc23993a"}
    - id: "kg_b283cbef"
      type: "coverage-gap"
      label: "asset_physical: uncovered"
      status: "complete"
      position: {"x":1120,"y":720}
      handles: {"target":["reveals_gap"],"source":["guides","explains"]}
      properties: {"flow:portTypes":{"in":{"reveals_gap":"sme-evidence"},"out":{"guides":"sme-evidence","explains":"sme-evidence"}}}
      data: {"kind":"coverage_gap","semantic_key":"kg_b283cbef","exposure_key":"kg_30471764","domain":"asset_physical","match_outcome":"uncovered","severity":"medium","assumed_uncovered":true,"rationale_key":"kg_83dc1bb4"}
    - id: "kg_922b243a"
      type: "coverage-gap"
      label: "supply_chain: uncovered"
      status: "complete"
      position: {"x":1120,"y":360}
      handles: {"target":["reveals_gap"],"source":["guides","explains"]}
      properties: {"flow:portTypes":{"in":{"reveals_gap":"sme-evidence"},"out":{"guides":"sme-evidence","explains":"sme-evidence"}}}
      data: {"kind":"coverage_gap","semantic_key":"kg_922b243a","exposure_key":"kg_f9a7abe2","domain":"supply_chain","match_outcome":"uncovered","severity":"medium","assumed_uncovered":true,"rationale_key":"kg_01041f99"}
    - id: "kg_0f361e35"
      type: "unknown-risk"
      label: "Unknown risk · needs SME input"
      status: "complete"
      position: {"x":1120,"y":140}
      handles: {"target":["reveals_unknown"],"source":["explains"]}
      properties: {"flow:portTypes":{"in":{"reveals_unknown":"sme-evidence"},"out":{"explains":"sme-evidence"}}}
      data: {"kind":"unknown_risk","semantic_key":"kg_0f361e35","exposure_key":"kg_0c2b369e","trigger_fields":["digital_footprint","industry","growth_stage"],"inference_chain":["digital_footprint is undeclared","cyber dependency remains unknown","evaluate digital exposure"],"rationale_key":"kg_2cb2c180"}
    - id: "kg_598852d6"
      type: "unknown-risk"
      label: "Unknown risk · needs SME input"
      status: "complete"
      position: {"x":1120,"y":500}
      handles: {"target":["reveals_unknown"],"source":["explains"]}
      properties: {"flow:portTypes":{"in":{"reveals_unknown":"sme-evidence"},"out":{"explains":"sme-evidence"}}}
      data: {"kind":"unknown_risk","semantic_key":"kg_598852d6","exposure_key":"kg_f9a7abe2","trigger_fields":["suppliers","size","growth_stage"],"inference_chain":["suppliers are undeclared","dependency concentration remains unknown","evaluate supply-chain exposure"],"rationale_key":"kg_e82d44f3"}
    - id: "kg_5a6f184b"
      type: "unknown-risk"
      label: "Unknown risk · needs SME input"
      status: "complete"
      position: {"x":1120,"y":860}
      handles: {"target":["reveals_unknown"],"source":["explains"]}
      properties: {"flow:portTypes":{"in":{"reveals_unknown":"sme-evidence"},"out":{"explains":"sme-evidence"}}}
      data: {"kind":"unknown_risk","semantic_key":"kg_5a6f184b","exposure_key":"kg_30471764","trigger_fields":["assets","industry","size"],"inference_chain":["assets are undeclared","physical values and concentrations remain unknown","evaluate asset exposure"],"rationale_key":"kg_dc1fbbfa"}
    - id: "kg_1fdfc083"
      type: "protection"
      label: "cyber: protection guidance"
      status: "complete"
      position: {"x":1400,"y":0}
      handles: {"target":["guides"],"source":["explains"]}
      properties: {"flow:portTypes":{"in":{"guides":"sme-evidence"},"out":{"explains":"sme-evidence"}}}
      data: {"kind":"protection","semantic_key":"kg_1fdfc083","gap_key":"kg_3702d8d5","exposure_key":"kg_0c2b369e","severity":"medium","result":"recommendation","guidance":"Review cyber controls, incident response, recovery capability, exclusions, limits, and protection appropriate to the declared digital footprint.","rationale_key":"kg_9a86fbd2"}
    - id: "kg_af1dce5d"
      type: "protection"
      label: "supply_chain: protection guidance"
      status: "complete"
      position: {"x":1400,"y":360}
      handles: {"target":["guides"],"source":["explains"]}
      properties: {"flow:portTypes":{"in":{"guides":"sme-evidence"},"out":{"explains":"sme-evidence"}}}
      data: {"kind":"protection","semantic_key":"kg_af1dce5d","gap_key":"kg_922b243a","exposure_key":"kg_f9a7abe2","severity":"medium","result":"recommendation","guidance":"Review supplier concentration, continuity alternatives, contractual allocation, interruption scenarios, exclusions, and suitable protection limits.","rationale_key":"kg_955d8d7b"}
    - id: "kg_4114a3a3"
      type: "protection"
      label: "asset_physical: protection guidance"
      status: "complete"
      position: {"x":1400,"y":720}
      handles: {"target":["guides"],"source":["explains"]}
      properties: {"flow:portTypes":{"in":{"guides":"sme-evidence"},"out":{"explains":"sme-evidence"}}}
      data: {"kind":"protection","semantic_key":"kg_4114a3a3","gap_key":"kg_b283cbef","exposure_key":"kg_30471764","severity":"medium","result":"recommendation","guidance":"Inventory critical assets and review prevention, replacement values, interruption scenarios, exclusions, deductibles, and suitable protection limits.","rationale_key":"kg_ff778c19"}
    - id: "kg_cc23993a"
      type: "evidence"
      label: "Rationale 1"
      status: "complete"
      position: {"x":1680,"y":0}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"kg_cc23993a","item_key":"kg_3702d8d5","exposure_key":"kg_0c2b369e","cited_fields":["digital_footprint","industry","growth_stage"],"gap_ref":null,"text":"This coverage gap follows from the cyber exposure and the profile fields digital_footprint, industry, growth_stage."}
    - id: "kg_83dc1bb4"
      type: "evidence"
      label: "Rationale 2"
      status: "complete"
      position: {"x":1680,"y":120}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"kg_83dc1bb4","item_key":"kg_b283cbef","exposure_key":"kg_30471764","cited_fields":["assets","industry","size"],"gap_ref":null,"text":"This coverage gap follows from the asset_physical exposure and the profile fields assets, industry, size."}
    - id: "kg_01041f99"
      type: "evidence"
      label: "Rationale 3"
      status: "complete"
      position: {"x":1680,"y":240}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"kg_01041f99","item_key":"kg_922b243a","exposure_key":"kg_f9a7abe2","cited_fields":["suppliers","size","growth_stage"],"gap_ref":null,"text":"This coverage gap follows from the supply_chain exposure and the profile fields suppliers, size, growth_stage."}
    - id: "kg_2cb2c180"
      type: "evidence"
      label: "Rationale 4"
      status: "complete"
      position: {"x":1680,"y":360}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"kg_2cb2c180","item_key":"kg_0f361e35","exposure_key":"kg_0c2b369e","cited_fields":["digital_footprint","industry","growth_stage"],"gap_ref":null,"text":"This unknown risk follows from the cyber exposure and the profile fields digital_footprint, industry, growth_stage."}
    - id: "kg_e82d44f3"
      type: "evidence"
      label: "Rationale 5"
      status: "complete"
      position: {"x":1680,"y":480}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"kg_e82d44f3","item_key":"kg_598852d6","exposure_key":"kg_f9a7abe2","cited_fields":["suppliers","size","growth_stage"],"gap_ref":null,"text":"This unknown risk follows from the supply_chain exposure and the profile fields suppliers, size, growth_stage."}
    - id: "kg_dc1fbbfa"
      type: "evidence"
      label: "Rationale 6"
      status: "complete"
      position: {"x":1680,"y":600}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"kg_dc1fbbfa","item_key":"kg_5a6f184b","exposure_key":"kg_30471764","cited_fields":["assets","industry","size"],"gap_ref":null,"text":"This unknown risk follows from the asset_physical exposure and the profile fields assets, industry, size."}
    - id: "kg_9a86fbd2"
      type: "evidence"
      label: "Rationale 7"
      status: "complete"
      position: {"x":1680,"y":720}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"kg_9a86fbd2","item_key":"kg_1fdfc083","exposure_key":"kg_0c2b369e","cited_fields":["digital_footprint","industry","growth_stage"],"gap_ref":"kg_3702d8d5","text":"This medium protection gap follows from the cyber exposure and the declared profile fields digital_footprint, industry, growth_stage."}
    - id: "kg_955d8d7b"
      type: "evidence"
      label: "Rationale 8"
      status: "complete"
      position: {"x":1680,"y":840}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"kg_955d8d7b","item_key":"kg_af1dce5d","exposure_key":"kg_f9a7abe2","cited_fields":["suppliers","size","growth_stage"],"gap_ref":"kg_922b243a","text":"This medium protection gap follows from the supply_chain exposure and the declared profile fields suppliers, size, growth_stage."}
    - id: "kg_ff778c19"
      type: "evidence"
      label: "Rationale 9"
      status: "complete"
      position: {"x":1680,"y":960}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"kg_ff778c19","item_key":"kg_4114a3a3","exposure_key":"kg_30471764","cited_fields":["assets","industry","size"],"gap_ref":"kg_b283cbef","text":"This medium protection gap follows from the asset_physical exposure and the declared profile fields assets, industry, size."}
    - id: "kg_cc8e63e6"
      type: "meter"
      label: "$0 · 0 provider calls"
      status: "complete"
      position: {"x":560,"y":1180}
      handles: {"target":["meters"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"meters":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"cost_proof","paid_provider_calls":0,"tokens_used":0,"estimated_cost_usd":0,"cost_logs":[{"model":"local-dry-run","prompt_tokens":0,"completion_tokens":0,"cache_hits":0,"estimated_cost_usd":0,"incomplete":false,"stage":"intake","paid_model_calls":0},{"model":"local-dry-run","prompt_tokens":0,"completion_tokens":0,"cache_hits":0,"estimated_cost_usd":0,"incomplete":false,"stage":"risk_profiler","paid_model_calls":0},{"model":"local-dry-run","prompt_tokens":0,"completion_tokens":0,"cache_hits":0,"estimated_cost_usd":0,"incomplete":false,"stage":"gap_detector","paid_model_calls":0},{"model":"local-dry-run","prompt_tokens":0,"completion_tokens":0,"cache_hits":0,"estimated_cost_usd":0,"incomplete":false,"stage":"unknown_risk_surfacer","paid_model_calls":0},{"model":"local-dry-run","prompt_tokens":0,"completion_tokens":0,"cache_hits":0,"estimated_cost_usd":0,"incomplete":false,"stage":"protection_advisor","paid_model_calls":0},{"model":"local-dry-run","prompt_tokens":0,"completion_tokens":0,"cache_hits":0,"estimated_cost_usd":0,"incomplete":false,"stage":"explainability_engine","paid_model_calls":0},{"model":"local-dry-run","prompt_tokens":0,"completion_tokens":0,"cache_hits":0,"estimated_cost_usd":0,"incomplete":false,"stage":"cost_observer","paid_model_calls":0}]}
    - id: "kg_d3fc55a7"
      type: "boundary"
      label: "Dev-only · no deploy mutation"
      status: "complete"
      position: {"x":840,"y":1180}
      handles: {"target":["bounds"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"bounds":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"deployment_boundary","status":"dev-only","prodMirrorMutation":false,"cloudflareMutation":false}
    - id: "kg_8a442886"
      type: "output"
      label: "Runtime-ready Canvas evidence"
      status: "complete"
      position: {"x":1960,"y":540}
      handles: {"target":["proves"]}
      properties: {"flow:portTypes":{"in":{"proves":"sme-evidence"},"out":{}}}
      data: {"kind":"canvas_evidence","schema":"agenticgraph-sme-canvas-evidence/v1","run_id":"kg_b35c9ec7","source_path":"sme-agent/runs/kg_b35c9ec7/canvas-evidence.md"}
  edges:
    - id: "kg_40f0bb5b"
      source: "kg_9255abf6"
      sourceHandle: "invokes"
      target: "kg_ab75cafd"
      targetHandle: "invokes"
      label: "invokes"
      type: "sme-evidence"
    - id: "kg_c102f2fb"
      source: "kg_ab75cafd"
      sourceHandle: "profiles"
      target: "kg_6e57db13"
      targetHandle: "profiles"
      label: "profiles"
      type: "sme-evidence"
    - id: "kg_efce79ab"
      source: "kg_6e57db13"
      sourceHandle: "exposes"
      target: "kg_0c2b369e"
      targetHandle: "exposes"
      label: "exposes"
      type: "sme-evidence"
      data: {"coverage_state":"uncovered","color":"#dc2626","label":"uncovered","visual_role":"risk_coverage"}
    - id: "kg_7a2611ec"
      source: "kg_6e57db13"
      sourceHandle: "exposes"
      target: "kg_f9a7abe2"
      targetHandle: "exposes"
      label: "exposes"
      type: "sme-evidence"
      data: {"coverage_state":"uncovered","color":"#dc2626","label":"uncovered","visual_role":"risk_coverage"}
    - id: "kg_bddf1a29"
      source: "kg_6e57db13"
      sourceHandle: "exposes"
      target: "kg_30471764"
      targetHandle: "exposes"
      label: "exposes"
      type: "sme-evidence"
      data: {"coverage_state":"uncovered","color":"#dc2626","label":"uncovered","visual_role":"risk_coverage"}
    - id: "kg_3016854d"
      source: "kg_0c2b369e"
      sourceHandle: "reveals_gap"
      target: "kg_3702d8d5"
      targetHandle: "reveals_gap"
      label: "reveals gap"
      type: "sme-evidence"
    - id: "kg_9aa88a17"
      source: "kg_30471764"
      sourceHandle: "reveals_gap"
      target: "kg_b283cbef"
      targetHandle: "reveals_gap"
      label: "reveals gap"
      type: "sme-evidence"
    - id: "kg_df316222"
      source: "kg_f9a7abe2"
      sourceHandle: "reveals_gap"
      target: "kg_922b243a"
      targetHandle: "reveals_gap"
      label: "reveals gap"
      type: "sme-evidence"
    - id: "kg_36de2a15"
      source: "kg_0c2b369e"
      sourceHandle: "reveals_unknown"
      target: "kg_0f361e35"
      targetHandle: "reveals_unknown"
      label: "reveals unknown"
      type: "sme-evidence"
    - id: "kg_0a396622"
      source: "kg_f9a7abe2"
      sourceHandle: "reveals_unknown"
      target: "kg_598852d6"
      targetHandle: "reveals_unknown"
      label: "reveals unknown"
      type: "sme-evidence"
    - id: "kg_9e576f1f"
      source: "kg_30471764"
      sourceHandle: "reveals_unknown"
      target: "kg_5a6f184b"
      targetHandle: "reveals_unknown"
      label: "reveals unknown"
      type: "sme-evidence"
    - id: "kg_40d58a4a"
      source: "kg_3702d8d5"
      sourceHandle: "guides"
      target: "kg_1fdfc083"
      targetHandle: "guides"
      label: "guides"
      type: "sme-evidence"
    - id: "kg_e688bbec"
      source: "kg_922b243a"
      sourceHandle: "guides"
      target: "kg_af1dce5d"
      targetHandle: "guides"
      label: "guides"
      type: "sme-evidence"
    - id: "kg_a5c2e257"
      source: "kg_b283cbef"
      sourceHandle: "guides"
      target: "kg_4114a3a3"
      targetHandle: "guides"
      label: "guides"
      type: "sme-evidence"
    - id: "kg_dc65bbd3"
      source: "kg_3702d8d5"
      sourceHandle: "explains"
      target: "kg_cc23993a"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "kg_3cd951bd"
      source: "kg_b283cbef"
      sourceHandle: "explains"
      target: "kg_83dc1bb4"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "kg_27ea3a08"
      source: "kg_922b243a"
      sourceHandle: "explains"
      target: "kg_01041f99"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "kg_93bbebe1"
      source: "kg_0f361e35"
      sourceHandle: "explains"
      target: "kg_2cb2c180"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "kg_4365f874"
      source: "kg_598852d6"
      sourceHandle: "explains"
      target: "kg_e82d44f3"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "kg_3205d1e9"
      source: "kg_5a6f184b"
      sourceHandle: "explains"
      target: "kg_dc1fbbfa"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "kg_f1d1f126"
      source: "kg_1fdfc083"
      sourceHandle: "explains"
      target: "kg_9a86fbd2"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "kg_33d17b16"
      source: "kg_af1dce5d"
      sourceHandle: "explains"
      target: "kg_955d8d7b"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "kg_33fd773a"
      source: "kg_4114a3a3"
      sourceHandle: "explains"
      target: "kg_ff778c19"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "kg_57765d59"
      source: "kg_ab75cafd"
      sourceHandle: "meters"
      target: "kg_cc8e63e6"
      targetHandle: "meters"
      label: "meters"
      type: "sme-evidence"
    - id: "kg_bc87828f"
      source: "kg_ab75cafd"
      sourceHandle: "bounds"
      target: "kg_d3fc55a7"
      targetHandle: "bounds"
      label: "bounds"
      type: "sme-evidence"
    - id: "kg_bb022378"
      source: "kg_cc23993a"
      sourceHandle: "proves"
      target: "kg_8a442886"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "kg_795fbffe"
      source: "kg_83dc1bb4"
      sourceHandle: "proves"
      target: "kg_8a442886"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "kg_f6792483"
      source: "kg_01041f99"
      sourceHandle: "proves"
      target: "kg_8a442886"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "kg_93dee890"
      source: "kg_2cb2c180"
      sourceHandle: "proves"
      target: "kg_8a442886"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "kg_1ea4e951"
      source: "kg_e82d44f3"
      sourceHandle: "proves"
      target: "kg_8a442886"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "kg_173b889c"
      source: "kg_dc1fbbfa"
      sourceHandle: "proves"
      target: "kg_8a442886"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "kg_4ee7debb"
      source: "kg_9a86fbd2"
      sourceHandle: "proves"
      target: "kg_8a442886"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "kg_8a034d9b"
      source: "kg_955d8d7b"
      sourceHandle: "proves"
      target: "kg_8a442886"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "kg_ec41f612"
      source: "kg_ff778c19"
      sourceHandle: "proves"
      target: "kg_8a442886"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "kg_d5c13536"
      source: "kg_cc8e63e6"
      sourceHandle: "proves"
      target: "kg_8a442886"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "kg_2c99b121"
      source: "kg_d3fc55a7"
      sourceHandle: "proves"
      target: "kg_8a442886"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
---

# SME Risk & Coverage Runtime Evidence

This Source File is the deterministic Canvas projection of `/sme-care-agent` run `kg_b35c9ec7`. The frontmatter `flow` is the machine-readable graph SSOT.

- Exposures: 3
- Coverage gaps: 3
- Unknown risks: 3
- Protection guidance items: 3
- Traceable rationales: 9
- Runtime cost: $0; 0 tokens; 0 paid provider calls
- Deployment boundary: dev-only; Prod mirror mutation=false; Cloudflare mutation=false

Decision-support guidance only; this is not regulated financial or insurance advice.
