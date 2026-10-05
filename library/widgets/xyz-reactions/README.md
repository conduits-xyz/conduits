# Reactions widget

`<xyz-reactions>` shows two buttons, "Helpful" and "Not helpful". It
writes each vote to a conduit and shows the counts.

## Add it to a page

To try it, open `index.html` in a browser. To use it:

```html
<head>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <script src="./xyz-reactions.js"></script>
  <xyz-reactions
    conduit-url="https://gateway.example/XXXXXXXX"
    subject="my-post-slug"
  ></xyz-reactions>
</body>
```

Put the `<link>` in `<head>`. See
[`library/widgets/README.md`](../README.md#add-a-widget-to-a-page).

Without `conduit-url`, the widget shows "Not connected to a conduit
yet." and no buttons.

> **CAUTION:** When one conduit serves two or more pages, give each
> page a different `subject`. Without it, the votes of all pages
> count together, and you cannot separate them later.

## Conduit setup

- Methods: `GET` and `POST`. All votes are public, because `GET` is
  open.
- Columns: `subject`, `reaction`, `votedAt`. If the sheet is empty, the
  first vote creates them. Otherwise, add them to the sheet yourself.

> **CAUTION:** Do not delete the `conduit-id` column after the gateway
> creates it.

## Wire format

A vote:

```json
{ "fields": { "subject": "my-post-slug", "reaction": "up", "votedAt": "2026-10-04T12:00:00.000Z" } }
```

`reaction` is `"up"` or `"down"`. To show the counts, the widget reads
all pages of the conduit with `GET`. It counts the records with its
`subject`.

## One vote for each visitor

The widget keeps the vote in `localStorage`, for each conduit URL and
`subject`. On the next visit, it shows the vote and disables the
buttons. This stops casual repeat votes only. A visitor who clears the
storage or uses a different browser can vote again.

## Attributes

| Attribute | Required | Default | Meaning |
|:--|:--|:--|:--|
| `conduit-url` | Yes | none | The conduit URL. |
| `subject` | When one conduit serves two or more pages | `""` | The thing that people react to, for example a post slug. |
| `caption` | No | none | Text above the buttons. It replaces the accessible name "Was this helpful?". |
| `heading-level` | Only with `caption` | none | Makes the caption a heading of this level. |
| `unconfigured-message` | No | `Not connected to a conduit yet.` | The text without `conduit-url`. |
| `success-message` | No | `Thanks for the feedback.` | The text after a vote. |
| `up-label` | No | `Helpful` | The label of the "up" button. |
| `down-label` | No | `Not helpful` | The label of the "down" button. |
| `initial-up`, `initial-down` | Only if your server renders the page | none | Counts to show before the widget reads the conduit. Most pages do not need them. |
| `demo` | No | off | Shows the widget without a conduit. Sends nothing. |

`customElements.get('xyz-reactions').configFields` gives the same list
for programs.

## Theme

See [`THEME.md`](../THEME.md).
