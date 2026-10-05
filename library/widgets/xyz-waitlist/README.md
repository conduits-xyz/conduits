# Waitlist widget

`<xyz-waitlist>` collects a first name and an email address, and
writes them to a conduit.

## Add it to a page

To try it, open `index.html` in a browser. To use it:

```html
<head>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <script src="./xyz-waitlist.js"></script>
  <xyz-waitlist conduit-url="https://gateway.example/XXXXXXXX"></xyz-waitlist>
</body>
```

Put the `<link>` in `<head>`. See
[`library/widgets/README.md`](../README.md#add-a-widget-to-a-page).

Without `conduit-url`, the widget shows "Not connected to a conduit
yet." and no form.

## Conduit setup

- Methods: `POST`.
- Columns: `firstName`, `email`. If the sheet is empty, the first
  signup creates them. Otherwise, add them to the sheet yourself.

## Wire format

```json
{ "fields": { "firstName": "Ada", "email": "ada@example.com" } }
```

The widget does not show a count of signups. To show one, read the
conduit with `GET` on your own page and follow `nextCursor` to the last
page (see the
[developer guide](../../../docs/developer-guide.md#read-all-records)).
For this, the conduit must also allow `GET`.

## Attributes

| Attribute | Required | Default | Meaning |
|:--|:--|:--|:--|
| `conduit-url` | Yes | none | The conduit URL. |
| `caption` | No | none | Text above the form. It is also the form's accessible name. |
| `heading-level` | Only with `caption` | none | Makes the caption a heading of this level. Use your page's outline. |
| `unconfigured-message` | No | `Not connected to a conduit yet.` | The text without `conduit-url`. |
| `success-message` | No | `You're on the list — we'll be in touch.` | The text after a signup. |
| `button-text` | No | `Join the waitlist` | The submit button's label. |
| `demo` | No | off | Shows the widget without a conduit. Sends nothing. |

`customElements.get('xyz-waitlist').configFields` gives the same list
for programs.

## Theme

See [`THEME.md`](../THEME.md).
