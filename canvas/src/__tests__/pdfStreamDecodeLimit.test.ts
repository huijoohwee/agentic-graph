import zlib from 'node:zlib'
import { readStream } from '@/lib/pdf/native/pdfObjects'
import type { ParsedIndirectObject } from '@/lib/pdf/native/pdfObjects'

export async function testPdfReadStreamRespectsMaxDecodeBytes() {
  const prev = process.env.AGENTIC_OS_PDF_STREAM_MAX_DECODE_BYTES
  process.env.AGENTIC_OS_PDF_STREAM_MAX_DECODE_BYTES = '1024'
  try {
    const decoded = Buffer.alloc(256 * 1024, 0x61)
    const compressed = zlib.deflateSync(decoded)
    const objects = new Map<number, ParsedIndirectObject>()
    objects.set(1, {
      obj: 1,
      gen: 0,
      dict: { kind: 'dict', map: { Filter: { kind: 'name', name: 'FlateDecode' } } },
      stream: compressed,
      rawStart: 0,
      rawEnd: 0,
    })
    const out = readStream(objects, { obj: 1, gen: 0 }, null)
    if (!out.bytes) throw new Error('expected stream bytes')
    if (out.bytes.length !== compressed.length) throw new Error('expected decode to be bounded and fall back to raw bytes')
    if (out.decodeComplete) throw new Error('bounded decode fallback must not claim complete decoding')

    objects.set(2, {
      obj: 2,
      gen: 0,
      dict: { kind: 'dict', map: { Filter: { kind: 'name', name: 'BogusDecode' } } },
      stream: Buffer.from('encoded'),
      rawStart: 0,
      rawEnd: 0,
    })
    const unsupported = readStream(objects, { obj: 2, gen: 0 }, null, { onError: 'null' })
    if (unsupported.bytes) throw new Error('unsupported filter must not expose encoded bytes as decoded content')
    if (unsupported.decodeComplete) throw new Error('unsupported filter must not claim complete decoding')

    objects.set(3, {
      obj: 3,
      gen: 0,
      dict: {
        kind: 'dict',
        map: {
          Filter: {
            kind: 'array',
            items: [
              { kind: 'name', name: 'FlateDecode' },
              { kind: 'name', name: 'BogusDecode' },
            ],
          },
        },
      },
      stream: compressed,
      rawStart: 0,
      rawEnd: 0,
    })
    const chained = readStream(objects, { obj: 3, gen: 0 }, null, { onError: 'null' })
    if (chained.bytes) throw new Error('partially supported filter chain must fail closed')
    if (chained.decodeComplete) throw new Error('partially supported filter chain must not claim complete decoding')
  } finally {
    if (prev == null) delete process.env.AGENTIC_OS_PDF_STREAM_MAX_DECODE_BYTES
    else process.env.AGENTIC_OS_PDF_STREAM_MAX_DECODE_BYTES = prev
  }
}
