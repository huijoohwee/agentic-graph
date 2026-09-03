import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'

import { analyzeAgenticOsRequest, sanitizeRequestIntent } from './chatAgenticOsRequestProfile'
import {
  buildGuardrailRows,
  buildNamedTermSummary,
  buildOpenQuestions,
  buildSnapshotRows,
  fallbackActor,
  fallbackArtifact,
  fallbackDomain,
  fallbackObjective,
  fallbackOwner,
  fallbackProduct,
  fallbackStatus,
} from './chatHistoryWorkspace.agenticOs.fallbackSections'
import {
  buildFlowContextSummary,
  buildObjectiveSummary,
  buildRequestSummary,
  deriveOutputTargetFileName,
} from './chatHistoryWorkspace.agenticOs.fallbackCommon'
import { buildResponseMarkdown, summariseAssistantSignal } from './chatHistoryWorkspace.agenticOs.responseProjection'
import { buildProblemText, buildSolutionText, buildUseCaseText, buildUserFlowText } from './chatHistoryWorkspace.agenticOs.bodyNarratives'

const buildMonetizationText = (profile: ReturnType<typeof analyzeAgenticOsRequest>): string => {
  const modes = [
    profile.signals.subscriptions ? 'subscriptions' : '',
    profile.signals.payPerUse ? 'pay-per-use' : '',
    profile.signals.conversion ? 'conversion-driven actions' : '',
  ].filter(Boolean)
  const namedTerms = buildNamedTermSummary(profile)
  const actionExamples = [
    profile.signals.subscriptions ? 'ongoing workspace access or premium capability tiers' : '',
    profile.signals.payPerUse ? 'one-off artifact generation, export, or execution events' : '',
    profile.signals.conversion ? 'commerce-like actions that turn intent into checkout' : '',
  ].filter(Boolean)
  return `Monetization requirements stay explicit in the request context, comparing ${modes.join(', ') || 'the stated revenue models'} without hardcoding a pricing decision${namedTerms ? ` while keeping ${namedTerms} visible as integration context` : ''}. Recommended monetized user actions should map to ${actionExamples.join('; ') || 'clear workflow states'}, and the response should show where discovery, trial, checkout, entitlement change, and retained usage occur.`
}

const buildIntegrationText = (profile: ReturnType<typeof analyzeAgenticOsRequest>): string => {
  const stack = [
    profile.signals.openClaw ? 'OpenClaw can cover marketplace listing and demand capture' : '',
    profile.signals.stripe ? 'Stripe can cover checkout, payment confirmation, and post-payment handoff' : '',
    profile.signals.rxdb ? 'RxDB can cover local-first state, draft persistence, and usage context' : '',
    profile.signals.maplibre ? 'MapLibre can cover spatial presentation where maps add user value' : '',
  ].filter(Boolean)
  return `Integration references should stay descriptive and bounded to ${stack.join(', ') || 'the stated request topics'}. Mention each integration only where it materially changes scope, workflow, data flow, monetization, or fulfillment.`
}

const buildWorkflowText = (profile: ReturnType<typeof analyzeAgenticOsRequest>): string => {
  if (profile.signals.creativeScript) {
    return 'S01 captures the creative brief, S02 shapes context around tone, originality constraints, and output format, S03 generates the script package, S04 checks clarity plus trademark-safe distinctiveness, and S05 persists a reusable handoff. In practice the workflow should move from brief -> creative direction -> draft -> guardrail review -> delivery.'
  }
  const marketplaceStep = profile.signals.openClaw
    ? 'package the offer for OpenClaw and related skills marketplace discovery'
    : (profile.signals.marketplace ? 'package the offer for marketplace discovery' : 'package the active request terms')
  return `S01 captures the active request brief for \`{{product}}\`. S02 shapes context around ${marketplaceStep}, named terms, and the requested \`{{artifact}}\`. S03 generates the response package. S04 checks term coverage, assumptions, transitions, and boundaries. S05 persists a reusable handoff. In practice the workflow should move from input -> context -> draft -> review -> delivery instead of stopping at generic prose.`
}

