import { analyzeAgenticOsRequest, isAttachedImageQuestionTerm } from './chatAgenticOsRequestProfile'
import { buildBody, buildResponseOnlyBody } from './chatHistoryWorkspace.agenticOs.bodyFallback'
import { buildDeterministicComputingFlowAgenticOsTurn } from './chatHistoryWorkspace.agenticOs.computingFlowFallback'
import type { BaseFallbackArgs } from './chatHistoryWorkspace.agenticOs.fallbackCommon'
import { buildFrontmatter } from './chatHistoryWorkspace.agenticOs.frontmatterFallback'
import { buildChatResponseStructuredSurfaceBlock } from './chatHistoryWorkspace.agenticOs.structuredSurfaceBlock'
import {
  buildHeadlessResponseSurface,
  hasCompleteAssistantMarkdownAnswer,
  isTraceOnlyAssistantText,
  shouldMaterializeHeadlessResponseSurface,
} from './chatHistoryWorkspace.agenticOs.responseProjection'
import {
  extractChatResponseStructuredSurface,
  projectChatResponseStructuredSurfaceIntoAgenticOsFrontmatter,
} from './chatResponseStructuredContent'
import { hasRecognizedChatRuntimeInvocation } from './chatRuntimeInvocationProfile'
import { resolveChatRuntimeInvocationQuery } from './chatRuntimeInvocationQuery'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'

const hasRequestedSections = (profile: ReturnType<typeof analyzeAgenticOsRequest>): boolean =>
  Object.values(profile.requestedSections).some(Boolean)

const hasFlowOwnedStructuredResponse = (
  surface: ReturnType<typeof extractChatResponseStructuredSurface>,
): boolean => Boolean(surface && (
  surface.nodes.some(node => (
    node.nodeTypeId !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
    || (
      typeof node.properties['flow:compute'] === 'string'
      && String(node.properties['flow:compute'] || '').trim().length > 0
    )
  ))
  || surface.edges.some(edge => edge.source !== 'n-deliver')
))

const shouldUseResponseOnlyBaseTemplate = (args: {
  profile: ReturnType<typeof analyzeAgenticOsRequest>
  requestText: string
  assistantText: string
}): boolean => {
  const profile = args.profile
  if (profile.signals.computingFlow || shouldMaterializeHeadlessResponseSurface(profile)) return false
  if (!hasRecognizedChatRuntimeInvocation(args.requestText)) return true
  const runtimeQuery = resolveChatRuntimeInvocationQuery(args.requestText)
  if (runtimeQuery.leadingRoute) {
    return isAttachedImageQuestionTerm(profile.intent)
  }
  if (hasRequestedSections(profile)) return false
  return !profile.product &&
    !profile.domain &&
    !profile.subject &&
    !profile.artifact &&
    profile.topics.length === 0 &&
    profile.namedTerms.length === 0
}

const projectResponseOnlyProfile = (
  profile: ReturnType<typeof analyzeAgenticOsRequest>,
  assistantText: string,
): ReturnType<typeof analyzeAgenticOsRequest> => {
  if (isTraceOnlyAssistantText(assistantText)) {
    return {
      ...profile,
      invocation: null,
      product: '',
      artifact: '',
      objective: profile.intent,
      namedTerms: [],
    }
  }
  if (!profile.invocation || !isAttachedImageQuestionTerm(profile.intent)) return profile
  return {
    ...profile,
    invocation: null,
    artifact: '',
    objective: profile.intent,
  }
}

export const buildDeterministicBaseTemplateAgenticOsTurn = (args: BaseFallbackArgs): string => {
  void args.timestampMs
  const profile = analyzeAgenticOsRequest(args.requestText)
  const assistantText = String(args.assistantText || '')
  const responseSurface = extractChatResponseStructuredSurface(assistantText, {
    trustedSource: args.structuredResponseSource,
  })
  const responseOnly = hasFlowOwnedStructuredResponse(responseSurface)
    ? false
    : shouldUseResponseOnlyBaseTemplate({
        profile,
        requestText: args.requestText,
        assistantText,
      })
  const outputProfile = responseOnly ? projectResponseOnlyProfile(profile, assistantText) : profile
  const useComputingFlowResponse = !responseSurface && (
    outputProfile.signals.computingFlow ||
    (!responseOnly && !shouldMaterializeHeadlessResponseSurface(outputProfile) && (
      hasCompleteAssistantMarkdownAnswer(assistantText)
    ))
  )
  if (useComputingFlowResponse) {
    return buildDeterministicComputingFlowAgenticOsTurn(args)
  }
  const projectedResponseSurface = responseSurface || buildHeadlessResponseSurface({ profile: outputProfile, assistantText })
  const fileName = String(args.fileName || '').trim() || 'agenticOs.md'
  const frontmatter = projectChatResponseStructuredSurfaceIntoAgenticOsFrontmatter({
    frontmatter: buildFrontmatter({ fileName, profile: outputProfile, assistantText, responseOnly }),
    surface: projectedResponseSurface,
  })
  const body = responseOnly
    ? buildResponseOnlyBody({ assistantText, profile: outputProfile })
    : buildBody({
        requestText: args.requestText,
        assistantText,
        profile: outputProfile,
        fileName,
        responseSurfaceBlock: buildChatResponseStructuredSurfaceBlock(projectedResponseSurface),
      })
  return ['---', frontmatter, '---', body].join('\n').trimEnd() + '\n'
}
