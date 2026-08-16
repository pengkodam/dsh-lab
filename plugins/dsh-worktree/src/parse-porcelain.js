import { ErrorCode, WorktreeError } from './errors.js'

const knownSingletonAttributes = new Set([
  'worktree',
  'HEAD',
  'branch',
  'bare',
  'detached',
  'locked',
  'prunable',
])

function invalidOutput(diagnostic) {
  return new WorktreeError(ErrorCode.INVALID_GIT_OUTPUT, { diagnostic })
}

function splitAttribute(token) {
  const separator = token.indexOf(' ')
  if (separator === -1) return [token, null]
  return [token.slice(0, separator), token.slice(separator + 1)]
}

function normalizeRecord(attributes, isMain) {
  const path = attributes.get('worktree')
  if (path === null || path === undefined || path.length === 0) {
    throw invalidOutput('A worktree record has no path.')
  }

  const bare = attributes.has('bare')
  const detached = attributes.has('detached')
  const head = attributes.get('HEAD') ?? null
  const ref = attributes.get('branch') ?? null

  if (!bare && head === null) {
    throw invalidOutput(`The worktree record for ${JSON.stringify(path)} has no HEAD.`)
  }
  if (head !== null && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(head)) {
    throw invalidOutput(`The worktree record for ${JSON.stringify(path)} has an invalid HEAD object ID.`)
  }
  if (bare && ref !== null) {
    throw invalidOutput(`The bare worktree record for ${JSON.stringify(path)} unexpectedly contains a branch.`)
  }
  if (detached && ref !== null) {
    throw invalidOutput(`The detached worktree record for ${JSON.stringify(path)} unexpectedly contains a branch.`)
  }

  const branch = ref === null
    ? null
    : ref.startsWith('refs/heads/')
      ? ref.slice('refs/heads/'.length)
      : ref

  return {
    path,
    head,
    branch,
    ref,
    isMain,
    detached,
    bare,
    locked: attributes.has('locked'),
    lockReason: attributes.get('locked') ?? null,
    prunable: attributes.has('prunable'),
    prunableReason: attributes.get('prunable') ?? null,
  }
}

/**
 * Parse `git worktree list --porcelain -z` output into the plugin's canonical
 * JSON result. Unknown attributes are ignored for forward compatibility.
 */
export function parseWorktreePorcelain(output) {
  if (!Buffer.isBuffer(output) && typeof output !== 'string') {
    throw invalidOutput('Porcelain output must be a Buffer or string.')
  }

  const bytes = Buffer.isBuffer(output) ? output : Buffer.from(output, 'utf8')
  const tokens = []
  let start = 0
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0) continue
    tokens.push(bytes.subarray(start, index).toString('utf8'))
    start = index + 1
  }
  if (start < bytes.length) {
    throw invalidOutput('Porcelain output is not NUL-terminated.')
  }

  const records = []
  let current = null

  const finishRecord = () => {
    if (current === null) return
    records.push(normalizeRecord(current, records.length === 0))
    current = null
  }

  for (const token of tokens) {
    if (token.length === 0) {
      finishRecord()
      continue
    }

    const [label, value] = splitAttribute(token)
    if (label === 'worktree') {
      finishRecord()
      current = new Map()
    } else if (current === null) {
      throw invalidOutput(`Attribute ${JSON.stringify(label)} appeared before a worktree path.`)
    }

    if (!knownSingletonAttributes.has(label)) continue
    if (current.has(label)) {
      throw invalidOutput(`Attribute ${JSON.stringify(label)} appears more than once in one record.`)
    }
    if ((label === 'worktree' || label === 'HEAD' || label === 'branch') && value === null) {
      throw invalidOutput(`Attribute ${JSON.stringify(label)} requires a value.`)
    }
    current.set(label, value)
  }

  finishRecord()
  if (records.length === 0) {
    throw invalidOutput('Porcelain output contains no worktree records.')
  }

  const objectIdWidths = new Set(records
    .map(record => record.head?.length)
    .filter(length => length !== undefined))
  if (objectIdWidths.size > 1) {
    throw invalidOutput('Porcelain output contains inconsistent HEAD object ID widths.')
  }

  return { worktrees: records }
}
