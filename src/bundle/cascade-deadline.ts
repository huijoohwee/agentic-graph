export const CASCADE_DEADLINE = Symbol('cascade-deadline')

export function deadlineExpired(deadlineAt: number): boolean {
  return Date.now() >= deadlineAt
}

export function rpcPromise<T>(operation: unknown): PromiseLike<T> {
  return operation as PromiseLike<T>
}

export async function withinCascadeDeadline<T>(
  operation: () => T | PromiseLike<T>,
  deadlineAt: number,
): Promise<T | typeof CASCADE_DEADLINE> {
  const remainingMs = deadlineAt - Date.now()
  if (remainingMs <= 0) return CASCADE_DEADLINE
  const running = Promise.resolve().then(operation)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<typeof CASCADE_DEADLINE>((resolve) => {
    timer = setTimeout(() => resolve(CASCADE_DEADLINE), remainingMs)
  })
  try {
    return await Promise.race([running, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
