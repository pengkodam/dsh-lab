import assert from 'node:assert/strict'
import test from 'node:test'
import { ErrorCode, WorktreeError } from '../src/errors.js'
import {
  classifyRelationship,
  parseMergeBase,
  parseNameStatus,
  parseRevListCounts,
} from '../src/parse-comparison.js'

const head = 'abc123abc123abc123abc123abc123abc123abcd'

function nul(...tokens) {
  return Buffer.from(`${tokens.join('\0')}\0`, 'utf8')
}

test('parses revision counts and merge base', () => {
  assert.deepEqual(parseRevListCounts(Buffer.from('2\t3\n')), {
    baseOnlyCommits: 2,
    targetOnlyCommits: 3,
  })
  assert.equal(parseMergeBase(Buffer.from(`${head}\n`), 40), head)
})

test('classifies every related and unrelated relationship', () => {
  assert.equal(classifyRelationship({ baseOnlyCommits: 0, targetOnlyCommits: 0 }), 'identical')
  assert.equal(classifyRelationship({ baseOnlyCommits: 0, targetOnlyCommits: 1 }), 'ahead')
  assert.equal(classifyRelationship({ baseOnlyCommits: 1, targetOnlyCommits: 0 }), 'behind')
  assert.equal(classifyRelationship({ baseOnlyCommits: 1, targetOnlyCommits: 1 }), 'diverged')
  assert.equal(classifyRelationship({ baseOnlyCommits: 1, targetOnlyCommits: 1, related: false }), 'unrelated')
})

test('parses ordinary and rename/copy name-status records', () => {
  const result = parseNameStatus(nul(
    'M', 'modified.txt',
    'A', 'added Δ.txt',
    'R100', 'old name.txt', 'new name.txt',
  ))

  assert.deepEqual(result, {
    files: [
      { status: 'M', path: 'modified.txt', sourcePath: null },
      { status: 'A', path: 'added Δ.txt', sourcePath: null },
      { status: 'R100', path: 'new name.txt', sourcePath: 'old name.txt' },
    ],
    filesTruncated: false,
  })
})

test('validates complete name-status output before truncating', () => {
  const result = parseNameStatus(nul('A', 'one', 'M', 'two'), { limit: 1 })
  assert.equal(result.files.length, 1)
  assert.equal(result.filesTruncated, true)

  assert.throws(
    () => parseNameStatus(nul('A', 'one', 'M'), { limit: 1 }),
    error => error instanceof WorktreeError && error.code === ErrorCode.INVALID_GIT_OUTPUT,
  )
})

for (const [name, operation] of [
  ['malformed revision counts', () => parseRevListCounts('one two')],
  ['unsafe revision counts', () => parseRevListCounts('9007199254740992 0')],
  ['invalid merge base', () => parseMergeBase('not-an-object\n', 40)],
  ['wrong-width merge base', () => parseMergeBase(`${'1'.repeat(64)}\n`, 40)],
  ['non-NUL name-status', () => parseNameStatus('M\0path')],
  ['unknown name-status', () => parseNameStatus(nul('Z', 'path'))],
  ['incomplete rename', () => parseNameStatus(nul('R100', 'old'))],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(
      operation,
      error => error instanceof WorktreeError && error.code === ErrorCode.INVALID_GIT_OUTPUT,
    )
  })
}
