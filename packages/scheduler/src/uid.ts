let counter = 0

export function uid(): string {
  return `task_${++counter}`
}

export function resetUid(): void {
  counter = 0
}
