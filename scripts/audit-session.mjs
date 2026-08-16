import { readFile } from 'node:fs/promises'
import { zstdDecompressSync } from 'node:zlib'

const sessionPath = process.argv[2]
if (!sessionPath) {
  throw new Error('Usage: node scripts/audit-session.mjs <session.jsonl.zstd>')
}

const toolNames = [
  'git_worktree_list',
  'git_worktree_status',
  'git_worktree_compare',
]

const compressed = await readFile(sessionPath)
const zstdMagic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const frameOffsets = []
let searchOffset = 0
while (searchOffset < compressed.length) {
  const offset = compressed.indexOf(zstdMagic, searchOffset)
  if (offset === -1) break
  frameOffsets.push(offset)
  searchOffset = offset + zstdMagic.length
}
if (frameOffsets.length === 0 || frameOffsets[0] !== 0) {
  throw new Error('Session file does not begin with a standard zstd frame.')
}
const decompressedChunks = frameOffsets.map((offset, index) => {
  const end = frameOffsets[index + 1] ?? compressed.length
  return zstdDecompressSync(compressed.subarray(offset, end))
})
const lines = Buffer.concat(decompressedChunks).toString('utf8').split(/\r?\n/).filter(Boolean)
const matches = []

for (let index = 0; index < lines.length; index += 1) {
  const event = JSON.parse(lines[index])
  const serialized = JSON.stringify(event)
  const tools = toolNames.filter(name => serialized.includes(name))
  if (tools.length === 0) continue
  const eventType = event.type
    ?? event.kind
    ?? event.event?.type
    ?? event.data?.type
    ?? event.payload?.type
    ?? null
  matches.push({ line: index + 1, eventType, tools })
}

const toolCallEvents = matches.filter(match => match.eventType === 'tool/call')

process.stdout.write(`${JSON.stringify({
  totalEvents: lines.length,
  compressedFrames: frameOffsets.length,
  toolCallEvents,
  observedTools: [...new Set(toolCallEvents.flatMap(match => match.tools))],
}, null, 2)}\n`)
