window.conduitsLibraryConfig = {
  // No signupUrl here on purpose — detail-actions.js's own
  // defaultSignupUrl() already derives the right one for whichever of
  // dev/staging/production this exact static file happens to be served
  // from ("app." prepended to the current marketing host). This file is
  // one static asset served identically to all three environments, so
  // it can't itself hold a value that's correct for more than one of
  // them — set signupUrl here only for a genuinely different signup
  // destination (a self-hosted deployment's own dashboard, say).
  featuredWidgets: ['xyz-contact-form', 'xyz-feedback', 'xyz-reactions'],
}