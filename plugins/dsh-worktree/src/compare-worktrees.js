import { ErrorCode, WorktreeError } from './errors.js'
import { executeGit, executeGitResult } from './exec-git.js'
import { listGitWorktrees } from './git-adapter.js'
import { mapWithConcurrency } from './map-with-concurrency.js'
import {
  classifyRelationship,
  parseMergeBase,
  parseNameStatus,
  parseRevListCounts,
} from './parse-comparison.js'

function comparableHead(worktree) {
  return worktree.head !== null && !/^0+$/.test(worktree.head)
}

function unavailable(worktree, reason) {
  return {
    path: worktree.path,
    head: worktree.head,
    branch: worktree.branch,
    relationship: 'unavailable',
    mergeBase: null,
    baseOnlyCommits: null,
    targetOnlyCommits: null,
    files: [],
    filesTruncated: false,
    unavailableReason: reason,
  }
}

function relationshipFor(counts) {
  return classifyRelationship({ ...counts, related: true })
}

export async function compareGitWorktrees({
  cwd,
  signal,
  timeoutMs = 10_000,
  maxBuffer = 1024 * 1024,
  concurrency = 4,
  fileLimit = 200,
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
  const baseWorktree = discovery.worktrees[0]
  const base = {
    path: baseWorktree.path,
    head: baseWorktree.head,
    branch: baseWorktree.branch,
  }

  const comparisons = await mapWithConcurrency(
    discovery.worktrees.slice(1),
    concurrency,
    signal,
    async (target, comparisonSignal) => {
      if (!comparableHead(baseWorktree)) return unavailable(target, 'BASE_HEAD_UNAVAILABLE')
      if (target.bare) return unavailable(target, 'BARE_WORKTREE')
      if (target.prunable) return unavailable(target, 'PRUNABLE_WORKTREE')
      if (!comparableHead(target)) return unavailable(target, 'TARGET_HEAD_UNAVAILABLE')

      const revisionRange = `${baseWorktree.head}...${target.head}`
      const countsOutput = await executeGit({
        cwd,
        args: ['rev-list', '--left-right', '--count', revisionRange],
        signal: comparisonSignal,
        timeoutMs: remaining(),
        maxBuffer,
        execFile,
      })
      const counts = parseRevListCounts(countsOutput)

      const mergeBaseResult = await executeGitResult({
        cwd,
        args: ['merge-base', baseWorktree.head, target.head],
        signal: comparisonSignal,
        timeoutMs: remaining(),
        maxBuffer,
        acceptedExitCodes: [1],
        execFile,
      })
      if (mergeBaseResult.exitCode === 1) {
        return {
          path: target.path,
          head: target.head,
          branch: target.branch,
          relationship: 'unrelated',
          mergeBase: null,
          ...counts,
          files: [],
          filesTruncated: false,
          unavailableReason: null,
        }
      }

      const mergeBase = parseMergeBase(mergeBaseResult.stdout, baseWorktree.head.length)
      const diffOutput = await executeGit({
        cwd,
        args: ['diff', '--name-status', '-z', '--find-renames', `${mergeBase}..${target.head}`],
        signal: comparisonSignal,
        timeoutMs: remaining(),
        maxBuffer,
        execFile,
      })
      const fileSummary = parseNameStatus(diffOutput, { limit: fileLimit })
      return {
        path: target.path,
        head: target.head,
        branch: target.branch,
        relationship: relationshipFor(counts),
        mergeBase,
        ...counts,
        ...fileSummary,
        unavailableReason: null,
      }
    },
  )

  return { base, comparisons }
}
