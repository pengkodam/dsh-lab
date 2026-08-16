import { execFile as nodeExecFile } from 'node:child_process'
import { ErrorCode, sanitizeDiagnostic, WorktreeError } from './errors.js'

export const defaultGitTimeoutMs = 10_000
export const defaultGitMaxBuffer = 1024 * 1024

function mapExecutionError(error, signal) {
  if (signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
    return new WorktreeError(ErrorCode.ABORTED, { cause: error })
  }
  if (error?.killed === true || error?.code === 'ETIMEDOUT') {
    return new WorktreeError(ErrorCode.TIMEOUT, { cause: error })
  }
  if (error?.code === 'ENOENT') {
    return new WorktreeError(ErrorCode.GIT_NOT_FOUND, { cause: error })
  }

  const diagnostic = sanitizeDiagnostic(error?.capturedStderr ?? error?.stderr ?? error?.message)
  if (/not a git repository/i.test(diagnostic)) {
    return new WorktreeError(ErrorCode.NOT_A_GIT_REPOSITORY, { cause: error })
  }
  return new WorktreeError(ErrorCode.GIT_COMMAND_FAILED, { cause: error, diagnostic })
}

/**
 * Execute one application-owned Git operation without a shell.
 *
 * This is deliberately not a generic model-facing command surface. Callers are
 * responsible for supplying fixed argv plus values validated from Git output.
 */
export function executeGitResult({
  cwd,
  args,
  signal,
  timeoutMs = defaultGitTimeoutMs,
  maxBuffer = defaultGitMaxBuffer,
  execFile = nodeExecFile,
  acceptedExitCodes = [],
} = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, {
      cwd,
      encoding: 'buffer',
      env: {
        ...process.env,
        LC_ALL: 'C',
        GIT_OPTIONAL_LOCKS: '0',
      },
      maxBuffer,
      signal,
      timeout: timeoutMs,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        if (acceptedExitCodes.includes(error.code)) {
          resolve({ stdout, exitCode: error.code })
          return
        }
        reject(mapExecutionError(Object.assign(error, { capturedStderr: stderr }), signal))
        return
      }
      resolve({ stdout, exitCode: 0 })
    })
  })
}

export async function executeGit(options) {
  return (await executeGitResult(options)).stdout
}
