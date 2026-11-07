import React from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sanitizeMessageText } from '@/lib/ui'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_COMPACT_ERROR_FEEDBACK_BADGE_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

type ErrorFeedbackProps = {
  title?: string
  error: unknown
  details?: string | null
  code?: string
  variant?: 'default' | 'compact'
  className?: string
}

export function ErrorFeedback({ title, error, details, code, variant = 'default', className }: ErrorFeedbackProps) {
  const safeError = sanitizeMessageText(error, { maxLines: 3, stripErrorPrefix: true })
  if (!safeError) return null

  if (variant === 'compact') {
    return (
      <section
        className={cn(
          UI_RESPONSIVE_COMPACT_ERROR_FEEDBACK_BADGE_CLASSNAME,
          'px-2 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 overflow-hidden flex items-center gap-2',
          className,
        )}
      >
        <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
        <section className="text-xs text-red-700 dark:text-red-300 truncate">
          {title ? title : 'Error'}: {safeError}
        </section>
      </section>
    )
  }

  return (
    <section
      className={cn(
        'mt-3 mb-3 p-3 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 overflow-auto',
        className,
      )}
    >
      <section className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold text-xs mb-2">
        <AlertCircle className="w-4 h-4" />
        <span>{title ? title : 'Error'}: {safeError}</span>
      </section>
      {details ? (
        <section className="text-xs text-red-700/80 dark:text-red-300/80 mb-2 whitespace-pre-wrap">
          {details}
        </section>
      ) : null}
      {code && (
        <pre className="m-0 overflow-x-auto">
          <code className={`font-mono text-xs ${UI_THEME_TOKENS.code.text}`}>
            {code}
          </code>
        </pre>
      )}
    </section>
  )
}
