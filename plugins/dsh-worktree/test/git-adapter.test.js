import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ErrorCode, WorktreeError } from '../src/errors.js'
import { listGitWorktrees } from '../src/git-adapter.js'

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim()
}

test('lists a real repository consistently without mutation', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-worktree-test-'))
  t.after(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 3 })
  })

  const mainPath = join(root, 'main repo Δ')
  const linkedPath = join(root, 'linked feature')
  const detachedPath = join(root, 'detached experiment')
  const nestedPath = join(mainPath, 'nested', 'directory')

  await mkdir(mainPath, { recursive: true })
  git(mainPath, 'init', '--initial-branch=main')
  git(mainPath, 'config', 'user.email', 'tests@example.invalid')
  git(mainPath, 'config', 'user.name', 'dsh-worktree tests')
  await writeFile(join(mainPath, 'README.md'), '# fixture\n', 'utf8')
  git(mainPath, 'add', 'README.md')
  git(mainPath, 'commit', '-m', 'fixture')
  git(mainPath, 'worktree', 'add', '-b', 'feature/test', linkedPath)
  git(mainPath, 'worktree', 'add', '--detach', detachedPath, 'HEAD')
  git(mainPath, 'worktree', 'lock', '--reason', 'integration test', linkedPath)
  await mkdir(nestedPath, { recursive: true })

  const refsBefore = git(mainPath, 'show-ref')
  const statusBefore = git(mainPath, 'status', '--porcelain=v1', '--untracked-files=no')
  const fromRoot = await listGitWorktrees({ cwd: mainPath })
  const fromNested = await listGitWorktrees({ cwd: nestedPath })
  const fromLinked = await listGitWorktrees({ cwd: linkedPath })
  const refsAfter = git(mainPath, 'show-ref')
  const statusAfter = git(mainPath, 'status', '--porcelain=v1', '--untracked-files=no')

  assert.deepEqual(fromNested, fromRoot)
  assert.deepEqual(fromLinked, fromRoot)
  assert.equal(fromRoot.worktrees.length, 3)
  assert.equal(fromRoot.worktrees[0].isMain, true)
  assert.equal(fromRoot.worktrees[0].branch, 'main')
  assert.ok(fromRoot.worktrees.some(worktree => worktree.path.includes('Δ')))
  const featureWorktree = fromRoot.worktrees.find(worktree => worktree.branch === 'feature/test')
  const detachedWorktree = fromRoot.worktrees.find(worktree => worktree.detached)
  assert.ok(featureWorktree)
  assert.equal(featureWorktree.locked, true)
  assert.equal(featureWorktree.lockReason, 'integration test')
  assert.ok(detachedWorktree)
  assert.equal(detachedWorktree.branch, null)
  assert.equal(refsAfter, refsBefore)
  assert.equal(statusAfter, statusBefore)
})

test('maps execution outside a repository to NOT_A_GIT_REPOSITORY', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-worktree-outside-'))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))

  await assert.rejects(
    listGitWorktrees({ cwd: root }),
    error => error instanceof WorktreeError && error.code === ErrorCode.NOT_A_GIT_REPOSITORY,
  )
})

test('maps a missing Git executable without exposing a stack', async () => {
  const execFile = (_file, _args, _options, callback) => {
    const error = new Error('spawn git ENOENT')
    error.code = 'ENOENT'
    callback(error, Buffer.alloc(0), Buffer.alloc(0))
  }

  await assert.rejects(
    listGitWorktrees({ cwd: process.cwd(), execFile }),
    error => error instanceof WorktreeError
      && error.code === ErrorCode.GIT_NOT_FOUND
      && !error.message.includes(' at '),
  )
})

test('executes fixed argv with locale-stable read-only process settings', async () => {
  let invocation
  const execFile = (file, args, options, callback) => {
    invocation = { file, args, options }
    callback(null, Buffer.from([
      'worktree C:/repo',
      'HEAD abc123abc123abc123abc123abc123abc123abcd',
      'branch refs/heads/main',
      '',
      '',
    ].join('\0'), 'utf8'), Buffer.alloc(0))
  }

  await listGitWorktrees({ cwd: 'C:/repo', execFile })

  assert.equal(invocation.file, 'git')
  assert.deepEqual(invocation.args, ['worktree', 'list', '--porcelain', '-z'])
  assert.equal(invocation.options.cwd, 'C:/repo')
  assert.equal(invocation.options.env.LC_ALL, 'C')
  assert.equal(invocation.options.env.GIT_OPTIONAL_LOCKS, '0')
  assert.equal(invocation.options.windowsHide, true)
  assert.equal(invocation.options.encoding, 'buffer')
})

test('rejects malformed successful output rather than returning partial data', async () => {
  const execFile = (_file, _args, _options, callback) => {
    callback(null, Buffer.from('worktree /repo', 'utf8'), Buffer.alloc(0))
  }

  await assert.rejects(
    listGitWorktrees({ cwd: process.cwd(), execFile }),
    error => error instanceof WorktreeError && error.code === ErrorCode.INVALID_GIT_OUTPUT,
  )
})

test('maps a killed child process to TIMEOUT', async () => {
  const execFile = (_file, _args, _options, callback) => {
    const error = new Error('command timed out')
    error.killed = true
    callback(error, Buffer.alloc(0), Buffer.alloc(0))
  }

  await assert.rejects(
    listGitWorktrees({ cwd: process.cwd(), execFile }),
    error => error instanceof WorktreeError && error.code === ErrorCode.TIMEOUT,
  )
})

test('maps cancellation to ABORTED', async () => {
  const controller = new AbortController()
  controller.abort()
  const execFile = (_file, _args, _options, callback) => {
    const error = new Error('operation was aborted')
    error.name = 'AbortError'
    error.code = 'ABORT_ERR'
    callback(error, Buffer.alloc(0), Buffer.alloc(0))
  }

  await assert.rejects(
    listGitWorktrees({ cwd: process.cwd(), signal: controller.signal, execFile }),
    error => error instanceof WorktreeError && error.code === ErrorCode.ABORTED,
  )
})

test('bounds and sanitizes diagnostics from an unexpected Git failure', async () => {
  const execFile = (_file, _args, _options, callback) => {
    const error = new Error('git failed')
    error.code = 1
    callback(error, Buffer.alloc(0), Buffer.from(`bad\0${'x'.repeat(5_000)}`, 'utf8'))
  }

  await assert.rejects(
    listGitWorktrees({ cwd: process.cwd(), execFile }),
    error => error instanceof WorktreeError
      && error.code === ErrorCode.GIT_COMMAND_FAILED
      && !error.message.includes('\0')
      && error.message.length < 2_200,
  )
})
