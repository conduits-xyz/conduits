// Expands bracket-notation field names into nested objects, as `qs`
// does, so form-encoded bodies can express the JSON shapes:
// `fields[name]=Ada` -> `{fields: {name: 'Ada'}}`,
// `records[0][fields][name]=Ada` -> `{records: [{fields: {name: 'Ada'}}]}`.
// A key without brackets (`name=Ada`) is read as `fields[name]`, so a
// plain HTML form works without knowing the envelope.

function parseKeyPath(rawKey: string): string[] {
  const match = rawKey.match(/^([^[\]]+)((?:\[[^[\]]*])*)$/)
  if (!match) return [rawKey]
  const [, root, brackets] = match
  const path = [root]
  const bracketPattern = /\[([^[\]]*)]/g
  let segment: RegExpExecArray | null
  while ((segment = bracketPattern.exec(brackets))) path.push(segment[1])
  return path
}

function setAtPath(target: Record<string, unknown>, path: string[], value: string): void {
  let current: Record<string, unknown> = target
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    const nextIsIndex = /^\d+$/.test(path[i + 1])
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = nextIsIndex ? [] : {}
    }
    current = current[key] as Record<string, unknown>
  }
  current[path[path.length - 1]] = value
}

export function expandBracketForm(rawEntries: Iterable<[string, string]>): Record<string, unknown> {
  const entries = Array.from(rawEntries)
  const result: Record<string, unknown> = {}
  const hasBracketedKey = entries.some(([rawKey]) => rawKey.includes('['))

  for (const [rawKey, value] of entries) {
    if (!hasBracketedKey) {
      // No bracket notation: every field goes under `fields`.
      setAtPath(result, ['fields', rawKey], value)
      continue
    }
    setAtPath(result, parseKeyPath(rawKey), value)
  }

  return result
}
