import { buildResolvableVarKeySet, validateChatMarkdown } from '../chatMarkdownValidation'
import { isAgenticOsStructuredMarkdown } from '../chatHistoryWorkspace'
import { extractChatResponseStructuredSurface } from '../chatResponseStructuredContent'
import { extractAgenticOsBlockFromAssistantText } from './floatingPanelChatAgenticOsPayload'
import { buildCorrectionPrompt } from './floatingPanelChatCorrectionPrompt'
import type { JSONValue } from '@/lib/graph/types'

export type ChatAgenticGraphAttemptValidationState = {
  stage: 'retrying' | 'validated' | 'failed'
  attempt: number
  maxAttempts: number
  failedRuleId: string | null
  failedMessage: string | null
  correctionPromptPreview: string | null
  hasStructuredAgenticOs: boolean
  hasStructuredResponseSurface: boolean
  hasYamlFrontmatter: boolean
  validatedAgenticOsLength: number
}

export type ChatAgenticGraphAttemptResolution =
  | {
    kind: 'retry'
    correctionPrompt: string
    validation: ChatAgenticGraphAttemptValidationState
  }
  | {
    kind: 'final'
    finalAssistantText: string
    validatedAgenticOs: string | null
    status: 'ok' | 'error'
    validation: ChatAgenticGraphAttemptValidationState
  }

const buildValidationState = (args: {
  stage: 'retrying' | 'validated' | 'failed'
  attempt: number
  maxAttempts: number
  failedRuleId?: string | null
  failedMessage?: string | null
  correctionPromptPreview?: string | null
  candidateAgenticOs?: string | null
  hasStructuredResponseSurface?: boolean
  validatedAgenticOs?: string | null
}): ChatAgenticGraphAttemptValidationState => {
  const candidateAgenticOs = String(args.candidateAgenticOs || '').trim()
  const validatedAgenticOs = String(args.validatedAgenticOs || '').trim()
  return {
    stage: args.stage,
    attempt: args.attempt,
    maxAttempts: args.maxAttempts,
    failedRuleId: args.failedRuleId || null,
    failedMessage: args.failedMessage || null,
    correctionPromptPreview: args.correctionPromptPreview || null,
    hasStructuredAgenticOs: Boolean(candidateAgenticOs),
    hasStructuredResponseSurface: args.hasStructuredResponseSurface === true,
    hasYamlFrontmatter: candidateAgenticOs.startsWith('---\n'),
    validatedAgenticOsLength: validatedAgenticOs.length,
  }
}

export const resolveAgenticOsCorrectionInvalidMarkdown = (args: {
  rawAssistantText: string
  extracted: { answer: string; agenticOs: string | null }
}): string => {
  const agenticOs = typeof args.extracted.agenticOs === 'string' ? args.extracted.agenticOs.trim() : ''
  if (agenticOs) return agenticOs
  const answer = String(args.extracted.answer || '').trim()
  if (answer) return answer
  return String(args.rawAssistantText || '').trim()
}

