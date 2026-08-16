import assert from 'node:assert/strict'
import test from 'node:test'
import {
  apply,
  compareToolDefinition,
  inject,
  name,
  statusToolDefinition,
  toolDefinition,
} from '../index.js'
import {
  renderWorktreeComparison,
  renderWorktreeList,
  renderWorktreeStatus,
} from '../src/render.js'

const supportedSchemaKeywords = new Set([
  'type',
  'oneOf',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'title',
  'description',
  'default',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly',
])

function assertHarnessSchemaSubset(schema, path = 'schema') {
  for (const [keyword, value] of Object.entries(schema)) {
    assert.ok(supportedSchemaKeywords.has(keyword), `${path}.${keyword} is not supported by Harness`)
    if (keyword === 'properties') {
      for (const [propertyName, propertySchema] of Object.entries(value)) {
        assertHarnessSchemaSubset(propertySchema, `${path}.properties.${propertyName}`)
      }
    } else if (keyword === 'items') {
      assertHarnessSchemaSubset(value, `${path}.items`)
    } else if (keyword === 'oneOf') {
      value.forEach((variant, index) => assertHarnessSchemaSubset(variant, `${path}.oneOf[${index}]`))
    }
  }
}

test('registers exactly the intended zero-argument read-only tools', () => {
  const registered = []
  const ctx = { tools: { register: definition => registered.push(definition) } }

  apply(ctx)

  assert.equal(name, 'dsh-worktree')
  assert.deepEqual(inject, ['tools'])
  assert.equal(registered.length, 3)
  assert.equal(registered[0], toolDefinition)
  assert.equal(registered[1], statusToolDefinition)
  assert.equal(registered[2], compareToolDefinition)
  assert.equal(toolDefinition.name, 'git_worktree_list')
  assert.equal(statusToolDefinition.name, 'git_worktree_status')
  assert.equal(compareToolDefinition.name, 'git_worktree_compare')
  for (const definition of registered) {
    assert.deepEqual(definition.parameters.properties, {})
    assert.equal(definition.parameters.additionalProperties, false)
    assert.equal(definition.isConcurrencySafe({}), true)
  }
})

test('uses only the JSON Schema subset supported by Harness', () => {
  for (const definition of [toolDefinition, statusToolDefinition, compareToolDefinition]) {
    assertHarnessSchemaSubset(definition.parameters, `${definition.name}.parameters`)
    assertHarnessSchemaSubset(definition.output.schema, `${definition.name}.output.schema`)
  }
})

test('renders comparison facts with an explicit review-signal caveat', () => {
  const text = renderWorktreeComparison({
    base: {
      path: 'C:/repo',
      head: 'abc123abc123abc123abc123abc123abc123abcd',
      branch: 'main',
    },
    comparisons: [{
      path: 'C:/repo-feature',
      head: 'def456def456def456def456def456def456defa',
      branch: 'feature/test',
      relationship: 'ahead',
      mergeBase: 'abc123abc123abc123abc123abc123abc123abcd',
      baseOnlyCommits: 0,
      targetOnlyCommits: 2,
      files: [{ status: 'M', path: 'src/file.js', sourcePath: null }],
      filesTruncated: false,
      unavailableReason: null,
    }],
  })

  assert.match(text, /ahead; base \+0, target \+2; 1 changed file/)
  assert.match(text, /review signals, not a guarantee/)
})

test('renders repository-wide status without overstating remote freshness', () => {
  const text = renderWorktreeStatus({
    worktrees: [{
      path: 'C:/repo',
      head: 'abc123abc123abc123abc123abc123abc123abcd',
      branch: 'main',
      isMain: true,
      available: true,
      unavailableReason: null,
      clean: false,
      staged: 1,
      unstaged: 2,
      untracked: 3,
      conflicted: 0,
      upstream: 'origin/main',
      ahead: 1,
      behind: 0,
    }],
    remoteStateRefreshed: false,
  })

  assert.match(text, /1 total, 1 dirty, 0 clean/)
  assert.match(text, /staged 1, unstaged 2, untracked 3, conflicted 0/)
  assert.match(text, /local refs; no remote state was fetched/)
})

test('renders a concise explanation from canonical output', () => {
  const text = renderWorktreeList({
    worktrees: [{
      path: 'C:/repo',
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
    }],
  })

  assert.match(text, /Found 1 Git worktree:/)
  assert.match(text, /C:\/repo — main @ abc123abc123 \[main\]/)
})

test('keeps unusual paths on one rendered line without changing canonical data', () => {
  const worktree = {
    path: 'C:/repo\nsecond line',
    head: null,
    branch: null,
    ref: null,
    isMain: true,
    detached: false,
    bare: true,
    locked: true,
    lockReason: 'portable\nvolume',
    prunable: false,
    prunableReason: null,
  }

  const text = renderWorktreeList({ worktrees: [worktree] })

  assert.match(text, /C:\/repo\\nsecond line/)
  assert.match(text, /locked: portable\\nvolume/)
  assert.equal(worktree.path, 'C:/repo\nsecond line')
})
