# Feedback widget

A real `<xyz-feedback>` custom element — a scored-rating feedback form
backed by a conduit, plus an optional comment. Zero dependencies, no
build step, no JavaScript framework: one script tag, one element.

Two scales, one widget — set with the `scale` attribute:

- `scale="5"` (default) — a 1-to-5 star rating.
- `scale="10"` — an NPS-style 0-to-10 scale ("how likely are you to
  recommend this?" framing).

```html
<head>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <script src="./xyz-feedback.js"></script>
  <xyz-feedback conduit-url="https://conduits.xyz/XXXXXXXX" scale="10"></xyz-feedback>
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

A submission is `POST {fields: {subject, rating, comment}}` — the same
envelope every conduit accepts (see `docs/gateway-api.md`). Point
`conduit-url` at a sheet with `subject`, `rating`, and `comment`
columns — add them directly to the sheet if it's still blank.

- `subject` is optional — set it to let one conduit collect feedback
  for several different things at once (e.g. one feedback conduit
  shared across several pages, distinguished by `subject`), the same
  pattern `<xyz-reactions>` uses. Omit it for a single-subject site;
  every submission then shares one `subject` value (empty string).
- `rating` is the raw number chosen (`1`-`5`, or `0`-`10` for the NPS
  scale) — this widget never computes an NPS score, an average, or any
  other aggregate client-side. Read the conduit back via `GET` and
  compute whatever you need from the raw ratings; this project doesn't
  hold a second copy of your data anywhere.
- `comment` is always optional free text.

## Configuration

Every optional attribute below is also machine-readable — load this
file and inspect `customElements.get('xyz-feedback').configFields` for
the same list with types, defaults, and requirement info attached
(`required` / `optional` / `conditional`).

| Attribute | Default | Notes |
|---|---|---|
| `scale` | `5` | `5` or `10` — see above. Behavioral, not cosmetic: changes what `rating` means on the wire. |
| `subject` | *(none)* | See "Wire format" above. |
| `caption` | *(none)* | Shown above the form; also becomes the form's accessible name. |
| `heading-level` | *(none)* | Only used when `caption` is set. |
| `unconfigured-message` | `Not connected to a conduit yet.` | Shown before `conduit-url` is set. |
| `success-message` | `Thanks for the feedback.` | Shown after a successful submission. |
| `button-text` | `Submit feedback` | The submit button's own label. |

## Theming

See [THEME.md](../THEME.md) for the shared `--xyz-*` property reference,
defaults, and examples for theming all widgets together or overriding
`xyz-feedback` on its own.
