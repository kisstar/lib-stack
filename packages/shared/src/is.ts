/**
 * Check if a value is defined (not undefined and not null).
 */
export function isDef<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null
}
