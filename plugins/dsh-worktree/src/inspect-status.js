import { ErrorCode, WorktreeError } from './errors.js'
import { executeGit } from './exec-git.js'
import { listGitWorktrees } from './git-adapter.js'
import { mapWithConcurrency } from './map-with-concurrency.js'
import { parseStatusPorcelainV2 } from './parse-status-v2.js'

const statusArguments = Object.freeze([
  'status',
  '--porcelain=v2',
  '--branch',
  '-z',
  '--untracked-files=normal',
])

function unavailable(worktree, reason) {
  return {
    path: worktree.path,
    head: worktree.head,
    branch: worktree.branch,
    isMain: worktree.isMain,
    available: false,
    unavailableReason: reason,
    clean: null,
    staged: null,
    unstaged: null,
    untracked: null,
    conflicted: null,
    upstream: null,
    ahead: null,
    behind: null,
  }
}

function available(worktree, status) {
  return {
    path: worktree.path,
    head: worktree.head,
    branch: worktree.branch,
    isMain: worktree.isMain,
    available: true,
    unavailableReason: null,
    ...status,
  }
}

export async function getGitWorktreeStatus({
  cwd,
  signal,
  timeoutMs = 10_000,
  maxBuffer = 1024 * 1024,
  concurrency = 4,
  execFile,
} = {}) {
  const deadline = Date.now() + timeoutMs
  const remaining = () => {
    const value = deadline - Date.now()
    if (value <= 0) throw new WorktreeError(ErrorCode.TIMEOUT)
    return value
  }

  const discovery = await listGitWorktrees({
    cwd,
    signal,
    timeoutMs: remaining(),
    maxBuffer,
    execFile,
  })

  const worktrees = await mapWithConcurrency(
    discovery.worktrees,
    concurrency,
    signal,
    async (worktree, inspectionSignal) => {
      if (worktree.bare) return unavailable(worktree, 'BARE_WORKTREE')
      if (worktree.prunable) return unavailable(worktree, 'PRUNABLE_WORKTREE')

      const output = await executeGit({
        cwd: worktree.path,
        args: statusArguments,
        signal: inspectionSignal,
        timeoutMs: remaining(),
        maxBuffer,
        execFile,
      })
      return available(worktree, parseStatusPorcelainV2(output, {
        expectedHead: worktree.head,
        expectedBranch: worktree.branch,
      }))
    },
  )

  return { worktrees, remoteStateRefreshed: false }
}
