# Contact form widget

`<xyz-contact-form>` collects a name, an email address, and a message,
and writes them to a conduit. The `qualified-lead` preset adds
questions about services and budget.

The fields are fixed. For other fields, use the pattern in
`library/pages/progressive-enhancement-form`.

## Add it to a page

To try it, open `index.html` in a browser. To use it:

```html
<head>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <script src="./xyz-contact-form.js"></script>
  <xyz-contact-form
    conduit-url="https://gateway.example/XXXXXXXX"
    preset="qualified-lead"
  ></xyz-contact-form>
</body>
```

Put the `<link>` in `<head>`. See
[`library/widgets/README.md`](../README.md#add-a-widget-to-a-page).

Without `conduit-url`, the widget shows "Not connected to a conduit
yet." and no form.

## Conduit setup

- Methods: `POST`. To keep messages private, do not allow `GET`, or
  require a bearer token for it.
- Columns: `name`, `email`, `message`. With `qualified-lead`, also
  `services` and `budget`. If the sheet is empty, the first message
  creates them. Otherwise, add them to the sheet yourself.
- Keep the conduit's throttle on.

The widget has no CAPTCHA and no honeypot field.

## Wire format

Default:

```json
{ "fields": { "name": "Ada Lovelace", "email": "ada@example.com", "message": "I would like to talk." } }
```

With `qualified-lead`, the body also has `services` and `budget`. The
selected services are one string, separated by `; `, so they fit in one
cell:

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

## Attributes

| Attribute | Required | Default | Meaning |
|:--|:--|:--|:--|
| `conduit-url` | Yes | none | The conduit URL. |
| `preset` | No | none | `qualified-lead` adds required service checkboxes and a required budget choice. |
| `caption` | No | none | Text above the form. It is also the form's accessible name. |
| `heading-level` | Only with `caption` | none | Makes the caption a heading of this level. |
| `unconfigured-message` | No | `Not connected to a conduit yet.` | The text without `conduit-url`. |
| `success-message` | No | `Thanks — we'll get back to you.` | The text after a message is sent. |
| `button-text` | No | `Send message` | The submit button's label. |
| `demo` | No | off | Shows the widget without a conduit. Sends nothing. |

`customElements.get('xyz-contact-form').configFields` gives the same
list for programs.

## Theme

See [`THEME.md`](../THEME.md).
