// Shared "Conduit URL" input control for this directory's own demo
// pages (packages/widgets/xyz-waitlist/index.html, packages/widgets/xyz-reactions/
// index.html) — not part of any widget itself. Each widget's own .js
// file (xyz-waitlist.js, xyz-reactions.js) stays fully self-contained
// and copyable on its own; this file is demo-only tooling for trying
// them out. A second, identical copy lives in examples/ for that
// directory's own demo pages (examples/widget-gallery/index.html, and
// the basic-form/basic-ajax-form pair) — each top-level section stays
// self-contained rather than reaching across into the other's files,
// same reasoning basic-form/style.css's own comment gives for staying
// byte-identical to basic-ajax-form/style.css instead of sharing one
// copy.
//
// Not `type="module"`: Chromium blocks a module script on a file://
// page. Load this before the page's own inline <script type="module">;
// a global function declared by a classic script is still reachable
// from a module's own scope, it's just not an import.
//
// Every conduit's URL has the same shape — {origin}/api/{curi} — and a
// conduit is commonly identified by its curi alone, not the full URL,
// so this control accepts a bare curi as the common case.

const CURI_PATTERN = /^[A-Za-z0-9_-]{12}$/

function knownOrigin() {
  return location.protocol === 'http:' || location.protocol === 'https:' ? location.origin : null
}

// Accepts a bare curi, a full URL against this exact page's own
// origin, or a full URL copied from somewhere else entirely — in the
// last case the curi is pulled out and rebuilt against *this* origin,
// since a curi only ever resolves against the deployment that issued
// it.
function resolveConduitUrl(rawValue, prefix) {
  const value = rawValue.trim()
  if (!value) return null

  if (!prefix) {
    // No known origin (opened via file://, not served live) — nothing
    // to build a prefix from, so this behaves like a plain URL field.
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:' ? value : null
    } catch {
      return null
    }
  }

  if (CURI_PATTERN.test(value)) return prefix + value
  if (value.startsWith(prefix) && CURI_PATTERN.test(value.slice(prefix.length))) return value

  const lastSegment = value.replace(/\/+$/, '').split('/').pop()
  return lastSegment && CURI_PATTERN.test(lastSegment) ? prefix + lastSegment : null
}

// options:
//   inputId, prefixId, statusId — element ids already in the page's
//     own static markup (see any of the three demo pages for the shape).
//   onChange(url | null) — wire up widgets/iframes here. Called with a
//     real URL only once the health check below confirms it's
//     reachable, never with a URL that's merely well-formed. Called
//     with `null` immediately on blur (nothing confirmed yet) and again
//     if the health check fails.
//   storageKey — optional. When given, the last value that passed its
//     health check is remembered in localStorage under this key and
//     restored (and re-validated) on the next visit to any page on this
//     origin that sets up an input with the same key. Best-effort only
//     (private browsing, disabled site data just skip it silently);
//     pick a key unique to what that input configures (e.g.
//     'waitlist', 'reactions').
function setupConduitUrlInput({ inputId, prefixId, statusId, onChange, storageKey }) {
  const input = document.getElementById(inputId)
  const prefixEl = document.getElementById(prefixId)
  const status = document.getElementById(statusId)
  const origin = knownOrigin()
  const prefix = origin ? `${origin}/api/` : null
  const storageStateKey = storageKey ? `conduit-url:${storageKey}` : null

  if (prefix) {
    prefixEl.textContent = prefix
  } else {
    prefixEl.hidden = true
    input.placeholder = 'https://conduits.xyz/api/…'
  }

  function setStatus(state, text) {
    status.textContent = text
    status.dataset.state = state
  }

  function readStoredValue() {
    if (!storageStateKey) return null
    try {
      return localStorage.getItem(storageStateKey)
    } catch {
      return null
    }
  }

  function writeStoredValue(value) {
    if (!storageStateKey) return
    try {
      if (value) localStorage.setItem(storageStateKey, value)
      else localStorage.removeItem(storageStateKey)
    } catch {
      // Best-effort only — same as readStoredValue above.
    }
  }

  async function check() {
    const url = resolveConduitUrl(input.value, prefix)
    if (!url) {
      if (input.value.trim()) {
        setStatus('error', prefix ? 'Enter a valid conduit ID.' : 'Enter a valid conduit URL.')
      } else {
        writeStoredValue(null) // clearing the field on purpose forgets it too
      }
      onChange(null)
      return
    }

    onChange(null) // never wire up an unconfirmed URL, not even while checking
    setStatus('pending', 'Checking…')
    try {
      // /readyz — reachable regardless of RACM or a bearer token.
      const response = await fetch(`${url}/readyz`)
      if (response.ok) {
        setStatus('ok', 'Reachable.')
        onChange(url)
        writeStoredValue(input.value.trim())
      } else if (response.status === 404) {
        setStatus('error', 'No conduit found at that address.')
      } else {
        setStatus('error', `Conduit responded with ${response.status}.`)
      }
    } catch {
      setStatus('error', 'Could not reach the server.')
    }
  }

  input.addEventListener('focus', () => setStatus('', ''))
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur()
  })
  input.addEventListener('blur', check)

  const stored = readStoredValue()
  if (stored) {
    input.value = stored
    check()
  }
}
