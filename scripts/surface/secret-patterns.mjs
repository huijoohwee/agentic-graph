export const SECRET_PATTERN_CATEGORIES = Object.freeze([
  'credential-material',
  'signed-url',
  'private-host',
  'local-absolute-path',
])

export const SECRET_PATTERNS = Object.freeze({
  'credential-material': Object.freeze([
    /\bsk-[A-Za-z0-9_-]{16,}\b/u,
    /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{12,}\b/u,
    /\bAKIA[0-9A-Z]{16}\b/u,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u,
    /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/u,
    /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u,
    /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}/iu,
  ]),
  'signed-url': Object.freeze([
    /\bhttps?:\/\/[^\s"'<>?]+\?[^\s"'<>]*(?:x-amz-signature|x-goog-signature|signature|sig|signed|token)=[^\s"'<>]{8,}/iu,
    /\bhttps?:\/\/[^\s"'<>?]+\?[^\s"'<>]*x-amz-credential=[^\s"'<>]+&[^\s"'<>]*x-amz-signature=[^\s"'<>]{8,}/iu,
  ]),
  'private-host': Object.freeze([
    /\b(?:localhost|host\.docker\.internal)\b/iu,
    /(?:^|[^0-9])127(?:\.[0-9]{1,3}){3}(?:$|[^0-9])/u,
    /(?:^|[^0-9])10(?:\.[0-9]{1,3}){3}(?:$|[^0-9])/u,
    /(?:^|[^0-9])192\.168(?:\.[0-9]{1,3}){2}(?:$|[^0-9])/u,
    /(?:^|[^0-9])172\.(?:1[6-9]|2[0-9]|3[01])(?:\.[0-9]{1,3}){2}(?:$|[^0-9])/u,
    /(?:^|[^A-Za-z0-9])\[?::1\]?(?:$|[^A-Za-z0-9])/u,
    /\b[A-Za-z0-9.-]+\.(?:internal|local)\b/iu,
  ]),
  'local-absolute-path': Object.freeze([
    /(?:^|[\s"'`=(])\/(?:Users|home)\/[^/\s"'`]+\/[^\s"'`]+/u,
    /(?:^|[\s"'`=(])\/private\/var\/folders\/[^\s"'`]+/u,
    /(?:^|[\s"'`=(])[A-Za-z]:\\Users\\[^\\\s"'`]+\\[^\s"'`]+/u,
  ]),
})

export function lineMatchesCategory(line, category) {
  if (typeof line !== 'string') return false
  const patterns = SECRET_PATTERNS[category]
  return Array.isArray(patterns) && patterns.some(pattern => pattern.test(line))
}
