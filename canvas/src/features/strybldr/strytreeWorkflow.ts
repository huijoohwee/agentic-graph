import { hashText } from '@/features/parsers/hash'
import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'

type GraphProps = Record<string, JSONValue>

export type StrytreeWorkflowResult = {
  graphData: GraphData
  changed: boolean
  kind: 'success' | 'warning'
  message: string
  createdNodeId?: string
}

const cleanText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim()

const asJson = (value: unknown): JSONValue => value as JSONValue

const readNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const readBoolean = (value: unknown): boolean => value === true || String(value || '').trim().toLowerCase() === 'true'

const readProps = (node: GraphNode | null | undefined): GraphProps => {
  const props = node?.properties
  return props && typeof props === 'object' && !Array.isArray(props) ? props as GraphProps : {}
}

const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const text = cleanText(item)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}

const writeTags = (existing: unknown, add: readonly string[], remove: readonly string[] = []): string[] => {
  const removeSet = new Set(remove.map(item => cleanText(item).toLowerCase()).filter(Boolean))
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of [...readStringArray(existing), ...add]) {
    const text = cleanText(item)
    if (!text) continue
    const key = text.toLowerCase()
    if (removeSet.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}

const edgeId = (source: string, target: string, label: string): string => {
  return `strytree:edge:${hashText(`${source}:${label}:${target}`).slice(0, 12)}`
}

const makeEdge = (source: string, target: string, label: string): GraphEdge => ({
  id: edgeId(source, target, label),
  source,
  target,
  label,
  properties: {
    evidenceKind: asJson('user-edit'),
    confidence: asJson('medium'),
  },
})

const findStoryNode = (nodes: readonly GraphNode[], nodeId: string): GraphNode | null => {
  return nodes.find(node => cleanText(node.id) === nodeId && cleanText(node.type) === 'StorytreeNode') || null
}

const findStoryNodeByStoryNodeId = (nodes: readonly GraphNode[], storyNodeId: string): GraphNode | null => {
  return nodes.find(node => cleanText(node.type) === 'StorytreeNode' && cleanText(readProps(node).strytreeNodeId) === storyNodeId) || null
}

const findSnapshotNode = (nodes: readonly GraphNode[], storyId: string): GraphNode | null => {
  return nodes.find(node => cleanText(node.type) === 'StorytreeSnapshot' && cleanText(readProps(node).strytreeStoryId) === storyId) || null
}

const findCandidateNode = (nodes: readonly GraphNode[], nodeId: string): GraphNode | null => {
  return nodes.find(node => cleanText(node.id) === nodeId && cleanText(node.type) === 'StorytreeCandidate') || null
}

const appendLedgerEvent = (props: GraphProps, event: Record<string, JSONValue>): GraphProps => {
  const current = Array.isArray(props.strytreeLedgerEvents) ? props.strytreeLedgerEvents : []
  return {
    ...props,
    strytreeLedgerEvents: asJson([...current, event]),
  }
}

const cloneGraphNodes = (graphData: GraphData): GraphNode[] => {
  return (Array.isArray(graphData.nodes) ? graphData.nodes : []).map(node => ({
    ...node,
    properties: { ...readProps(node) } as GraphNode['properties'],
  }))
}

const cloneGraphEdges = (graphData: GraphData): GraphEdge[] => {
  return (Array.isArray(graphData.edges) ? graphData.edges : []).map(edge => ({
    ...edge,
    properties: edge.properties && typeof edge.properties === 'object' && !Array.isArray(edge.properties)
      ? { ...edge.properties }
      : edge.properties,
  }))
}

const withGraph = (graphData: GraphData, nodes: GraphNode[], edges?: GraphEdge[]): GraphData => ({
  ...graphData,
  nodes,
  edges: edges || cloneGraphEdges(graphData),
  metadata: {
    ...(graphData.metadata || {}),
    strytreeWorkflowUpdatedAtMs: Date.now(),
  } as GraphData['metadata'],
})

export const toggleStrytreeLikeAction = (graphData: GraphData, nodeId: string): StrytreeWorkflowResult => {
  const nodes = cloneGraphNodes(graphData)
  const target = findStoryNode(nodes, nodeId)
  if (!target) return { graphData, changed: false, kind: 'warning', message: 'Storytree branch is not available.' }
  const props = readProps(target)
  const liked = readBoolean(props.likedByCurrentUser)
  const likes = Math.max(0, readNumber(props.likes, 0) + (liked ? -1 : 1))
  const impressions = Math.max(0, readNumber(props.impressions, 0))
  target.properties = {
    ...props,
    likes: asJson(likes),
    likeRate: asJson(impressions > 0 ? Number(((likes / impressions) * 100).toFixed(1)) : null),
    likedByCurrentUser: asJson(!liked),
    engagementScore: asJson(Number((likes + Math.max(0, readNumber(props.paidUnlocks, 0)) * 3 + Math.max(0, readNumber(props.likeRate, 0))).toFixed(1))),
    tags: asJson(writeTags(props.tags, [liked ? 'like-removed' : 'liked'], [liked ? 'liked' : 'like-removed'])),
  } as GraphNode['properties']
  return {
    graphData: withGraph(graphData, nodes),
    changed: true,
    kind: 'success',
    message: liked ? 'Storytree like removed.' : 'Storytree branch liked.',
  }
}

export const unlockStrytreeNodeAction = (graphData: GraphData, nodeId: string, nowMs = Date.now()): StrytreeWorkflowResult => {
  const nodes = cloneGraphNodes(graphData)
  const target = findStoryNode(nodes, nodeId)
  if (!target) return { graphData, changed: false, kind: 'warning', message: 'Storytree branch is not available.' }
  const props = readProps(target)
  if (readBoolean(props.unlockedByCurrentUser) || cleanText(props.accessState) === 'open') {
    return { graphData, changed: false, kind: 'warning', message: 'Storytree branch is already open.' }
  }
  const storyId = cleanText(props.strytreeStoryId)
  const snapshot = findSnapshotNode(nodes, storyId)
  const snapshotProps = readProps(snapshot)
  const tokenBalance = Math.max(0, readNumber(snapshotProps.tokenBalance, readNumber(props.tokenBalance, 0)))
  const unlockPriceCredits = Math.max(0, readNumber(props.unlockPriceCredits, 0))
  if (unlockPriceCredits > tokenBalance) {
    return { graphData, changed: false, kind: 'warning', message: 'Storytree branch needs more credit tokens before unlock.' }
  }
  const nextBalance = Math.max(0, tokenBalance - unlockPriceCredits)
  const paidUnlocks = Math.max(0, readNumber(props.paidUnlocks, 0)) + (unlockPriceCredits > 0 ? 1 : 0)
  target.properties = {
    ...props,
    unlockRequired: asJson(false),
    canUnlock: asJson(true),
    unlockedByCurrentUser: asJson(true),
    accessState: asJson('open'),
    paidUnlocks: asJson(paidUnlocks),
    projectedBalanceAfterUnlock: asJson(nextBalance),
    tags: asJson(writeTags(props.tags, ['unlocked'], ['unlock-ready', 'unlock-needs-credits', 'protected'])),
  } as GraphNode['properties']
  if (snapshot) {
    snapshot.properties = appendLedgerEvent({
      ...snapshotProps,
      tokenBalance: asJson(nextBalance),
      totalPaidUnlocks: asJson(Math.max(0, readNumber(snapshotProps.totalPaidUnlocks, 0)) + (unlockPriceCredits > 0 ? 1 : 0)),
    }, {
      eventType: asJson('unlock_debit'),
      nodeId: asJson(cleanText(props.strytreeNodeId) || nodeId),
      amountCredits: asJson(unlockPriceCredits),
      balanceAfter: asJson(nextBalance),
      createdAtMs: asJson(nowMs),
    }) as GraphNode['properties']
  }
  return {
    graphData: withGraph(graphData, nodes),
    changed: true,
    kind: 'success',
    message: 'Storytree branch unlocked with a local credit-ledger event.',
  }
}

export const createStrytreeContinuationDraftAction = (
  graphData: GraphData,
  parentGraphNodeId: string,
  opts: { prompt?: string; nowMs?: number } = {},
): StrytreeWorkflowResult => {
  const nowMs = opts.nowMs ?? Date.now()
  const nodes = cloneGraphNodes(graphData)
  const edges = cloneGraphEdges(graphData)
  const parent = findStoryNode(nodes, parentGraphNodeId)
  if (!parent) return { graphData, changed: false, kind: 'warning', message: 'Storytree branch is not available.' }
  const parentProps = readProps(parent)
  if (cleanText(parentProps.strytreeStatus) === 'dropped' || cleanText(parentProps.branchStatus) === 'dropped') {
    return { graphData, changed: false, kind: 'warning', message: 'Dropped storytree branches stay audit-only.' }
  }
  const storyId = cleanText(parentProps.strytreeStoryId)
  const snapshot = findSnapshotNode(nodes, storyId)
  const snapshotProps = readProps(snapshot)
  const tokenBalance = Math.max(0, readNumber(snapshotProps.tokenBalance, 0))
  const generationCostCredits = Math.max(0, readNumber(snapshotProps.generationCostCredits, readNumber(parentProps.generationCostCredits, 5)))
  if (generationCostCredits > tokenBalance) {
    return { graphData, changed: false, kind: 'warning', message: 'Storytree continuation needs more credit tokens before generation.' }
  }
  const nextBalance = Math.max(0, tokenBalance - generationCostCredits)
  const parentStoryNodeId = cleanText(parentProps.strytreeNodeId) || parentGraphNodeId
  const draftStoryNodeId = `draft_${hashText(`${storyId}:${parentStoryNodeId}:${nowMs}`).slice(0, 12)}`
  const draftGraphNodeId = `strytree:node:${hashText(draftStoryNodeId).slice(0, 12)}`
  const inheritedAssetIds = readStringArray(parentProps.allAssetIds).length > 0
    ? readStringArray(parentProps.allAssetIds)
    : readStringArray(parentProps.inheritedAssetIds)
  const title = 'Draft continuation'
  const prompt = cleanText(opts.prompt) || cleanText(parentProps.prompt) || `Continue from ${cleanText(parent.label) || 'this branch'}.`
  const depth = Math.max(0, readNumber(parentProps.depth, 0)) + 1
  nodes.push({
    id: draftGraphNodeId,
    label: title,
    type: 'StorytreeNode',
    properties: {
      title: asJson(title),
      lane: asJson('Storytree'),
      order: asJson(Math.max(0, readNumber(parentProps.order, nodes.length)) + 0.5),
      index: asJson(`${depth + 1}.${nodes.length + 1}`),
      slugline: asJson(`Depth ${depth} / draft / ${cleanText(snapshotProps.unlockCurrency) || 'credits'}`),
      summary: asJson('Queued continuation draft from an existing storytree branch.'),
      action: asJson('Review the prompt, then run the approved Strybldr handoff through the provider-safe generation harness.'),
      prompt: asJson(prompt),
      branchStatus: asJson('draft'),
      strytreeStatus: asJson('draft'),
      tags: asJson(writeTags([], ['story-branch', 'draft', `depth:${depth}`, 'generation-queued'])),
      strytreeStoryId: asJson(storyId),
      strytreeNodeId: asJson(draftStoryNodeId),
      parent_node_id: asJson(parentStoryNodeId),
      parentNodeId: asJson(parentStoryNodeId),
      authorName: asJson('agentic-graph local draft'),
      isFreeWindow: asJson(false),
      isProtected: asJson(false),
      unlockPriceCredits: asJson(0),
      likes: asJson(0),
      impressions: asJson(0),
      likeRate: asJson(null),
      paidUnlocks: asJson(0),
      childBranchCount: asJson(0),
      depth: asJson(depth),
      pathNodeIds: asJson([...readStringArray(parentProps.pathNodeIds), draftStoryNodeId]),
      inheritedAssetIds: asJson(inheritedAssetIds),
      allAssetIds: asJson(inheritedAssetIds),
      unlockRequired: asJson(false),
      canUnlock: asJson(true),
      accessState: asJson('draft'),
      generationAffordable: asJson(true),
      generationQueuedAtMs: asJson(nowMs),
      generationCostCredits: asJson(generationCostCredits),
      projectedBalanceAfterGeneration: asJson(nextBalance),
      references: asJson(inheritedAssetIds),
    },
  })
  parent.properties = {
    ...parentProps,
    childBranchCount: asJson(Math.max(0, readNumber(parentProps.childBranchCount, 0)) + 1),
  } as GraphNode['properties']
  edges.push(makeEdge(parentGraphNodeId, draftGraphNodeId, 'parent_node_id'))
  if (snapshot) {
    snapshot.properties = appendLedgerEvent({
      ...snapshotProps,
      tokenBalance: asJson(nextBalance),
      activeBranchCount: asJson(Math.max(0, readNumber(snapshotProps.activeBranchCount, 0)) + 1),
    }, {
      eventType: asJson('generation_debit'),
      nodeId: asJson(draftStoryNodeId),
      parentNodeId: asJson(parentStoryNodeId),
      amountCredits: asJson(generationCostCredits),
      balanceAfter: asJson(nextBalance),
      createdAtMs: asJson(nowMs),
    }) as GraphNode['properties']
  }
  return {
    graphData: withGraph(graphData, nodes, edges),
    changed: true,
    kind: 'success',
    message: 'Storytree continuation draft queued for Strybldr Run all.',
    createdNodeId: draftGraphNodeId,
  }
}

export const createStrytreeCandidateRunAction = (
  graphData: GraphData,
  parentGraphNodeId: string,
  opts: { nowMs?: number; maxCandidates?: number } = {},
): StrytreeWorkflowResult => {
  const nowMs = opts.nowMs ?? Date.now()
  const maxCandidates = Math.min(3, Math.max(1, Math.floor(readNumber(opts.maxCandidates, 3))))
  const nodes = cloneGraphNodes(graphData)
  const edges = cloneGraphEdges(graphData)
  const parent = findStoryNode(nodes, parentGraphNodeId)
  if (!parent) return { graphData, changed: false, kind: 'warning', message: 'Storytree branch is not available.' }
  const parentProps = readProps(parent)
  if (cleanText(parentProps.strytreeStatus) === 'dropped' || cleanText(parentProps.branchStatus) === 'dropped') {
    return { graphData, changed: false, kind: 'warning', message: 'Dropped storytree branches stay audit-only.' }
  }
  const storyId = cleanText(parentProps.strytreeStoryId)
  const snapshot = findSnapshotNode(nodes, storyId)
  const snapshotProps = readProps(snapshot)
  const tokenBalance = Math.max(0, readNumber(snapshotProps.tokenBalance, 0))
  const generationCostCredits = Math.max(0, readNumber(snapshotProps.generationCostCredits, readNumber(parentProps.generationCostCredits, 5)))
  const quotedCostCredits = generationCostCredits * maxCandidates
  if (quotedCostCredits > tokenBalance) {
    return { graphData, changed: false, kind: 'warning', message: 'ForkCompare needs more credit tokens before candidate fan-out.' }
  }
  const parentStoryNodeId = cleanText(parentProps.strytreeNodeId) || parentGraphNodeId
  const runId = `candrun_${hashText(`${storyId}:${parentStoryNodeId}:${nowMs}`).slice(0, 12)}`
  const runGraphNodeId = `strytree:candidate-run:${hashText(runId).slice(0, 12)}`
  const allAssetIds = readStringArray(parentProps.allAssetIds)
  const nextBalance = Math.max(0, tokenBalance - quotedCostCredits)
  nodes.push({
    id: runGraphNodeId,
    label: 'ForkCompare run',
    type: 'StorytreeCandidateRun',
    properties: {
      title: asJson(`ForkCompare run for ${cleanText(parent.label) || 'branch'}`),
      lane: asJson('ForkCompare'),
      order: asJson(Math.max(0, readNumber(parentProps.order, nodes.length)) + 0.25),
      summary: asJson(`${maxCandidates} bounded candidates queued with a ${quotedCostCredits} credit quote.`),
      action: asJson('Compare scorecards, then publish exactly one candidate as a child branch.'),
      prompt: asJson('Review cost, continuity, moderation, and fallback fields before publishing.'),
      tags: asJson(writeTags([], ['forkcompare', 'candidate-run', 'completed', `max:${maxCandidates}`, `quote:${quotedCostCredits}`])),
      strytreeStoryId: asJson(storyId),
      candidateRunId: asJson(runId),
      parentNodeId: asJson(parentStoryNodeId),
      parentGraphNodeId: asJson(parentGraphNodeId),
      status: asJson('completed'),
      maxCandidates: asJson(maxCandidates),
      quotedCostCredits: asJson(quotedCostCredits),
      scorecardMode: asJson('cost_continuity'),
      candidateCount: asJson(maxCandidates),
    },
  })
  edges.push(makeEdge(parentGraphNodeId, runGraphNodeId, 'candidateRun'))

  const scoreSeeds = [0.86, 0.78, 0.69]
  for (let index = 0; index < maxCandidates; index += 1) {
    const candidateId = `cand_${hashText(`${runId}:${index}`).slice(0, 12)}`
    const candidateGraphNodeId = `strytree:candidate:${hashText(candidateId).slice(0, 12)}`
    const continuityScore = scoreSeeds[index] ?? Math.max(0.5, 0.82 - index * 0.08)
    nodes.push({
      id: candidateGraphNodeId,
      label: `Candidate ${index + 1}`,
      type: 'StorytreeCandidate',
      properties: {
        title: asJson(`Candidate ${index + 1}`),
        lane: asJson('ForkCompare'),
        order: asJson(Math.max(0, readNumber(parentProps.order, nodes.length)) + 0.3 + index / 100),
        index: asJson(`C${index + 1}`),
        slugline: asJson(`${Math.round(continuityScore * 100)}% continuity / ${generationCostCredits} credits / approved`),
        summary: asJson(`Continuation option ${index + 1} generated from the selected parent branch.`),
        action: asJson('Publish only if this private candidate beats the other scorecards.'),
        prompt: asJson(cleanText(parentProps.prompt) || `Continue from ${cleanText(parent.label) || 'this branch'}.`),
        tags: asJson(writeTags([], ['forkcompare', 'branch-candidate', 'succeeded', 'publish-ready'])),
        strytreeStoryId: asJson(storyId),
        candidateRunId: asJson(runId),
        strytreeCandidateId: asJson(candidateId),
        parentNodeId: asJson(parentStoryNodeId),
        parentGraphNodeId: asJson(parentGraphNodeId),
        provider: asJson('local-harness'),
        candidateStatus: asJson('succeeded'),
        creditCost: asJson(generationCostCredits),
        elapsedMs: asJson(36000 + index * 9000),
        fallbackStatus: asJson(index === 2 ? 'fallback-preview' : 'none'),
        moderationStatus: asJson('approved'),
        inheritedAssetCount: asJson(allAssetIds.length),
        continuityScore: asJson(continuityScore),
        publishEligible: asJson(true),
        selectedCandidate: asJson(false),
        privateCandidate: asJson(true),
        notes: asJson('Local deterministic scorecard for runnable Strytree demo.'),
        inheritedAssetIds: asJson(allAssetIds),
        references: asJson(allAssetIds),
      },
    })
    edges.push(makeEdge(runGraphNodeId, candidateGraphNodeId, 'candidateScorecard'))
    edges.push(makeEdge(parentGraphNodeId, candidateGraphNodeId, 'candidateOption'))
  }

  if (snapshot) {
    snapshot.properties = appendLedgerEvent({
      ...snapshotProps,
      tokenBalance: asJson(nextBalance),
    }, {
      eventType: asJson('candidate_run_debit'),
      parentNodeId: asJson(parentStoryNodeId),
      candidateRunId: asJson(runId),
      amountCredits: asJson(quotedCostCredits),
      balanceAfter: asJson(nextBalance),
      createdAtMs: asJson(nowMs),
    }) as GraphNode['properties']
  }
  return {
    graphData: withGraph(graphData, nodes, edges),
    changed: true,
    kind: 'success',
    message: 'ForkCompare candidate run created with bounded local scorecards.',
    createdNodeId: runGraphNodeId,
  }
}

export const publishStrytreeCandidateAction = (
  graphData: GraphData,
  candidateGraphNodeId: string,
  nowMs = Date.now(),
): StrytreeWorkflowResult => {
  const nodes = cloneGraphNodes(graphData)
  const edges = cloneGraphEdges(graphData)
  const candidate = findCandidateNode(nodes, candidateGraphNodeId)
  if (!candidate) return { graphData, changed: false, kind: 'warning', message: 'ForkCompare candidate is not available.' }
  const props = readProps(candidate)
  if (readBoolean(props.publishedCandidate) || cleanText(props.candidateStatus) === 'published') {
    return { graphData, changed: false, kind: 'warning', message: 'ForkCompare candidate is already published.' }
  }
  if (!readBoolean(props.publishEligible) || cleanText(props.moderationStatus) === 'rejected') {
    return { graphData, changed: false, kind: 'warning', message: 'ForkCompare candidate is not publish eligible.' }
  }
  const storyId = cleanText(props.strytreeStoryId)
  const parentStoryNodeId = cleanText(props.parentNodeId)
  const parentGraphNodeId = cleanText(props.parentGraphNodeId)
  const parent = findStoryNode(nodes, parentGraphNodeId) || findStoryNodeByStoryNodeId(nodes, parentStoryNodeId)
  if (!parent) return { graphData, changed: false, kind: 'warning', message: 'Parent storytree branch is not available.' }
  const parentProps = readProps(parent)
  const snapshot = findSnapshotNode(nodes, storyId)
  const snapshotProps = readProps(snapshot)
  const publishedStoryNodeId = `published_${hashText(`${cleanText(props.candidateRunId)}:${cleanText(props.strytreeCandidateId)}:${nowMs}`).slice(0, 12)}`
  const publishedGraphNodeId = `strytree:node:${hashText(publishedStoryNodeId).slice(0, 12)}`
  const depth = Math.max(0, readNumber(parentProps.depth, 0)) + 1
  const inheritedAssetIds = readStringArray(props.inheritedAssetIds).length > 0
    ? readStringArray(props.inheritedAssetIds)
    : readStringArray(parentProps.allAssetIds)
  nodes.push({
    id: publishedGraphNodeId,
    label: cleanText(props.title) || 'Published candidate',
    type: 'StorytreeNode',
    properties: {
      title: asJson(cleanText(props.title) || 'Published candidate'),
      lane: asJson('Storytree'),
      order: asJson(Math.max(0, readNumber(parentProps.order, nodes.length)) + 0.75),
      index: asJson(`${depth + 1}.${nodes.length + 1}`),
      slugline: asJson(`Depth ${depth} / open / ${cleanText(snapshotProps.unlockCurrency) || 'credits'}`),
      summary: asJson(cleanText(props.summary) || 'Published continuation selected from ForkCompare.'),
      action: asJson('Review this merged branch through the normal Storytree workflow.'),
      prompt: asJson(cleanText(props.prompt) || cleanText(parentProps.prompt)),
      branchStatus: asJson('active'),
      strytreeStatus: asJson('active'),
      tags: asJson(writeTags([], ['story-branch', 'active', 'forkcompare-merged', `depth:${depth}`])),
      strytreeStoryId: asJson(storyId),
      strytreeNodeId: asJson(publishedStoryNodeId),
      selectedCandidateId: asJson(cleanText(props.strytreeCandidateId)),
      parent_node_id: asJson(parentStoryNodeId),
      parentNodeId: asJson(parentStoryNodeId),
      authorName: asJson('agentic-graph local merge'),
      isFreeWindow: asJson(true),
      isProtected: asJson(false),
      unlockPriceCredits: asJson(0),
      likes: asJson(0),
      impressions: asJson(0),
      likeRate: asJson(null),
      paidUnlocks: asJson(0),
      childBranchCount: asJson(0),
      depth: asJson(depth),
      pathNodeIds: asJson([...readStringArray(parentProps.pathNodeIds), publishedStoryNodeId]),
      inheritedAssetIds: asJson(inheritedAssetIds),
      allAssetIds: asJson(inheritedAssetIds),
      unlockRequired: asJson(false),
      canUnlock: asJson(true),
      accessState: asJson('open'),
      generationAffordable: asJson(true),
      continuityScore: asJson(readNumber(props.continuityScore, 0)),
      creditCost: asJson(readNumber(props.creditCost, 0)),
      publishedFromCandidateAtMs: asJson(nowMs),
      references: asJson(inheritedAssetIds),
    },
  })
  parent.properties = {
    ...parentProps,
    childBranchCount: asJson(Math.max(0, readNumber(parentProps.childBranchCount, 0)) + 1),
  } as GraphNode['properties']
  const runId = cleanText(props.candidateRunId)
  for (const node of nodes) {
    if (cleanText(node.type) !== 'StorytreeCandidate') continue
    const nodeProps = readProps(node)
    if (cleanText(nodeProps.candidateRunId) !== runId) continue
    const isSelected = cleanText(node.id) === candidateGraphNodeId
    node.properties = {
      ...nodeProps,
      candidateStatus: asJson(isSelected ? 'published' : 'rejected'),
      selectedCandidate: asJson(isSelected),
      publishEligible: asJson(false),
      publishedCandidate: asJson(isSelected),
      privateCandidate: asJson(!isSelected),
      tags: asJson(writeTags(nodeProps.tags, [isSelected ? 'published' : 'rejected'], ['publish-ready'])),
    } as GraphNode['properties']
  }
  edges.push(makeEdge(parentGraphNodeId || cleanText(parent.id), publishedGraphNodeId, 'parent_node_id'))
  edges.push(makeEdge(candidateGraphNodeId, publishedGraphNodeId, 'publishedCandidate'))
  if (snapshot) {
    snapshot.properties = appendLedgerEvent({
      ...snapshotProps,
      activeBranchCount: asJson(Math.max(0, readNumber(snapshotProps.activeBranchCount, 0)) + 1),
    }, {
      eventType: asJson('candidate_publish'),
      parentNodeId: asJson(parentStoryNodeId),
      candidateRunId: asJson(runId),
      candidateId: asJson(cleanText(props.strytreeCandidateId)),
      nodeId: asJson(publishedStoryNodeId),
      createdAtMs: asJson(nowMs),
    }) as GraphNode['properties']
  }
  return {
    graphData: withGraph(graphData, nodes, edges),
    changed: true,
    kind: 'success',
    message: 'ForkCompare candidate published as one durable child branch.',
    createdNodeId: publishedGraphNodeId,
  }
}
