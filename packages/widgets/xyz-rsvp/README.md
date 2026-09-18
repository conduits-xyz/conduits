# RSVP widget

A real `<xyz-rsvp>` custom element — a name/email/attending response
form backed by a conduit, for an already-scheduled event. Zero
dependencies, no build step, no JavaScript framework: one script tag,
one element.

A tri-state response, not a linear form: `attending` is one of
`"yes"`, `"no"`, or `"maybe"` — and the guest-count field only appears
once someone has actually said yes. Genuinely different from
`<xyz-waitlist>` ("notify me later," no event to respond to) rather
than a relabeled variant of it.

## Running it

Open `index.html` directly in a browser, or copy `xyz-rsvp.js` into
your own page:

```html
<head>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <script src="./xyz-rsvp.js"></script>
  <xyz-rsvp conduit-url="https://conduits.xyz/XXXXXXXX"></xyz-rsvp>
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

A response is `POST {fields: {name, email, attending, guestCount}}` —
the same envelope every conduit accepts (see `docs/gateway-api.md`).
Point `conduit-url` at a sheet with `name`, `email`, `attending`, and
`guestCount` columns — add them directly to the sheet if it's still
blank. `guestCount` is submitted as `null`
whenever `attending` isn't `"yes"`, or when the field was left blank.

## Configuration

Every optional attribute below is also machine-readable — load this
file and inspect `customElements.get('xyz-rsvp').configFields` for the
same list with types, defaults, and requirement info attached
(`required` / `optional` / `conditional`).

| Attribute | Default | Notes |
|---|---|---|
| `caption` | *(none)* | Shown above the form; also becomes the form's accessible name. |
| `heading-level` | *(none)* | Only used when `caption` is set. |
| `unconfigured-message` | `Not connected to a conduit yet.` | Shown before `conduit-url` is set. |
| `success-message` | `Thanks — your RSVP is in.` | Shown after a successful submission. |
| `button-text` | `Send RSVP` | The submit button's own label. |

## Theming

See [THEME.md](../THEME.md) for the shared `--xyz-*` property reference,
defaults, and examples for theming all widgets together or overriding
`xyz-rsvp` on its own.
