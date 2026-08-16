import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import test from 'node:test'
import { getGitWorktreeStatus } from '../src/inspect-status.js'

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

test('reports real worktree status without changing repository state', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-worktree-status-'))
  t.after(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 3 })
  })

  const mainPath = join(root, 'main repo')
  const linkedPath = join(root, 'linked feature')
  await mkdir(mainPath, { recursive: true })
  git(mainPath, 'init', '--initial-branch=main')
  git(mainPath, 'config', 'user.email', 'tests@example.invalid')
  git(mainPath, 'config', 'user.name', 'dsh-worktree tests')
  await writeFile(join(mainPath, 'README.md'), '# fixture\n', 'utf8')
  git(mainPath, 'add', 'README.md')
  git(mainPath, 'commit', '-m', 'fixture')
  git(mainPath, 'worktree', 'add', '-b', 'feature/status', linkedPath)

  await writeFile(join(mainPath, 'staged.txt'), 'staged\n', 'utf8')
  git(mainPath, 'add', 'staged.txt')
  await writeFile(join(mainPath, 'README.md'), '# fixture\nmodified\n', 'utf8')
  await writeFile(join(mainPath, 'untracked.txt'), 'untracked\n', 'utf8')

  const refsBefore = git(mainPath, 'show-ref')
  const mainIndexBefore = await indexBytes(mainPath)
  const linkedIndexBefore = await indexBytes(linkedPath)
  const readmeBefore = await readFile(join(mainPath, 'README.md'))

  const result = await getGitWorktreeStatus({ cwd: mainPath })

  assert.equal(result.remoteStateRefreshed, false)
  assert.equal(result.worktrees.length, 2)
  const main = result.worktrees.find(worktree => worktree.isMain)
  const linked = result.worktrees.find(worktree => worktree.branch === 'feature/status')
  assert.ok(main)
  assert.equal(main.available, true)
  assert.equal(main.clean, false)
  assert.equal(main.staged, 1)
  assert.equal(main.unstaged, 1)
  assert.equal(main.untracked, 1)
  assert.equal(main.conflicted, 0)
  assert.equal(main.upstream, null)
  assert.ok(linked)
  assert.equal(linked.available, true)
  assert.equal(linked.clean, true)

  assert.equal(git(mainPath, 'show-ref'), refsBefore)
  assert.deepEqual(await indexBytes(mainPath), mainIndexBefore)
  assert.deepEqual(await indexBytes(linkedPath), linkedIndexBefore)
  assert.deepEqual(await readFile(join(mainPath, 'README.md')), readmeBefore)
})
