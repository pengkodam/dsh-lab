import { ErrorCode, WorktreeError } from './errors.js'

const objectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i

function invalidOutput(diagnostic) {
  return new WorktreeError(ErrorCode.INVALID_GIT_OUTPUT, { diagnostic })
}

function repositoryChanged(diagnostic) {
  return new WorktreeError(ErrorCode.REPOSITORY_CHANGED, { diagnostic })
}

function tokenize(output) {
  if (!Buffer.isBuffer(output) && typeof output !== 'string') {
    throw invalidOutput('Status porcelain output must be a Buffer or string.')
  }

  const bytes = Buffer.isBuffer(output) ? output : Buffer.from(output, 'utf8')
  if (bytes.length === 0 || bytes[bytes.length - 1] !== 0) {
    throw invalidOutput('Status porcelain output is not NUL-terminated.')
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

function splitFixedFields(token, count, recordName) {
  const fields = []
  let start = 0
  for (let index = 0; index < count; index += 1) {
    const separator = token.indexOf(' ', start)
    if (separator === -1) {
      throw invalidOutput(`${recordName} status record has too few fields.`)
    }
    fields.push(token.slice(start, separator))
    start = separator + 1
  }
  const path = token.slice(start)
  if (path.length === 0) {
    throw invalidOutput(`${recordName} status record has an empty path.`)
  }
  return { fields, path }
}

function validateXy(value, recordName) {
  if (!/^[.MADRCUT?!]{2}$/.test(value)) {
    throw invalidOutput(`${recordName} status record has an invalid XY field.`)
  }
}

function addTrackedCounts(counts, xy) {
  if (xy[0] !== '.') counts.staged += 1
  if (xy[1] !== '.') counts.unstaged += 1
}

function setHeader(headers, name, value) {
  if (headers.has(name)) {
    throw invalidOutput(`Status header ${JSON.stringify(name)} appears more than once.`)
  }
  headers.set(name, value)
}

function parseHeader(token, headers) {
  const separator = token.indexOf(' ', 2)
  if (separator === -1) return
  const name = token.slice(2, separator)
  const value = token.slice(separator + 1)
  if (!['branch.oid', 'branch.head', 'branch.upstream', 'branch.ab'].includes(name)) return
  if (value.length === 0) {
    throw invalidOutput(`Status header ${JSON.stringify(name)} has no value.`)
  }
  setHeader(headers, name, value)
}

function normalizeHead(value) {
  if (value === '(initial)') return value
  if (!objectIdPattern.test(value)) {
    throw invalidOutput('Status branch.oid is not a full Git object ID.')
  }
  return value
}

/** Parse `git status --porcelain=v2 --branch -z` output. */
export function parseStatusPorcelainV2(output, { expectedHead, expectedBranch } = {}) {
  const tokens = tokenize(output)
  const headers = new Map()
  const counts = { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.length === 0) {
      throw invalidOutput('Status porcelain output contains an empty record.')
    }
    if (token.startsWith('# ')) {
      parseHeader(token, headers)
      continue
    }

    const recordType = token[0]
    if (recordType === '1') {
      const { fields } = splitFixedFields(token, 8, 'ordinary')
      validateXy(fields[1], 'ordinary')
      addTrackedCounts(counts, fields[1])
      continue
    }
    if (recordType === '2') {
      const { fields } = splitFixedFields(token, 9, 'rename/copy')
      validateXy(fields[1], 'rename/copy')
      const sourcePath = tokens[index + 1]
      if (sourcePath === undefined || sourcePath.length === 0) {
        throw invalidOutput('Rename/copy status record has no source path.')
      }
      index += 1
      addTrackedCounts(counts, fields[1])
      continue
    }
    if (recordType === 'u') {
      const { fields } = splitFixedFields(token, 10, 'unmerged')
      validateXy(fields[1], 'unmerged')
      counts.conflicted += 1
      continue
    }
    if (recordType === '?' && token.startsWith('? ') && token.length > 2) {
      counts.untracked += 1
      continue
    }
    if (recordType === '!' && token.startsWith('! ') && token.length > 2) {
      continue
    }
    throw invalidOutput(`Unknown status record type ${JSON.stringify(recordType)}.`)
  }

  if (!headers.has('branch.oid') || !headers.has('branch.head')) {
    throw invalidOutput('Status output is missing required branch identity headers.')
  }

  const reportedHead = normalizeHead(headers.get('branch.oid'))
  const reportedBranchValue = headers.get('branch.head')
  const reportedBranch = reportedBranchValue === '(detached)' ? null : reportedBranchValue

  if (expectedHead !== undefined && expectedHead !== null) {
    const initialMatches = reportedHead === '(initial)' && /^0+$/.test(expectedHead)
    const objectMatches = reportedHead !== '(initial)'
      && reportedHead.toLowerCase() === expectedHead.toLowerCase()
    if (!initialMatches && !objectMatches) {
      throw repositoryChanged('The status HEAD does not match the discovery snapshot.')
    }
  }
  if (expectedBranch !== undefined && reportedBranch !== expectedBranch) {
    throw repositoryChanged('The status branch does not match the discovery snapshot.')
  }

  let ahead = null
  let behind = null
  if (headers.has('branch.ab')) {
    const match = /^\+(\d+) -(\d+)$/.exec(headers.get('branch.ab'))
    if (!match) throw invalidOutput('Status branch.ab header is malformed.')
    ahead = Number(match[1])
    behind = Number(match[2])
    if (!Number.isSafeInteger(ahead) || !Number.isSafeInteger(behind)) {
      throw invalidOutput('Status ahead/behind count exceeds the safe integer range.')
    }
  }

  return {
    clean: Object.values(counts).every(count => count === 0),
    ...counts,
    upstream: headers.get('branch.upstream') ?? null,
    ahead,
    behind,
  }
}