const buildDataFlowText = (profile: ReturnType<typeof analyzeAgenticOsRequest>): string => {
  if (profile.signals.creativeScript) {
    const fileNote = profile.outputFile ? ` plus output target ${profile.outputFile}` : ''
    return `Request text and workspace context become a bounded creative bundle containing tone, pacing, originality constraints${fileNote}. That bundle becomes \`{{artifact}}\` markdown, validation yields either corrective feedback or approved output, and approved output becomes persisted workspace state with creative intent and safety assumptions intact.`
  }
  const transitionPayload = profile.signals.stripe
    ? 'Stripe checkout trigger, payment state, and post-payment entitlement'
    : (profile.signals.payments || profile.signals.conversion ? 'conversion trigger and post-conversion entitlement' : 'handoff state and downstream render targets')
  const stackPayload = [
    profile.signals.rxdb ? 'RxDB-backed local context' : '',
    profile.signals.maplibre ? 'MapLibre-relevant spatial context' : '',
  ].filter(Boolean)
  const namedTerms = buildNamedTermSummary(profile) || 'the active request terms'
  return `Request text and workspace context become a bounded bundle containing ${namedTerms}, ${transitionPayload}${stackPayload.length ? `, and ${stackPayload.join(' plus ')}` : ''}. Inline compute can read connected input handles, emit text output plus optional \`outputSrcDoc\` markup and media URLs, and Rich Media Panels consume those handles directly. Edits to source cards or widgets recompute downstream panels instead of copying stale values.`
}

const buildVariableLinkRows = (profile: ReturnType<typeof analyzeAgenticOsRequest>): Array<[string, string, string, string]> => {
  return [
    ['`{{product}}`', fallbackProduct(profile.product), 'title, PRD, user flow', 'keeps the offer name aligned across sections'],
    ['`{{artifact}}`', fallbackArtifact(profile.artifact), 'title, PRD, TAD, open questions', 'keeps the deliverable shape consistent'],
    ['`{{subject}}`', fallbackActor(profile.subject), 'pipeline actors, PRD, ownership language', 'keeps the primary actor consistent'],
    ['`{{domain}}`', fallbackDomain(profile.domain, profile.topics), 'context framing and flow narrative', 'keeps scope bounded to the active request'],
    ['`{{objective}}`', fallbackObjective(profile.objective), 'generation and validation scope', 'keeps the response target explicit'],
    ['`{{owner}}`', fallbackOwner(profile.owner), 'document meta and open-question ownership', 'keeps follow-up accountability explicit'],
    ['`{{status}}`', fallbackStatus(profile.status), 'meta line and lifecycle state', 'keeps document maturity visible'],
    ['`{{runtime.maxRetry}}`', '3', 'runner protocol and retry arc', 'keeps feedback-loop bounds transparent'],
  ]
}

const buildDocumentLead = (profile: ReturnType<typeof analyzeAgenticOsRequest>): string => {
  const focus = [
    profile.signals.mcp ? 'delivery packaging' : '',
    profile.signals.externalUsers ? 'target users' : '',
    profile.signals.marketplace || profile.signals.openClaw ? 'distribution context' : '',
    profile.signals.subscriptions || profile.signals.payPerUse || profile.signals.conversion ? 'action and monetization logic' : '',
    profile.signals.stripe || profile.signals.payments ? 'checkout transitions' : '',
    profile.signals.rxdb || profile.signals.maplibre ? 'implementation boundaries' : '',
  ].filter(Boolean)
  const namedTerms = buildNamedTermSummary(profile)
  return `> This document packages \`{{artifact}}\` for \`{{subject}}\` around the active request. Shared terms stay aligned through frontmatter, while the body stays focused on ${focus.join(', ') || namedTerms || 'the active request'} instead of generic template narration.`
}

