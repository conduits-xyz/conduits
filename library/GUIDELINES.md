# Widget guidelines

Each widget in the public library must meet all these requirements.

## Checklist

- [ ] No dependencies, no build step, and no framework.
- [ ] No external files at runtime.
- [ ] A unique custom element name.
- [ ] A README with the embed snippet, the attributes, and the conduit
      setup.
- [ ] A `demo.html` that shows the widget but sends no requests and
      keeps no visitor state.
- [ ] Support for the boolean `demo` attribute.
- [ ] `widget.json` with only the fields in
      [`CONTRIBUTING.md`](CONTRIBUTING.md#metadata), including an author
      name.
- [ ] CSS scoped to the widget. No global selectors.
- [ ] No changes to the page outside the widget.
- [ ] No secrets in browser code.
- [ ] Controls with labels, correct elements, and keyboard access.
- [ ] A layout that works on narrow screens.
- [ ] Animation that obeys `prefers-reduced-motion`.
- [ ] All files compatible with the MIT license.
- [ ] `npm run validate:library` and `npm test` pass.
- [ ] A maintainer tested the embed snippet.

For the details of scope, layout, theme, markup, and escaping, see
[Rules for widget authors](widgets/README.md#rules-for-widget-authors).

## Demo mode

Each widget must have `demo.html` and must accept the boolean `demo`
attribute. In demo mode, the widget shows its full interface. It does
not submit, vote, send requests, or keep visitor state. The catalog's
"View widget" link opens the widget's detail page, which is the demo.

## Tags

A tag tells what the visitor wants to do. Use words that a person who
looks for a component knows, for example `contact-information`,
`event-registration`, `rsvp`, `feedback`, `order-form`,
`job-application`, `appointment-request`, `survey`, or
`newsletter-signup`.

- Use a specific task, for example `order-form`, not a general label
  such as `forms`.
- Do not use claims, internal project names, or variants of the same
  tag.
- The validator refuses these tags: `api`, `forms`, `javascript`,
  `react`, `html`, `fetch`, `static`. Maintainers can reserve more.

## Questions

**Can I submit a page without a widget?**
No. Maintainers write the tutorials in `library/pages`. Add a page only
when your widget's detail page cannot show its page-level integration.

**Can I use React, Vue, or another framework?**
No. A widget must work without a framework, a build step, or installed
dependencies.

**Can I publish before review?**
No. Only approved widgets appear in the library.

**Who chooses tags and featured places?**
You can suggest up to five tags. Maintainers choose featured places.
