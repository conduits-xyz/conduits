window.conduitsLibraryConfig = {
  // The product's domain. On it and its subdomains, the demo pages call
  // conduits on the run. host and sign up on the app. host of the host
  // that served the page (conduit-url-input.js, detail-actions.js).
  // Unset, every host is a self-hosted gateway's.
  productDomain: 'conduits.xyz',
  // signupUrl is unset: detail-actions.js derives it from the host that
  // served the page, or the product's domain. Set it only for a
  // different signup page, such as a self-hosted dashboard.
  featuredWidgets: ['xyz-contact-form', 'xyz-feedback', 'xyz-reactions'],
  // Whether `hostname` is the product's domain or one of its subdomains.
  isProductHost(hostname) {
    const domain = this.productDomain
    return Boolean(domain) && (hostname === domain || hostname.endsWith(`.${domain}`))
  },
}