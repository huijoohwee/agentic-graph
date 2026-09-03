---
schema: "agentic-graph-sme-canvas-evidence/v1"
kgSchema: "agentic-os-computing-flow/v1"
kgCanvasSurfaceMode: "2d"
kgCanvasRenderMode: "2d"
kgCanvas2dRenderer: "storyboard"
kgDocumentSemanticMode: "document"
kgFrontmatterModeEnabled: true
kgMultiDimTableModeEnabled: false
kgDocumentStructureBaselineLock: false
runtime_evidence: {"run_id":"agentic_os_bac7a9b1","profile_id":"synthetic-pre-seed","invocation":"/sme-care-agent","runtime_status":"runtime-ready","source_path":"sme-agent/runs/agentic_os_bac7a9b1/canvas-evidence.md","exposure_count":3,"gap_count":3,"unknown_risk_count":3,"protection_count":3,"rationale_count":9,"paid_provider_calls":0,"tokens_used":0,"estimated_cost_usd":0,"deployment":{"status":"dev-only","prodMirrorMutation":false,"cloudflareMutation":false}}
flow:
  direction: LR
  edgeType: smoothstep
  snapToGrid: true
  gridSize: 20
  computed: false
  nodes:
    - id: "agentic_os_079403ff"
      type: "input"
      label: "Source Files"
      status: "complete"
      position: {"x":0,"y":220}
      handles: {"source":["invokes"]}
      properties: {"flow:portTypes":{"in":{},"out":{"invokes":"sme-evidence"}}}
      data: {"kind":"source_files","source_path":"sme-agent/runs/agentic_os_bac7a9b1/canvas-evidence.md"}
    - id: "agentic_os_604cf9d8"
      type: "agent"
      label: "/sme-care-agent"
      status: "complete"
      position: {"x":280,"y":220}
      handles: {"target":["invokes"],"source":["profiles","meters","bounds"]}
      properties: {"flow:portTypes":{"in":{"invokes":"sme-evidence"},"out":{"profiles":"sme-evidence","meters":"sme-evidence","bounds":"sme-evidence"}}}
      data: {"kind":"runtime","invocation":"/sme-care-agent","run_id":"agentic_os_bac7a9b1","status":"completed","skill_variant":"agent.sme","skill_id":"sme.risk.profile"}
    - id: "agentic_os_6e57db13"
      type: "sme-profile"
      label: "professional services · pre_seed"
      status: "complete"
      position: {"x":560,"y":220}
      handles: {"target":["profiles"],"source":["exposes"]}
      properties: {"flow:portTypes":{"in":{"profiles":"sme-evidence"},"out":{"exposes":"sme-evidence"}}}
      data: {"kind":"sme_profile","profile":{"schema":"agentic-graph-sme-profile/v1","profile_id":"synthetic-pre-seed","industry":"professional services","size":2,"growth_stage":"pre_seed","assets":"undeclared","digital_footprint":"undeclared","suppliers":"undeclared","declared_coverage":"undeclared"}}
    - id: "agentic_os_0c2b369e"
      type: "risk-exposure"
      label: "cyber: digital_footprint_insufficient_input"
      status: "complete"
      position: {"x":840,"y":0}
      handles: {"target":["exposes"],"source":["reveals_gap","reveals_unknown"]}
      properties: {"flow:portTypes":{"in":{"exposes":"sme-evidence"},"out":{"reveals_gap":"sme-evidence","reveals_unknown":"sme-evidence"}}}
      data: {"kind":"risk_exposure","coverage_state":"uncovered","coverage_color":"#dc2626","semantic_key":"agentic_os_0c2b369e","domain":"cyber","evidence_type":"digital_footprint_insufficient_input","description":"Digital footprint information is undeclared, so cyber exposure cannot be fully evaluated.","likelihood":"medium","impact":"medium","source_fields":["digital_footprint","industry","growth_stage"],"resolution":"insufficient_input","inference_chain":["digital_footprint is undeclared","cyber dependency remains unknown","evaluate digital exposure"]}
    - id: "agentic_os_f9a7abe2"
      type: "risk-exposure"
      label: "supply_chain: supplier_dependency_insufficient_input"
      status: "complete"
      position: {"x":840,"y":360}
      handles: {"target":["exposes"],"source":["reveals_gap","reveals_unknown"]}
      properties: {"flow:portTypes":{"in":{"exposes":"sme-evidence"},"out":{"reveals_gap":"sme-evidence","reveals_unknown":"sme-evidence"}}}
      data: {"kind":"risk_exposure","coverage_state":"uncovered","coverage_color":"#dc2626","semantic_key":"agentic_os_f9a7abe2","domain":"supply_chain","evidence_type":"supplier_dependency_insufficient_input","description":"Supplier information is undeclared, so dependency and interruption exposure cannot be fully evaluated.","likelihood":"medium","impact":"medium","source_fields":["suppliers","size","growth_stage"],"resolution":"insufficient_input","inference_chain":["suppliers are undeclared","dependency concentration remains unknown","evaluate supply-chain exposure"]}
    - id: "agentic_os_30471764"
      type: "risk-exposure"
      label: "asset_physical: asset_inventory_insufficient_input"
      status: "complete"
      position: {"x":840,"y":720}
      handles: {"target":["exposes"],"source":["reveals_gap","reveals_unknown"]}
      properties: {"flow:portTypes":{"in":{"exposes":"sme-evidence"},"out":{"reveals_gap":"sme-evidence","reveals_unknown":"sme-evidence"}}}
      data: {"kind":"risk_exposure","coverage_state":"uncovered","coverage_color":"#dc2626","semantic_key":"agentic_os_30471764","domain":"asset_physical","evidence_type":"asset_inventory_insufficient_input","description":"Asset information is undeclared, so physical loss and interruption exposure cannot be fully evaluated.","likelihood":"medium","impact":"medium","source_fields":["assets","industry","size"],"resolution":"insufficient_input","inference_chain":["assets are undeclared","physical values and concentrations remain unknown","evaluate asset exposure"]}
    - id: "agentic_os_353f9b7b"
      type: "coverage-gap"
      label: "cyber: uncovered"
      status: "complete"
      position: {"x":1120,"y":0}
      handles: {"target":["reveals_gap"],"source":["guides","explains"]}
      properties: {"flow:portTypes":{"in":{"reveals_gap":"sme-evidence"},"out":{"guides":"sme-evidence","explains":"sme-evidence"}}}
      data: {"kind":"coverage_gap","semantic_key":"agentic_os_353f9b7b","exposure_key":"agentic_os_0c2b369e","domain":"cyber","match_outcome":"uncovered","severity":"medium","assumed_uncovered":true,"rationale_key":"agentic_os_e14f2e4e"}
    - id: "agentic_os_4e7bbde9"
      type: "coverage-gap"
      label: "asset_physical: uncovered"
      status: "complete"
      position: {"x":1120,"y":720}
      handles: {"target":["reveals_gap"],"source":["guides","explains"]}
      properties: {"flow:portTypes":{"in":{"reveals_gap":"sme-evidence"},"out":{"guides":"sme-evidence","explains":"sme-evidence"}}}
      data: {"kind":"coverage_gap","semantic_key":"agentic_os_4e7bbde9","exposure_key":"agentic_os_30471764","domain":"asset_physical","match_outcome":"uncovered","severity":"medium","assumed_uncovered":true,"rationale_key":"agentic_os_11cccd71"}
    - id: "agentic_os_ab9e6bf4"
      type: "coverage-gap"
      label: "supply_chain: uncovered"
      status: "complete"
      position: {"x":1120,"y":360}
      handles: {"target":["reveals_gap"],"source":["guides","explains"]}
      properties: {"flow:portTypes":{"in":{"reveals_gap":"sme-evidence"},"out":{"guides":"sme-evidence","explains":"sme-evidence"}}}
      data: {"kind":"coverage_gap","semantic_key":"agentic_os_ab9e6bf4","exposure_key":"agentic_os_f9a7abe2","domain":"supply_chain","match_outcome":"uncovered","severity":"medium","assumed_uncovered":true,"rationale_key":"agentic_os_0a461e93"}
    - id: "agentic_os_6dbe447f"
      type: "unknown-risk"
      label: "Unknown risk · needs SME input"
      status: "complete"
      position: {"x":1120,"y":140}
      handles: {"target":["reveals_unknown"],"source":["explains"]}
      properties: {"flow:portTypes":{"in":{"reveals_unknown":"sme-evidence"},"out":{"explains":"sme-evidence"}}}
      data: {"kind":"unknown_risk","semantic_key":"agentic_os_6dbe447f","exposure_key":"agentic_os_0c2b369e","trigger_fields":["digital_footprint","industry","growth_stage"],"inference_chain":["digital_footprint is undeclared","cyber dependency remains unknown","evaluate digital exposure"],"rationale_key":"agentic_os_81b64753"}
    - id: "agentic_os_ee20ad80"
      type: "unknown-risk"
      label: "Unknown risk · needs SME input"
      status: "complete"
      position: {"x":1120,"y":500}
      handles: {"target":["reveals_unknown"],"source":["explains"]}
      properties: {"flow:portTypes":{"in":{"reveals_unknown":"sme-evidence"},"out":{"explains":"sme-evidence"}}}
      data: {"kind":"unknown_risk","semantic_key":"agentic_os_ee20ad80","exposure_key":"agentic_os_f9a7abe2","trigger_fields":["suppliers","size","growth_stage"],"inference_chain":["suppliers are undeclared","dependency concentration remains unknown","evaluate supply-chain exposure"],"rationale_key":"agentic_os_20b696a9"}
    - id: "agentic_os_c7ecfce9"
      type: "unknown-risk"
      label: "Unknown risk · needs SME input"
      status: "complete"
      position: {"x":1120,"y":860}
      handles: {"target":["reveals_unknown"],"source":["explains"]}
      properties: {"flow:portTypes":{"in":{"reveals_unknown":"sme-evidence"},"out":{"explains":"sme-evidence"}}}
      data: {"kind":"unknown_risk","semantic_key":"agentic_os_c7ecfce9","exposure_key":"agentic_os_30471764","trigger_fields":["assets","industry","size"],"inference_chain":["assets are undeclared","physical values and concentrations remain unknown","evaluate asset exposure"],"rationale_key":"agentic_os_0f532bc8"}
    - id: "agentic_os_21e99919"
      type: "protection"
      label: "cyber: protection guidance"
      status: "complete"
      position: {"x":1400,"y":0}
      handles: {"target":["guides"],"source":["explains"]}
      properties: {"flow:portTypes":{"in":{"guides":"sme-evidence"},"out":{"explains":"sme-evidence"}}}
      data: {"kind":"protection","semantic_key":"agentic_os_21e99919","gap_key":"agentic_os_353f9b7b","exposure_key":"agentic_os_0c2b369e","severity":"medium","result":"recommendation","guidance":"Review cyber controls, incident response, recovery capability, exclusions, limits, and protection appropriate to the declared digital footprint.","rationale_key":"agentic_os_d084555a"}
    - id: "agentic_os_ebf70fe8"
      type: "protection"
      label: "asset_physical: protection guidance"
      status: "complete"
      position: {"x":1400,"y":720}
      handles: {"target":["guides"],"source":["explains"]}
      properties: {"flow:portTypes":{"in":{"guides":"sme-evidence"},"out":{"explains":"sme-evidence"}}}
      data: {"kind":"protection","semantic_key":"agentic_os_ebf70fe8","gap_key":"agentic_os_4e7bbde9","exposure_key":"agentic_os_30471764","severity":"medium","result":"recommendation","guidance":"Inventory critical assets and review prevention, replacement values, interruption scenarios, exclusions, deductibles, and suitable protection limits.","rationale_key":"agentic_os_30b859fc"}
    - id: "agentic_os_ba4e5461"
      type: "protection"
      label: "supply_chain: protection guidance"
      status: "complete"
      position: {"x":1400,"y":360}
      handles: {"target":["guides"],"source":["explains"]}
      properties: {"flow:portTypes":{"in":{"guides":"sme-evidence"},"out":{"explains":"sme-evidence"}}}
      data: {"kind":"protection","semantic_key":"agentic_os_ba4e5461","gap_key":"agentic_os_ab9e6bf4","exposure_key":"agentic_os_f9a7abe2","severity":"medium","result":"recommendation","guidance":"Review supplier concentration, continuity alternatives, contractual allocation, interruption scenarios, exclusions, and suitable protection limits.","rationale_key":"agentic_os_b63f2e52"}
    - id: "agentic_os_e14f2e4e"
      type: "evidence"
      label: "Rationale 1"
      status: "complete"
      position: {"x":1680,"y":0}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"agentic_os_e14f2e4e","item_key":"agentic_os_353f9b7b","exposure_key":"agentic_os_0c2b369e","cited_fields":["digital_footprint","industry","growth_stage"],"gap_ref":null,"text":"This coverage gap follows from the cyber exposure and the profile fields digital_footprint, industry, growth_stage."}
    - id: "agentic_os_11cccd71"
      type: "evidence"
      label: "Rationale 2"
      status: "complete"
      position: {"x":1680,"y":120}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"agentic_os_11cccd71","item_key":"agentic_os_4e7bbde9","exposure_key":"agentic_os_30471764","cited_fields":["assets","industry","size"],"gap_ref":null,"text":"This coverage gap follows from the asset_physical exposure and the profile fields assets, industry, size."}
    - id: "agentic_os_0a461e93"
      type: "evidence"
      label: "Rationale 3"
      status: "complete"
      position: {"x":1680,"y":240}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"agentic_os_0a461e93","item_key":"agentic_os_ab9e6bf4","exposure_key":"agentic_os_f9a7abe2","cited_fields":["suppliers","size","growth_stage"],"gap_ref":null,"text":"This coverage gap follows from the supply_chain exposure and the profile fields suppliers, size, growth_stage."}
    - id: "agentic_os_81b64753"
      type: "evidence"
      label: "Rationale 4"
      status: "complete"
      position: {"x":1680,"y":360}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"agentic_os_81b64753","item_key":"agentic_os_6dbe447f","exposure_key":"agentic_os_0c2b369e","cited_fields":["digital_footprint","industry","growth_stage"],"gap_ref":null,"text":"This unknown risk follows from the cyber exposure and the profile fields digital_footprint, industry, growth_stage."}
    - id: "agentic_os_20b696a9"
      type: "evidence"
      label: "Rationale 5"
      status: "complete"
      position: {"x":1680,"y":480}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"agentic_os_20b696a9","item_key":"agentic_os_ee20ad80","exposure_key":"agentic_os_f9a7abe2","cited_fields":["suppliers","size","growth_stage"],"gap_ref":null,"text":"This unknown risk follows from the supply_chain exposure and the profile fields suppliers, size, growth_stage."}
    - id: "agentic_os_0f532bc8"
      type: "evidence"
      label: "Rationale 6"
      status: "complete"
      position: {"x":1680,"y":600}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"agentic_os_0f532bc8","item_key":"agentic_os_c7ecfce9","exposure_key":"agentic_os_30471764","cited_fields":["assets","industry","size"],"gap_ref":null,"text":"This unknown risk follows from the asset_physical exposure and the profile fields assets, industry, size."}
    - id: "agentic_os_d084555a"
      type: "evidence"
      label: "Rationale 7"
      status: "complete"
      position: {"x":1680,"y":720}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"agentic_os_d084555a","item_key":"agentic_os_21e99919","exposure_key":"agentic_os_0c2b369e","cited_fields":["digital_footprint","industry","growth_stage"],"gap_ref":"agentic_os_353f9b7b","text":"This medium protection gap follows from the cyber exposure and the declared profile fields digital_footprint, industry, growth_stage."}
    - id: "agentic_os_30b859fc"
      type: "evidence"
      label: "Rationale 8"
      status: "complete"
      position: {"x":1680,"y":840}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"agentic_os_30b859fc","item_key":"agentic_os_ebf70fe8","exposure_key":"agentic_os_30471764","cited_fields":["assets","industry","size"],"gap_ref":"agentic_os_4e7bbde9","text":"This medium protection gap follows from the asset_physical exposure and the declared profile fields assets, industry, size."}
    - id: "agentic_os_b63f2e52"
      type: "evidence"
      label: "Rationale 9"
      status: "complete"
      position: {"x":1680,"y":960}
      handles: {"target":["explains"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"explains":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"rationale","semantic_key":"agentic_os_b63f2e52","item_key":"agentic_os_ba4e5461","exposure_key":"agentic_os_f9a7abe2","cited_fields":["suppliers","size","growth_stage"],"gap_ref":"agentic_os_ab9e6bf4","text":"This medium protection gap follows from the supply_chain exposure and the declared profile fields suppliers, size, growth_stage."}
    - id: "agentic_os_9fb9232f"
      type: "meter"
      label: "$0 · 0 provider calls"
      status: "complete"
      position: {"x":560,"y":1180}
      handles: {"target":["meters"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"meters":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"cost_proof","paid_provider_calls":0,"tokens_used":0,"estimated_cost_usd":0,"cost_logs":[{"model":"local-dry-run","prompt_tokens":0,"completion_tokens":0,"cache_hits":0,"estimated_cost_usd":0,"incomplete":false,"stage":"intake","paid_model_calls":0},{"model":"local-dry-run","prompt_tokens":0,"completion_tokens":0,"cache_hits":0,"estimated_cost_usd":0,"incomplete":false,"stage":"risk_profiler","paid_model_calls":0},{"model":"local-dry-run","prompt_tokens":0,"completion_tokens":0,"cache_hits":0,"estimated_cost_usd":0,"incomplete":false,"stage":"gap_detector","paid_model_calls":0},{"model":"local-dry-run","prompt_tokens":0,"completion_tokens":0,"cache_hits":0,"estimated_cost_usd":0,"incomplete":false,"stage":"unknown_risk_surfacer","paid_model_calls":0},{"model":"local-dry-run","prompt_tokens":0,"completion_tokens":0,"cache_hits":0,"estimated_cost_usd":0,"incomplete":false,"stage":"protection_advisor","paid_model_calls":0},{"model":"local-dry-run","prompt_tokens":0,"completion_tokens":0,"cache_hits":0,"estimated_cost_usd":0,"incomplete":false,"stage":"explainability_engine","paid_model_calls":0},{"model":"local-dry-run","prompt_tokens":0,"completion_tokens":0,"cache_hits":0,"estimated_cost_usd":0,"incomplete":false,"stage":"cost_observer","paid_model_calls":0}]}
    - id: "agentic_os_de321936"
      type: "boundary"
      label: "Dev-only · no deploy mutation"
      status: "complete"
      position: {"x":840,"y":1180}
      handles: {"target":["bounds"],"source":["proves"]}
      properties: {"flow:portTypes":{"in":{"bounds":"sme-evidence"},"out":{"proves":"sme-evidence"}}}
      data: {"kind":"deployment_boundary","status":"dev-only","prodMirrorMutation":false,"cloudflareMutation":false}
    - id: "agentic_os_af8bdc0f"
      type: "output"
      label: "Runtime-ready Canvas evidence"
      status: "complete"
      position: {"x":1960,"y":540}
      handles: {"target":["proves"]}
      properties: {"flow:portTypes":{"in":{"proves":"sme-evidence"},"out":{}}}
      data: {"kind":"canvas_evidence","schema":"agentic-graph-sme-canvas-evidence/v1","run_id":"agentic_os_bac7a9b1","source_path":"sme-agent/runs/agentic_os_bac7a9b1/canvas-evidence.md"}
  edges:
    - id: "agentic_os_3cc54b09"
      source: "agentic_os_079403ff"
      sourceHandle: "invokes"
      target: "agentic_os_604cf9d8"
      targetHandle: "invokes"
      label: "invokes"
      type: "sme-evidence"
    - id: "agentic_os_232d1432"
      source: "agentic_os_604cf9d8"
      sourceHandle: "profiles"
      target: "agentic_os_6e57db13"
      targetHandle: "profiles"
      label: "profiles"
      type: "sme-evidence"
    - id: "agentic_os_db3ad5db"
      source: "agentic_os_6e57db13"
      sourceHandle: "exposes"
      target: "agentic_os_0c2b369e"
      targetHandle: "exposes"
      label: "exposes"
      type: "sme-evidence"
      data: {"coverage_state":"uncovered","color":"#dc2626","label":"uncovered","visual_role":"risk_coverage"}
    - id: "agentic_os_afa7801c"
      source: "agentic_os_6e57db13"
      sourceHandle: "exposes"
      target: "agentic_os_f9a7abe2"
      targetHandle: "exposes"
      label: "exposes"
      type: "sme-evidence"
      data: {"coverage_state":"uncovered","color":"#dc2626","label":"uncovered","visual_role":"risk_coverage"}
    - id: "agentic_os_47e3e2f9"
      source: "agentic_os_6e57db13"
      sourceHandle: "exposes"
      target: "agentic_os_30471764"
      targetHandle: "exposes"
      label: "exposes"
      type: "sme-evidence"
      data: {"coverage_state":"uncovered","color":"#dc2626","label":"uncovered","visual_role":"risk_coverage"}
    - id: "agentic_os_2939728d"
      source: "agentic_os_0c2b369e"
      sourceHandle: "reveals_gap"
      target: "agentic_os_353f9b7b"
      targetHandle: "reveals_gap"
      label: "reveals gap"
      type: "sme-evidence"
    - id: "agentic_os_556b160e"
      source: "agentic_os_30471764"
      sourceHandle: "reveals_gap"
      target: "agentic_os_4e7bbde9"
      targetHandle: "reveals_gap"
      label: "reveals gap"
      type: "sme-evidence"
    - id: "agentic_os_c36573c8"
      source: "agentic_os_f9a7abe2"
      sourceHandle: "reveals_gap"
      target: "agentic_os_ab9e6bf4"
      targetHandle: "reveals_gap"
      label: "reveals gap"
      type: "sme-evidence"
    - id: "agentic_os_b1ce686e"
      source: "agentic_os_0c2b369e"
      sourceHandle: "reveals_unknown"
      target: "agentic_os_6dbe447f"
      targetHandle: "reveals_unknown"
      label: "reveals unknown"
      type: "sme-evidence"
    - id: "agentic_os_2138eb90"
      source: "agentic_os_f9a7abe2"
      sourceHandle: "reveals_unknown"
      target: "agentic_os_ee20ad80"
      targetHandle: "reveals_unknown"
      label: "reveals unknown"
      type: "sme-evidence"
    - id: "agentic_os_a9c378ad"
      source: "agentic_os_30471764"
      sourceHandle: "reveals_unknown"
      target: "agentic_os_c7ecfce9"
      targetHandle: "reveals_unknown"
      label: "reveals unknown"
      type: "sme-evidence"
    - id: "agentic_os_aa3fd882"
      source: "agentic_os_353f9b7b"
      sourceHandle: "guides"
      target: "agentic_os_21e99919"
      targetHandle: "guides"
      label: "guides"
      type: "sme-evidence"
    - id: "agentic_os_1f59ebb9"
      source: "agentic_os_4e7bbde9"
      sourceHandle: "guides"
      target: "agentic_os_ebf70fe8"
      targetHandle: "guides"
      label: "guides"
      type: "sme-evidence"
    - id: "agentic_os_daae46e3"
      source: "agentic_os_ab9e6bf4"
      sourceHandle: "guides"
      target: "agentic_os_ba4e5461"
      targetHandle: "guides"
      label: "guides"
      type: "sme-evidence"
    - id: "agentic_os_97c2b0ca"
      source: "agentic_os_353f9b7b"
      sourceHandle: "explains"
      target: "agentic_os_e14f2e4e"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "agentic_os_65fcb9e8"
      source: "agentic_os_4e7bbde9"
      sourceHandle: "explains"
      target: "agentic_os_11cccd71"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "agentic_os_0dfdd8f7"
      source: "agentic_os_ab9e6bf4"
      sourceHandle: "explains"
      target: "agentic_os_0a461e93"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "agentic_os_7b7e75a9"
      source: "agentic_os_6dbe447f"
      sourceHandle: "explains"
      target: "agentic_os_81b64753"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "agentic_os_3a340299"
      source: "agentic_os_ee20ad80"
      sourceHandle: "explains"
      target: "agentic_os_20b696a9"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "agentic_os_b0937c69"
      source: "agentic_os_c7ecfce9"
      sourceHandle: "explains"
      target: "agentic_os_0f532bc8"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "agentic_os_11785564"
      source: "agentic_os_21e99919"
      sourceHandle: "explains"
      target: "agentic_os_d084555a"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "agentic_os_225cd8a0"
      source: "agentic_os_ebf70fe8"
      sourceHandle: "explains"
      target: "agentic_os_30b859fc"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "agentic_os_4a4cc190"
      source: "agentic_os_ba4e5461"
      sourceHandle: "explains"
      target: "agentic_os_b63f2e52"
      targetHandle: "explains"
      label: "explains"
      type: "sme-evidence"
    - id: "agentic_os_567a3688"
      source: "agentic_os_604cf9d8"
      sourceHandle: "meters"
      target: "agentic_os_9fb9232f"
      targetHandle: "meters"
      label: "meters"
      type: "sme-evidence"
    - id: "agentic_os_267015ef"
      source: "agentic_os_604cf9d8"
      sourceHandle: "bounds"
      target: "agentic_os_de321936"
      targetHandle: "bounds"
      label: "bounds"
      type: "sme-evidence"
    - id: "agentic_os_2d8a59a2"
      source: "agentic_os_e14f2e4e"
      sourceHandle: "proves"
      target: "agentic_os_af8bdc0f"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "agentic_os_5c0ae6e1"
      source: "agentic_os_11cccd71"
      sourceHandle: "proves"
      target: "agentic_os_af8bdc0f"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "agentic_os_a139aee1"
      source: "agentic_os_0a461e93"
      sourceHandle: "proves"
      target: "agentic_os_af8bdc0f"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "agentic_os_de7c51fa"
      source: "agentic_os_81b64753"
      sourceHandle: "proves"
      target: "agentic_os_af8bdc0f"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "agentic_os_3c7e9d9d"
      source: "agentic_os_20b696a9"
      sourceHandle: "proves"
      target: "agentic_os_af8bdc0f"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "agentic_os_703e80b3"
      source: "agentic_os_0f532bc8"
      sourceHandle: "proves"
      target: "agentic_os_af8bdc0f"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "agentic_os_7a273910"
      source: "agentic_os_d084555a"
      sourceHandle: "proves"
      target: "agentic_os_af8bdc0f"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "agentic_os_5e8604a4"
      source: "agentic_os_30b859fc"
      sourceHandle: "proves"
      target: "agentic_os_af8bdc0f"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "agentic_os_e76ceef9"
      source: "agentic_os_b63f2e52"
      sourceHandle: "proves"
      target: "agentic_os_af8bdc0f"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "agentic_os_ac74b7ab"
      source: "agentic_os_9fb9232f"
      sourceHandle: "proves"
      target: "agentic_os_af8bdc0f"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
    - id: "agentic_os_2ae339ab"
      source: "agentic_os_de321936"
      sourceHandle: "proves"
      target: "agentic_os_af8bdc0f"
      targetHandle: "proves"
      label: "proves"
      type: "sme-evidence"
---

# SME Risk & Coverage Runtime Evidence

This Source File is the deterministic Canvas projection of `/sme-care-agent` run `agentic_os_bac7a9b1`. The frontmatter `flow` is the machine-readable graph SSOT.

- Exposures: 3
- Coverage gaps: 3
- Unknown risks: 3
- Protection guidance items: 3
- Traceable rationales: 9
- Runtime cost: $0; 0 tokens; 0 paid provider calls
- Deployment boundary: dev-only; Prod mirror mutation=false; Cloudflare mutation=false

Decision-support guidance only; this is not regulated financial or insurance advice.
