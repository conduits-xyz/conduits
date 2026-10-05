# RSVP widget

`<xyz-rsvp>` collects an answer to an invitation: a name, an email
address, and "yes", "no", or "maybe". After "yes", it also asks for the
number of guests. It writes the answer to a conduit.

To collect interest in something that has no date yet, use
[`xyz-waitlist`](../xyz-waitlist/README.md).

## Add it to a page

To try it, open `index.html` in a browser. To use it:

```html
<head>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <script src="./xyz-rsvp.js"></script>
  <xyz-rsvp conduit-url="https://gateway.example/XXXXXXXX"></xyz-rsvp>
</body>
```

Put the `<link>` in `<head>`. See
[`library/widgets/README.md`](../README.md#add-a-widget-to-a-page).

Without `conduit-url`, the widget shows "Not connected to a conduit
yet." and no form.

## Conduit setup

- Methods: `POST`.
- Columns: `name`, `email`, `attending`, `guestCount`. If the sheet is
  empty, the first answer creates them. Otherwise, add them to the
  sheet yourself.

## Wire format

```json
{ "fields": { "name": "Ada", "email": "ada@example.com", "attending": "yes", "guestCount": 2 } }
```

- `attending` is `"yes"`, `"no"`, or `"maybe"`.
- `guestCount` is `null` when `attending` is not `"yes"`, or when the
  visitor leaves it empty.

## Attributes

| Attribute | Required | Default | Meaning |
|:--|:--|:--|:--|
| `conduit-url` | Yes | none | The conduit URL. |
| `caption` | No | none | Text above the form. It is also the form's accessible name. |
| `heading-level` | Only with `caption` | none | Makes the caption a heading of this level. |
| `unconfigured-message` | No | `Not connected to a conduit yet.` | The text without `conduit-url`. |
| `success-message` | No | `Thanks — your RSVP is in.` | The text after an answer. |
| `button-text` | No | `Send RSVP` | The submit button's label. |
| `demo` | No | off | Shows the widget without a conduit. Sends nothing. |

`customElements.get('xyz-rsvp').configFields` gives the same list for
programs.

## Theme

See [`THEME.md`](../THEME.md).
