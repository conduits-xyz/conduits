# Widgets

Real, brand-agnostic widgets meant to be copied onto someone else's
site as-is — not reference code to read and adapt (that's
[`library/examples/`](../examples/README.md)). Buildless HTML/CSS/JS, no
framework, no build step, zero dependencies. Nothing here is deployed
as its own service, but it isn't GitHub-only either: this whole
directory is also served live at `https://conduits.xyz`, under a
stable `/library/` URL prefix, so every widget below is a real, linkable
URL — e.g. `https://conduits.xyz/library/widgets/xyz-waitlist/`.

Every widget uses the `xyz-` custom-element prefix, and every one of
them — along with `library/examples/basic-form` and
`library/examples/basic-ajax-form`
— shares one `--xyz-*` CSS custom-property vocabulary (font, colors,
radius, spacing). Set those once, on `:root` or any ancestor common to
everything you embed, and your whole brand applies across every widget
and form at once, not just one at a time. See [THEME.md](THEME.md) for
the complete property reference and examples for theming one or several
widgets.

- [`xyz-waitlist/`](xyz-waitlist/README.md) — a real `<xyz-waitlist>`
  custom element, battle-tested in production, not a simplified demo.
  First name + email capture, one script tag.
- [`xyz-reactions/`](xyz-reactions/README.md) — a real `<xyz-reactions>`
  custom element, battle-tested in production, not a simplified demo.
  Thumbs-up/thumbs-down, one script tag.
- [`xyz-contact-form/`](xyz-contact-form/README.md) — a real
  `<xyz-contact-form>` custom element. Name/email/message by default,
  with a built-in qualified-lead preset, and no CAPTCHA needed
  (conduits.xyz's own spam controls are gateway-level already).
- [`xyz-feedback/`](xyz-feedback/README.md) — a real `<xyz-feedback>`
  custom element. A scored rating, not free text — 5-star or
  10-point NPS, set with one `scale` attribute, plus an optional
  comment.
- [`xyz-rsvp/`](xyz-rsvp/README.md) — a real `<xyz-rsvp>` custom
  element. A tri-state yes/no/maybe response to an already-scheduled
  thing, with a guest-count field that only appears once someone's
  actually said yes.

## Demo mode

Every library widget also has a `demo.html` page and accepts the boolean
`demo` attribute. This renders the complete widget chrome without a conduit,
network requests, submissions, voting, or persistent visitor state. The widget
detail page is the interactive demo entry point; the public catalog links to
that page from each widget card.

## Self-containment

A widget in this directory must never depend on, or impact, the page
it's embedded in. Concretely, for every widget here (existing and
future):

- **Never depend on the host's stylesheet for baseline layout.** A
  widget's own `display`, box model, and everything else it needs to
  render correctly must come from the widget itself — set inline from
  its own JS, on `connectedCallback()`, not left to whatever the host
  page's CSS happens to provide (or not). An unknown custom element
  defaults to `display: inline` in every browser; a widget that relies
  on its own external `style.css` alone to fix that will flash unstyled
  and visibly reflow once that stylesheet finally loads — see
  `xyz-waitlist.js`/`xyz-reactions.js`'s own `connectedCallback()` for
  the pattern (`this.style.display ||= 'block'`, first line, before
  anything else runs).
- **Never leak an un-prefixed selector.** Every class a widget's own
  `style.css` defines is scoped under that widget's own
  `.xyz-<name>-*` prefix (or the bare custom-element tag itself, safe
  since a host can never coincidentally register that exact tag for
  something unrelated) — never a bare `button`, `input`, `p`, or
  similar, which would silently restyle the *host's* own unrelated
  elements too.
