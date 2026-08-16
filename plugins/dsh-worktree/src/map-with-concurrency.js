import { ErrorCode, WorktreeError } from './errors.js'

export async function mapWithConcurrency(items, limit, signal, mapper) {
  if (signal?.aborted) throw new WorktreeError(ErrorCode.ABORTED)
  if (items.length === 0) return []

  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', abort, { once: true })

  const results = new Array(items.length)
  let nextIndex = 0
  let firstError = null

  async function worker() {
    while (firstError === null) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      try {
        results[index] = await mapper(items[index], controller.signal)
      } catch (error) {
        if (firstError === null) {
          firstError = error
          controller.abort(error)
        }
      }
    }
  }

  try {
    await Promise.all(Array.from(
      { length: Math.min(Math.max(1, limit), items.length) },
      () => worker(),
    ))
  } finally {
    signal?.removeEventListener('abort', abort)
  }

  if (firstError !== null) throw firstError
  if (signal?.aborted) throw new WorktreeError(ErrorCode.ABORTED)
  return results
}
