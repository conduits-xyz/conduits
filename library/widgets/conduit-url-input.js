// The "Conduit URL" field on each widget's demo page and in the
// library/pages tutorials. Demo tooling only; the widgets don't use it.
//
// A classic script, since Chromium blocks module scripts on file://
// pages. Load it before the page's module script, which can call its
// global functions.
//
// Accepts a bare curi, resolved against the Gateway's origin (see
// knownOrigin), or a full URL. A self-hosted Gateway serves conduits at
// {origin}/{curi}; when the page and the Gateway are on different
// origins, paste the full URL.

const CURI_PATTERN = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/

function knownOrigin() {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return null
  if ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') && location.port === '8080') {
    return `${location.protocol}//${location.hostname}:8787`
  }
  // On conduits.xyz hosts the page comes from the marketing host, and
  // conduits are served from its run. subdomain.
  if (location.hostname === 'conduits.xyz' || location.hostname.endsWith('.conduits.xyz')) {
    return `${location.protocol}//run.${location.hostname}`
  }
  return location.origin
}

// A bare curi is resolved against knownOrigin(); a value that parses as
// a URL is used as given, on whatever origin it names.
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
//   inputId, prefixId, statusId: ids of elements in the page's markup.
//   checkButtonId: optional; clicking it runs the reachability check,
//     as Enter in the input always does.
//   onChange(url | null): called with the URL once the check confirms
//     it is reachable, and with null before each check and when one
//     fails.
//   resetButtonId: optional; clicking it clears the input, forgets the
//     stored value and calls onChange(null).
//   storageKey: optional; the last value that passed its check is kept
//     in localStorage under this key and restored, and checked again,
//     on the next visit. Skipped where storage is unavailable. Use one
//     key per input (e.g. 'waitlist').
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
      // As in readStoredValue.
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
