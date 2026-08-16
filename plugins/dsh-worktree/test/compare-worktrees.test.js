import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import test from 'node:test'
import { compareGitWorktrees } from '../src/compare-worktrees.js'

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C', GIT_OPTIONAL_LOCKS: '0' },
    windowsHide: true,
  }).trim()
}

async function indexBytes(cwd) {
  const indexPath = git(cwd, 'rev-parse', '--git-path', 'index')
  return readFile(isAbsolute(indexPath) ? indexPath : resolve(cwd, indexPath))
}

test('compares real identical, ahead, behind, diverged, and unrelated worktrees without mutation', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-worktree-compare-'))
  t.after(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 3 })
  })

  const mainPath = join(root, 'main')
  const behindPath = join(root, 'behind')
  const identicalPath = join(root, 'identical')
  const aheadPath = join(root, 'ahead')
  const divergedPath = join(root, 'diverged')
  const unrelatedPath = join(root, 'unrelated')
  await mkdir(mainPath, { recursive: true })
  git(mainPath, 'init', '--initial-branch=main')
  git(mainPath, 'config', 'user.email', 'tests@example.invalid')
  git(mainPath, 'config', 'user.name', 'dsh-worktree tests')
  await writeFile(join(mainPath, 'base.txt'), 'base\n', 'utf8')
  git(mainPath, 'add', 'base.txt')
  git(mainPath, 'commit', '-m', 'base')

  git(mainPath, 'worktree', 'add', '-b', 'feature/behind', behindPath, 'HEAD')
  await writeFile(join(mainPath, 'main.txt'), 'main\n', 'utf8')
  git(mainPath, 'add', 'main.txt')
  git(mainPath, 'commit', '-m', 'main advance')

  git(mainPath, 'worktree', 'add', '--detach', identicalPath, 'HEAD')
  git(mainPath, 'worktree', 'add', '-b', 'feature/ahead', aheadPath, 'HEAD')
  await writeFile(join(aheadPath, 'ahead.txt'), 'ahead\n', 'utf8')
  git(aheadPath, 'add', 'ahead.txt')
  git(aheadPath, 'commit', '-m', 'ahead change')

  git(mainPath, 'worktree', 'add', '-b', 'feature/diverged', divergedPath, 'HEAD~1')
  await writeFile(join(divergedPath, 'diverged.txt'), 'diverged\n', 'utf8')
  git(divergedPath, 'add', 'diverged.txt')
  git(divergedPath, 'commit', '-m', 'diverged change')

  git(mainPath, 'worktree', 'add', '-b', 'temporary/unrelated', unrelatedPath, 'HEAD~1')
  git(unrelatedPath, 'checkout', '--orphan', 'feature/unrelated')
  git(unrelatedPath, 'rm', '-rf', '.')
  await writeFile(join(unrelatedPath, 'unrelated.txt'), 'unrelated\n', 'utf8')
  git(unrelatedPath, 'add', 'unrelated.txt')
  git(unrelatedPath, 'commit', '-m', 'unrelated root')

  const paths = [mainPath, behindPath, identicalPath, aheadPath, divergedPath, unrelatedPath]
  const refsBefore = git(mainPath, 'show-ref')
  const indexesBefore = await Promise.all(paths.map(indexBytes))
  const mainFileBefore = await readFile(join(mainPath, 'main.txt'))

  const result = await compareGitWorktrees({ cwd: mainPath })

  assert.equal(result.base.path, mainPath.replaceAll('\\', '/'))
  assert.equal(result.base.branch, 'main')
  assert.equal(result.comparisons.length, 5)
  const byBranch = new Map(result.comparisons.map(comparison => [comparison.branch, comparison]))

  assert.equal(byBranch.get('feature/behind').relationship, 'behind')
  assert.equal(byBranch.get('feature/behind').baseOnlyCommits, 1)
  assert.equal(byBranch.get('feature/behind').targetOnlyCommits, 0)
  assert.equal(byBranch.get(null).relationship, 'identical')
  assert.equal(byBranch.get('feature/ahead').relationship, 'ahead')
  assert.equal(byBranch.get('feature/ahead').targetOnlyCommits, 1)
  assert.ok(byBranch.get('feature/ahead').files.some(file => file.path === 'ahead.txt'))
  assert.equal(byBranch.get('feature/diverged').relationship, 'diverged')
  assert.equal(byBranch.get('feature/diverged').baseOnlyCommits, 1)
  assert.equal(byBranch.get('feature/diverged').targetOnlyCommits, 1)
  assert.ok(byBranch.get('feature/diverged').files.some(file => file.path === 'diverged.txt'))
  assert.equal(byBranch.get('feature/unrelated').relationship, 'unrelated')
  assert.equal(byBranch.get('feature/unrelated').mergeBase, null)
  assert.deepEqual(byBranch.get('feature/unrelated').files, [])

  assert.equal(git(mainPath, 'show-ref'), refsBefore)
  const indexesAfter = await Promise.all(paths.map(indexBytes))
  assert.deepEqual(indexesAfter, indexesBefore)
  assert.deepEqual(await readFile(join(mainPath, 'main.txt')), mainFileBefore)
})
