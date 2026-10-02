import React from 'react'
import { Check, Copy } from 'lucide-react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui/icons'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export function ClipboardCopyButton({ text, disabled = false }: { text: string; disabled?: boolean }) {
  const iconSizeClass = getIconSizeClass(useGraphStore(s => s.uiIconScale))
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
      className={`${UI_THEME_TOKENS.button.iconControl} ${UI_THEME_TOKENS.button.square} ${disabled ? 'opacity-50 cursor-not-allowed' : UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.text.secondary}`}
      onClick={handleCopy}
      type="button"
      disabled={disabled}
    >
      {copied ? <Check className={`${iconSizeClass} text-green-500`} /> : <Copy className={iconSizeClass} />}
    </button>
  )
}
