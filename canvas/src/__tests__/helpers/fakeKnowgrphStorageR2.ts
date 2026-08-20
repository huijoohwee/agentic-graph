type FakeR2Object = {
  bytes: Uint8Array
  httpMetadata: Record<string, string>
  customMetadata: Record<string, string>
  httpEtag: string
}

const readFakeR2BodyBytes = async (
  value: ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | Blob | string | null,
): Promise<Uint8Array> => {
  if (value == null) return new Uint8Array()
  if (typeof value === 'string') return new TextEncoder().encode(value)
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer())
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
  const reader = value.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      const chunk = next.value || new Uint8Array()
      chunks.push(chunk)
      total += chunk.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

const cloneFakeR2Bytes = (bytes: Uint8Array): Uint8Array => {
  const out = new Uint8Array(bytes.byteLength)
  out.set(bytes)
  return out
}

const streamFakeR2Bytes = (bytes: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(cloneFakeR2Bytes(bytes))
      controller.close()
    },
  })

const toFakeR2PublicObject = (object: FakeR2Object) => ({
  body: streamFakeR2Bytes(object.bytes),
  httpEtag: object.httpEtag,
  size: object.bytes.byteLength,
  customMetadata: { ...object.customMetadata },
  writeHttpMetadata(headers: Headers) {
    const contentType = object.httpMetadata.contentType || object.httpMetadata.content_type || ''
    if (contentType) headers.set('content-type', contentType)
    const cacheControl = object.httpMetadata.cacheControl || object.httpMetadata.cache_control || ''
    if (cacheControl) headers.set('cache-control', cacheControl)
  },
})

export class FakeKnowgrphStorageR2Bucket {
  objects = new Map<string, FakeR2Object>()

  async put(
    key: string,
    value: ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | Blob | string | null,
    options?: {
      httpMetadata?: Record<string, string>
      customMetadata?: Record<string, string>
    },
  ) {
    const bytes = await readFakeR2BodyBytes(value)
    const httpEtag = `"fake-${bytes.byteLength}-${this.objects.size + 1}"`
    const object: FakeR2Object = {
      bytes,
      httpMetadata: { ...(options?.httpMetadata || {}) },
      customMetadata: { ...(options?.customMetadata || {}) },
      httpEtag,
    }
    this.objects.set(key, object)
    return toFakeR2PublicObject(object)
  }

  async get(key: string) {
    const object = this.objects.get(key)
    return object ? toFakeR2PublicObject(object) : null
  }

  async head(key: string) {
    const object = this.objects.get(key)
    return object ? toFakeR2PublicObject(object) : null
  }

  async delete(key: string) {
    this.objects.delete(key)
  }
}
