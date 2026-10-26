export type SanitizeMarkdownResult = { text: string; changed: boolean }

export type SanitizeImportedMarkdownOptions = { sourceUrl?: string; preserveBodyFidelity?: boolean }
