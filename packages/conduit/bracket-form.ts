// Expands bracket-notation field names into nested objects, as `qs`
// does, so form-encoded bodies can express the JSON shapes:
// `fields[name]=Ada` -> `{fields: {name: 'Ada'}}`,
// `records[0][fields][name]=Ada` -> `{records: [{fields: {name: 'Ada'}}]}`.
// A key without brackets (`name=Ada`) is read as `fields[name]`, so a
// plain HTML form works without knowing the envelope. A key given more
// than once, or ending in `[]` (`flavors[]=Lemon`, `fields[flavors][]=
// Lemon`), is a list, as a multi_select field takes: a group of
// checkboxes sharing one name.

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
  // `[]` at the end: append to the list.
  const isList = path.length > 1 && path[path.length - 1] === ''
  const keys = isList ? path.slice(0, -1) : path
  let current: Record<string, unknown> = target
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const nextIsIndex = /^\d+$/.test(keys[i + 1])
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = nextIsIndex ? [] : {}
    }
    current = current[key] as Record<string, unknown>
  }
  const last = keys[keys.length - 1]
  const existing = current[last]
  if (isList) current[last] = Array.isArray(existing) ? [...existing, value] : existing === undefined ? [value] : [existing, value]
  else if (existing === undefined) current[last] = value
  else current[last] = Array.isArray(existing) ? [...existing, value] : [existing, value]
}

export function expandBracketForm(rawEntries: Iterable<[string, string]>): Record<string, unknown> {
  const entries = Array.from(rawEntries)
  const result: Record<string, unknown> = {}
  // A plain name ending in `[]` is still a plain name.
  const plain = (rawKey: string) => rawKey.replace(/\[]$/, '')
  const hasBracketedKey = entries.some(([rawKey]) => plain(rawKey).includes('['))

  for (const [rawKey, value] of entries) {
    if (!hasBracketedKey) {
      // No bracket notation: every field goes under `fields`.
      setAtPath(result, rawKey.endsWith('[]') ? ['fields', plain(rawKey), ''] : ['fields', rawKey], value)
      continue
    }
    setAtPath(result, parseKeyPath(rawKey), value)
  }

  return result
}
