import { compareGitWorktrees } from './src/compare-worktrees.js'
import { listGitWorktrees } from './src/git-adapter.js'
import { getGitWorktreeStatus } from './src/inspect-status.js'
import {
  renderWorktreeComparison,
  renderWorktreeList,
  renderWorktreeStatus,
} from './src/render.js'

export const name = 'dsh-worktree'
export const inject = ['tools']

const nullableString = {
  oneOf: [
    { type: 'string' },
    { type: 'null' },
  ],
}

const worktreeSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'path',
    'head',
    'branch',
    'ref',
    'isMain',
    'detached',
    'bare',
    'locked',
    'lockReason',
    'prunable',
    'prunableReason',
  ],
  properties: {
    path: { type: 'string' },
    head: nullableString,
    branch: nullableString,
    ref: nullableString,
    isMain: { type: 'boolean' },
    detached: { type: 'boolean' },
    bare: { type: 'boolean' },
    locked: { type: 'boolean' },
    lockReason: nullableString,
    prunable: { type: 'boolean' },
    prunableReason: nullableString,
  },
}

const nullableInteger = {
  oneOf: [
    { type: 'integer' },
    { type: 'null' },
  ],
}

const nullableBoolean = {
  oneOf: [
    { type: 'boolean' },
    { type: 'null' },
  ],
}

const statusWorktreeSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'path', 'head', 'branch', 'isMain', 'available', 'unavailableReason',
    'clean', 'staged', 'unstaged', 'untracked', 'conflicted', 'upstream',
    'ahead', 'behind',
  ],
  properties: {
    path: { type: 'string' },
    head: nullableString,
    branch: nullableString,
    isMain: { type: 'boolean' },
    available: { type: 'boolean' },
    unavailableReason: nullableString,
    clean: nullableBoolean,
    staged: nullableInteger,
    unstaged: nullableInteger,
    untracked: nullableInteger,
    conflicted: nullableInteger,
    upstream: nullableString,
    ahead: nullableInteger,
    behind: nullableInteger,
  },
}

const comparisonFileSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'path', 'sourcePath'],
  properties: {
    status: { type: 'string' },
    path: { type: 'string' },
    sourcePath: nullableString,
  },
}

const comparisonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'path', 'head', 'branch', 'relationship', 'mergeBase',
    'baseOnlyCommits', 'targetOnlyCommits', 'files', 'filesTruncated',
    'unavailableReason',
  ],
  properties: {
    path: { type: 'string' },
    head: nullableString,
    branch: nullableString,
    relationship: {
      type: 'string',
      enum: ['identical', 'ahead', 'behind', 'diverged', 'unrelated', 'unavailable'],
    },
    mergeBase: nullableString,
    baseOnlyCommits: nullableInteger,
    targetOnlyCommits: nullableInteger,
    files: { type: 'array', items: comparisonFileSchema },
    filesTruncated: { type: 'boolean' },
    unavailableReason: nullableString,
  },
}

export const toolDefinition = {
  name: 'git_worktree_list',
  description: 'List all Git worktrees associated with the repository containing the directory where DeepSeek Harness was launched. This tool is read-only.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {},
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['worktrees'],
      properties: {
        worktrees: {
          type: 'array',
          items: worktreeSchema,
        },
      },
    },
    render: (_args, value) => [{ type: 'text', text: renderWorktreeList(value) }],
  },
  timeoutMs: 15_000,
  isConcurrencySafe: () => true,
  async execute(_args, exec) {
    return listGitWorktrees({
      cwd: launchDirectory,
      signal: exec.signal,
      timeoutMs: 10_000,
    })
  },
}

export const statusToolDefinition = {
  name: 'git_worktree_status',
  description: 'Inspect local staged, unstaged, untracked, conflicted, and locally known upstream status for every Git worktree associated with the repository where DeepSeek Harness was launched. This tool is read-only and does not fetch remote state.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {},
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['worktrees', 'remoteStateRefreshed'],
      properties: {
        worktrees: {
          type: 'array',
          items: statusWorktreeSchema,
        },
        remoteStateRefreshed: { type: 'boolean', const: false },
      },
    },
    render: (_args, value) => [{ type: 'text', text: renderWorktreeStatus(value) }],
  },
  timeoutMs: 15_000,
  isConcurrencySafe: () => true,
  async execute(_args, exec) {
    return getGitWorktreeStatus({
      cwd: launchDirectory,
      signal: exec.signal,
      timeoutMs: 10_000,
    })
  },
}

export const compareToolDefinition = {
  name: 'git_worktree_compare',
  description: 'Compare the committed HEAD of every linked Git worktree with the primary worktree HEAD captured from the repository where DeepSeek Harness was launched. Returns commit relationships and bounded changed-file summaries. This tool is read-only.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {},
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['base', 'comparisons'],
      properties: {
        base: {
          type: 'object',
          additionalProperties: false,
          required: ['path', 'head', 'branch'],
          properties: {
            path: { type: 'string' },
            head: nullableString,
            branch: nullableString,
          },
        },
        comparisons: { type: 'array', items: comparisonSchema },
      },
    },
    render: (_args, value) => [{ type: 'text', text: renderWorktreeComparison(value) }],
  },
  timeoutMs: 15_000,
  isConcurrencySafe: () => true,
  async execute(_args, exec) {
    return compareGitWorktrees({
      cwd: launchDirectory,
      signal: exec.signal,
      timeoutMs: 10_000,
    })
  },
}

const launchDirectory = process.cwd()

export function apply(ctx) {
  ctx.tools.register(toolDefinition)
  ctx.tools.register(statusToolDefinition)
  ctx.tools.register(compareToolDefinition)
}
