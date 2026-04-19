/**
 * Check if a value is defined (not undefined).
 */
export function isDef<T>(value: T | undefined | null): value is T {
  return value !== void 0
}

/**
 * Check if a value is non-nullable (not null and not undefined).
 */
export function isNonNullable<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}