- **Never depend on the host's `box-sizing` convention.** Scope a
  `box-sizing: border-box` reset under the widget's own tag
  (`xyz-<name> *, xyz-<name> *::before, xyz-<name> *::after { box-sizing:
  inherit }`, set on the root element itself) rather than assuming a
  host has (or hasn't) reset it globally — a widget's own rendered
  size must never shift depending on what convention the page around
  it happens to use.
- **Never touch global browser state.** No listeners on `window`/
  `document`, no writes to `:root` or any custom property outside the
  widget's own tag. A widget may *read* a `--xyz-*` value a host sets
  (that's the theming contract, the one deliberate exception — a host
  customizing a widget it embeds, never the reverse) but must never
  set one globally itself.
- **Never pollute the shared script scope.** Every widget here is a
  classic (non-module) `<script>` on purpose (see any widget's own
  top comment for why — `file://` support, no build step), and classic
  scripts sharing a page share ONE global lexical scope. A host
  embedding more than one widget (the widget
  gallery does, all five at once) loads more than one of these files
  together — a top-level `let`/`const`/`class` with the same name in
  two widgets' files throws a `SyntaxError` the moment the second one
  parses, silently killing that widget with no visible error. Wrap
  every widget's entire file body in `;(function () { ... })()` — see
  any widget's own `.js` file for the pattern — so its own top-level
  names can never collide with another widget's, regardless of what
  either declares in the future.

Every widget here is held to this before it ships, not audited in
after something breaks.

## Theming: defaults live in `var()`, never on the widget's own tag

Every widget's own default for each `--xyz-*` property must be the
fallback argument to `var()` at each place that property is actually
used — `font-family: var(--xyz-font, system-ui, sans-serif)` — never
declared as the property's value on the widget's own tag selector
(`xyz-waitlist { --xyz-font: system-ui, sans-serif; }`). This isn't a
style preference: a custom property declared anywhere on an element,
at any specificity, always wins over one merely *inherited* from an
ancestor — so a widget-tag-scoped default silently defeats every
`:root` override a host ever sets, which is the entire point of this
vocabulary existing. This was a real, previously-shipped bug across
every widget and example form here, found and fixed while confirming
the promise this section makes actually holds. A host still overriding a property directly on
the widget's own tag (or a class on it, `.hero-widget-widget { --xyz-accent:
... }`) — the documented "one-off" path — continues to work exactly as
before; only the `:root`-and-inherit path was ever broken.

## Semantic markup, not div soup

Reach for the element that already means what you're building before
reaching for a `<div>` — a `<div>`/`<span>` (or an ARIA `role`) is the
fallback for when nothing more specific exists, not the default. A
`<div>` that exists only to be a styling hook for layout that a real
element would give you for free is the thing to avoid:

- A group of form fields that share one purpose (e.g. a set of radio
  choices) is a `<fieldset>` with a `<legend>`, not a `<div role="radiogroup"
  aria-label="...">` — same accessible name, but for free, from a real
  element instead of reconstructed with ARIA. Reset a fieldset's own UA
  default border/padding/margin/`min-width` in CSS rather than avoiding
  it for that reason alone (see `xyz-rsvp/style.css`,
  `xyz-feedback/style.css` for the pattern).
- A label and its control don't need a wrapping `<div>` plus `for`/`id`
  to associate — wrap the control directly in the `<label>` instead
  (`<label><span>Name</span><input .../></label>`). This also sidesteps
  a real, if minor, bug the `for`/`id` pattern invites: two instances
  of the same widget on one page duplicate that `id`, silently breaking
  the association for one of them.
- A caption next to something genuinely *referenced from the
  surrounding text and movable without changing its meaning* — an
  illustration, a code sample — is a `<figure>`/`<figcaption>` pair.
  A widget's
  own caption is not this: the widget isn't an aside the page refers
  to, it's the primary content that section exists for, so it's a
  concern the widget owns itself instead (see "Configuration
  manifest" below) — not something a host builds external markup for
  at all, `<figure>` or otherwise.
- A list of things is a `<ul>`/`<li>`, not a `<div>` of `<span>`s that
  merely look like a list.
- Every widget's own rendered output is scoped inside a real
  **sectioning content** element — `<article>`, `<section>`, or
  `<aside>`, chosen per widget for what it actually is, not defaulted
  to one tag universally. All five widgets here are `<article>`: the
  HTML spec's own definition — "a complete, self-contained
  composition... intended to be independently distributable or
  reusable" — lists "a widget" as a canonical example, matching
  exactly what this whole directory already claims these are. Gives
  every widget a real landmark boundary a screen reader can jump to
  directly regardless of where it lands on a host page, and license
  for the widget's own internal markup (captions, `<fieldset>`/
  `<legend>` groups) to exist without reading as presumptuous toward
  whatever page it's embedded in.

None of this is about avoiding `<div>` on principle — a genuine layout
container with no more-specific semantic meaning (a card's bordered
box, a flex row grouping unrelated pieces) is exactly what `<div>` is
for, and forcing a semantic element where the content doesn't actually
fit its meaning is worse than a plain `<div>`. The test is whether a
more specific element already exists for what the markup actually
represents — reach for that first.

## Embedding: put the widget's own stylesheet in `<head>`

Self-containment guarantees the widget itself never looks broken — but
a host page can still cause a visible flash of *unstyled* widget
content (buttons/inputs at browser-default size, no spacing) if it
loads the widget's `style.css` somewhere non-render-blocking, most
commonly a `<link>` placed in `<body>` next to the widget's own
`<script>`. A `<link rel="stylesheet">` only blocks the page from
painting anything, by default, when the parser finds it in `<head>` —
one placed in `<body>` loads without blocking render at all (short of
adding `blocking="render"`), so the page can and will paint the widget
before that stylesheet has arrived.

Put each widget's own `style.css` `<link>` in `<head>`, same as any
other page stylesheet — see any `index.html` here for the pattern. The
widget's `<script>` can go anywhere afterward in `<body>`; nothing
about where the script sits affects this, since the widget's own
`display:block` already comes from its own JS unconditionally (see
"Self-containment" above) — this is purely about avoiding a flash of
the widget's *other* styling (spacing, button/input sizing) on the
host page.

## Configuration manifest

Every widget here exposes its own optional attribute surface two
ways, kept in sync by hand (no build step generates one from the
other) — a table in that widget's own README for a human, and a
`static configFields` property on its class for a program:

```js
class XyzWaitlist extends HTMLElement {
  static configFields = [
    { attribute: 'caption', label: 'Caption', type: 'text', default: '',
      requirement: 'optional', description: '...' },
    // ...
  ]
}
```

Read it the same way you'd use the widget for real — load its script,
then `customElements.get('xyz-waitlist').configFields` — no separate
discovery mechanism, no JSON manifest file. This is what any config UI
could read to build a form for a widget and generate
its embed snippet, and it's also just the authoritative list of what's
configurable, if you'd rather read code than a README table.

Every field carries a `requirement`:

- **`required`** — the widget can't do anything real without it.
  Only `conduit-url` (`type: 'conduit-picker'`, not free text — a
  config UI would wire this from whichever conduit the user picked,
  not a text field next to the cosmetic ones).
- **`optional`** — has a sensible default; every widget works fine
  without it.
- **`conditional`** — optional in that the widget still works without
  it, but wrong or misleading in some real scenario if left out (a
  `condition` string says which one). `subject` on `xyz-reactions`/
  `xyz-feedback` is the clearest example: not needed for a single
  embedding, but effectively required the moment one conduit backs
  more than one, or votes/ratings from different embeddings tally
  together with no way to separate them afterward.

Two attributes are universal across every widget here:

- **`caption`** — the widget renders it and gives its own `<form>` (or
  button group) an `aria-labelledby` pointing at it, so the widget
  owns the "this text labels that control" relationship instead of a
  host reconstructing it externally (a `<figcaption>`, a stray `<p>`,
  whatever occurs to them). Not a real heading by default — a widget
  has no way to know what heading level is correct wherever it lands,
  and guessing risks clobbering the host page's own outline.
- **`heading-level`** — opts a set `caption` into being an accessible
  heading. Implemented as `role="heading" aria-level="{value}"` on the
  caption element, not a literal `<h1>`–`<h6>` tag (`aria-level` also
  overrides a real heading's native level, so the tag itself was never
  the actual problem) — the *level number* is still something only the
  host page can know, since only it knows its own document's outline;
  the widget never infers this by inspecting its own ancestor DOM,
  since that would mean depending on the host page's own structure,
  exactly what "Self-containment" above prohibits. Unset by default,
  same reasoning as `caption` above.

Every string a widget accepts this way gets HTML-escaped before it's
interpolated into that widget's own `innerHTML` — `caption`,
`unconfigured-message`, `success-message`, `button-text`, and so on
are all attribute values a caller sets, and an unescaped `<`/`&`
breaks rendering outright (the browser parses whatever follows as
markup) or, for a value shaped like `<img onerror=...>`, executes as
script. See any widget's own `escapeHtml` helper — a small, per-file
copy (not shared — see "Self-containment" above on why nothing here is
shared across files), applied to every interpolated string that isn't
a fixed literal in that widget's own template.
