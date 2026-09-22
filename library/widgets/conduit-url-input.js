// Shared "Conduit URL" input control for every widget's own demo page
// (xyz-waitlist, xyz-reactions, xyz-contact-form, xyz-feedback,
// xyz-rsvp) and, by direct relative reference, library/pages/'s own
// tutorials — not part of any widget itself. Each widget's own .js
// file stays fully self-contained and copyable on its own; this file
// is demo-only tooling for trying them out.
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

const CURI_PATTERN = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/

function knownOrigin() {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return null
  if ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') && location.port === '8080') {
    return `${location.protocol}//${location.hostname}:8787`
  }
  return location.origin
}

// Accepts a bare curi (built against this page's own origin) or a
// full http(s) URL, used exactly as given — including one on a
// different origin entirely (a managed deployment's conduit traffic
// commonly lives on a separate data-plane host from wherever this
// page itself is served; see this file's own top comment). A bare value
// is treated as a conduit path; anything that already parses as a URL
// is trusted as one, on whatever origin it names.
function resolveConduitUrl(rawValue, prefix) {
  const value = rawValue.trim().replace(/^\/+|\/+$/g, '')
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
//   checkButtonId — optional. When given, clicking the button runs the
//     reachability check. Pressing Enter in the input always does the same.
//   onChange(url | null) — wire up widgets/iframes here. Called with a
//     real URL only once the explicit health check confirms it's reachable,
//     never with a URL that's merely well-formed. Called with `null` before
//     each check and when the check fails.
//   resetButtonId — optional. When given, clicking the button clears the
//     conduit, forgets the stored value, and calls onChange(null).
//   storageKey — optional. When given, the last value that passed its
//     health check is remembered in localStorage under this key and
//     restored (and re-validated) on the next visit to any page on this
//     origin that sets up an input with the same key. Best-effort only
//     (private browsing, disabled site data just skip it silently);
//     pick a key unique to what that input configures (e.g.
//     'waitlist', 'reactions').
function setupConduitUrlInput({ inputId, prefixId, statusId, checkButtonId, resetButtonId, onChange, storageKey }) {
  const input = document.getElementById(inputId)
  const prefixEl = document.getElementById(prefixId)
  const status = document.getElementById(statusId)
  const checkButton = checkButtonId ? document.getElementById(checkButtonId) : null
  const resetButton = resetButtonId ? document.getElementById(resetButtonId) : null
  let checkVersion = 0
  let confirmedValue = ''
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

  function updateCheckAvailability() {
    if (checkButton) checkButton.disabled = !input.value.trim()
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
    const rawValue = input.value.trim()
    if (!rawValue) {
      updateCheckAvailability()
      return
    }

    const currentCheck = ++checkVersion
    if (checkButton) checkButton.disabled = true
    const url = resolveConduitUrl(rawValue, prefix)
    if (!url) {
      if (rawValue) {
        setStatus('error', prefix ? 'Enter a valid conduit path.' : 'Enter a valid conduit URL.')
      } else {
        writeStoredValue(null) // clearing the field on purpose forgets it too
      }
      onChange(null)
      confirmedValue = ''
      updateCheckAvailability()
      return
    }

    onChange(null) // never wire up an unconfirmed URL, not even while checking
    setStatus('pending', 'Checking…')
    try {
      // .conduits/readyz — reachable regardless of RACM or a bearer token.
      const response = await fetch(`${url}/.conduits/readyz`)
      if (currentCheck !== checkVersion || input.value.trim() !== rawValue) return
      if (response.ok) {
        setStatus('ok', 'Reachable.')
        onChange(url)
        confirmedValue = rawValue
        writeStoredValue(rawValue)
      } else if (response.status === 404) {
        setStatus('error', 'No conduit found at that address.')
      } else {
        setStatus('error', `Conduit responded with ${response.status}.`)
      }
    } catch {
      setStatus('error', 'Could not reach the server.')
    }
    updateCheckAvailability()
  }

  input.addEventListener('input', () => {
    checkVersion += 1
    if (input.value.trim() !== confirmedValue) {
      confirmedValue = ''
      onChange(null)
      setStatus('', '')
    }
    updateCheckAvailability()
  })
  input.addEventListener('focus', () => setStatus('', ''))
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      check()
    }
  })
  checkButton?.addEventListener('click', check)

  resetButton?.addEventListener('click', () => {
    checkVersion += 1
    input.value = ''
    confirmedValue = ''
    writeStoredValue(null)
    setStatus('', '')
    onChange(null)
    updateCheckAvailability()
  })

  updateCheckAvailability()
  const stored = readStoredValue()
  if (stored) {
    input.value = stored
    check()
  }
}
