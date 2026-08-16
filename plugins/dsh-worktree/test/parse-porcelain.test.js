import assert from 'node:assert/strict'
import test from 'node:test'
import { ErrorCode, WorktreeError } from '../src/errors.js'
import { parseWorktreePorcelain } from '../src/parse-porcelain.js'

function porcelain(...tokens) {
  return Buffer.from(`${tokens.join('\0')}\0`, 'utf8')
}

test('parses attached, detached, locked, and prunable worktrees', () => {
  const result = parseWorktreePorcelain(porcelain(
    'worktree C:/repos/demo',
    'HEAD abc123abc123abc123abc123abc123abc123abcd',
    'branch refs/heads/main',
    '',
    'worktree C:/repos/demo feature',
    'HEAD def456def456def456def456def456def456defa',
    'branch refs/heads/feature/test',
    'locked portable drive',
    '',
    'worktree C:/repos/detached',
    'HEAD 1111111111111111111111111111111111111111',
    'detached',
    'prunable gitdir file points to non-existent location',
    '',
  ))

  assert.equal(result.worktrees.length, 3)
  assert.deepEqual(result.worktrees[0], {
    path: 'C:/repos/demo',
    head: 'abc123abc123abc123abc123abc123abc123abcd',
    branch: 'main',
    ref: 'refs/heads/main',
    isMain: true,
    detached: false,
    bare: false,
    locked: false,
    lockReason: null,
    prunable: false,
    prunableReason: null,
  })
  assert.equal(result.worktrees[1].branch, 'feature/test')
  assert.equal(result.worktrees[1].locked, true)
  assert.equal(result.worktrees[1].lockReason, 'portable drive')
  assert.equal(result.worktrees[2].isMain, false)
  assert.equal(result.worktrees[2].detached, true)
  assert.equal(result.worktrees[2].branch, null)
  assert.equal(result.worktrees[2].prunable, true)
})

test('parses a bare main record without HEAD', () => {
  const result = parseWorktreePorcelain(porcelain(
    'worktree /srv/repository.git',
    'bare',
    '',
  ))

  assert.deepEqual(result.worktrees[0], {
    path: '/srv/repository.git',
    head: null,
    branch: null,
    ref: null,
    isMain: true,
    detached: false,
    bare: true,
    locked: false,
    lockReason: null,
    prunable: false,
    prunableReason: null,
  })
})

test('preserves newlines and non-ASCII text in NUL-delimited values', () => {
  const result = parseWorktreePorcelain(porcelain(
    'worktree C:/repos/Δ worktree\nsecond line',
    'HEAD abc123abc123abc123abc123abc123abc123abcd',
    'branch refs/heads/main',
    'locked line one\nline two',
    '',
  ))

  assert.equal(result.worktrees[0].path, 'C:/repos/Δ worktree\nsecond line')
  assert.equal(result.worktrees[0].lockReason, 'line one\nline two')
})

test('ignores unknown future attributes', () => {
  const result = parseWorktreePorcelain(porcelain(
    'worktree /repo',
    'HEAD abc123abc123abc123abc123abc123abc123abcd',
    'branch refs/heads/main',
    'future-field some value',
    '',
  ))

  assert.equal(result.worktrees.length, 1)
  assert.equal(result.worktrees[0].branch, 'main')
})

test('accepts adjacent records even if a producer omits the empty separator', () => {
  const result = parseWorktreePorcelain(porcelain(
    'worktree /main',
    'HEAD abc123abc123abc123abc123abc123abc123abcd',
    'branch refs/heads/main',
    'worktree /linked',
    'HEAD def456def456def456def456def456def456defa',
    'detached',
  ))

  assert.equal(result.worktrees.length, 2)
})

for (const [name, input] of [
  ['non-NUL-terminated output', Buffer.from('worktree /repo')],
  ['attribute before a record', porcelain('HEAD abc123', '')],
  ['record without HEAD', porcelain('worktree /repo', 'branch refs/heads/main', '')],
  ['duplicate attribute', porcelain('worktree /repo', 'HEAD a', 'HEAD b', '')],
  ['empty output', Buffer.alloc(0)],
  ['invalid HEAD object ID', porcelain('worktree /repo', 'HEAD not-an-object-id', '')],
  ['inconsistent HEAD widths', porcelain(
    'worktree /repo',
    'HEAD abc123abc123abc123abc123abc123abc123abcd',
    '',
    'worktree /repo-2',
    `HEAD ${'1'.repeat(64)}`,
    '',
  )],
]) {
  test(`rejects ${name} as a complete result`, () => {
    assert.throws(
      () => parseWorktreePorcelain(input),
      error => error instanceof WorktreeError && error.code === ErrorCode.INVALID_GIT_OUTPUT,
    )
  })
}
