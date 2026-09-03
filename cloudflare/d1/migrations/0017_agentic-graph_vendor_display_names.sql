-- Forward-only convergence of public marketplace seed labels.
-- Preserve operator-customized names: change only exact historical defaults.
UPDATE marketplace_vendor
SET
  display_name = CASE vendor_id
    WHEN 'agent-flight' THEN 'agentic-graph Flight Agent'
    WHEN 'agent-hotel' THEN 'agentic-graph Hotel Agent'
    WHEN 'agent-experience' THEN 'agentic-graph Experience Agent'
    WHEN 'agent-shopping' THEN 'agentic-graph Shopping Agent'
    ELSE display_name
  END,
  content_hash = CASE vendor_id
    WHEN 'agent-flight' THEN 'sha256:agent-flight-marketplace-v2-agentic-graph'
    WHEN 'agent-hotel' THEN 'sha256:agent-hotel-marketplace-v2-agentic-graph'
    WHEN 'agent-experience' THEN 'sha256:agent-experience-marketplace-v2-agentic-graph'
    WHEN 'agent-shopping' THEN 'sha256:agent-shopping-marketplace-v2-agentic-graph'
    ELSE content_hash
  END,
  updated_at = '2026-09-03T00:00:00.000Z'
WHERE
  (vendor_id = 'agent-flight' AND display_name = 'AgenticGraph Flight Agent')
  OR (vendor_id = 'agent-hotel' AND display_name = 'AgenticGraph Hotel Agent')
  OR (vendor_id = 'agent-experience' AND display_name = 'AgenticGraph Experience Agent')
  OR (vendor_id = 'agent-shopping' AND display_name = 'AgenticGraph Shopping Agent');