export const resolveChatAgenticGraphAttempt = (args: {
  assistantText: string
  packedFrontmatter: Record<string, JSONValue> | null | undefined
  attempt: number
  maxValidationAttempts: number
}): ChatAgenticGraphAttemptResolution => {
  const assistantText = String(args.assistantText || '')
  const extracted = extractAgenticOsBlockFromAssistantText(assistantText)
  const agenticOs = typeof extracted.agenticOs === 'string' ? extracted.agenticOs.trim() : ''
  const correctionInvalidMarkdown = resolveAgenticOsCorrectionInvalidMarkdown({
    rawAssistantText: assistantText,
    extracted,
  })
  const hasRetryRemaining = args.attempt < args.maxValidationAttempts
  if (!agenticOs) {
    const structuredSurface = extractChatResponseStructuredSurface(assistantText)
    if (structuredSurface) {
      return {
        kind: 'final',
        finalAssistantText: assistantText,
        validatedAgenticOs: null,
        status: 'ok',
        validation: buildValidationState({
          stage: 'validated',
          attempt: args.attempt,
          maxAttempts: args.maxValidationAttempts,
          hasStructuredResponseSurface: true,
        }),
      }
    }
    const message = 'Previous answer did not include a parseable standalone AGENTIC_OS document. Return exactly one complete AGENTIC_OS markdown document.'
    if (hasRetryRemaining) {
      return {
        kind: 'retry',
        correctionPrompt: buildCorrectionPrompt({
          ruleId: 'V-03',
          message,
          invalidMarkdown: correctionInvalidMarkdown,
        }),
        validation: buildValidationState({
          stage: 'retrying',
          attempt: args.attempt,
          maxAttempts: args.maxValidationAttempts,
          failedRuleId: 'V-03',
          failedMessage: message,
          correctionPromptPreview: correctionInvalidMarkdown,
        }),
      }
    }
    return {
      kind: 'final',
      finalAssistantText: assistantText,
      validatedAgenticOs: null,
      status: 'ok',
      validation: buildValidationState({
        stage: 'failed',
        attempt: args.attempt,
        maxAttempts: args.maxValidationAttempts,
        failedRuleId: 'V-03',
        failedMessage: message,
      }),
    }
  }
  if (!isAgenticOsStructuredMarkdown(agenticOs)) {
    const message = 'Previous AGENTIC_OS payload was incomplete or not structurally parseable. Return one complete AGENTIC_OS markdown document with valid frontmatter and required sections.'
    if (hasRetryRemaining) {
      return {
        kind: 'retry',
        correctionPrompt: buildCorrectionPrompt({
          ruleId: 'V-03',
          message,
          invalidMarkdown: correctionInvalidMarkdown,
        }),
        validation: buildValidationState({
          stage: 'retrying',
          attempt: args.attempt,
          maxAttempts: args.maxValidationAttempts,
          failedRuleId: 'V-03',
          failedMessage: message,
          correctionPromptPreview: correctionInvalidMarkdown,
          candidateAgenticOs: agenticOs,
        }),
      }
    }
    return {
      kind: 'final',
      finalAssistantText: assistantText,
      validatedAgenticOs: null,
      status: 'ok',
      validation: buildValidationState({
        stage: 'failed',
        attempt: args.attempt,
        maxAttempts: args.maxValidationAttempts,
        failedRuleId: 'V-03',
        failedMessage: message,
        candidateAgenticOs: agenticOs,
      }),
    }
  }

  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: args.packedFrontmatter, markdown: agenticOs })
  const validation = validateChatMarkdown({ markdown: agenticOs, resolvableVarKeys })
  if (validation.ok) {
    return {
      kind: 'final',
      finalAssistantText: assistantText,
      validatedAgenticOs: agenticOs,
      status: 'ok',
      validation: buildValidationState({
        stage: 'validated',
        attempt: args.attempt,
        maxAttempts: args.maxValidationAttempts,
        candidateAgenticOs: agenticOs,
        validatedAgenticOs: agenticOs,
      }),
    }
  }

  const first = validation.errors[0]
  const nextRule = first?.ruleId || 'V-03'
  const nextMsg = first?.message || 'Validation failed.'
  if (hasRetryRemaining) {
    return {
      kind: 'retry',
      correctionPrompt: buildCorrectionPrompt({
        ruleId: nextRule,
        message: nextMsg,
        invalidMarkdown: correctionInvalidMarkdown,
      }),
      validation: buildValidationState({
        stage: 'retrying',
        attempt: args.attempt,
        maxAttempts: args.maxValidationAttempts,
        failedRuleId: nextRule,
        failedMessage: nextMsg,
        correctionPromptPreview: correctionInvalidMarkdown,
        candidateAgenticOs: agenticOs,
      }),
    }
  }
  return {
    kind: 'final',
    finalAssistantText: assistantText,
    validatedAgenticOs: null,
    status: 'ok',
    validation: buildValidationState({
      stage: 'failed',
      attempt: args.attempt,
      maxAttempts: args.maxValidationAttempts,
      failedRuleId: nextRule,
      failedMessage: nextMsg,
      candidateAgenticOs: agenticOs,
    }),
  }
}
