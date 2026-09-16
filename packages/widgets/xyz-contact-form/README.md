# Contact form widget

A real `<xyz-contact-form>` custom element — a name/email/message
contact form backed by a conduit, for the single most common thing a
site needs a form for. Zero dependencies, no build step, no JavaScript
framework: one script tag, one element.

No CAPTCHA anywhere in this widget, unlike most contact-form guidance
elsewhere, which treats one as an optional bolt-on — conduits.xyz's own
honeypot + pass-if-match spam controls (gateway-level, already on for
every conduit) make that unnecessary here.

Fields are fixed (`name`, `email`, `message`), not configurable — if
you need a different field set, see `examples/basic-ajax-form`'s
progressive-enhancement-over-a-plain-form pattern instead.

## Running it

Open `index.html` directly in a browser, or copy `xyz-contact-form.js`
into your own page:

```html
<head>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <script src="./xyz-contact-form.js"></script>
  <xyz-contact-form conduit-url="https://conduits.xyz/api/XXXXXXXX"></xyz-contact-form>
</body>
```

The stylesheet link belongs in `<head>`, not next to the script — see
[`packages/widgets/README.md`](../README.md#embedding-put-the-widgets-own-stylesheet-in-head)
for why.

With no `conduit-url` at all (a real embed that forgot to set it, or this
file's own demo page before you've entered one — see its own "Conduit
URL" field), the element renders "Not connected to a conduit yet."
instead of a form that could only ever fail.

## Wire format

A message is `POST {fields: {name, email, message}}` — the same
envelope every conduit accepts (see `docs/gateway-api.md`). Point
`conduit-url` at a sheet with `name`, `email`, and `message`
columns — add them directly to the sheet if it's still blank.

## Configuration

Every optional attribute below is also machine-readable — load this
file and inspect `customElements.get('xyz-contact-form').configFields`
for the same list with types, defaults, and requirement info attached
(`required` / `optional` / `conditional`).

| Attribute | Default | Notes |
|---|---|---|
| `caption` | *(none)* | Shown above the form; also becomes the form's accessible name. |
| `heading-level` | *(none)* | Only used when `caption` is set. |
| `unconfigured-message` | `Not connected to a conduit yet.` | Shown before `conduit-url` is set. |
| `success-message` | `Thanks — we'll get back to you.` | Shown after a successful send. |
| `button-text` | `Send message` | The submit button's own label. |

## Theming

Styled entirely through CSS custom properties on `xyz-contact-form`
(`style.css`) — the same `--xyz-*` vocabulary every widget and form in
this repo shares (`examples/basic-form`, `examples/basic-ajax-form`,
`packages/widgets/xyz-waitlist`, `packages/widgets/xyz-reactions`). Set them once, on
`:root` or any ancestor common to everything you embed, and your whole
brand applies at once — or override on the element itself for a
one-off:

```css
xyz-contact-form {
  --xyz-accent: #2563eb;
  --xyz-radius: 12px;
  --xyz-font: 'Inter', sans-serif;
}
```

See `style.css` for the full list of available properties.
