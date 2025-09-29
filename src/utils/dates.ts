export function nowIso(): string {
  return new Date().toISOString();
}

export function timestampWithOffset(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}
