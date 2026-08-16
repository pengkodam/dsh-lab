function inline(value) {
  return value
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
}

function describeState(worktree) {
  const states = []
  if (worktree.isMain) states.push('main')
  if (worktree.bare) states.push('bare')
  if (worktree.detached) states.push('detached HEAD')
  if (worktree.locked) {
    states.push(worktree.lockReason ? `locked: ${inline(worktree.lockReason)}` : 'locked')
  }
  if (worktree.prunable) {
    states.push(worktree.prunableReason ? `prunable: ${inline(worktree.prunableReason)}` : 'prunable')
  }
  return states.length > 0 ? ` [${states.join('; ')}]` : ''
}

export function renderWorktreeList(value) {
  const count = value.worktrees.length
  const lines = [`Found ${count} Git worktree${count === 1 ? '' : 's'}:`]

  for (const worktree of value.worktrees) {
    const revision = worktree.head === null ? 'no HEAD' : worktree.head.slice(0, 12)
    const branch = worktree.branch ?? (worktree.detached ? 'detached' : 'no branch')
    lines.push(`- ${inline(worktree.path)} — ${branch} @ ${revision}${describeState(worktree)}`)
  }

  return lines.join('\n')
}

export function renderWorktreeStatus(value) {
  const available = value.worktrees.filter(worktree => worktree.available)
  const dirty = available.filter(worktree => !worktree.clean)
  const unavailable = value.worktrees.length - available.length
  const summary = [
    `${value.worktrees.length} total`,
    `${dirty.length} dirty`,
    `${available.length - dirty.length} clean`,
  ]
  if (unavailable > 0) summary.push(`${unavailable} unavailable`)

  const lines = [`Worktree status (${summary.join(', ')}):`]
  for (const worktree of value.worktrees) {
    const label = worktree.branch ?? 'detached'
    const main = worktree.isMain ? ' [main]' : ''
    if (!worktree.available) {
      lines.push(`- ${inline(worktree.path)} — ${label}${main}: unavailable (${worktree.unavailableReason})`)
      continue
    }
    if (worktree.clean) {
      lines.push(`- ${inline(worktree.path)} — ${label}${main}: clean`)
      continue
    }
    lines.push(`- ${inline(worktree.path)} — ${label}${main}: staged ${worktree.staged}, unstaged ${worktree.unstaged}, untracked ${worktree.untracked}, conflicted ${worktree.conflicted}`)
  }
  if (available.some(worktree => worktree.upstream !== null)) {
    lines.push('Upstream ahead/behind counts use local refs; no remote state was fetched.')
  }
  return lines.join('\n')
}

export function renderWorktreeComparison(value) {
  const baseBranch = value.base.branch ?? 'detached'
  const baseRevision = value.base.head === null ? 'no HEAD' : value.base.head.slice(0, 12)
  const lines = [`Worktree comparisons against ${inline(value.base.path)} — ${baseBranch} @ ${baseRevision}:`]

  if (value.comparisons.length === 0) {
    lines.push('- No linked worktrees to compare.')
    return lines.join('\n')
  }

  for (const comparison of value.comparisons) {
    const branch = comparison.branch ?? 'detached'
    if (comparison.relationship === 'unavailable') {
      lines.push(`- ${inline(comparison.path)} — ${branch}: unavailable (${comparison.unavailableReason})`)
      continue
    }
    const counts = `base +${comparison.baseOnlyCommits}, target +${comparison.targetOnlyCommits}`
    const files = comparison.filesTruncated
      ? `${comparison.files.length}+ changed files`
      : `${comparison.files.length} changed file${comparison.files.length === 1 ? '' : 's'}`
    lines.push(`- ${inline(comparison.path)} — ${branch}: ${comparison.relationship}; ${counts}; ${files}`)
  }
  lines.push('These are review signals, not a guarantee that a worktree is safe to merge.')
  return lines.join('\n')
}
