function setupWidgetCopyButton({ buttonId, tag, slug, attributes = {} }) {
  const button = document.getElementById(buttonId)
  if (!button) return

  button.addEventListener('click', async () => {
    const attributeText = Object.entries(attributes)
      .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
      .join('')
    const snippet = `<link rel="stylesheet" href="/library/widgets/${slug}/style.css">\n<script src="/library/widgets/${slug}/${slug}.js"></script>\n<${tag}${attributeText} conduit-url="YOUR_CONDUIT_URL"></${tag}>`
    try {
      await navigator.clipboard.writeText(snippet)
      button.textContent = 'Copied'
      setTimeout(() => { button.textContent = 'Copy code' }, 1400)
    } catch {
      button.textContent = 'Copy unavailable'
    }
  })
}

// Same reasoning as conduit-url-input.js's own knownOrigin(): this page
// is only ever served from the bare marketing host of whichever
// environment it's actually running in (dev.conduits.xyz/
// staging.conduits.xyz/conduits.xyz, always the pattern "<thing>,
// app.<thing>, run.<thing>"), so the real signup page for *this*
// environment is always "app." prepended to
// this same host — never a config value that's the same no matter
// which of the three it's loaded from. config.js's own signupUrl (if a
// deployment sets one) still wins when present, for a genuinely
// different/self-hosted signup destination — it's an override now, not
// the only source.
function defaultSignupUrl() {
  const { hostname, protocol } = location
  if (hostname === 'conduits.xyz' || hostname.endsWith('.conduits.xyz')) {
    return `${protocol}//app.${hostname}`
  }
  return 'https://conduits.xyz'
}

function setupLibrarySignupLink() {
  const signupUrl = window.conduitsLibraryConfig?.signupUrl || defaultSignupUrl()
  document.querySelectorAll('[data-library-signup]').forEach((link) => {
    link.href = signupUrl
    try {
      link.textContent = `Sign up at ${new URL(signupUrl).hostname} to get a free 3-pack.`
    } catch {
      // Keep the default link text when a deployment URL is malformed.
    }
  })
}

setupLibrarySignupLink()

function escapeAttribute(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}