const buildComputingFlowIntro = (requestSummary: string): string => {
  return `The execution contract below supports the current request: ${requestSummary}. The sections that follow keep product, actor, deliverable, and implementation details scoped to what the request actually asks for.`
}

const buildFlowGraphSummary = (profile: ReturnType<typeof analyzeAgenticOsRequest>, artifact: string, domain: string): string => {
  return `The graph below shows how the request moves from capture to delivery for \`${artifact}\`. Context stays bounded to ${buildFlowContextSummary(profile) || domain}, validation can return targeted correction, and accepted output stays ready for reuse across follow-up work.`
}

const buildPipelineIntro = (subject: string, objectiveSummary: string): string => {
  return `The sequence below shows how the active request becomes a stored deliverable for ${subject}. Each step keeps the work bounded to ${objectiveSummary}.`
}

export const buildBody = (args: {
  requestText: string
  assistantText: string
  profile: ReturnType<typeof analyzeAgenticOsRequest>
  fileName: string
  responseSurfaceBlock?: string
}): string => {
  const requestSummary = buildRequestSummary(args.profile) || sanitizeRequestIntent(args.requestText, 260) || 'Current request'
  const assistantSignal = summariseAssistantSignal(args.assistantText)
  const subject = fallbackActor(args.profile.subject)
  const artifact = fallbackArtifact(args.profile.artifact)
  const domain = fallbackDomain(args.profile.domain, args.profile.topics)
  const objectiveSummary = buildObjectiveSummary(args.profile) || fallbackObjective(args.profile.objective)
  const owner = fallbackOwner(args.profile.owner)
  const defaultOutputTarget = deriveOutputTargetFileName(args.fileName)
  const responseMarkdown = buildResponseMarkdown({
    profile: args.profile,
    assistantText: args.assistantText,
  })
  const variableLinkRows = buildVariableLinkRows(args.profile)
  const snapshotRows = buildSnapshotRows({
    profile: args.profile,
    outputTarget: args.profile.outputFile || defaultOutputTarget,
    objectiveSummary,
  })
  const usePlanningScaffold = Boolean(
    args.profile.requestedSections.useCase ||
    args.profile.requestedSections.problem ||
    args.profile.requestedSections.solution ||
    args.profile.requestedSections.userFlow ||
    args.profile.requestedSections.workflow ||
    args.profile.requestedSections.dataFlow ||
    args.profile.requestedSections.monetization ||
    args.profile.requestedSections.integrations
  )
  const openQuestions = buildOpenQuestions({
    artifact,
    topics: args.profile.topics,
    namedTerms: args.profile.namedTerms,
    requestedSections: args.profile.requestedSections,
    signals: args.profile.signals,
    outputFile: args.profile.outputFile,
    defaultOutputTarget,
  })
  const useCaseBlock = args.profile.requestedSections.useCase
    ? [
      '### Use Case',
      buildUseCaseText(args.profile),
      '',
    ].join('\n')
    : ''
  const solutionBlock = args.profile.requestedSections.solution
    ? [
      '### Solution',
      buildSolutionText(args.profile),
      '',
    ].join('\n')
    : ''
  const userFlowBlock = args.profile.requestedSections.userFlow
    ? [
      '### User Flow',
      buildUserFlowText(args.profile),
      '',
    ].join('\n')
    : ''
  const workflowBlock = args.profile.requestedSections.workflow
    ? [
      '### Work Flow',
      buildWorkflowText(args.profile),
      '',
    ].join('\n')
    : ''
  const dataFlowBlock = args.profile.requestedSections.dataFlow
    ? [
      '### Data Flow',
      buildDataFlowText(args.profile),
      '',
    ].join('\n')
    : ''
  const monetizationBlock = args.profile.requestedSections.monetization
    ? [
      '### Monetization Surface',
      buildMonetizationText(args.profile),
      '',
    ].join('\n')
    : ''
  const integrationsBlock = args.profile.requestedSections.integrations
    ? [
      '### Integration Boundaries',
      buildIntegrationText(args.profile),
      '',
    ].join('\n')
    : ''
  return [
    '# {{product}} · AI Pipeline',
    '',
    '## {{doc_type}}',
    '',
    `\`bg#E1F5EE:version {{version}}\` · \`bg#FAEEDA:status ${fallbackStatus(args.profile.status)}\` · owner \`${owner}\` · {{date}}`,
    '',
    buildDocumentLead(args.profile),
    '',
    '## Response',
    '',
    responseMarkdown,
    '',
    '## Computing Flow Definition',
    '',
    '> **Machine source:** YAML frontmatter above the `---` delimiter - self-runnable, graph-complete. [↓ Flow Graph](#flow-graph) [↓ Pipeline](#pipeline) [↓ PRD](#prd--product-requirements) [↓ TAD](#tad--technical-architecture)',
    '',
    buildComputingFlowIntro(requestSummary),
    '',
    '### Variable Link Map',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['Placeholder', 'Current value', 'Used in body as', 'Why it matters'],
      rows: variableLinkRows,
    }),
    '',
    '### Runner Protocol',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['seq', 'Action', 'Input', 'Output', 'Notes'],
      rows: [
        ['`R01`', 'ingest', 'raw file bytes', 'parsed YAML object', 'validate `agentic-os-pipeline/v1`'],
        ['`R02`', 'resolve', 'parsed YAML object', 'resolved variables', 'unresolved Tier B sentinels remain visible'],
        ['`R03`', 'build-graph', 'resolved YAML', 'graph nodes + edges', 'keep `pipeline`, `flow`, `mermaid`, and `graph_meta` aligned'],
        ['`R04`', 'compile-compute', 'graph', 'compiled graph', 'purity guard blocks `fetch`, `document`, `window`'],
        ['`R05`', 'traverse', 'compiled graph', 'executed graph', 'feedback arc retries remain bounded by `{{runtime.maxRetry}}`'],
        ['`R06`', 'render', 'executed graph + body', 'rendered workspace artifact', '`dagre-LR` owns layout'],
      ],
    }),
    '',
    '### Graph Registry',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['Dimension', 'Value'],
      rows: [
        ['Nodes', '5'],
        ['Edges', '5'],
        ['Phases', '3'],
        ['Entry node', '`@node:n-trigger`'],
        ['Exit node', '`@node:n-deliver`'],
        ['Feedback bound', '`{{runtime.maxRetry}}`'],
      ],
    }),
    '',
    ...serializeMarkdownPipeTable({
      columns: ['Phase', 'Seq', 'Nodes'],
      rows: [
        ['P1', 'S01-S02', '`@node:n-trigger` · `@node:n-pack`'],
        ['P2', 'S03-S04', '`@node:n-process` · `@node:n-validate`'],
        ['P3', 'S05', '`@node:n-deliver`'],
      ],
    }),
    '',
    '### Document Links',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['Direction', 'Frontmatter key', 'Target'],
      rows: [
        ['YAML -> body', '`links.body_anchor`', '`#flow-graph`'],
        ['YAML -> body', '`links.yaml_anchor`', '`#computing-flow-definition`'],
        ['Cross-document', '`links.self_ref`', `\`${args.fileName}\``],
        ['Body -> YAML', 'frontmatter delimiter', 'source of truth'],
      ],
    }),
    '',
    '## Flow Graph',
    '',
    '[↑ Computing Flow Definition](#computing-flow-definition)',
    '',
    '```mermaid',
    '{{mermaid}}',
    '```',
    '',
    buildFlowGraphSummary(args.profile, artifact, domain),
    '',
    ...serializeMarkdownPipeTable({
      columns: ['Frontmatter key', 'Resolves in body as', 'Example'],
      rows: [
        ['`$schema`', 'format gate', '`agentic-os-pipeline/v1`'],
        ['`runner`', 'Runner Protocol table', '`R01-R06`'],
        ['`graph_meta`', 'Graph Registry table', '`entry_node`'],
        ['`links`', 'Document Links table', '`self_ref`'],
        ['`mermaid`', 'diagram block', '`{{mermaid}}`'],
        ['`flow.nodes`', 'node references', '`@node:n-process`'],
        ['`flow.edges`', 'edge references', '`@edge:n-validate:correction→n-process:correction`'],
        ['`pipeline`', 'Pipeline table', '`S03`'],
        ['`runtime.*`', 'runtime references', '`{{runtime.maxRetry}}`'],
        ['Tier B keys', 'request-shaped prose', '`{{artifact}}`'],
      ],
    }),
    '',
    '## Pipeline',
    '',
    '[↑ Computing Flow Definition](#computing-flow-definition)',
    '',
    buildPipelineIntro(subject, objectiveSummary),
    '',
    '### Reading Guide',
    '',
    'Read the table left to right: user action explains what the actor does, system event explains what the pipeline does next, and data columns show what moves across edges. Shared nouns such as `{{product}}`, `{{artifact}}`, and `{{subject}}` come from frontmatter so the prose stays aligned even when request details change.',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['seq', '`@node:id`', 'pipeline step', '`bg#E1F5EE:UF` user action', '`bg#E6F1FB:WF` system event', '`bg#EAF3DE:DF` data in', '`bg#EAF3DE:DF` data out', 'edge', 'actor', 'trigger', 'on fail', 'kanban', 'confidence'],
      rows: [
        ['`S01`', '`@node:n-trigger`', '`bg#E1F5EE:intent`', `${subject} submits request scope`, 'capture request intent', '—', 'signal', '`@edge:n-trigger:signal→n-pack:signal`', `\`["${subject}","system"]\``, 'request', '`@flag:waiting`', 'TBD', 'high'],
        ['`S02`', '`@node:n-pack`', '`bg#E1F5EE:context`', '—', 'build bounded context from request and workspace state', 'signal', 'context', '`@edge:n-pack:context→n-process:context`', '`["system"]`', 'signal', 'null', 'TBD', 'high'],
        ['`S03`', '`@node:n-process`', '`bg#FAEEDA:artifacts`', `${subject} reviews streamed output`, `generate ${artifact} from context`, 'context + correction', 'md', '`@edge:n-process:md→n-validate:md`', `\`["${subject}","AI"]\``, 'context', 'null', 'TBD', 'high'],
        ['`S04`', '`@node:n-validate`', '`bg#FAEEDA:review`', 'validation feedback is surfaced', 'check format, variables, and confidence constraints', 'md', 'valid_md or correction', '`@edge:n-validate:correction→n-process:correction`', '`["system"]`', 'md', 'retry', 'TBD', 'high'],
        ['`S05`', '`@node:n-deliver`', '`bg#EAF3DE:handoff`', 'accepted artifact becomes workspace state', 'persist validated markdown and refresh renderer', 'valid_md', 'stored', '`@edge:n-validate:valid_md→n-deliver:valid_md`', '`["system"]`', 'valid_md', 'short-circuit', 'TBD', 'high'],
      ],
    }),
    '',
    '### Retry arc — S04 feedback to S03',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['retry', 'trigger', 'injected payload', 'expected outcome', 'confidence'],
      rows: [
        ['1', 'first validation failure', '`@flag:correction`', 'targeted correction without changing request intent', 'medium'],
        ['2', 'repeated failure', '`@flag:correction`', 'narrower correction against the failed rule', 'medium'],
        ['`{{runtime.maxRetry}}`', 'final failure', '`@flag:correction`', 'stop and surface `@flag:validation-failed`', 'low'],
      ],
    }),
    '',
    '## PRD — Product Requirements',
    '',
    '### Request Snapshot',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['Focus', 'Current reading', 'Why it matters'],
      rows: snapshotRows,
    }),
    '',
    ...(usePlanningScaffold
      ? [
        useCaseBlock.trimEnd(),
        '### Problem',
        '',
        buildProblemText(args.profile),
        '',
        solutionBlock.trimEnd(),
        userFlowBlock.trimEnd(),
        '### Goals',
        '',
        ...serializeMarkdownPipeTable({
          columns: ['id', 'Goal', 'maps to', 'Priority', 'Status'],
          rows: [
            ['`G-01`', 'Preserve one universal pipeline contract across request variants', '`@node:n-trigger`', '`#D85A30:P0`', 'TBD'],
            ['`G-02`', 'Shape context from the current request instead of cloning fixture prose', '`@node:n-pack`', '`#D85A30:P0`', 'TBD'],
            ['`G-03`', 'Generate `{{artifact}}` with request-relevant body content', '`@node:n-process`', '`#D85A30:P0`', 'TBD'],
            ['`G-04`', 'Reject unresolved or malformed markdown before persistence', '`@node:n-validate`', '`#185FA5|bg#E6F1FB:P1`', 'TBD'],
            ['`G-05`', 'Persist only the normalized artifact identity and body', '`@node:n-deliver`', '`#185FA5|bg#E6F1FB:P1`', 'TBD'],
          ],
        }),
        '',
        '### Non-Goals',
        '',
        'This base path does not infer missing business decisions, create alternate mappings, or inject project-specific vocabulary when the request does not provide it. Domain-specific choices should be added only when the request or later context makes them explicit.',
        '',
        '### User Stories',
        '',
        ...serializeMarkdownPipeTable({
          columns: ['id', 'As a...', 'I want...', 'So that...', 'Acceptance criteria'],
          rows: [
            ['`US-01`', `\`${owner}\``, 'one request to map into one valid stored artifact', 'the chat pipeline stays predictable', 'output starts with frontmatter and contains required body sections'],
            ['`US-02`', `\`${owner}\``, `the body to reflect ${requestSummary}`, 'the stored document stays relevant to the query', 'problem and architecture prose mention request-specific scope without fabrication'],
            ['`US-03`', '`reviewer`', 'failed rule feedback to stay bounded and actionable', 'retry loops do not drift or freeze', 'retry arc stops at `{{runtime.maxRetry}}` and surfaces a correction signal'],
            ['`US-04`', '`renderer`', 'frontmatter and body to stay aligned', 'graph, markdown, and storage stay in sync', 'section references and node IDs remain consistent across surfaces'],
          ],
        }),
      ]
      : [
        '### Request Fit',
        '',
        buildProblemText(args.profile),
        '',
        '### Direction',
        '',
        buildSolutionText(args.profile),
        '',
        '### Guardrails',
        '',
        ...serializeMarkdownPipeTable({
          columns: ['Focus', 'Constraint', 'Why it matters'],
          rows: buildGuardrailRows(args.profile),
        }),
      ]),
    '',
    '## TAD — Technical Architecture',
    '',
    workflowBlock.trimEnd(),
    dataFlowBlock.trimEnd(),
    monetizationBlock.trimEnd(),
    integrationsBlock.trimEnd(),
    (args.responseSurfaceBlock || '').trimEnd(),
    assistantSignal
      ? `Recovered partial assistant signal is kept only as context for regeneration: ${assistantSignal}.\n`
      : '',
    '### Compute Inline Mapping Spec',
    '',
    '```yaml',
    'compute:',
    '  key: compute',
    '  type: function',
    '  value: |',
    '    (inputs) => ({',
    '      result: transform(inputs.upstream_handle)',
    '    })',
    '```',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['Field', 'Type', 'Rule'],
      rows: [
        ['`key`', '`string`', 'use `compute`'],
        ['`type`', '`string`', 'use `function`'],
        ['`value`', 'block scalar', 'keep the function body pure'],
      ],
    }),
    '',
    '```js',
    'function parseMappingFn(node) {',
    '  const { type, value } = node.compute;',
    "  if (type !== 'function') return null;",
    '  return new Function(`return (${value.trim()})`)();',
    '}',
    '```',
    '',
    'Validation treats compute blocks as declarative payloads first, then scans them for purity before evaluation. This keeps generation deterministic and avoids hidden runtime side effects.',
    '',
    '### S02 Context Bundle Field Spec',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['Field', 'Source', 'Type', 'Token budget'],
      rows: [
        ['`selected_scope`', 'current workspace selection', '`object`', '—'],
        ['`frontmatter`', 'active markdown frontmatter', '`object`', '—'],
        ['`graph_summary`', 'graph summarizer', '`string`', 'bounded'],
        ['`guideline_digest`', 'markdown guidelines', '`string`', 'bounded'],
        ['`request_text`', 'active user request', '`string`', 'bounded'],
      ],
    }),
    '',
    '### S04 Validation Rules',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['Rule', 'Check', 'Pass condition'],
      rows: [
        ['`V-01`', 'sigil HEX format', 'uppercase 6-digit hex only'],
        ['`V-02`', 'long quote guard', 'no quoted span >= 15 words'],
        ['`V-03`', 'variable linkage', 'body variables resolve from frontmatter or inline declaration'],
        ['`V-04`', 'inline arrays', 'JSON.parse-safe arrays'],
        ['`V-05`', 'compute purity', 'no `fetch`, `document`, `window`'],
        ['`V-06`', 'heading truncation', 'no heading ends with `...`'],
        ['`V-07`', 'confidence enum', 'only `low`, `medium`, `high`'],
      ],
    }),
    '',
    '### S05 Data Schema',
    '',
    '```sql',
    'CREATE TABLE flow_nodes (',
    '  id          TEXT PRIMARY KEY,',
    '  doc_id      TEXT,',
    "  type        TEXT CHECK (type IN ('input','default','output','custom')),",
    '  label       TEXT,',
    '  handles     JSONB,',
    '  data        JSONB,',
    '  compute_fn  TEXT,',
    '  created_at  TIMESTAMPTZ DEFAULT now()',
    ');',
    '',
    'CREATE TABLE flow_edges (',
    '  id              TEXT PRIMARY KEY,',
    '  doc_id          TEXT,',
    '  source          TEXT REFERENCES flow_nodes(id),',
    '  source_handle   TEXT,',
    '  target          TEXT REFERENCES flow_nodes(id),',
    '  target_handle   TEXT,',
    '  label           TEXT,',
    '  animated        BOOLEAN DEFAULT false,',
    '  created_at      TIMESTAMPTZ DEFAULT now()',
    ');',
    '```',
    '',
    '## Node Reference',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['id', 'type', 'phase', 'actor', 'handles (target -> source)', 'applies_rules', 'db_writes', 'retry_arc', 'confidence', 'kanban'],
      rows: [
        ['`@node:n-trigger`', '`input`', 'emit', `\`["${subject}","system"]\``, '— -> [signal]', '`[]`', '`flow_nodes`', '—', 'high', 'TBD'],
        ['`@node:n-pack`', '`default`', 'pack', '`["system"]`', '[signal] -> [context]', '`[]`', '`flow_nodes`', '—', 'high', 'TBD'],
        ['`@node:n-process`', '`default`', 'generate', `\`["${subject}","AI"]\``, '[context, correction] -> [md]', '`["V-05"]`', '`flow_nodes`', 'source', 'high', 'TBD'],
        ['`@node:n-validate`', '`default`', 'validate', '`["system"]`', '[md] -> [valid_md, correction]', '`["V-01","V-02","V-03","V-04","V-05","V-06","V-07"]`', '`flow_nodes`', 'target', 'high', 'TBD'],
        ['`@node:n-deliver`', '`output`', 'deliver', '`["system"]`', '[valid_md] -> —', '`[]`', '`["flow_nodes","flow_edges"]`', '—', 'high', 'TBD'],
      ],
    }),
    '',
    ...serializeMarkdownPipeTable({
      columns: ['Handle', 'Direction', 'Carries', 'PostgreSQL column'],
      rows: [
        ['`signal`', 'trigger -> pack', 'request signal', '—'],
        ['`context`', 'pack -> process', 'bounded context', '—'],
        ['`md`', 'process -> validate', 'generated markdown', '—'],
        ['`valid_md`', 'validate -> deliver', 'accepted markdown', '—'],
        ['`correction`', 'validate -> process', 'failed-rule feedback', '—'],
      ],
    }),
    '',
    '## Open Questions',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['id', 'Question', 'Owner', 'Due', 'Status'],
      rows: openQuestions.map(row => [`\`${row.id}\``, row.question, `\`${owner}\``, 'TBD', row.status]),
    }),
    '',
    '## Customization Guide',
    '',
    'Replace Tier B values with domain-specific values only when the request or the author provides them. The stable node and edge contract remains unchanged, so downstream renderers and storage paths keep one universal graph shape.',
    '',
    '### Frontmatter variable map',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['Variable', 'Base (generic)', 'Example domain'],
      rows: [
        ['`{{product}}`', 'product name', 'Planning Canvas'],
        ['`{{domain}}`', 'operating domain', 'Research Workflow'],
        ['`{{subject}}`', 'primary actor', 'analyst'],
        ['`{{objective}}`', 'request objective', 'deliver an implementation brief'],
        ['`{{artifact}}`', 'requested deliverable', 'PRD + TAD'],
        ['`{{owner}}`', 'owning role', 'platform-ai'],
        ['`{{version}}`', 'version string', '0.1.0'],
        ['`{{status}}`', 'lifecycle label', 'draft'],
      ],
    }),
    '',
    '### Extension checklist',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['Step', 'Action', 'Target section'],
      rows: [
        ['1', 'Resolve Tier B variables when request context is explicit', 'YAML frontmatter'],
        ['2', 'Keep `pipeline`, `flow`, `mermaid`, and `graph_meta` aligned', 'frontmatter graph blocks'],
        ['3', 'Add domain validation rules from `V-08` onward if needed', 'TAD validation rules'],
        ['4', 'Extend open questions after `OQ-04` for domain-specific unknowns', 'Open Questions'],
        ['5', 'Keep streamed prose request-shaped rather than fixture-shaped', 'body sections'],
      ],
    }),
    '',
    '### Syntax quick-reference',
    '',
    ...serializeMarkdownPipeTable({
      columns: ['Convention', 'Symbol', 'Meaning', 'Example'],
      rows: [
        ['Variable reference', '`{{key}}`', 'resolve from frontmatter', '`{{artifact}}`'],
        ['Node reference', '`@node:id`', 'refer to a flow node', '`@node:n-process`'],
        ['Edge reference', '`@edge:src:h→tgt:h`', 'refer to a flow edge', '`@edge:n-validate:correction→n-process:correction`'],
        ['Background sigil', '`bg#HEX:text`', 'semantic highlight', '`bg#E1F5EE:intent`'],
        ['Multi-select array', '`["A","B"]`', 'JSON-safe inline array', '`["system"]`'],
      ],
    }),
  ].filter(Boolean).join('\n')
}

export const buildResponseOnlyBody = (args: {
  assistantText: string
  profile: ReturnType<typeof analyzeAgenticOsRequest>
}): string => {
  const responseMarkdown = buildResponseMarkdown({
    profile: args.profile,
    assistantText: args.assistantText,
  })
  return [
    '# Chat Response',
    '',
    '`{{artifact}}` · {{date}}',
    '',
    '## Response',
    '',
    responseMarkdown,
  ].join('\n').trimEnd()
}
