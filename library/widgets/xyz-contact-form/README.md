# Contact form widget

A real `<xyz-contact-form>` custom element backed by a conduit. The
default form collects name, email, and message; the built-in
`qualified-lead` preset adds service and budget questions. Zero
dependencies, no build step, no JavaScript framework: one script tag, one
element.

No CAPTCHA anywhere in this widget, unlike most contact-form guidance
elsewhere, which treats one as an optional bolt-on — conduits.xyz's own
honeypot + pass-if-match spam controls (gateway-level, already on for
every conduit) make that unnecessary here.

The default fields are fixed (`name`, `email`, `message`). Use
`preset="qualified-lead"` for the built-in lead qualification fields;
for a different field set, see `library/examples/basic-ajax-form`'s
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
  <xyz-contact-form
    conduit-url="https://conduits.xyz/XXXXXXXX"
    preset="qualified-lead"
  ></xyz-contact-form>
</body>
```

The stylesheet link belongs in `<head>`, not next to the script — see
[`library/widgets/README.md`](../README.md#embedding-put-the-widgets-own-stylesheet-in-head)
for why.

With no `conduit-url` at all (a real embed that forgot to set it, or this
file's own demo page before you've entered one — see its own "Conduit
URL" field), the element renders "Not connected to a conduit yet."
instead of a form that could only ever fail.

## Wire format

A default message is `POST {fields: {name, email, message}}`. The
`qualified-lead` preset adds `services` and `budget`; selected services
are sent as a semicolon-separated string so the payload remains friendly
to spreadsheet columns:

```json
{
  "fields": {
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "message": "I would like to talk.",
    "services": "research-development; rent-cto",
    "budget": "25000-50000"
  }
}
```

Point `conduit-url` at a sheet with the fields used by the selected
preset. Add `name`, `email`, `message`, `services`, and `budget` directly
to the sheet if it is still blank.

## Configuration

Every optional attribute below is also machine-readable — load this
file and inspect `customElements.get('xyz-contact-form').configFields`
for the same list with types, defaults, and requirement info attached
(`required` / `optional` / `conditional`).

| Attribute | Default | Notes |
|---|---|---|
| `caption` | *(none)* | Shown above the form; also becomes the form's accessible name. |
| `heading-level` | *(none)* | Only used when `caption` is set. |
| `preset` | *(none)* | `qualified-lead` adds required service checkboxes and a required budget choice. |
| `unconfigured-message` | `Not connected to a conduit yet.` | Shown before `conduit-url` is set. |
| `success-message` | `Thanks — we'll get back to you.` | Shown after a successful send. |
| `button-text` | `Send message` | The submit button's own label. |

## Theming

See [THEME.md](../THEME.md) for the shared `--xyz-*` property reference,
defaults, and examples for theming all widgets together or overriding
`xyz-contact-form` on its own.
