# Basic form widget

A plain HTML form embed for a conduit — no JavaScript required. Works
with JS disabled: a native `<form method="post">` submits directly to
the conduit's URL.

## Running it

Open `index.html` directly in a browser, or copy it into your own page
and point the form's `action` at your conduit's URL.

This repo's own copy of the file never sets `action` statically (see
`examples/widget-gallery`, which wires it up dynamically instead) — in
that state, its Submit button is disabled and it shows "Not connected
to a conduit yet.", rather than silently submitting to its own page's
URL once you click it. A real embed with `action` already in its HTML
never sees this — the check only applies when `action` was never set
in the first place.

## Wire format

The gateway accepts `application/x-www-form-urlencoded` directly — a
bare field name like `name` is treated as that field, no `fields`
envelope required. Its JSON API always wraps a record as
`{fields: {...}}`, but a plain form never needs to know that.

By default, a plain form submission lands the visitor on the gateway's
own raw JSON response — fine for testing, not what you want in
production. Add a hidden `_redirect` field naming a path on your own
site (relative or absolute) and a successful submission sends the
visitor there instead, as a real 303 redirect:

```html
<input type="hidden" name="_redirect" value="/thanks" />
```

The target must resolve to the same origin as the page the form was
submitted from (checked against the request's `Referer` header) — this
is what stops `_redirect` from being usable as an open redirect through
a conduit URL that's otherwise public. Point it anywhere else, or omit
the `Referer` header entirely (as a `file://` page does, which is why
this repo's own copy of the demo doesn't include the field), and the
submission silently falls back to the plain JSON response instead of
guessing.

## Theming

Styled entirely through CSS custom properties on the `.xyz-form`
element (`style.css`) — the same `--xyz-*` vocabulary
`packages/widgets/xyz-waitlist` and `packages/widgets/xyz-reactions` share. Set them
once, on `:root` or any ancestor common to everything you embed, and
your whole brand applies across every form and widget at once — or
override on the element itself for a one-off:

```css
.xyz-form {
  --xyz-accent: #2563eb;
  --xyz-radius: 12px;
  --xyz-font: 'Inter', sans-serif;
}
```

See `style.css` for the full list of available properties.
