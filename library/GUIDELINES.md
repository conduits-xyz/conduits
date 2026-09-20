# Widget guidelines

These are hard requirements for every widget accepted into the public library.

- [ ] Zero dependencies, buildless, and framework-free.
- [ ] No external runtime dependencies.
- [ ] Unique custom-element name.
- [ ] README with installation, configuration, and conduit contract.
- [ ] Runnable detail-page demo included; add a separate showcase example when
	the widget needs a page-level integration example.
- [ ] Valid JSON metadata for the widget; include example metadata when a
	separate showcase is provided.
- [ ] Non-networked `demo.html` that renders the widget chrome without fetching, submitting, or writing visitor state.
- [ ] Optional static PNG or WebP screenshot at 1600 x 1000 pixels.
- [ ] Embed snippet documented and tested during review.
- [ ] CSS scoped to the widget; no global selectors.
- [ ] No global page mutation or secrets in browser code.
- [ ] Semantic, labeled, keyboard-accessible controls.
- [ ] Usable on narrow screens.
- [ ] Reduced-motion handling for animation.
- [ ] License included and assets properly licensed.
- [ ] Contributor attribution included in `widget.json` with at least an author name.
- [ ] Repository checks pass.

## Demo and screenshot standard

Every published widget must include a `demo.html` entrypoint and support the
boolean `demo` attribute. Demo mode renders the complete widget chrome but
disables submission, voting, network requests, and persistent visitor state.
The widget detail page is the interactive demo entry point; the catalog links
to that detail page from `View widget`. Screenshots are
optional fallbacks for documentation or social previews.

Use a 1600 x 1000 PNG or WebP with a light neutral background, the actual rendered widget in a minimal realistic context, no personal data or secrets, and no unlicensed logos. Keep the crop consistent and show the useful state without relying on hover.

## FAQ

### Can I submit an example by itself?

No. Examples are showcase material for a widget and must be included with a widget submission.

### Can I use React, Vue, or another framework?

No. The published widget must be framework-free, buildless, and usable without installing dependencies.

### Can I publish before review?

No. Only approved submissions appear in the public library.

### Who assigns the trust badge and category?

Maintainers assign the final category and publish approved community widgets as `Verified Community`. Conduits-maintained widgets are `Official`. Every widget card credits the author supplied in `widget.json`; optional website and social fields can provide a direct link to the contributor.
