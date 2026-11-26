// Keep the Pages runtime and published mirror on one enforced app-shell policy.
export const AGENTIC_GRAPH_CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self' https://*.vercel.app https://*.joohwee.pages.dev; form-action 'none'; img-src 'self' data: blob: https:; font-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; script-src-attr 'none'; connect-src 'self' https: wss:; frame-src 'self' https: data: blob:; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests; block-all-mixed-content"

// Public share-token documents are intentionally embeddable from arbitrary origins.
export const AGENTIC_GRAPH_PUBLIC_DOCUMENT_CSP = 'frame-ancestors *'
