import { execFileSync } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

const destinationArgument = process.argv[2]
if (!destinationArgument) {
  throw new Error('Usage: node scripts/create-demo-fixture.mjs <new-directory>')
}

const destination = isAbsolute(destinationArgument)
  ? destinationArgument
  : resolve(process.cwd(), destinationArgument)

try {
  await stat(destination)
  throw new Error(`Refusing to overwrite existing path: ${destination}`)
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
    windowsHide: true,
  }).trim()
}

const mainPath = join(destination, 'main')
const featurePath = join(destination, 'feature')
await mkdir(mainPath, { recursive: true })
git(mainPath, 'init', '--initial-branch=main')
git(mainPath, 'config', 'user.email', 'demo@example.invalid')
git(mainPath, 'config', 'user.name', 'dsh-worktree demo')
await writeFile(join(mainPath, 'README.md'), '# dsh-worktree demo\n', 'utf8')
git(mainPath, 'add', 'README.md')
git(mainPath, 'commit', '-m', 'demo base')
git(mainPath, 'worktree', 'add', '-b', 'feature/demo', featurePath)
await writeFile(join(featurePath, 'feature.txt'), 'committed feature work\n', 'utf8')
git(featurePath, 'add', 'feature.txt')
git(featurePath, 'commit', '-m', 'feature demonstration')
await writeFile(join(mainPath, 'local-note.txt'), 'uncommitted local note\n', 'utf8')
await writeFile(join(destination, '.dsh-worktree-demo-fixture'), 'disposable\n', 'utf8')

process.stdout.write(`${mainPath}\n`)
