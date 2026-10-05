# Feedback widget

`<xyz-feedback>` collects a rating and an optional comment, and writes
them to a conduit. The `scale` attribute selects the rating:

- `scale="5"` (default): 1 to 5 stars.
- `scale="10"`: 0 to 10, the NPS question "How likely are you to
  recommend this?".

## Add it to a page

To try it, open `index.html` in a browser. To use it:

```html
<head>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <script src="./xyz-feedback.js"></script>
  <xyz-feedback conduit-url="https://gateway.example/XXXXXXXX" scale="10"></xyz-feedback>
</body>
```

Put the `<link>` in `<head>`. See
[`library/widgets/README.md`](../README.md#add-a-widget-to-a-page).

Without `conduit-url`, the widget shows "Not connected to a conduit
yet." and no form.

> **CAUTION:** When one conduit serves two or more pages, give each
> page a different `subject`. Without it, the ratings of all pages mix,
> and you cannot separate them later.

## Conduit setup

- Methods: `POST`.
- Columns: `subject`, `rating`, `comment`. If the sheet is empty, the
  first submission creates them. Otherwise, add them to the sheet
  yourself.

## Wire format

```json
{ "fields": { "subject": "pricing-page", "rating": 9, "comment": "Clear." } }
```

- `subject` is `""` when you do not set it.
- `rating` is the number that the visitor selected: 1 to 5, or 0 to 10.
  The widget does not calculate an average or an NPS score. To
  calculate them, read the conduit with `GET`.
- `comment` is optional text.

## Attributes

| Attribute | Required | Default | Meaning |
|:--|:--|:--|:--|
| `conduit-url` | Yes | none | The conduit URL. |
| `scale` | No | `5` | `5` or `10`. It changes the meaning of `rating`. |
| `subject` | When one conduit serves two or more pages | `""` | The thing that people rate. |
| `caption` | No | none | Text above the form. It is also the form's accessible name. |
| `heading-level` | Only with `caption` | none | Makes the caption a heading of this level. |
| `unconfigured-message` | No | `Not connected to a conduit yet.` | The text without `conduit-url`. |
| `success-message` | No | `Thanks for the feedback.` | The text after a submission. |
| `button-text` | No | `Submit feedback` | The submit button's label. |
| `demo` | No | off | Shows the widget without a conduit. Sends nothing. |

`customElements.get('xyz-feedback').configFields` gives the same list
for programs.

## Theme

See [`THEME.md`](../THEME.md).
