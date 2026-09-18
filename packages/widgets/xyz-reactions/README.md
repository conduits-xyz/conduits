# Reactions widget

A real `<xyz-reactions>` custom element — a thumbs-up/thumbs-down
widget backed by a conduit, for a blogger (or anyone) who wants
somewhere real to store the counts. Zero dependencies, no build step,
no JavaScript framework: one script tag, one element.

## Running it

Open `index.html` directly in a browser, or copy `xyz-reactions.js`
into your own page:

```html
<head>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <script src="./xyz-reactions.js"></script>
  <xyz-reactions
    conduit-url="https://conduits.xyz/XXXXXXXX"
    subject="my-post-slug"
  ></xyz-reactions>
</body>
```

The stylesheet link belongs in `<head>`, not next to the script — see
[`packages/widgets/README.md`](../README.md#embedding-put-the-widgets-own-stylesheet-in-head)
for why.

- `conduit-url` (required) — the conduit's own POST/GET target.
- `subject` (optional) — identifies what's being reacted to, so one
  conduit can back reactions for many different pages/posts at once. A
  single-post site can omit it; every vote then shares one tally.
- `initial-up` / `initial-down` (optional) — server-rendered starting
  counts for this `subject`, so the widget doesn't flash `0`/`0` before
  its own fetch resolves. Leave both off and the widget fetches real
  counts itself on load — the common case for a static page with no
  server rendering at all.

With no `conduit-url` at all (forgotten on a real embed, or this file's
own demo page before you've entered one), the element renders "Not
connected to a conduit yet." instead of buttons that could only ever
fail.

## Wire format

A vote is `POST {fields: {subject, reaction, votedAt}}` — `reaction` is
`"up"` or `"down"`, and the same envelope every conduit accepts (see
`docs/gateway-api.md`). Point `conduit-url` at a Google Sheet with
`subject`, `reaction`, and `votedAt` columns and a conduit that allows
both `GET` and `POST`. A completely empty sheet is supported: the first
vote creates those columns and the gateway's reserved `conduit-id`
column. If the sheet already has any field columns, add the three widget
columns directly to the sheet first; the gateway does not silently add
missing fields to an established sheet. Keep `conduit-id` once the
gateway has created it. Counts are computed from `GET conduit-url` by
tallying records whose `subject` matches, so use a different `subject`
for each page or post when sharing one conduit; otherwise all votes are
counted together.

## Configuration

Every optional attribute below is also machine-readable — load this
file and inspect `customElements.get('xyz-reactions').configFields`
for the same list with types, defaults, and requirement info attached
(`required` / `optional` / `conditional`).

| Attribute | Default | Notes |
|---|---|---|
| `caption` | *(none)* | Shown above the buttons; also becomes their accessible name (replaces the built-in "Was this helpful?" `aria-label`). |
| `heading-level` | *(none)* | Only used when `caption` is set — same as `xyz-waitlist`'s own. |
| `unconfigured-message` | `Not connected to a conduit yet.` | Shown before `conduit-url` is set. |
| `success-message` | `Thanks for the feedback.` | Shown after a vote is recorded. |
| `up-label` | `Helpful` | The "up" button's own label — this widget is meant for any kind of content, not just blog posts, so the default framing won't always fit (e.g. a recipe might want "Delicious"/"Not for me"). |
| `down-label` | `Not helpful` | The "down" button's own label. |

## Voting once per visitor

The widget remembers a vote in `localStorage` (keyed on the conduit URL
and `subject`) and renders as "already voted" — disabled, the chosen
option highlighted — on the next load. This is a deterrent against
casual re-voting, not a security boundary: clearing storage or
switching browsers resets it, the same honesty this project already
applies to its hidden-form-field honeypot.

## Theming

See [THEME.md](../THEME.md) for the shared `--xyz-*` property reference,
defaults, and examples for theming all widgets together or overriding
`xyz-reactions` on its own.
