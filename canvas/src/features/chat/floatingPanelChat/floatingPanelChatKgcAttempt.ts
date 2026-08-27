import { buildResolvableVarKeySet, validateChatMarkdown } from '../chatMarkdownValidation'
import { isKgcStructuredMarkdown } from '../chatHistoryWorkspace'
import { extractChatResponseStructuredSurface } from '../chatResponseStructuredContent'
import { extractKgcBlockFromAssistantText } from './floatingPanelChatKgcPayload'
import { buildCorrectionPrompt } from './floatingPanelChatCorrectionPrompt'
import type { JSONValue } from '@/lib/graph/types'

export type ChatAgenticGraphAttemptValidationState = {
  stage: 'retrying' | 'validated' | 'failed'
  attempt: number
  maxAttempts: number
  failedRuleId: string | null
  failedMessage: string | null
  correctionPromptPreview: string | null
  hasStructuredKgc: boolean
  hasStructuredResponseSurface: boolean
  hasYamlFrontmatter: boolean
  validatedKgcLength: number
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
    validatedKgc: string | null
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
  candidateKgc?: string | null
  hasStructuredResponseSurface?: boolean
  validatedKgc?: string | null
}): ChatAgenticGraphAttemptValidationState => {
  const candidateKgc = String(args.candidateKgc || '').trim()
  const validatedKgc = String(args.validatedKgc || '').trim()
  return {
    stage: args.stage,
    attempt: args.attempt,
    maxAttempts: args.maxAttempts,
    failedRuleId: args.failedRuleId || null,
    failedMessage: args.failedMessage || null,
    correctionPromptPreview: args.correctionPromptPreview || null,
    hasStructuredKgc: Boolean(candidateKgc),
    hasStructuredResponseSurface: args.hasStructuredResponseSurface === true,
    hasYamlFrontmatter: candidateKgc.startsWith('---\n'),
    validatedKgcLength: validatedKgc.length,
  }
}

export const resolveKgcCorrectionInvalidMarkdown = (args: {
  rawAssistantText: string
  extracted: { answer: string; kgc: string | null }
}): string => {
  const kgc = typeof args.extracted.kgc === 'string' ? args.extracted.kgc.trim() : ''
  if (kgc) return kgc
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
  const extracted = extractKgcBlockFromAssistantText(assistantText)
  const kgc = typeof extracted.kgc === 'string' ? extracted.kgc.trim() : ''
  const correctionInvalidMarkdown = resolveKgcCorrectionInvalidMarkdown({
    rawAssistantText: assistantText,
    extracted,
  })
  const hasRetryRemaining = args.attempt < args.maxValidationAttempts
  if (!kgc) {
    const structuredSurface = extractChatResponseStructuredSurface(assistantText)
    if (structuredSurface) {
      return {
        kind: 'final',
        finalAssistantText: assistantText,
        validatedKgc: null,
        status: 'ok',
        validation: buildValidationState({
          stage: 'validated',
          attempt: args.attempt,
          maxAttempts: args.maxValidationAttempts,
          hasStructuredResponseSurface: true,
        }),
      }
    }
    const message = 'Previous answer did not include a parseable standalone KGC document. Return exactly one complete KGC markdown document.'
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
      validatedKgc: null,
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
  if (!isKgcStructuredMarkdown(kgc)) {
    const message = 'Previous KGC payload was incomplete or not structurally parseable. Return one complete KGC markdown document with valid frontmatter and required sections.'
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
          candidateKgc: kgc,
        }),
      }
    }
    return {
      kind: 'final',
      finalAssistantText: assistantText,
      validatedKgc: null,
      status: 'ok',
      validation: buildValidationState({
        stage: 'failed',
        attempt: args.attempt,
        maxAttempts: args.maxValidationAttempts,
        failedRuleId: 'V-03',
        failedMessage: message,
        candidateKgc: kgc,
      }),
    }
  }

  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: args.packedFrontmatter, markdown: kgc })
  const validation = validateChatMarkdown({ markdown: kgc, resolvableVarKeys })
  if (validation.ok) {
    return {
      kind: 'final',
      finalAssistantText: assistantText,
      validatedKgc: kgc,
      status: 'ok',
      validation: buildValidationState({
        stage: 'validated',
        attempt: args.attempt,
        maxAttempts: args.maxValidationAttempts,
        candidateKgc: kgc,
        validatedKgc: kgc,
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
        candidateKgc: kgc,
      }),
    }
  }
  return {
    kind: 'final',
    finalAssistantText: assistantText,
    validatedKgc: null,
    status: 'ok',
    validation: buildValidationState({
      stage: 'failed',
      attempt: args.attempt,
      maxAttempts: args.maxValidationAttempts,
      failedRuleId: nextRule,
      failedMessage: nextMsg,
      candidateKgc: kgc,
    }),
  }
}
