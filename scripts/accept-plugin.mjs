import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const entryArgument = process.argv[2]
if (!entryArgument) {
  throw new Error('Usage: node scripts/accept-plugin.mjs <installed-plugin-index.js>')
}

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
    windowsHide: true,
  }).trim()
}

const originalDirectory = process.cwd()
const root = await mkdtemp(join(tmpdir(), 'dsh-worktree-packed-acceptance-'))

try {
  const mainPath = join(root, 'main')
  const linkedPath = join(root, 'feature')
  await mkdir(mainPath, { recursive: true })
  git(mainPath, 'init', '--initial-branch=main')
  git(mainPath, 'config', 'user.email', 'acceptance@example.invalid')
  git(mainPath, 'config', 'user.name', 'dsh-worktree acceptance')
  await writeFile(join(mainPath, 'base.txt'), 'base\n', 'utf8')
  git(mainPath, 'add', 'base.txt')
  git(mainPath, 'commit', '-m', 'base')
  git(mainPath, 'worktree', 'add', '-b', 'feature/packed', linkedPath)
  await writeFile(join(linkedPath, 'feature.txt'), 'feature\n', 'utf8')
  git(linkedPath, 'add', 'feature.txt')
  git(linkedPath, 'commit', '-m', 'feature')
  await writeFile(join(mainPath, 'untracked.txt'), 'local\n', 'utf8')

  process.chdir(mainPath)
  const entryPath = isAbsolute(entryArgument)
    ? entryArgument
    : resolve(originalDirectory, entryArgument)
  const plugin = await import(pathToFileURL(entryPath).href)
  const execution = { signal: new AbortController().signal }

  const listed = await plugin.toolDefinition.execute({}, execution)
  const status = await plugin.statusToolDefinition.execute({}, execution)
  const compared = await plugin.compareToolDefinition.execute({}, execution)

  assert.equal(listed.worktrees.length, 2)
  assert.equal(listed.worktrees[0].isMain, true)
  assert.equal(status.worktrees.length, 2)
  assert.equal(status.worktrees[0].untracked, 1)
  assert.equal(status.remoteStateRefreshed, false)
  assert.equal(compared.comparisons.length, 1)
  assert.equal(compared.comparisons[0].relationship, 'ahead')
  assert.equal(compared.comparisons[0].targetOnlyCommits, 1)
  assert.ok(compared.comparisons[0].files.some(file => file.path === 'feature.txt'))

  process.stdout.write(`${JSON.stringify({
    tools: [
      plugin.toolDefinition.name,
      plugin.statusToolDefinition.name,
      plugin.compareToolDefinition.name,
    ],
    worktrees: listed.worktrees.length,
    mainUntracked: status.worktrees[0].untracked,
    linkedRelationship: compared.comparisons[0].relationship,
    linkedUniqueCommits: compared.comparisons[0].targetOnlyCommits,
  }, null, 2)}\n`)
} finally {
  process.chdir(originalDirectory)
  await rm(root, { recursive: true, force: true, maxRetries: 3 })
}
