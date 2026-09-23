// Real HTTP content negotiation (RFC 7231 §5.3.2) for the one question
// dispatch.ts needs answered: does this GET explicitly prefer an HTML
// representation over the conduit's normal API representation? Not
// "Accept contains text/html" (a REST client that lists text/html as a
// low-priority fallback would wrongly get a page) and not "Accept isn't
// application/json" (a bare curl/fetch call with no Accept header, or
// Accept: */*, must keep getting the existing API response). HTML wins
// only when it's a strictly better
// match than the API representation — a tie (e.g. a bare `*/*`, or no
// Accept header at all) always preserves existing behavior.
interface MediaRange {
  type: string
  subtype: string
  q: number
}

function parseAccept(header: string): MediaRange[] {
  const ranges: MediaRange[] = []
  for (const part of header.split(',')) {
    const segments = part.trim().split(';').map((s) => s.trim())
    const range = segments[0]
    if (!range) continue
    const [type, subtype] = range.split('/')
    if (!type || !subtype) continue

    let q = 1
    for (const param of segments.slice(1)) {
      const [key, value] = param.split('=')
      if (key === 'q' && value !== undefined) {
        const parsed = Number(value)
        if (!Number.isNaN(parsed)) q = parsed
      }
    }
    if (q > 0) ranges.push({ type: type.toLowerCase(), subtype: subtype.toLowerCase(), q })
  }
  return ranges
}

// The best (q, specificity) a set of ranges offers for one concrete
// type/subtype — specificity 2 (exact match) beats 1 (type/*) beats 0
// (*/*), higher q winning ties at the same specificity. null means no
// range in the Accept header matches this representation at all.
function bestMatch(ranges: MediaRange[], type: string, subtype: string): { q: number; specificity: number } | null {
  let best: { q: number; specificity: number } | null = null
  for (const range of ranges) {
    let specificity: number
    if (range.type === type && range.subtype === subtype) specificity = 2
    else if (range.type === type && range.subtype === '*') specificity = 1
    else if (range.type === '*' && range.subtype === '*') specificity = 0
    else continue

    if (!best || specificity > best.specificity || (specificity === best.specificity && range.q > best.q)) {
      best = { q: range.q, specificity }
    }
  }
  return best
}

export function wantsHtml(acceptHeader: string | null): boolean {
  if (!acceptHeader) return false // missing Accept -> preserve API representation

  const ranges = parseAccept(acceptHeader)
  const html = bestMatch(ranges, 'text', 'html')
  if (!html) return false // no range matches text/html at all -> API representation

  const json = bestMatch(ranges, 'application', 'json')
  if (!json) return true // html matched something (even a wildcard) and json matched nothing

  // Strictly better, not merely equal — Accept: */* matches both at the
  // same (q, specificity) and must still preserve API behavior.
  if (html.q !== json.q) return html.q > json.q
  return html.specificity > json.specificity
}
