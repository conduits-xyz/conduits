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
    conduit-url="https://conduits.xyz/api/XXXXXXXX"
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

## Wire format

A vote is `POST {fields: {subject, reaction, votedAt}}` — `reaction` is
`"up"` or `"down"`. Counts are computed by fetching `GET conduit-url`
and tallying records whose `subject` matches, client-side — the same
"read through the same public API every caller uses" approach
`xyz-waitlist` already takes for its own signup count. A very
high-traffic post would eventually want real server-side aggregation;
this widget deliberately doesn't invent one.

## Voting once per visitor

The widget remembers a vote in `localStorage` (keyed on the conduit URL
and `subject`) and renders as "already voted" — disabled, the chosen
option highlighted — on the next load. This is a deterrent against
casual re-voting, not a security boundary: clearing storage or
switching browsers resets it, the same honesty this project already
applies to its hidden-form-field honeypot.

## Theming

Styled entirely through CSS custom properties on `xyz-reactions`
(`style.css`) — the same `--xyz-*` vocabulary every widget and form in
this repo shares (`examples/basic-form`, `examples/basic-ajax-form`,
`packages/widgets/xyz-waitlist`). Set them once, on `:root` or any ancestor
common to everything you embed, and your whole brand applies at once —
or override on the element itself for a one-off:

```css
xyz-reactions {
  --xyz-accent: #2563eb;
  --xyz-radius: 12px;
  --xyz-font: 'Inter', sans-serif;
}
```

See `style.css` for the full list of available properties.
