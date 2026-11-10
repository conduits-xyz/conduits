// The JSON of `value` with every object's members in name order, so a
// hash of it doesn't depend on the order the members came in.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((name) => `${JSON.stringify(name)}:${canonicalJson((value as Record<string, unknown>)[name])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
