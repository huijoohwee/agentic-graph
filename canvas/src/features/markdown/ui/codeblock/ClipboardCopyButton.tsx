import React from 'react'
import { Check, Copy } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export function ClipboardCopyButton({ text, disabled = false }: { text: string; disabled?: boolean }) {
  const [copied, setCopied] = React.useState(false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = () => {
    if (disabled) return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setCopied(false)
        timerRef.current = null
      }, 2000)
    })
  }

  return (
    <button
      aria-label="Copy code to clipboard"
      className={`p-1.5 rounded-md transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.text.secondary}`}
      onClick={handleCopy}
      type="button"
      disabled={disabled}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" strokeWidth={1.5} /> : <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />}
    </button>
  )
}
