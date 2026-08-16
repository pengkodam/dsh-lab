import assert from 'node:assert/strict'
import test from 'node:test'
import { ErrorCode, WorktreeError } from '../src/errors.js'
import { parseStatusPorcelainV2 } from '../src/parse-status-v2.js'

const head = 'abc123abc123abc123abc123abc123abc123abcd'
const otherHead = 'def456def456def456def456def456def456defa'

function porcelain(...tokens) {
  return Buffer.from(`${tokens.join('\0')}\0`, 'utf8')
}

test('parses clean branch and locally known upstream counts', () => {
  const result = parseStatusPorcelainV2(porcelain(
    `# branch.oid ${head}`,
    '# branch.head main',
    '# branch.upstream origin/main',
    '# branch.ab +2 -1',
  ), { expectedHead: head, expectedBranch: 'main' })

  assert.deepEqual(result, {
    clean: true,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicted: 0,
    upstream: 'origin/main',
    ahead: 2,
    behind: 1,
  })
})

test('counts tracked, rename, conflict, and untracked records', () => {
  const result = parseStatusPorcelainV2(porcelain(
    `# branch.oid ${head}`,
    '# branch.head feature/test',
    `1 M. N... 100644 100644 100644 ${head} ${otherHead} staged file.txt`,
    `1 .M N... 100644 100644 100644 ${head} ${head} unstaged file.txt`,
    `1 MM N... 100644 100644 100644 ${head} ${otherHead} both.txt`,
    `2 R. N... 100644 100644 100644 ${head} ${otherHead} R100 renamed destination.txt`,
    'renamed source.txt',
    `u UU N... 100644 100644 100644 100644 ${head} ${otherHead} ${head} conflict.txt`,
    '? untracked Δ.txt',
  ), { expectedHead: head, expectedBranch: 'feature/test' })

  assert.equal(result.clean, false)
  assert.equal(result.staged, 3)
  assert.equal(result.unstaged, 2)
  assert.equal(result.conflicted, 1)
  assert.equal(result.untracked, 1)
})

test('accepts detached and initial branch identities', () => {
  const detached = parseStatusPorcelainV2(porcelain(
    `# branch.oid ${head}`,
    '# branch.head (detached)',
  ), { expectedHead: head, expectedBranch: null })
  assert.equal(detached.clean, true)

  const initial = parseStatusPorcelainV2(porcelain(
    '# branch.oid (initial)',
    '# branch.head main',
  ), { expectedHead: '0'.repeat(40), expectedBranch: 'main' })
  assert.equal(initial.clean, true)
})

test('ignores unknown headers but rejects unknown records', () => {
  const result = parseStatusPorcelainV2(porcelain(
    `# branch.oid ${head}`,
    '# branch.head main',
    '# future.header value',
  ))
  assert.equal(result.clean, true)

  assert.throws(
    () => parseStatusPorcelainV2(porcelain(
      `# branch.oid ${head}`,
      '# branch.head main',
      'x future record',
    )),
    error => error instanceof WorktreeError && error.code === ErrorCode.INVALID_GIT_OUTPUT,
  )
})

test('rejects mixed-snapshot head and branch identities', () => {
  assert.throws(
    () => parseStatusPorcelainV2(porcelain(
      `# branch.oid ${otherHead}`,
      '# branch.head main',
    ), { expectedHead: head, expectedBranch: 'main' }),
    error => error instanceof WorktreeError && error.code === ErrorCode.REPOSITORY_CHANGED,
  )

  assert.throws(
    () => parseStatusPorcelainV2(porcelain(
      `# branch.oid ${head}`,
      '# branch.head other',
    ), { expectedHead: head, expectedBranch: 'main' }),
    error => error instanceof WorktreeError && error.code === ErrorCode.REPOSITORY_CHANGED,
  )
})

for (const [name, input] of [
  ['non-NUL-terminated output', Buffer.from(`# branch.oid ${head}`)],
  ['empty output', Buffer.alloc(0)],
  ['missing identity headers', porcelain('? file.txt')],
  ['malformed ahead/behind', porcelain(`# branch.oid ${head}`, '# branch.head main', '# branch.ab 2 1')],
  ['rename without source', porcelain(
    `# branch.oid ${head}`,
    '# branch.head main',
    `2 R. N... 100644 100644 100644 ${head} ${otherHead} R100 destination.txt`,
  )],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(
      () => parseStatusPorcelainV2(input),
      error => error instanceof WorktreeError && error.code === ErrorCode.INVALID_GIT_OUTPUT,
    )
  })
}
