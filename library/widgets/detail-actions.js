// On a host of the product's domain (config.js) the signup page is the
// app. subdomain of the current host (as in knownOrigin() in
// conduit-url-input.js); elsewhere, the product's domain. A configured
// signupUrl in config.js takes precedence. Null without either: the
// link keeps its own address.
function defaultSignupUrl() {
  const { hostname, protocol } = location
  const config = window.conduitsLibraryConfig
  if (!config?.productDomain) return null
  if (config.isProductHost(hostname)) return `${protocol}//app.${hostname}`
  return `https://${config.productDomain}`
}

function setupLibrarySignupLink() {
  const signupUrl = window.conduitsLibraryConfig?.signupUrl || defaultSignupUrl()
  if (!signupUrl) return
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
