// Joins the per-paragraph clips spoken by make-lecture.sh into one wav and
// writes the matching segments fixture. Called by make-lecture.sh; runs with
// plain `node` (Node 24 strips the types), so keep the syntax erasable.
//
//   node scripts/demo/assemble-lecture.mts <clipsDir> <out.wav> <out.segments.json> <voice>
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const SAMPLE_RATE = 16000
const BYTES_PER_SAMPLE = 2 // 16-bit mono
const GAP_MS = 700 // pause between paragraphs
const TAIL_MS = 500

const [clipsDir, outWav, outJson, voice] = process.argv.slice(2)
if (!clipsDir || !outWav || !outJson || !voice) {
  console.error('usage: assemble-lecture.mts <clipsDir> <out.wav> <out.segments.json> <voice>')
  process.exit(1)
}

/** Returns the PCM data of a 16 kHz mono 16-bit wav, failing loudly on anything else. */
function readPcm(file: string): Buffer {
  const buf = readFileSync(file)
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${file} is not a RIFF/WAVE file`)
  }
  let offset = 12
  let data: Buffer | undefined
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4)
    const size = buf.readUInt32LE(offset + 4)
    const body = buf.subarray(offset + 8, offset + 8 + size)
    if (id === 'fmt ') {
      const format = body.readUInt16LE(0)
      const channels = body.readUInt16LE(2)
      const rate = body.readUInt32LE(4)
      const bits = body.readUInt16LE(14)
      if (format !== 1 || channels !== 1 || rate !== SAMPLE_RATE || bits !== 16) {
        throw new Error(`${file}: expected PCM mono ${SAMPLE_RATE} Hz 16-bit, got format=${format} ch=${channels} rate=${rate} bits=${bits}`)
      }
    } else if (id === 'data') {
      data = body
    }
    offset += 8 + size + (size % 2)
  }
  if (!data) throw new Error(`${file} has no data chunk`)
  return data
}

function silence(ms: number): Buffer {
  return Buffer.alloc((SAMPLE_RATE / 1000) * ms * BYTES_PER_SAMPLE)
}

const bytesToMs = (bytes: number) => Math.round((bytes / BYTES_PER_SAMPLE / SAMPLE_RATE) * 1000)

const clips = readdirSync(clipsDir).filter((f) => f.endsWith('.wav')).sort()
const parts: Buffer[] = []
const segments: { startMs: number; endMs: number; text: string }[] = []
let bytes = 0
for (const [i, clip] of clips.entries()) {
  if (i > 0) {
    parts.push(silence(GAP_MS))
    bytes += silence(GAP_MS).length
  }
  const pcm = readPcm(path.join(clipsDir, clip))
  const text = readFileSync(path.join(clipsDir, clip.replace(/\.wav$/, '.txt')), 'utf8').trim()
  segments.push({ startMs: bytesToMs(bytes), endMs: bytesToMs(bytes + pcm.length), text })
  parts.push(pcm)
  bytes += pcm.length
}
parts.push(silence(TAIL_MS))
bytes += silence(TAIL_MS).length

const header = Buffer.alloc(44)
header.write('RIFF', 0, 'ascii')
header.writeUInt32LE(36 + bytes, 4)
header.write('WAVE', 8, 'ascii')
header.write('fmt ', 12, 'ascii')
header.writeUInt32LE(16, 16)
header.writeUInt16LE(1, 20) // PCM
header.writeUInt16LE(1, 22) // mono
header.writeUInt32LE(SAMPLE_RATE, 24)
header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28) // byte rate
header.writeUInt16LE(BYTES_PER_SAMPLE, 32) // block align
header.writeUInt16LE(16, 34) // bits per sample
header.write('data', 36, 'ascii')
header.writeUInt32LE(bytes, 40)

const wav = Buffer.concat([header, ...parts])
writeFileSync(outWav, wav)

const fixture = {
  audioFile: path.basename(outWav),
  audioSha256: createHash('sha256').update(wav).digest('hex'),
  audioBytes: wav.length,
  durationMs: bytesToMs(bytes),
  voice,
  segments,
}
writeFileSync(outJson, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(`make-lecture: wrote ${path.basename(outWav)} (${(wav.length / 1e6).toFixed(1)} MB, ${(fixture.durationMs / 1000).toFixed(0)} s, ${segments.length} segments) and ${path.basename(outJson)}`)
