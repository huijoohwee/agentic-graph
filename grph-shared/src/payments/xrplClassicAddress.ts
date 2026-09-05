const XRP_BASE58_ALPHABET = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz'
const SHA256_INITIAL = Object.freeze([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
])
const SHA256_ROUNDS = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const rotateRight = (value: number, shift: number): number =>
  (value >>> shift) | (value << (32 - shift))

const sha256Bytes = (input: Uint8Array): Uint8Array => {
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(input)
  padded[input.length] = 0x80
  new DataView(padded.buffer).setUint32(paddedLength - 4, input.length * 8, false)
  const hash = [...SHA256_INITIAL]
  const words = new Uint32Array(64)

  for (let offset = 0; offset < paddedLength; offset += 64) {
    const view = new DataView(padded.buffer, offset, 64)
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(index * 4, false)
    }
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15] as number
      const right = words[index - 2] as number
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3)
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10)
      words[index] = ((words[index - 16] as number) + sigma0
        + (words[index - 7] as number) + sigma1) >>> 0
    }

    let [a, b, c, d, e, f, g, h] = hash as [number, number, number, number, number, number, number, number]
    for (let index = 0; index < 64; index += 1) {
      const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temporary1 = (h + sigma1 + choice + (SHA256_ROUNDS[index] as number)
        + (words[index] as number)) >>> 0
      const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temporary2 = (sigma0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temporary1) >>> 0
      d = c
      c = b
      b = a
      a = (temporary1 + temporary2) >>> 0
    }
    for (const [index, value] of [a, b, c, d, e, f, g, h].entries()) {
      hash[index] = ((hash[index] as number) + value) >>> 0
    }
  }

  const output = new Uint8Array(32)
  const view = new DataView(output.buffer)
  hash.forEach((value, index) => view.setUint32(index * 4, value, false))
  return output
}

const decodeXrpBase58 = (value: string): Uint8Array | null => {
  let number = 0n
  for (const character of value) {
    const digit = XRP_BASE58_ALPHABET.indexOf(character)
    if (digit < 0) return null
    number = number * 58n + BigInt(digit)
  }
  const decoded: number[] = []
  while (number > 0n) {
    decoded.push(Number(number % 256n))
    number /= 256n
  }
  decoded.reverse()
  let leadingZeroes = 0
  while (value[leadingZeroes] === XRP_BASE58_ALPHABET[0]) leadingZeroes += 1
  return Uint8Array.from([...new Array(leadingZeroes).fill(0), ...decoded])
}

export const isValidXrplClassicAddress = (value: string): boolean => {
  if (value.length < 25 || value.length > 35) return false
  const decoded = decodeXrpBase58(value)
  if (!decoded || decoded.length !== 25 || decoded[0] !== 0) return false
  const payload = decoded.slice(0, 21)
  const expected = sha256Bytes(sha256Bytes(payload)).slice(0, 4)
  return expected.every((byte, index) => byte === decoded[21 + index])
}
