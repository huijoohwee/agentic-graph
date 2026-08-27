import type {
  KnowgrphGitIdentity,
  KnowgrphGitObjectType,
  KnowgrphGitRelayObject,
} from './knowgrphGitContracts'

export type KnowgrphGitTreeEntry = {
  mode: '100644' | '100755' | '40000'
  name: string
  objectId: string
}

export type KnowgrphGitCommitHeader = {
  treeObjectId: string
  parentObjectIds: string[]
}

export type KnowgrphCanonicalGitCommit = KnowgrphGitCommitHeader & {
  author: KnowgrphGitIdentity
  committer: KnowgrphGitIdentity
  message: string
}

const textEncoder = new TextEncoder()
const fatalTextDecoder = new TextDecoder('utf-8', { fatal: true })
const SHA1_OBJECT_ID = /^[0-9a-f]{40}$/
const SAFE_REF_NAME = /^(HEAD|refs\/(heads|tags|remotes)\/[A-Za-z0-9][A-Za-z0-9._/-]*)$/

const concatBytes = (parts: Uint8Array[]): Uint8Array => {
  const length = parts.reduce((total, part) => total + part.byteLength, 0)
  const combined = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    combined.set(part, offset)
    offset += part.byteLength
  }
  return combined
}

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.byteLength !== right.byteLength) return false
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')

const fromHex = (value: string): Uint8Array => {
  const normalized = normalizeGitObjectId(value)
  const bytes = new Uint8Array(20)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

const compareBytes = (left: Uint8Array, right: Uint8Array): number => {
  const commonLength = Math.min(left.byteLength, right.byteLength)
  for (let index = 0; index < commonLength; index += 1) {
    const difference = left[index]! - right[index]!
    if (difference !== 0) return difference
  }
  return left.byteLength - right.byteLength
}

const treeSortKey = (entry: KnowgrphGitTreeEntry): Uint8Array =>
  concatBytes([
    textEncoder.encode(entry.name),
    new Uint8Array([entry.mode === '40000' ? 0x2f : 0x00]),
  ])

const validateTreeName = (value: string): string => {
  const name = String(value || '')
  if (
    !name
    || name === '.'
    || name === '..'
    || name.includes('/')
    || name.includes('\\')
    || name.includes('\0')
  ) {
    throw new Error('Git tree contains an invalid entry name')
  }
  return name
}

const validateIdentity = (identity: KnowgrphGitIdentity): KnowgrphGitIdentity => {
  const name = String(identity.name || '').trim()
  const email = String(identity.email || '').trim()
  const timezone = String(identity.timezone || '').trim()
  const timestampSeconds = Math.floor(Number(identity.timestampSeconds))
  if (!name || /[<>\r\n\0]/.test(name)) throw new Error('Git identity name is invalid')
  if (!email || /[<>\s\r\n\0]/.test(email)) throw new Error('Git identity email is invalid')
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds < 0) {
    throw new Error('Git identity timestamp is invalid')
  }
  if (!/^[+-](0\d|1[0-4])[0-5]\d$/.test(timezone)) throw new Error('Git identity timezone is invalid')
  return { name, email, timestampSeconds, timezone }
}

export const normalizeGitObjectId = (value: unknown): string => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!SHA1_OBJECT_ID.test(normalized)) throw new Error('Git object id must be a 40-character SHA-1')
  return normalized
}

export const normalizeGitRefName = (value: unknown): string => {
  const normalized = String(value || '').trim()
  const refParts = normalized.split('/')
  if (
    !SAFE_REF_NAME.test(normalized)
    || normalized.includes('..')
    || normalized.includes('//')
    || normalized.endsWith('/')
    || normalized.endsWith('.')
    || normalized.includes('@{')
    || normalized.includes('\\')
    || refParts.some(part => part.startsWith('.') || part.endsWith('.lock'))
  ) {
    throw new Error('Git ref name is invalid')
  }
  return normalized
}

export const encodeGitBytesBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.byteLength; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

