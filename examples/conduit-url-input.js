// Shared "Conduit URL" input control for this directory's own demo
// pages (currently just examples/widget-gallery/index.html) — demo-only
// tooling, not part of the actual API/widgets it tries out. A second,
// identical copy lives in packages/widgets/ for that directory's own demo pages
// (packages/widgets/xyz-waitlist/index.html, packages/widgets/xyz-reactions/index.html)
// — each top-level section stays self-contained rather than reaching
// across into the other's files, same reasoning basic-form/style.css's
// own comment gives for staying byte-identical to
// basic-ajax-form/style.css instead of sharing one copy.
//
// Not `type="module"`: Chromium blocks a module script on a file://
// page. Load this before the page's own inline <script type="module">;
// a global function declared by a classic script is still reachable
// from a module's own scope, it's just not an import.
//
// A self-hosted Gateway's default conduit URL has the shape
// {origin}/{curi}, no path prefix (see the Gateway README's own
// routing section) — and a conduit is commonly identified by its curi
// alone, not the full URL, so this control accepts a bare curi as the
// common case. This assumes the demo page and the Gateway share one
// origin, true for a self-hosted single-process deployment; it is not
// a safe assumption for a deployment where conduit traffic lives on a
// separate host from wherever this page itself is served (a managed
// hosting arrangement with a split dashboard/data-plane, say) — paste
// the full cross-origin URL directly in that case instead of a bare
// curi.

const CURI_PATTERN = /^[A-Za-z0-9_-]{12}$/

function knownOrigin() {
  return location.protocol === 'http:' || location.protocol === 'https:' ? location.origin : null
}

// Accepts a bare curi (built against this page's own origin) or a
// full http(s) URL, used exactly as given — including one on a
// different origin entirely (a managed deployment's conduit traffic
// commonly lives on a separate data-plane host from wherever this
// page itself is served; see this file's own top comment). Only a
// bare value this short is ever treated as "just a curi" — anything
// that already parses as a URL is trusted as one, on whatever origin
// it names.
function resolveConduitUrl(rawValue, prefix) {
  const value = rawValue.trim()
  if (!value) return null

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null
  } catch {
    // Not a full URL — fall through to the bare-curi case below.
  }

  if (!prefix) return null // no known origin (opened via file://) to build one against
  return CURI_PATTERN.test(value) ? prefix + value : null
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
  const prefix = origin ? `${origin}/` : null
  const storageStateKey = storageKey ? `conduit-url:${storageKey}` : null

  if (prefix) {
    prefixEl.textContent = prefix
  } else {
    prefixEl.hidden = true
    input.placeholder = 'https://conduits.xyz/…'
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
      // .conduits/readyz — reachable regardless of RACM or a bearer token.
      const response = await fetch(`${url}/.conduits/readyz`)
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
