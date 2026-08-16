import { ErrorCode, WorktreeError } from './errors.js'

const objectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i
const statusPattern = /^(?:[ADMTUXB]|[RC]\d{1,3})$/

function invalidOutput(diagnostic) {
  return new WorktreeError(ErrorCode.INVALID_GIT_OUTPUT, { diagnostic })
}

function asText(output, contract) {
  if (!Buffer.isBuffer(output) && typeof output !== 'string') {
    throw invalidOutput(`${contract} output must be a Buffer or string.`)
  }
  return Buffer.isBuffer(output) ? output.toString('utf8') : output
}

export function parseRevListCounts(output) {
  const text = asText(output, 'rev-list').trim()
  const match = /^(\d+)\s+(\d+)$/.exec(text)
  if (!match) throw invalidOutput('rev-list output does not contain two commit counts.')
  const baseOnlyCommits = Number(match[1])
  const targetOnlyCommits = Number(match[2])
  if (!Number.isSafeInteger(baseOnlyCommits) || !Number.isSafeInteger(targetOnlyCommits)) {
    throw invalidOutput('rev-list commit count exceeds the safe integer range.')
  }
  return { baseOnlyCommits, targetOnlyCommits }
}

export function parseMergeBase(output, expectedWidth) {
  const value = asText(output, 'merge-base').trim()
  if (!objectIdPattern.test(value) || value.length !== expectedWidth) {
    throw invalidOutput('merge-base output is not a compatible full object ID.')
  }
  return value
}

function tokenizeNameStatus(output) {
  if (!Buffer.isBuffer(output) && typeof output !== 'string') {
    throw invalidOutput('name-status output must be a Buffer or string.')
  }
  const bytes = Buffer.isBuffer(output) ? output : Buffer.from(output, 'utf8')
  if (bytes.length === 0) return []
  if (bytes[bytes.length - 1] !== 0) {
    throw invalidOutput('name-status output is not NUL-terminated.')
  }
  const tokens = []
  let start = 0
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0) continue
    tokens.push(bytes.subarray(start, index).toString('utf8'))
    start = index + 1
  }
  return tokens
}

export function parseNameStatus(output, { limit = 200 } = {}) {
  const tokens = tokenizeNameStatus(output)
  const allFiles = []
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index]
    if (!statusPattern.test(status)) {
      throw invalidOutput(`name-status contains invalid status ${JSON.stringify(status)}.`)
    }
    index += 1

    if (status.startsWith('R') || status.startsWith('C')) {
      const sourcePath = tokens[index]
      const path = tokens[index + 1]
      if (!sourcePath || !path) {
        throw invalidOutput('Rename/copy name-status record is incomplete.')
      }
      allFiles.push({ status, path, sourcePath })
      index += 2
      continue
    }

    const path = tokens[index]
    if (!path) throw invalidOutput('name-status record has no path.')
    allFiles.push({ status, path, sourcePath: null })
    index += 1
  }

  return {
    files: allFiles.slice(0, limit),
    filesTruncated: allFiles.length > limit,
  }
}

export function classifyRelationship({ baseOnlyCommits, targetOnlyCommits, related = true }) {
  if (!related) return 'unrelated'
  if (baseOnlyCommits === 0 && targetOnlyCommits === 0) return 'identical'
  if (baseOnlyCommits === 0) return 'ahead'
  if (targetOnlyCommits === 0) return 'behind'
  return 'diverged'
}