export const decodeGitBytesBase64 = (value: unknown): Uint8Array => {
  const encoded = String(value || '').replace(/\s+/g, '')
  if (!encoded) return new Uint8Array()
  let binary: string
  try {
    binary = atob(encoded)
  } catch {
    throw new Error('Git object body is not valid Base64')
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export const buildGitLooseObjectBytes = (
  objectType: KnowgrphGitObjectType,
  body: Uint8Array,
): Uint8Array => {
  const header = textEncoder.encode(`${objectType} ${body.byteLength}\0`)
  return concatBytes([header, body])
}

export const hashGitObject = async (
  objectType: KnowgrphGitObjectType,
  body: Uint8Array,
): Promise<string> => {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('Web Crypto SHA-1 is unavailable')
  const digest = await subtle.digest('SHA-1', buildGitLooseObjectBytes(objectType, body))
  return toHex(new Uint8Array(digest))
}

export const encodeGitTree = (entries: KnowgrphGitTreeEntry[]): Uint8Array => {
  const normalized = entries.map(entry => ({
    mode: entry.mode,
    name: validateTreeName(entry.name),
    objectId: normalizeGitObjectId(entry.objectId),
  }))
  normalized.sort((left, right) => compareBytes(treeSortKey(left), treeSortKey(right)))
  const seen = new Set<string>()
  const chunks: Uint8Array[] = []
  for (const entry of normalized) {
    if (seen.has(entry.name)) throw new Error(`Git tree contains duplicate entry ${entry.name}`)
    seen.add(entry.name)
    chunks.push(
      textEncoder.encode(`${entry.mode} ${entry.name}\0`),
      fromHex(entry.objectId),
    )
  }
  return concatBytes(chunks)
}

export const parseGitTree = (body: Uint8Array): KnowgrphGitTreeEntry[] => {
  const entries: KnowgrphGitTreeEntry[] = []
  let offset = 0
  while (offset < body.byteLength) {
    const spaceIndex = body.indexOf(0x20, offset)
    const nullIndex = body.indexOf(0x00, spaceIndex + 1)
    if (spaceIndex <= offset || nullIndex <= spaceIndex + 1 || nullIndex + 21 > body.byteLength) {
      throw new Error('Git tree is truncated')
    }
    const mode = fatalTextDecoder.decode(body.subarray(offset, spaceIndex))
    if (mode === '120000') throw new Error('Git symlinks are not supported')
    if (mode === '160000') throw new Error('Git submodules are not supported')
    if (mode !== '100644' && mode !== '100755' && mode !== '40000') {
      throw new Error(`Git tree mode ${mode || '(empty)'} is not supported`)
    }
    const name = validateTreeName(fatalTextDecoder.decode(body.subarray(spaceIndex + 1, nullIndex)))
    const objectId = toHex(body.subarray(nullIndex + 1, nullIndex + 21))
    entries.push({ mode, name, objectId })
    offset = nullIndex + 21
  }
  if (!bytesEqual(body, encodeGitTree(entries))) {
    throw new Error('Git tree is not in canonical sorted form')
  }
  return entries
}

export const buildGitCommitBody = (args: {
  treeObjectId: string
  parentObjectId?: string | null
  author: KnowgrphGitIdentity
  committer?: KnowgrphGitIdentity | null
  message: string
}): Uint8Array => {
  const treeObjectId = normalizeGitObjectId(args.treeObjectId)
  const parentObjectId = args.parentObjectId ? normalizeGitObjectId(args.parentObjectId) : null
  const author = validateIdentity(args.author)
  const committer = validateIdentity(args.committer || author)
  const message = String(args.message || '').replace(/\r\n?/g, '\n')
  if (message.includes('\0')) throw new Error('Git commit message contains a NUL byte')
  const lines = [`tree ${treeObjectId}`]
  if (parentObjectId) lines.push(`parent ${parentObjectId}`)
  lines.push(
    `author ${author.name} <${author.email}> ${author.timestampSeconds} ${author.timezone}`,
    `committer ${committer.name} <${committer.email}> ${committer.timestampSeconds} ${committer.timezone}`,
    '',
    message.endsWith('\n') ? message.slice(0, -1) : message,
  )
  return textEncoder.encode(`${lines.join('\n')}\n`)
}

export const parseGitCommitHeader = (body: Uint8Array): KnowgrphGitCommitHeader => {
  let text: string
  try {
    text = fatalTextDecoder.decode(body)
  } catch {
    throw new Error('Git commit is not valid UTF-8')
  }
  if (text.includes('\0') || !text.includes('\n\n')) throw new Error('Git commit header is truncated')
  const headerText = text.slice(0, text.indexOf('\n\n'))
  const lines = headerText.split('\n')
  if (!lines[0]?.startsWith('tree ')) throw new Error('Git commit is missing its tree')
  const treeObjectId = normalizeGitObjectId(lines[0].slice('tree '.length))
  const parentObjectIds: string[] = []
  let hasAuthor = false
  let hasCommitter = false
  for (const line of lines.slice(1)) {
    if (line.startsWith('parent ')) parentObjectIds.push(normalizeGitObjectId(line.slice('parent '.length)))
    else if (line.startsWith('author ')) hasAuthor = true
    else if (line.startsWith('committer ')) hasCommitter = true
    else if (!line.startsWith('gpgsig ') && !line.startsWith(' ')) {
      throw new Error('Git commit contains an unsupported header')
    }
  }
  if (!hasAuthor || !hasCommitter) throw new Error('Git commit is missing author or committer metadata')
  return { treeObjectId, parentObjectIds }
}

const parseCanonicalIdentityLine = (
  line: string,
  kind: 'author' | 'committer',
): KnowgrphGitIdentity => {
  const match = new RegExp(
    `^${kind} ([^<>\\r\\n]+) <([^<>\\s\\r\\n]+)> ([0-9]+) ([+-](?:0\\d|1[0-4])[0-5]\\d)$`,
  ).exec(line)
  if (!match) throw new Error(`Git commit ${kind} identity is not canonical`)
  return validateIdentity({
    name: match[1]!,
    email: match[2]!,
    timestampSeconds: Number(match[3]),
    timezone: match[4]!,
  })
}

export const parseCanonicalGitCommit = (body: Uint8Array): KnowgrphCanonicalGitCommit => {
  let text: string
  try {
    text = fatalTextDecoder.decode(body)
  } catch {
    throw new Error('Git commit is not valid UTF-8')
  }
  const separatorIndex = text.indexOf('\n\n')
  if (separatorIndex < 0 || !text.endsWith('\n') || text.includes('\0')) {
    throw new Error('Git commit is not in the supported canonical form')
  }
  const lines = text.slice(0, separatorIndex).split('\n')
  const treeLine = lines.shift()
  if (!treeLine?.startsWith('tree ')) throw new Error('Git commit is missing its tree')
  const treeObjectId = normalizeGitObjectId(treeLine.slice('tree '.length))
  const parentObjectIds: string[] = []
  if (lines[0]?.startsWith('parent ')) {
    parentObjectIds.push(normalizeGitObjectId(lines.shift()!.slice('parent '.length)))
  }
  if (lines.length !== 2) throw new Error('Git commit contains unsupported or merge headers')
  const author = parseCanonicalIdentityLine(lines[0]!, 'author')
  const committer = parseCanonicalIdentityLine(lines[1]!, 'committer')
  return {
    treeObjectId,
    parentObjectIds,
    author,
    committer,
    message: text.slice(separatorIndex + 2, -1),
  }
}

export const verifyGitRelayObject = async (
  object: KnowgrphGitRelayObject,
): Promise<{ body: Uint8Array; objectId: string }> => {
  const objectId = normalizeGitObjectId(object.objectId)
  const body = decodeGitBytesBase64(object.bodyBase64)
  if (!Number.isSafeInteger(object.byteLength) || object.byteLength < 0 || object.byteLength !== body.byteLength) {
    throw new Error(`Git object ${objectId} has an invalid byte length`)
  }
  const reconstructedObjectId = await hashGitObject(object.objectType, body)
  if (reconstructedObjectId !== objectId) {
    throw new Error(`Git object ${objectId} failed canonical SHA-1 verification`)
  }
  if (object.objectType === 'tree') parseGitTree(body)
  if (object.objectType === 'commit') parseGitCommitHeader(body)
  return { body, objectId }
}
