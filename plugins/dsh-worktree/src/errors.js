export const ErrorCode = Object.freeze({
  NOT_A_GIT_REPOSITORY: 'NOT_A_GIT_REPOSITORY',
  GIT_NOT_FOUND: 'GIT_NOT_FOUND',
  ABORTED: 'ABORTED',
  TIMEOUT: 'TIMEOUT',
  GIT_COMMAND_FAILED: 'GIT_COMMAND_FAILED',
  INVALID_GIT_OUTPUT: 'INVALID_GIT_OUTPUT',
  REPOSITORY_CHANGED: 'REPOSITORY_CHANGED',
})

const defaultMessages = Object.freeze({
  [ErrorCode.NOT_A_GIT_REPOSITORY]: 'The Harness launch directory is not inside a Git repository. Start Harness from within a repository and try again.',
  [ErrorCode.GIT_NOT_FOUND]: 'Git could not be started. Install Git or make sure it is available on PATH, then try again.',
  [ErrorCode.ABORTED]: 'Git worktree inspection was cancelled.',
  [ErrorCode.TIMEOUT]: 'Git worktree inspection exceeded its time limit.',
  [ErrorCode.GIT_COMMAND_FAILED]: 'Git could not inspect the repository worktrees.',
  [ErrorCode.INVALID_GIT_OUTPUT]: 'Git returned malformed worktree data, so no partial result was used.',
  [ErrorCode.REPOSITORY_CHANGED]: 'The repository changed during worktree inspection. Retry when repository activity has settled.',
})

export class WorktreeError extends Error {
  constructor(code, options = {}) {
    const baseMessage = defaultMessages[code] ?? 'Git worktree inspection failed.'
    const diagnostic = options.diagnostic?.trim()
    super(diagnostic ? `${baseMessage} Diagnostic: ${diagnostic}` : baseMessage, {
      cause: options.cause,
    })
    this.name = 'WorktreeError'
    this.code = code
  }
}

export function sanitizeDiagnostic(value, maxLength = 2_000) {
  if (value === undefined || value === null) return ''

  const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value)
  const normalized = text
    .replace(/\0/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '�')
    .trim()

  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}…`
}
