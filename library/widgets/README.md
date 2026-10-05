# Widgets

These widgets are ready to copy to a site without changes. They are
HTML, CSS, and JavaScript, with no framework, no build step, and no
dependencies. For code to read and change, see
[`library/pages/`](../pages/README.md).

`https://conduits.xyz` also serves this directory under `/library/`,
for example `https://conduits.xyz/library/widgets/xyz-waitlist/`.

| Widget | Collects |
|:--|:--|
| [`xyz-waitlist`](xyz-waitlist/README.md) | A first name and an email address. |
| [`xyz-reactions`](xyz-reactions/README.md) | A thumbs up or a thumbs down. |
| [`xyz-contact-form`](xyz-contact-form/README.md) | A name, an email address, and a message, with optional lead fields. |
| [`xyz-feedback`](xyz-feedback/README.md) | A rating (5 stars or a 10-point NPS) and an optional comment. |
| [`xyz-rsvp`](xyz-rsvp/README.md) | Yes, no, or maybe, with a guest count after "yes". |

Each widget's README lists its attributes.

## Add a widget to a page

1. Copy the widget's directory next to your page.
2. Put the widget's stylesheet in `<head>`:

   ```html
   <link rel="stylesheet" href="xyz-waitlist/style.css">
   ```

3. Put the script and the element in `<body>`:

   ```html
   <script src="xyz-waitlist/xyz-waitlist.js"></script>
   <xyz-waitlist conduit-url="https://gateway.example/XXXXXXXX"></xyz-waitlist>
   ```

> **CAUTION:** Do not put the `<link>` in `<body>`. A stylesheet in
> `<body>` does not block the first paint, so the widget shows without
> its styles for a moment.

## Theme

All widgets, and `library/pages/progressive-enhancement-form`, use the
same `--xyz-*` CSS custom properties (font, colors, radius, spacing).
Set them one time on `:root` to style all widgets on the page. To style
one widget only, set them on that widget's tag. See
[`THEME.md`](THEME.md).

## Demo mode

Each widget has a `demo.html` page and accepts a boolean `demo`
attribute. In demo mode, the widget shows its full interface, but it
sends no requests and keeps no visitor state. The catalog links to
each widget's demo.

## Configuration manifest

Each widget lists its attributes in two places: a table in its README,
and `static configFields` on its class. We keep the two the same by
hand.

```js
class XyzWaitlist extends HTMLElement {
  static configFields = [
    { attribute: 'caption', label: 'Caption', type: 'text', default: '',
      requirement: 'optional', description: '...' },
    // ...
  ]
}
```

To read it, load the script, then read
`customElements.get('xyz-waitlist').configFields`. A tool can use it to
make a form and an embed snippet.

Each field has a `requirement`:

| `requirement` | Meaning |
|:--|:--|
| `required` | The widget does nothing without it. Only `conduit-url` (`type: 'conduit-picker'`). |
| `optional` | It has a default. The widget works without it. |
| `conditional` | The widget works without it, but gives wrong results in one case. `condition` says which case. |

Example of `conditional`: `subject` on `xyz-reactions` and
`xyz-feedback`. When one conduit serves two or more embeds, set a
different `subject` on each. Otherwise their votes or ratings mix, and
you cannot separate them later.

All widgets have these two attributes:

- **`caption`**: text that the widget shows and uses as the label of its
  form (`aria-labelledby`). It is not a heading.
- **`heading-level`**: makes the caption a heading of this level
  (`role="heading" aria-level="<value>"`). Only the page knows the
  correct level, so set it yourself. It has no default.

## Rules for widget authors

A widget must not depend on the page, and must not change the page.
Each widget obeys these rules before it ships.

### Layout

- Set the widget's own `display` from its JavaScript, in
  `connectedCallback()`, as the first statement:
  `this.style.display ||= 'block'`. An unknown element is `inline` by
  default. Without this line, the widget moves when its stylesheet
  loads.
- Put a `box-sizing` reset on the widget's tag:
  `xyz-<name> *, xyz-<name> *::before, xyz-<name> *::after { box-sizing: inherit }`,
  with `box-sizing: border-box` on the root.

### Scope

- Put each CSS selector under the widget's `.xyz-<name>-*` prefix or
  its tag. Never style a bare `button`, `input`, or `p`.
- Do not add listeners to `window` or `document`. Do not write to
  `:root` or to a custom property outside the widget's tag. A widget
  can read `--xyz-*` values. It must not set them.
- Wrap the full file in `;(function () { ... })()`. Widgets are classic
  scripts (for `file://` and no build step), and classic scripts on a
  page share one scope. Two widgets with the same top-level name cause
  a `SyntaxError`, and the second widget does not load.

### Theme defaults

Put each default in the `var()` fallback where you use the property:

```css
font-family: var(--xyz-font, system-ui, sans-serif);
```

Do not declare the default on the widget's tag
(`xyz-waitlist { --xyz-font: system-ui; }`). A value on the element
always wins over an inherited value, so it stops a `:root` theme. A
value that the page sets on the widget's tag still works.

### Markup

Use the element that has the correct meaning. Use `<div>` or `<span>`
only when no other element fits.

- A group of related fields: `<fieldset>` with `<legend>`. Reset its
  border, padding, margin, and `min-width` in CSS (see
  `xyz-rsvp/style.css`).
- A label: wrap the control in `<label>`. Do not use `for` and `id`.
  Two widgets on one page would have the same `id`.
- A list: `<ul>` and `<li>`.
- The root: a sectioning element. All five widgets use `<article>`,
  because the HTML specification names "a widget" as an example of an
  article. It gives screen readers a landmark.
- Do not use `<figure>` for the caption. The widget is the content of
  its section, not an illustration.

### Escaping

Escape each attribute value before you put it in `innerHTML`, for
example `caption`, `success-message`, and `button-text`. An unescaped
value can break the markup or run a script
(`<img onerror=...>`). Each widget has its own small `escapeHtml`
function. Widgets do not share code.
