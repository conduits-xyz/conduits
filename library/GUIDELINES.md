# Widget guidelines

These are hard requirements for every widget accepted into the public library.

- [ ] Zero dependencies, buildless, and framework-free.
- [ ] No external runtime dependencies.
- [ ] Unique custom-element name.
- [ ] README with installation, configuration, and conduit contract.
- [ ] Runnable detail-page demo included; add a separate showcase page when
	  the widget needs a page-level integration example.
- [ ] Valid JSON metadata uses only the contributor fields documented in
	  [`CONTRIBUTING.md`](CONTRIBUTING.md).
- [ ] Non-networked `demo.html` that renders the widget chrome without fetching, submitting, or writing visitor state.
- [ ] Embed snippet documented and tested during review.
- [ ] CSS scoped to the widget; no global selectors.
- [ ] No global page mutation or secrets in browser code.
- [ ] Semantic, labeled, keyboard-accessible controls.
- [ ] Usable on narrow screens.
- [ ] Reduced-motion handling for animation.
- [ ] The widget and its assets are compatible with the repository's MIT license.
- [ ] Contributor attribution included in `widget.json` with at least an author name.
- [ ] Repository checks pass.

## Demo standard

Every published widget must include a `demo.html` entrypoint and support the
boolean `demo` attribute. Demo mode renders the complete widget chrome but
disables submission, voting, network requests, and persistent visitor state.
The widget detail page is the interactive demo entry point; the catalog links
to that detail page from `View widget`.

The repository's MIT license is the distribution baseline. Do not include
third-party assets, dependencies, or content that cannot be redistributed
under that license.

## FAQ

### Can I submit a page by itself?

Integration tutorials are maintained in `library/pages` (`kind: "page"` in
its `page.json`, mirroring a widget's own `widget.json`). A community
submission should include a separate page only when the widget detail page
does not adequately demonstrate its page-level integration.

### Can I use React, Vue, or another framework?

No. The published widget must be framework-free, buildless, and usable without installing dependencies.

### Can I publish before review?

No. Only approved submissions appear in the public library.

### Who assigns tags and featured placement?

Contributors may suggest up to five tags. A good tag describes the visitor's
goal or the job the widget helps someone complete. Use terms that a person
would recognize when looking for a ready-made component, such as
`contact-information`, `event-registration`, `rsvp`, `feedback`,
`order-form`, `job-application`, `appointment-request`, `survey`, or
`newsletter-signup`.

Avoid tags that describe implementation details or delivery mechanisms rather
than user value. Examples include `static`, `api`, `javascript`, `react`,
`html`, and `fetch`. These are reserved and rejected by the validator. A
specific task such as `order-form` is useful; a generic implementation label
such as `forms` is not. Tags must be lowercase words separated by single
hyphens; use specific, reusable terms rather than promotional claims, internal
project names, or duplicate variants. Maintainers may reserve additional
terms when they conflict with library structure or moderation needs.

Every widget card provides clickable social attribution when handles are
included in `widget.json`; the catalog constructs the destination URLs.
