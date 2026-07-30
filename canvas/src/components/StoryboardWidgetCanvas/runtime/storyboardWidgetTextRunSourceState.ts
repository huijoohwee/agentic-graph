import {
  buildTextWidgetOutputPatch,
  clearRichMediaOutputProperties,
} from '@/features/chat/richMediaRun'
import type { HeadlessResponseRunResult } from '@/features/chat/headlessResponseCoordinator'

export function buildStoryboardWidgetTextRunSourceState(args: {
  properties: Record<string, unknown>
  loading: boolean
  runAt: string
  responseText?: string
  title?: unknown
  model?: unknown
  artifactPath?: string | null
  outputSourceProvenanceJson?: string
  runResult?: HeadlessResponseRunResult
  preserveExistingOutput?: boolean
}): Record<string, unknown> {
  const hasResponseText = typeof args.responseText === 'string'
  return {
    ...(args.preserveExistingOutput ? args.properties : clearRichMediaOutputProperties(args.properties)),
    ...(hasResponseText
      ? buildTextWidgetOutputPatch({
          output: args.responseText || '',
          title: args.title,
          model: args.model,
          outputPath: args.artifactPath,
          materializeSrcDoc: false,
        })
      : {}),
    outputSourceProvenanceJson: args.outputSourceProvenanceJson || undefined,
    headlessResponseRunSchema: args.runResult?.schema,
    headlessResponseRunId: args.runResult?.runId,
    headlessResponseRunStatus: args.runResult?.status,
    headlessResponseInvocationTokens: args.runResult?.invocation.tokens.length
      ? args.runResult.invocation.tokens
      : undefined,
    headlessResponseMcpTool: args.runResult?.invocation.tool || undefined,
    headlessResponseMcpInvoked: args.runResult?.invocation.mcpInvoked || undefined,
    outputLoading: args.loading ? true : undefined,
    outputLoadingKind: args.loading ? 'text' : undefined,
    lastRunAt: args.runAt,
  }
}
