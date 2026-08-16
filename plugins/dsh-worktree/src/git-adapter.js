import { executeGit } from './exec-git.js'
import { parseWorktreePorcelain } from './parse-porcelain.js'

const gitArguments = Object.freeze(['worktree', 'list', '--porcelain', '-z'])

export async function listGitWorktrees({
  cwd,
  signal,
  timeoutMs = 10_000,
  maxBuffer = 1024 * 1024,
  execFile,
} = {}) {
  try {
    const output = await executeGit({
      cwd,
      args: gitArguments,
      signal,
      timeoutMs,
      maxBuffer,
      execFile,
    })
    return parseWorktreePorcelain(output)
  } catch (error) {
    throw error
  }
}
