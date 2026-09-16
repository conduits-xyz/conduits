// Expands bracket-notation form field names into a nested object — the
// same convention `qs`/body-parser's `urlencoded({extended: true})` uses,
// so a plain HTML form (or any x-www-form-urlencoded / multipart client)
// can express the same `{fields: {...}}` / `{records: [{fields: {...}}]}`
// shape as a JSON body: `fields[name]=Ada` -> `{fields: {name: 'Ada'}}`,
// `records[0][fields][name]=Ada` -> `{records: [{fields: {name: 'Ada'}}]}`.
//
// A key with no brackets at all (`name=Ada`) is treated as if written
// `fields[name]=Ada` — a bare HTML form's fields are the record's fields;
// nobody hand-writing a <form> should have to know the envelope exists.

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
      // A bare HTML form with no bracket notation at all — treat every
      // field as belonging under `fields`, so a plain <form> never needs
      // to know the envelope exists.
      setAtPath(result, ['fields', rawKey], value)
      continue
    }
    setAtPath(result, parseKeyPath(rawKey), value)
  }

  return result
}
