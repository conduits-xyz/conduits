# Waitlist widget

A real `<xyz-waitlist>` custom element — a first-name-and-email
capture form backed by a conduit, for a marketer who needs a
rate-limited, spam-filtered interest-list endpoint live in minutes.
Zero dependencies, no build step, no JavaScript framework: one script
tag, one element.

This is the widget as shipped and battle-tested in production — not a
simplified look-alike built separately for this README.

## Running it

Open `index.html` directly in a browser, or copy `xyz-waitlist.js`
into your own page:

```html
<head>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <script src="./xyz-waitlist.js"></script>
  <xyz-waitlist conduit-url="https://conduits.xyz/api/XXXXXXXX"></xyz-waitlist>
</body>
```

The stylesheet link belongs in `<head>`, not next to the script — see
[`packages/widgets/README.md`](../README.md#embedding-put-the-widgets-own-stylesheet-in-head)
for why. The element itself never depends on it (its layout comes from
its own JS either way), but a `<head>` placement is what keeps your
page from painting it unstyled for a moment first.

With no `conduit-url` at all (a real embed that forgot to set it, or this
file's own demo page before you've entered one — see its own "Conduit
URL" field), the element renders "Not connected to a conduit yet."
instead of a form that could only ever fail.

## Wire format

A signup is `POST {fields: {firstName, email}}` — the same envelope
every conduit accepts (see `docs/gateway-api.md`). Point `conduit-url`
at a sheet with `firstName` and `email` columns — add them directly to
the sheet if it's still blank. The element
only ever handles the form itself; a running signup count (if you want
one shown next to it — e.g. a "join N others" line next to the widget)
is a plain `GET conduit-url` your own page renders however it likes,
outside the element.

## Configuration

Every optional attribute below is also machine-readable — load this
file and inspect `customElements.get('xyz-waitlist').configFields` for
the same list with types, defaults, and requirement info attached
(`required` / `optional` / `conditional`), meant for a config-form
generator, not just this table.

| Attribute | Default | Notes |
|---|---|---|
| `caption` | *(none)* | Shown above the form; also becomes the form's accessible name (`aria-labelledby`). |
| `heading-level` | *(none)* | Only used when `caption` is set — renders it as an accessible heading of this level instead of plain labeled text. Set this to match your own page's outline; the widget can't know it on its own. |
| `unconfigured-message` | `Not connected to a conduit yet.` | Shown instead of the form before `conduit-url` is set. |
| `success-message` | `You're on the list — we'll be in touch.` | Shown after a successful signup. |
| `button-text` | `Join the waitlist` | The submit button's own label. |

## Theming

Styled entirely through CSS custom properties on `xyz-waitlist`
(`style.css`) — the same `--xyz-*` vocabulary every widget and form in
this repo shares (`examples/basic-form`, `examples/basic-ajax-form`,
`packages/widgets/xyz-reactions`). Set them once, on `:root` or any ancestor
common to everything you embed, and your whole brand applies at once —
or override on the element itself for a one-off:

```css
xyz-waitlist {
  --xyz-accent: #2563eb;
  --xyz-radius: 12px;
  --xyz-font: 'Inter', sans-serif;
}
```

See `style.css` for the full list of available properties.
